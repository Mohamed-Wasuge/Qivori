import React, { useState, useEffect, useRef } from 'react'
import {
  DollarSign, TrendingUp, CheckCircle, Package, Truck, AlertTriangle, AlertCircle,
  CreditCard, BarChart2, Users, Shield, Zap, Layers, FileText, Activity, Radio,
  ArrowUpRight, ArrowDownRight, Bot, Plus, Fuel, Target, Clock, Brain, Bell, ChevronRight, Play
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { Ic } from './shared'
import { Settings as SettingsIcon } from 'lucide-react'

// ── Overview tab content ───────────────────────────────────────────────────────
// Alerts are generated dynamically from real data below
export const STATUS_DOT = { 'In Transit':'var(--success)', 'Loaded':'var(--accent2)', 'Assigned to Driver':'var(--accent)', 'En Route to Pickup':'var(--accent2)', 'Rate Con Received':'var(--accent)', 'Available':'var(--muted)' }

// ── Animated counter hook ─────────────────────────────────────────────────────
export function useAnimatedNumber(target, duration = 900) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    const start = val
    const diff = target - start
    if (diff === 0) return
    const t0 = performance.now()
    const step = (now) => {
      const p = Math.min((now - t0) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setVal(Math.round(start + diff * ease))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target])
  return val
}

// ── Live clock ────────────────────────────────────────────────────────────────
export function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const h = now.getHours()
  const isMarketHours = h >= 6 && h < 20 // freight moves 6AM-8PM
  const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true })
  const dayStr = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background: isMarketHours ? 'var(--success)' : 'var(--muted)', boxShadow: isMarketHours ? '0 0 8px var(--success)' : 'none' }} />
      <div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:600, letterSpacing:1, color:'var(--text)' }}>{timeStr}</div>
        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>{dayStr} · {isMarketHours ? 'MARKET OPEN' : 'AFTER HOURS'}</div>
      </div>
    </div>
  )
}

// ── Fuel ticker ───────────────────────────────────────────────────────────────
export function FuelTicker() {
  const [prices, setPrices] = useState([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function fetchDiesel() {
      try {
        const res = await fetch('/api/diesel-prices')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.prices?.length > 0) {
          const valid = data.prices.filter(p => p.price > 0)
          if (valid.length > 0) setPrices(valid)
        }
      } catch { /* non-critical: diesel price fetch failed */ }
    }
    fetchDiesel()
    // Re-fetch every 2 hours
    const interval = setInterval(fetchDiesel, 2 * 60 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (prices.length === 0) return
    const t = setInterval(() => setIdx(i => (i+1) % prices.length), 4000)
    return () => clearInterval(t)
  }, [prices.length])

  if (prices.length === 0) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)', minWidth:0, flexShrink:1 }}>
        <Ic icon={Fuel} size={14} color="var(--accent)" />
        <div>
          <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700, letterSpacing:1 }}>US AVG DIESEL</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:'var(--muted)' }}>—</div>
        </div>
      </div>
    )
  }

  const p = prices[idx % prices.length]
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)', minWidth:150 }}>
      <Ic icon={Fuel} size={14} color="var(--accent)" />
      <div>
        <div style={{ fontSize:8, color:'var(--muted)', fontWeight:700, letterSpacing:0.5, whiteSpace:'nowrap' }}>{p.region} DIESEL</div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:'var(--text)' }}>${p.price.toFixed(2)}</span>
          {p.change !== 0 && (
            <span style={{ fontSize:10, fontWeight:700, color: p.change < 0 ? 'var(--success)' : 'var(--danger)', display:'flex', alignItems:'center', gap:1 }}>
              <Ic icon={p.change < 0 ? ArrowDownRight : ArrowUpRight} size={10} />{Math.abs(p.change).toFixed(3)}
            </span>
          )}
        </div>
        {p.period && <div style={{ fontSize:8, color:'var(--muted)', marginTop:1 }}>Week of {p.period}</div>}
      </div>
    </div>
  )
}

// ── Greeting helper ───────────────────────────────────────────────────────────
export function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function RevenueGoalWidget({ company, deliveredLoads, invoices, totalRevenue, editingGoal, setEditingGoal, goalInput, setGoalInput, updateCompany, showToast, pan }) {
  const weeklyGoal = company?.revenue_goal_weekly || 0
  const monthlyGoal = company?.revenue_goal_monthly || 0
  const goalType = company?.revenue_goal_type || 'weekly'
  const activeGoal = goalType === 'weekly' ? weeklyGoal : monthlyGoal

  const now = new Date()
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodStart = goalType === 'weekly' ? startOfWeek : startOfMonth

  const periodRevenue = (deliveredLoads || [])
    .filter(l => { const d = new Date(l.delivery_date || l.created_at || 0); return d >= periodStart })
    .reduce((s, l) => s + (l.gross || l.rate_total || 0), 0)
    + (invoices || [])
    .filter(i => i.status === 'Paid' && new Date(i.paid_date || i.created_at || 0) >= periodStart)
    .reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)

  const currentRev = periodRevenue || totalRevenue || 0
  const pct = activeGoal > 0 ? Math.min(Math.round((currentRev / activeGoal) * 100), 100) : 0
  const remaining = Math.max(activeGoal - currentRev, 0)

  const avgGross = (deliveredLoads || []).length > 0 ? (deliveredLoads || []).reduce((s, l) => s + (l.gross || 0), 0) / deliveredLoads.length : 2500
  const loadsNeeded = remaining > 0 ? Math.ceil(remaining / avgGross) : 0

  const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 7)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const periodEnd = goalType === 'weekly' ? endOfWeek : endOfMonth
  const daysLeft = Math.max(Math.ceil((periodEnd - now) / 86400000), 0)

  const getMessage = () => {
    if (activeGoal === 0) return 'Set a revenue target to track your progress'
    if (pct >= 100) return 'Goal crushed! You hit your target'
    if (pct >= 75) return `Almost there! $${remaining.toLocaleString()} to go`
    if (pct >= 50) return `On track — ${loadsNeeded} more load${loadsNeeded !== 1 ? 's' : ''} to hit your target`
    if (pct >= 25) return `Keep pushing — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left this ${goalType === 'weekly' ? 'week' : 'month'}`
    return `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left — let's find ${loadsNeeded} load${loadsNeeded !== 1 ? 's' : ''}`
  }

  const barColor = pct >= 100 ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : 'var(--warning)'

  const saveGoal = () => {
    const val = parseFloat(goalInput)
    if (!val || val <= 0) return
    const updates = goalType === 'weekly'
      ? { revenue_goal_weekly: val, revenue_goal_type: goalType }
      : { revenue_goal_monthly: val, revenue_goal_type: goalType }
    updateCompany(updates)
    setEditingGoal(false)
    if (showToast) showToast(`${goalType === 'weekly' ? 'Weekly' : 'Monthly'} goal set to $${val.toLocaleString()}`)
  }

  return (
    <div style={{ ...pan, overflow: 'hidden', position: 'relative' }}>
      {pct >= 100 && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(52,176,104,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />}

      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.5 }}>
          <Ic icon={Target} size={13} color={pct >= 100 ? 'var(--success)' : 'var(--accent)'} />
          REVENUE GOAL
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {activeGoal > 0 && !editingGoal && (
            <select value={goalType} onChange={e => updateCompany({ revenue_goal_type: e.target.value })}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 9, padding: '2px 4px', cursor: 'pointer' }}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => { setEditingGoal(!editingGoal); setGoalInput(String(activeGoal || '')) }}>
            {activeGoal > 0 ? 'Edit' : 'Set Goal'}
          </button>
        </div>
      </div>

      {editingGoal ? (
        <div style={{ padding: '14px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={goalType} onChange={e => updateCompany({ revenue_goal_type: e.target.value })}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '6px 8px' }}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 120 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>$</span>
            <input type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveGoal()}
              placeholder={goalType === 'weekly' ? '5000' : '20000'}
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, padding: '6px 8px 6px 22px', fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={saveGoal}>Save</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditingGoal(false)}>Cancel</button>
        </div>
      ) : activeGoal > 0 ? (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div>
              <span style={{ fontFamily: "'JetBrains Mono','Bebas Neue',monospace", fontSize: 28, color: pct >= 100 ? 'var(--success)' : 'var(--accent)', fontWeight: 700, lineHeight: 1 }}>
                ${currentRev.toLocaleString()}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>
                / ${activeGoal.toLocaleString()}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: barColor, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{goalType === 'weekly' ? 'this week' : 'this month'}</div>
            </div>
          </div>
          <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 4,
              background: pct >= 100 ? 'linear-gradient(90deg, var(--success), #4ade80)' : `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
              transition: 'width 0.8s ease',
              boxShadow: `0 0 12px ${barColor}40`
            }} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 80, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: remaining === 0 ? 'var(--success)' : 'var(--text)', lineHeight: 1 }}>
                {remaining === 0 ? '\u2713' : `$${remaining.toLocaleString()}`}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 3, fontWeight: 700, letterSpacing: 0.5 }}>REMAINING</div>
            </div>
            <div style={{ flex: 1, minWidth: 80, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: loadsNeeded === 0 ? 'var(--success)' : 'var(--accent2)', lineHeight: 1 }}>
                {loadsNeeded === 0 ? '\u2713' : loadsNeeded}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 3, fontWeight: 700, letterSpacing: 0.5 }}>LOADS NEEDED</div>
            </div>
            <div style={{ flex: 1, minWidth: 80, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: daysLeft <= 2 ? 'var(--danger)' : 'var(--text)', lineHeight: 1 }}>
                {daysLeft}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 3, fontWeight: 700, letterSpacing: 0.5 }}>DAYS LEFT</div>
            </div>
            <div style={{ flex: 2, minWidth: 140, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={pct >= 100 ? CheckCircle : pct >= 50 ? TrendingUp : Target} size={14} color={pct >= 100 ? 'var(--success)' : 'var(--accent)'} />
              <div style={{ fontSize: 11, color: pct >= 100 ? 'var(--success)' : 'var(--text)', fontWeight: 600, lineHeight: 1.3 }}>
                {getMessage()}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <Ic icon={Target} size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Set a revenue goal</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 320, margin: '0 auto 12px' }}>
            Track your weekly or monthly income target. Qivori shows how many loads you need and keeps you motivated.
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { setEditingGoal(true); setGoalInput('') }}>Set My Goal</button>
        </div>
      )}
    </div>
  )
}

export function OverviewTab({ onTabChange }) {
  const { showToast } = useApp()
  const { loads, allLoads, activeLoads, totalRevenue, totalExpenses, unpaidInvoices, deliveredLoads, drivers, vehicles, removeLoad, company, updateCompany, invoices, fuelCostPerMile, expenses } = useCarrier()
  const [dismissed, setDismissed] = useState([])
  const [qPulse, setQPulse] = useState(true)

  // Animated KPI values
  const animRevenue = useAnimatedNumber(totalRevenue)
  const animProfit = useAnimatedNumber(totalRevenue - totalExpenses)
  const animActiveLoads = useAnimatedNumber(activeLoads.length)

  // Build fleet rows from formal drivers + any load-assigned drivers not in the list
  const fleetRows = []
  const seenDrivers = new Set()
  drivers.forEach((d, idx) => {
    const driver = d.name || d.full_name || d.driver_name || 'Driver'
    seenDrivers.add(driver)
    const unit = d.unit || d.unit_number || `Unit ${String(idx+1).padStart(2,'0')}`
    const load = activeLoads.find(l => l.driver === driver)
    if (load) {
      const oc = load.origin?.split(',')[0]?.substring(0,3)?.toUpperCase() || '—'
      const dc = load.dest?.split(',')[0]?.substring(0,3)?.toUpperCase() || '—'
      fleetRows.push({ unit, driver, status: load.status, statusC: STATUS_DOT[load.status] || 'var(--accent)', load: load.loadId, route: `${oc}→${dc}`, active: true, driverData: d, loadData: load })
    } else {
      fleetRows.push({ unit, driver, status: 'Available', statusC: 'var(--muted)', load: '—', route: '—', active: false, driverData: d })
    }
  })
  activeLoads.forEach(l => {
    const driver = l.driver || l.driver_name || ''
    if (driver && !seenDrivers.has(driver)) {
      seenDrivers.add(driver)
      const oc = l.origin?.split(',')[0]?.substring(0,3)?.toUpperCase() || '—'
      const dc = l.dest?.split(',')[0]?.substring(0,3)?.toUpperCase() || '—'
      fleetRows.push({ unit: '—', driver, status: l.status, statusC: STATUS_DOT[l.status] || 'var(--accent)', load: l.loadId, route: `${oc}→${dc}`, active: true, loadData: l })
    }
  })

  const fleetSize = Math.max(fleetRows.length, vehicles.length, 1)
  const utilPct = Math.min(Math.round((fleetRows.filter(f => f.active).length / fleetSize) * 100), 100)
  const animUtil = useAnimatedNumber(utilPct)
  const inTransitCount = activeLoads.filter(l => l.status === 'In Transit' || l.status === 'Loaded').length
  const idleDrivers = fleetRows.filter(f => !f.active)
  const margin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1) : '0.0'
  const fmtMoney = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${Math.round(v)}`

  // Q Intelligence — generate insights from real data
  const qInsights = []
  // Idle driver insight
  if (idleDrivers.length > 0 && loads.length > 0) {
    const unassigned = loads.filter(l => !l.driver && ['Rate Con Received','Booked'].includes(l.status))
    if (unassigned.length > 0) {
      qInsights.push({ type: 'action', priority: 'high', text: `${idleDrivers.length} driver${idleDrivers.length > 1 ? 's' : ''} idle. ${unassigned.length} unassigned load${unassigned.length > 1 ? 's' : ''} waiting.`, action: 'Assign now', impact: `+$${(unassigned.reduce((s,l) => s + (l.gross||0), 0)).toLocaleString()} potential`, nav: 'loads' })
    } else {
      qInsights.push({ type: 'opportunity', priority: 'medium', text: `${idleDrivers.length} driver${idleDrivers.length > 1 ? 's' : ''} idle. Find loads to maximize utilization.`, action: 'Find loads', impact: `Fleet at ${utilPct}%`, nav: 'load-board' })
    }
  }
  // Unpaid invoices insight
  if (unpaidInvoices.length > 0) {
    const totalUnpaid = unpaidInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
    const oldestUnpaid = unpaidInvoices.reduce((oldest, i) => {
      const d = new Date(i.invoiceDate || i.created_at || 0)
      return d < oldest ? d : oldest
    }, new Date())
    const daysSince = Math.floor((Date.now() - oldestUnpaid.getTime()) / 86400000)
    qInsights.push({ type: 'warning', priority: daysSince > 30 ? 'high' : 'medium', text: `$${totalUnpaid.toLocaleString()} in unpaid invoices. Oldest: ${daysSince}d.`, action: daysSince > 30 ? 'Escalate' : 'Review', impact: daysSince > 30 ? 'Cash flow risk' : `${unpaidInvoices.length} pending`, nav: 'financials' })
  }
  // Low margin insight
  if (totalRevenue > 0 && parseFloat(margin) < 20) {
    qInsights.push({ type: 'warning', priority: 'high', text: `Operating margin at ${margin}%. Target: 25%+.`, action: 'Analyze costs', impact: `$${Math.round(totalRevenue * 0.05).toLocaleString()} recovery potential`, nav: 'financials' })
  }
  // Compliance insight
  const expiringDocs = drivers.filter(d => d.medical_card_expiry && new Date(d.medical_card_expiry) < new Date(Date.now() + 30 * 86400000))
  if (expiringDocs.length > 0) {
    qInsights.push({ type: 'alert', priority: 'high', text: `${expiringDocs.length} driver medical card${expiringDocs.length > 1 ? 's' : ''} expiring within 30 days.`, action: 'Resolve', impact: 'Compliance risk', nav: 'compliance' })
  }
  // Maintenance insight
  const maintenanceDue = vehicles.filter(v => v.current_miles > 0 && v.next_service_miles && v.current_miles >= v.next_service_miles - 1000)
  if (maintenanceDue.length > 0) {
    qInsights.push({ type: 'alert', priority: 'medium', text: `${maintenanceDue.length} vehicle${maintenanceDue.length > 1 ? 's' : ''} approaching service interval.`, action: 'Schedule', impact: 'Prevent breakdown', nav: 'fleet' })
  }
  // Revenue goal insight
  if (company?.revenue_goal_weekly || company?.revenue_goal_monthly) {
    const goalType = company.revenue_goal_type || 'weekly'
    const goal = goalType === 'weekly' ? (company.revenue_goal_weekly || 0) : (company.revenue_goal_monthly || 0)
    const now = new Date()
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodStart = goalType === 'weekly' ? startOfWeek : startOfMonth
    const periodRev = (deliveredLoads || []).filter(l => new Date(l.delivery_date || l.created_at || 0) >= periodStart).reduce((s,l) => s + (l.gross || l.rate_total || 0), 0)
    const pct = goal > 0 ? Math.round((periodRev / goal) * 100) : 0
    if (pct < 100) {
      qInsights.push({ type: 'info', priority: 'low', text: `${goalType === 'weekly' ? 'Weekly' : 'Monthly'} target: ${pct}% complete. $${Math.max(goal - periodRev, 0).toLocaleString()} remaining.`, action: 'View goal', impact: `${Math.ceil((goal - periodRev) / 2500)} loads needed`, nav: 'financials' })
    }
  }
  // If no data at all
  if (qInsights.length === 0 && loads.length === 0) {
    qInsights.push({ type: 'info', priority: 'low', text: vehicles.length === 0 ? 'Q is standing by — register your first truck to activate dispatch intelligence' : drivers.length === 0 ? 'Q is ready — add a driver to begin automated dispatch' : 'Q is scanning — book your first load to start operations', action: 'Activate Q', impact: 'Required to begin', nav: vehicles.length === 0 ? 'fleet' : drivers.length === 0 ? 'drivers' : 'load-board' })
  }

  // Load alerts — loads needing attention
  const loadAlerts = []
  // Loads without drivers
  loads.filter(l => !l.driver && ['Rate Con Received','Booked','Assigned to Driver'].includes(l.status)).slice(0,3).forEach(l => {
    const route = l.origin && l.dest ? `${(l.origin||'').split(',')[0]} → ${(l.dest||'').split(',')[0]}` : 'Unknown route'
    loadAlerts.push({ loadId: l.loadId, route, gross: l.gross || 0, rate: l.rate || 0, miles: l.miles || 0, type: 'unassigned', recommendation: idleDrivers.length > 0 ? 'Assign idle driver' : 'Find driver', color: 'var(--accent)' })
  })
  // Loads approaching pickup with no movement
  loads.filter(l => l.status === 'Assigned to Driver' && l.pickup_date).slice(0,2).forEach(l => {
    const hoursUntil = (new Date(l.pickup_date) - Date.now()) / 3600000
    if (hoursUntil < 12 && hoursUntil > -24) {
      const route = l.origin && l.dest ? `${(l.origin||'').split(',')[0]} → ${(l.dest||'').split(',')[0]}` : 'Unknown route'
      loadAlerts.push({ loadId: l.loadId, route, gross: l.gross || 0, rate: l.rate || 0, miles: l.miles || 0, type: 'pickup-soon', recommendation: 'Confirm dispatch', color: 'var(--warning)' })
    }
  })
  // Delivered but not invoiced
  loads.filter(l => l.status === 'Delivered').slice(0,2).forEach(l => {
    const route = l.origin && l.dest ? `${(l.origin||'').split(',')[0]} → ${(l.dest||'').split(',')[0]}` : 'Unknown route'
    loadAlerts.push({ loadId: l.loadId, route, gross: l.gross || 0, rate: l.rate || 0, miles: l.miles || 0, type: 'needs-invoice', recommendation: 'Generate invoice', color: 'var(--accent2)' })
  })

  // Q Actions — computed from real state
  const qActions = []
  const unassignedLoads = loads.filter(l => !l.driver && ['Rate Con Received','Booked'].includes(l.status))
  if (unassignedLoads.length > 0 && idleDrivers.length > 0) {
    qActions.push({ icon: Users, label: 'Assign Best Load', desc: `${unassignedLoads.length} loads → ${idleDrivers.length} drivers`, color: 'var(--accent)', nav: 'loads' })
  }
  if (activeLoads.length > 0) {
    qActions.push({ icon: TrendingUp, label: 'Negotiate Rate', desc: `${activeLoads.length} active — check market rates`, color: 'var(--success)', nav: 'load-board' })
  }
  if (inTransitCount > 0) {
    qActions.push({ icon: Truck, label: 'Track Fleet', desc: `${inTransitCount} in transit — view positions`, color: 'var(--accent2)', nav: 'fleet' })
  }
  if (idleDrivers.length > 0) {
    qActions.push({ icon: Package, label: 'Find Loads', desc: `${idleDrivers.length} idle — scan load boards`, color: 'var(--accent3)', nav: 'load-board' })
  }
  if (loads.filter(l => l.status === 'Delivered').length > 0) {
    qActions.push({ icon: FileText, label: 'Invoice Delivered', desc: `${loads.filter(l => l.status === 'Delivered').length} awaiting invoice`, color: 'var(--accent)', nav: 'loads' })
  }
  if (qActions.length === 0) {
    qActions.push({ icon: Package, label: 'Ask Q for Load', desc: 'Q scans load boards for matches', color: 'var(--accent)', nav: 'load-board' })
    qActions.push({ icon: Truck, label: 'Register Truck', desc: 'Activate fleet intelligence', color: 'var(--accent2)', nav: 'fleet' })
    qActions.push({ icon: Users, label: 'Add Driver', desc: 'Enable dispatch automation', color: 'var(--accent3)', nav: 'drivers' })
  }

  // Financial fuel cost
  const fuelTotal = (expenses || []).filter(e => (e.category || '').toLowerCase().includes('fuel')).reduce((s,e) => s + (parseFloat(e.amount) || 0), 0)

  const isNewCarrier = loads.length === 0 && drivers.length === 0 && vehicles.length === 0

  // ── Q Retention System ──
  const now = new Date()
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const lastWeekStart = new Date(Date.now() - 14 * 86400000)

  // Weekly performance
  const thisWeekDelivered = (deliveredLoads || []).filter(l => new Date(l.delivery_date || l.created_at || 0) > weekAgo)
  const lastWeekDelivered = (deliveredLoads || []).filter(l => { const d = new Date(l.delivery_date || l.created_at || 0); return d > lastWeekStart && d <= weekAgo })
  const thisWeekProfit = thisWeekDelivered.reduce((s, l) => s + (l.gross || l.rate_total || 0), 0)
  const lastWeekProfit = lastWeekDelivered.reduce((s, l) => s + (l.gross || l.rate_total || 0), 0)

  // Revenue goal tracking
  const weeklyGoal = company?.revenue_goal_weekly || 5000
  const [editingWeeklyGoal, setEditingWeeklyGoal] = useState(false)
  const [weeklyGoalInput, setWeeklyGoalInput] = useState(String(weeklyGoal))
  const goalPct = weeklyGoal > 0 ? Math.min(Math.round((thisWeekProfit / weeklyGoal) * 100), 100) : 0
  const goalRemaining = Math.max(weeklyGoal - thisWeekProfit, 0)

  // Idle truck cost estimate ($450/day per idle truck)
  const idleTruckCount = idleDrivers.length
  const idleDailyCost = idleTruckCount * 450

  // Missed opportunity estimate (loads not taken when drivers were idle)
  const avgGrossPerLoad = deliveredLoads.length > 0 ? deliveredLoads.reduce((s, l) => s + (l.gross || 0), 0) / deliveredLoads.length : 2500
  const missedEstimate = idleTruckCount > 0 && deliveredLoads.length > 0 ? Math.round(idleTruckCount * avgGrossPerLoad * 0.3) : 0

  // AI usage this week
  const aiLoadsThisWeek = thisWeekDelivered.length // approximate — all delivered loads went through Q
  const aiEfficiencyGain = deliveredLoads.length > 0 ? 35 : 0 // estimated %

  // Q Daily Briefing items
  const dailyBriefing = []
  if (idleTruckCount > 0) dailyBriefing.push({ icon: Truck, text: `${idleTruckCount} truck${idleTruckCount > 1 ? 's' : ''} idle — losing ~$${idleDailyCost.toLocaleString()}/day`, color: 'var(--danger)', action: 'Assign load', nav: 'load-board' })
  if (unassignedLoads.length > 0) dailyBriefing.push({ icon: Package, text: `${unassignedLoads.length} high-profit load${unassignedLoads.length > 1 ? 's' : ''} available nearby`, color: 'var(--success)', action: 'View loads', nav: 'loads' })
  if (parseFloat(margin) < 20 && totalRevenue > 0) dailyBriefing.push({ icon: TrendingUp, text: `Margin at ${margin}% — below 25% target`, color: 'var(--warning)', action: 'Analyze costs', nav: 'financials' })
  if (unpaidInvoices.length > 0) dailyBriefing.push({ icon: CreditCard, text: `$${unpaidInvoices.reduce((s,i) => s + (parseFloat(i.amount)||0), 0).toLocaleString()} unpaid — cash flow at risk`, color: 'var(--warning)', action: 'Collect now', nav: 'financials' })
  if (expiringDocs.length > 0) dailyBriefing.push({ icon: Shield, text: `${expiringDocs.length} medical card${expiringDocs.length > 1 ? 's' : ''} expiring soon`, color: 'var(--danger)', action: 'Resolve', nav: 'compliance' })
  if (dailyBriefing.length === 0 && loads.length > 0) dailyBriefing.push({ icon: CheckCircle, text: 'All operations on track — Q is monitoring', color: 'var(--success)', action: 'View fleet', nav: 'fleet' })

  // Subscription value reminder
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthlyProfit = (deliveredLoads || []).filter(l => new Date(l.delivery_date || l.created_at || 0) >= monthStart).reduce((s, l) => s + (l.gross || 0), 0)
  const monthlyLoadCount = (deliveredLoads || []).filter(l => new Date(l.delivery_date || l.created_at || 0) >= monthStart).length

  // Styles
  const pan = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', flexShrink:0 }
  const qGlow = (color) => `0 0 20px ${color}15, 0 0 40px ${color}08`
  const insightColors = { action:'var(--accent)', warning:'var(--warning)', alert:'var(--danger)', opportunity:'var(--success)', info:'var(--accent3)' }

  // Q recommendation — always one clear action
  const qRecommendation = vehicles.length === 0
    ? { text: 'Add your first truck to begin operations', action: 'Register Truck', nav: 'fleet', color: 'var(--accent)' }
    : drivers.length === 0
    ? { text: 'Add a driver to enable dispatch intelligence', action: 'Add Driver', nav: 'drivers', color: 'var(--accent2)' }
    : loads.length === 0
    ? { text: 'Book your first load — Q will scan the market for you', action: 'Ask Q for Load', nav: 'load-board', color: 'var(--accent3)' }
    : unassignedLoads.length > 0 && idleDrivers.length > 0
    ? { text: `${unassignedLoads.length} load${unassignedLoads.length > 1 ? 's' : ''} ready — assign to ${idleDrivers.length} idle driver${idleDrivers.length > 1 ? 's' : ''}`, action: 'Assign Now', nav: 'loads', color: 'var(--accent)' }
    : loads.filter(l => l.status === 'Delivered').length > 0
    ? { text: `${loads.filter(l => l.status === 'Delivered').length} delivered — generate invoices to get paid`, action: 'Invoice Now', nav: 'loads', color: 'var(--success)' }
    : activeLoads.length > 0
    ? { text: `${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''} — Q is monitoring your fleet`, action: 'View Fleet', nav: 'fleet', color: 'var(--success)' }
    : { text: 'All clear. Find your next load to keep trucks moving', action: 'Ask Q for Load', nav: 'load-board', color: 'var(--accent)' }

  return (
    <div className="overview-tab-scroll" style={{ padding:16, paddingBottom:60, boxSizing:'border-box' }}>

      {/* ═══ 1. Q STATUS BAR ═══════════════════════════════════════════ */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center', gap:8,
        padding:'10px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10,
        position:'relative', minHeight:48, overflow:'hidden', flexShrink:0
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, position:'relative', zIndex:1, minWidth:0, flex:'1 1 0' }}>
          <div style={{ flexShrink:0 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--success)', animation:'q-online-pulse 2s ease-in-out infinite' }} />
          </div>
          <div style={{ minWidth:0, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:3, color:'var(--accent)', lineHeight:1 }}>Q</span>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--success)', letterSpacing:1 }}>ONLINE</span>
            </div>
            <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace", marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              Monitoring {activeLoads.length} load{activeLoads.length !== 1 ? 's' : ''} · {fleetRows.filter(f=>f.active).length}/{fleetSize} trucks · {drivers.length} driver{drivers.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, position:'relative', zIndex:1, flexShrink:1, minWidth:0 }}>
          <LiveClock />
          <FuelTicker />
        </div>
        {/* Bottom glow line */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:1, background:'linear-gradient(90deg, transparent, var(--accent), var(--success), var(--accent), transparent)', opacity:0.3 }} />
      </div>

      {/* ═══ 2. Q INSIGHT CARD ═════════════════════════════════════════ */}
      {qInsights.length > 0 && (
        <div style={{
          background:'linear-gradient(135deg, rgba(240,165,0,0.04) 0%, rgba(52,176,104,0.03) 50%, rgba(77,142,240,0.03) 100%)',
          border:'1px solid rgba(240,165,0,0.15)', borderRadius:10, overflow:'hidden', flexShrink:0
        }}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid rgba(240,165,0,0.1)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'q-online-pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>Q INSIGHT</span>
              <span style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>
                {activeLoads.length > 0 ? `${activeLoads.length} load${activeLoads.length > 1 ? 's' : ''} active` : vehicles.length === 0 ? 'Waiting for fleet data' : loads.length === 0 ? 'Ready to deploy' : `${qInsights.length} active`}
              </span>
            </div>
            {dismissed.length > 0 && <button className="btn btn-ghost" style={{ fontSize:9 }} onClick={() => setDismissed([])}>Show all</button>}
          </div>
          {qInsights.filter((_, i) => !dismissed.includes(i)).slice(0, 4).map((insight, i) => {
            const ic = insightColors[insight.type] || 'var(--accent)'
            return (
              <div key={i} style={{ padding:'10px 14px', borderBottom:'1px solid rgba(240,165,0,0.06)', display:'flex', alignItems:'center', gap:10, cursor:'pointer', transition:'background 0.15s' }}
                onMouseOver={e => e.currentTarget.style.background='rgba(240,165,0,0.04)'}
                onMouseOut={e => e.currentTarget.style.background='transparent'}
                onClick={() => onTabChange(insight.nav)}>
                <div style={{ width:3, height:28, borderRadius:2, background:ic, flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', lineHeight:1.4 }}>{insight.text}</div>
                  <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600, marginTop:2 }}>{insight.impact}</div>
                </div>
                <button className="btn btn-ghost" style={{ fontSize:10, color:ic, border:`1px solid ${ic}30`, padding:'3px 10px', borderRadius:6, fontWeight:700, flexShrink:0 }}
                  onClick={(e) => { e.stopPropagation(); onTabChange(insight.nav) }}>
                  {insight.action}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setDismissed(d => [...d, i]) }}
                  style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:10, padding:2, opacity:0.4 }}>✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ Q RECOMMENDATION CARD ═══════════════════════════════════ */}
      <div style={{
        background:'linear-gradient(135deg, rgba(240,165,0,0.06), rgba(240,165,0,0.02))',
        border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, padding:'14px 18px',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', flexShrink:0
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:'1 1 auto', minWidth:0 }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color:'#000', fontWeight:800, lineHeight:1 }}>Q</span>
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:2 }}>Q RECOMMENDATION</div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', lineHeight:1.4, wordWrap:'break-word' }}>{qRecommendation.text}</div>
          </div>
        </div>
        <button onClick={() => onTabChange(qRecommendation.nav)}
          style={{ padding:'8px 20px', fontSize:11, fontWeight:700, border:'none', borderRadius:8, background:qRecommendation.color, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0, whiteSpace:'nowrap' }}>
          {qRecommendation.action}
        </button>
      </div>

      {/* ═══ ONBOARDING (new carriers only) ════════════════════════════ */}
      {isNewCarrier && (
        <div style={{ ...pan, padding:'20px 18px', flexShrink:0 }}>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:3, marginBottom:4 }}>
              Q IS <span style={{ color:'var(--accent)' }}>WAITING</span> FOR YOUR FIRST MOVE
            </div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Add a truck or driver to activate dispatch intelligence</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10 }}>
            {[
              { icon: Truck, label:'Register Truck', desc:'Activate fleet — equipment type, specs, location', color:'var(--accent)', tab:'fleet', done: vehicles.length > 0 },
              { icon: Users, label:'Add Driver', desc:'Enable dispatch — CDL, medical card, pay rate', color:'var(--accent2)', tab:'drivers', done: drivers.length > 0 },
              { icon: Package, label:'Ask Q for Load', desc:'Q scans load boards and finds matches', color:'var(--accent3)', tab:'load-board', done: loads.length > 0 },
              { icon: Radio, label:'Connect ELD', desc:'Live tracking — HOS, location, dispatch', color:'var(--success)', tab:'compliance', done: false },
            ].map((step, i) => (
              <div key={i} onClick={() => onTabChange(step.tab)}
                style={{
                  background: step.done ? 'rgba(52,176,104,0.04)' : 'var(--surface2)',
                  border: `1px solid ${step.done ? 'var(--success)' : 'var(--border)'}`,
                  borderRadius:8, padding:'14px', cursor:'pointer', transition:'all 0.2s',
                  wordWrap:'break-word', overflow:'hidden'
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = step.color; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = step.done ? 'var(--success)' : 'var(--border)'; e.currentTarget.style.transform = 'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <div style={{ width:28, height:28, borderRadius:7, background:step.color+'12', border:`1px solid ${step.color}25`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {step.done ? <Ic icon={CheckCircle} size={14} color="var(--success)" /> : <Ic icon={step.icon} size={14} color={step.color} />}
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color: step.done ? 'var(--success)' : 'var(--text)' }}>
                    {step.done ? 'Complete' : step.label}
                  </div>
                </div>
                <div style={{ fontSize:9, color:'var(--muted)', lineHeight:1.4 }}>{step.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:12, height:4, background:'var(--surface2)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${([vehicles.length > 0, drivers.length > 0, loads.length > 0, false].filter(Boolean).length / 4) * 100}%`, background:'linear-gradient(90deg,var(--accent),var(--success))', borderRadius:2, transition:'width 0.5s ease' }} />
          </div>
        </div>
      )}

      {/* ═══ 3. LIVE PERFORMANCE METRICS ═══════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:10, flexShrink:0 }}>
        {[
          { label:'REVENUE', value: fmtMoney(animRevenue), color:'var(--accent)', icon: DollarSign, sub: totalRevenue === 0 ? 'Q: Deploy your first load' : 'MTD', click:() => onTabChange('financials') },
          { label:'NET PROFIT', value: fmtMoney(animProfit), color: (totalRevenue - totalExpenses) >= 0 ? 'var(--success)' : 'var(--danger)', icon: TrendingUp, sub: totalRevenue === 0 ? 'Q: Profit starts after delivery' : `${margin}% margin`, click:() => onTabChange('financials') },
          { label:'ACTIVE', value: String(animActiveLoads), color:'var(--accent2)', icon: Package, sub: inTransitCount > 0 ? `${inTransitCount} moving` : activeLoads.length > 0 ? 'Dispatched' : 'Q: No active loads', click:() => onTabChange('loads') },
          { label:'FLEET', value: `${animUtil}%`, color: utilPct > 80 ? 'var(--success)' : utilPct > 50 ? 'var(--accent)' : 'var(--muted)', icon: Truck, sub: vehicles.length === 0 ? 'Q: Add a truck' : `${fleetRows.filter(f=>f.active).length}/${fleetSize} utilized`, click:() => onTabChange('fleet') },
        ].map(k => (
          <div key={k.label} onClick={k.click}
            style={{
              background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'14px 16px 12px',
              cursor:'pointer', transition:'all 0.15s', position:'relative', overflow:'hidden', wordWrap:'break-word'
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = k.color; e.currentTarget.style.boxShadow = qGlow(k.color) }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ fontSize:9, fontWeight:800, color:'var(--muted)', letterSpacing:1.5 }}>{k.label}</span>
              <Ic icon={k.icon} size={12} color={k.color} />
            </div>
            <div style={{ fontFamily:"'Bebas Neue','JetBrains Mono',sans-serif", fontSize:28, color:k.color, lineHeight:1, fontWeight:700, letterSpacing:1 }}>{k.value}</div>
            <div style={{ fontSize:9, color:'var(--muted)', marginTop:6, fontWeight:600, lineHeight:1.3 }}>{k.sub}</div>
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${k.color}40, transparent)` }} />
          </div>
        ))}
      </div>

      {/* ═══ PILOT: OPERATIONS SNAPSHOT ═══════════════════════════════ */}
      {/* Shows dispatch, compliance, execution, and financial state in one view */}
      {!isNewCarrier && (
        <div style={{ ...pan, overflow: 'visible', flexShrink: 0 }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', animation: 'q-online-pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: 'var(--accent)' }}>OPERATIONS STATUS</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
            {/* Dispatch */}
            {(() => {
              const booked = loads.filter(l => ['Rate Con Received', 'Booked'].includes(l.status)).length
              const dispatched = loads.filter(l => ['Assigned to Driver', 'En Route to Pickup', 'Dispatched'].includes(l.status)).length
              const transit = loads.filter(l => ['Loaded', 'In Transit', 'At Pickup', 'At Delivery'].includes(l.status)).length
              return (
                <div onClick={() => onTabChange('loads')} style={{ padding: '12px 14px', borderRight: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>DISPATCH</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Booked</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: booked > 0 ? 'var(--accent)' : 'var(--muted)' }}>{booked}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Dispatched</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: dispatched > 0 ? 'var(--accent2)' : 'var(--muted)' }}>{dispatched}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>In Transit</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: transit > 0 ? 'var(--success)' : 'var(--muted)' }}>{transit}</span>
                    </div>
                  </div>
                </div>
              )
            })()}
            {/* Compliance */}
            {(() => {
              const expiredCDL = drivers.filter(d => {
                const exp = d.cdl_expiry || d.license_expiry
                return exp && new Date(exp) < new Date()
              }).length
              const expiredMed = drivers.filter(d => {
                const exp = d.medical_card_expiry || d.med_card_expiry
                return exp && new Date(exp) < new Date()
              }).length
              const issues = expiredCDL + expiredMed
              return (
                <div onClick={() => onTabChange('compliance')} style={{ padding: '12px 14px', borderRight: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>COMPLIANCE</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Status</span>
                      <span style={{ fontWeight: 700, fontSize: 9, color: issues > 0 ? '#ef4444' : '#22c55e', background: issues > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', padding: '1px 6px', borderRadius: 4 }}>
                        {issues > 0 ? `${issues} FAIL` : 'CLEAR'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>CDL</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: expiredCDL > 0 ? '#ef4444' : 'var(--muted)' }}>{expiredCDL > 0 ? `${expiredCDL} expired` : 'OK'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Medical</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: expiredMed > 0 ? '#ef4444' : 'var(--muted)' }}>{expiredMed > 0 ? `${expiredMed} expired` : 'OK'}</span>
                    </div>
                  </div>
                </div>
              )
            })()}
            {/* Execution */}
            {(() => {
              const delivered = loads.filter(l => l.status === 'Delivered').length
              const invoiced = loads.filter(l => l.status === 'Invoiced').length
              const paid = loads.filter(l => l.status === 'Paid').length
              return (
                <div onClick={() => onTabChange('loads')} style={{ padding: '12px 14px', borderRight: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>EXECUTION</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Delivered</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: delivered > 0 ? 'var(--accent2)' : 'var(--muted)' }}>{delivered}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Invoiced</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: invoiced > 0 ? 'var(--accent)' : 'var(--muted)' }}>{invoiced}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Paid</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: paid > 0 ? 'var(--success)' : 'var(--muted)' }}>{paid}</span>
                    </div>
                  </div>
                </div>
              )
            })()}
            {/* Financial */}
            {(() => {
              const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
              const paidInvs = invoices.filter(i => i.status === 'Paid')
              const collected = paidInvs.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
              return (
                <div onClick={() => onTabChange('financials')} style={{ padding: '12px 14px', cursor: 'pointer' }}>
                  <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>FINANCIAL</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Unpaid</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: unpaidTotal > 0 ? 'var(--warning)' : 'var(--muted)' }}>${unpaidTotal > 0 ? unpaidTotal.toLocaleString() : '0'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Collected</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: collected > 0 ? 'var(--success)' : 'var(--muted)' }}>${collected > 0 ? collected.toLocaleString() : '0'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)' }}>Margin</span>
                      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: parseFloat(margin) >= 25 ? 'var(--success)' : parseFloat(margin) >= 15 ? 'var(--accent)' : '#ef4444' }}>{margin}%</span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ═══ 4. Q ACTIONS ══════════════════════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:10, flexShrink:0 }}>
        {qActions.slice(0,5).map((a, i) => (
          <div key={i} onClick={() => onTabChange(a.nav)}
            style={{
              background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'14px',
              cursor:'pointer', transition:'all 0.2s', position:'relative', overflow:'hidden', wordWrap:'break-word'
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = qGlow(a.color) }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ width:30, height:30, borderRadius:8, background:a.color+'10', border:`1px solid ${a.color}20`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:8, flexShrink:0 }}>
              <Ic icon={a.icon} size={14} color={a.color} />
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', marginBottom:3 }}>{a.label}</div>
            <div style={{ fontSize:9, color:'var(--muted)', lineHeight:1.4, fontWeight:600 }}>{a.desc}</div>
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:1, background:`linear-gradient(90deg, transparent, ${a.color}30, transparent)` }} />
          </div>
        ))}
      </div>

      {/* ═══ 5. LOAD ALERTS + 6. DRIVER STATUS (side by side) ═════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:10, flexShrink:0 }}>

        {/* Load Alerts */}
        <div style={pan}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={AlertTriangle} size={12} color="var(--accent)" />
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, color:'var(--text)' }}>LOAD ALERTS</span>
              {loadAlerts.length > 0 && <span style={{ fontSize:9, fontWeight:700, color:'var(--accent)', background:'rgba(240,165,0,0.1)', padding:'1px 6px', borderRadius:4 }}>{loadAlerts.length}</span>}
            </div>
            <button className="btn btn-ghost" style={{ fontSize:9 }} onClick={() => onTabChange('loads')}>Pipeline</button>
          </div>
          {loadAlerts.length === 0 ? (
            <div style={{ padding:'14px', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:7, background: loads.length === 0 ? 'rgba(240,165,0,0.08)' : 'rgba(34,197,94,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ic icon={loads.length === 0 ? Radio : CheckCircle} size={13} color={loads.length === 0 ? 'var(--accent)' : 'var(--success)'} />
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.4 }}>
                {loads.length === 0 ? <><strong style={{ color:'var(--accent)' }}>No loads yet.</strong> Activate Q to scan the market.</> : <><strong style={{ color:'var(--success)' }}>All clear.</strong> Q is monitoring — no action needed.</>}
              </div>
            </div>
          ) : loadAlerts.slice(0,4).map((la, i) => (
            <div key={i} style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.12s' }}
              onClick={() => onTabChange('loads')}
              onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
              onMouseOut={e => e.currentTarget.style.background='transparent'}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, fontWeight:700, color:la.color }}>{la.loadId}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:la.color, background:la.color+'12', padding:'1px 5px', borderRadius:3 }}>
                    {la.type === 'unassigned' ? 'NO DRIVER' : la.type === 'pickup-soon' ? 'PICKUP SOON' : 'NEEDS INVOICE'}
                  </span>
                </div>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:'var(--accent)' }}>${la.gross.toLocaleString()}</span>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{la.route}</div>
              <div style={{ fontSize:9, fontWeight:700, color:la.color }}>{la.recommendation}</div>
            </div>
          ))}
        </div>

        {/* Driver Status Panel */}
        <div style={pan}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={Users} size={12} color="var(--accent2)" />
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, color:'var(--text)' }}>DRIVER STATUS</span>
            </div>
            <button className="btn btn-ghost" style={{ fontSize:9 }} onClick={() => onTabChange('drivers')}>Manage</button>
          </div>
          {fleetRows.length === 0 ? (
            <div style={{ padding:'20px 14px', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>Q needs drivers to automate dispatch. Add your first driver to activate.</div>
              <button className="btn btn-ghost" style={{ fontSize:10, marginTop:8 }} onClick={() => onTabChange('drivers')}>Add Driver</button>
            </div>
          ) : fleetRows.slice(0,5).map((t, i) => (
            <div key={i} style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, transition:'background 0.12s' }}
              onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
              onMouseOut={e => e.currentTarget.style.background='transparent'}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:t.statusC, flexShrink:0, boxShadow: t.active ? `0 0 6px ${t.statusC}` : 'none', animation: t.active ? 'qv-pulse 2s ease-in-out infinite' : 'none' }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.driver}</span>
                  <span style={{ fontSize:8, fontWeight:700, color:t.statusC, background:t.statusC+'12', padding:'1px 5px', borderRadius:3, flexShrink:0 }}>
                    {t.active ? (t.status === 'In Transit' || t.status === 'Loaded' ? 'MOVING' : 'ON LOAD') : 'IDLE'}
                  </span>
                </div>
                {t.active ? (
                  <div style={{ fontSize:9, color:'var(--muted)', marginTop:1, fontFamily:"'JetBrains Mono',monospace" }}>{t.load} · {t.route}</div>
                ) : (
                  <div style={{ fontSize:9, color:'var(--accent)', marginTop:1, fontWeight:600 }}>
                    {unassignedLoads.length > 0 ? `${unassignedLoads.length} load${unassignedLoads.length > 1 ? 's' : ''} available` : 'Awaiting dispatch'}
                  </div>
                )}
              </div>
              {t.active && t.loadData && (
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'var(--accent)', fontWeight:700 }}>${(t.loadData.gross||0).toLocaleString()}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 7. FINANCIAL SNAPSHOT ═════════════════════════════════════ */}
      <div style={pan}>
        <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Ic icon={DollarSign} size={12} color="var(--accent)" />
            <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, color:'var(--text)' }}>FINANCIAL SNAPSHOT</span>
          </div>
          <button className="btn btn-ghost" style={{ fontSize:9 }} onClick={() => onTabChange('financials')}>Full P&L</button>
        </div>
        <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:10 }}>
          {[
            { label:'REVENUE', value: fmtMoney(totalRevenue), color:'var(--accent)', sub: totalRevenue > 0 ? 'MTD' : 'Book your first load' },
            { label:'PROFIT', value: fmtMoney(totalRevenue - totalExpenses), color: (totalRevenue - totalExpenses) >= 0 ? 'var(--success)' : 'var(--danger)', sub: totalRevenue > 0 ? `${margin}% margin` : 'Starts after delivery' },
            { label:'FUEL', value: fuelTotal > 0 ? fmtMoney(fuelTotal) : `$${(fuelCostPerMile || 0).toFixed(2)}/mi`, color:'var(--warning)', sub: fuelTotal > 0 ? 'MTD spend' : 'Per mile (EIA avg)' },
            { label:'UNPAID', value: unpaidInvoices.length > 0 ? fmtMoney(unpaidInvoices.reduce((s,i) => s + (parseFloat(i.amount)||0), 0)) : '$0', color: unpaidInvoices.length > 0 ? 'var(--accent)' : 'var(--success)', sub: unpaidInvoices.length > 0 ? `${unpaidInvoices.length} invoice${unpaidInvoices.length !== 1 ? 's' : ''}` : 'All clear' },
          ].map(f => (
            <div key={f.label} style={{ textAlign:'center', padding:'8px 4px', background:'var(--surface2)', borderRadius:8 }}>
              <div style={{ fontSize:8, fontWeight:800, color:'var(--muted)', letterSpacing:1.5, marginBottom:4 }}>{f.label}</div>
              <div style={{ fontFamily:"'Bebas Neue','JetBrains Mono',sans-serif", fontSize:22, color:f.color, lineHeight:1, fontWeight:700, letterSpacing:0.5 }}>{f.value}</div>
              <div style={{ fontSize:8, color:'var(--muted)', marginTop:3, fontWeight:600 }}>{f.sub}</div>
            </div>
          ))}
        </div>
        {/* Q financial insight */}
        {totalRevenue > 0 && (
          <div style={{ padding:'6px 14px 10px', display:'flex', alignItems:'center', gap:6, borderTop:'1px solid var(--border)' }}>
            <div style={{ width:4, height:4, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }} />
            <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600, fontFamily:"'JetBrains Mono',monospace" }}>
              {parseFloat(margin) >= 25 ? `Margin healthy at ${margin}%. Operating above target.`
                : parseFloat(margin) >= 15 ? `Margin at ${margin}%. Target 25% — review fuel and deadhead costs.`
                : `Margin low at ${margin}%. Immediate cost review recommended.`}
            </div>
          </div>
        )}
      </div>

      {/* ═══ PIPELINE + ACTIVITY (compact bottom row) ═════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:10, flexShrink:0 }}>

        {/* Pipeline Summary */}
        <div style={pan}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={Layers} size={12} />
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, color:'var(--text)' }}>PIPELINE</span>
            </div>
            <button className="btn btn-ghost" style={{ fontSize:9 }} onClick={() => onTabChange('loads')}>Open</button>
          </div>
          <div style={{ padding:'8px 10px', display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:4 }}>
            {[
              { label:'BKD', statuses:['Rate Con Received','Booked'], color:'var(--accent)' },
              { label:'DSP', statuses:['Assigned to Driver','En Route to Pickup'], color:'var(--accent3)' },
              { label:'TRAN', statuses:['Loaded','In Transit','At Pickup','At Delivery'], color:'var(--success)' },
              { label:'DEL', statuses:['Delivered'], color:'var(--accent2)' },
              { label:'INV', statuses:['Invoiced'], color:'var(--accent3)' },
              { label:'PAID', statuses:['Paid'], color:'var(--success)' },
            ].map(col => {
              const count = loads.filter(l => col.statuses.includes(l.status)).length
              return (
                <div key={col.label} onClick={() => onTabChange('loads')}
                  style={{ cursor:'pointer', textAlign:'center', padding:'6px 2px', borderRadius:6, background:'var(--surface2)', transition:'all 0.12s' }}
                  onMouseOver={e => e.currentTarget.style.background=col.color+'10'}
                  onMouseOut={e => e.currentTarget.style.background='var(--surface2)'}>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:18, color:col.color, lineHeight:1, fontWeight:700 }}>{count}</div>
                  <div style={{ fontSize:7, color:'var(--muted)', marginTop:3, fontWeight:800, letterSpacing:0.5 }}>{col.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Activity Feed */}
        <div style={pan}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
            <Ic icon={Activity} size={12} />
            <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, color:'var(--text)' }}>ACTIVITY LOG</span>
          </div>
          {(() => {
            const activity = [
              ...deliveredLoads.slice(0,3).map(l => ({ icon:CheckCircle, color:'var(--success)', text:`${l.loadId} delivered`, time: l.delivery ? l.delivery.split(' · ')[0] : '' })),
              ...unpaidInvoices.slice(0,2).map(i => ({ icon:FileText, color:'var(--accent)', text:`INV ${i.id} · $${(i.amount||0).toLocaleString()}`, time: i.invoiceDate || '' })),
              ...activeLoads.slice(0,2).map(l => ({ icon:Package, color:'var(--accent2)', text:`${l.loadId} ${l.status?.toLowerCase()}`, time: l.pickup ? l.pickup.split(' · ')[0] : '' })),
            ].slice(0,4)
            if (activity.length === 0) return (
              <div style={{ padding:'16px 14px', textAlign:'center', color:'var(--muted)', fontSize:10, lineHeight:1.5 }}>Q will log events here as you operate — loads booked, dispatches, invoices, payments.</div>
            )
            return activity.map((a, i) => (
              <div key={i} style={{ padding:'6px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, alignItems:'center' }}>
                <div style={{ width:20, height:20, borderRadius:5, background:a.color+'10', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={a.icon} size={10} color={a.color} /></div>
                <div style={{ flex:1, fontSize:10, lineHeight:1.2, fontWeight:600 }}>{a.text}</div>
                <div style={{ fontSize:8, color:'var(--muted)', flexShrink:0, fontFamily:"'JetBrains Mono',monospace" }}>{a.time}</div>
              </div>
            ))
          })()}
        </div>
      </div>

      {/* ═══ Q RETENTION SYSTEM ═══════════════════════════════════════ */}
      {!isNewCarrier && (
      <>
      {/* Q Daily Briefing */}
      <div style={{ ...pan, borderLeft:'3px solid var(--accent)' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Ic icon={Brain} size={13} color="var(--accent)" />
            <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2, color:'var(--accent)' }}>Q DAILY BRIEFING</span>
          </div>
          <span style={{ fontSize:9, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>{now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}</span>
        </div>
        <div style={{ padding:10, display:'flex', flexDirection:'column', gap:6 }}>
          {dailyBriefing.map((b, i) => {
            const isDanger = b.color === 'var(--danger)'
            return (
            <div key={i} onClick={() => onTabChange(b.nav)} style={{
              padding: isDanger ? '10px 14px' : '8px 12px', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:10,
              background: isDanger ? 'rgba(239,68,68,0.08)' : b.color === 'var(--warning)' ? 'rgba(245,158,11,0.04)' : 'rgba(34,197,94,0.04)',
              borderLeft: `${isDanger ? 3 : 2}px solid ${b.color}`,
              boxShadow: isDanger ? '0 2px 12px rgba(239,68,68,0.08)' : 'none',
            }}>
              <div style={{ width: isDanger ? 28 : 20, height: isDanger ? 28 : 20, borderRadius: isDanger ? 7 : 5, background:b.color+'15', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ic icon={b.icon} size={isDanger ? 14 : 13} color={b.color} />
              </div>
              <span style={{ flex:1, fontSize: isDanger ? 12 : 11, fontWeight: isDanger ? 700 : 600 }}>{b.text}</span>
              <span style={{ fontSize:10, color:'var(--accent)', fontWeight:700, flexShrink:0, padding:'4px 10px', background:'rgba(240,165,0,0.08)', borderRadius:5 }}>{b.action}</span>
            </div>
            )
          })}
        </div>
      </div>

      {/* Q Weekly Report + Progress */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10 }}>

        {/* Weekly Performance */}
        <div style={pan}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
            <Ic icon={BarChart2} size={12} color="var(--accent)" />
            <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2 }}>Q WEEKLY REPORT</span>
          </div>
          <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>Profit this week</span>
              <span className="mono" style={{ fontSize:16, fontWeight:700, color:'var(--success)' }}>${thisWeekProfit.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>Loads completed</span>
              <span className="mono" style={{ fontSize:14, fontWeight:700 }}>{thisWeekDelivered.length}</span>
            </div>
            {missedEstimate > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'var(--muted)' }}>Missed opportunities</span>
                <span className="mono" style={{ fontSize:13, fontWeight:700, color:'var(--danger)' }}>~${missedEstimate.toLocaleString()}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>AI usage</span>
              <span className="mono" style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>{aiLoadsThisWeek} loads</span>
            </div>
            {lastWeekProfit > 0 && (
              <div style={{ padding:'6px 8px', borderRadius:6, background:'rgba(240,165,0,0.04)', borderLeft:'2px solid var(--accent)', marginTop:2 }}>
                <div style={{ fontSize:10, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>
                  <Ic icon={Brain} size={9} color="var(--accent)" />
                  <strong style={{ color:'var(--accent)' }}>Q:</strong>
                  {thisWeekProfit > lastWeekProfit
                    ? ` Up ${Math.round(((thisWeekProfit - lastWeekProfit) / lastWeekProfit) * 100)}% from last week — momentum building.`
                    : thisWeekProfit < lastWeekProfit
                    ? ` Q could have added +$${Math.round(lastWeekProfit - thisWeekProfit).toLocaleString()} more.`
                    : ' Steady performance this week.'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress Tracking */}
        <div style={pan}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={Target} size={12} color="var(--accent)" />
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2 }}>WEEKLY GOAL</span>
            </div>
            <button className="btn btn-ghost" style={{ fontSize:9 }} onClick={() => setEditingWeeklyGoal(!editingWeeklyGoal)}>
              {editingWeeklyGoal ? 'Cancel' : 'Edit'}
            </button>
          </div>
          <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10 }}>
            {editingWeeklyGoal ? (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'var(--muted)' }}>$</span>
                <input type="number" value={weeklyGoalInput} onChange={e => setWeeklyGoalInput(e.target.value)} min="0" step="500"
                  style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:14, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", outline:'none' }} />
                <button className="btn btn-primary" style={{ fontSize:10, padding:'6px 14px' }} onClick={() => {
                  const val = parseInt(weeklyGoalInput) || 5000
                  updateCompany({ revenue_goal_weekly: val })
                  showToast('success', 'Goal Set', `Weekly target: $${val.toLocaleString()}`)
                  setEditingWeeklyGoal(false)
                }}>Save</button>
              </div>
            ) : (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <span className="mono" style={{ fontSize:20, fontWeight:700, color: goalPct >= 100 ? 'var(--success)' : goalPct >= 50 ? 'var(--accent)' : 'var(--danger)' }}>${thisWeekProfit.toLocaleString()}</span>
                <span style={{ fontSize:11, color:'var(--muted)' }}>/ ${weeklyGoal.toLocaleString()}</span>
              </div>
            )}
            <div style={{ height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
              <div style={{ width: Math.max(goalPct, 2) + '%', height:'100%', background: goalPct >= 100 ? 'var(--success)' : goalPct >= 50 ? 'var(--accent)' : 'var(--danger)', borderRadius:4, transition:'width 0.5s' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)' }}>
              <span>{goalPct}% complete</span>
              <span>${goalRemaining.toLocaleString()} remaining</span>
            </div>
            <div style={{ padding:'6px 8px', borderRadius:6, background:'rgba(240,165,0,0.04)', borderLeft:'2px solid var(--accent)' }}>
              <div style={{ fontSize:10, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>
                <Ic icon={Brain} size={9} color="var(--accent)" />
                <strong style={{ color:'var(--accent)' }}>Q:</strong>
                {goalPct >= 100 ? ' Goal achieved! Set a higher target.' :
                 goalPct >= 75 ? ' Almost there — keep pushing.' :
                 goalPct >= 50 ? ` ${Math.ceil(goalRemaining / avgGrossPerLoad)} more loads needed.` :
                 ' You are behind target — action required.'}
              </div>
            </div>
          </div>
        </div>

        {/* Q Value Reminder (subscription protection) */}
        <div style={pan}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
            <Ic icon={Zap} size={12} color="var(--accent)" />
            <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2 }}>Q VALUE THIS MONTH</span>
          </div>
          <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>Profit generated</span>
              <span className="mono" style={{ fontSize:16, fontWeight:700, color:'var(--success)' }}>${monthlyProfit.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>Loads handled by Q</span>
              <span className="mono" style={{ fontSize:14, fontWeight:700 }}>{monthlyLoadCount}</span>
            </div>
            {idleTruckCount > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'var(--muted)' }}>Idle truck cost</span>
                <span className="mono" style={{ fontSize:13, fontWeight:700, color:'var(--danger)' }}>-${idleDailyCost.toLocaleString()}/day</span>
              </div>
            )}
            {aiEfficiencyGain > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'var(--muted)' }}>Est. efficiency gain</span>
                <span className="mono" style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>+{aiEfficiencyGain}%</span>
              </div>
            )}
            {monthlyProfit === 0 && loads.length > 0 && (
              <div style={{ padding:'6px 8px', borderRadius:6, background:'rgba(239,68,68,0.04)', borderLeft:'2px solid var(--danger)' }}>
                <div style={{ fontSize:10, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>
                  <Ic icon={Brain} size={9} color="var(--danger)" />
                  <strong style={{ color:'var(--danger)' }}>Q:</strong> You are not using Q Auto-Dispatch. Estimated lost efficiency: {aiEfficiencyGain}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Missed Opportunity + Re-engagement */}
      {(missedEstimate > 0 || (idleTruckCount > 0 && loads.length > 0)) && (
        <div style={{ ...pan, borderLeft:'3px solid var(--warning)' }}>
          <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(245,158,11,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Ic icon={AlertTriangle} size={16} color="var(--warning)" />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--warning)', marginBottom:2 }}>MISSED OPPORTUNITY</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>
                {idleTruckCount > 0 ? `${idleTruckCount} idle truck${idleTruckCount > 1 ? 's' : ''} — estimated missed profit: $${missedEstimate.toLocaleString()}` : 'Higher-paying loads were available but not taken'}
              </div>
            </div>
            <button className="btn btn-primary" style={{ fontSize:10, padding:'6px 14px', flexShrink:0 }} onClick={() => onTabChange('load-board')}>
              Find Loads <Ic icon={ChevronRight} size={10} />
            </button>
          </div>
        </div>
      )}

      {/* Re-engagement prompt (shown when few loads this week) */}
      {thisWeekDelivered.length === 0 && loads.length > 0 && (
        <div style={{ ...pan, borderLeft:'3px solid var(--accent)', background:'rgba(240,165,0,0.02)' }}>
          <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Ic icon={Brain} size={18} color="var(--accent)" />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:2 }}>Q is ready to find your next load</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>No deliveries this week. Resume dispatch to keep trucks earning.</div>
            </div>
            <button className="btn btn-primary" style={{ fontSize:11, padding:'8px 16px', flexShrink:0 }} onClick={() => onTabChange('load-board')}>
              <Ic icon={Play} size={12} style={{ marginRight:4 }} /> Resume Dispatch
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {/* ═══ Q ANIMATIONS ═════════════════════════════════════════════ */}
      <style>{`
        @keyframes qv-pulse {
          0%, 100% { opacity:1; box-shadow: 0 0 4px currentColor; }
          50% { opacity:0.6; box-shadow: 0 0 12px currentColor; }
        }
        @keyframes q-online-pulse {
          0%, 100% { opacity:1; box-shadow: 0 0 4px var(--success); }
          50% { opacity:0.5; box-shadow: 0 0 12px var(--success); }
        }
        @keyframes q-scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes q-glow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
