import { useState, useRef, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  FileText, Receipt, CheckCircle, Camera, Send, Zap, Plus, X, TrendingUp, TrendingDown
} from 'lucide-react'
import { Ic, haptic, fmt$ } from './shared'
import { apiFetch } from '../../lib/api'
import {
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer
} from 'recharts'

const CAT_COLORS = {
  Fuel: '#f59e0b', Insurance: '#ec4899', Repairs: '#ef4444',
  Tolls: '#8b5cf6', Lumper: '#22c55e', Tires: '#3b82f6',
  Meals: '#06b6d4', Parking: '#f97316', DEF: '#84cc16',
  Scale: '#14b8a6', Permits: '#a855f7', Other: '#6b7280',
}

function isThisWeek(d) {
  if (!d) return false
  const now = new Date(), dd = new Date(d)
  const start = new Date(now); start.setDate(now.getDate() - now.getDay())
  start.setHours(0, 0, 0, 0)
  return dd >= start && dd <= now
}

function calcDriverPay(revenue, miles, driverName, drivers) {
  const driver = drivers.find(d => (d.full_name || d.name || d.driver_name) === driverName)
  if (driver?.pay_model && driver?.pay_rate) {
    const rate = Number(driver.pay_rate) || 0
    if (driver.pay_model === 'percent') return revenue * (rate / 100)
    if (driver.pay_model === 'permile') return (miles || 0) * rate
    if (driver.pay_model === 'flat') return rate
  }
  return 0
}

export default function MobileMoneyTab({ initialSubTab }) {
  const ctx = useCarrier() || {}
  const { showToast } = useApp()
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const loads = ctx.loads || []
  const drivers = ctx.drivers || []
  const addExpense = ctx.addExpense || (() => {})
  const updateInvoiceStatus = ctx.updateInvoiceStatus || (() => {})
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []

  const [tab, setTab] = useState(initialSubTab === 'expenses' ? 'expenses' : 'overview')
  const [scanning, setScanning] = useState(false)
  const receiptRef = useRef(null)
  const [factorModal, setFactorModal] = useState(null)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [newExp, setNewExp] = useState({
    amount: '', cat: 'Fuel', notes: '',
    date: new Date().toISOString().split('T')[0],
    gallons: '', pricePerGal: '', state: '',
  })

  // ── Financials ──────────────────────────────────────────────────────────
  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0
  const marginTarget = 18

  const deliveredLoads = useMemo(() =>
    loads.filter(l => (l.status || '').toLowerCase() === 'delivered'), [loads])

  const profitToday = useMemo(() => {
    const today = new Date().toDateString()
    return loads
      .filter(l => l.delivery_date && new Date(l.delivery_date).toDateString() === today)
      .reduce((s, l) => s + (Number(l.gross) || Number(l.rate) || 0), 0)
  }, [loads])

  const weekStats = useMemo(() => {
    const weekLoads = loads.filter(l => isThisWeek(l.delivery_date) || isThisWeek(l.created_at))
    const weekRevenue = weekLoads.reduce((s, l) => s + (Number(l.gross) || Number(l.rate) || 0), 0)
    const weekExpenses = expenses.filter(e => isThisWeek(e.date)).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return { revenue: weekRevenue, expenses: weekExpenses, net: weekRevenue - weekExpenses }
  }, [loads, expenses])

  // Daily chart data for current week (Mon–Sun)
  const weeklyChartData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const vals = [0, 0, 0, 0, 0, 0, 0]
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // Monday
    weekStart.setHours(0, 0, 0, 0)

    loads.forEach(l => {
      const d = new Date(l.delivery_date || l.created_at)
      if (d >= weekStart && d <= now) {
        const idx = Math.min(6, Math.floor((d - weekStart) / 86400000))
        vals[idx] += Number(l.gross) || Number(l.rate) || 0
      }
    })
    return days.map((day, i) => ({ day, revenue: vals[i] }))
  }, [loads])

  // Expense breakdown by category
  const expByCategory = useMemo(() => {
    const map = {}
    expenses.forEach(e => {
      const cat = e.category || e.cat || 'Other'
      map[cat] = (map[cat] || 0) + Number(e.amount || 0)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => ({ cat, amount }))
  }, [expenses])

  const totalExpAmt = expByCategory.reduce((s, e) => s + e.amount, 0)

  // Q Insight text
  const qInsight = useMemo(() => {
    if (deliveredLoads.length === 0) return 'No delivered loads yet. Q is monitoring your financials — run your first load to see insights.'
    const avgProfit = deliveredLoads.length > 0 ? Math.round(netProfit / deliveredLoads.length) : 0
    if (margin > marginTarget) {
      return `Strong financial position. ${margin}% margin exceeds ${marginTarget}% target. ${deliveredLoads.length} load${deliveredLoads.length !== 1 ? 's' : ''} completed at avg ${fmt$(avgProfit)} profit/load.`
    } else if (margin > 0) {
      return `Margin at ${margin}% — below ${marginTarget}% target. Watch fuel and tolls. ${deliveredLoads.length} load${deliveredLoads.length !== 1 ? 's' : ''} completed this period.`
    }
    return `Revenue tracking started. Keep adding loads and expenses for Q to analyze your profitability.`
  }, [margin, netProfit, deliveredLoads])

  // ── Handlers ─────────────────────────────────────────────────────────────
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
        await addExpense({
          category: d.category || 'Fuel', amount: parseFloat(d.amount) || 0,
          date: d.date || new Date().toISOString().split('T')[0],
          notes: d.notes || d.merchant || '', merchant: d.notes || d.merchant || '',
          gallons: d.gallons ? parseFloat(d.gallons) : null,
          price_per_gallon: d.price_per_gallon ? parseFloat(d.price_per_gallon) : null,
          state: d.state || null,
        })
        haptic('success')
        showToast?.('success', 'Receipt Scanned', `${d.category || 'Expense'} — ${fmt$(d.amount)}`)
        setTab('expenses')
      } else {
        showToast?.('error', 'Scan Failed', 'Could not read receipt — add manually')
        setShowExpenseForm(true)
        setTab('expenses')
      }
    } catch {
      showToast?.('error', 'Scan Failed', 'Could not read receipt — add manually')
      setShowExpenseForm(true)
      setTab('expenses')
    } finally { setScanning(false) }
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
    setShowExpenseForm(false)
  }

  const markPaid = (inv) => {
    haptic('success')
    updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Paid')
    showToast?.('success', 'Invoice Paid', inv.invoice_number || inv.id)
  }

  const factorInvoice = async (inv) => {
    const factoringRate = ctx.company?.factoring_rate || 2.5
    const amount = Number(inv.amount) || 0
    const fee = Math.round(amount * Number(factoringRate) / 100)
    const net = amount - fee
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
    showToast?.('success', 'Invoice Factored', `${fmt$(net)} net · 24hr deposit`)
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

  const allInvoices = invoices.filter(i => {
    const s = (i.status || '').toLowerCase()
    return s !== 'draft'
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

        {/* ── Q Financial Intelligence Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0d0f1a 0%, #111520 100%)',
          borderBottom: '1px solid rgba(240,165,0,0.12)',
          padding: '20px 20px 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, #f0a500, #e09000)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 16px rgba(240,165,0,0.35)', flexShrink: 0,
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#000', lineHeight: 1 }}>Q</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1.5, color: '#fff' }}>
                Q FINANCIAL INTELLIGENCE
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
                Monitoring profit · Managing cash flow
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Q Revenue', value: fmt$(totalRevenue), color: '#f0a500' },
              { label: 'Q Profit', value: fmt$(netProfit), color: netProfit >= 0 ? '#22c55e' : '#ef4444' },
              {
                label: 'Margin', value: `${margin}%`,
                color: margin >= marginTarget ? '#22c55e' : margin > 0 ? '#f59e0b' : '#ef4444',
                sub: margin >= marginTarget ? '● ABOVE TARGET' : margin > 0 ? '● BELOW TARGET' : null,
                subColor: margin >= marginTarget ? '#22c55e' : '#f59e0b',
              },
            ].map(card => (
              <div key={card.label} style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.07)', padding: '12px 10px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: card.color, lineHeight: 1 }}>{card.value}</div>
                {card.sub && <div style={{ fontSize: 8, color: card.subColor, fontWeight: 700, marginTop: 4, letterSpacing: 0.3 }}>{card.sub}</div>}
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { id: 'overview', label: 'Q Overview' },
              { id: 'invoices', label: `Invoices (${allInvoices.length})` },
              { id: 'expenses', label: `Expenses (${expenses.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => { haptic(); setTab(t.id) }}
                style={{
                  flex: 1, padding: '10px 4px 12px', background: 'none', border: 'none',
                  borderBottom: tab === t.id ? '2px solid #f0a500' : '2px solid transparent',
                  color: tab === t.id ? '#f0a500' : 'var(--muted)',
                  fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
                  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                  transition: 'all 0.2s', marginBottom: -1,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB: Q Overview ── */}
        {tab === 'overview' && (
          <div style={{ padding: '20px 20px' }}>

            {/* Q Insight */}
            <div style={{
              background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)',
              borderRadius: 14, padding: '14px 16px', marginBottom: 16,
              display: 'flex', gap: 10,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: '#f0a500',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
              }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: '#000' }}>Q</span>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#f0a500', letterSpacing: 1, marginBottom: 5 }}>Q FINANCIAL INSIGHT</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{qInsight}</div>
              </div>
            </div>

            {/* Today + This Week */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="premium-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>Q PROFIT TODAY</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: profitToday > 0 ? '#22c55e' : 'var(--muted)', lineHeight: 1 }}>
                  {fmt$(profitToday)}
                </div>
              </div>
              <div className="premium-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>Q PROFIT THIS WEEK</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: weekStats.net > 0 ? '#22c55e' : weekStats.net < 0 ? '#ef4444' : 'var(--muted)', lineHeight: 1 }}>
                  {fmt$(weekStats.net)}
                </div>
              </div>
            </div>

            {/* Weekly Earnings Chart */}
            <div className="premium-card" style={{ padding: '18px 16px 12px', marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 14 }}>WEEKLY EARNINGS</div>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={weeklyChartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f0a500" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f0a500" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#f0a500', fontWeight: 700 }}
                    formatter={v => [fmt$(v), 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#f0a500" strokeWidth={2.5}
                    fill="url(#goldGrad)" dot={{ fill: '#f0a500', r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ height: 80 }} />
          </div>
        )}

        {/* ── TAB: Invoices ── */}
        {tab === 'invoices' && (
          <div style={{ padding: '20px 20px' }}>
            {allInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)', fontSize: 13 }}>
                No invoices yet. Complete a load to generate your first invoice.
              </div>
            ) : allInvoices.map((inv, index) => {
              const status = (inv.status || '').toLowerCase()
              const isFactored = status === 'factored'
              const isPaid = status === 'paid'
              const isSent = status === 'sent'
              const statusColor = isPaid || isFactored ? '#22c55e' : isSent ? '#f0a500' : '#6b7280'
              const statusLabel = isPaid ? 'Paid' : isFactored ? 'Factored' : isSent ? 'Sent' : 'Unpaid'

              return (
                <div key={inv.id || inv.invoice_number || index} className="premium-card"
                  style={{ padding: '14px 16px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                          {inv.invoice_number || inv.id || '—'}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5,
                          background: statusColor + '18', color: statusColor, letterSpacing: 0.5,
                        }}>{statusLabel.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                        {inv.load_number || inv.loadId || '—'} · {inv.broker || '—'} · {inv.date ? new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#f0a500', letterSpacing: 1 }}>{fmt$(inv.amount)}</div>
                      {inv.due_date && (
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          Due {new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>

                  {!isPaid && !isFactored && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => sendInvoice(inv)} className="premium-btn"
                        style={{ flex: 1, padding: '10px', background: '#f0a500', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <Ic icon={Send} size={13} color="#000" /> Send
                      </button>
                      <button onClick={() => markPaid(inv)} className="premium-btn"
                        style={{ flex: 1, padding: '10px', background: '#22c55e', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <Ic icon={CheckCircle} size={13} color="#000" /> Paid
                      </button>
                      <button onClick={() => { haptic(); setFactorModal(inv) }} className="premium-btn"
                        style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <Ic icon={Zap} size={13} color="#fff" /> Factor
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ height: 80 }} />
          </div>
        )}

        {/* ── TAB: Expenses ── */}
        {tab === 'expenses' && (
          <div style={{ padding: '20px 20px' }}>

            {/* Action buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <button onClick={() => { haptic(); setShowExpenseForm(true) }} className="premium-btn"
                style={{ padding: '14px', background: '#f0a500', borderRadius: 14, fontSize: 13, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Ic icon={Plus} size={15} color="#000" /> Add Expense
              </button>
              <button onClick={() => receiptRef.current?.click()} disabled={scanning} className="premium-btn"
                style={{ padding: '14px', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 14, fontSize: 13, fontWeight: 700, color: '#f0a500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Ic icon={Camera} size={15} color="#f0a500" /> {scanning ? 'Scanning...' : 'Scan Receipt'}
              </button>
            </div>
            <input ref={receiptRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptScan(f); e.target.value = '' }} />

            {/* Expense form */}
            {showExpenseForm && (
              <div className="premium-card" style={{ borderColor: 'rgba(240,165,0,0.2)', padding: 16, marginBottom: 20, animation: 'fadeInUp 0.25s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>New Expense</span>
                  <button onClick={() => setShowExpenseForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Ic icon={X} size={16} color="var(--muted)" />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="number" placeholder="Amount" value={newExp.amount}
                    onChange={e => setNewExp(x => ({ ...x, amount: e.target.value }))}
                    style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }} />
                  <select value={newExp.cat} onChange={e => setNewExp(x => ({ ...x, cat: e.target.value }))}
                    style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                    {['Fuel', 'Tolls', 'Repairs', 'Insurance', 'Meals', 'Parking', 'Permits', 'Tires', 'DEF', 'Lumper', 'Scale', 'Other'].map(c => <option key={c}>{c}</option>)}
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
                      <input placeholder="State (TX)" value={newExp.state} maxLength={2}
                        onChange={e => setNewExp(x => ({ ...x, state: e.target.value.toUpperCase() }))}
                        style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                      <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>IFTA fields</div>
                    </>
                  )}
                </div>
                <button onClick={saveExpense} className="premium-btn"
                  style={{ width: '100%', marginTop: 12, padding: '12px', background: 'var(--accent)', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#000' }}>
                  Save Expense
                </button>
              </div>
            )}

            {/* Donut chart */}
            {expByCategory.length > 0 && (
              <div className="premium-card" style={{ padding: '18px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 14 }}>EXPENSE BREAKDOWN</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={expByCategory} dataKey="amount" nameKey="cat"
                        cx="50%" cy="50%" innerRadius={34} outerRadius={54} paddingAngle={2}>
                        {expByCategory.map((entry, i) => (
                          <Cell key={entry.cat} fill={CAT_COLORS[entry.cat] || '#6b7280'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {expByCategory.slice(0, 6).map(e => (
                      <div key={e.cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[e.cat] || '#6b7280', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--text)' }}>{e.cat}</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                          {totalExpAmt > 0 ? Math.round((e.amount / totalExpAmt) * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Expense list */}
            {expenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)', fontSize: 13 }}>
                No expenses yet. Snap a receipt or add manually.
              </div>
            ) : expenses.slice().reverse().map((exp, i) => (
              <div key={exp.id || i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: (CAT_COLORS[exp.category || exp.cat] || '#6b7280') + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ic icon={Receipt} size={14} color={CAT_COLORS[exp.category || exp.cat] || '#6b7280'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {exp.category || exp.cat || 'Expense'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                      {exp.notes || exp.merchant || '—'} · {exp.date ? new Date(exp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#ef4444', letterSpacing: 0.5 }}>
                  -{fmt$(exp.amount)}
                </div>
              </div>
            ))}

            <div style={{ height: 80 }} />
          </div>
        )}
      </div>

      {/* Factor modal */}
      {factorModal && (() => {
        const factoringRate = ctx.company?.factoring_rate || 2.5
        const fee = Math.round(factorModal.amount * factoringRate / 100)
        const net = factorModal.amount - fee
        const company = ctx.company?.factoring_company || 'Your Factoring Company'
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={() => setFactorModal(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '100%', maxWidth: 480, background: 'var(--surface)',
              borderRadius: '24px 24px 0 0', padding: '20px 24px calc(24px + env(safe-area-inset-bottom, 0px))',
              animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderBottom: 'none',
            }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', margin: '0 auto 20px' }} />
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Ic icon={Zap} size={24} color="#8b5cf6" />
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>Factor Invoice</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{factorModal.invoice_number || factorModal.id} · {factorModal.broker || '—'}</div>
              </div>
              {[
                { label: 'Invoice Amount', value: fmt$(factorModal.amount), color: 'var(--text)' },
                { label: `Fee (${factoringRate}%)`, value: `-${fmt$(fee)}`, color: 'var(--danger)' },
                { label: 'You Receive', value: fmt$(net), color: 'var(--success)', big: true },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: row.big ? 'var(--text)' : 'var(--muted)', fontWeight: row.big ? 700 : 400 }}>{row.label}</span>
                  <span style={{ fontSize: row.big ? 18 : 15, fontWeight: 800, color: row.color, fontFamily: row.big ? "'Bebas Neue',sans-serif" : undefined }}>{row.value}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>
                {company} · 24-hour deposit
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button onClick={() => setFactorModal(null)} className="premium-btn"
                  style={{ flex: 1, padding: '14px', background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  Cancel
                </button>
                <button onClick={() => factorInvoice(factorModal)} className="premium-btn"
                  style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 16px rgba(139,92,246,0.35)' }}>
                  <Ic icon={Zap} size={15} color="#fff" /> Factor Now
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
