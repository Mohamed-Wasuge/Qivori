import React, { useState, useEffect, useRef } from 'react'
import {
  DollarSign, TrendingUp, CheckCircle, Package, Truck, AlertTriangle, AlertCircle,
  CreditCard, BarChart2, Users, Shield, Zap, Layers, FileText, Activity, Radio,
  ArrowUpRight, ArrowDownRight, Bot, Plus, Fuel, Target, Clock
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
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)', minWidth:150 }}>
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
        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700, letterSpacing:1 }}>{p.region} DIESEL</div>
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
  const { loads, activeLoads, totalRevenue, totalExpenses, unpaidInvoices, deliveredLoads, drivers, vehicles, removeLoad, company, updateCompany, invoices } = useCarrier()
  const [dismissed, setDismissed] = useState([])

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
      fleetRows.push({ unit, driver, status: load.status, statusC: STATUS_DOT[load.status] || 'var(--accent)', load: load.loadId, route: `${oc}→${dc}`, active: true })
    } else {
      fleetRows.push({ unit, driver, status: 'Available', statusC: 'var(--muted)', load: '—', route: '—', active: false })
    }
  })
  // Also show drivers from active loads who aren't formally added
  activeLoads.forEach(l => {
    const driver = l.driver || l.driver_name || ''
    if (driver && !seenDrivers.has(driver)) {
      seenDrivers.add(driver)
      const oc = l.origin?.split(',')[0]?.substring(0,3)?.toUpperCase() || '—'
      const dc = l.dest?.split(',')[0]?.substring(0,3)?.toUpperCase() || '—'
      fleetRows.push({ unit: '—', driver, status: l.status, statusC: STATUS_DOT[l.status] || 'var(--accent)', load: l.loadId, route: `${oc}→${dc}`, active: true })
    }
  })

  // Fleet utilization: active trucks / total fleet size, capped at 100%
  const fleetSize = Math.max(fleetRows.length, vehicles.length, 1)
  const utilPct = Math.min(Math.round((fleetRows.filter(f => f.active).length / fleetSize) * 100), 100)
  const animUtil = useAnimatedNumber(utilPct)

  const avgRPM = activeLoads.length
    ? (activeLoads.reduce((s,l) => s + (l.rate || 0), 0) / activeLoads.length).toFixed(2)
    : '0.00'

  const inTransitCount = activeLoads.filter(l => l.status === 'In Transit' || l.status === 'Loaded').length

  // Alerts
  const generatedAlerts = []
  if (unpaidInvoices.length > 0) {
    const totalUnpaid = unpaidInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
    generatedAlerts.push({ icon: CreditCard, text: `${unpaidInvoices.length} unpaid invoice(s) totaling $${totalUnpaid.toLocaleString()}`, color: 'var(--accent)', action: 'View' })
  }
  if (vehicles.some(v => v.current_miles > 0 && v.next_service_miles && v.current_miles >= v.next_service_miles - 1000)) {
    generatedAlerts.push({ icon: AlertTriangle, text: 'Vehicle maintenance due soon', color: 'var(--warning)', action: 'Schedule' })
  }
  if (drivers.some(d => d.medical_card_expiry && new Date(d.medical_card_expiry) < new Date(Date.now() + 30 * 86400000))) {
    generatedAlerts.push({ icon: AlertCircle, text: 'Driver medical card expiring within 30 days', color: 'var(--danger)', action: 'Renew' })
  }
  const alerts = generatedAlerts.filter((_, i) => !dismissed.includes(i))

  const isNewCarrier = loads.length === 0 && drivers.length === 0 && vehicles.length === 0
  const fmtMoney = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v}`

  // Panel style
  const pan = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10 }
  const panHead = (label, icon, right) => (
    <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div style={{ fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:6, letterSpacing:0.5 }}><Ic icon={icon} size={13} />{label}</div>
      {right}
    </div>
  )

  return (
    <div style={{ padding:16, paddingBottom:60, overflowY:'auto', height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column', gap:12 }}>

      {/* ── TOP BAR: Clock + Fuel Ticker ───────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <LiveClock />
        <FuelTicker />
      </div>

      {/* ── AI DAILY BRIEFING ──────────────────────────────────────── */}
      <div style={{
        background:'linear-gradient(135deg, rgba(240,165,0,0.06) 0%, rgba(44,184,150,0.04) 50%, rgba(77,142,240,0.04) 100%)',
        border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, padding:'14px 18px',
        display:'flex', gap:14, alignItems:'flex-start', position:'relative', flexWrap:'wrap'
      }}>
        {/* Subtle scanline effect */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(240,165,0,0.015) 2px, rgba(240,165,0,0.015) 4px)', pointerEvents:'none', borderRadius:10 }} />
        <div style={{ width:36, height:36, borderRadius:10, background:'rgba(240,165,0,0.12)', border:'1px solid rgba(240,165,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Ic icon={Bot} size={18} color="var(--accent)" />
        </div>
        <div style={{ flex:1, position:'relative', zIndex:1, minWidth:200 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:4, lineHeight:1.5 }}>
            {getGreeting()}! Here's your day:
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
            {activeLoads.length === 0 && drivers.length === 0
              ? <>Qivori AI is ready — let's get your first truck and driver set up so AI can start finding loads.</>
              : <>
                  {activeLoads.length} load{activeLoads.length !== 1 ? 's' : ''} active
                  {inTransitCount > 0 && <>, <span style={{ color:'var(--success)' }}>{inTransitCount} in transit</span></>}
                  {unpaidInvoices.length > 0 && <> · <span style={{ color:'var(--accent)' }}>{unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? 's' : ''} awaiting payment</span></>}
                  {totalRevenue > 0 && <> · <span style={{ color:'var(--accent)' }}>{fmtMoney(totalRevenue)} revenue MTD</span></>}
                </>
            }
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => onTabChange('load-board')}>Find Loads</button>
          <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => onTabChange('loads')}>Pipeline</button>
        </div>
      </div>

      {/* ── ONBOARDING — beautiful empty state for new carriers ──── */}
      {isNewCarrier && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'24px 20px' }}>
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:3, marginBottom:4 }}>
              GET <span style={{ color:'var(--accent)' }}>STARTED</span>
            </div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Complete these steps to unlock your full dashboard</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
            {[
              { icon: Truck, label:'Add Your Truck', desc:'Tell Qivori what you run so AI can match the right loads', color:'var(--accent)', tab:'fleet', done: vehicles.length > 0 },
              { icon: Users, label:'Add Your Driver', desc:'Qivori needs driver info to dispatch loads and track compliance', color:'var(--accent2)', tab:'drivers', done: drivers.length > 0 },
              { icon: Package, label:'Find Your First Load', desc:'Let AI scan DAT & 123Loadboard for the best loads on your lanes', color:'var(--accent3)', tab:'loads', done: loads.length > 0 },
              { icon: Radio, label:'Connect Your ELD', desc:'Automatic HOS tracking, location updates, and dispatch coordination', color:'var(--accent4)', tab:'compliance', done: false },
            ].map((step, i) => (
              <div key={i} onClick={() => onTabChange(step.tab)}
                style={{
                  background: step.done ? 'rgba(52,176,104,0.05)' : 'var(--surface2)',
                  border: `1px solid ${step.done ? 'var(--success)' : 'var(--border)'}`,
                  borderRadius:10, padding:'16px 14px', cursor:'pointer',
                  transition:'all 0.2s', position:'relative', overflow:'hidden'
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = step.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = step.done ? 'var(--success)' : 'var(--border)'; e.currentTarget.style.transform = 'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:step.color+'15', border:`1px solid ${step.color}30`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {step.done ? <Ic icon={CheckCircle} size={16} color="var(--success)" /> : <Ic icon={step.icon} size={16} color={step.color} />}
                  </div>
                  {!step.done && <div style={{ marginLeft:'auto', width:22, height:22, borderRadius:6, background:step.color+'15', border:`1px solid ${step.color}30`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Ic icon={Plus} size={12} color={step.color} />
                  </div>}
                </div>
                <div style={{ fontSize:12, fontWeight:700, color: step.done ? 'var(--success)' : 'var(--text)', marginBottom:2 }}>
                  {step.done ? 'Completed' : step.label}
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4 }}>
                  {step.done ? 'Done' : step.desc}
                </div>
              </div>
            ))}
          </div>
          {/* Progress bar */}
          <div style={{ marginTop:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:1 }}>SETUP PROGRESS</span>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>{[vehicles.length > 0, drivers.length > 0, loads.length > 0, false].filter(Boolean).length}/4</span>
            </div>
            <div style={{ height:4, background:'var(--surface2)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${([vehicles.length > 0, drivers.length > 0, loads.length > 0, false].filter(Boolean).length / 4) * 100}%`, background:'linear-gradient(90deg,var(--accent),var(--accent2))', borderRadius:2, transition:'width 0.5s ease' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── KPI CARDS — trading terminal style ─────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
        {[
          { label:'REVENUE MTD', value: fmtMoney(animRevenue), raw: totalRevenue, color:'var(--accent)', icon: DollarSign, sub: totalRevenue === 0 ? 'Book your first load to start tracking' : undefined, click:() => onTabChange('financials') },
          { label:'NET PROFIT', value: fmtMoney(animProfit), raw: totalRevenue - totalExpenses, color: (totalRevenue - totalExpenses) >= 0 ? 'var(--success)' : 'var(--danger)', icon: TrendingUp, sub: totalRevenue === 0 ? 'Tracked per load automatically' : undefined, click:() => onTabChange('financials') },
          { label:'ACTIVE LOADS', value: String(animActiveLoads), raw: activeLoads.length, color:'var(--accent2)', icon: Package, sub: activeLoads.length === 0 ? 'AI is ready to find loads on your lanes' : inTransitCount > 0 ? `${inTransitCount} in transit` : 'None moving', click:() => onTabChange('loads') },
          { label:'FLEET UTIL', value: `${animUtil}%`, raw: utilPct, color: utilPct > 80 ? 'var(--success)' : utilPct > 50 ? 'var(--accent)' : utilPct > 0 ? 'var(--warning)' : 'var(--muted)', icon: Truck, sub: fleetSize === 0 ? 'Add trucks to see utilization' : `${fleetRows.filter(f=>f.active).length}/${fleetSize} active`, click:() => onTabChange('fleet') },
          { label:'AVG RPM', value: `$${avgRPM}`, raw: parseFloat(avgRPM), color:'var(--accent3)', icon: BarChart2, sub: parseFloat(avgRPM) === 0 ? 'Rate per mile tracked in real-time' : 'Per mile rate', click:() => onTabChange('financials') },
        ].map(k => (
          <div key={k.label} onClick={k.click}
            style={{
              background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px',
              cursor:'pointer', transition:'all 0.15s', position:'relative', overflow:'hidden'
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = k.color; e.currentTarget.style.boxShadow = `0 0 20px ${k.color}08` }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:9, fontWeight:800, color:'var(--muted)', letterSpacing:1.5 }}>{k.label}</span>
              <Ic icon={k.icon} size={12} color={k.color} />
            </div>
            <div style={{ fontFamily:"'JetBrains Mono','Bebas Neue',monospace", fontSize:26, color:k.color, lineHeight:1, fontWeight:700, letterSpacing:-0.5 }}>{k.value}</div>
            {k.sub && <div style={{ fontSize:9, color:'var(--muted)', marginTop:6, fontWeight:600 }}>{k.sub}</div>}
            {/* Glow line at bottom */}
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${k.color}40, transparent)` }} />
          </div>
        ))}
      </div>

      {/* Revenue Goal moved to Financials tab */}

      {/* ── PIPELINE BAR ──────────────────────────────────────────── */}
      <div style={pan}>
        {panHead('LOAD PIPELINE', Layers, <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => onTabChange('loads')}>Open Pipeline</button>)}
        <div style={{ padding:'10px 14px', display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:6 }}>
          {[
            { label:'Booked', statuses:['Rate Con Received','Booked'], color:'var(--accent)' },
            { label:'Dispatched', statuses:['Assigned to Driver','En Route to Pickup'], color:'var(--accent3)' },
            { label:'In Transit', statuses:['Loaded','In Transit','At Pickup','At Delivery'], color:'var(--success)' },
            { label:'Delivered', statuses:['Delivered'], color:'var(--accent2)' },
            { label:'Invoiced', statuses:['Invoiced'], color:'var(--accent3)' },
            { label:'Paid', statuses:['Paid'], color:'var(--success)' },
          ].map(col => {
            const count = loads.filter(l => col.statuses.includes(l.status)).length
            const total = loads.length || 1
            return (
              <div key={col.label} onClick={() => onTabChange('loads')}
                style={{ cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'10px 4px', borderRadius:8, background:'var(--surface2)', border:'1px solid var(--border)', transition:'all 0.12s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor=col.color; e.currentTarget.style.background=col.color+'08' }}
                onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--surface2)' }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, color:col.color, lineHeight:1, fontWeight:700 }}>{count}</div>
                <div style={{ fontSize:9, color:'var(--muted)', marginTop:5, fontWeight:700, letterSpacing:0.5, textAlign:'center' }}>{col.label.toUpperCase()}</div>
                <div style={{ width:'80%', height:2, background:'var(--border)', borderRadius:1, marginTop:6, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min((count/total)*100, 100)}%`, background:col.color, borderRadius:1 }} />
                </div>
              </div>
            )
          })}
        </div>
        {loads.length === 0 && (
          <div style={{ padding:'6px 14px 12px', textAlign:'center', fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>
            Your load pipeline tracks every load from booking to payment. Qivori handles invoicing and settlement automatically — you just drive.
          </div>
        )}
      </div>

      {/* ── MIDDLE: Active Loads + Fleet ────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

        {/* Active Loads */}
        <div style={pan}>
          {panHead('ACTIVE LOADS', Package, <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => onTabChange('loads')}>View all</button>)}
          {activeLoads.length === 0 ? (
            <div style={{ padding:28, textAlign:'center' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
                <Ic icon={Package} size={18} color="var(--accent)" />
              </div>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>No active loads yet</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, lineHeight:1.5, maxWidth:280, margin:'0 auto 10px' }}>Once you add a truck and driver, Qivori AI will start finding the highest-paying loads on your lanes.</div>
              <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => onTabChange('load-board')}>Find Loads</button>
            </div>
          ) : activeLoads.slice(0,5).map(load => {
            const sc = STATUS_DOT[load.status] || 'var(--muted)'
            const route = load.origin && load.dest ? (load.origin||'').split(',')[0].substring(0,3).toUpperCase() + ' → ' + (load.dest||'').split(',')[0].substring(0,3).toUpperCase() : '—'
            return (
              <div key={load.loadId} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}
                onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
                onMouseOut={e => e.currentTarget.style.background='transparent'}>
                <div style={{ minWidth:54 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>{load.loadId}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:1 }}>{route}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{load.broker || '—'} · {load.driver || 'Unassigned'}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:15, color:'var(--accent)', fontWeight:700 }}>${(load.gross||0).toLocaleString()}</div>
                  <div style={{ fontSize:9, color:'var(--muted)' }}>${load.rate || '—'}/mi</div>
                </div>
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:6, background:sc+'18', color:sc, whiteSpace:'nowrap' }}>{load.status}</span>
                <button onClick={(e) => { e.stopPropagation(); if(window.confirm(`Delete load ${load.loadId}?`)) removeLoad(load.loadId) }}
                  style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:11, padding:2, lineHeight:1, opacity:0.5 }}
                  onMouseOver={e => e.currentTarget.style.opacity='1'}
                  onMouseOut={e => e.currentTarget.style.opacity='0.5'}
                  title="Delete load">✕</button>
              </div>
            )
          })}
        </div>

        {/* Fleet Status */}
        <div style={pan}>
          {panHead('FLEET STATUS', Truck, <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => onTabChange('fleet')}>Live Map</button>)}
          {fleetRows.length === 0 ? (
            <div style={{ padding:28, textAlign:'center' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'rgba(44,184,150,0.08)', border:'1px solid rgba(44,184,150,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
                <Ic icon={Truck} size={18} color="var(--success)" />
              </div>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>No fleet added yet</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, lineHeight:1.5, maxWidth:280, margin:'0 auto 10px' }}>Add your first truck so Qivori knows what equipment you run. We'll match loads to your truck type, location, and preferred lanes.</div>
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => onTabChange('fleet')}>Add Truck</button>
            </div>
          ) : fleetRows.map(t => (
            <div key={t.unit} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
              {/* Pulse dot for active trucks */}
              <div style={{ width:8, height:8, borderRadius:'50%', background:t.statusC, flexShrink:0, boxShadow: t.active ? `0 0 8px ${t.statusC}` : 'none', animation: t.active ? 'qv-pulse 2s ease-in-out infinite' : 'none' }} />
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{t.unit}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:t.statusC, padding:'1px 6px', borderRadius:4, background:t.statusC+'15' }}>{t.status}</span>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{t.driver}</div>
              </div>
              {t.load !== '—' && (
                <div style={{ fontSize:10, color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>{t.load} · {t.route}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM: Alerts + Activity + Quick Access ──────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>

        {/* Alerts */}
        <div style={pan}>
          {panHead('ALERTS', AlertTriangle, alerts.length > 0 && <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => setDismissed(generatedAlerts.map((_,i)=>i))}>Clear</button>)}
          {alerts.length === 0
            ? <div style={{ padding:20, textAlign:'center', fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>No alerts right now. Qivori monitors insurance expiry, CDL renewals, HOS violations, and load deadlines — you'll see alerts here when something needs attention.</div>
            : alerts.map((a, i) => (
              <div key={i} style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, alignItems:'flex-start' }}>
                <Ic icon={a.icon} size={14} color={a.color} style={{ flexShrink:0, marginTop:1 }} />
                <div style={{ flex:1, fontSize:11, color:'var(--text)', lineHeight:1.4 }}>{a.text}</div>
                <button onClick={() => setDismissed(d => [...d, generatedAlerts.indexOf(a)])} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12, lineHeight:1 }}>✕</button>
              </div>
            ))
          }
        </div>

        {/* Activity Feed */}
        <div style={pan}>
          {panHead('ACTIVITY', Activity)}
          {(() => {
            const activity = [
              ...deliveredLoads.slice(0,3).map(l => ({ icon:CheckCircle, color:'var(--success)', text:`${l.loadId} delivered`, time: l.delivery ? l.delivery.split(' · ')[0] : '' })),
              ...unpaidInvoices.slice(0,2).map(i => ({ icon:FileText, color:'var(--accent)', text:`Invoice ${i.id} · $${(i.amount||0).toLocaleString()}`, time: i.invoiceDate || '' })),
              ...activeLoads.slice(0,2).map(l => ({ icon:Package, color:'var(--accent2)', text:`${l.loadId} ${l.status}`, time: l.pickup ? l.pickup.split(' · ')[0] : '' })),
            ].slice(0,5)
            if (activity.length === 0) return (
              <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:11, lineHeight:1.5 }}>Your AI activity feed will show loads found, calls made, rate negotiations, and bookings — all in real time.</div>
            )
            return activity.map((a, i) => (
              <div key={i} style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ width:24, height:24, borderRadius:6, background:a.color+'12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={a.icon} size={12} color={a.color} /></div>
                <div style={{ flex:1, fontSize:11, lineHeight:1.3 }}>{a.text}</div>
                <div style={{ fontSize:9, color:'var(--muted)', flexShrink:0 }}>{a.time}</div>
              </div>
            ))
          })()}
        </div>

        {/* Quick Access */}
        <div style={pan}>
          {panHead('QUICK ACCESS', Zap)}
          <div style={{ padding:10, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {[
              { icon:Package, label:'Loads', nav:'loads' }, { icon:Users, label:'Drivers', nav:'drivers' },
              { icon:Truck, label:'Fleet', nav:'fleet' }, { icon:DollarSign, label:'Money', nav:'financials' },
              { icon:Shield, label:'Comply', nav:'compliance' }, { icon:BarChart2, label:'Analytics', nav:'analytics' },
              { icon:Zap, label:'AI Board', nav:'load-board' }, { icon:SettingsIcon, label:'Settings', nav:'settings' },
            ].map(m => (
              <div key={m.nav} onClick={() => onTabChange(m.nav)}
                style={{ padding:'8px 4px', background:'var(--surface2)', borderRadius:8, cursor:'pointer', textAlign:'center', transition:'all 0.15s', border:'1px solid transparent' }}
                onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.background='rgba(240,165,0,0.05)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='var(--surface2)' }}>
                <Ic icon={m.icon} size={16} style={{ marginBottom:3 }} />
                <div style={{ fontSize:8, fontWeight:700, color:'var(--muted)', letterSpacing:0.3 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pulse animation for active trucks */}
      <style>{`
        @keyframes qv-pulse {
          0%, 100% { opacity:1; box-shadow: 0 0 4px currentColor; }
          50% { opacity:0.6; box-shadow: 0 0 12px currentColor; }
        }
        @keyframes qv-ai-pulse {
          0%, 100% { opacity:1; box-shadow: 0 0 6px var(--accent); transform: scale(1); }
          50% { opacity:0.5; box-shadow: 0 0 14px var(--accent); transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}
