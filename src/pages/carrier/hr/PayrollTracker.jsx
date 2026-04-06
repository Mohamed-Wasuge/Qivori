import { useState, useMemo, useEffect, useCallback } from 'react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { DollarSign, CreditCard, Calendar, Clock, Check, Download, Search, Filter, User, Users, TrendingUp, BarChart2, Eye, Printer, CheckCircle, Save, Trash2, Plus, Edit3 as PencilIcon, Activity, Hash, Phone, Send, Briefcase, FileText, Shield } from 'lucide-react'
import * as db from '../../../lib/database'
import { generateSettlementPDF, generate1099NECPDF } from '../../../utils/generatePDF'
import { inp } from './helpers'
import { apiFetch } from '../../../lib/api'

export function PayrollTracker() {
  const { showToast } = useApp()
  const { drivers, loads } = useCarrier()
  const [payroll, setPayroll] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDriverId, setSelectedDriverId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  // Run Payroll state
  const [runPeriod, setRunPeriod] = useState('this-week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [runDeductions, setRunDeductions] = useState([])
  const [runStep, setRunStep] = useState('select') // select | review | confirmed
  // Bank info state (Supabase-backed)
  const [bankInfo, setBankInfo] = useState({})
  // Recurring deductions config (Supabase-backed)
  const [recurringDeductions, setRecurringDeductions] = useState({})
  // Stripe Connect state
  const [connectStatus, setConnectStatus] = useState(null) // null | { connected, payouts_enabled, ... }
  const [connectLoading, setConnectLoading] = useState(false)
  const [payingDriverId, setPayingDriverId] = useState(null)
  // Escrow, fuel cards, advances state
  const [escrowTxns, setEscrowTxns] = useState([])
  const [fuelCardTxns, setFuelCardTxns] = useState([])
  const [advances, setAdvances] = useState([])
  const [showFuelForm, setShowFuelForm] = useState(false)
  const [showAdvanceForm, setShowAdvanceForm] = useState(false)
  const [showEscrowRelease, setShowEscrowRelease] = useState(false)

  useEffect(() => {
    apiFetch('/api/stripe-connect').then(r => r.json()).then(data => setConnectStatus(data)).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      db.fetchPayroll(),
      db.fetchBankInfo(),
      db.fetchRecurringDeductions(),
      db.fetchEscrowTransactions(),
      db.fetchFuelCardTransactions(),
      db.fetchAdvances(),
    ]).then(([p, banks, deducts, esc, fuel, adv]) => {
      setEscrowTxns(esc || [])
      setFuelCardTxns(fuel || [])
      setAdvances(adv || [])
      setPayroll(p)
      // Convert bank info array to map by driver_id
      const bankMap = {}
      ;(banks || []).forEach(b => {
        bankMap[b.driver_id] = { method: b.method, bankName: b.bank_name, accountType: b.account_type, routing: b.routing_number, last4: b.account_last4, otherDetails: b.other_details }
      })
      setBankInfo(bankMap)
      // Convert deductions array to map by driver_id
      const dedMap = {}
      ;(deducts || []).forEach(d => {
        if (!dedMap[d.driver_id]) dedMap[d.driver_id] = []
        dedMap[d.driver_id].push({ label: d.label, amount: d.amount, type: d.deduction_type })
      })
      setRecurringDeductions(dedMap)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedDriverId && drivers.length > 0) setSelectedDriverId(drivers[0].id)
  }, [drivers, selectedDriverId])

  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d.full_name || d.name || 'Unknown'])), [drivers])

  const ytd = useMemo(() => {
    const map = {}
    payroll.forEach(p => {
      if (!map[p.driver_id]) map[p.driver_id] = { gross:0, net:0, deductions:0, perDiem:0, fuel:0, loads:0, miles:0 }
      map[p.driver_id].gross += Number(p.gross_pay) || 0
      map[p.driver_id].net += Number(p.net_pay) || 0
      map[p.driver_id].deductions += Number(p.deductions) || 0
      map[p.driver_id].perDiem += Number(p.per_diem) || 0
      map[p.driver_id].fuel += Number(p.fuel_advance) || 0
      map[p.driver_id].loads += Number(p.loads_completed) || 0
      map[p.driver_id].miles += Number(p.miles_driven) || 0
    })
    return map
  }, [payroll])

  const totalGross = Object.values(ytd).reduce((s, d) => s + d.gross, 0)
  const totalNet = Object.values(ytd).reduce((s, d) => s + d.net, 0)
  const totalDeductions = Object.values(ytd).reduce((s, d) => s + d.deductions, 0)

  const filteredDrivers = useMemo(() => {
    if (!searchQuery) return drivers
    const q = searchQuery.toLowerCase()
    return drivers.filter(d => (d.full_name || d.name || '').toLowerCase().includes(q))
  }, [drivers, searchQuery])

  const selectedDriver = drivers.find(d => d.id === selectedDriverId)
  const selYtd = ytd[selectedDriverId] || { gross:0, net:0, deductions:0, perDiem:0, fuel:0, loads:0, miles:0 }
  const selPayroll = payroll.filter(p => p.driver_id === selectedDriverId)
  const selNeeds1099 = selYtd.gross >= 600

  // Computed: escrow balance per driver
  const escrowBalances = useMemo(() => {
    const map = {}
    escrowTxns.forEach(t => {
      if (!map[t.driver_id]) map[t.driver_id] = 0
      map[t.driver_id] += t.type === 'hold' ? Number(t.amount) : -Number(t.amount)
    })
    return map
  }, [escrowTxns])

  // Computed: pending fuel card amount per driver
  const fuelPending = useMemo(() => {
    const map = {}
    fuelCardTxns.forEach(f => {
      if (!f.deducted_in_payroll_id) {
        if (!map[f.driver_id]) map[f.driver_id] = { total: 0, ids: [], items: [] }
        map[f.driver_id].total += Number(f.amount)
        map[f.driver_id].ids.push(f.id)
        map[f.driver_id].items.push(f)
      }
    })
    return map
  }, [fuelCardTxns])

  // Computed: outstanding advances per driver
  const advancePending = useMemo(() => {
    const map = {}
    advances.forEach(a => {
      if (a.type === 'advance' && !a.deducted_in_payroll_id) {
        if (!map[a.driver_id]) map[a.driver_id] = { total: 0, ids: [], items: [] }
        map[a.driver_id].total += Number(a.amount)
        map[a.driver_id].ids.push(a.id)
        map[a.driver_id].items.push(a)
      }
    })
    return map
  }, [advances])

  // Run Payroll: compute date range
  const getDateRange = useCallback(() => {
    const now = new Date()
    const day = now.getDay()
    if (runPeriod === 'this-week') {
      const start = new Date(now); start.setDate(now.getDate() - day)
      const end = new Date(start); end.setDate(start.getDate() + 6)
      return { start, end }
    } else if (runPeriod === 'last-week') {
      const start = new Date(now); start.setDate(now.getDate() - day - 7)
      const end = new Date(start); end.setDate(start.getDate() + 6)
      return { start, end }
    } else if (runPeriod === 'this-month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { start, end }
    } else if (runPeriod === 'last-month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start, end }
    } else {
      return { start: customStart ? new Date(customStart) : now, end: customEnd ? new Date(customEnd) : now }
    }
  }, [runPeriod, customStart, customEnd])

  // Run Payroll: calculate settlements for all drivers in the period
  const runPayrollData = useMemo(() => {
    const { start, end } = getDateRange()
    const startStr = start.toISOString?.() || ''
    const endStr = end.toISOString?.() || ''
    return drivers.map(d => {
      const name = d.full_name || d.name || ''
      const driverLoads = loads.filter(l => {
        if (l.driver !== name) return false
        if (!['Delivered','Invoiced','Paid'].includes(l.status)) return false
        const delivDate = l.delivery_date || l.updated_at || l.created_at
        if (!delivDate) return true
        const ld = new Date(delivDate)
        return ld >= start && ld <= end
      })
      const totalMiles = driverLoads.reduce((s, l) => s + (Number(l.miles) || 0), 0)
      const totalGross = driverLoads.reduce((s, l) => s + (Number(l.rate) || 0), 0)
      let driverPay = 0
      if (d.pay_model === 'permile') driverPay = totalMiles * (Number(d.pay_rate) || 0)
      else if (d.pay_model === 'flat') driverPay = driverLoads.length * (Number(d.pay_rate) || 0)
      else driverPay = totalGross * ((Number(d.pay_rate) || 28) / 100)
      const recurring = recurringDeductions[d.id] || []
      const totalRecurring = recurring.reduce((s, r) => s + (Number(r.amount) || 0), 0)
      const manual = runDeductions.filter(rd => rd.driverId === d.id)
      const totalManual = manual.reduce((s, r) => s + (Number(r.amount) || 0), 0)
      const fuel = fuelPending[d.id] || { total: 0, ids: [], items: [] }
      const adv = advancePending[d.id] || { total: 0, ids: [], items: [] }
      const totalAllDeductions = totalRecurring + totalManual + fuel.total + adv.total
      const netPay = driverPay - totalAllDeductions
      return {
        driver: d, name, loads: driverLoads, totalMiles, totalGross, driverPay,
        deductions: totalAllDeductions, recurringDeductions: recurring, manualDeductions: manual,
        fuelDeductions: fuel.total, fuelIds: fuel.ids, fuelItems: fuel.items,
        advanceDeductions: adv.total, advanceIds: adv.ids, advanceItems: adv.items,
        netPay,
      }
    }).filter(d => d.loads.length > 0)
  }, [drivers, loads, getDateRange, runDeductions, recurringDeductions, fuelPending, advancePending])

  const exportCSV = () => {
    const rows = [['Driver','Gross Pay','Net Pay','Deductions','Per Diem','Fuel Advance','Loads','Miles','1099 Required']]
    Object.entries(ytd).forEach(([dId, d]) => {
      rows.push([driverMap[dId] || dId, d.gross.toFixed(2), d.net.toFixed(2), d.deductions.toFixed(2), d.perDiem.toFixed(2), d.fuel.toFixed(2), d.loads, d.miles, d.gross >= 600 ? 'Yes' : 'No'])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `1099-report-${new Date().getFullYear()}.csv`; a.click()
    URL.revokeObjectURL(url)
    showToast('','Exported',`1099 data for ${Object.keys(ytd).length} drivers downloaded`)
  }

  const downloadSettlement = (driverData) => {
    const { start, end } = getDateRange()
    const d = driverData
    const period = `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} - ${end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`
    const pdfLoads = d.loads.map(l => {
      let pay = 0
      if (d.driver.pay_model === 'permile') pay = (Number(l.miles)||0) * (Number(d.driver.pay_rate)||0)
      else if (d.driver.pay_model === 'flat') pay = Number(d.driver.pay_rate) || 0
      else pay = (Number(l.rate)||0) * ((Number(d.driver.pay_rate)||28)/100)
      return {
        id: l.load_number || l.id?.toString().slice(0,8) || '—',
        route: `${l.origin||'?'} to ${l.destination||'?'}`,
        miles: Number(l.miles) || 0,
        gross: Number(l.rate) || 0,
        pay: Math.round(pay),
      }
    })
    const allDeductions = [...d.recurringDeductions, ...d.manualDeductions]
    generateSettlementPDF(d.name, pdfLoads, period, {
      payModel: d.driver.pay_model,
      payRate: d.driver.pay_rate,
      deductions: allDeductions,
      totalDeductions: d.deductions,
      driverPay: d.driverPay,
      netPay: d.netPay,
    })
    showToast('','Downloaded',`Settlement PDF for ${d.name}`)
  }

  const approvePayroll = async () => {
    const { start, end } = getDateRange()
    for (const d of runPayrollData) {
      try {
        const newPayroll = await db.createPayroll({
          driver_id: d.driver.id,
          period_start: start.toISOString().slice(0,10),
          period_end: end.toISOString().slice(0,10),
          gross_pay: d.driverPay,
          deductions: d.deductions,
          net_pay: d.netPay,
          per_diem: 0,
          fuel_advance: d.fuelDeductions || 0,
          loads_completed: d.loads.length,
          miles_driven: d.totalMiles,
          status: 'approved',
        })
        // Mark fuel card transactions as deducted
        if (d.fuelIds?.length) await db.markFuelCardDeducted(d.fuelIds, newPayroll.id).catch(() => {})
        // Mark advances as deducted
        if (d.advanceIds?.length) await db.markAdvancesDeducted(d.advanceIds, newPayroll.id).catch(() => {})
        // Create escrow hold if driver has an Escrow recurring deduction
        const escrowDed = (d.recurringDeductions || []).find(r => r.label?.toLowerCase().includes('escrow') || r.label?.toLowerCase().includes('reserve'))
        if (escrowDed && Number(escrowDed.amount) > 0) {
          await db.createEscrowTransaction({ driver_id: d.driver.id, type: 'hold', amount: Number(escrowDed.amount), description: `Payroll hold — ${start.toISOString().slice(0,10)} to ${end.toISOString().slice(0,10)}`, payroll_id: newPayroll.id }).catch(() => {})
        }
      } catch { /* skip */ }
    }
    // Refresh all data
    const [refreshedPayroll, refreshedEscrow, refreshedFuel, refreshedAdv] = await Promise.all([
      db.fetchPayroll().catch(() => []),
      db.fetchEscrowTransactions().catch(() => []),
      db.fetchFuelCardTransactions().catch(() => []),
      db.fetchAdvances().catch(() => []),
    ])
    setPayroll(refreshedPayroll)
    setEscrowTxns(refreshedEscrow)
    setFuelCardTxns(refreshedFuel)
    setAdvances(refreshedAdv)
    setRunStep('confirmed')
    showToast('','Payroll Approved',`${runPayrollData.length} driver settlements created`)
  }

  const connectBank = async () => {
    setConnectLoading(true)
    try {
      const res = await apiFetch('/api/stripe-connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-account' }) })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else if (data.error) showToast('', 'Error', data.error)
    } catch (err) {
      showToast('', 'Error', err.message || 'Failed to start bank connection')
    }
    setConnectLoading(false)
  }

  const payDriver = async (payrollId, speed = 'standard') => {
    setPayingDriverId(payrollId)
    try {
      const res = await apiFetch('/api/pay-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payrollId, paymentSpeed: speed }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast('', 'Payment Sent', `$${data.amount.toLocaleString()} → ${data.driver} (${data.estimated_arrival})`)
        setPayroll(prev => prev.map(p => p.id === payrollId ? { ...p, status: 'paid', payment_status: 'in_transit', payment_method: speed === 'instant' ? 'ach_instant' : 'ach_standard' } : p))
      } else {
        showToast('', 'Payment Failed', data.error || 'Unknown error')
      }
    } catch (err) {
      showToast('', 'Payment Failed', err.message || 'Could not process payment')
    }
    setPayingDriverId(null)
  }

  const saveBankInfo = (driverId, info) => {
    const updated = { ...bankInfo, [driverId]: info }
    setBankInfo(updated)
    db.upsertBankInfo(driverId, info).catch(() => {})
    showToast('','Saved','Bank info updated')
  }

  const saveRecurringDeduction = (driverId, deductions) => {
    const updated = { ...recurringDeductions, [driverId]: deductions }
    setRecurringDeductions(updated)
    db.setRecurringDeductions(driverId, deductions).catch(() => {})
  }

  const fmtPay = (d) => d.pay_model === 'percent' ? `${d.pay_rate || 28}%` : d.pay_model === 'permile' ? `$${Number(d.pay_rate||0).toFixed(2)}/mi` : d.pay_model === 'flat' ? `$${d.pay_rate} flat` : '28%'
  const fmtMoney = (n) => `$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'

  const ps = {
    panel: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 },
    sectionTitle: { fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1.2, marginBottom:12 },
    row: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' },
    rowLast: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0' },
    label: { fontSize:13, color:'var(--text-secondary,#94a3b8)' },
    value: { fontSize:13, fontWeight:600 },
    input: { background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--text)', outline:'none', width:'100%' },
  }

  const dSelBank = bankInfo[selectedDriverId] || {}
  const dSelRecurring = recurringDeductions[selectedDriverId] || []

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {/* Header bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:1.5 }}>PAYROLL</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Settlements, 1099s & driver compensation</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => { setActiveTab('run-payroll'); setRunStep('select') }}>
            <Ic icon={DollarSign} size={14} /> Run Payroll
          </button>
          <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={exportCSV}>
            <Ic icon={Download} size={14} /> Export 1099s
          </button>
        </div>
      </div>

      {/* Stripe Connect Banner */}
      {connectStatus && !connectStatus.onboarding_complete && (
        <div style={{ background: 'rgba(77,142,240,0.08)', border: '1px solid rgba(77,142,240,0.25)', borderRadius: 12, padding: '14px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
          <CreditCard size={24} color="var(--accent3)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Connect Your Bank for One-Click Driver Payments</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Link your business bank account to pay drivers instantly via ACH. Free standard transfers, 1.5% for instant.</div>
          </div>
          <button onClick={connectBank} disabled={connectLoading}
            style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent3)', color: '#fff', opacity: connectLoading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {connectLoading ? 'Loading...' : 'Connect Bank →'}
          </button>
        </div>
      )}
      {connectStatus?.onboarding_complete && (
        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '10px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <CheckCircle size={16} color="var(--success)" />
          <span style={{ fontWeight: 600, color: 'var(--success)' }}>Bank Connected</span>
          <span style={{ color: 'var(--muted)' }}>— One-click driver payments enabled via Stripe</span>
        </div>
      )}

      {/* Company-wide summary strip */}
      <div style={{ ...ps.panel, padding:'16px 20px', display:'flex', gap:32, flexWrap:'wrap', marginBottom:16 }}>
        {[
          { label:'Total Gross Pay', val: fmtMoney(totalGross), color:'var(--accent)' },
          { label:'Total Net Pay', val: fmtMoney(totalNet), color:'var(--success)' },
          { label:'Total Deductions', val: fmtMoney(totalDeductions), color:'var(--danger)' },
          { label:'Active Drivers', val: String(drivers.length), color:'var(--accent3)' },
          { label:'Pay Periods', val: String(payroll.length), color:'var(--muted)' },
        ].map(s => (
          <div key={s.label} style={{ minWidth:120 }}>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* RUN PAYROLL — full-width flow (no two-panel) */}
      {activeTab === 'run-payroll' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={() => setActiveTab('overview')} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12 }}>← Back</button>
              <div style={{ fontSize:16, fontWeight:700 }}>Run Payroll</div>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background: runStep === 'confirmed' ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', color: runStep === 'confirmed' ? 'var(--success)' : 'var(--accent)' }}>
                {runStep === 'select' ? 'Step 1: Select Period' : runStep === 'review' ? 'Step 2: Review & Approve' : 'Approved'}
              </span>
            </div>
          </div>

          {runStep === 'select' && (
            <div style={{ ...ps.panel, padding:'24px' }}>
              <div style={ps.sectionTitle}>Pay Period</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                {[
                  { id:'this-week', label:'This Week' },{ id:'last-week', label:'Last Week' },
                  { id:'this-month', label:'This Month' },{ id:'last-month', label:'Last Month' },{ id:'custom', label:'Custom Range' },
                ].map(p => (
                  <button key={p.id} onClick={() => setRunPeriod(p.id)} style={{
                    padding:'8px 16px', fontSize:12, fontWeight: runPeriod === p.id ? 700 : 500, borderRadius:8, cursor:'pointer',
                    background: runPeriod === p.id ? 'var(--accent)' : 'var(--bg)', color: runPeriod === p.id ? '#000' : 'var(--text)',
                    border: runPeriod === p.id ? 'none' : '1px solid var(--border)',
                  }}>{p.label}</button>
                ))}
              </div>
              {runPeriod === 'custom' && (
                <div style={{ display:'flex', gap:12, marginBottom:16 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Start Date</div>
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={ps.input} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>End Date</div>
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={ps.input} />
                  </div>
                </div>
              )}
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
                Period: {getDateRange().start.toLocaleDateString()} — {getDateRange().end.toLocaleDateString()} · {runPayrollData.length} driver{runPayrollData.length !== 1 ? 's' : ''} with delivered loads
              </div>
              <button onClick={() => setRunStep('review')} disabled={runPayrollData.length === 0}
                style={{ padding:'10px 24px', fontSize:13, fontWeight:700, background: runPayrollData.length > 0 ? 'var(--accent)' : 'var(--border)', color: runPayrollData.length > 0 ? '#000' : 'var(--muted)', border:'none', borderRadius:10, cursor: runPayrollData.length > 0 ? 'pointer' : 'default' }}>
                Review Settlements ({runPayrollData.length} drivers) →
              </button>
            </div>
          )}

          {runStep === 'review' && (
            <>
              {runPayrollData.map(d => (
                <div key={d.driver.id} style={{ ...ps.panel, padding:'20px 24px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--accent)', color:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800 }}>
                        {d.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700 }}>{d.name}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{fmtPay(d.driver)} · {d.loads.length} loads · {d.totalMiles.toLocaleString()} mi</div>
                      </div>
                    </div>
                    <button onClick={() => downloadSettlement(d)} className="btn btn-ghost" style={{ fontSize:11, padding:'5px 10px' }}>
                      <Ic icon={Download} size={12} /> Settlement
                    </button>
                  </div>
                  {/* Settlement Calculation Breakdown */}
                  <div style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', marginBottom:12, border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Pay Calculation</div>
                    <div style={{ fontSize:13, color:'var(--text)' }}>
                      {d.driver.pay_model === 'permile'
                        ? <>{d.loads.length} loads × {Number(d.totalMiles).toLocaleString()} total miles × <b>${Number(d.driver.pay_rate || 0).toFixed(2)}/mi</b> = <b style={{ color:'var(--success)' }}>{fmtMoney(d.driverPay)}</b></>
                        : d.driver.pay_model === 'flat'
                        ? <>{d.loads.length} loads × <b>${Number(d.driver.pay_rate || 0).toFixed(2)}/load</b> = <b style={{ color:'var(--success)' }}>{fmtMoney(d.driverPay)}</b></>
                        : <>{fmtMoney(d.totalGross)} gross × <b>{Number(d.driver.pay_rate || 28)}%</b> = <b style={{ color:'var(--success)' }}>{fmtMoney(d.driverPay)}</b></>
                      }
                    </div>
                    {d.deductions > 0 && (
                      <div style={{ fontSize:12, color:'var(--danger)', marginTop:4 }}>
                        − {fmtMoney(d.deductions)} deductions = <b style={{ color:'var(--success)' }}>Net {fmtMoney(d.netPay)}</b>
                      </div>
                    )}
                  </div>
                  {/* Load detail table */}
                  <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
                    <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
                      {['Load','Route','Miles','Gross','Driver Pay'].map(h => (
                        <th key={h} style={{ padding:'6px 10px', fontSize:9, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {d.loads.map(l => {
                        let lPay = 0
                        if (d.driver.pay_model === 'permile') lPay = (Number(l.miles)||0) * (Number(d.driver.pay_rate)||0)
                        else if (d.driver.pay_model === 'flat') lPay = Number(d.driver.pay_rate) || 0
                        else lPay = (Number(l.rate)||0) * ((Number(d.driver.pay_rate)||28)/100)
                        return (
                          <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'8px 10px', fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>{l.load_number || l.id?.slice(0,8)}</td>
                            <td style={{ padding:'8px 10px', fontSize:12 }}>{l.origin || '?'} → {l.destination || '?'}</td>
                            <td style={{ padding:'8px 10px', fontSize:12 }}>{Number(l.miles||0).toLocaleString()}</td>
                            <td style={{ padding:'8px 10px', fontSize:12, color:'var(--accent)' }}>{fmtMoney(l.rate)}</td>
                            <td style={{ padding:'8px 10px', fontSize:12, fontWeight:700, color:'var(--success)' }}>{fmtMoney(lPay)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {/* Deductions Breakdown */}
                  {d.deductions > 0 && (
                    <div style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', marginBottom:8, border:'1px solid var(--border)' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>Deductions Breakdown</div>
                      {d.recurringDeductions.map((r, i) => (
                        <div key={'r'+i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0' }}>
                          <span>{r.label} <span style={{ color:'var(--muted)', fontSize:10 }}>(recurring)</span></span>
                          <span style={{ color:'var(--danger)', fontFamily:"'JetBrains Mono',monospace" }}>-{fmtMoney(r.amount)}</span>
                        </div>
                      ))}
                      {d.manualDeductions.map((m, i) => (
                        <div key={'m'+i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0' }}>
                          <span>{m.label || 'Manual Deduction'} <span style={{ color:'var(--muted)', fontSize:10 }}>(one-time)</span></span>
                          <span style={{ color:'var(--danger)', fontFamily:"'JetBrains Mono',monospace" }}>-{fmtMoney(m.amount)}</span>
                        </div>
                      ))}
                      {d.fuelDeductions > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0' }}>
                          <span>Fuel Advances <span style={{ color:'var(--muted)', fontSize:10 }}>({(d.fuelItems || []).length} transactions)</span></span>
                          <span style={{ color:'var(--danger)', fontFamily:"'JetBrains Mono',monospace" }}>-{fmtMoney(d.fuelDeductions)}</span>
                        </div>
                      )}
                      {d.advanceDeductions > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0' }}>
                          <span>Cash Advances <span style={{ color:'var(--muted)', fontSize:10 }}>({(d.advanceItems || []).length} advances)</span></span>
                          <span style={{ color:'var(--danger)', fontFamily:"'JetBrains Mono',monospace" }}>-{fmtMoney(d.advanceDeductions)}</span>
                        </div>
                      )}
                      <div style={{ borderTop:'1px solid var(--border)', marginTop:6, paddingTop:6, display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:700 }}>
                        <span>Total Deductions</span>
                        <span style={{ color:'var(--danger)' }}>-{fmtMoney(d.deductions)}</span>
                      </div>
                    </div>
                  )}
                  {/* Totals */}
                  <div style={{ borderTop:'2px solid var(--border)', paddingTop:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--muted)', marginBottom:4 }}>
                      <span>Gross Driver Pay</span><span>{fmtMoney(d.driverPay)}</span>
                    </div>
                    {d.deductions > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--danger)', marginBottom:4 }}>
                        <span>Total Deductions</span><span>-{fmtMoney(d.deductions)}</span>
                      </div>
                    )}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>Net Pay</span>
                      <span style={{ fontSize:18, fontWeight:800, color:'var(--success)' }}>{fmtMoney(d.netPay)}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display:'flex', gap:12 }}>
                <button onClick={() => setRunStep('select')} className="btn btn-ghost" style={{ fontSize:12 }}>← Back</button>
                <button onClick={approvePayroll} style={{ padding:'12px 28px', fontSize:13, fontWeight:700, background:'var(--success)', color:'#fff', border:'none', borderRadius:10, cursor:'pointer' }}>
                  <Ic icon={CheckCircle} size={15} /> Approve & Create Settlements
                </button>
              </div>
            </>
          )}

          {runStep === 'confirmed' && (
            <div style={{ ...ps.panel, padding:48, textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(34,197,94,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Ic icon={CheckCircle} size={28} color="var(--success)" />
              </div>
              <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Payroll Approved</div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>{runPayrollData.length} settlements created for {getDateRange().start.toLocaleDateString()} — {getDateRange().end.toLocaleDateString()}</div>
              <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                {connectStatus?.onboarding_complete && (
                  <button onClick={async () => {
                    const approved = payroll.filter(p => p.status === 'approved')
                    if (!approved.length) { showToast('','No Settlements','No approved settlements to pay'); return }
                    for (const p of approved) { await payDriver(p.id, 'standard') }
                  }} style={{ padding:'8px 20px', fontSize:12, fontWeight:700, background:'var(--success)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>
                    <Ic icon={DollarSign} size={13} /> Pay All Drivers (ACH)
                  </button>
                )}
                <button onClick={() => { setRunStep('select'); setActiveTab('overview') }} className="btn btn-ghost" style={{ fontSize:12 }}>Back to Overview</button>
                <button onClick={() => { setRunStep('select'); setRunPeriod('this-week') }} style={{ padding:'8px 20px', fontSize:12, fontWeight:600, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>Run Another</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Two-panel layout (all tabs except run-payroll) */}
      {activeTab !== 'run-payroll' && (
        <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16, minHeight:500 }}>

          {/* LEFT: Driver list */}
          <div style={{ ...ps.panel, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ position:'relative' }}>
                <Ic icon={Search} size={14} color="var(--muted)" style={{ position:'absolute', left:10, top:9 }} />
                <input
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search drivers..."
                  style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px 8px 32px', fontSize:12, color:'var(--text)', outline:'none' }}
                />
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {filteredDrivers.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No drivers found</div>
              ) : filteredDrivers.map(d => {
                const name = d.full_name || d.name || 'Unknown'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0,2)
                const isActive = d.id === selectedDriverId
                const dYtd = ytd[d.id] || { gross:0, net:0 }
                return (
                  <div key={d.id} onClick={() => setSelectedDriverId(d.id)}
                    style={{
                      padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10,
                      background: isActive ? 'rgba(240,165,0,0.06)' : 'transparent',
                      borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                      transition:'all 0.15s',
                    }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background: isActive ? 'var(--accent)' : 'var(--border)', color: isActive ? '#000' : 'var(--muted)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>{initials}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight: isActive ? 700 : 500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{fmtPay(d)} · {dYtd.gross > 0 ? fmtMoney(dYtd.gross) + ' YTD' : 'No pay yet'}</div>
                    </div>
                    {(ytd[d.id]?.gross || 0) >= 600 && (
                      <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }} title="1099 Required" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Selected driver detail */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {!selectedDriver ? (
              <div style={{ ...ps.panel, padding:60, textAlign:'center', color:'var(--muted)' }}>
                <Ic icon={Users} size={32} color="var(--muted)" />
                <div style={{ marginTop:12, fontSize:14 }}>Select a driver to view payroll</div>
              </div>
            ) : (
              <>
                {/* Driver header card */}
                <div style={{ ...ps.panel, padding:'20px 24px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--accent)', color:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800 }}>
                        {(selectedDriver.full_name || selectedDriver.name || 'U').split(' ').map(w => w[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <div style={{ fontSize:18, fontWeight:700 }}>{selectedDriver.full_name || selectedDriver.name}</div>
                        <div style={{ fontSize:12, color:'var(--muted)', display:'flex', gap:12, marginTop:2, flexWrap:'wrap' }}>
                          <span>Pay: {fmtPay(selectedDriver)}</span>
                          <span>·</span>
                          <span>{selectedDriver.phone || 'No phone'}</span>
                          <span>·</span>
                          <span style={{ color: selNeeds1099 ? 'var(--accent)' : 'var(--muted)' }}>
                            {selNeeds1099 ? '1099 Required' : '1099 N/A'}
                          </span>
                          {dSelBank.method && (
                            <>
                              <span>·</span>
                              <span style={{ color:'var(--success)' }}>
                                {dSelBank.method === 'direct' ? `ACH ····${dSelBank.last4 || '0000'}` : dSelBank.method === 'check' ? 'Check' : 'Zelle/Venmo'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-ghost" style={{ fontSize:11, padding:'6px 12px' }} onClick={() => {
                        const rows = [['Period','Gross','Deductions','Net','Per Diem','Fuel Adv','Status']]
                        selPayroll.forEach(p => rows.push([
                          `${p.period_start||''} - ${p.period_end||''}`, Number(p.gross_pay||0).toFixed(2), Number(p.deductions||0).toFixed(2),
                          Number(p.net_pay||0).toFixed(2), Number(p.per_diem||0).toFixed(2), Number(p.fuel_advance||0).toFixed(2), p.status||'pending'
                        ]))
                        const csv = rows.map(r=>r.join(',')).join('\n')
                        const blob = new Blob([csv],{type:'text/csv'})
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href=url; a.download=`settlement-${(selectedDriver.full_name||'driver').replace(/\s/g,'-')}.csv`; a.click()
                        URL.revokeObjectURL(url)
                        showToast('','Downloaded','Settlement exported')
                      }}><Ic icon={Download} size={13} /> Export</button>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)' }}>
                  {[{id:'overview',label:'Overview'},{id:'settlements',label:'Settlements'},{id:'bank',label:'Bank & Payment'},{id:'deductions',label:'Deductions'},{id:'escrow',label:'Escrow'},{id:'fuel-card',label:'Fuel Card'},{id:'advances',label:'Advances'},{id:'1099',label:'1099'}].map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                      padding:'10px 16px', fontSize:12, fontWeight: activeTab === t.id ? 700 : 500, cursor:'pointer', border:'none', background:'none',
                      color: activeTab === t.id ? 'var(--accent)' : 'var(--muted)',
                      borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                      transition:'all 0.15s',
                    }}>{t.label}</button>
                  ))}
                </div>

                {activeTab === 'overview' && (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:12 }}>
                      {[
                        { label:'YTD Gross', val: fmtMoney(selYtd.gross), sub:`${selYtd.loads} loads · ${selYtd.miles.toLocaleString()} mi`, color:'var(--accent)' },
                        { label:'YTD Net', val: fmtMoney(selYtd.net), sub:'After deductions', color:'var(--success)' },
                        { label:'YTD Deductions', val: fmtMoney(selYtd.deductions), sub:`Per diem: ${fmtMoney(selYtd.perDiem)}`, color:'var(--danger)' },
                        { label:'Escrow Balance', val: fmtMoney(escrowBalances[selectedDriverId] || 0), sub:'Reserve fund held', color:'var(--accent3)' },
                        { label:'Fuel Card Pending', val: fmtMoney(fuelPending[selectedDriverId]?.total || 0), sub:`${fuelPending[selectedDriverId]?.items?.length || 0} transactions`, color:'var(--accent4)' },
                        { label:'Advances Owed', val: fmtMoney(advancePending[selectedDriverId]?.total || 0), sub:`${advancePending[selectedDriverId]?.items?.length || 0} outstanding`, color:'var(--warning)' },
                      ].map(c => (
                        <div key={c.label} style={{ ...ps.panel, padding:'16px 20px' }}>
                          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>{c.label}</div>
                          <div style={{ fontSize:22, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{c.sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ ...ps.panel, padding:'20px 24px' }}>
                      <div style={ps.sectionTitle}>Compensation Breakdown</div>
                      {[
                        { label:'Gross Revenue (Driver Share)', val: fmtMoney(selYtd.gross), color:'var(--accent)' },
                        { label:'Deductions', val: selYtd.deductions > 0 ? `-${fmtMoney(selYtd.deductions)}` : '$0.00', color:'var(--danger)' },
                        { label:'Per Diem Allowance', val: fmtMoney(selYtd.perDiem), color:'var(--text)' },
                        { label:'Fuel Advances', val: selYtd.fuel > 0 ? `-${fmtMoney(selYtd.fuel)}` : '$0.00', color:'var(--danger)' },
                      ].map((r, i, arr) => (
                        <div key={r.label} style={i < arr.length - 1 ? ps.row : ps.rowLast}>
                          <span style={ps.label}>{r.label}</span>
                          <span style={{ ...ps.value, color: r.color }}>{r.val}</span>
                        </div>
                      ))}
                      <div style={{ borderTop:'2px solid var(--border)', marginTop:8, paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:14, fontWeight:700 }}>Net Pay (YTD)</span>
                        <span style={{ fontSize:20, fontWeight:800, color:'var(--success)' }}>{fmtMoney(selYtd.net)}</span>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'settlements' && (
                  <div style={{ ...ps.panel, overflow:'hidden' }}>
                    {selPayroll.length === 0 ? (
                      <div style={{ padding:48, textAlign:'center' }}>
                        <Ic icon={Calendar} size={28} color="var(--muted)" />
                        <div style={{ marginTop:10, fontSize:13, color:'var(--muted)' }}>No settlement periods yet</div>
                        <button onClick={() => { setActiveTab('run-payroll'); setRunStep('select') }} style={{ marginTop:12, padding:'8px 20px', fontSize:12, fontWeight:600, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>Run First Payroll</button>
                      </div>
                    ) : (
                      <table style={{ width:'100%', borderCollapse:'collapse' }}>
                        <thead>
                          <tr style={{ background:'var(--bg)' }}>
                            {['Period','Loads','Miles','Gross Pay','Deductions','Net Pay','Status',''].map(h => (
                              <th key={h} style={{ padding:'10px 14px', fontSize:9, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid var(--border)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selPayroll.map((p, i) => {
                            const statusColors = { paid: { bg:'rgba(34,197,94,0.1)', text:'var(--success)' }, approved: { bg:'rgba(240,165,0,0.1)', text:'var(--accent)' } }
                            const sc = statusColors[p.status] || { bg:'rgba(74,85,112,0.1)', text:'var(--muted)' }
                            return (
                              <tr key={p.id || i} style={{ borderBottom:'1px solid var(--border)' }}>
                                <td style={{ padding:'12px 14px', fontSize:12, fontWeight:600 }}>{fmtDate(p.period_start)} — {fmtDate(p.period_end)}</td>
                                <td style={{ padding:'12px 14px', fontSize:12 }}>{p.loads_completed || 0}</td>
                                <td style={{ padding:'12px 14px', fontSize:12 }}>{Number(p.miles_driven||0).toLocaleString()}</td>
                                <td style={{ padding:'12px 14px', fontSize:13, fontWeight:700, color:'var(--accent)' }}>{fmtMoney(p.gross_pay)}</td>
                                <td style={{ padding:'12px 14px', fontSize:12, color:'var(--danger)' }}>-{fmtMoney(p.deductions)}</td>
                                <td style={{ padding:'12px 14px', fontSize:13, fontWeight:700, color:'var(--success)' }}>{fmtMoney(p.net_pay)}</td>
                                <td style={{ padding:'12px 14px' }}>
                                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background: sc.bg, color: sc.text, textTransform:'capitalize' }}>{p.status || 'pending'}</span>
                                </td>
                                <td style={{ padding:'12px 14px' }}>
                                  {p.status === 'approved' && connectStatus?.onboarding_complete && (
                                    <div style={{ display:'flex', gap:4 }}>
                                      <button onClick={() => payDriver(p.id, 'standard')} disabled={payingDriverId === p.id}
                                        style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:6, background:'rgba(34,197,94,0.15)', color:'var(--success)', border:'none', cursor:'pointer' }}>
                                        {payingDriverId === p.id ? '...' : 'Pay ACH'}
                                      </button>
                                      <button onClick={() => payDriver(p.id, 'instant')} disabled={payingDriverId === p.id}
                                        style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:6, background:'rgba(240,165,0,0.15)', color:'var(--accent)', border:'none', cursor:'pointer' }}
                                        title={`Instant: $${(Number(p.net_pay||0)*0.015).toFixed(2)} fee`}>
                                        {payingDriverId === p.id ? '...' : '⚡ Instant'}
                                      </button>
                                    </div>
                                  )}
                                  {p.status === 'approved' && !connectStatus?.onboarding_complete && (
                                    <button onClick={async () => {
                                      await db.updatePayroll(p.id, { status: 'paid' })
                                      setPayroll(prev => prev.map(pp => pp.id === p.id ? { ...pp, status: 'paid' } : pp))
                                      showToast('','Marked Paid','Settlement marked as paid (manual)')
                                    }} style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:6, background:'rgba(34,197,94,0.1)', color:'var(--success)', border:'none', cursor:'pointer' }}>Mark Paid</button>
                                  )}
                                  {p.payment_status === 'in_transit' && <span style={{ fontSize:10, color:'var(--accent3)', fontWeight:600 }}>⏳ In Transit</span>}
                                  {p.payment_status === 'paid' && <span style={{ fontSize:10, color:'var(--success)', fontWeight:600 }}>✓ Deposited</span>}
                                  {p.payment_status === 'failed' && (
                                    <button onClick={() => payDriver(p.id, 'standard')} style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:6, background:'rgba(239,68,68,0.15)', color:'var(--danger)', border:'none', cursor:'pointer' }}>
                                      Retry
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {activeTab === 'bank' && (
                  <div style={{ ...ps.panel, padding:'24px' }}>
                    <div style={ps.sectionTitle}>Payment Method</div>
                    <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                      {[
                        { id:'direct', label:'Direct Deposit (ACH)', icon: CreditCard },
                        { id:'check', label:'Paper Check', icon: FileText },
                        { id:'other', label:'Zelle / Venmo / Other', icon: Send },
                      ].map(m => (
                        <button key={m.id} onClick={() => saveBankInfo(selectedDriverId, { ...dSelBank, method: m.id })} style={{
                          flex:1, padding:'14px', borderRadius:10, cursor:'pointer', textAlign:'center',
                          background: dSelBank.method === m.id ? 'rgba(240,165,0,0.08)' : 'var(--bg)',
                          border: dSelBank.method === m.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                        }}>
                          <Ic icon={m.icon} size={20} color={dSelBank.method === m.id ? 'var(--accent)' : 'var(--muted)'} />
                          <div style={{ fontSize:11, fontWeight: dSelBank.method === m.id ? 700 : 500, marginTop:6, color: dSelBank.method === m.id ? 'var(--accent)' : 'var(--text)' }}>{m.label}</div>
                        </button>
                      ))}
                    </div>

                    {dSelBank.method === 'direct' && (
                      <>
                        <div style={ps.sectionTitle}>Bank Account Details</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                          <div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Bank Name</div>
                            <input value={dSelBank.bankName || ''} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, bankName: e.target.value })} placeholder="Chase, Wells Fargo..." style={ps.input} />
                          </div>
                          <div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Account Type</div>
                            <select value={dSelBank.accountType || 'checking'} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, accountType: e.target.value })} style={ps.input}>
                              <option value="checking">Checking</option>
                              <option value="savings">Savings</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                          <div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Routing Number</div>
                            <input value={dSelBank.routing || ''} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, routing: e.target.value })} placeholder="9 digits" maxLength={9} style={ps.input} />
                          </div>
                          <div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Account Number (last 4)</div>
                            <input value={dSelBank.last4 || ''} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, last4: e.target.value })} placeholder="Last 4 digits" maxLength={4} style={ps.input} />
                          </div>
                        </div>
                        <div style={{ padding:'10px 14px', background:'rgba(34,197,94,0.06)', borderRadius:8, border:'1px solid rgba(34,197,94,0.15)', fontSize:11, color:'var(--success)', display:'flex', alignItems:'center', gap:8 }}>
                          <Ic icon={Shield} size={14} /> Bank details are encrypted and stored securely in your Supabase database with row-level security.
                        </div>
                      </>
                    )}

                    {dSelBank.method === 'other' && (
                      <div>
                        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Payment Details (Zelle email/phone, Venmo handle, etc.)</div>
                        <input value={dSelBank.otherDetails || ''} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, otherDetails: e.target.value })} placeholder="e.g., @driver-venmo or driver@email.com" style={ps.input} />
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'deductions' && (
                  <div style={{ ...ps.panel, padding:'24px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <div>
                        <div style={ps.sectionTitle}>Recurring Deductions</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:-8 }}>Automatically applied each pay period</div>
                      </div>
                      <button onClick={() => {
                        const updated = [...dSelRecurring, { label: '', amount: 0, type: 'flat' }]
                        saveRecurringDeduction(selectedDriverId, updated)
                      }} style={{ padding:'6px 14px', fontSize:11, fontWeight:700, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>
                        <Ic icon={Plus} size={12} /> Add Deduction
                      </button>
                    </div>

                    {dSelRecurring.length === 0 ? (
                      <div style={{ padding:32, textAlign:'center', background:'var(--bg)', borderRadius:10, color:'var(--muted)', fontSize:12 }}>
                        No recurring deductions configured. Add items like insurance, escrow, phone, or equipment lease.
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {dSelRecurring.map((d, i) => (
                          <div key={i} style={{ display:'flex', gap:10, alignItems:'center', background:'var(--bg)', padding:'10px 14px', borderRadius:10 }}>
                            <div style={{ flex:2 }}>
                              <input value={d.label} onChange={e => {
                                const updated = [...dSelRecurring]; updated[i] = { ...d, label: e.target.value }
                                saveRecurringDeduction(selectedDriverId, updated)
                              }} placeholder="e.g., Health Insurance, Phone, Escrow" style={{ ...ps.input, background:'var(--surface)' }} />
                            </div>
                            <div style={{ flex:1 }}>
                              <input type="number" value={d.amount || ''} onChange={e => {
                                const updated = [...dSelRecurring]; updated[i] = { ...d, amount: e.target.value }
                                saveRecurringDeduction(selectedDriverId, updated)
                              }} placeholder="Amount" style={{ ...ps.input, background:'var(--surface)' }} />
                            </div>
                            <select value={d.type || 'flat'} onChange={e => {
                              const updated = [...dSelRecurring]; updated[i] = { ...d, type: e.target.value }
                              saveRecurringDeduction(selectedDriverId, updated)
                            }} style={{ ...ps.input, background:'var(--surface)', width:100 }}>
                              <option value="flat">$/period</option>
                              <option value="percent">% of gross</option>
                            </select>
                            <button onClick={() => {
                              const updated = dSelRecurring.filter((_, j) => j !== i)
                              saveRecurringDeduction(selectedDriverId, updated)
                            }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:4 }}>
                              <Ic icon={Trash2} size={14} />
                            </button>
                          </div>
                        ))}
                        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', justifyContent:'space-between', fontSize:12 }}>
                          <span style={{ color:'var(--muted)' }}>Total per period</span>
                          <span style={{ fontWeight:700, color:'var(--danger)' }}>-{fmtMoney(dSelRecurring.reduce((s, d) => s + (Number(d.amount) || 0), 0))}</span>
                        </div>
                      </div>
                    )}

                    {/* Common deduction templates */}
                    <div style={{ marginTop:20 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Quick Add</div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {[
                          { label:'Health Insurance', amount:200 },{ label:'Phone/ELD', amount:25 },{ label:'Escrow', amount:100 },
                          { label:'Equipment Lease', amount:500 },{ label:'Cargo Insurance', amount:50 },{ label:'Occupational Accident', amount:40 },
                        ].map(t => (
                          <button key={t.label} onClick={() => {
                            const updated = [...dSelRecurring, { label: t.label, amount: t.amount, type: 'flat' }]
                            saveRecurringDeduction(selectedDriverId, updated)
                          }} style={{ padding:'5px 12px', fontSize:10, fontWeight:600, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', color:'var(--text)' }}>
                            + {t.label} (${t.amount})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ESCROW TAB ── */}
                {activeTab === 'escrow' && (() => {
                  const selEscrow = escrowTxns.filter(t => t.driver_id === selectedDriverId)
                  const balance = escrowBalances[selectedDriverId] || 0
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                      <div style={{ ...ps.panel, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', fontWeight:600, letterSpacing:1 }}>Escrow Balance</div>
                          <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", color: balance > 0 ? 'var(--accent3)' : 'var(--muted)' }}>{fmtMoney(balance)}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>Reserve fund held for {selectedDriver?.full_name || selectedDriver?.name}</div>
                        </div>
                        <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 16px' }} onClick={() => setShowEscrowRelease(true)}>Release Funds</button>
                      </div>
                      {showEscrowRelease && (
                        <div style={{ ...ps.panel, padding:'16px 20px' }}>
                          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Release Escrow Funds</div>
                          <form onSubmit={async e => {
                            e.preventDefault()
                            const fd = new FormData(e.target)
                            const amt = Number(fd.get('amount'))
                            if (!amt || amt <= 0) { showToast('error','Error','Enter a valid amount'); return }
                            if (amt > balance) { showToast('error','Error','Cannot release more than balance'); return }
                            try {
                              const txn = await db.createEscrowTransaction({ driver_id: selectedDriverId, type: 'release', amount: amt, description: fd.get('description') || 'Manual release' })
                              setEscrowTxns(prev => [txn, ...prev])
                              setShowEscrowRelease(false)
                              showToast('success','Released',`${fmtMoney(amt)} released from escrow`)
                              e.target.reset()
                            } catch (err) { showToast('error','Error',err.message) }
                          }} style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                            <div style={{ flex:1 }}>
                              <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Amount</label>
                              <input name="amount" type="number" step="0.01" max={balance} placeholder="0.00" className="form-input" style={{ width:'100%' }} required />
                            </div>
                            <div style={{ flex:2 }}>
                              <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Reason</label>
                              <input name="description" placeholder="e.g. Maintenance reimbursement" className="form-input" style={{ width:'100%' }} />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ fontSize:12, padding:'8px 14px' }}>Release</button>
                            <button type="button" className="btn btn-ghost" style={{ fontSize:12, padding:'8px 14px' }} onClick={() => setShowEscrowRelease(false)}>Cancel</button>
                          </form>
                        </div>
                      )}
                      <div style={ps.panel}>
                        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Transaction History</div>
                        {selEscrow.length === 0 ? (
                          <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No escrow transactions yet. Add an "Escrow" recurring deduction to auto-hold funds each payroll.</div>
                        ) : (
                          <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                              <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
                                <th style={ps.th}>Date</th><th style={ps.th}>Type</th><th style={ps.th}>Amount</th><th style={ps.th}>Description</th>
                              </tr></thead>
                              <tbody>{selEscrow.map(t => (
                                <tr key={t.id} style={{ borderBottom:'1px solid var(--border)' }}>
                                  <td style={ps.td}>{new Date(t.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                                  <td style={ps.td}><span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:5, background: t.type==='hold' ? 'rgba(77,142,240,0.1)' : 'rgba(34,197,94,0.1)', color: t.type==='hold' ? 'var(--accent3)' : 'var(--success)' }}>{t.type === 'hold' ? 'Hold' : 'Release'}</span></td>
                                  <td style={{ ...ps.td, fontWeight:700, color: t.type==='hold' ? 'var(--accent3)' : 'var(--success)' }}>{t.type==='hold' ? '+' : '-'}{fmtMoney(t.amount)}</td>
                                  <td style={{ ...ps.td, color:'var(--muted)' }}>{t.description || '—'}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* ── FUEL CARD TAB ── */}
                {activeTab === 'fuel-card' && (() => {
                  const selFuel = fuelCardTxns.filter(f => f.driver_id === selectedDriverId)
                  const pending = fuelPending[selectedDriverId]?.total || 0
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                      <div style={{ ...ps.panel, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', fontWeight:600, letterSpacing:1 }}>Pending Fuel Deductions</div>
                          <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", color: pending > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtMoney(pending)}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>Will be deducted from next settlement</div>
                        </div>
                        <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 16px' }} onClick={() => setShowFuelForm(true)}>+ Add Purchase</button>
                      </div>
                      {showFuelForm && (
                        <div style={{ ...ps.panel, padding:'16px 20px' }}>
                          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Log Fuel Card Purchase</div>
                          <form onSubmit={async e => {
                            e.preventDefault()
                            const fd = new FormData(e.target)
                            const amt = Number(fd.get('amount'))
                            if (!amt) { showToast('error','Error','Enter an amount'); return }
                            try {
                              const txn = await db.createFuelCardTransaction({
                                driver_id: selectedDriverId, transaction_date: fd.get('date') || new Date().toISOString().slice(0,10),
                                station: fd.get('station'), gallons: Number(fd.get('gallons')) || null, amount: amt,
                                city: fd.get('city'), state: fd.get('state'), notes: fd.get('notes'),
                              })
                              setFuelCardTxns(prev => [txn, ...prev])
                              setShowFuelForm(false)
                              showToast('success','Added',`${fmtMoney(amt)} fuel purchase logged`)
                              e.target.reset()
                            } catch (err) { showToast('error','Error',err.message) }
                          }} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                            <div><label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Date *</label><input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="form-input" style={{ width:'100%' }} required /></div>
                            <div><label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Station</label><input name="station" placeholder="e.g. Pilot, Love's" className="form-input" style={{ width:'100%' }} /></div>
                            <div><label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Amount *</label><input name="amount" type="number" step="0.01" placeholder="0.00" className="form-input" style={{ width:'100%' }} required /></div>
                            <div><label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Gallons</label><input name="gallons" type="number" step="0.001" placeholder="0.000" className="form-input" style={{ width:'100%' }} /></div>
                            <div><label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>City</label><input name="city" placeholder="City" className="form-input" style={{ width:'100%' }} /></div>
                            <div><label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>State</label><input name="state" placeholder="ST" maxLength={2} className="form-input" style={{ width:'100%' }} /></div>
                            <div style={{ gridColumn:'span 3', display:'flex', gap:10 }}>
                              <button type="submit" className="btn btn-primary" style={{ fontSize:12, padding:'8px 14px' }}>Save</button>
                              <button type="button" className="btn btn-ghost" style={{ fontSize:12, padding:'8px 14px' }} onClick={() => setShowFuelForm(false)}>Cancel</button>
                            </div>
                          </form>
                        </div>
                      )}
                      <div style={ps.panel}>
                        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Fuel Card History</div>
                        {selFuel.length === 0 ? (
                          <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No fuel card transactions. Click "Add Purchase" to log fuel card purchases for auto-deduction.</div>
                        ) : (
                          <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                              <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
                                <th style={ps.th}>Date</th><th style={ps.th}>Station</th><th style={ps.th}>Gallons</th><th style={ps.th}>Amount</th><th style={ps.th}>Status</th>
                              </tr></thead>
                              <tbody>{selFuel.map(f => (
                                <tr key={f.id} style={{ borderBottom:'1px solid var(--border)' }}>
                                  <td style={ps.td}>{new Date(f.transaction_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                                  <td style={ps.td}>{f.station || '—'}{f.city ? `, ${f.city}` : ''}{f.state ? ` ${f.state}` : ''}</td>
                                  <td style={ps.td}>{f.gallons ? Number(f.gallons).toFixed(1) : '—'}</td>
                                  <td style={{ ...ps.td, fontWeight:700 }}>{fmtMoney(f.amount)}</td>
                                  <td style={ps.td}><span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:5, background: f.deducted_in_payroll_id ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', color: f.deducted_in_payroll_id ? 'var(--success)' : 'var(--accent)' }}>{f.deducted_in_payroll_id ? 'Deducted' : 'Pending'}</span></td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* ── ADVANCES TAB ── */}
                {activeTab === 'advances' && (() => {
                  const selAdv = advances.filter(a => a.driver_id === selectedDriverId)
                  const outstanding = advancePending[selectedDriverId]?.total || 0
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                      <div style={{ ...ps.panel, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', fontWeight:600, letterSpacing:1 }}>Outstanding Advances</div>
                          <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", color: outstanding > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtMoney(outstanding)}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>Will be deducted from next settlement</div>
                        </div>
                        <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 16px' }} onClick={() => setShowAdvanceForm(true)}>+ Give Advance</button>
                      </div>
                      {showAdvanceForm && (
                        <div style={{ ...ps.panel, padding:'16px 20px' }}>
                          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Record Cash Advance</div>
                          <form onSubmit={async e => {
                            e.preventDefault()
                            const fd = new FormData(e.target)
                            const amt = Number(fd.get('amount'))
                            if (!amt) { showToast('error','Error','Enter an amount'); return }
                            try {
                              const adv = await db.createAdvance({
                                driver_id: selectedDriverId, amount: amt, type: 'advance',
                                description: fd.get('description') || 'Cash advance',
                                advance_date: fd.get('date') || new Date().toISOString().slice(0,10),
                              })
                              setAdvances(prev => [adv, ...prev])
                              setShowAdvanceForm(false)
                              showToast('success','Advance Recorded',`${fmtMoney(amt)} advance to ${selectedDriver?.full_name || selectedDriver?.name}`)
                              e.target.reset()
                            } catch (err) { showToast('error','Error',err.message) }
                          }} style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                            <div style={{ flex:1 }}>
                              <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Amount *</label>
                              <input name="amount" type="number" step="0.01" placeholder="0.00" className="form-input" style={{ width:'100%' }} required />
                            </div>
                            <div style={{ flex:1 }}>
                              <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Date</label>
                              <input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="form-input" style={{ width:'100%' }} />
                            </div>
                            <div style={{ flex:2 }}>
                              <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:3 }}>Description</label>
                              <input name="description" placeholder="e.g. Per diem advance, emergency funds" className="form-input" style={{ width:'100%' }} />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ fontSize:12, padding:'8px 14px' }}>Save</button>
                            <button type="button" className="btn btn-ghost" style={{ fontSize:12, padding:'8px 14px' }} onClick={() => setShowAdvanceForm(false)}>Cancel</button>
                          </form>
                        </div>
                      )}
                      <div style={ps.panel}>
                        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Advance History</div>
                        {selAdv.length === 0 ? (
                          <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No advances recorded. Click "Give Advance" to log cash advances that will be auto-deducted from settlements.</div>
                        ) : (
                          <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                              <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
                                <th style={ps.th}>Date</th><th style={ps.th}>Description</th><th style={ps.th}>Amount</th><th style={ps.th}>Type</th><th style={ps.th}>Status</th>
                              </tr></thead>
                              <tbody>{selAdv.map(a => (
                                <tr key={a.id} style={{ borderBottom:'1px solid var(--border)' }}>
                                  <td style={ps.td}>{new Date(a.advance_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                                  <td style={ps.td}>{a.description || '—'}</td>
                                  <td style={{ ...ps.td, fontWeight:700, color: a.type==='advance' ? 'var(--danger)' : 'var(--success)' }}>{a.type==='advance' ? '-' : '+'}{fmtMoney(a.amount)}</td>
                                  <td style={ps.td}><span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:5, background: a.type==='advance' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: a.type==='advance' ? 'var(--danger)' : 'var(--success)' }}>{a.type === 'advance' ? 'Advance' : 'Repayment'}</span></td>
                                  <td style={ps.td}><span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:5, background: a.deducted_in_payroll_id ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', color: a.deducted_in_payroll_id ? 'var(--success)' : 'var(--accent)' }}>{a.deducted_in_payroll_id ? 'Deducted' : 'Pending'}</span></td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {activeTab === '1099' && (
                  <div style={{ ...ps.panel, padding:'24px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background: selNeeds1099 ? 'rgba(240,165,0,0.1)' : 'rgba(74,85,112,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Ic icon={FileText} size={18} color={selNeeds1099 ? 'var(--accent)' : 'var(--muted)'} />
                      </div>
                      <div>
                        <div style={{ fontSize:16, fontWeight:700 }}>1099-NEC Status</div>
                        <div style={{ fontSize:12, color:'var(--muted)' }}>Tax year {new Date().getFullYear()}</div>
                      </div>
                      <div style={{ marginLeft:'auto' }}>
                        <span style={{
                          fontSize:11, fontWeight:700, padding:'5px 14px', borderRadius:20,
                          background: selNeeds1099 ? 'rgba(240,165,0,0.15)' : 'rgba(34,197,94,0.1)',
                          color: selNeeds1099 ? 'var(--accent)' : 'var(--success)',
                        }}>{selNeeds1099 ? '1099 Required' : 'Under Threshold'}</span>
                      </div>
                    </div>
                    <div style={{ background:'var(--bg)', borderRadius:10, padding:'16px 20px', marginBottom:16 }}>
                      {[
                        { label:'Total Compensation', val: fmtMoney(selYtd.gross) },
                        { label:'1099 Threshold', val: '$600.00' },
                        { label: selNeeds1099 ? 'Amount Over Threshold' : 'Remaining Before Threshold', val: selNeeds1099 ? fmtMoney(selYtd.gross - 600) : fmtMoney(600 - selYtd.gross) },
                      ].map((r, i, arr) => (
                        <div key={r.label} style={i < arr.length - 1 ? ps.row : ps.rowLast}>
                          <span style={ps.label}>{r.label}</span>
                          <span style={ps.value}>{r.val}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
                      {selNeeds1099
                        ? `A 1099-NEC must be issued to ${selectedDriver.full_name || selectedDriver.name} by January 31, ${new Date().getFullYear() + 1} for non-employee compensation totaling ${fmtMoney(selYtd.gross)}.`
                        : `${selectedDriver.full_name || selectedDriver.name} has earned ${fmtMoney(selYtd.gross)} YTD. A 1099-NEC is only required if total compensation reaches $600 or more.`
                      }
                    </div>
                    {selNeeds1099 && (
                      <button className="btn btn-primary" style={{ marginTop:16, padding:'10px 20px', fontSize:13 }} onClick={() => {
                        generate1099NECPDF(
                          { name: selectedDriver.full_name || selectedDriver.name, address: selectedDriver.address || '', tax_id_last4: selectedDriver.tax_id_last4 || '' },
                          new Date().getFullYear(),
                          selYtd.gross,
                        )
                        showToast('','Downloaded',`1099-NEC PDF for ${selectedDriver.full_name || selectedDriver.name}`)
                      }}>
                        <Ic icon={Download} size={14} /> Download 1099-NEC PDF
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
