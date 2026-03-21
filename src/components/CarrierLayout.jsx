import React, { useState, useCallback, useEffect, useRef, useMemo, Component } from 'react'
import * as Sentry from '@sentry/react'
import {
  Monitor, Layers, Receipt, Truck, Shield, Users, Briefcase, Settings as SettingsIcon,
  Search, Bell, Moon, Eye, Zap, Wrench, CreditCard, BarChart2, AlertTriangle,
  TrendingUp, TrendingDown, ChevronLeft, ClipboardList, CheckCircle, Map, DollarSign, Droplets, FileCheck, Star, UserPlus,
  User, Building2, Plug, Palette, Scale, Package, MapPin, Smartphone, FileText, AlertCircle, Fuel,
  Clock, Plus, CloudSun, Activity, Radio, ArrowUpRight, ArrowDownRight, Bot, Sun, Sunrise, Globe, RefreshCw, Link2, Target, Route
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import { generateInvoicePDF } from '../utils/generatePDF'
import Toast from './Toast'
import {
  SmartDispatch, DriverSettlement, FleetMap, FleetManager,
  LaneIntel, FuelOptimizer, BrokerRiskIntel, DriverOnboarding,
  CarrierIFTA, CarrierDVIR, CarrierClearinghouse,
  DriverProfiles, BrokerDirectory, ExpenseTracker, FactoringCashflow,
  CommandCenter, AILoadBoard, CashFlowForecaster, CheckCallCenter, DriverScorecard, DATAlertBot,
  PLDashboard, ReceivablesAging, DriverPayReport, CashRunway, QuickBooksExport, CarrierPackage, EquipmentManager,
  AnalyticsDashboard, ReferralProgram, SMSSettings, InvoicingSettings, TeamManagement, RateNegotiation, RateBadge,
} from '../pages/CarrierPages'
import { apiFetch } from '../lib/api'
import { useTranslation, LanguageToggle } from '../lib/i18n'
import { DQFileManager, ExpiryAlerts, DrugAlcoholCompliance, IncidentTracker, PayrollTracker, DriverPortal } from '../pages/carrier/HR'

const Ic = ({ icon: Icon, size = 16, color, style, ...props }) => <Icon size={size} color={color} style={style} {...props} />

// ── Error Boundary ─────────────────────────────────────────────────────────────
class ViewErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(err, info) { Sentry.captureException(err, { extra: { componentStack: info?.componentStack } }) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:20, padding:40 }}>
          <div style={{ width:64, height:64, borderRadius:16, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--danger)' }}><AlertTriangle size={28} /></div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--danger)', marginBottom:8 }}>Something went wrong</div>
            <div style={{ fontSize:12, color:'var(--muted)', maxWidth:360, lineHeight:1.7, fontFamily:'monospace', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
              {String(this.state.error).replace('ReferenceError: ','').replace('TypeError: ','')}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
            ↩ Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// (MODULES array removed — components are now accessed via hub sub-tabs)

// ── Overview tab content ───────────────────────────────────────────────────────
// Alerts are generated dynamically from real data below
const STATUS_DOT = { 'In Transit':'var(--success)', 'Loaded':'var(--accent2)', 'Assigned to Driver':'var(--accent)', 'En Route to Pickup':'var(--accent2)', 'Rate Con Received':'var(--accent)', 'Available':'var(--muted)' }

// ── Animated counter hook ─────────────────────────────────────────────────────
function useAnimatedNumber(target, duration = 900) {
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
function LiveClock() {
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
function FuelTicker() {
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
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function RevenueGoalWidget({ company, deliveredLoads, invoices, totalRevenue, editingGoal, setEditingGoal, goalInput, setGoalInput, updateCompany, showToast, pan }) {
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

function OverviewTab({ onTabChange }) {
  const { showToast } = useApp()
  const { loads, activeLoads, totalRevenue, totalExpenses, unpaidInvoices, deliveredLoads, drivers, vehicles, removeLoad, company, updateCompany, invoices } = useCarrier()
  const [dismissed, setDismissed] = useState([])
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')

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

      {/* ── REVENUE GOAL TRACKER ────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
        {editingGoal ? (
          <div>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#f0a500', letterSpacing: 0.5, marginBottom: 8 }}>SET WEEKLY GOAL</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>$</span>
              <input type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)} placeholder="5000"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '5px 8px', fontSize: 13, flex: 1, fontFamily: "'JetBrains Mono',monospace" }} />
              <button style={{ background: '#f0a500', color: '#0a0a0e', border: 'none', borderRadius: 6, padding: '5px 12px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                onClick={() => { const v = parseFloat(goalInput); if (v > 0) { updateCompany({ revenue_goal_weekly: v }); setEditingGoal(false); showToast && showToast('Goal set to $' + v.toLocaleString()) } }}>Save</button>
              <button style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}
                onClick={() => setEditingGoal(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: '#f0a500', letterSpacing: 0.5 }}>REVENUE GOAL</div>
              <button style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 10, padding: '3px 10px', cursor: 'pointer', fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}
                onClick={() => { setEditingGoal(true); setGoalInput(String((company && company.revenue_goal_weekly) || '')) }}>
                {(company && company.revenue_goal_weekly) ? 'Edit' : 'Set Goal'}
              </button>
            </div>
            {company && company.revenue_goal_weekly > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: '#f0a500' }}>
                      ${(totalRevenue || 0).toLocaleString()}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>/ ${company.revenue_goal_weekly.toLocaleString()}</span>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: '#f0a500' }}>
                    {Math.min(Math.round(((totalRevenue || 0) / company.revenue_goal_weekly) * 100), 100)}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: Math.min(Math.round(((totalRevenue || 0) / company.revenue_goal_weekly) * 100), 100) + '%', background: 'linear-gradient(90deg, #f0a500, #2cb896)', borderRadius: 3, transition: 'width 0.8s ease' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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

// ── Billing tab ────────────────────────────────────────────────────────────────
function BillingTab() {
  const { showToast, profile, subscription, openBillingPortal } = useApp()
  const { invoices, vehicles, unpaidInvoices, totalRevenue, totalExpenses } = useCarrier()

  const truckCount = vehicles.length || profile?.truck_count || 1
  const planName = 'Autonomous Fleet AI'
  const planPrice = 399
  const totalMonthly = planPrice * truckCount

  const validPlans = ['autonomous_fleet', 'autopilot_ai', 'autopilot']
  const isFreeTier = !subscription?.plan || !validPlans.includes(subscription?.plan)
  const statusLabel = subscription?.isTrial ? 'TRIAL' : subscription?.isActive ? 'ACTIVE' : subscription?.status === 'past_due' ? 'PAST DUE' : isFreeTier ? 'FREE TIER' : 'INACTIVE'
  const statusColor = { Unpaid:'var(--warning)', Paid:'var(--success)', Factored:'var(--accent2)', Overdue:'var(--danger)' }
  const badgeColor = subscription?.isTrial ? 'var(--accent)' : subscription?.isActive ? 'var(--success)' : isFreeTier ? 'var(--accent2)' : 'var(--danger)'

  return (
    <div style={{ padding: 20, paddingBottom: 60, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Plan summary */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Current Plan — {planName}</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: `${badgeColor}15`, color: badgeColor, border: `1px solid ${badgeColor}30` }}>{'\u25CF'} {statusLabel}</span>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          {[
            { label: 'Plan', price: planName, note: 'Everything included', color: 'var(--accent)' },
            { label: 'Per Truck', price: `$${planPrice}/mo`, note: `${truckCount} truck${truckCount !== 1 ? 's' : ''}`, color: 'var(--accent2)' },
            { label: 'Total Monthly', price: `$${totalMonthly}/mo`, note: profile?.current_period_end ? `Next: ${new Date(profile.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '', color: 'var(--success)', bold: true },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: item.color }}>{item.price}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{item.note}</div>
            </div>
          ))}
        </div>
        {subscription?.customerId && (
          <div style={{ padding: '0 20px 16px', display: 'flex', gap: 10 }}>
            <button onClick={openBillingPortal} style={{ padding: '8px 16px', fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              Manage Subscription
            </button>
          </div>
        )}
      </div>

      {/* Revenue stats */}
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { label: 'Total Invoices', value: invoices.length, color: 'var(--accent)' },
          { label: 'Unpaid', value: unpaidInvoices.length, color: 'var(--warning)' },
          { label: 'Revenue MTD', value: '$' + totalRevenue.toLocaleString(), color: 'var(--success)' },
          { label: 'Expenses MTD', value: '$' + totalExpenses.toLocaleString(), color: 'var(--danger)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Invoice History ({invoices.length})</div>
        {invoices.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No invoices yet. Deliver a load to auto-generate one.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Invoice','Load','Broker','Date','Amount','Status'].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {invoices.map(inv => {
                const sc = statusColor[inv.status] || 'var(--muted)'
                return (
                  <tr key={inv.id || inv.invoice_number} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => showToast('', inv.id || inv.invoice_number, `${inv.broker || '—'} · ${inv.route || ''} · $${(inv.amount || 0).toLocaleString()} · ${inv.status}`)}>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--accent3)', fontFamily: 'monospace' }}>{inv.id || inv.invoice_number}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>{inv.loadId || inv.load_number || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>{inv.broker || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 12 }}>{inv.date || '—'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--accent)' }}>${(inv.amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: sc + '15', color: sc }}>{inv.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}


// ── Subscription Settings (inside Settings tab) ────────────────────────────────
function SubscriptionSettings() {
  const { showToast, user, profile, subscription, openBillingPortal, demoMode } = useApp()
  const [subData, setSubData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [truckPicker, setTruckPicker] = useState(null) // null = hidden, or { planId, trucks: 1 }


  useEffect(() => {
    if (demoMode) {
      setSubData({
        plan: 'autonomous_fleet', status: 'trialing', trialDaysLeft: 11,
        trialEndsAt: new Date(Date.now() + 11 * 86400000).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 11 * 86400000).toISOString(),
        amount: 39900, truckCount: 1,
      })
      setLoading(false)
      return
    }
    apiFetch('/api/get-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(data => { setSubData(data); setLoading(false) })
      .catch(() => {
        setSubData({
          plan: profile?.subscription_plan || null,
          status: profile?.subscription_status || 'inactive',
          trialEndsAt: profile?.trial_ends_at,
          currentPeriodEnd: profile?.current_period_end,
          customerId: profile?.stripe_customer_id,
          truckCount: profile?.truck_count || 1,
        })
        setLoading(false)
      })
  }, [demoMode, profile])

  const PLAN_INFO = {
    autonomous_fleet: { name: 'Autonomous Fleet AI', price: '$399/truck/mo', color: '#f0a500', tier: 2 },
    autopilot_ai:     { name: 'Autonomous Fleet AI', price: '$399/truck/mo', color: '#f0a500', tier: 2 },
    autopilot:        { name: 'Autonomous Fleet AI', price: '$399/truck/mo', color: '#f0a500', tier: 2 },
  }

  const STATUS_BADGES = {
    active:   { label: 'ACTIVE',    bg: 'rgba(34,197,94,0.1)',  color: 'var(--success)', border: 'rgba(34,197,94,0.2)' },
    trialing: { label: 'TRIAL',     bg: 'rgba(240,165,0,0.1)',  color: 'var(--accent)',  border: 'rgba(240,165,0,0.2)' },
    past_due: { label: 'PAST DUE',  bg: 'rgba(239,68,68,0.1)',  color: 'var(--danger)',  border: 'rgba(239,68,68,0.2)' },
    canceled: { label: 'CANCELLED', bg: 'rgba(74,85,112,0.1)',  color: 'var(--muted)',   border: 'rgba(74,85,112,0.2)' },
    inactive: { label: 'FREE TIER',  bg: 'rgba(44,184,150,0.1)',  color: 'var(--accent2)',   border: 'rgba(44,184,150,0.2)' },
  }

  const handleUpgrade = () => {
    setTruckPicker({ planId: 'autonomous_fleet', trucks: Math.max(subData?.truckCount || 1, 1) })
  }

  const goToCheckout = async (planId, trucks) => {
    setUpgradeLoading(true)
    try {
      const res = await apiFetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          email: user?.email || profile?.email,
          userId: user?.id,
          truckCount: trucks,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else showToast('error', 'Error', data.error || 'Could not start checkout')
    } catch (e) {
      showToast('error', 'Error', 'Could not start checkout')
    } finally {
      setUpgradeLoading(false)
      setTruckPicker(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Loading subscription details...
      </div>
    )
  }

  const plan = PLAN_INFO[subData?.plan] || { name: 'No Plan', price: '$0', color: '#8a8a9a', tier: 0 }
  const badge = STATUS_BADGES[subData?.status] || STATUS_BADGES.inactive
  const trialDays = subData?.trialDaysLeft ?? (subData?.status === 'trialing' && subData?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subData.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null)
  const nextBilling = subData?.currentPeriodEnd
    ? new Date(subData.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>SUBSCRIPTION</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Manage your Qivori AI plan, billing, and payment details</div>
      </div>

      {/* Current Plan Card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Current Plan</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
            {'\u25CF'} {badge.label}
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Plan</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: plan.color }}>{plan.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{plan.price}</div>
            </div>

            {trialDays !== null && subData?.status === 'trialing' ? (
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Trial Remaining</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: trialDays <= 3 ? 'var(--danger)' : 'var(--accent)' }}>
                  {trialDays} DAY{trialDays !== 1 ? 'S' : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Ends {subData.trialEndsAt ? new Date(subData.trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '\u2014'}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Next Billing</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--text)' }}>
                  {nextBilling || '\u2014'}
                </div>
                {subData?.cancelAtPeriodEnd && (
                  <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4, fontWeight: 700 }}>Cancels at period end</div>
                )}
              </div>
            )}

            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Trucks</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: 'var(--accent2)' }}>
                {subData?.truckCount || 1}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Active vehicles</div>
            </div>
          </div>

          {subData?.status === 'trialing' && trialDays !== null && trialDays <= 3 && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ic icon={AlertTriangle} size={16} color="var(--danger)" />
              <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                Your trial ends in <strong>{trialDays} day{trialDays !== 1 ? 's' : ''}</strong>. Add a payment method to continue using Qivori without interruption.
              </div>
            </div>
          )}

          {subData?.status === 'past_due' && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ic icon={AlertTriangle} size={16} color="var(--danger)" />
              <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                Your payment failed. Please update your payment method to avoid service interruption.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            {(subData?.customerId || subscription?.customerId) && (
              <button onClick={openBillingPortal} className="btn btn-ghost" style={{ padding: '10px 20px', fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", background: 'transparent', color: 'var(--text)' }}>
                <Ic icon={CreditCard} size={14} />Manage Subscription
              </button>
            )}
            {!subData?.isActive && !subscription?.isActive && (
              <button onClick={handleUpgrade} disabled={upgradeLoading}
                style={{ padding: '10px 20px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#000', cursor: upgradeLoading ? 'wait' : 'pointer', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ic icon={Zap} size={14} />
                {upgradeLoading ? 'Loading...' : 'Start Free Trial'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plan Details */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Your Plan — Autonomous Fleet AI</div>
        <div style={{ padding: 20, maxWidth: 500 }}>
          <div style={{ position: 'relative', padding: 20, borderRadius: 12, border: '2px solid rgba(240,165,0,0.4)', background: 'rgba(240,165,0,0.04)' }}>
            <div style={{ position: 'absolute', top: -1, right: 16, fontSize: 9, fontWeight: 800, padding: '2px 12px', borderRadius: '0 0 6px 6px', background: '#f0a500', color: '#000', letterSpacing: 1 }}>FOUNDER PRICING</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f0a500', marginBottom: 2 }}>Autonomous Fleet AI</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>Everything included · Per truck · No upsells</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--muted)', textDecoration: 'line-through', marginRight: 2 }}>$599</span>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: 'var(--text)' }}>$399</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>/truck/mo</span>
            </div>
            <div style={{ fontSize: 10, marginBottom: 16 }}>
              <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>SAVE $200/truck</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {['AI Load Board & Scoring', 'AI-Powered Dispatch', 'Proactive Load Finding Agent', 'Voice AI Assistant',
                'Fleet Map & GPS Tracking', 'P&L Dashboard & Analytics', 'IFTA Auto-Filing', 'Invoicing & Auto-Factoring',
                'Fuel Optimizer', 'Full Compliance Suite', 'HR & DQ File Management', 'Driver Portal & Scorecards',
                'Smart Document Handling', 'Dedicated Support'].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text)' }}>
                  <span style={{ color: '#f0a500', fontSize: 12, flexShrink: 0 }}>{'\u2713'}</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            {!subData?.isActive && !subscription?.isActive && (
              <button onClick={handleUpgrade} disabled={upgradeLoading}
                style={{ width: '100%', padding: '12px 12px', fontSize: 13, fontWeight: 700, borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                  border: 'none', background: '#f0a500', color: '#000' }}>
                {upgradeLoading ? 'Loading...' : 'Start Free Trial'}
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          14-day free trial · No credit card required · Cancel anytime
        </div>
      </div>

      {/* Truck Picker Modal for Autopilot AI */}
      {truckPicker && (
        <>
          <div onClick={() => setTruckPicker(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9000 }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:420, maxWidth:'90vw',
            background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, zIndex:9001,
            boxShadow:'0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>AUTONOMOUS FLEET AI</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>How many trucks do you operate?</div>
              </div>
              <button onClick={() => setTruckPicker(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            {/* Truck counter */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, marginBottom:24 }}>
              <button onClick={() => setTruckPicker(p => ({ ...p, trucks: Math.max(1, p.trucks - 1) }))}
                style={{ width:44, height:44, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)',
                  color:'var(--text)', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
              <div style={{ textAlign:'center', minWidth:80 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:48, color:'var(--accent)', lineHeight:1 }}>{truckPicker.trucks}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>truck{truckPicker.trucks !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setTruckPicker(p => ({ ...p, trucks: p.trucks + 1 }))}
                style={{ width:44, height:44, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)',
                  color:'var(--text)', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            </div>

            {/* Price breakdown */}
            <div style={{ background:'var(--surface2)', borderRadius:12, padding:16, marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13 }}>
                <span style={{ color:'var(--muted)' }}>Autonomous Fleet AI ({truckPicker.trucks} truck{truckPicker.trucks !== 1 ? 's' : ''} × $399)</span>
                <span style={{ fontWeight:700 }}>${(truckPicker.trucks * 399).toLocaleString()}/mo</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:11, color:'var(--muted)' }}>
                <span>Founder pricing (normally $599/truck)</span>
                <span style={{ color:'#ef4444', fontWeight:700 }}>Save ${(truckPicker.trucks * 200).toLocaleString()}/mo</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 4px', fontSize:15, borderTop:'1px solid var(--border)', marginTop:6 }}>
                <span style={{ fontWeight:800 }}>Total</span>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:'var(--accent)', lineHeight:1 }}>
                  ${(truckPicker.trucks * 399).toLocaleString()}<span style={{ fontSize:13, color:'var(--muted)' }}>/mo</span>
                </span>
              </div>
            </div>

            <button onClick={() => goToCheckout('autonomous_fleet', truckPicker.trucks)} disabled={upgradeLoading}
              style={{ width:'100%', padding:'14px', fontSize:14, fontWeight:700, border:'none', borderRadius:10,
                background:'var(--accent)', color:'#000', cursor: upgradeLoading ? 'wait' : 'pointer',
                fontFamily:"'DM Sans',sans-serif" }}>
              {upgradeLoading ? 'Redirecting to Stripe...' : `Start Free Trial — ${truckPicker.trucks} Truck${truckPicker.trucks !== 1 ? 's' : ''}`}
            </button>
            <div style={{ textAlign:'center', fontSize:11, color:'var(--muted)', marginTop:10 }}>
              14-day free trial · No charge until trial ends
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Settings tab ───────────────────────────────────────────────────────────────
function SettingsTab() {
  const { showToast, theme, setTheme } = useApp()
  const { company: ctxCompany, updateCompany } = useCarrier()
  const [company, setCompany] = useState(ctxCompany || { name:'', mc:'', dot:'', address:'', phone:'', email:'', ein:'' })
  const [billing, setBilling] = useState({ factoringRate:'2.5', payDefault:'28%', fastpayEnabled:true, autoInvoice:true })
  const [fuelCard, setFuelCard] = useState(ctxCompany?.fuel_card_provider || '')
  const [tollTransponder, setTollTransponder] = useState(ctxCompany?.toll_transponder || '')
  const [integrations] = useState([
    { name:'Samsara ELD',      status:'Not connected', statusC:'var(--muted)', icon: Smartphone, desc:'Connect your Samsara ELD to sync device data' },
    { name:'Motive ELD',       status:'Not connected', statusC:'var(--muted)', icon: Smartphone, desc:'Connect your Motive (KeepTruckin) ELD' },
    { name:'QuickBooks Online', status:'Not connected', statusC:'var(--muted)', icon: BarChart2, desc:'Connect to auto-sync expenses & invoices' },
    { name:'DAT Load Board',    status:'Not connected', statusC:'var(--muted)', icon: Truck, desc:'Connect to pull spot rates on your lanes' },
    { name:'123Loadboard',      status:'Not connected', statusC:'var(--muted)', icon: Truck, desc:'Connect to search and book loads' },
  ])
  const [team] = useState([
    { name:'You (Owner)',     email: company.email || '', role:'Admin',    roleC:'var(--accent)' },
  ])
  const [notifPrefs, setNotifPrefs] = useState({ newMatch:true, loadStatus:true, driverAlert:true, payReady:true, compliance:true, marketRates:false })
  const [settingsSec, setSettingsSec] = useState('company')

  const [providerKeys, setProviderKeys] = useState({
    resend_api_key:'', checkr_api_key:'', sambasafety_api_key:'', sambasafety_account_id:'',
    fmcsa_api_key:'', fmcsa_webkey:'', fadv_client_id:'', fadv_client_secret:'',
  })
  const [keysLoaded, setKeysLoaded] = useState(false)

  // Load provider keys from company record
  useEffect(() => {
    if (ctxCompany?.provider_keys) {
      setProviderKeys(prev => ({ ...prev, ...ctxCompany.provider_keys }))
      setKeysLoaded(true)
    }
  }, [ctxCompany])

  const saveProviderKeys = async () => {
    try {
      await updateCompany({ provider_keys: providerKeys })
      showToast('success', 'Keys Saved', 'Provider API keys updated securely')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to save keys')
    }
  }

  const SECTIONS = [
    { id:'company',        icon: Building2, label:'Company Profile' },
    { id:'loadboards',     icon: Globe, label:'Load Boards' },
    { id:'subscription',   icon: Star, label:'Subscription' },
    { id:'billing',        icon: CreditCard, label:'Billing & Pay' },
    { id:'providers',      icon: Shield, label:'Provider Keys' },
    { id:'integrations',   icon: Plug, label:'Integrations' },
    { id:'team',           icon: Users, label:'Team & Access' },
    { id:'notifications',  icon: Bell, label:'Notifications' },
    { id:'sms',            icon: Smartphone, label:'SMS Alerts' },
    { id:'invoicing',      icon: FileText, label:'Invoicing' },
    { id:'appearance',     icon: Palette, label:'Appearance' },
  ]

  const FieldRow = ({ label, value, onChange, type='text' }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11, color:'var(--muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100%', minHeight:0, overflow:'hidden' }}>

      {/* Sidebar */}
      <div style={{ width:200, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>SETTINGS</div>
        </div>
        {SECTIONS.map(s => {
          const isActive = settingsSec === s.id
          return (
            <button key={s.id} onClick={() => setSettingsSec(s.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 16px', border:'none', cursor:'pointer', textAlign:'left',
                background: isActive ? 'rgba(240,165,0,0.08)' : 'transparent', borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                transition:'all 0.15s', fontFamily:"'DM Sans',sans-serif",
                color: isActive ? 'var(--accent)' : 'var(--text)', fontSize:12, fontWeight: isActive ? 700 : 500 }}
              onMouseOver={e => { if(!isActive) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
              onMouseOut={e => { if(!isActive) e.currentTarget.style.background='transparent' }}>
              <span><Ic icon={s.icon} size={14} /></span>{s.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="settings-scroll" style={{ flex:1, minHeight:0, overflowY:'auto', padding:24, paddingBottom:120 }}>

        {/* Company Profile */}
        {settingsSec === 'company' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>COMPANY PROFILE</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Your carrier identity — used on rate cons, invoices, and FMCSA filings</div>
            </div>

            {/* Logo Upload */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:14 }}>Company Logo</div>
              <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                {/* Preview */}
                <div style={{ width:100, height:100, borderRadius:12, border:'2px dashed var(--border)', background:'var(--surface2)',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden', position:'relative' }}>
                  {company.logo
                    ? <img src={company.logo} alt="Company logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                    : (
                      <div style={{ textAlign:'center' }}>
                        <Ic icon={Truck} size={28} color="var(--muted)" />
                        <div style={{ fontSize:9, color:'var(--muted)', marginTop:4 }}>No logo</div>
                      </div>
                    )
                  }
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
                    {company.logo ? 'Logo uploaded ✓' : 'Upload your company logo'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
                    PNG, JPG, or SVG — max 2 MB<br/>
                    Shown on invoices, rate cons, and sidebar
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <label style={{ padding:'8px 16px', fontSize:12, fontWeight:700, borderRadius:8, background:'var(--accent)', color:'#000',
                      cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'inline-flex', alignItems:'center', gap:6 }}>
                      {company.logo ? 'Replace Logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" style={{ display:'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 2 * 1024 * 1024) { showToast('','File too large','Max 2 MB — try a smaller image'); return }
                          const reader = new FileReader()
                          reader.onload = ev => {
                            setCompany(c => ({ ...c, logo: ev.target.result }))
                            showToast('','Logo Uploaded', file.name + ' — save to apply')
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {company.logo && (
                      <button className="btn btn-ghost" style={{ fontSize:12 }}
                        onClick={() => { setCompany(c => ({ ...c, logo: '' })); showToast('','Logo Removed','Reverted to initials') }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <FieldRow label="Company Name"   value={company.name}    onChange={v => setCompany(c=>({...c,name:v}))} />
              <FieldRow label="MC Number"      value={company.mc}      onChange={v => setCompany(c=>({...c,mc:v}))} />
              <FieldRow label="DOT Number"     value={company.dot}     onChange={v => setCompany(c=>({...c,dot:v}))} />
              <FieldRow label="EIN"            value={company.ein}     onChange={v => setCompany(c=>({...c,ein:v}))} />
              <FieldRow label="Phone"          value={company.phone}   onChange={v => setCompany(c=>({...c,phone:v}))} />
              <FieldRow label="Email"          value={company.email}   onChange={v => setCompany(c=>({...c,email:v}))} type="email" />
              <div style={{ gridColumn:'1/-1' }}>
                <FieldRow label="Business Address" value={company.address} onChange={v => setCompany(c=>({...c,address:v}))} />
              </div>
            </div>
            <div>
              <button className="btn btn-primary" style={{ padding:'11px 28px' }} onClick={() => { updateCompany(company); showToast('','Saved','Company profile updated') }}>Save Changes</button>
            </div>
          </>
        )}

        {/* Load Boards */}
        {settingsSec === 'loadboards' && <LoadBoardSettings />}

        {/* Subscription Management */}
        {settingsSec === 'subscription' && <SubscriptionSettings />}

        {/* Billing & Pay */}
        {settingsSec === 'billing' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>BILLING & PAY SETTINGS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Factoring rate, default driver pay model, and invoice automation</div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Factoring Rate (%)</label>
                  <input type="number" value={billing.factoringRate} onChange={e => setBilling(b=>({...b,factoringRate:e.target.value}))} min="0" max="10" step="0.1"
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Default Driver Pay %</label>
                  <input type="text" value={billing.payDefault} onChange={e => setBilling(b=>({...b,payDefault:e.target.value}))}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }} />
                </div>
              </div>
              {[
                { key:'fastpayEnabled', label:'FastPay Enabled', sub:'Allow drivers to request same-day pay advances' },
                { key:'autoInvoice',    label:'Auto-Generate Invoices', sub:'Automatically create invoice when load is delivered' },
              ].map(opt => (
                <div key={opt.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'var(--surface2)', borderRadius:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.sub}</div>
                  </div>
                  <div onClick={() => setBilling(b=>({...b,[opt.key]:!b[opt.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background: billing[opt.key] ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s' }}>
                    <div style={{ position:'absolute', top:3, left: billing[opt.key] ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={() => showToast('','Saved','Billing settings updated')}>Save Changes</button>
          </>
        )}

        {/* Provider Keys */}
        {settingsSec === 'providers' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>PROVIDER API KEYS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your screening providers to automate driver onboarding checks</div>
            </div>

            <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.15)', borderRadius:10, padding:'14px 18px', fontSize:12, color:'var(--accent3)', lineHeight:1.6 }}>
              <strong>How it works:</strong> Your API keys are stored securely in your company record (encrypted, RLS-protected). When you add a new driver, Qivori automatically orders checks through your provider accounts. <strong>You only pay the providers directly — Qivori charges nothing extra.</strong>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14, width:'100%' }}>
              {[
                { section: 'Email (Consent Forms)', keys: [
                  { key:'resend_api_key', label:'Resend API Key', ph:'re_xxxxxxxx', link:'https://resend.com', note:'Free: 100 emails/day — sends consent forms to new drivers' },
                ]},
                { section: 'Background & Employment', keys: [
                  { key:'checkr_api_key', label:'Checkr API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://checkr.com', note:'Background checks + 3-year employment verification' },
                ]},
                { section: 'Motor Vehicle Record (MVR)', keys: [
                  { key:'sambasafety_api_key', label:'SambaSafety API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://sambasafety.com', note:'Instant MVR pulls from all 50 states' },
                  { key:'sambasafety_account_id', label:'SambaSafety Account ID', ph:'ACC-xxxxx' },
                ]},
                { section: 'FMCSA (Clearinghouse + PSP + CDL)', keys: [
                  { key:'fmcsa_api_key', label:'FMCSA Clearinghouse API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://clearinghouse.fmcsa.dot.gov', note:'Drug & alcohol violation queries ($1.25/query)' },
                  { key:'fmcsa_webkey', label:'FMCSA WebKey (PSP)', ph:'xxxxxxxxxxxxxxxx', link:'https://www.psp.fmcsa.dot.gov', note:'Safety reports + CDL verification ($10/report)' },
                ]},
                { section: 'Drug & Alcohol Testing', keys: [
                  { key:'fadv_client_id', label:'First Advantage Client ID', ph:'xxxxxxxxxxxxxxxx', link:'https://fadv.com', note:'DOT 5-panel drug & alcohol screening' },
                  { key:'fadv_client_secret', label:'First Advantage Client Secret', ph:'xxxxxxxxxxxxxxxx' },
                ]},
              ].map(group => (
                <div key={group.section} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', width:'100%' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{group.section}</div>
                    {group.keys.every(k => providerKeys[k.key]) && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(34,197,94,0.1)', color:'var(--success)' }}>Connected</span>
                    )}
                    {group.keys.every(k => !providerKeys[k.key]) && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(74,85,112,0.15)', color:'var(--muted)' }}>Not set</span>
                    )}
                  </div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                    {group.keys.map(k => (
                      <div key={k.key}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <label style={{ fontSize:11, color:'var(--muted)' }}>{k.label}</label>
                          {k.link && <a href={k.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'var(--accent3)', textDecoration:'none' }}>Sign up →</a>}
                        </div>
                        <input
                          type="password"
                          value={providerKeys[k.key]}
                          onChange={e => setProviderKeys(p => ({ ...p, [k.key]: e.target.value }))}
                          placeholder={k.ph}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }}
                        />
                        {k.note && <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{k.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button className="btn btn-primary" style={{ alignSelf:'flex-start', padding:'12px 32px', fontSize:13, fontWeight:700 }} onClick={saveProviderKeys}>
                Save Provider Keys
              </button>
            </div>
          </>
        )}

        {/* Integrations */}
        {settingsSec === 'integrations' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>INTEGRATIONS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your ELD, fuel card, accounting, and load board</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {/* Fuel Card Provider */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={Fuel} size={22} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Fuel Card</div>
                  <select value={fuelCard} onChange={e => { setFuelCard(e.target.value); updateCompany({ fuel_card_provider: e.target.value }); showToast('', 'Saved', e.target.value || 'Fuel card cleared') }}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                    <option value="">Select your fuel card...</option>
                    {['EFS (WEX/Fleet One)', 'Comdata', 'TCS Fuel Card', 'Pilot RoadRunner', 'Loves Fleet Card', 'RTS Fuel Card', 'Mudflap', 'AtoB', 'Coast', 'Fuelman', 'Voyager', 'Pacific Pride', 'CFN', 'T-Chek', 'MultiService', 'I don\'t use a fuel card', 'Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Toll Transponder */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={Route} size={22} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Toll Transponder</div>
                  <select value={tollTransponder} onChange={e => { setTollTransponder(e.target.value); updateCompany({ toll_transponder: e.target.value }); showToast('', 'Saved', e.target.value || 'Toll transponder cleared') }}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                    <option value="">Select your toll transponder...</option>
                    {['Bestpass', 'PrePass', 'E-ZPass', 'SunPass (FL)', 'TxTag (TX)', 'I-PASS (IL)', 'Peach Pass (GA)', 'PikePass (OK)', 'Good To Go (WA)', 'FasTrak (CA)', 'I don\'t use a transponder', 'Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {integrations.map(int => (
                <div key={int.name} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={int.icon} size={22} /></div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>{int.name}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:int.statusC+'15', color:int.statusC }}>{int.status}</span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{int.desc}</div>
                  </div>
                  <button className={int.status === 'Connected' ? 'btn btn-ghost' : 'btn btn-primary'} style={{ fontSize:11 }}
                    onClick={() => showToast('', int.status === 'Connected' ? 'Disconnect' : 'Connect', int.name)}>
                    {int.status === 'Connected' ? 'Manage' : '+ Connect'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Team */}
        {settingsSec === 'team' && (
          <TeamManagement />
        )}

        {/* Notifications */}
        {settingsSec === 'notifications' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>NOTIFICATION PREFERENCES</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Choose what alerts appear in your notification bell and email</div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              {[
                { key:'newMatch',    label:'AI Load Matches',      sub:'When AI finds a high-score load on your lanes' },
                { key:'loadStatus',  label:'Load Status Changes',  sub:'Pickup confirmed, delivered, exceptions' },
                { key:'driverAlert', label:'Driver Alerts',        sub:'HOS violations, CDL expiry, inspection due' },
                { key:'payReady',    label:'Payment Ready',        sub:'FastPay available, invoice paid, factoring funded' },
                { key:'compliance',  label:'Compliance Warnings',  sub:'Registration, insurance, DOT inspection due' },
                { key:'marketRates', label:'Market Rate Alerts',   sub:'When rates spike 10%+ on your active lanes' },
              ].map((opt, i, arr) => (
                <div key={opt.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.sub}</div>
                  </div>
                  <div onClick={() => setNotifPrefs(p=>({...p,[opt.key]:!p[opt.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background: notifPrefs[opt.key] ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:3, left: notifPrefs[opt.key] ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={() => showToast('','Saved','Notification preferences saved')}>Save Preferences</button>
          </>
        )}

        {/* SMS Alerts */}
        {settingsSec === 'sms' && (
          <SMSSettings />
        )}

        {/* Invoicing Settings */}
        {settingsSec === 'invoicing' && (
          <InvoicingSettings />
        )}

        {/* Appearance */}
        {settingsSec === 'appearance' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>APPEARANCE & ACCESSIBILITY</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Customize how Qivori looks — including colorblind-safe modes</div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Palette} size={14} /> Color Theme</div>
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  {
                    id: 'default',
                    label: 'Default Dark',
                    sub: 'The classic Qivori dark theme — gold accents, deep navy background',
                    icon: Moon,
                    preview: ['#07090e','#f0a500','#22c55e','#ef4444'],
                  },
                  {
                    id: 'colorblind',
                    label: 'Colorblind Mode',
                    sub: 'Okabe-Ito palette — designed for deuteranopia & protanopia. Replaces red/green with orange/blue.',
                    icon: Eye,
                    badge: 'RECOMMENDED',
                    preview: ['#07090e','#f0a500','#0072b2','#d55e00'],
                  },
                  {
                    id: 'high-contrast',
                    label: 'High Contrast',
                    sub: 'Pure black background, bold borders, brighter text — ideal for bright sunlight in cab or low-vision users',
                    icon: Zap,
                    preview: ['#000000','#ffc200','#00e676','#ff5252'],
                  },
                ].map(t => {
                  const isActive = theme === t.id
                  return (
                    <div key={t.id} onClick={() => { setTheme(t.id); showToast('', t.label + ' activated', t.sub.split(' — ')[0]) }}
                      style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 16px', borderRadius:10, cursor:'pointer',
                        background: isActive ? 'rgba(240,165,0,0.07)' : 'var(--surface2)',
                        border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        transition:'all 0.15s' }}>
                      <span style={{ flexShrink:0 }}><Ic icon={t.icon} size={22} /></span>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{t.label}</span>
                          {t.badge && <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(240,165,0,0.15)', color:'var(--accent)', letterSpacing:1 }}>{t.badge}</span>}
                          {isActive && <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,0.15)', color:'var(--success)', letterSpacing:1 }}>ACTIVE</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>{t.sub}</div>
                      </div>
                      {/* Color swatches */}
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        {t.preview.map((c, i) => (
                          <div key={i} style={{ width:16, height:16, borderRadius:'50%', background:c, border:'1px solid rgba(255,255,255,0.1)' }}/>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12, padding:'14px 18px' }}>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.7 }}>
                <strong style={{ color:'var(--text)' }}>Why this matters:</strong> ~8% of men have red-green colorblindness — in a male-dominated industry like trucking, that's roughly 1 in 12 dispatchers or drivers. Colorblind mode ensures critical alerts (overdue, high-score loads, danger zones) are always distinguishable regardless of color vision.
              </div>
            </div>
          </>
        )}


      </div>
    </div>
  )
}

// ── Load Board Connection Settings ────────────────────────────────────────────
const LB_PROVIDERS = [
  {
    id: 'dat',
    name: 'DAT Load Board',
    desc: 'Premium freight marketplace — 500M+ loads/year. Requires DAT API partnership.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Your DAT API Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your DAT API Client Secret' },
    ],
    color: '#22c55e',
    signupUrl: 'https://developer.dat.com',
  },
  {
    id: '123loadboard',
    name: '123Loadboard',
    desc: 'Affordable load board with API access — great for small fleets. $200-500/mo.',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'Your 123Loadboard API Key' },
    ],
    color: '#3b82f6',
    signupUrl: 'https://www.123loadboard.com',
  },
  {
    id: 'truckstop',
    name: 'Truckstop.com',
    desc: 'Full-service load board with rate intelligence and carrier tools.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Your Truckstop Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Truckstop Client Secret' },
    ],
    color: '#f0a500',
    signupUrl: 'https://truckstop.com',
  },
]

function LoadBoardSettings() {
  const { showToast } = useApp()
  const [connections, setConnections] = useState({}) // { dat: { status, connected_at }, ... }
  const [credentials, setCredentials] = useState({}) // { dat: { clientId:'', clientSecret:'' }, ... }
  const [testing, setTesting] = useState(null) // provider being tested
  const [saving, setSaving] = useState(null) // provider being saved
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null) // which provider form is expanded

  // Fetch existing connections on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/load-board-credentials')
        if (res.ok) {
          const { credentials: creds } = await res.json()
          const connMap = {}
          for (const c of (creds || [])) {
            connMap[c.provider] = { status: c.status, connected_at: c.connected_at, last_tested: c.last_tested }
          }
          setConnections(connMap)
        }
      } catch { /* non-critical: load board credentials fetch failed */ }
      setLoading(false)
    })()
  }, [])

  const saveCredentials = async (provider) => {
    const creds = credentials[provider]
    if (!creds) return
    setSaving(provider)
    try {
      const res = await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, credentials: creds }),
      })
      const data = await res.json()
      if (data.success) {
        setConnections(prev => ({ ...prev, [provider]: { status: data.status, connected_at: new Date().toISOString(), last_tested: new Date().toISOString() } }))
        showToast('success', data.status === 'connected' ? 'Connected!' : 'Saved', data.testResult?.message || `${provider} credentials saved`)
        if (data.status === 'connected') setExpanded(null)
      } else {
        showToast('error', 'Error', data.error || 'Failed to save')
      }
    } catch (err) {
      showToast('error', 'Error', err.message || 'Network error')
    }
    setSaving(null)
  }

  const testConnection = async (provider) => {
    const creds = credentials[provider]
    if (!creds) return
    setTesting(provider)
    try {
      const res = await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, credentials: creds, action: 'test' }),
      })
      const data = await res.json()
      if (data.success) {
        setConnections(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'connected', last_tested: new Date().toISOString() } }))
        showToast('success', 'Test Passed', data.message)
      } else {
        showToast('error', 'Test Failed', data.message)
      }
    } catch { /* non-critical error */
      showToast('error', 'Test Failed', 'Could not reach server')
    }
    setTesting(null)
  }

  const disconnect = async (provider) => {
    try {
      await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, action: 'disconnect' }),
      })
      setConnections(prev => { const n = { ...prev }; delete n[provider]; return n })
      setCredentials(prev => { const n = { ...prev }; delete n[provider]; return n })
      showToast('success', 'Disconnected', `${provider} removed`)
    } catch { /* non-critical: disconnect request failed */ }
  }

  const connectedCount = Object.values(connections).filter(c => c.status === 'connected').length

  return (
    <>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>LOAD BOARD CONNECTIONS</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your own load board accounts so Qivori AI can find loads for you automatically</div>
      </div>

      {/* Info banner */}
      <div style={{ background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.15)', borderRadius:10, padding:'14px 18px', fontSize:12, color:'var(--accent3)', lineHeight:1.6 }}>
        <strong>How it works:</strong> Enter your load board API credentials below. They're encrypted with AES-256 and stored securely — only used to search loads on your behalf. <strong>Your credentials are never shared with other users or exposed in the app.</strong>
      </div>

      {/* Connection status summary */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background: connectedCount > 0 ? '#22c55e' : '#6b7590' }} />
        <span style={{ fontSize:12, fontWeight:700 }}>
          {connectedCount > 0 ? `${connectedCount} load board${connectedCount > 1 ? 's' : ''} connected` : 'No load boards connected'}
        </span>
      </div>

      {/* Provider cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {LB_PROVIDERS.map(prov => {
          const conn = connections[prov.id]
          const isConnected = conn?.status === 'connected'
          const isExpanded = expanded === prov.id
          const creds = credentials[prov.id] || {}
          const isSaving = saving === prov.id
          const isTesting = testing === prov.id

          return (
            <div key={prov.id} style={{ background:'var(--surface)', border:`1px solid ${isConnected ? prov.color + '40' : 'var(--border)'}`, borderRadius:12, overflow:'hidden' }}>
              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px', cursor:'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : prov.id)}>
                <div style={{ width:44, height:44, borderRadius:10, background: isConnected ? prov.color + '15' : 'var(--surface2)', border:`1px solid ${isConnected ? prov.color + '30' : 'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Ic icon={Globe} size={22} color={isConnected ? prov.color : 'var(--muted)'} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>{prov.name}</span>
                    {isConnected ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background: prov.color + '15', color: prov.color, display:'flex', alignItems:'center', gap:3 }}>
                        <Ic icon={CheckCircle} size={10} /> Connected
                      </span>
                    ) : conn?.status === 'error' ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(239,68,68,0.1)', color:'#ef4444' }}>
                        Connection Error
                      </span>
                    ) : (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(107,117,144,0.1)', color:'var(--muted)' }}>
                        Not Connected
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{prov.desc}</div>
                </div>
                <Ic icon={isExpanded ? ChevronLeft : Plus} size={16} color="var(--muted)" style={{ transform: isExpanded ? 'rotate(-90deg)' : 'none', transition:'transform 0.2s' }} />
              </div>

              {/* Expanded credential form */}
              {isExpanded && (
                <div style={{ padding:'0 20px 20px', borderTop:'1px solid var(--border)' }}>
                  <div style={{ paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
                    {prov.fields.map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                        <input
                          type="password"
                          value={creds[f.key] || ''}
                          onChange={e => setCredentials(prev => ({ ...prev, [prov.id]: { ...prev[prov.id], [f.key]: e.target.value } }))}
                          placeholder={f.placeholder}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }}
                        />
                      </div>
                    ))}
                    <div style={{ fontSize:10, color:'var(--muted)' }}>
                      Don't have an account? <a href={prov.signupUrl} target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent3)', textDecoration:'none' }}>Sign up at {prov.signupUrl} →</a>
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:4 }}>
                      <button className="btn btn-primary" style={{ fontSize:12, padding:'9px 20px' }}
                        disabled={isSaving || !prov.fields.every(f => creds[f.key])}
                        onClick={() => saveCredentials(prov.id)}>
                        {isSaving ? 'Saving...' : isConnected ? 'Update & Test' : 'Connect & Test'}
                      </button>
                      {isConnected && (
                        <>
                          <button className="btn btn-ghost" style={{ fontSize:12 }}
                            disabled={isTesting}
                            onClick={() => testConnection(prov.id)}>
                            {isTesting ? 'Testing...' : 'Test Connection'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize:12, color:'#ef4444' }}
                            onClick={() => disconnect(prov.id)}>
                            Disconnect
                          </button>
                        </>
                      )}
                    </div>
                    {conn?.last_tested && (
                      <div style={{ fontSize:10, color:'var(--muted)' }}>
                        Last tested: {new Date(conn.last_tested).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Profit IQ tab ──────────────────────────────────────────────────────────────
// ── PROFIT IQ ─────────────────────────────────────────────────────────────────
const PIQ_TABS = ['Overview', 'Per Load', 'By Driver', 'By Broker']

function ProfitIQTab() {
  const { loads, expenses, totalRevenue, totalExpenses, drivers: ctxDrivers } = useCarrier()
  const [tab, setTab] = useState('Overview')

  // ── computed base data ──────────────────────────────────────────────────────
  const completedLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const activeLoads    = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))

  // Per-load profit: gross minus estimated driver pay (28%) and fuel ($0.22/mi)
  const loadProfit = completedLoads.map(l => {
    const gross      = l.gross || 0
    const miles      = parseFloat(l.miles) || 0
    const driverPay  = Math.round(gross * 0.28)
    const fuelCost   = Math.round(miles * 0.22)
    const net        = gross - driverPay - fuelCost
    const margin     = gross > 0 ? ((net / gross) * 100).toFixed(1) : '0.0'
    const rpm        = parseFloat(l.rate) || (miles > 0 ? gross / miles : 0)
    return { ...l, driverPay, fuelCost, net, margin: parseFloat(margin), rpm }
  }).sort((a,b) => b.net - a.net)

  // Expense breakdown from real context
  const expCats = ['Fuel','Driver Pay','Insurance','Maintenance','Tolls','Lumper','Permits','Other']
  const catColors = { Fuel:'var(--warning)', 'Driver Pay':'var(--accent)', Insurance:'var(--accent2)', Maintenance:'var(--danger)', Tolls:'var(--accent3)', Lumper:'var(--success)', Permits:'var(--muted)', Other:'var(--muted)' }
  const realFuel = expenses.filter(e => e.cat === 'Fuel').reduce((s,e) => s + e.amount, 0)
  const estimatedDriverPay = completedLoads.reduce((s,l) => s + Math.round((l.gross||0)*0.28), 0)
  const otherExpenses = expenses.filter(e => e.cat !== 'Fuel')
  const otherTotal = otherExpenses.reduce((s,e) => s + e.amount, 0)
  const totalForBreakdown = realFuel + estimatedDriverPay + otherTotal || 1
  const expBreakdown = [
    { label:'Driver Pay',  amount: estimatedDriverPay, color:'var(--accent)' },
    { label:'Fuel',        amount: realFuel, color:'var(--warning)' },
    ...['Maintenance','Insurance','Tolls','Lumper','Permits'].map(cat => ({
      label: cat,
      amount: expenses.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0),
      color: catColors[cat] || 'var(--muted)',
    })).filter(x => x.amount > 0),
  ].map(x => ({ ...x, pct: Math.round((x.amount/totalForBreakdown)*100) }))

  // Per driver
  const drivers = [...new Set(completedLoads.map(l => l.driver).filter(Boolean))]
  const driverStats = drivers.map(name => {
    const dLoads  = loadProfit.filter(l => l.driver === name)
    const gross   = dLoads.reduce((s,l) => s + l.gross, 0)
    const net     = dLoads.reduce((s,l) => s + l.net, 0)
    const miles   = dLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
    const avgRPM  = miles > 0 ? (gross/miles).toFixed(2) : '—'
    const margin  = gross > 0 ? ((net/gross)*100).toFixed(1) : '0.0'
    return { name, loads: dLoads.length, gross, net, miles, avgRPM, margin: parseFloat(margin) }
  }).sort((a,b) => b.net - a.net)

  // Per broker
  const brokers = [...new Set(completedLoads.map(l => l.broker).filter(Boolean))]
  const brokerStats = brokers.map(name => {
    const bLoads   = loadProfit.filter(l => l.broker === name)
    const gross    = bLoads.reduce((s,l) => s + l.gross, 0)
    const net      = bLoads.reduce((s,l) => s + l.net, 0)
    const miles    = bLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
    const avgRPM   = miles > 0 ? (gross/miles).toFixed(2) : '—'
    const avgLoad  = bLoads.length > 0 ? Math.round(gross/bLoads.length) : 0
    return { name, loads: bLoads.length, gross, net, avgRPM, avgLoad, margin: gross>0?((net/gross)*100).toFixed(1):'0.0' }
  }).sort((a,b) => b.gross - a.gross)

  // Historical months for chart (generate from current month going back 6)
  const histMonths  = (() => {
    const m = []; const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      m.push(d.toLocaleDateString('en-US', { month:'short' }))
    }
    return m
  })()
  const histRev     = histMonths.map((_, i) => i < 5 ? 0 : totalRevenue)
  const histExp     = histMonths.map((_, i) => i < 5 ? 0 : totalExpenses)
  // Fill earlier months from loads data
  ;(() => {
    const now = new Date()
    loads.forEach(l => {
      const dateStr = l.pickup_date || l.pickupDate || l.delivery_date || l.created_at
      if (!dateStr) return
      const d = new Date(dateStr)
      if (isNaN(d)) return
      const diffMonths = (now.getFullYear()-d.getFullYear())*12 + now.getMonth()-d.getMonth()
      const idx = 5 - diffMonths
      if (idx >= 0 && idx < 5) histRev[idx] += Number(l.gross || l.gross_pay || 0)
    })
    expenses.forEach(e => {
      const d = new Date(e.date)
      if (isNaN(d)) return
      const diffMonths = (now.getFullYear()-d.getFullYear())*12 + now.getMonth()-d.getMonth()
      const idx = 5 - diffMonths
      if (idx >= 0 && idx < 5) histExp[idx] += Number(e.amount || 0)
    })
  })()
  const histNet     = histRev.map((r,i) => r - histExp[i])
  const maxBar      = Math.max(...histRev, 1)

  const netProfit   = totalRevenue - totalExpenses
  const margin      = totalRevenue > 0 ? ((netProfit/totalRevenue)*100).toFixed(1) : '0.0'
  const totalMiles  = completedLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
  const cpm         = totalMiles > 0 ? (totalExpenses/totalMiles).toFixed(2) : '—'
  const truckCt     = Math.max((ctxDrivers || []).length || 1, 1)
  const revPerTruck = Math.round(totalRevenue / truckCt)
  const breakEven   = Math.round(totalExpenses * 0.8) || 10000

  const statBg  = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', textAlign:'center' }
  const valStyle= (color, size=26) => ({ fontFamily:"'Bebas Neue',sans-serif", fontSize:size, color, lineHeight:1.1 })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'auto' }}>

      {/* Sub-tab bar */}
      <div style={{ flexShrink:0, background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 20px', display:'flex', alignItems:'center', gap:2 }}>
        {PIQ_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'11px 18px', border:'none', borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: tab===t ? 'var(--accent)' : 'var(--muted)', fontSize:13, fontWeight: tab===t ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1 }}>
            {t}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ fontSize:11, color:'var(--muted)', padding:'0 8px' }}>
          {completedLoads.length} completed loads · ${totalRevenue.toLocaleString()} MTD
        </div>
      </div>

      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

        {/* ── OVERVIEW ── */}
        {tab === 'Overview' && (<>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12 }}>
            {[
              { label:'Gross Revenue MTD', value:'$'+totalRevenue.toLocaleString(), color:'var(--accent)' },
              { label:'Total Expenses MTD', value:'$'+totalExpenses.toLocaleString(), color:'var(--danger)' },
              { label:'Net Profit MTD', value:'$'+netProfit.toLocaleString(), color:'var(--success)', big:true },
              { label:'Profit Margin', value:margin+'%', color: parseFloat(margin)>=30?'var(--success)':parseFloat(margin)>=20?'var(--warning)':'var(--danger)' },
              { label:'Cost Per Mile', value: cpm==='—'?'—':'$'+cpm, color:'var(--accent2)' },
            ].map(s => (
              <div key={s.label} style={statBg}>
                <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                <div style={valStyle(s.color, s.big?32:24)}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16 }}>
            {/* P&L Bar Chart */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> 6-Month P&L</div>
                <div style={{ display:'flex', gap:14 }}>
                  {[{c:'var(--accent)',l:'Revenue'},{c:'var(--danger)',l:'Expenses'},{c:'var(--success)',l:'Net'}].map(x=>(
                    <div key={x.l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--muted)' }}>
                      <div style={{ width:8,height:8,borderRadius:2,background:x.c }}/>
                      {x.l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding:'16px 20px 8px' }}>
                <div style={{ display:'flex', alignItems:'flex-end', gap:10, height:140 }}>
                  {histMonths.map((m,i) => {
                    const isCurrent = i === histMonths.length - 1
                    return (
                      <div key={m} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                        <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:120, justifyContent:'center' }}>
                          <div style={{ width:'30%', height:`${(histRev[i]/maxBar)*120}px`, background:'var(--accent)', borderRadius:'3px 3px 0 0', opacity: isCurrent?1:0.55 }} title={`$${histRev[i].toLocaleString()}`}/>
                          <div style={{ width:'30%', height:`${(histExp[i]/maxBar)*120}px`, background:'var(--danger)', borderRadius:'3px 3px 0 0', opacity: isCurrent?1:0.55 }} title={`$${histExp[i].toLocaleString()}`}/>
                          <div style={{ width:'30%', height:`${(Math.max(histNet[i],0)/maxBar)*120}px`, background:'var(--success)', borderRadius:'3px 3px 0 0' }} title={`$${histNet[i].toLocaleString()}`}/>
                        </div>
                        <div style={{ fontSize:10, color: isCurrent?'var(--accent)':'var(--muted)', fontWeight: isCurrent?700:400 }}>{m}</div>
                        {isCurrent && <div style={{ fontSize:9, color:'var(--accent)', fontWeight:700 }}>LIVE</div>}
                      </div>
                    )
                  })}
                </div>
                {/* Value labels */}
                <div style={{ display:'flex', gap:10, paddingTop:8, borderTop:'1px solid var(--border)', marginTop:4 }}>
                  {histMonths.map((m,i) => (
                    <div key={m} style={{ flex:1, textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'var(--success)', fontWeight:700 }}>${(histNet[i]/1000).toFixed(1)}K</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Expense Mix — real from context */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={DollarSign} size={14} /> Expense Mix</div>
              <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
                {expBreakdown.length === 0
                  ? <div style={{ color:'var(--muted)', fontSize:12, padding:'8px 0' }}>No expenses logged yet</div>
                  : expBreakdown.map(e => (
                    <div key={e.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                        <span style={{ color:'var(--muted)' }}>{e.label}</span>
                        <span style={{ fontWeight:700 }}>${e.amount.toLocaleString()} <span style={{ color:'var(--muted)', fontWeight:400 }}>({e.pct}%)</span></span>
                      </div>
                      <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
                        <div style={{ height:'100%', width:`${e.pct}%`, background:e.color, borderRadius:3, transition:'width 0.5s' }}/>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Bottom stat row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
            {[
              { icon: Scale, label:'Break-Even Point', value:`$${breakEven.toLocaleString()}/mo`, sub:'Fixed cost floor', color:'var(--accent)' },
              { icon: Truck, label:'Revenue per Truck', value:`$${revPerTruck.toLocaleString()}`, sub:'3-truck fleet avg', color:'var(--accent2)' },
              { icon: Package, label:'Loads Completed', value:String(completedLoads.length), sub:`${activeLoads.length} active now`, color:'var(--success)' },
              { icon: MapPin, label:'Total Miles Run', value:totalMiles.toLocaleString(), sub:'Completed loads only', color:'var(--warning)' },
            ].map(s => (
              <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', display:'flex', gap:12, alignItems:'center' }}>
                <span><Ic icon={s.icon} size={22} color={s.color} /></span>
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{s.label}</div>
                  <div style={valStyle(s.color, 22)}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* ── PER LOAD ── */}
        {tab === 'Per Load' && (<>
          {/* Top 3 summary */}
          {loadProfit.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
              {[
                { label:'Best Load', load: loadProfit[0], color:'var(--success)' },
                { label:'Avg Net Profit', load: null, avg: loadProfit.length ? Math.round(loadProfit.reduce((s,l)=>s+l.net,0)/loadProfit.length) : 0, color:'var(--accent)' },
                { label:'Worst Load', load: loadProfit[loadProfit.length-1], color:'var(--danger)' },
              ].map(s => (
                <div key={s.label} style={statBg}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                  {s.load
                    ? <>
                        <div style={valStyle(s.color, 22)}>${s.load.net.toLocaleString()}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{s.load.loadId} · {s.load.broker}</div>
                      </>
                    : <div style={valStyle(s.color, 22)}>${s.avg.toLocaleString()}</div>
                  }
                </div>
              ))}
            </div>
          )}

          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Package} size={14} /> Load Profitability — Ranked by Net</div>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{loadProfit.length} completed loads</span>
            </div>
            {loadProfit.length === 0
              ? <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No completed loads yet — mark loads as Delivered to see profitability.</div>
              : <>
                  <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 90px 80px 80px 80px 80px 80px', padding:'8px 18px', borderBottom:'1px solid var(--border)', gap:8 }}>
                    {['Load ID','Route / Broker','Driver','Gross','Driver Pay','Fuel Est','Net','Margin'].map(h => (
                      <div key={h} style={{ fontSize:9, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>{h}</div>
                    ))}
                  </div>
                  {loadProfit.map((l, i) => {
                    const mc = l.margin >= 35 ? 'var(--success)' : l.margin >= 25 ? 'var(--accent)' : l.margin >= 15 ? 'var(--warning)' : 'var(--danger)'
                    const route = l.origin && l.dest ? l.origin.split(',')[0].substring(0,3).toUpperCase() + ' → ' + l.dest.split(',')[0].substring(0,3).toUpperCase() : l.loadId
                    return (
                      <div key={l.loadId} style={{ display:'grid', gridTemplateColumns:'80px 1fr 90px 80px 80px 80px 80px 80px', padding:'12px 18px', borderBottom:'1px solid var(--border)', gap:8, alignItems:'center', background: i===0 ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                        <div style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'var(--accent)' }}>{l.loadId}</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{route}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{l.broker} · {l.miles}mi · ${parseFloat(l.rate||0).toFixed(2)}/mi</div>
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{l.driver || '—'}</div>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${l.gross.toLocaleString()}</div>
                        <div style={{ fontSize:12, color:'var(--danger)' }}>−${l.driverPay.toLocaleString()}</div>
                        <div style={{ fontSize:12, color:'var(--warning)' }}>−${l.fuelCost.toLocaleString()}</div>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${l.net.toLocaleString()}</div>
                        <div>
                          <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:8, background:mc+'18', color:mc }}>{l.margin}%</span>
                        </div>
                      </div>
                    )
                  })}
                </>
            }
          </div>
        </>)}

        {/* ── BY DRIVER ── */}
        {tab === 'By Driver' && (<>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.max(driverStats.length,1)},1fr)`, gap:12 }}>
            {driverStats.length === 0
              ? <div style={{ ...statBg, color:'var(--muted)', fontSize:13 }}>No completed loads yet</div>
              : driverStats.map((d,i) => (
                <div key={d.name} style={{ background:'var(--surface)', border:`1px solid ${i===0?'rgba(34,197,94,0.35)':'var(--border)'}`, borderRadius:12, padding:18 }}>
                  {i===0 && <div style={{ fontSize:9, fontWeight:800, color:'var(--success)', letterSpacing:2, marginBottom:6 }}>TOP PERFORMER</div>}
                  <div style={{ fontSize:15, fontWeight:800, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}><Ic icon={User} size={15} /> {d.name}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {[
                      { label:'Loads',        value: String(d.loads),          color:'var(--accent2)' },
                      { label:'Gross Rev',    value: '$'+d.gross.toLocaleString(), color:'var(--accent)' },
                      { label:'Net Profit',   value: '$'+d.net.toLocaleString(),   color:'var(--success)' },
                      { label:'Avg RPM',      value: '$'+d.avgRPM,             color:'var(--accent3)' },
                      { label:'Miles Run',    value: d.miles.toLocaleString(),  color:'var(--muted)' },
                      { label:'Margin',       value: d.margin+'%',              color: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' },
                    ].map(s => (
                      <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2, textTransform:'uppercase', letterSpacing:1 }}>{s.label}</div>
                        <div style={valStyle(s.color, 18)}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Margin bar */}
                  <div style={{ marginTop:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:4 }}>
                      <span>Profit Margin</span><span style={{ fontWeight:700, color: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' }}>{d.margin}%</span>
                    </div>
                    <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                      <div style={{ height:'100%', width:`${Math.min(d.margin,60)}%`, background: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)', borderRadius:3, transition:'width 0.5s' }}/>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>

          {/* Driver efficiency table */}
          {driverStats.length > 0 && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> Driver Comparison</div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Driver','Loads','Total Miles','Gross Revenue','Net Profit','Avg RPM','Margin'].map(h => (
                      <th key={h} style={{ padding:'10px 16px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map(d => (
                    <tr key={d.name} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700 }}>{d.name}</td>
                      <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{d.loads}</td>
                      <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{d.miles.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${d.gross.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${d.net.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontSize:12, fontWeight:700, color:'var(--accent2)' }}>${d.avgRPM}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:8, background:(d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)')+'18', color:d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' }}>{d.margin}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {/* ── BY BROKER ── */}
        {tab === 'By Broker' && (<>
          {brokerStats.length === 0
            ? <div style={{ ...statBg, color:'var(--muted)', fontSize:13, textAlign:'center', padding:40 }}>No completed loads yet</div>
            : <>
                {/* Broker cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
                  {brokerStats.map((b,i) => {
                    const mc = parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)'
                    return (
                      <div key={b.name} style={{ background:'var(--surface)', border:`1px solid ${i===0?'rgba(240,165,0,0.35)':'var(--border)'}`, borderRadius:12, padding:18 }}>
                        {i===0 && <div style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:6 }}>MOST VOLUME</div>}
                        <div style={{ fontSize:14, fontWeight:800, marginBottom:4, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Building2} size={14} /> {b.name}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>LOADS</div>
                            <div style={valStyle('var(--accent2)',20)}>{b.loads}</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>AVG RPM</div>
                            <div style={valStyle('var(--accent)',20)}>${b.avgRPM}</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>AVG LOAD</div>
                            <div style={valStyle('var(--accent3)',20)}>${b.avgLoad.toLocaleString()}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                          <span style={{ color:'var(--muted)' }}>Total Gross</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${b.gross.toLocaleString()}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:8 }}>
                          <span style={{ color:'var(--muted)' }}>Net Profit</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${b.net.toLocaleString()}</span>
                        </div>
                        <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                          <div style={{ height:'100%', width:`${Math.min(parseFloat(b.margin),60)}%`, background:mc, borderRadius:3 }}/>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginTop:4 }}>
                          <span>Net margin</span>
                          <span style={{ fontWeight:700, color:mc }}>{b.margin}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Broker table */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> Broker Ranking</div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['#','Broker','Loads','Total Gross','Net Profit','Avg RPM','Avg Load','Margin'].map(h => (
                          <th key={h} style={{ padding:'10px 16px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {brokerStats.map((b,i) => (
                        <tr key={b.name} style={{ borderBottom:'1px solid var(--border)', background: i===0?'rgba(240,165,0,0.02)':'transparent' }}>
                          <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>#{i+1}</td>
                          <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700 }}>{b.name}</td>
                          <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{b.loads}</td>
                          <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${b.gross.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${b.net.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px', fontSize:12, fontWeight:700, color:'var(--accent2)' }}>${b.avgRPM}</td>
                          <td style={{ padding:'12px 16px', fontSize:12, color:'var(--muted)' }}>${b.avgLoad.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px' }}>
                            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:8, background:(parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)')+'18', color:parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)' }}>{b.margin}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
          }
        </>)}

      </div>
    </div>
  )
}

// ── Dispatch tab ───────────────────────────────────────────────────────────────
const DRIVERS = [] // populated from context
const STATUS_FLOW = ['Rate Con Received', 'Assigned to Driver', 'En Route to Pickup', 'Loaded', 'In Transit', 'Delivered', 'Invoiced']
const STATUS_COLORS = {
  'Rate Con Received': 'var(--accent)',
  'Assigned to Driver': 'var(--accent3)',
  'En Route to Pickup': 'var(--accent2)',
  'Loaded': 'var(--accent2)',
  'In Transit': 'var(--success)',
  'Delivered': 'var(--muted)',
  'Invoiced': 'var(--success)',
}

// ── Rate Con parser — calls Claude API via backend ────────────────────────────
async function parseRateConWithAI(file) {
  // Compress image before sending
  let b64, mt
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Compression timed out')), 15000)
      if ((file.type || '').includes('pdf') || file.name.endsWith('.pdf')) {
        const reader = new FileReader()
        reader.onload = () => { clearTimeout(timeout); resolve({ b64: reader.result.split(',')[1], mt: 'application/pdf' }) }
        reader.onerror = () => { clearTimeout(timeout); reject(new Error('Could not read PDF')) }
        reader.readAsDataURL(file)
        return
      }
      const img = new Image()
      img.onload = () => {
        clearTimeout(timeout)
        const maxW = 800; let w = img.width, h = img.height
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve({ b64: c.toDataURL('image/jpeg', 0.6).split(',')[1], mt: 'image/jpeg' })
      }
      img.onerror = () => {
        clearTimeout(timeout)
        const reader = new FileReader()
        reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: file.type || 'image/jpeg' })
        reader.onerror = () => reject(new Error('Could not read file'))
        reader.readAsDataURL(file)
      }
      img.src = URL.createObjectURL(file)
    })
    b64 = result.b64
    mt = result.mt
  } catch (compErr) {
    throw compErr
  }

  const res = await apiFetch('/api/parse-ratecon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: b64, mediaType: mt })
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { throw new Error('Invalid response: ' + text.slice(0, 100)) }
  if (data.error) throw new Error(data.error)
  return {
    loadId: data.load_number || '',
    broker: data.broker || '',
    brokerPhone: data.broker_phone || '',
    brokerEmail: data.broker_email || '',
    driver: '',
    refNum: data.reference_number || data.po_number || '',
    origin: data.origin || '',
    originAddress: data.origin_address || '',
    originZip: data.origin_zip || '',
    shipperName: data.shipper_name || '',
    shipperPhone: data.shipper_phone || '',
    dest: data.destination || '',
    destAddress: data.destination_address || '',
    destZip: data.destination_zip || '',
    consigneeName: data.consignee_name || '',
    consigneePhone: data.consignee_phone || '',
    rate: data.rate ? String(data.rate) : '',
    miles: data.miles ? String(data.miles) : '',
    weight: data.weight ? String(data.weight) : '',
    commodity: data.commodity || '',
    pickup: data.pickup_date || '',
    pickupTime: data.pickup_time || '',
    delivery: data.delivery_date || '',
    deliveryTime: data.delivery_time || '',
    equipment: data.equipment || '',
    notes: data.notes || '',
    specialInstructions: data.special_instructions || '',
    gross: data.rate ? parseFloat(data.rate) : 0,
  }
}

const DOC_TYPES = ['Rate Con', 'BOL', 'POD', 'Lumper Receipt', 'Scale Ticket', 'Other']
const DOC_ICONS = { 'Rate Con': FileText, 'BOL': ClipboardList, 'POD': CheckCircle, 'Lumper Receipt': Receipt, 'Scale Ticket': Scale, 'Other': FileText }
const DOC_COLORS = { 'Rate Con': 'var(--accent)', 'BOL': 'var(--accent2)', 'POD': 'var(--success)', 'Lumper Receipt': 'var(--accent3)', 'Scale Ticket': 'var(--warning)', 'Other': 'var(--muted)' }

function BookedLoads() {
  const { showToast } = useApp()
  const { loads: bookedLoads, addLoad: ctxAddLoad, updateLoadStatus: ctxUpdateStatus, removeLoad, company, drivers: ctxDrivers } = useCarrier()
  const driverNames = (ctxDrivers || []).map(d => d.name || d.full_name || d.driver_name).filter(Boolean)
  const [loadDocs, setLoadDocs] = useState({
    1: [{ id: 1, name: 'EC-88421-ratecon.pdf', type: 'Rate Con', size: '124 KB', uploadedAt: 'Mar 8', dataUrl: null }],
    2: [{ id: 2, name: 'CL-22910-ratecon.pdf', type: 'Rate Con', size: '98 KB',  uploadedAt: 'Mar 8', dataUrl: null }],
  })
  const [docsOpenId, setDocsOpenId] = useState(null)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [docType, setDocType] = useState('BOL')
  const [showForm, setShowForm] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [signatureModal, setSignatureModal] = useState(null) // { loadId, docId }
  const sigCanvasRef = useRef(null)
  const sigDrawing = useRef(false)
  const [form, setForm] = useState({ loadId: '', broker: '', origin: '', dest: '', miles: '', rate: '', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', driver: '', gross: 0 })

  const handleDocUpload = useCallback(async (loadId, file, type) => {
    if (!file) return
    const sizeLabel = file.size > 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB'

    // Upload to Supabase Storage + save to documents table
    try {
      const { uploadFile } = await import('../lib/storage')
      const { createDocument } = await import('../lib/database')
      const uploaded = await uploadFile(file, `loads/${loadId}`)
      const dbDoc = await createDocument({
        load_id: loadId,
        name: file.name,
        type,
        file_url: uploaded.url,
        file_size: file.size,
      })
      const doc = {
        id: dbDoc?.id || Date.now(),
        name: file.name,
        type,
        size: sizeLabel,
        uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fileUrl: uploaded.url,
      }
      setLoadDocs(d => ({ ...d, [loadId]: [...(d[loadId] || []), doc] }))
      showToast('success', type + ' Uploaded', file.name)
    } catch (err) {
      /* Storage upload failed — fallback to local dataUrl */
      const reader = new FileReader()
      reader.onload = e => {
        const doc = { id: Date.now(), name: file.name, type, size: sizeLabel, uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), dataUrl: e.target.result }
        setLoadDocs(d => ({ ...d, [loadId]: [...(d[loadId] || []), doc] }))
        showToast('', type + ' Uploaded (local)', file.name)
      }
      reader.readAsDataURL(file)
    }
    setUploadingFor(null)
  }, [showToast])

  const removeDoc = async (loadId, docId) => {
    setLoadDocs(d => ({ ...d, [loadId]: d[loadId].filter(doc => doc.id !== docId) }))
    try {
      const { deleteDocument } = await import('../lib/database')
      await deleteDocument(docId)
    } catch (err) { /* non-critical: DB delete failed */ }
    showToast('', 'Document Removed', '')
  }

  const [invoiceLoad, setInvoiceLoad] = useState(null)

  const viewDoc = (doc) => {
    if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank')
      return
    }
    if (doc.dataUrl) {
      const w = window.open()
      w.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:none"></iframe>`)
    } else {
      showToast('', doc.name, 'No preview available')
    }
  }

  const signDoc = (loadId, docId) => setSignatureModal({ loadId, docId })

  const initSigCanvas = useCallback((canvas) => {
    if (!canvas) return
    sigCanvasRef.current = canvas
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const clearSigCanvas = useCallback(() => {
    const canvas = sigCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getSigPos = useCallback((e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  const onSigDown = useCallback((e) => {
    e.preventDefault()
    const canvas = sigCanvasRef.current
    if (!canvas) return
    sigDrawing.current = true
    const ctx = canvas.getContext('2d')
    const pos = getSigPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getSigPos])

  const onSigMove = useCallback((e) => {
    e.preventDefault()
    if (!sigDrawing.current) return
    const canvas = sigCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getSigPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [getSigPos])

  const onSigUp = useCallback((e) => {
    e.preventDefault()
    sigDrawing.current = false
  }, [])

  const saveSignature = useCallback(() => {
    if (!signatureModal || !sigCanvasRef.current) return
    const dataUrl = sigCanvasRef.current.toDataURL('image/png')
    const { loadId, docId } = signatureModal
    setLoadDocs(prev => ({
      ...prev,
      [loadId]: (prev[loadId] || []).map(doc =>
        doc.id === docId ? { ...doc, signed: true, signatureData: dataUrl } : doc
      )
    }))
    setSignatureModal(null)
    showToast('', 'Signature Saved', 'Document signed successfully')
  }, [signatureModal, showToast])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isPDF   = file.type === 'application/pdf'
    const validExt = /\.(pdf|png|jpg|jpeg)$/i
    if (!isPDF && !isImage && !validExt.test(file.name)) { showToast('', 'Unsupported File', 'Drop a PDF or image (photo, scan) of the rate confirmation'); return }
    setParsing(true)
    setShowForm(true)
    showToast('', 'Reading Rate Con', `Compressing ${file.name} (${(file.size/1024).toFixed(0)} KB)...`)
    try {
      const parsed = await parseRateConWithAI(file)
      setForm(parsed)
      const filled = Object.values(parsed).filter(v => v && v !== 0 && v !== '').length
      showToast('', 'Rate Con Parsed', `${filled} fields auto-filled — review and confirm`)
    } catch (e) {
      showToast('', 'Parse Failed', e.message || 'Check your API key and try again')
      setShowForm(false)
    } finally {
      setParsing(false)
    }
  }, [showToast])

  const updateStatus = (loadId, newStatus) => {
    ctxUpdateStatus(loadId, newStatus)
    if (newStatus === 'Delivered') showToast('', 'Invoice Created', 'Load ' + loadId + ' — invoice auto-generated')
    else showToast('', 'Status Updated', newStatus)
  }

  const assignDriver = (loadId, driver) => {
    ctxUpdateStatus(loadId, 'Assigned to Driver')
    showToast('', 'Driver Assigned', driver)
  }

  const addLoad = () => {
    if (!form.origin || !form.dest) { showToast('', 'Missing Fields', 'Origin and destination required'); return }
    const gross = parseFloat(form.rate) || form.gross || 0
    const miles = parseFloat(form.miles) || 0
    const autoId = form.loadId || ('RC-' + Date.now().toString(36).toUpperCase())
    // Map form fields to DB schema
    ctxAddLoad({
      load_id: autoId,
      origin: form.origin,
      destination: form.dest,
      rate: gross,
      broker_name: form.broker || 'Direct',
      carrier_name: form.driver || null,
      equipment: form.equipment || 'Dry Van',
      weight: form.weight || null,
      notes: form.commodity || null,
      pickup_date: form.pickup || null,
      delivery_date: form.delivery || null,
      status: 'Rate Con Received',
      // Keep extra fields for local display
      miles, refNum: form.refNum, rateCon: true,
    })
    setForm({ loadId: '', broker: '', origin: '', dest: '', miles: '', rate: '', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', driver: '', gross: 0 })
    setShowForm(false)
    showToast('', 'Load Added', autoId + ' · ' + form.origin + ' → ' + form.dest)
  }

  return (
    <div style={{ padding: 20, paddingBottom: 60, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1 }}>BOOKED LOADS</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loads confirmed via rate confirmation — assign drivers and track to invoice</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? '✕ Cancel' : '+ Add Rate Con'}
        </button>
      </div>

      {/* Drop Zone */}
      {!showForm && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('ratecon-input').click()}
          style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(240,165,0,0.04)' : 'transparent', transition: 'all 0.2s' }}>
          <input id="ratecon-input" type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          <div style={{ marginBottom: 10, display:'flex', justifyContent:'center' }}><Ic icon={FileText} size={36} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Drop Rate Confirmation Here</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>PDF or image · AI will auto-fill all fields</div>
        </div>
      )}

      {/* Parsing spinner */}
      {parsing && (
        <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Ic icon={Zap} size={14} color="var(--accent)" /> Parsing rate confirmation...</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Extracting load details, rates, and dates</div>
        </div>
      )}

      {/* Auto-filled form */}
      {showForm && !parsing && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', display:'flex', alignItems:'center', gap:6 }}><Ic icon={FileText} size={14} /> Rate Confirmation — Review & Confirm</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { document.getElementById('ratecon-input2').click() }}>
                Re-upload
              </button>
              <input id="ratecon-input2" type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { setShowForm(false); setForm({ loadId:'',broker:'',origin:'',dest:'',miles:'',rate:'',pickup:'',delivery:'',weight:'',commodity:'',refNum:'',driver:'',gross:0 }) }}>
                ✕ Cancel
              </button>
            </div>
          </div>
          {/* Broker / Load Info */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>LOAD INFO</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'loadId',    label: 'Load / Order #',  ph: 'Auto-generated if empty' },
              { key: 'refNum',    label: 'Reference / PO #', ph: 'Broker ref' },
              { key: 'broker',    label: 'Broker',           ph: 'TQL, Echo, CH Robinson...' },
              { key: 'brokerPhone', label: 'Broker Phone',   ph: '(555) 123-4567' },
              { key: 'brokerEmail', label: 'Broker Email',   ph: 'dispatch@broker.com' },
              { key: 'equipment', label: 'Equipment',        ph: 'Dry Van' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Shipper / Origin */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--success)', letterSpacing: 1.5, marginBottom: 8 }}>PICKUP / SHIPPER</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'shipperName',   label: 'Shipper Name',    ph: 'Company name' },
              { key: 'shipperPhone',  label: 'Shipper Phone',   ph: '(555) 123-4567' },
              { key: 'origin',        label: 'Origin City, ST', ph: 'Atlanta, GA' },
              { key: 'originAddress', label: 'Street Address',  ph: '123 Warehouse Dr' },
              { key: 'originZip',     label: 'ZIP',             ph: '30301' },
              { key: 'pickup',        label: 'Pickup Date',     ph: '2024-03-10' },
              { key: 'pickupTime',    label: 'Pickup Time',     ph: '08:00 AM' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Consignee / Destination */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--danger)', letterSpacing: 1.5, marginBottom: 8 }}>DELIVERY / CONSIGNEE</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'consigneeName',  label: 'Consignee Name',    ph: 'Company name' },
              { key: 'consigneePhone', label: 'Consignee Phone',   ph: '(555) 123-4567' },
              { key: 'dest',           label: 'Dest City, ST',     ph: 'Dallas, TX' },
              { key: 'destAddress',    label: 'Street Address',    ph: '456 Distribution Blvd' },
              { key: 'destZip',        label: 'ZIP',               ph: '75201' },
              { key: 'delivery',       label: 'Delivery Date',     ph: '2024-03-12' },
              { key: 'deliveryTime',   label: 'Delivery Time',     ph: '06:00 PM' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Rate / Weight / Commodity */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>RATE & CARGO</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { key: 'rate',      label: 'Total Rate ($)', ph: '3500' },
              { key: 'miles',     label: 'Miles',          ph: '674' },
              { key: 'weight',    label: 'Weight (lbs)',   ph: '42000' },
              { key: 'commodity', label: 'Commodity',      ph: 'Auto Parts' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
            {/* Notes */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 10, color: form.notes || form.specialInstructions ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                {form.notes || form.specialInstructions ? '+ ' : ''}Notes / Special Instructions
              </label>
              <input value={form.notes || form.specialInstructions || ''} onChange={e => setForm(fm => ({ ...fm, notes: e.target.value }))}
                placeholder="Temperature requirements, appointment notes, etc."
                style={{ width: '100%', background: (form.notes || form.specialInstructions) ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${(form.notes || form.specialInstructions) ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Driver */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Assign Driver</label>
            <select value={form.driver} onChange={e => setForm(fm => ({ ...fm, driver: e.target.value }))}
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: form.driver ? 'var(--text)' : 'var(--muted)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
              <option value="">— Assign later —</option>
              {driverNames.length === 0 && <option disabled>No drivers added yet</option>}
              {driverNames.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          {form.rate && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, fontSize: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <span>Gross: <b style={{ color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18 }}>${parseFloat(form.rate||0).toLocaleString(undefined,{maximumFractionDigits:0})}</b></span>
              {form.miles && <span>RPM: <b style={{ color: 'var(--accent2)' }}>${(parseFloat(form.rate||0) / parseFloat(form.miles||1)).toFixed(2)}</b>/mi</span>}
              {form.miles && <span>Est. Fuel: <b style={{ color: 'var(--danger)' }}>${Math.round(parseFloat(form.miles||0)/6.8*3.89).toLocaleString()}</b></span>}
              {form.miles && <span>Est. Net: <b style={{ color: 'var(--success)' }}>${Math.round(parseFloat(form.rate||0) - parseFloat(form.miles||0)/6.8*3.89 - parseFloat(form.rate||0)*0.28).toLocaleString()}</b></span>}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: 14 }} onClick={addLoad}>
            Confirm & Add Load
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { label: 'Total Booked',   value: bookedLoads.length,                                      color: 'var(--accent)' },
          { label: 'In Transit',     value: bookedLoads.filter(l => l.status === 'In Transit').length, color: 'var(--success)' },
          { label: 'Needs Driver',   value: bookedLoads.filter(l => !l.driver).length,                color: 'var(--warning)' },
          { label: 'Gross Revenue',  value: '$' + bookedLoads.reduce((s, l) => s + l.gross, 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Invoice Modal */}
      {invoiceLoad && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setInvoiceLoad(null) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, color:'var(--accent)' }}>INVOICE</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>INV-{String(invoiceLoad.id).slice(-4).padStart(4,'0')} · {new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
              </div>
              <button onClick={() => setInvoiceLoad(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:8, letterSpacing:1 }}>FROM</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{company?.name || 'Your Company'}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{company?.mc || ''} · {company?.dot || ''}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{company?.email || 'ops@swiftcarriers.com'}</div>
              </div>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:8, letterSpacing:1 }}>BILL TO</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{invoiceLoad.broker}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Ref: {invoiceLoad.refNum || '—'}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Load ID: {invoiceLoad.loadId}</div>
              </div>
            </div>

            <div style={{ background:'var(--surface2)', borderRadius:10, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:10, letterSpacing:1 }}>LOAD DETAILS</div>
              {[
                { label:'Route',      value: invoiceLoad.origin + ' → ' + invoiceLoad.dest },
                { label:'Pickup',     value: invoiceLoad.pickup },
                { label:'Delivery',   value: invoiceLoad.delivery },
                { label:'Miles',      value: invoiceLoad.miles.toLocaleString() + ' mi' },
                { label:'Commodity',  value: invoiceLoad.commodity },
                { label:'Weight',     value: invoiceLoad.weight + ' lbs' },
                { label:'Driver',     value: invoiceLoad.driver || '—' },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontSize:12, fontWeight:600 }}>{item.value}</span>
                </div>
              ))}
            </div>

            <div style={{ background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, padding:16, marginBottom:16 }}>
              {[
                { label:'Freight Charge', value: '$' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0}), main:false },
                { label:'Fuel Surcharge', value: '$0.00', main:false },
                { label:'TOTAL DUE', value: '$' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0}), main:true },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding: item.main ? '10px 0 0' : '6px 0', borderTop: item.main ? '2px solid var(--border)' : 'none', marginTop: item.main ? 6 : 0 }}>
                  <span style={{ fontSize: item.main ? 14 : 12, fontWeight: item.main ? 800 : 400, color: item.main ? 'var(--text)' : 'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: item.main ? 26 : 18, color: item.main ? 'var(--accent)' : 'var(--text)' }}>{item.value}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16, padding:'10px 14px', background:'var(--surface2)', borderRadius:8 }}>
              Payment Terms: Net 30 · Please reference invoice number {`INV-${String(invoiceLoad.id).slice(-4).padStart(4,'0')}`} on payment.
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={() => { showToast('','Invoice Sent', invoiceLoad.broker + ' · $' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0})); setInvoiceLoad(null) }}><Ic icon={FileText} size={14} /> Send to Broker</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => {
                const invId = 'INV-' + String(invoiceLoad.id).slice(-4).padStart(4,'0')
                const route = invoiceLoad.origin?.split(',')[0]?.substring(0,3)?.toUpperCase() + ' → ' + invoiceLoad.dest?.split(',')[0]?.substring(0,3)?.toUpperCase()
                generateInvoicePDF({ id: invId, loadId: invoiceLoad.loadId, broker: invoiceLoad.broker, route, amount: invoiceLoad.gross, date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}), dueDate: 'Net 30', driver: invoiceLoad.driver, status: 'Unpaid' })
                showToast('','PDF Downloaded', invId + '.pdf')
                setInvoiceLoad(null)
              }}>Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Load cards */}
      {bookedLoads.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          No booked loads yet. Click <b>+ Add Rate Con</b> to log your first confirmed load.
        </div>
      )}
      {bookedLoads.map(load => {
        const isExpanded = expandedId === load.id
        const statusColor = STATUS_COLORS[load.status] || 'var(--muted)'
        const stepIdx = STATUS_FLOW.indexOf(load.status)
        return (
          <div key={load.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--border)' : 'none' }}
              onClick={() => setExpandedId(isExpanded ? null : load.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{load.origin} <span style={{ color: 'var(--accent)' }}>→</span> {load.dest}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: statusColor + '15', color: statusColor, border: '1px solid ' + statusColor + '30' }}>{load.status}</span>
                  {load.rateCon && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' }}>Rate Con</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {load.loadId} · {load.broker} · {load.miles.toLocaleString()} mi · {load.commodity}
                  {load.driver ? <span> · <b style={{ color: 'var(--accent2)' }}>{load.driver}</b></span> : <span style={{ color: 'var(--warning)' }}> · No driver assigned</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: 'var(--accent)', lineHeight: 1 }}>${load.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>${load.rate}/mi</div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Progress bar */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Load Progress</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {STATUS_FLOW.map((s, i) => (
                      <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ height: 4, borderRadius: 2, background: i <= stepIdx ? STATUS_COLORS[s] || 'var(--accent)' : 'var(--border)', marginBottom: 4 }} />
                        <div style={{ fontSize: 9, color: i === stepIdx ? STATUS_COLORS[s] : 'var(--muted)', fontWeight: i === stepIdx ? 700 : 400, lineHeight: 1.2 }}>{s}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
                  {[
                    { label: 'Ref #',        value: load.refNum || '—' },
                    { label: 'Pickup',        value: load.pickup },
                    { label: 'Delivery',      value: load.delivery },
                    { label: 'Weight',        value: load.weight + ' lbs' },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Assign driver */}
                {!load.driver && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:4 }}><Ic icon={AlertTriangle} size={12} color="var(--warning)" /> Assign a driver to dispatch this load:</span>
                    {driverNames.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>No drivers added yet</span>}
                    {driverNames.map(d => (
                      <button key={d} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => assignDriver(load.loadId, d)}>{d}</button>
                    ))}
                  </div>
                )}

                {/* Status actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Update status:</span>
                  {STATUS_FLOW.filter((_, i) => i > stepIdx).slice(0, 3).map(s => (
                    <button key={s} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => updateStatus(load.loadId, s)}>{s} →</button>
                  ))}
                  {load.status === 'Delivered' && (
                    <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { updateStatus(load.loadId, 'Invoiced'); setInvoiceLoad(load) }}>
                      Generate Invoice
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 'auto', color: docsOpenId === load.id ? 'var(--accent)' : undefined }}
                    onClick={() => setDocsOpenId(docsOpenId === load.id ? null : load.id)}>
                    Documents {loadDocs[load.id]?.length ? `(${loadDocs[load.id].length})` : ''}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--danger)' }}
                    onClick={() => { if (window.confirm(`Delete load ${load.loadId}? This cannot be undone.`)) removeLoad(load.loadId) }}>
                    Delete Load
                  </button>
                </div>

                {/* Documents panel */}
                {docsOpenId === load.id && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={FileText} size={12} /> Load Documents</div>
                      <button className="btn btn-primary" style={{ fontSize: 11 }}
                        onClick={() => setUploadingFor(uploadingFor === load.id ? null : load.id)}>
                        {uploadingFor === load.id ? '✕ Cancel' : '+ Upload Doc'}
                      </button>
                    </div>

                    {/* Upload form */}
                    {uploadingFor === load.id && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8 }}>
                        <select value={docType} onChange={e => setDocType(e.target.value)}
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                          {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                        <label style={{ flex: 1, cursor: 'pointer' }}>
                          <input type="file" accept=".pdf,image/*" style={{ display: 'none' }}
                            onChange={e => { if (e.target.files[0]) handleDocUpload(load.id, e.target.files[0], docType) }} />
                          <div style={{ border: '1px dashed var(--border)', borderRadius: 6, padding: '6px 14px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                            Click to choose file (PDF or image)
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Doc list */}
                    {(loadDocs[load.id] || []).length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>No documents yet — upload a BOL or POD</div>
                    )}
                    {(loadDocs[load.id] || []).map(doc => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span><Ic icon={DOC_ICONS[doc.type] || FileText} size={18} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{doc.size} · {doc.uploadedAt}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: (DOC_COLORS[doc.type] || 'var(--muted)') + '15', color: DOC_COLORS[doc.type] || 'var(--muted)', border: '1px solid ' + (DOC_COLORS[doc.type] || 'var(--muted)') + '30', whiteSpace: 'nowrap' }}>{doc.type}</span>
                        {doc.signed && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--success, #22c55e)' + '20', color: 'var(--success, #22c55e)', border: '1px solid var(--success, #22c55e)' + '40', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}><Ic icon={CheckCircle} size={11} /> Signed</span>}
                        {doc.type === 'Rate Con' && !doc.signed && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--accent)' }} onClick={() => signDoc(load.id, doc.id)}>Sign</button>}
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => viewDoc(doc)}>View</button>
                        <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: '0 4px' }} onClick={() => removeDoc(load.id, doc.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* E-Signature Modal */}
      {signatureModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }} onClick={() => setSignatureModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, width: 460, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Sign Document</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }} onClick={() => setSignatureModal(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Draw your signature below using mouse or touch</div>
            <canvas
              ref={initSigCanvas}
              width={410}
              height={180}
              style={{ width: '100%', height: 180, borderRadius: 10, border: '1px solid var(--border)', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={onSigDown}
              onMouseMove={onSigMove}
              onMouseUp={onSigUp}
              onMouseLeave={onSigUp}
              onTouchStart={onSigDown}
              onTouchMove={onSigMove}
              onTouchEnd={onSigUp}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '8px 18px' }} onClick={clearSigCanvas}>Clear</button>
              <button className="btn" style={{ fontSize: 12, padding: '8px 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }} onClick={saveSignature}>Save Signature</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DispatchTab() {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <BookedLoads />
    </div>
  )
}

// ── Settlement tab ─────────────────────────────────────────────────────────────
function SettlementTab() {
  const { showToast } = useApp()
  const { loads } = useCarrier()
  const [paid, setPaid] = useState([])

  // Compute driver settlements from delivered/invoiced loads
  const settledLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const allDrivers = [...new Set(settledLoads.map(l => l.driver).filter(Boolean))]

  const settlements = allDrivers.map(driver => {
    const dLoads = settledLoads.filter(l => l.driver === driver)
    const gross  = dLoads.reduce((s,l) => s + (l.gross || 0), 0)
    const miles  = dLoads.reduce((s,l) => s + (parseFloat(l.miles) || 0), 0)
    const fuel   = Math.round(miles * 0.22)
    const pay    = Math.round(gross * 0.28)
    const net    = gross - fuel
    const isPaid = paid.includes(driver)
    return { driver, loads: dLoads.length, gross, fuel, pay, net, status: isPaid ? 'Paid' : 'Ready', color: isPaid ? 'var(--muted)' : 'var(--success)' }
  })

  const totalGross  = settlements.reduce((s,d) => s + d.gross, 0)
  const totalPay    = settlements.reduce((s,d) => s + d.pay, 0)
  const totalFuel   = settlements.reduce((s,d) => s + d.fuel, 0)
  const totalNet    = settlements.reduce((s,d) => s + d.net, 0)

  const fmt = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v}`

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { label: 'Total Gross',      value: fmt(totalGross), color: 'var(--accent)' },
          { label: 'Total Driver Pay', value: fmt(totalPay),   color: 'var(--danger)' },
          { label: 'Total Fuel Est.',  value: fmt(totalFuel),  color: 'var(--warning)' },
          { label: 'Net Carrier Pay',  value: fmt(totalNet),   color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Driver Settlements — This Period</div>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { setPaid(settlements.filter(s=>s.status==='Ready').map(s=>s.driver)); showToast('', 'Settlements Processed', 'All ready settlements pushed to payroll') }}>Process All Ready</button>
        </div>
        {settlements.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No completed loads yet — mark loads as Delivered to calculate settlements.</div>
        )}
        {settlements.map(s => (
          <div key={s.driver} style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>
              {s.driver.split(' ').map(n => n[0]).join('')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{s.driver}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.loads} load{s.loads !== 1 ? 's' : ''} · Gross: ${s.gross.toLocaleString()} · Fuel est: ${s.fuel.toLocaleString()} · Driver pay (28%): ${s.pay.toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 12 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: s.status === 'Paid' ? 'var(--muted)' : 'var(--success)' }}>${s.net.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Net this period</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: s.color + '15', color: s.color, border: '1px solid ' + s.color + '30', marginRight: 8 }}>{s.status}</span>
            {s.status === 'Ready' && (
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { setPaid(p => [...p, s.driver]); showToast('', 'Settlement Sent', s.driver + ' · $' + s.net.toLocaleString() + ' via FastPay') }}>Pay Now</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── GLOBAL SEARCH MODAL ────────────────────────────────────────────────────────
function SearchModal({ open, onClose, onTabChange }) {
  const { loads, invoices, expenses } = useCarrier()
  const [q, setQ] = useState('')
  const inputRef = useCallback(el => { if (el && open) el.focus() }, [open])

  useEffect(() => {
    if (!open) { setQ(''); return }
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = q.trim().length < 2 ? [] : [
    ...loads.filter(l =>
      [l.loadId, l.broker, l.driver, l.origin, l.dest, l.status, l.commodity]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(l => ({
      type: 'Load', icon: Package, label: l.loadId,
      sub: `${l.origin?.split(',')[0]} → ${l.dest?.split(',')[0]} · ${l.broker} · ${l.status}`,
      color: 'var(--accent)',
      action: () => { onTabChange('loads'); onClose() }
    })),
    ...invoices.filter(i =>
      [i.id, i.loadId, i.broker, i.route, i.status]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(i => ({
      type: 'Invoice', icon: Receipt, label: i.id,
      sub: `${i.route} · ${i.broker} · $${i.amount?.toLocaleString()} · ${i.status}`,
      color: 'var(--accent2)',
      action: () => { onTabChange('financials'); onClose() }
    })),
    ...expenses.filter(e =>
      [e.cat, e.merchant, e.load, e.driver, e.notes]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(e => ({
      type: 'Expense', icon: DollarSign, label: e.merchant || e.cat,
      sub: `${e.cat} · $${e.amount} · ${e.date}${e.load ? ' · ' + e.load : ''}`,
      color: 'var(--accent3)',
      action: () => { onTabChange('financials'); onClose() }
    })),
  ].slice(0, 12)

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: 560, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <Ic icon={Search} size={16} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search loads, invoices, expenses, drivers, brokers…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }} />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>}
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>ESC</span>
        </div>

        {/* Results */}
        {q.trim().length >= 2 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {results.length === 0
              ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No results for "{q}"</div>
              : results.map((r, i) => (
                <div key={i} onClick={r.action}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: r.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic icon={r.icon} size={16} color={r.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: r.color, marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: r.color + '15', color: r.color }}>{r.type}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* Shortcuts hint */}
        {q.trim().length < 2 && (
          <div style={{ padding: '16px 18px', display: 'flex', gap: 16 }}>
            {[[Package,'Loads'],[Receipt,'Invoices'],[DollarSign,'Expenses'],[User,'Drivers'],[Building2,'Brokers']].map(([icon, label]) => (
              <button key={label} onClick={() => setQ(label.toLowerCase())}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Sans',sans-serif" }}>
                <Ic icon={icon} size={12} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AI CHATBOX ─────────────────────────────────────────────────────────────────
const SUGGESTED_QUESTIONS = [
  'Is $2.50/mi good for a dry van right now?',
  'What\'s my profit margin this month?',
  'Which of my invoices are overdue?',
  'What should I charge per mile right now?',
  'How much am I saving vs a human dispatcher?',
  'When is my IFTA filing due?',
]

function AIChatbox() {
  const { language: currentLang } = useTranslation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useCallback(el => { if (el) el.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const { loads, invoices, expenses, totalRevenue, totalExpenses } = useCarrier()

  const buildContext = () => {
    const activeLoads  = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))
    const unpaid       = invoices.filter(i => i.status === 'Unpaid')
    const netProfit    = totalRevenue - totalExpenses
    return [
      `CARRIER ACCOUNT SNAPSHOT (as of today):`,
      `- Revenue MTD: $${totalRevenue.toLocaleString()}`,
      `- Expenses MTD: $${totalExpenses.toLocaleString()}`,
      `- Net Profit MTD: $${netProfit.toLocaleString()}`,
      `- Active loads: ${activeLoads.length} (${activeLoads.map(l => `${l.loadId} ${l.origin?.split(',')[0]}→${l.dest?.split(',')[0]} $${l.gross}`).join(', ')})`,
      `- Unpaid invoices: ${unpaid.length} totaling $${unpaid.reduce((s,i)=>s+(i.amount||0),0).toLocaleString()}`,
      `- Recent expenses: ${expenses.slice(0,3).map(e=>`${e.cat} $${e.amount} ${e.merchant||''}`).join(', ')}`,
    ].join('\n')
  }

  const send = async (text) => {
    const userText = text || input.trim()
    if (!userText) return
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context: buildContext(), language: currentLang }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: data.reply || data.error || 'No response.' }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error: ' + (err.message || 'Check your internet connection.') }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Chat toggle button */}
      <button onClick={() => setOpen(o => !o)}
        style={{ position: 'fixed', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: open ? 'var(--surface2)' : 'var(--accent)', border: '2px solid ' + (open ? 'var(--border)' : 'var(--accent)'), boxShadow: '0 4px 20px rgba(240,165,0,0.4)', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, transition: 'all 0.2s' }}>
        {open ? '✕' : <Ic icon={Zap} size={22} color="#000" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{ position: 'fixed', bottom: 88, right: 24, width: 360, height: 520, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', zIndex: 900, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.05))', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(240,165,0,0.15)', border: '1px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Zap} size={16} color="var(--accent)" /></div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Qivori AI</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Ask me anything about your business</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>Try asking:</div>
                {SUGGESTED_QUESTIONS.map(q => (
                  <button key={q} onClick={() => send(q)}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans',sans-serif", transition: 'border-color 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 13px', borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                  color: m.role === 'user' ? '#000' : 'var(--text)',
                  fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ background: 'var(--surface2)', borderRadius: '12px 12px 12px 4px', padding: '10px 14px', fontSize: 18, letterSpacing: 4 }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>···</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask Qivori AI..."
              style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none' }}
            />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              style={{ background: input.trim() ? 'var(--accent)' : 'var(--surface2)', border: 'none', borderRadius: 10, width: 38, cursor: input.trim() ? 'pointer' : 'default', fontSize: 16, color: input.trim() ? '#000' : 'var(--muted)', transition: 'all 0.15s' }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── QUICK ACTIONS BAR ──────────────────────────────────────────────────────────
function QuickActions({ onTabChange }) {
  const { showToast } = useApp()
  const [open, setOpen] = useState(false)

  const actions = [
    { icon: FileText, label: 'Log Rate Con',      color: 'var(--accent)',  onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Drop a rate confirmation to log a new load') } },
    { icon: Fuel, label: 'Add Expense',        color: 'var(--warning)', onClick: () => { onTabChange('financials'); setOpen(false) } },
    { icon: Package, label: 'Update Load Status', color: 'var(--accent2)', onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Drag a load card to update its status') } },
    { icon: Truck, label: 'Assign Driver',      color: 'var(--accent3)', onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Click a load card to assign a driver') } },
    { icon: DollarSign, label: 'Pay a Driver',       color: 'var(--success)', onClick: () => { onTabChange('drivers'); setOpen(false) } },
    { icon: BarChart2, label: 'View P&L',           color: 'var(--accent)',  onClick: () => { onTabChange('financials'); setOpen(false) } },
  ]

  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 900, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      {/* Action items */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
          {actions.map((a, i) => (
            <button key={a.label} onClick={a.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--surface)', border: `1px solid ${a.color}30`, borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.4)', animation: `slideUp 0.2s ease ${i * 0.04}s both`, whiteSpace: 'nowrap' }}>
              <span><Ic icon={a.icon} size={16} /></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: 52, height: 52, borderRadius: '50%', background: open ? 'var(--surface2)' : 'var(--surface)', border: `2px solid ${open ? 'var(--border)' : 'rgba(240,165,0,0.4)'}`, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: open ? 20 : 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: open ? 'var(--muted)' : 'var(--accent)', transition: 'all 0.2s', transform: open ? 'rotate(45deg)' : 'none' }}>
        {open ? '✕' : <Ic icon={Zap} size={22} color="var(--accent)" />}
      </button>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}


// ── MAIN CARRIER LAYOUT ────────────────────────────────────────────────────────
export default function CarrierLayout() {
  return <CarrierProvider><CarrierLayoutInner /></CarrierProvider>
}

// ── CRM Sidebar nav (flat, no nesting) ──────────────────────────────────────
const NAV = [
  { id:'dashboard',   icon: Monitor,      label:'Dashboard',      i18nKey:'nav.dashboard'    },
  { id:'load-board',   icon: Zap,          label:'Find Loads',     i18nKey:'nav.aiLoadBoard'  },
  { id:'loads',        icon: Package,      label:'My Loads',       i18nKey:'nav.loads'        },
  { id:'drivers',      icon: Users,        label:'Drivers',        i18nKey:'nav.drivers'      },
  { id:'fleet',        icon: Truck,        label:'My Fleet',       i18nKey:'nav.fleet'        },
  { id:'financials',   icon: DollarSign,   label:'Money',          i18nKey:'nav.financials'   },
  { id:'compliance',   icon: Shield,       label:'Safety & Compliance', i18nKey:'nav.compliance'   },
  { id:'_divider' },
  { id:'settings',     icon: SettingsIcon, label:'Settings',       i18nKey:'nav.settings'     },
]

// ── Hub sub-tab wrapper ─────────────────────────────────────────────────────
function HubTabBar({ tabs, active, onChange }) {
  return (
    <div style={{ flexShrink:0, display:'flex', gap:2, padding:'0 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ padding:'10px 16px', border:'none', borderBottom: active===t.id ? '2px solid var(--accent)' : '2px solid transparent',
            background:'transparent', color: active===t.id ? 'var(--accent)' : 'var(--muted)',
            fontSize:12, fontWeight: active===t.id ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            marginBottom:-1, whiteSpace:'nowrap' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Drivers Hub ──
function DriversHub() {
  const [tab, setTab] = useState('profiles')
  const TABS = [
    { id:'profiles', label:'Profiles' },{ id:'settlement', label:'Settlement' },{ id:'scorecards', label:'Scorecards' },{ id:'pay-reports', label:'Pay Reports' },{ id:'onboarding', label:'Onboarding' },
    { id:'dq-files', label:'DQ Files' },{ id:'expiry-alerts', label:'Expiry Alerts' },{ id:'drug-alcohol', label:'Drug & Alcohol' },{ id:'incidents', label:'Incidents' },{ id:'payroll', label:'1099 / Payroll' },{ id:'driver-portal', label:'Driver Portal' },
  ]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
        {tab === 'profiles' && <DriverProfiles />}
        {tab === 'settlement' && <DriverSettlement />}
        {tab === 'scorecards' && <DriverScorecard />}
        {tab === 'pay-reports' && <DriverPayReport />}
        {tab === 'onboarding' && <DriverOnboarding />}
        {tab === 'dq-files' && <DQFileManager />}
        {tab === 'expiry-alerts' && <ExpiryAlerts />}
        {tab === 'drug-alcohol' && <DrugAlcoholCompliance />}
        {tab === 'incidents' && <IncidentTracker />}
        {tab === 'payroll' && <PayrollTracker />}
        {tab === 'driver-portal' && <DriverPortal />}
      </div>
    </div>
  )
}

// ── Fleet Hub ──
function FleetHub() {
  const [tab, setTab] = useState('overview')
  const TABS = [{ id:'overview', label:'Fleet Overview' },{ id:'map', label:'Live Map' },{ id:'fuel', label:'Fuel' },{ id:'equipment', label:'Equipment' }]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
        {tab === 'overview' && <FleetManager />}
        {tab === 'map' && <FleetMap />}
        {tab === 'fuel' && <FuelOptimizer />}
        {tab === 'equipment' && <EquipmentManager />}
      </div>
    </div>
  )
}

// ── Financials Hub ──
function FinancialsHub() {
  const [tab, setTab] = useState('pl')
  const TABS = [{ id:'pl', label:'P&L' },{ id:'profit-iq', label:'Profit IQ' },{ id:'receivables', label:'Receivables' },{ id:'cash-flow', label:'Cash Flow' },{ id:'expenses', label:'Expenses' },{ id:'factoring', label:'Factoring' },{ id:'quickbooks', label:'QuickBooks' }]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
        {tab === 'pl' && <PLDashboard />}
        {tab === 'profit-iq' && <ProfitIQTab />}
        {tab === 'receivables' && <ReceivablesAging />}
        {tab === 'cash-flow' && <CashFlowForecaster />}
        {tab === 'expenses' && <ExpenseTracker />}
        {tab === 'factoring' && <FactoringCashflow />}
        {tab === 'quickbooks' && <QuickBooksExport />}
      </div>
    </div>
  )
}

// ── Compliance Hub ──
function ComplianceHub() {
  const [tab, setTab] = useState('center')
  const TABS = [{ id:'center', label:'Compliance Center' },{ id:'ifta', label:'IFTA & DOT' },{ id:'broker-risk', label:'Broker Risk' },{ id:'clearinghouse', label:'Drug & Alcohol' }]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
        {tab === 'center' && <CarrierDVIR />}
        {tab === 'ifta' && <CarrierIFTA />}
        {tab === 'broker-risk' && <BrokerRiskIntel />}
        {tab === 'clearinghouse' && <CarrierClearinghouse />}
      </div>
    </div>
  )
}

// ── Kanban Pipeline (Loads view) ─────────────────────────────────────────────
const KANBAN_COLUMNS = [
  { id:'booked',     label:'Booked',     statuses:['Rate Con Received','Booked'], color:'var(--accent)' },
  { id:'dispatched', label:'Dispatched',  statuses:['Assigned to Driver','En Route to Pickup'], color:'var(--accent3)' },
  { id:'in-transit', label:'In Transit',  statuses:['Loaded','In Transit','At Pickup','At Delivery'], color:'var(--success)' },
  { id:'delivered',  label:'Delivered',   statuses:['Delivered'], color:'var(--accent2)' },
  { id:'invoiced',   label:'Invoiced',    statuses:['Invoiced'], color:'var(--accent3)' },
  { id:'paid',       label:'Paid',        statuses:['Paid'], color:'var(--success)' },
]

function KanbanCard({ load, onClick, onDragStart }) {
  const origin = (load.origin || '').split(',')[0] || '—'
  const dest = (load.dest || load.destination || '').split(',')[0] || '—'
  const gross = load.gross || load.gross_pay || 0
  const rpm = load.rate || (load.miles > 0 ? (gross / load.miles).toFixed(2) : '—')
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('loadId', load.loadId || load.id); onDragStart?.() }}
      onClick={() => onClick?.(load)}
      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px',
        cursor:'pointer', transition:'all 0.12s', marginBottom:8 }}
      onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-1px)' }}
      onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
        <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:6, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{load.status}</span>
      </div>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>{origin} → {dest}</div>
      <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--muted)', marginBottom:6 }}>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${gross.toLocaleString()}</span>
        <span>${rpm}/mi</span>
        <span>{(load.miles || 0).toLocaleString()} mi</span>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:10, color:'var(--muted)' }}>
        <span>{load.driver || 'Unassigned'}</span>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <RateBadge rpm={rpm} equipment={load.equipment} compact />
          <span>{load.broker || ''}</span>
        </div>
      </div>
    </div>
  )
}

function LoadsPipeline({ onOpenDrawer }) {
  const { loads, updateLoadStatus, showToast: _st } = { ...useCarrier(), ...useApp() }
  const [pipeTab, setPipeTab] = useState('pipeline')
  const [dragOver, setDragOver] = useState(null)

  const handleDrop = (e, col) => {
    e.preventDefault()
    setDragOver(null)
    const loadId = e.dataTransfer.getData('loadId')
    if (!loadId || !col.statuses[0]) return
    updateLoadStatus(loadId, col.statuses[0])
  }

  const PIPE_TABS = [{ id:'pipeline', label:'Pipeline' },{ id:'list', label:'List View' },{ id:'dispatch', label:'Dispatch Board' },{ id:'check-calls', label:'Check Calls' },{ id:'command', label:'Command Center' },{ id:'lane-intel', label:'Lane Intel' },{ id:'rate-check', label:'Rate Check' }]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, overflow:'hidden' }}>
      <HubTabBar tabs={PIPE_TABS} active={pipeTab} onChange={setPipeTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto', display:'flex', flexDirection:'column' }}>
        {pipeTab === 'pipeline' && (
          <div style={{ display:'flex', gap:6, padding:'10px 10px', flex:1, minHeight:0, overflow:'auto' }}>
            {KANBAN_COLUMNS.map(col => {
              const colLoads = loads.filter(l => col.statuses.includes(l.status))
              const colTotal = colLoads.reduce((s,l) => s + (l.gross || l.gross_pay || 0), 0)
              return (
                <div key={col.id}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => handleDrop(e, col)}
                  style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', minHeight:0,
                    background: dragOver === col.id ? 'rgba(240,165,0,0.04)' : 'transparent',
                    border: `1px solid ${dragOver === col.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius:12, transition:'all 0.15s' }}>
                  {/* Column header */}
                  <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:col.color }} />
                        <span style={{ fontSize:12, fontWeight:700 }}>{col.label}</span>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:col.color, background:col.color+'15', padding:'2px 8px', borderRadius:8 }}>{colLoads.length}</span>
                    </div>
                    {colTotal > 0 && <div style={{ fontSize:10, color:'var(--muted)' }}>${colTotal.toLocaleString()} total</div>}
                  </div>
                  {/* Cards */}
                  <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:8 }}>
                    {colLoads.length === 0 && (
                      <div style={{ padding:20, textAlign:'center', fontSize:11, color:'var(--muted)', border:'1px dashed var(--border)', borderRadius:8 }}>
                        Drop loads here
                      </div>
                    )}
                    {colLoads.map(load => (
                      <KanbanCard key={load.loadId || load.id} load={load} onClick={() => onOpenDrawer?.(load.loadId || load.id)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {pipeTab === 'list' && <DispatchTab />}
        {pipeTab === 'dispatch' && <SmartDispatch />}
        {pipeTab === 'check-calls' && <CheckCallCenter />}
        {pipeTab === 'command' && <CommandCenter />}
        {pipeTab === 'lane-intel' && <LaneIntel />}
        {pipeTab === 'rate-check' && <RateNegotiation />}
      </div>
    </div>
  )
}

// ── Invoice Status Badge ─────────────────────────────────────────────────────
function InvoiceStatusBadge({ status }) {
  const styles = {
    Unpaid:   { bg:'rgba(240,165,0,0.12)', color:'#f0a500', label:'Sent' },
    Sent:     { bg:'rgba(240,165,0,0.12)', color:'#f0a500', label:'Sent' },
    Viewed:   { bg:'rgba(59,130,246,0.12)', color:'#3b82f6', label:'Viewed' },
    Paid:     { bg:'rgba(34,197,94,0.12)', color:'#22c55e', label:'Paid' },
    Overdue:  { bg:'rgba(239,68,68,0.12)', color:'#ef4444', label:'Overdue' },
    Factored: { bg:'rgba(139,92,246,0.12)', color:'#8b5cf6', label:'Factored' },
    Disputed: { bg:'rgba(239,68,68,0.12)', color:'#ef4444', label:'Disputed' },
  }
  const st = styles[status] || styles.Unpaid
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8, background:st.bg, color:st.color, letterSpacing:0.5 }}>
      {st.label}
    </span>
  )
}

// ── Load Detail Drawer ─────────────────────────────────────────────────────
function LoadDetailDrawer({ loadId, onClose }) {
  const { loads, invoices, checkCalls, updateLoadStatus, drivers } = useCarrier()
  const { showToast } = useApp()
  const [invoiceSending, setInvoiceSending] = useState(false)
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false)
  const load = loads.find(l => (l.loadId || l.id) === loadId)
  if (!load) return null

  const origin = load.origin || '—'
  const dest = load.dest || load.destination || '—'
  const gross = load.gross || load.gross_pay || 0
  const rpm = load.rate || (load.miles > 0 ? (gross / load.miles).toFixed(2) : '—')
  const linkedInvoice = invoices.find(i => i.load_number === load.loadId || i.loadId === load.loadId)
  const loadCalls = checkCalls[load.loadId] || []

  const STATUS_FLOW = ['Rate Con Received','Assigned to Driver','En Route to Pickup','Loaded','In Transit','Delivered','Invoiced','Paid']
  const currentIdx = STATUS_FLOW.indexOf(load.status)
  const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null

  // Auto-invoice: generate and send invoice via API
  const handleAutoInvoice = async () => {
    setInvoiceSending(true)
    try {
      const res = await apiFetch('/api/auto-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadId: load._dbId || load.id }),
      })
      const data = await res.json()
      if (data.success) {
        updateLoadStatus(load.loadId || load.id, 'Invoiced')
        showToast('', 'Invoice Sent!', `${data.invoiceNumber} — ${data.emailSent ? 'Email sent to broker' : 'Invoice created (no broker email on file)'}`)
        setShowInvoicePrompt(false)
      } else {
        showToast('', 'Invoice Error', data.error || 'Could not generate invoice')
      }
    } catch (err) {
      // Fallback: still create local invoice via status update
      updateLoadStatus(load.loadId || load.id, 'Invoiced')
      showToast('', 'Invoice Created', `${load.loadId} — created locally (API unavailable)`)
      setShowInvoicePrompt(false)
    }
    setInvoiceSending(false)
  }

  // Show invoice prompt after advancing to Delivered
  const handleAdvanceToDelivered = () => {
    updateLoadStatus(load.loadId || load.id, 'Delivered')
    showToast('', 'Status Updated', `${load.loadId} → Delivered`)
    setShowInvoicePrompt(true)
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:900 }} />
      <div style={{ position:'fixed', top:48, right:0, bottom:0, width:480, maxWidth:'100vw', background:'var(--bg)',
        borderLeft:'1px solid var(--border)', zIndex:901, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.3)', animation:'slideInRight 0.2s ease' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontFamily:'monospace', fontSize:14, fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{load.status}</span>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>
          </div>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:1, marginBottom:4 }}>
            {origin.split(',')[0]} → {dest.split(',')[0]}
          </div>
          <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--muted)' }}>
            <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)' }}>${gross.toLocaleString()}</span>
            <span>${rpm}/mi</span>
            <span>{(load.miles || 0).toLocaleString()} mi</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:'auto', padding:20, paddingBottom:60, display:'flex', flexDirection:'column', gap:16 }}>
          {/* Progress bar */}
          <div style={{ display:'flex', gap:2 }}>
            {STATUS_FLOW.slice(0,7).map((s, i) => (
              <div key={s} style={{ flex:1, height:4, borderRadius:2, background: i <= currentIdx ? 'var(--accent)' : 'var(--surface2)', transition:'background 0.3s' }}
                title={s} />
            ))}
          </div>

          {/* Quick actions */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {nextStatus && nextStatus !== 'Delivered' && (
              <button className="btn btn-primary" style={{ fontSize:11, flex:1 }}
                onClick={() => { updateLoadStatus(load.loadId || load.id, nextStatus); showToast('','Status Updated', `${load.loadId} → ${nextStatus}`) }}>
                Advance → {nextStatus}
              </button>
            )}
            {nextStatus === 'Delivered' && (
              <button className="btn btn-primary" style={{ fontSize:11, flex:1 }}
                onClick={handleAdvanceToDelivered}>
                Advance → Delivered
              </button>
            )}
            {load.status === 'Delivered' && !linkedInvoice && (
              <button className="btn btn-ghost" style={{ fontSize:11, flex:1, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.25)', color:'var(--accent)' }}
                onClick={() => setShowInvoicePrompt(true)} disabled={invoiceSending}>
                {invoiceSending ? 'Sending...' : 'Generate & Send Invoice'}
              </button>
            )}
          </div>

          {/* Auto-Invoice Prompt */}
          {showInvoicePrompt && !linkedInvoice && (
            <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.04))', border:'1px solid rgba(240,165,0,0.25)', borderRadius:12, padding:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <span style={{ fontSize:18 }}>&#9993;</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>Generate & Send Invoice?</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Auto-generate a professional invoice and email it to the broker</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:11, flex:1 }} onClick={handleAutoInvoice} disabled={invoiceSending}>
                  {invoiceSending ? 'Generating...' : 'Yes, Send Invoice'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setShowInvoicePrompt(false)}>
                  Not Now
                </button>
              </div>
            </div>
          )}

          {/* Rate Analysis Badge */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <RateBadge rpm={rpm} equipment={load.equipment} />
            <button className="btn btn-ghost" style={{ fontSize:11, padding:'6px 12px' }}
              onClick={() => { const url = new URL(window.location); url.searchParams.set('rateCheck', JSON.stringify({ origin: load.origin, dest: load.dest || load.destination, miles: load.miles, gross, equipment: load.equipment })); showToast('', 'Rate Check', 'Open Rate Check tab in Loads → Rate Check to analyze this rate') }}>
              <Ic icon={Target} size={12} /> Analyze Rate
            </button>
          </div>

          {/* Details grid */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Load Details</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { label:'Broker', value: load.broker || '—' },
                { label:'Driver', value: load.driver || 'Unassigned' },
                { label:'Ref #', value: load.refNum || load.ref_number || '—' },
                { label:'Equipment', value: load.equipment || '—' },
                { label:'Weight', value: load.weight ? `${load.weight} lbs` : '—' },
                { label:'Commodity', value: load.commodity || '—' },
                { label:'Pickup', value: load.pickup || '—' },
                { label:'Delivery', value: load.delivery || '—' },
              ].map(d => (
                <div key={d.label}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{d.label}</div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{d.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Invoice */}
          {linkedInvoice && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Invoice</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{linkedInvoice.invoice_number}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>${Number(linkedInvoice.amount || 0).toLocaleString()} {linkedInvoice.dueDate ? `· Due ${linkedInvoice.dueDate}` : ''}</div>
                </div>
                <InvoiceStatusBadge status={linkedInvoice.status} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 12px' }}
                  onClick={() => { window.open(`/api/invoice-pdf?invoiceId=${encodeURIComponent(linkedInvoice._dbId || linkedInvoice.id)}`, '_blank') }}>
                  View Invoice
                </button>
                <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 12px' }}
                  onClick={() => handleAutoInvoice()}>
                  Resend to Broker
                </button>
              </div>
            </div>
          )}

          {/* Check calls */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Check Calls ({loadCalls.length})</div>
            {loadCalls.length === 0
              ? <div style={{ fontSize:12, color:'var(--muted)' }}>No check calls logged yet</div>
              : loadCalls.slice(-5).reverse().map((c, i) => (
                <div key={i} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                  <div style={{ fontWeight:600 }}>{c.note || c.message}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{c.time || c.timestamp}</div>
                </div>
              ))
            }
          </div>

          {/* Financial summary */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Financial Summary</div>
            {[
              { label:'Gross Revenue', value:`$${gross.toLocaleString()}`, color:'var(--accent)' },
              { label:'Est. Driver Pay (28%)', value:`-$${Math.round(gross * 0.28).toLocaleString()}`, color:'var(--danger)' },
              { label:'Est. Fuel', value:`-$${Math.round((load.miles || 0) * 0.55).toLocaleString()}`, color:'var(--danger)' },
              { label:'Est. Net', value:`$${Math.round(gross - gross * 0.28 - (load.miles || 0) * 0.55).toLocaleString()}`, color:'var(--success)', bold:true },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:12, color:'var(--muted)' }}>{r.label}</span>
                <span style={{ fontSize: r.bold ? 16 : 13, fontWeight: r.bold ? 800 : 600, color:r.color, fontFamily: r.bold ? "'Bebas Neue',sans-serif" : 'inherit' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function resolveView(viewId, navTo, onOpenDrawer) {
  switch (viewId) {
    case 'dashboard':   return <OverviewTab onTabChange={(viewId) => navTo(viewId)} />
    case 'loads':       return <LoadsPipeline onOpenDrawer={onOpenDrawer} />
    case 'drivers':     return <DriversHub />
    case 'fleet':       return <FleetHub />
    case 'financials':  return <FinancialsHub />
    case 'compliance':  return <ComplianceHub />
    case 'settings':    return <SettingsTab />
    case 'analytics':   return <AnalyticsDashboard />
    case 'load-board':  return <AILoadBoard />
    case 'rate-check':  return <RateNegotiation />
    case 'referrals':   return <ReferralProgram />
    default:            return <OverviewTab onTabChange={(viewId) => navTo(viewId)} />
  }
}

// ── New User Onboarding Wizard (5 steps) ─────────────────────────────────────
function OnboardingWizard({ onComplete }) {
  const { showToast, profile, user } = useApp()
  const { updateCompany, addVehicle, addDriver } = useCarrier()
  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 5
  const [form, setForm] = useState({
    companyName: '', mc: '', dot: '', address: '', phone: '',
    truckType: 'Dry Van', truckYear: '', truckMake: '', truckModel: '', truckVin: '', truckPlate: '', truckUnit: '',
    driverName: '', driverPhone: '', driverCDL: '', driverMedExpiry: '', imTheDriver: false,
  })
  const [lookupLoading, setLookupLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const firstName = (profile?.full_name || 'Driver').split(' ')[0]
  const wizInput = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }

  const lookupFMCSA = async (type, value) => {
    const clean = value.replace(/[^0-9]/g, '')
    if (clean.length < 4) return
    setLookupLoading(true)
    try {
      const param = type === 'mc' ? `mc=${clean}` : `dot=${clean}`
      const resp = await apiFetch(`/api/fmcsa-lookup?${param}`)
      const res = await resp.json()
      if (res.carrier) {
        const c = res.carrier
        setForm(p => ({ ...p, companyName: c.legalName || p.companyName, dot: c.dotNumber || p.dot, mc: c.mcNumber || p.mc, phone: c.phone || p.phone, address: c.phyStreet ? `${c.phyStreet}, ${c.phyCity || ''}, ${c.phyState || ''} ${c.phyZipcode || ''}`.trim() : p.address }))
        showToast('', 'FMCSA Found', c.legalName || 'Company info loaded')
      } else { showToast('', 'Not Found', 'No FMCSA match — enter info manually') }
    } catch (err) { showToast('', 'Lookup Failed', err.message || 'Try entering info manually') }
    setLookupLoading(false)
  }

  const markOnboardingComplete = async () => {
    localStorage.setItem('qv_onboarded', 'true')
    try {
      const { supabase: sb } = await import('../lib/supabase')
      await sb.from('platform_settings').upsert({ owner_id: user?.id, key: 'onboarding_complete', value: 'true' }, { onConflict: 'owner_id,key' })
    } catch (e) { /* non-critical: onboarding setting save failed */ }
  }

  const handleSkip = async () => { await markOnboardingComplete(); onComplete() }

  const handleSaveStep = async (nextStep) => {
    setSaving(true)
    try {
      if (step === 2 && (form.companyName || form.mc || form.dot)) await updateCompany({ name: form.companyName, mc_number: form.mc, dot_number: form.dot, phone: form.phone, address: form.address }).catch(() => {})
      else if (step === 3 && (form.truckMake || form.truckYear || form.truckUnit)) await addVehicle({ type: form.truckType, year: form.truckYear, make: form.truckMake, model: form.truckModel, vin: form.truckVin, license_plate: form.truckPlate, unit_number: form.truckUnit, status: 'Active' }).catch(() => {})
      else if (step === 4) { const name = form.imTheDriver ? (profile?.full_name || firstName) : form.driverName; const phone = form.imTheDriver ? (profile?.phone || form.driverPhone) : form.driverPhone; if (name) await addDriver({ name, phone, license_number: form.driverCDL, medical_card_expiry: form.driverMedExpiry || null, status: 'Active' }).catch(() => {}) }
    } catch (e) { /* non-critical: step save error */ }
    setSaving(false)
    if (nextStep > TOTAL_STEPS) { await markOnboardingComplete(); showToast('', 'Welcome!', 'Your account is ready to roll'); onComplete() }
    else setStep(nextStep)
  }

  const stepLabels = ['Welcome', 'Company', 'Truck', 'Driver', 'First Load']

  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40, overflowY:'auto' }}>
      <div style={{ maxWidth:520, width:'100%' }}>
        {/* Progress bar */}
        <div style={{ marginBottom:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:1 }}>STEP {step} OF {TOTAL_STEPS}</span>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>{stepLabels[step - 1]}</span>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} style={{ flex:1, height:4, borderRadius:2, background: step > i ? 'var(--accent)' : step === i + 1 ? 'var(--accent2)' : 'var(--surface2)', transition:'all 0.3s' }} />
            ))}
          </div>
        </div>
        {/* Step 1: Welcome */}
        {step === 1 && (
          <div style={{ textAlign:'center', paddingTop:32 }}>
            <div style={{ width:64, height:64, borderRadius:16, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}><Ic icon={Zap} size={28} color="var(--accent)" /></div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, letterSpacing:3, marginBottom:8 }}>WELCOME TO <span style={{ color:'var(--accent)' }}>QIVORI AI</span></div>
            <div style={{ fontSize:14, color:'var(--muted)', lineHeight:1.8, maxWidth:400, margin:'0 auto 32px' }}>Let's set up your account in 3 minutes.<br/>AI-powered dispatch, invoicing, compliance, and load matching — all in one platform built for carriers.</div>
            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:28 }}>
              {[{ icon: Building2, label:'Company Info', color:'var(--accent)' }, { icon: Truck, label:'Add Truck', color:'var(--accent2)' }, { icon: User, label:'Add Driver', color:'var(--accent3)' }, { icon: Package, label:'First Load', color:'var(--success)' }].map(item => (
                <div key={item.label} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:11, color:'var(--muted)' }}><Ic icon={item.icon} size={13} color={item.color} />{item.label}</div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'14px 48px', fontSize:15, fontWeight:700 }} onClick={() => setStep(2)}>Let's Go</button>
            <div style={{ marginTop:16 }}><button className="btn btn-ghost" style={{ fontSize:12 }} onClick={handleSkip}>Skip for now</button></div>
          </div>
        )}
        {/* Step 2: Company Info */}
        {step === 2 && (
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>COMPANY INFO</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>Used on invoices, rate confirmations, and FMCSA lookups</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>MC Number</label>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={form.mc} onChange={e => setForm(p => ({ ...p, mc: e.target.value }))} placeholder="MC-1234567" onKeyDown={e => e.key === 'Enter' && lookupFMCSA('mc', form.mc)} style={{ ...wizInput, flex:1 }} />
                    <button onClick={() => lookupFMCSA('mc', form.mc)} disabled={lookupLoading || !form.mc} style={{ padding:'10px 12px', borderRadius:8, background: lookupLoading ? 'var(--border)' : 'var(--accent)', color:'#000', border:'none', fontSize:10, fontWeight:700, cursor: lookupLoading ? 'wait' : 'pointer', whiteSpace:'nowrap' }}>{lookupLoading ? '...' : 'Lookup'}</button>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>DOT Number</label>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={form.dot} onChange={e => setForm(p => ({ ...p, dot: e.target.value }))} placeholder="1234567" onKeyDown={e => e.key === 'Enter' && lookupFMCSA('dot', form.dot)} style={{ ...wizInput, flex:1 }} />
                    <button onClick={() => lookupFMCSA('dot', form.dot)} disabled={lookupLoading || !form.dot} style={{ padding:'10px 12px', borderRadius:8, background: lookupLoading ? 'var(--border)' : 'var(--accent)', color:'#000', border:'none', fontSize:10, fontWeight:700, cursor: lookupLoading ? 'wait' : 'pointer', whiteSpace:'nowrap' }}>{lookupLoading ? '...' : 'Lookup'}</button>
                  </div>
                </div>
              </div>
              <div style={{ fontSize:10, color:'var(--accent)', marginTop:-8 }}>Enter MC or DOT and hit Lookup to auto-fill from FMCSA</div>
              {[{ key:'companyName', label:'Company Name', ph:'Your Trucking LLC' }, { key:'address', label:'Address', ph:'123 Main St, City, State ZIP' }, { key:'phone', label:'Phone', ph:'(555) 123-4567' }].map(f => (
                <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button><div style={{ flex:1 }} />
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setStep(3)}>Skip</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => handleSaveStep(3)}>{saving ? 'Saving...' : 'Continue'}</button>
            </div>
          </div>
        )}
        {/* Step 3: First Truck */}
        {step === 3 && (
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>ADD YOUR FIRST TRUCK</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>Add your primary vehicle — you can always add more later from Fleet</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Equipment Type</label>
                <select value={form.truckType} onChange={e => setForm(p => ({ ...p, truckType: e.target.value }))} style={{ ...wizInput, cursor:'pointer' }}>
                  {['Dry Van','Reefer','Flatbed','Step Deck','Box Truck','Hotshot','Power Only'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                {[{ key:'truckUnit', label:'Unit #', ph:'101' }, { key:'truckYear', label:'Year', ph:'2022' }, { key:'truckMake', label:'Make', ph:'Freightliner' }].map(f => (
                  <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[{ key:'truckModel', label:'Model', ph:'Cascadia' }, { key:'truckPlate', label:'License Plate', ph:'ABC-1234' }].map(f => (
                  <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
                ))}
              </div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>VIN</label><input value={form.truckVin} onChange={e => setForm(p => ({ ...p, truckVin: e.target.value }))} placeholder="1FUJGLDR5MLKJ2841" style={wizInput} /></div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button><div style={{ flex:1 }} />
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setStep(4)}>Skip</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => handleSaveStep(4)}>{saving ? 'Saving...' : 'Continue'}</button>
            </div>
          </div>
        )}
        {/* Step 4: Add Driver */}
        {step === 4 && (
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>ADD A DRIVER</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>Add your first driver to start dispatching loads</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <button onClick={() => setForm(p => ({ ...p, imTheDriver: !p.imTheDriver, driverName: !p.imTheDriver ? (profile?.full_name || '') : '', driverPhone: !p.imTheDriver ? (profile?.phone || '') : '' }))}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', width:'100%', textAlign:'left', background: form.imTheDriver ? 'rgba(240,165,0,0.08)' : 'var(--surface2)', border: `1px solid ${form.imTheDriver ? 'var(--accent)' : 'var(--border)'}`, borderRadius:10, cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ width:20, height:20, borderRadius:6, background: form.imTheDriver ? 'var(--accent)' : 'transparent', border: form.imTheDriver ? 'none' : '2px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {form.imTheDriver && <Ic icon={CheckCircle} size={14} color="#000" />}
                </div>
                <div><div style={{ fontSize:13, fontWeight:700, color: form.imTheDriver ? 'var(--accent)' : 'var(--text)' }}>I'm the driver</div><div style={{ fontSize:11, color:'var(--muted)' }}>Use my profile as the driver info</div></div>
              </button>
              {!form.imTheDriver && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Driver Name</label><input value={form.driverName} onChange={e => setForm(p => ({ ...p, driverName: e.target.value }))} placeholder="John Smith" style={wizInput} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Phone</label><input value={form.driverPhone} onChange={e => setForm(p => ({ ...p, driverPhone: e.target.value }))} placeholder="(555) 123-4567" style={wizInput} /></div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>CDL Number</label><input value={form.driverCDL} onChange={e => setForm(p => ({ ...p, driverCDL: e.target.value }))} placeholder="CDL-A 12345" style={wizInput} /></div>
                <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Medical Card Expiry</label><input type="date" value={form.driverMedExpiry} onChange={e => setForm(p => ({ ...p, driverMedExpiry: e.target.value }))} style={{ ...wizInput, colorScheme:'dark' }} /></div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button><div style={{ flex:1 }} />
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setStep(5)}>Skip</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => handleSaveStep(5)}>{saving ? 'Saving...' : 'Continue'}</button>
            </div>
          </div>
        )}
        {/* Step 5: First Load CTA */}
        {step === 5 && (
          <div style={{ textAlign:'center', paddingTop:24 }}>
            <div style={{ width:64, height:64, borderRadius:16, background:'rgba(52,176,104,0.1)', border:'1px solid rgba(52,176,104,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}><Ic icon={CheckCircle} size={28} color="var(--success)" /></div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:2, marginBottom:8 }}>YOU'RE ALL <span style={{ color:'var(--success)' }}>SET</span></div>
            <div style={{ fontSize:14, color:'var(--muted)', lineHeight:1.8, maxWidth:380, margin:'0 auto 32px' }}>Ready to book your first load? Scan a rate confirmation or search the AI-powered load board.</div>
            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
              <button className="btn btn-primary" style={{ padding:'14px 28px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:8 }} onClick={async () => { await markOnboardingComplete(); showToast('','Welcome!','Opening AI Load Board...'); onComplete('load-board') }}><Ic icon={Search} size={14} /> Search Load Board</button>
              <button style={{ padding:'14px 28px', fontSize:13, fontWeight:700, borderRadius:10, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.3)', color:'var(--accent)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:8 }} onClick={async () => { await markOnboardingComplete(); showToast('','Welcome!','Opening Dispatch...'); onComplete('loads') }}><Ic icon={FileText} size={14} /> Scan Rate Con</button>
            </div>
            <div style={{ marginTop:20 }}><button className="btn btn-ghost" style={{ fontSize:12 }} onClick={async () => { await markOnboardingComplete(); showToast('','Welcome!','Your account is ready'); onComplete() }}>Go to Dashboard</button></div>
          </div>
        )}
      </div>
    </div>
  )
}

function CarrierLayoutInner() {
  const { logout, showToast, theme, setTheme, profile, demoMode, goToLogin } = useApp()
  const { activeLoads, unpaidInvoices, company, loads, drivers } = useCarrier()
  const { t } = useTranslation()

  // Check if user needs onboarding
  const isNewUser = !localStorage.getItem('qv_onboarded') && !company?.name && loads.length === 0
  const [showOnboarding, setShowOnboarding] = useState(isNewUser)

  const [activeView,    setActiveView]    = useState('dashboard')
  const [drawerLoadId,  setDrawerLoadId]  = useState(null)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [notifOpen,     setNotifOpen]     = useState(false)
  const [mobileNav,     setMobileNav]     = useState(false)
  const [readNotifs, setReadNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('qv_read_notifs') || '[]') } catch { return [] }
  })
  const [dismissedNotifs, setDismissedNotifs] = useState([])
  const notifRef = useRef(null)

  const navTo = (viewId) => {
    setActiveView(viewId)
    setMobileNav(false)
  }

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(o => !o) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Click outside to close notification dropdown
  useEffect(() => {
    if (!notifOpen) return
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen])

  // Persist read state
  useEffect(() => {
    localStorage.setItem('qv_read_notifs', JSON.stringify(readNotifs))
  }, [readNotifs])

  // Generate rich notifications from real data
  const timeAgo = (mins) => {
    if (mins < 60) return `${mins}m ago`
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
    return `${Math.floor(mins / 1440)}d ago`
  }

  const ALL_NOTIFS = useMemo(() => {
    const n = []
    let id = 0
    // Load status changes
    const bookedLoads = loads.filter(l => l.status === 'Booked')
    const dispatchedLoads = loads.filter(l => l.status === 'Dispatched' || l.status === 'In Transit')
    const deliveredLoads = loads.filter(l => l.status === 'Delivered')
    if (bookedLoads.length > 0) n.push({ id: `load-booked-${bookedLoads.length}`, icon: Package, title: `${bookedLoads.length} Load${bookedLoads.length > 1 ? 's' : ''} Booked`, desc: `${bookedLoads[0]?.loadId || 'Load'} ${bookedLoads.length > 1 ? `and ${bookedLoads.length - 1} more` : ''} ready for dispatch`, color: 'var(--accent2)', view: 'loads', type: 'load', time: 12 })
    if (dispatchedLoads.length > 0) n.push({ id: `load-dispatched-${dispatchedLoads.length}`, icon: Truck, title: `${dispatchedLoads.length} Load${dispatchedLoads.length > 1 ? 's' : ''} In Transit`, desc: `Currently en route — track on dispatch board`, color: 'var(--accent)', view: 'loads', type: 'load', time: 25 })
    if (deliveredLoads.length > 0) n.push({ id: `load-delivered-${deliveredLoads.length}`, icon: CheckCircle, title: `${deliveredLoads.length} Load${deliveredLoads.length > 1 ? 's' : ''} Delivered`, desc: `Ready for invoicing`, color: 'var(--success)', view: 'loads', type: 'load', time: 45 })

    // Invoice notifications
    if (unpaidInvoices.length > 0) {
      const total = unpaidInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
      const overdue = unpaidInvoices.filter(i => {
        if (!i.due_date) return false
        return new Date(i.due_date) < new Date()
      })
      if (overdue.length > 0) {
        n.push({ id: `inv-overdue-${overdue.length}`, icon: AlertTriangle, title: `${overdue.length} Overdue Invoice${overdue.length > 1 ? 's' : ''}`, desc: `$${overdue.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0).toLocaleString()} past due — follow up ASAP`, color: 'var(--danger)', view: 'financials', type: 'invoice', time: 60 })
      }
      n.push({ id: `inv-unpaid-${unpaidInvoices.length}`, icon: CreditCard, title: `${unpaidInvoices.length} Unpaid Invoice${unpaidInvoices.length > 1 ? 's' : ''}`, desc: `$${total.toLocaleString()} outstanding receivables`, color: 'var(--accent)', view: 'financials', type: 'invoice', time: 120 })
    }

    // Compliance alerts — documents expiring
    if (drivers.length > 0) {
      const expiringDrivers = drivers.filter(d => {
        if (!d.medical_card_expiry && !d.license_expiry) return false
        const now = new Date()
        const med = d.medical_card_expiry ? new Date(d.medical_card_expiry) : null
        const lic = d.license_expiry ? new Date(d.license_expiry) : null
        const threshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
        return (med && med < threshold) || (lic && lic < threshold)
      })
      if (expiringDrivers.length > 0) {
        n.push({ id: `compliance-expiring-${expiringDrivers.length}`, icon: Shield, title: `${expiringDrivers.length} Document${expiringDrivers.length > 1 ? 's' : ''} Expiring Soon`, desc: `${expiringDrivers[0]?.full_name || 'Driver'} CDL/medical card expires within 30 days`, color: 'var(--danger)', view: 'compliance', type: 'compliance', time: 180 })
      }
    }

    // Active loads notification
    if (activeLoads.length > 0) n.push({ id: `active-loads-${activeLoads.length}`, icon: Zap, title: `${activeLoads.length} Active Load${activeLoads.length > 1 ? 's' : ''}`, desc: 'View your dispatch board for live tracking', color: 'var(--accent)', view: 'loads', type: 'load', time: 300 })

    // Trial ending (sample)
    if (loads.length > 0 && loads.length < 5) n.push({ id: 'trial-ending', icon: Clock, title: 'Free Trial — 7 Days Left', desc: 'Upgrade to keep all your data and unlock premium features', color: 'var(--accent)', view: 'settings', type: 'system', time: 1440 })

    // New referral signup — only show if user has referral activity
    // TODO: wire to actual referral data when available

    // Weekly summary available
    if (loads.length >= 3) n.push({ id: 'weekly-summary', icon: BarChart2, title: 'Weekly Summary Ready', desc: `${loads.length} loads, $${loads.reduce((s,l) => s + (l.gross || 0), 0).toLocaleString()} gross — view your analytics`, color: 'var(--accent2)', view: 'analytics', type: 'summary', time: 4320 })

    // Getting started prompts
    if (loads.length === 0) n.push({ id: 'get-started', icon: Package, title: 'Get Started', desc: 'Add your first load to begin dispatching', color: 'var(--accent)', view: 'loads', type: 'system', time: 5 })
    if (drivers.length === 0) n.push({ id: 'add-drivers', icon: Users, title: 'Add Drivers', desc: 'Add your drivers to assign loads', color: 'var(--accent2)', view: 'drivers', type: 'system', time: 10 })

    return n
  }, [loads, activeLoads, unpaidInvoices, drivers])

  const notifs = ALL_NOTIFS.filter(n => !dismissedNotifs.includes(n.id))
  const unreadCount = notifs.filter(n => !readNotifs.includes(n.id)).length

  const markAllRead = () => {
    setReadNotifs(notifs.map(n => n.id))
  }
  const markRead = (nid) => {
    if (!readNotifs.includes(nid)) setReadNotifs(prev => [...prev, nid])
  }

  const notifTypeIcon = { load: '🚛', invoice: '💰', compliance: '📋', system: '⚙️', referral: '🤝', summary: '📊' }

  const sStyle = { fontFamily:"'DM Sans',sans-serif", width:'100vw', height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' }
  const inp    = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', color:'var(--text)', fontSize:12, outline:'none', fontFamily:"'DM Sans',sans-serif" }

  return (
    <div style={sStyle}>

      {/* Demo banner */}
      {demoMode && (
        <div style={{ background:'linear-gradient(90deg, #f0a500, #e09000)', padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'center', gap:16, flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#000' }}>You're in demo mode — sign up to unlock your dashboard</span>
          <button onClick={goToLogin} style={{ background:'#000', color:'#f0a500', border:'none', borderRadius:8, padding:'6px 16px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Sign Up Free
          </button>
        </div>
      )}

      {/* ── TOP BAR ───────────────────────────────────────────────── */}
      <div className="carrier-topbar" style={{ height:48, background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:12, flexShrink:0, zIndex:100 }}>
        {/* Mobile hamburger */}
        <button className="mobile-nav-btn" onClick={() => setMobileNav(o => !o)}
          style={{ display:'none', background:'none', border:'none', color:'var(--text)', cursor:'pointer', fontSize:20, padding:'4px 8px', flexShrink:0 }}>
          {mobileNav ? '✕' : '☰'}
        </button>
        {/* Logo */}
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:17, letterSpacing:3, marginRight:4, flexShrink:0 }}>
          QI<span style={{ color:'var(--accent)' }}>VORI</span>
          <span style={{ fontSize:11, color:'var(--accent2)', letterSpacing:1, fontFamily:"'DM Sans',sans-serif", fontWeight:700, marginLeft:6 }}>AI</span>
        </div>

        {/* Search */}
        <div className="search-bar" onClick={() => setSearchOpen(true)}
          style={{ flex:1, maxWidth:380, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', display:'flex', alignItems:'center', gap:8, cursor:'pointer', transition:'border-color 0.15s' }}
          onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
          onMouseOut={e  => e.currentTarget.style.borderColor='var(--border)'}>
          <Search size={13} style={{ color:'var(--muted)' }} />
          <span style={{ color:'var(--muted)', fontSize:12, flex:1, userSelect:'none' }}>Search loads, drivers, brokers…</span>
          <span style={{ fontSize:10, color:'var(--muted)', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 5px' }}>⌘K</span>
        </div>

        <div style={{ flex:1 }} />

        {/* Theme toggle */}
        {(() => {
          const THEMES = [
            { id:'default',       icon: Moon,  label:'Default Dark',   title:'Standard dark theme' },
            { id:'colorblind',    icon: Eye,   label:'Colorblind',      title:'Okabe-Ito palette — safe for deuteranopia & protanopia' },
            { id:'high-contrast', icon: Zap,   label:'High Contrast',  title:'Maximum contrast for low-light or bright environments' },
          ]
          return (
            <div className="theme-toggle" style={{ display:'flex', alignItems:'center', gap:2, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:2 }}>
              {THEMES.map(t => (
                <button key={t.id} onClick={() => setTheme(t.id)} title={t.title}
                  style={{ padding:'4px 9px', fontSize:12, borderRadius:6, border:'none', cursor:'pointer',
                    background: theme === t.id ? 'var(--surface3)' : 'transparent',
                    color: theme === t.id ? 'var(--accent)' : 'var(--muted)',
                    fontFamily:"'DM Sans',sans-serif", fontWeight: theme === t.id ? 700 : 400,
                    outline: theme === t.id ? '1px solid var(--border)' : 'none',
                    transition:'all 0.15s' }}>
                  {React.createElement(t.icon, { size:14 })}
                </button>
              ))}
            </div>
          )
        })()}

        {/* AI status pill */}
        <div className="ai-status" style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:8, padding:'5px 12px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 6px var(--accent)', animation:'qv-ai-pulse 2s ease-in-out infinite' }}/>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)' }}>AI ACTIVE</span>
        </div>

        {/* Notifications */}
        <div ref={notifRef} style={{ position:'relative' }}>
          <button onClick={() => setNotifOpen(o => !o)}
            style={{ ...inp, display:'flex', alignItems:'center', gap:6, cursor:'pointer', padding:'5px 10px', position:'relative' }}>
            <Bell size={15} />
            {unreadCount > 0 && (
              <span style={{
                position:'absolute', top:-4, right:-4,
                background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:800,
                minWidth:16, height:16, borderRadius:10,
                display:'flex', alignItems:'center', justifyContent:'center',
                padding:'0 4px', boxShadow:'0 2px 6px rgba(239,68,68,0.4)',
                animation:'pulse 2s infinite'
              }}>{unreadCount}</span>
            )}
          </button>
          {notifOpen && (
            <div style={{
              position:'absolute', top:44, right:0, width:380,
              background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:14, boxShadow:'0 20px 60px rgba(0,0,0,0.7)',
              zIndex:999, overflow:'hidden', maxHeight:460, display:'flex', flexDirection:'column'
            }}>
              {/* Header */}
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontWeight:800, fontSize:14 }}>Notifications</span>
                  {unreadCount > 0 && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'var(--danger)15', color:'var(--danger)', border:'1px solid var(--danger)30' }}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead}
                      style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
                      Mark all as read
                    </button>
                  )}
                  <button onClick={() => setNotifOpen(false)}
                    style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16, lineHeight:1, padding:0 }}>✕</button>
                </div>
              </div>

              {/* Notification list */}
              <div style={{ overflowY:'auto', maxHeight:360, flex:1 }}>
                {notifs.length === 0 ? (
                  <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--muted)' }}>
                    <CheckCircle size={28} color="var(--success)" style={{ marginBottom:10, opacity:0.6 }} />
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>All caught up!</div>
                    <div style={{ fontSize:11 }}>No new notifications right now</div>
                  </div>
                ) : notifs.map(n => {
                  const isUnread = !readNotifs.includes(n.id)
                  return (
                    <div key={n.id}
                      style={{
                        padding:'12px 18px', borderBottom:'1px solid var(--border)',
                        cursor:'pointer', display:'flex', gap:12, alignItems:'flex-start',
                        background: isUnread ? 'rgba(240,165,0,0.03)' : 'transparent',
                        transition:'background 0.15s'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = isUnread ? 'rgba(240,165,0,0.07)' : 'var(--surface2)'}
                      onMouseOut={e => e.currentTarget.style.background = isUnread ? 'rgba(240,165,0,0.03)' : 'transparent'}
                      onClick={() => { markRead(n.id); navTo(n.view); setNotifOpen(false) }}>
                      {/* Unread dot */}
                      <div style={{ width:8, minWidth:8, paddingTop:12 }}>
                        {isUnread && (
                          <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 6px var(--accent)' }} />
                        )}
                      </div>
                      {/* Icon */}
                      <div style={{
                        width:36, height:36, borderRadius:10,
                        background: n.color + '15', border:'1px solid ' + n.color + '25',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        flexShrink:0, color: n.color
                      }}>
                        {React.createElement(n.icon, { size:16 })}
                      </div>
                      {/* Content */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                          <div style={{ fontSize:12, fontWeight: isUnread ? 800 : 600, color: isUnread ? 'var(--text)' : 'var(--muted)' }}>
                            {n.title}
                          </div>
                          <span style={{ fontSize:9, color:'var(--muted)', flexShrink:0, marginLeft:8 }}>
                            {timeAgo(n.time)}
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {n.desc}
                        </div>
                        <div style={{ marginTop:4 }}>
                          <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:4, background: n.color + '12', color: n.color, textTransform:'uppercase', letterSpacing:0.5 }}>
                            {n.type}
                          </span>
                        </div>
                      </div>
                      {/* Dismiss */}
                      <button onClick={e => { e.stopPropagation(); setDismissedNotifs(d => [...d, n.id]) }}
                        style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:13, padding:'4px', opacity:0.5, flexShrink:0 }}
                        onMouseOver={e => e.currentTarget.style.opacity = '1'}
                        onMouseOut={e => e.currentTarget.style.opacity = '0.5'}>
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              {notifs.length > 0 && (
                <div style={{ padding:'10px 18px', borderTop:'1px solid var(--border)', textAlign:'center', flexShrink:0, background:'var(--surface)' }}>
                  <button onClick={() => { navTo('settings'); setNotifOpen(false) }}
                    style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>
                    View All Notifications →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notification pulse animation */}
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
        `}</style>

        {/* Controls */}
        <button className="btn btn-primary" style={{ fontSize:12, fontWeight:700, padding:'5px 14px' }}
          onClick={() => showToast('','Post Truck','Opening truck availability posting...')}>
          <Truck size={13} /> Post Truck
        </button>
      </div>

      {/* ── BODY: SIDEBAR + CONTENT ───────────────────────────────── */}
      <div style={{ flex:1, display:'flex', minHeight:0 }}>

        {/* Mobile sidebar overlay */}
        {mobileNav && <div className="mobile-nav-overlay" onClick={() => setMobileNav(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:998, display:'none' }} />}

        {/* LEFT SIDEBAR */}
        <div className={`carrier-sidebar${mobileNav ? ' mobile-open' : ''}`} style={{ width:220, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden' }}>

          {/* Company badge */}
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'var(--surface2)', border:'1px solid var(--border)',
                display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
                {company?.logo
                  ? <img src={company.logo} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                  : <span style={{ fontSize:11, fontWeight:800, color:'var(--accent)' }}>
                      {(company?.name || profile?.company_name || 'Q').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </span>
                }
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:800, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {company?.name || profile?.company_name || profile?.full_name || 'Qivori'}
                </div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{company?.mc ? `MC ${company.mc}` : company?.dot ? `DOT ${company.dot}` : 'Carrier'}</div>
              </div>
            </div>
          </div>

          {/* Nav items — flat */}
          <div style={{ flex:1, padding:'4px 0', overflowY:'auto', minHeight:0 }}>
            {NAV.map(item => {
              if (item.id === '_divider') return <div key="_div" style={{ margin:'4px 16px', borderTop:'1px solid var(--border)' }} />
              const isActive = activeView === item.id
              return (
                <div key={item.id} onClick={() => navTo(item.id)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 16px', cursor:'pointer',
                    borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    background: isActive ? 'rgba(240,165,0,0.06)' : 'transparent',
                    transition:'all 0.12s' }}
                  onMouseOver={e => { if (!isActive) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
                  onMouseOut={e  => { if (!isActive) e.currentTarget.style.background='transparent' }}>
                  <span style={{ width:20, display:'flex', justifyContent:'center', alignItems:'center', flexShrink:0 }}>
                    {React.createElement(item.icon, { size:15, color: isActive ? 'var(--accent)' : undefined })}
                  </span>
                  <span style={{ fontSize:12, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--accent)' : 'var(--text)', flex:1 }}>{item.i18nKey ? t(item.i18nKey) : item.label}</span>
                </div>
              )
            })}
          </div>

          {/* Bottom: Language toggle + Log Out */}
          <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'flex', justifyContent:'center' }}>
              <LanguageToggle />
            </div>
            <button onClick={logout} style={{ width:'100%', padding:'7px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor='var(--danger)'; e.currentTarget.style.color='var(--danger)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}>
              {t('nav.logout')}
            </button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="carrier-main">
          {showOnboarding ? (
            <OnboardingWizard onComplete={(navTarget) => { setShowOnboarding(false); if (navTarget) setActiveView(navTarget) }} />
          ) : (
            <>
              <ViewErrorBoundary key={activeView}>
                {resolveView(activeView, navTo, setDrawerLoadId)}
              </ViewErrorBoundary>
              {drawerLoadId && <LoadDetailDrawer loadId={drawerLoadId} onClose={() => setDrawerLoadId(null)} />}
            </>
          )}
        </div>
      </div>

      <Toast />
      <QuickActions onTabChange={(viewId) => navTo(viewId)} />
      <AIChatbox />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)}
        onTabChange={(viewId) => { navTo(viewId); setSearchOpen(false) }} />
    </div>
  )
}
