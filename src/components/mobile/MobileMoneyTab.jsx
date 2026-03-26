import { useState, useRef, useEffect, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  FileText, Receipt, Plus, CheckCircle,
  Camera, X, Send, Zap, TrendingUp, TrendingDown,
  AlertTriangle, Fuel, Target, Activity, Truck
} from 'lucide-react'
import { Ic, haptic, fmt$, QInsightCard } from './shared'
import { apiFetch } from '../../lib/api'

const EXPENSE_CATEGORIES = ['Fuel', 'Tolls', 'Repairs', 'Insurance', 'Meals', 'Parking', 'Permits', 'Tires', 'DEF', 'Lumper', 'Scale', 'Other']
const MARGIN_TARGET = 18

function isToday(d) {
  if (!d) return false
  const t = new Date(), dd = new Date(d)
  return t.getFullYear() === dd.getFullYear() && t.getMonth() === dd.getMonth() && t.getDate() === dd.getDate()
}
function isThisWeek(d) {
  if (!d) return false
  const now = new Date(), dd = new Date(d)
  const start = new Date(now); start.setDate(now.getDate() - now.getDay())
  start.setHours(0, 0, 0, 0)
  return dd >= start && dd <= now
}

export default function MobileMoneyTab({ initialSubTab }) {
  const ctx = useCarrier() || {}
  const { showToast } = useApp()
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const drivers = ctx.drivers || []
  const vehicles = ctx.vehicles || []
  const addExpense = ctx.addExpense || (() => {})
  const updateInvoiceStatus = ctx.updateInvoiceStatus || (() => {})
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const fuelCostPerMile = ctx.fuelCostPerMile || 0

  const [subTab, setSubTab] = useState(initialSubTab || 'overview')
  useEffect(() => {
    if (initialSubTab === 'expenses') setSubTab('expenses')
    else if (initialSubTab === 'invoices') setSubTab('invoices')
  }, [initialSubTab])
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [newExp, setNewExp] = useState({ amount: '', cat: 'Fuel', notes: '', date: new Date().toISOString().split('T')[0], gallons: '', pricePerGal: '', state: '' })
  const [scanning, setScanning] = useState(false)
  const receiptRef = useRef(null)
  const [factorModal, setFactorModal] = useState(null)
  const [expandedAlert, setExpandedAlert] = useState(null)

  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  const marginReached = margin >= MARGIN_TARGET

  // ── Q Financial Intelligence computations ──
  const qFinance = useMemo(() => {
    // Fuel totals
    const fuelExpenses = expenses.filter(e => (e.category || e.cat || '').toLowerCase() === 'fuel')
    const totalFuel = fuelExpenses.reduce((s, e) => s + (e.amount || 0), 0)
    const totalGallons = fuelExpenses.reduce((s, e) => s + (parseFloat(e.gallons) || 0), 0)
    const fuelPctOfExpenses = totalExpenses > 0 ? (totalFuel / totalExpenses * 100) : 0

    // Today/this week profit
    const todayLoads = loads.filter(l => isToday(l.delivery_date) || isToday(l.created_at))
    const weekLoads = loads.filter(l => isThisWeek(l.delivery_date) || isThisWeek(l.created_at))
    const todayRevenue = todayLoads.reduce((s, l) => s + (l.gross || l.rate || 0), 0)
    const todayExpenses = expenses.filter(e => isToday(e.date)).reduce((s, e) => s + (e.amount || 0), 0)
    const weekRevenue = weekLoads.reduce((s, l) => s + (l.gross || l.rate || 0), 0)
    const weekExpenses = expenses.filter(e => isThisWeek(e.date)).reduce((s, e) => s + (e.amount || 0), 0)
    const profitToday = todayRevenue - todayExpenses
    const profitWeek = weekRevenue - weekExpenses

    // Profit per load
    const deliveredLoads = loads.filter(l => {
      const s = (l.status || '').toLowerCase()
      return s.includes('delivered') || s.includes('invoiced') || s.includes('paid')
    })
    const avgProfitPerLoad = deliveredLoads.length > 0
      ? deliveredLoads.reduce((s, l) => {
          const rev = l.gross || l.rate || 0
          const miles = l.miles || 0
          const fuelCost = miles * fuelCostPerMile
          const driverPay = l.driver_pay || (rev * 0.28)
          return s + (rev - fuelCost - driverPay)
        }, 0) / deliveredLoads.length
      : 0

    // Profit per truck (group by vehicle or driver)
    const truckMap = {}
    deliveredLoads.forEach(l => {
      const truck = l.vehicle_id || l.truck || l.driver_name || l.driver || 'Unassigned'
      if (!truckMap[truck]) truckMap[truck] = { revenue: 0, loads: 0, miles: 0 }
      truckMap[truck].revenue += (l.gross || l.rate || 0)
      truckMap[truck].loads += 1
      truckMap[truck].miles += (l.miles || 0)
    })
    const truckStats = Object.entries(truckMap).map(([name, data]) => {
      const fuelCost = data.miles * fuelCostPerMile
      const estDriverPay = data.revenue * 0.28
      const profit = data.revenue - fuelCost - estDriverPay
      return { name, ...data, profit, profitPerLoad: data.loads > 0 ? profit / data.loads : 0 }
    }).sort((a, b) => b.profit - a.profit)

    // Cash flow
    const paidInvoices = invoices.filter(i => (i.status || '').toLowerCase() === 'paid')
    const pendingInvoices = invoices.filter(i => {
      const s = (i.status || '').toLowerCase()
      return s !== 'paid' && s !== 'factored'
    })
    const paidTotal = paidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
    const pendingTotal = pendingInvoices.reduce((s, i) => s + (i.amount || 0), 0)

    // Financial alerts
    const alerts = []
    if (margin < MARGIN_TARGET && totalRevenue > 0) alerts.push({ type: 'margin', text: `Margin at ${margin.toFixed(0)}% — below ${MARGIN_TARGET}% target`, color: '#f59e0b' })
    if (fuelPctOfExpenses > 40) alerts.push({ type: 'fuel', text: `Fuel is ${fuelPctOfExpenses.toFixed(0)}% of total expenses — high impact`, color: 'var(--danger)' })
    if (unpaidInvoices.length >= 3) alerts.push({ type: 'invoice', text: `${unpaidInvoices.length} invoices unpaid — cash flow at risk`, color: 'var(--danger)' })
    const underperformingTruck = truckStats.find(t => t.profitPerLoad < avgProfitPerLoad * 0.6 && t.loads > 0)
    if (underperformingTruck) alerts.push({ type: 'truck', text: `${underperformingTruck.name} underperforming — ${fmt$(underperformingTruck.profitPerLoad)}/load vs avg ${fmt$(avgProfitPerLoad)}`, color: '#f59e0b' })
    if (profitToday < 0 && todayRevenue > 0) alerts.push({ type: 'daily', text: `Negative profit today: ${fmt$(profitToday)}`, color: 'var(--danger)' })

    // Q insight text
    let insightText = ''
    let insightSub = ''
    let insightAccent = 'var(--accent)'
    if (netProfit < 0) {
      insightText = `Operating at a loss. Expenses exceed revenue by ${fmt$(Math.abs(netProfit))}. Recommended action: prioritize high-margin loads and reduce non-essential costs.`
      insightSub = `Estimated recovery needed: ${fmt$(Math.abs(netProfit))}`
      insightAccent = 'var(--danger)'
    } else if (margin < MARGIN_TARGET) {
      const gap = MARGIN_TARGET - margin
      insightText = `Current margin: ${margin.toFixed(0)}%. Target margin: ${MARGIN_TARGET}%. Recommended action: prioritize short-haul, high-margin loads.`
      insightSub = `Estimated improvement if target reached: +${fmt$(Math.round(totalRevenue * gap / 100))}/mo`
      insightAccent = '#f59e0b'
    } else if (unpaidInvoices.length > 0) {
      insightText = `${unpaidInvoices.length} invoices pending payment totaling ${fmt$(pendingTotal)}. Factor aging invoices for accelerated cash flow.`
      insightSub = `Expected incoming: ${fmt$(pendingTotal)}`
      insightAccent = 'var(--accent)'
    } else {
      insightText = `Strong financial position. ${margin.toFixed(0)}% margin exceeds ${MARGIN_TARGET}% target. ${deliveredLoads.length} loads completed at avg ${fmt$(avgProfitPerLoad)} profit/load.`
      insightAccent = 'var(--success)'
    }

    // Q decision text
    let decisionText = ''
    if (margin < 15 && activeLoads.length === 0) {
      decisionText = 'Reject loads below $2.50/mi — margin recovery required.'
    } else if (fuelPctOfExpenses > 45) {
      decisionText = 'Prioritize shorter lanes to reduce fuel impact on profit.'
    } else if (margin >= MARGIN_TARGET) {
      decisionText = 'Margins healthy. Continue current strategy — selective on rate, not volume.'
    }

    return {
      totalFuel, totalGallons, fuelPctOfExpenses,
      profitToday, profitWeek, todayRevenue, weekRevenue,
      avgProfitPerLoad, truckStats,
      paidTotal, pendingTotal, pendingInvoices, paidInvoices,
      alerts, insightText, insightSub, insightAccent, decisionText,
    }
  }, [loads, expenses, invoices, unpaidInvoices, totalRevenue, totalExpenses, netProfit, margin, fuelCostPerMile, activeLoads])

  // ── Existing handlers (unchanged) ──
  const handleReceiptScan = async (file) => {
    if (!file) return
    setScanning(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiFetch('/api/parse-receipt', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success && data.data) {
        const d = data.data
        setNewExp(e => ({
          ...e, amount: d.amount || '', date: d.date || e.date, cat: d.category || 'Fuel',
          notes: d.notes || d.merchant || '', gallons: d.gallons || '', pricePerGal: d.price_per_gallon || '', state: d.state || '',
        }))
        setShowAddExpense(true)
        haptic('success')
        showToast?.('success', 'Receipt Scanned', `${d.category || 'Expense'} — ${fmt$(d.amount)}`)
      } else {
        showToast?.('error', 'Scan Failed', data.error || 'Could not read receipt')
      }
    } catch (err) {
      showToast?.('error', 'Error', err.message)
    } finally {
      setScanning(false)
    }
  }

  const saveExpense = async () => {
    if (!newExp.amount) { showToast?.('error', 'Error', 'Enter an amount'); return }
    await addExpense({
      category: newExp.cat, amount: parseFloat(newExp.amount) || 0, date: newExp.date,
      notes: newExp.notes, merchant: newExp.notes,
      gallons: newExp.gallons ? parseFloat(newExp.gallons) : null,
      price_per_gallon: newExp.pricePerGal ? parseFloat(newExp.pricePerGal) : null,
      state: newExp.state || null,
    })
    haptic('success')
    showToast?.('success', 'Expense Added', `${newExp.cat} — ${fmt$(newExp.amount)}`)
    setNewExp({ amount: '', cat: 'Fuel', notes: '', date: new Date().toISOString().split('T')[0], gallons: '', pricePerGal: '', state: '' })
    setShowAddExpense(false)
  }

  const markPaid = (inv) => {
    haptic('success')
    updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Paid')
    showToast?.('success', 'Invoice Paid', inv.invoice_number || inv.id)
  }

  const factorInvoice = async (inv) => {
    const factoringRate = ctx.company?.factoring_rate || 2.5
    const fee = Math.round(inv.amount * factoringRate / 100)
    const net = inv.amount - fee
    const factoringCompany = ctx.company?.factoring_company || 'Factoring Company'
    const factoringEmail = ctx.company?.factoring_email || ''
    if (factoringEmail) {
      try {
        await apiFetch('/api/send-invoice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: factoringEmail, invoiceNumber: `${inv.invoice_number || inv.id} — FACTORING`,
            loadNumber: inv.load_number || inv.loadId || '', route: inv.route || '',
            amount: inv.amount || 0, dueDate: 'Same-day / 24hr deposit',
            brokerName: inv.broker || '', carrierName: ctx.company?.company_name || 'Carrier',
          }),
        })
      } catch {}
    }
    updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Factored')
    haptic('success')
    showToast?.('success', 'Invoice Factored', `$${net.toLocaleString()} net · ${factoringCompany} · 24hr deposit`)
    setFactorModal(null)
  }

  const sendInvoice = async (inv) => {
    const email = inv.broker_email || inv.email
    if (!email) { showToast?.('error', 'No Email', 'No broker email on file'); return }
    haptic()
    try {
      const res = await apiFetch('/api/send-invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email, invoiceNumber: inv.invoice_number || inv.id,
          loadNumber: inv.load_number || inv.loadId || '', route: inv.route || '',
          amount: inv.amount || 0, dueDate: inv.due_date || 'Net 30', brokerName: inv.broker || '',
        }),
      })
      if (res.ok) {
        haptic('success')
        showToast?.('success', 'Invoice Sent', `Sent to ${email}`)
        updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Sent')
      } else {
        showToast?.('error', 'Send Failed', 'Could not send invoice')
      }
    } catch (err) {
      showToast?.('error', 'Error', err.message)
    }
  }

  const SUB_TABS = [
    { id: 'overview', label: 'Q Overview' },
    { id: 'invoices', label: `Invoices (${invoices.length})` },
    { id: 'expenses', label: `Expenses (${expenses.length})` },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── 1. HEADER — Q Financial Intelligence ── */}
      <div style={{ flexShrink: 0, padding: '14px 16px 0', animation: 'fadeInUp 0.4s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            animation: 'qGlow 3s ease-in-out infinite',
          }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5, color: 'var(--text)' }}>Q FINANCIAL INTELLIGENCE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', animation: 'qStatusPulse 2s ease-in-out infinite' }} />
              <span>Monitoring profit</span>
              <span style={{ color: 'var(--border)' }}>•</span>
              <span>Managing cash flow</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Core Metrics Strip ── */}
      <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', gap: 8, animation: 'fadeInUp 0.4s ease 0.05s both' }}>
        <MetricPill label="Q Revenue" value={fmt$(totalRevenue)} color="var(--accent)" />
        <MetricPill label="Q Profit" value={fmt$(netProfit)} color={netProfit >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <MetricPill label="Margin" value={`${margin.toFixed(0)}%`} color={marginReached ? 'var(--success)' : '#f59e0b'}
          status={marginReached ? 'Above target' : 'Below target'} />
      </div>

      {/* ── Sub-tab switcher ── */}
      <div style={{ flexShrink: 0, padding: '0 16px 8px', display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => { haptic(); setSubTab(t.id) }}
            style={{
              padding: '7px 14px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
              background: subTab === t.id ? 'var(--accent)' : 'var(--surface)',
              border: `1px solid ${subTab === t.id ? 'var(--accent)' : 'var(--border)'}`,
              color: subTab === t.id ? '#000' : 'var(--text)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              transition: 'all 0.15s ease',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', WebkitOverflowScrolling: 'touch' }}>

        {/* ═══════ Q OVERVIEW TAB ═══════ */}
        {subTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* 2. Q Financial Insight */}
            <QInsightCard
              title="Q FINANCIAL INSIGHT"
              insight={qFinance.insightText}
              subtext={qFinance.insightSub}
              accent={qFinance.insightAccent}
            />

            {/* 3. Profit Today / This Week */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, animation: 'qInsightSlide 0.4s ease 0.1s both' }}>
              <QStatCard label="Q Profit Today" value={fmt$(qFinance.profitToday)}
                color={qFinance.profitToday >= 0 ? 'var(--success)' : 'var(--danger)'}
                icon={qFinance.profitToday >= 0 ? TrendingUp : TrendingDown} />
              <QStatCard label="Q Profit This Week" value={fmt$(qFinance.profitWeek)}
                color={qFinance.profitWeek >= 0 ? 'var(--success)' : 'var(--danger)'}
                icon={qFinance.profitWeek >= 0 ? TrendingUp : TrendingDown} />
            </div>

            {/* Margin Target Tracker */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '14px', animation: 'qInsightSlide 0.4s ease 0.15s both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ic icon={Target} size={12} color={marginReached ? 'var(--success)' : '#f59e0b'} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1 }}>MARGIN TARGET</span>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: marginReached ? 'rgba(0,212,170,0.12)' : 'rgba(245,158,11,0.12)',
                  color: marginReached ? 'var(--success)' : '#f59e0b',
                }}>
                  {marginReached ? 'ABOVE TARGET' : 'BELOW TARGET'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: marginReached ? 'var(--success)' : '#f59e0b', fontFamily: "'Bebas Neue',sans-serif" }}>
                  {margin.toFixed(1)}%
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>/ {MARGIN_TARGET}% target</span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: marginReached ? 'var(--success)' : '#f59e0b',
                  width: `${Math.min((margin / MARGIN_TARGET) * 100, 100)}%`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>

            {/* 5. Fuel Intelligence */}
            {qFinance.totalFuel > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                padding: '14px', animation: 'qInsightSlide 0.4s ease 0.2s both',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ic icon={Fuel} size={12} color="var(--accent)" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>Q FUEL INTELLIGENCE</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Total Fuel</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(qFinance.totalFuel)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Gallons</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>{qFinance.totalGallons.toFixed(0)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>% of Costs</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: qFinance.fuelPctOfExpenses > 40 ? 'var(--danger)' : 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>
                      {qFinance.fuelPctOfExpenses.toFixed(0)}%
                    </div>
                  </div>
                </div>
                {fuelCostPerMile > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    EIA diesel rate: <span style={{ color: 'var(--text)', fontWeight: 700 }}>${fuelCostPerMile.toFixed(2)}/mi</span>
                    {qFinance.fuelPctOfExpenses > 40 && (
                      <span style={{ color: '#f59e0b' }}> — Fuel impact high. Consider alternative lanes.</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 4. Profit Per Truck */}
            {qFinance.truckStats.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                padding: '14px', animation: 'qInsightSlide 0.4s ease 0.25s both',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ic icon={Truck} size={12} color="var(--accent)" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>PROFIT PER TRUCK</span>
                </div>
                {qFinance.truckStats.slice(0, 4).map((t, i) => {
                  const isUnder = t.profitPerLoad < qFinance.avgProfitPerLoad * 0.6 && t.loads > 0
                  return (
                    <div key={t.name} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                      borderBottom: i < qFinance.truckStats.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.loads} loads · {t.miles.toLocaleString()} mi</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: t.profit >= 0 ? 'var(--success)' : 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif" }}>
                          {fmt$(t.profit)}
                        </div>
                        {isUnder && (
                          <div style={{ fontSize: 8, color: '#f59e0b', fontWeight: 700 }}>UNDERPERFORMING</div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {qFinance.truckStats.some(t => t.profitPerLoad < qFinance.avgProfitPerLoad * 0.6 && t.loads > 0) && (
                  <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 8, color: 'var(--accent)', fontWeight: 800 }}>Q</span>
                    </div>
                    Underperforming unit needs better load selection.
                  </div>
                )}
              </div>
            )}

            {/* 6. Cash Flow */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '14px', animation: 'qInsightSlide 0.4s ease 0.3s both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Ic icon={Activity} size={12} color="var(--accent)" />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>Q CASH FLOW</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Paid</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(qFinance.paidTotal)}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>{qFinance.paidInvoices.length} inv</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Pending</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: unpaidInvoices.length > 0 ? 'var(--danger)' : 'var(--muted)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(qFinance.pendingTotal)}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>{qFinance.pendingInvoices.length} inv</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Expected</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(qFinance.pendingTotal)}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>incoming</div>
                </div>
              </div>
            </div>

            {/* 8. Financial Alerts */}
            {qFinance.alerts.length > 0 && (
              <div style={{ animation: 'qInsightSlide 0.4s ease 0.35s both' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ic icon={AlertTriangle} size={10} color="var(--danger)" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', letterSpacing: 1 }}>Q FINANCIAL ALERTS</span>
                </div>
                {qFinance.alerts.map((alert, i) => (
                  <div key={alert.type} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: `${alert.color}08`, border: `1px solid ${alert.color}25`,
                    borderRadius: 10, marginBottom: 6, animation: `fadeInUp 0.3s ease ${0.35 + i * 0.05}s both`,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: alert.color, flexShrink: 0, animation: 'qStatusPulse 2s ease-in-out infinite' }} />
                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, flex: 1 }}>{alert.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 9. Q Decision */}
            {qFinance.decisionText && (
              <div style={{
                background: 'var(--surface)', borderLeft: '3px solid var(--accent)', borderRadius: '0 12px 12px 0',
                padding: '12px 14px', animation: 'qInsightSlide 0.4s ease 0.4s both',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 9, color: '#000', fontWeight: 800 }}>Q</span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--accent)' }}>Q DECISION</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, lineHeight: 1.5 }}>{qFinance.decisionText}</div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ INVOICES TAB ═══════ */}
        {subTab === 'invoices' && (
          <>
            {invoices.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', animation: 'qBreath 3s ease-in-out infinite' }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--accent)', fontWeight: 800, lineHeight: 1 }}>Q</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Q has no invoices to show</div>
                <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>Invoices are auto-generated when loads are delivered. Q tracks payment status and flags delays.</div>
              </div>
            )}

            {/* Invoice delay alert */}
            {unpaidInvoices.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: 10, marginBottom: 10, animation: 'qInsightSlide 0.3s ease',
              }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 10, color: 'var(--danger)', fontWeight: 800 }}>Q</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>
                  {unpaidInvoices.length} invoice{unpaidInvoices.length > 1 ? 's' : ''} pending — {fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0))} outstanding. Potential cash flow impact.
                </span>
              </div>
            )}

            {invoices.map((inv, index) => {
              const isPaid = (inv.status || '').toLowerCase() === 'paid'
              const isSent = (inv.status || '').toLowerCase() === 'sent'
              const isFactored = (inv.status || '').toLowerCase() === 'factored'
              return (
                <div key={inv.id || inv.invoice_number || inv._dbId} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                  padding: '12px 14px', marginBottom: 8, animation: `fadeInUp 0.2s ease ${index * 0.04}s both`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: isPaid ? 'rgba(0,212,170,0.08)' : isFactored ? 'rgba(139,92,246,0.08)' : 'rgba(239,68,68,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Ic icon={isPaid ? CheckCircle : isFactored ? Zap : FileText} size={16}
                        color={isPaid ? 'var(--success)' : isFactored ? '#8b5cf6' : 'var(--danger)'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{inv.invoice_number || inv.id}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: isPaid ? 'rgba(0,212,170,0.12)' : isSent ? 'rgba(240,165,0,0.12)' : isFactored ? 'rgba(139,92,246,0.12)' : 'rgba(239,68,68,0.12)',
                          color: isPaid ? 'var(--success)' : isSent ? 'var(--accent)' : isFactored ? '#8b5cf6' : 'var(--danger)',
                        }}>{inv.status || 'Unpaid'}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {inv.load_number || inv.loadId || '—'} · {inv.broker || inv.driver_name || '—'} · {inv.date || inv.invoice_date || '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(inv.amount)}</div>
                      {inv.due_date && <div style={{ fontSize: 9, color: 'var(--muted)' }}>Due {inv.dueDate || inv.due_date}</div>}
                    </div>
                  </div>
                  {!isPaid && !isFactored && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => sendInvoice(inv)}
                        style={{ flex: 1, padding: '8px', background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Ic icon={Send} size={12} color="#000" /> Send
                      </button>
                      <button onClick={() => { haptic(); setFactorModal(inv) }}
                        style={{ flex: 1, padding: '8px', background: '#8b5cf6', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Ic icon={Zap} size={12} color="#fff" /> Factor
                      </button>
                      <button onClick={() => markPaid(inv)}
                        style={{ flex: 1, padding: '8px', background: 'var(--success)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Ic icon={CheckCircle} size={12} color="#000" /> Paid
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ═══════ EXPENSES TAB ═══════ */}
        {subTab === 'expenses' && (
          <>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={() => { haptic(); setShowAddExpense(true) }}
                style={{ flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                <Ic icon={Plus} size={14} color="#000" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>Add Expense</span>
              </button>
              <button onClick={() => receiptRef.current?.click()} disabled={scanning}
                style={{ flex: 1, padding: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                <Ic icon={Camera} size={14} color="var(--accent)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{scanning ? 'Scanning...' : 'Scan Receipt'}</span>
              </button>
              <input ref={receiptRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptScan(f); e.target.value = '' }} />
            </div>

            {/* Expense category breakdown */}
            {expenses.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                padding: '12px 14px', marginBottom: 10, animation: 'qInsightSlide 0.3s ease',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 8 }}>EXPENSE BREAKDOWN</div>
                {(() => {
                  const cats = {}
                  expenses.forEach(e => {
                    const c = e.category || e.cat || 'Other'
                    cats[c] = (cats[c] || 0) + (e.amount || 0)
                  })
                  return Object.entries(cats)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([cat, amount]) => {
                      const pct = totalExpenses > 0 ? (amount / totalExpenses * 100) : 0
                      return (
                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, width: 70, flexShrink: 0 }}>{cat}</span>
                          <div style={{ flex: 1, height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: cat === 'Fuel' ? 'var(--danger)' : 'var(--accent)', width: `${pct}%`, borderRadius: 2, transition: 'width 0.5s ease' }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', minWidth: 50, textAlign: 'right' }}>{fmt$(amount)}</span>
                          <span style={{ fontSize: 9, color: 'var(--muted)', minWidth: 30, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                        </div>
                      )
                    })
                })()}
              </div>
            )}

            {/* Add expense form */}
            {showAddExpense && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 14, padding: '14px', marginBottom: 10, animation: 'fadeInUp 0.25s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>New Expense</span>
                  <button onClick={() => setShowAddExpense(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Ic icon={X} size={16} color="var(--muted)" />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="number" placeholder="Amount" value={newExp.amount}
                    onChange={e => setNewExp(x => ({ ...x, amount: e.target.value }))}
                    style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }} />
                  <select value={newExp.cat} onChange={e => setNewExp(x => ({ ...x, cat: e.target.value }))}
                    style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="date" value={newExp.date}
                    onChange={e => setNewExp(x => ({ ...x, date: e.target.value }))}
                    style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                  <input placeholder="Notes / Merchant" value={newExp.notes}
                    onChange={e => setNewExp(x => ({ ...x, notes: e.target.value }))}
                    style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                  {newExp.cat === 'Fuel' && (
                    <>
                      <input type="number" placeholder="Gallons" value={newExp.gallons}
                        onChange={e => setNewExp(x => ({ ...x, gallons: e.target.value }))}
                        style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                      <input type="number" placeholder="$/gallon" value={newExp.pricePerGal}
                        onChange={e => setNewExp(x => ({ ...x, pricePerGal: e.target.value }))}
                        style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                      <input placeholder="State (e.g. TX)" value={newExp.state} maxLength={2}
                        onChange={e => setNewExp(x => ({ ...x, state: e.target.value.toUpperCase() }))}
                        style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase' }} />
                      <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>IFTA fields</div>
                    </>
                  )}
                </div>
                <button onClick={saveExpense}
                  style={{ width: '100%', marginTop: 10, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif" }}>
                  Save Expense
                </button>
              </div>
            )}

            {/* Expense list */}
            {expenses.length === 0 && !showAddExpense && (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', animation: 'qBreath 3s ease-in-out infinite' }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--accent)', fontWeight: 800, lineHeight: 1 }}>Q</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Q is not tracking any expenses</div>
                <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>Add expenses or scan a receipt. Q categorizes and tracks them for profit optimization.</div>
              </div>
            )}
            {expenses.map((exp, i) => (
              <div key={exp.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', animation: `fadeInUp 0.2s ease ${i * 0.04}s both` }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic icon={Receipt} size={14} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{exp.category || exp.cat || 'Other'}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exp.notes || exp.merchant || '—'} · {exp.date || '—'}
                    {exp.state && ` · ${exp.state}`}
                    {exp.gallons && ` · ${exp.gallons} gal`}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif" }}>-{fmt$(exp.amount)}</div>
              </div>
            ))}
          </>
        )}

        <div style={{ height: 80 }} />
      </div>

      {/* Factor confirmation modal */}
      {factorModal && (() => {
        const factoringRate = ctx.company?.factoring_rate || 2.5
        const fee = Math.round(factorModal.amount * factoringRate / 100)
        const net = factorModal.amount - fee
        const company = ctx.company?.factoring_company || 'Your Factoring Company'
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={() => setFactorModal(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))', animation: 'fadeInUp 0.2s ease' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 16px' }} />
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Ic icon={Zap} size={24} color="#8b5cf6" />
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>Factor Invoice</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{factorModal.invoice_number || factorModal.id} · {factorModal.broker || '—'}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Invoice Amount</span>
                <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(factorModal.amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Fee ({factoringRate}%)</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)' }}>-{fmt$(fee)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>You Receive</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(net)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>
                {company} · 24-hour deposit
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setFactorModal(null)}
                  style={{ flex: 1, padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={() => factorInvoice(factorModal)}
                  style={{ flex: 1, padding: '12px', background: '#8b5cf6', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Ic icon={Zap} size={14} color="#fff" /> Factor Now
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Sub-components ──

function MetricPill({ label, value, color, status }) {
  return (
    <div style={{
      flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 8px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 0.5 }}>{value}</div>
      {status && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 2 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 7, fontWeight: 700, color, textTransform: 'uppercase' }}>{status}</span>
        </div>
      )}
    </div>
  )
}

function QStatCard({ label, value, color, icon: Icon }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <Ic icon={Icon} size={11} color={color} />
        <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 0.5 }}>{value}</div>
    </div>
  )
}
