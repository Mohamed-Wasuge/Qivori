import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import {
  Users, Truck, DollarSign, Shield, Activity, AlertTriangle, AlertCircle,
  CheckCircle, Clock, Plus, CloudSun, FileText, Zap, FlaskConical,
  BarChart2, User, ArrowUpRight, ArrowDownRight, Smartphone, Target, TrendingUp,
  Wrench, Radio, RefreshCw, Sparkles
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import * as db from '../../lib/database'
import { Ic, HubTabBar } from './shared'
import { ProfitIQTab } from './ProfitIQTab'
import { AIDispatchDashboard } from './AIDispatchDashboard'
import { SimulationDashboard } from './SimulationDashboard'
import { ActivityLog } from './ActivityLog'

// Lazy-load domain modules
const lazyN = (importFn, name) => lazy(() => importFn().then(m => ({ default: m[name] })))

// Drivers
const DriverProfiles = lazyN(() => import('../../pages/carrier/DriverScorecard'), 'DriverProfiles')
const DriverOnboarding = lazyN(() => import('../../pages/carrier/DriverScorecard'), 'DriverOnboarding')
const DriverScorecard = lazyN(() => import('../../pages/carrier/DriverScorecard'), 'DriverScorecard')

// Compliance
const CarrierIFTA = lazyN(() => import('../../pages/carrier/Compliance'), 'CarrierIFTA')
const CarrierDVIR = lazyN(() => import('../../pages/carrier/Compliance'), 'CarrierDVIR')
const CarrierClearinghouse = lazyN(() => import('../../pages/carrier/Compliance'), 'CarrierClearinghouse')
const AuditToday = lazyN(() => import('../../pages/carrier/Compliance'), 'AuditToday')

// Fleet
const FleetMap = lazyN(() => import('../../pages/carrier/FleetMapGoogle'), 'FleetMapGoogle')
const FleetManager = lazyN(() => import('../../pages/carrier/Fleet'), 'FleetManager')
const FuelOptimizer = lazyN(() => import('../../pages/carrier/Fleet'), 'FuelOptimizer')
const EquipmentManager = lazyN(() => import('../../pages/carrier/Fleet'), 'EquipmentManager')

// Finance
const BrokerRiskIntel = lazyN(() => import('../../pages/carrier/Finance'), 'BrokerRiskIntel')
const ExpenseTracker = lazyN(() => import('../../pages/carrier/Finance'), 'ExpenseTracker')
const FactoringCashflow = lazyN(() => import('../../pages/carrier/Finance'), 'FactoringCashflow')
const CashFlowForecaster = lazyN(() => import('../../pages/carrier/Finance'), 'CashFlowForecaster')
const PLDashboard = lazyN(() => import('../../pages/carrier/Finance'), 'PLDashboard')
const ReceivablesAging = lazyN(() => import('../../pages/carrier/Finance'), 'ReceivablesAging')
const AccountsPayable = lazyN(() => import('../../pages/carrier/Finance'), 'AccountsPayable')
const QuickBooksExport = lazyN(() => import('../../pages/carrier/Finance'), 'QuickBooksExport')
const InvoicesHub = lazyN(() => import('../../pages/carrier/Finance'), 'InvoicesHub')

// HR
const DQFileManager = lazyN(() => import('../../pages/carrier/HR'), 'DQFileManager')
const ExpiryAlerts = lazyN(() => import('../../pages/carrier/HR'), 'ExpiryAlerts')
const DrugAlcoholCompliance = lazyN(() => import('../../pages/carrier/HR'), 'DrugAlcoholCompliance')
const IncidentTracker = lazyN(() => import('../../pages/carrier/HR'), 'IncidentTracker')
const PayrollTracker = lazyN(() => import('../../pages/carrier/HR'), 'PayrollTracker')
const HiringPipeline = lazyN(() => import('../../pages/carrier/HR'), 'HiringPipeline')
const DriverContracts = lazyN(() => import('../../pages/carrier/HR'), 'DriverContracts')

// EDI
const EDIDashboard = lazyN(() => import('../../pages/carrier/EDIDashboard'), 'EDIDashboard')

export function QInsightsFeed({ hub, summary, onNavigate }) {
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [dismissed, setDismissed] = useState(new Set())

  const fetchInsights = useCallback(async () => {
    if (!summary || loaded) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/q-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hub, summary }),
      })
      if (res.insights && res.insights.length > 0) {
        setInsights(res.insights)
      }
    } catch (e) {
      setError('Q is thinking...')
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [hub, summary, loaded])

  useEffect(() => { fetchInsights() }, [fetchInsights])

  const iconMap = {
    dollar: DollarSign, alert: AlertTriangle, truck: Truck, clock: Clock,
    shield: Shield, user: User, chart: BarChart2, zap: Zap,
  }
  const priorityColors = {
    critical: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', accent: '#ef4444', glow: 'rgba(239,68,68,0.08)' },
    high: { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)', accent: '#f59e0b', glow: 'rgba(245,158,11,0.08)' },
    medium: { bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.2)', accent: '#3b82f6', glow: 'rgba(59,130,246,0.08)' },
    low: { bg: 'rgba(107,114,128,0.04)', border: 'var(--border)', accent: 'var(--muted)', glow: 'transparent' },
  }

  const visible = insights.filter(i => !dismissed.has(i.id))
  if (!loading && visible.length === 0 && !error) return null

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(240,165,0,0.03) 0%, rgba(240,165,0,0.01) 100%)', border: '1px solid rgba(240,165,0,0.12)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: visible.length > 0 || loading ? '1px solid rgba(240,165,0,0.08)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={Zap} size={14} color="var(--accent)" />
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Sans',sans-serif", letterSpacing: 0.5 }}>Q Intelligence</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 8 }}>AI-powered insights</span>
          </div>
        </div>
        {loaded && !loading && (
          <button onClick={() => { setLoaded(false); setInsights([]); setDismissed(new Set()) }} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
            Refresh
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 16, height: 16, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'qspin 0.8s linear infinite' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Q is analyzing your operation...</span>
          <style>{`@keyframes qspin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Insights */}
      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visible.map((insight, idx) => {
            const colors = priorityColors[insight.priority] || priorityColors.medium
            const InsightIcon = iconMap[insight.icon] || Zap
            return (
              <div key={insight.id || idx} style={{
                padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start',
                borderBottom: idx < visible.length - 1 ? '1px solid rgba(240,165,0,0.06)' : 'none',
                background: colors.bg, transition: 'background 0.15s',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: colors.glow, border: `1px solid ${colors.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <InsightIcon size={15} color={colors.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif" }}>{insight.title}</span>
                    {insight.priority === 'critical' && (
                      <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', textTransform: 'uppercase', letterSpacing: 0.5 }}>Urgent</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>{insight.body}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={() => onNavigate && onNavigate(insight.action_target, insight.action_type, insight)}
                      style={{
                        padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: colors.accent, color: '#fff', border: 'none', cursor: 'pointer',
                        fontFamily: "'DM Sans',sans-serif", transition: 'opacity 0.15s',
                      }}
                    >
                      {insight.action_label || 'View'}
                    </button>
                    <button
                      onClick={() => setDismissed(prev => new Set([...prev, insight.id]))}
                      style={{ padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 500, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Drivers Hub ──
export function DriversHub() {
  const [tab, setTab] = useState('team')
  const [complianceTab, setComplianceTab] = useState('dq-files')
  const { drivers, loads, activeLoads } = useCarrier()
  const TABS = [
    { id:'team', label:'Team' },
    { id:'payroll', label:'Payroll' },
    { id:'compliance', label:'Compliance' },
    { id:'performance', label:'Performance' },
    { id:'contracts', label:'Contracts' },
    { id:'onboarding', label:'Onboarding' },
    { id:'hiring', label:'Hiring' },
  ]

  // Q Intelligence summary for drivers hub
  const driversSummary = useMemo(() => {
    const active = drivers.filter(d => d.status === 'Active' || !d.status)
    const names = drivers.map(d => d.full_name || d.name).join(', ')
    const expiring = drivers.filter(d => {
      const exp = d.cdl_expiry || d.license_expiry || d.medical_card_expiry
      if (!exp) return false
      const days = Math.round((new Date(exp) - new Date()) / 86400000)
      return days >= 0 && days <= 60
    })
    const loadsThisWeek = (loads || []).filter(l => {
      const d = l.created_at || l.pickup_date
      if (!d) return false
      const diff = (new Date() - new Date(d)) / 86400000
      return diff <= 7
    })
    return `HUB: Drivers/HR\nDrivers (${drivers.length}): ${names}\nActive: ${active.length}\nLoads this week: ${loadsThisWeek.length}\nDrivers with expiring docs (60 days): ${expiring.map(d => `${d.full_name||d.name} (${d.cdl_expiry||d.medical_card_expiry})`).join(', ') || 'None'}\nPay models: ${drivers.map(d => `${d.full_name||d.name}: ${d.pay_model||'percent'} @ ${d.pay_rate||'28'}${d.pay_model==='permile'?'/mi':'%'}`).join(', ')}`
  }, [drivers, loads])

  const activeCount = drivers.filter(d => d.status === 'Active' || !d.status).length
  const onRoadCount = drivers.filter(d => {
    const name = d.full_name || d.name
    return activeLoads.some(l => l.driver === name && ['In Transit','Loaded','En Route to Pickup'].includes(l.status))
  }).length
  const idleCount = drivers.filter(d => {
    const name = d.full_name || d.name
    return !activeLoads.some(l => l.driver === name)
  }).length

  const COMPLIANCE_TABS = [
    { id:'dq-files', label:'DQ Files' },
    { id:'expiry-alerts', label:'Expiry Alerts' },
    { id:'drug-alcohol', label:'Drug & Alcohol' },
    { id:'incidents', label:'Incidents' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Corporate HR header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={Users} size={18} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Human Resources</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Team management, payroll & compliance</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            {[
              { label:'Active', val: activeCount, color:'var(--success)' },
              { label:'On Road', val: onRoadCount, color:'var(--accent)' },
              { label:'Idle', val: idleCount, color: idleCount > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:50 }}>
                <div style={{ fontSize:18, fontWeight:800, color: s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
          {tab === 'team' && (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ padding:'16px 20px 0' }}>
                <QInsightsFeed hub="drivers" summary={driversSummary} onNavigate={(target) => { if (target) setTab(target === 'audit' ? 'compliance' : target) }} />
              </div>
              {drivers.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Users} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>ADD YOUR FIRST DRIVER</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>Q needs drivers to automate dispatch, compliance checks, and payroll. Add a driver to get started.</div>
                  <button className="btn btn-primary" style={{ marginTop:16, fontSize:12, padding:'10px 24px' }} onClick={() => setTab('onboarding')}>
                    <Ic icon={Plus} size={14} /> Add Driver
                  </button>
                </div>
              ) : <DriverProfiles />}
            </div>
          )}
          {tab === 'payroll' && <PayrollTracker />}
          {tab === 'compliance' && (
            <div style={{ display:'flex', flexDirection:'column' }}>
              <div style={{ flexShrink:0, display:'flex', gap:0, padding:'0 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
                {COMPLIANCE_TABS.map(ct => (
                  <button key={ct.id} onClick={() => setComplianceTab(ct.id)} style={{
                    padding:'10px 18px', fontSize:12, fontWeight: complianceTab === ct.id ? 700 : 500, cursor:'pointer', border:'none', background:'none',
                    color: complianceTab === ct.id ? 'var(--accent)' : 'var(--muted)',
                    borderBottom: complianceTab === ct.id ? '2px solid var(--accent)' : '2px solid transparent',
                    transition:'all 0.15s',
                  }}>{ct.label}</button>
                ))}
              </div>
              <div style={{ flex:1, minHeight:0 }}>
                {complianceTab === 'dq-files' && <DQFileManager />}
                {complianceTab === 'expiry-alerts' && <ExpiryAlerts />}
                {complianceTab === 'drug-alcohol' && <DrugAlcoholCompliance />}
                {complianceTab === 'incidents' && <IncidentTracker />}
              </div>
            </div>
          )}
          {tab === 'contracts' && <DriverContracts />}
          {tab === 'performance' && <DriverScorecard />}
          {tab === 'onboarding' && <DriverOnboarding />}
          {tab === 'hiring' && <HiringPipeline />}
        </Suspense>
      </div>
    </div>
  )
}

// ── Fleet Hub ──
export function FleetHub() {
  const [tab, setTab] = useState('fleet')
  const { loads, activeLoads, drivers, vehicles, expenses, fuelCostPerMile, deliveredLoads } = useCarrier()
  const TABS = [{ id:'fleet', label:'Vehicles' },{ id:'map', label:'Live Map' },{ id:'fuel', label:'Fuel' },{ id:'manager', label:'Maintenance' }]

  const totalMiles = (deliveredLoads || []).reduce((s, l) => s + (Number(l.miles) || 0), 0)
  const onRoad = (activeLoads || []).filter(l => ['In Transit','Loaded','En Route to Pickup'].includes(l.status)).length
  const fuelExpenses = (expenses || []).filter(e => (e.category || '').toLowerCase().includes('fuel'))
  const totalFuel = fuelExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const truckCount = (vehicles || []).length

  const fleetSummary = useMemo(() => {
    return `HUB: Fleet\nTrucks: ${truckCount}\nOn road: ${onRoad}\nTotal miles driven: ${totalMiles.toLocaleString()}\nFuel spend: $${totalFuel.toLocaleString()}\nFuel cost/mile: $${fuelCostPerMile?.toFixed(2) || 'N/A'}\nActive loads: ${(activeLoads||[]).length}\nActive load routes: ${(activeLoads||[]).slice(0,10).map(l => `${l.origin}→${l.destination} (${l.driver||'unassigned'})`).join(', ') || 'None'}`
  }, [truckCount, onRoad, totalMiles, totalFuel, fuelCostPerMile, activeLoads])

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Fleet header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={Truck} size={18} color="var(--accent3,#3b82f6)" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Fleet Management</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Vehicles, tracking, fuel & maintenance</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {[
              { label:'Trucks', val: String(truckCount), color:'var(--accent3,#3b82f6)' },
              { label:'On Road', val: String(onRoad), color:'var(--success)' },
              { label:'Total Miles', val: totalMiles > 1000 ? `${(totalMiles/1000).toFixed(1)}K` : String(totalMiles), color:'var(--accent)' },
              { label:'Fuel Cost', val: `$${totalFuel.toLocaleString()}`, color:'var(--danger)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:60 }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
          {tab === 'fleet' && (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ padding:'16px 20px 0' }}>
                <QInsightsFeed hub="fleet" summary={fleetSummary} onNavigate={(target) => { if (target) setTab(target) }} />
              </div>
              {(vehicles || []).length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Truck} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>ADD YOUR FIRST VEHICLE</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>Register your truck to enable fleet tracking, fuel optimization, DVIR inspections, and maintenance scheduling.</div>
                </div>
              ) : <EquipmentManager />}
            </div>
          )}
          {tab === 'map' && <FleetMap />}
          {tab === 'fuel' && <FuelOptimizer />}
          {tab === 'manager' && <FleetManager />}
        </Suspense>
      </div>
    </div>
  )
}

// ── Financials Hub ──
export function FinancialsHub() {
  const [tab, setTab] = useState('overview')
  const [reportsTab, setReportsTab] = useState('pl')
  const { loads, invoices, expenses, totalRevenue, totalExpenses, drivers: ctxDrivers, fuelCostPerMile, deliveredLoads, activeLoads } = useCarrier()
  const TABS = [
    { id:'overview', label:'Overview' },
    { id:'invoices', label:'Invoices' },
    { id:'expenses', label:'Expenses' },
    { id:'reports', label:'Reports' },
    { id:'factoring', label:'Factoring' },
  ]

  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0
  const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid')
  const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const factoredInvoices = invoices.filter(i => i.status === 'Factored')
  const factoredTotal = factoredInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const paidInvoices = invoices.filter(i => i.status === 'Paid')
  const collectedTotal = paidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const overdueInvoices = unpaidInvoices.filter(i => i.dueDate && new Date(i.dueDate) < new Date())
  const overdueTotal = overdueInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const truckCount = Math.max((ctxDrivers || []).length, 1)
  const avgPayPct = (() => {
    const pctDrivers = (ctxDrivers || []).filter(d => d.pay_model === 'percent' && d.pay_rate)
    if (pctDrivers.length > 0) return pctDrivers.reduce((s, d) => s + Number(d.pay_rate), 0) / pctDrivers.length / 100
    return 0.28 // fallback — per-driver rate preferred
  })()
  const profitPerTruck = Math.round(netProfit / truckCount)
  const marginColor = margin >= 30 ? 'var(--success)' : margin >= 20 ? 'var(--warning,#f59e0b)' : 'var(--danger)'

  const financialsSummary = useMemo(() => {
    const avgDaysToCollect = paidInvoices.length > 0 ? Math.round(paidInvoices.reduce((s, i) => {
      const inv = new Date(i.date || i.created_at); const paid = new Date(i.paid_at || i.updated_at || Date.now())
      return s + (paid - inv) / 86400000
    }, 0) / paidInvoices.length) : 0
    return `HUB: Financials\nRevenue: $${totalRevenue.toLocaleString()}\nExpenses: $${totalExpenses.toLocaleString()}\nNet profit: $${netProfit.toLocaleString()}\nMargin: ${margin.toFixed(1)}%\nProfit per truck: $${profitPerTruck.toLocaleString()}\nUnpaid invoices: ${unpaidInvoices.length} ($${unpaidTotal.toLocaleString()})\nOverdue invoices: ${overdueInvoices.length} ($${overdueTotal.toLocaleString()})\nFactored: ${factoredInvoices.length} ($${factoredTotal.toLocaleString()})\nCollected: ${paidInvoices.length} ($${collectedTotal.toLocaleString()})\nAvg days to collect: ${avgDaysToCollect}\nTrucks: ${truckCount}\nDelivered loads: ${(deliveredLoads||[]).length}\nTop brokers unpaid: ${unpaidInvoices.slice(0,5).map(i => `${i.broker||'Unknown'} $${(i.amount||0).toLocaleString()}`).join(', ') || 'None'}`
  }, [totalRevenue, totalExpenses, netProfit, margin, profitPerTruck, unpaidInvoices, unpaidTotal, overdueInvoices, overdueTotal, factoredInvoices, factoredTotal, paidInvoices, collectedTotal, truckCount, deliveredLoads])

  // Revenue by month (last 6 months)
  const monthlyData = useMemo(() => {
    const months = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = d.toLocaleDateString('en-US', { month:'short' })
      const mLoads = (deliveredLoads || []).filter(l => {
        const ld = l.delivery_date || l.updated_at || l.created_at
        return ld && ld.startsWith(key)
      })
      const rev = mLoads.reduce((s, l) => s + (Number(l.rate || l.gross) || 0), 0)
      const mExp = (expenses || []).filter(e => e.date && e.date.startsWith(key))
      const exp = mExp.reduce((s, e) => s + (Number(e.amount) || 0), 0)
      months.push({ key, label, revenue: rev, expenses: exp, profit: rev - exp })
    }
    return months
  }, [deliveredLoads, expenses])
  const maxChart = Math.max(...monthlyData.map(m => Math.max(m.revenue, m.expenses)), 1)

  // Recent transactions (invoices + expenses merged, sorted by date)
  const recentTransactions = useMemo(() => {
    const items = []
    invoices.slice(0, 10).forEach(i => items.push({ type:'invoice', id: i.id, desc: `Invoice ${i.id?.slice(-4) || ''}`, broker: i.broker, amount: i.amount || 0, date: i.date || i.created_at, status: i.status }))
    expenses.slice(0, 10).forEach(e => items.push({ type:'expense', id: e.id, desc: e.description || e.category || 'Expense', amount: -(Number(e.amount) || 0), date: e.date || e.created_at, status: 'Expense' }))
    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    return items.slice(0, 12)
  }, [invoices, expenses])

  // Alerts
  const alerts = useMemo(() => {
    const a = []
    if (overdueInvoices.length > 0) a.push({ type:'danger', msg:`${overdueInvoices.length} overdue invoice${overdueInvoices.length>1?'s':''} — $${overdueTotal.toLocaleString()} past due` })
    if (margin < 20 && totalRevenue > 0) a.push({ type:'warning', msg:`Profit margin at ${margin.toFixed(1)}% — below 20% target` })
    if (unpaidTotal > totalRevenue * 0.5 && unpaidTotal > 0) a.push({ type:'warning', msg:`$${unpaidTotal.toLocaleString()} outstanding — more than 50% of revenue uncollected` })
    const avgDays = paidInvoices.length > 0 ? Math.round(paidInvoices.reduce((s, i) => {
      const inv = new Date(i.date || i.created_at); const paid = new Date(i.paid_at || i.updated_at || Date.now())
      return s + (paid - inv) / 86400000
    }, 0) / paidInvoices.length) : 0
    if (avgDays > 30) a.push({ type:'info', msg:`Average days to collect: ${avgDays}d — consider factoring for faster cash flow` })
    return a
  }, [overdueInvoices, margin, totalRevenue, unpaidTotal, paidInvoices, overdueTotal])

  const REPORTS_TABS = [
    { id:'pl', label:'P&L' },{ id:'profit-iq', label:'Profit IQ' },{ id:'receivables', label:'Receivables (AR)' },{ id:'payables', label:'Payables (AP)' },{ id:'cash-flow', label:'Cash Flow' },{ id:'quickbooks', label:'QuickBooks' },
  ]

  const fmtM = (n) => {
    const abs = Math.abs(n)
    if (abs >= 1000000) return `$${(n/1000000).toFixed(1)}M`
    if (abs >= 1000) return `$${(n/1000).toFixed(1)}K`
    return `$${n.toLocaleString()}`
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Corporate financial header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={DollarSign} size={18} color="var(--success)" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Financials</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Revenue, expenses, invoicing & cash flow</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {[
              { label:'Revenue', val: fmtM(totalRevenue), color:'var(--accent)' },
              { label:'Expenses', val: fmtM(totalExpenses), color:'var(--danger)' },
              { label:'Profit', val: fmtM(netProfit), color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' },
              { label:'Margin', val: `${margin.toFixed(1)}%`, color: marginColor },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:60 }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>

          {tab === 'overview' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              {/* Q Intelligence */}
              <QInsightsFeed hub="financials" summary={financialsSummary} onNavigate={(target) => { if (target) setTab(target) }} />
              {/* Empty state for new carriers */}
              {totalRevenue === 0 && invoices.length === 0 && expenses.length === 0 && (
                <div style={{ padding:'30px 20px', textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={DollarSign} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>NO FINANCIAL DATA YET</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:340, margin:'0 auto', lineHeight:1.6 }}>Book your first load and deliver it to see revenue, invoices, and profitability here. Q will track every dollar automatically.</div>
                </div>
              )}
              {/* Alerts */}
              {alerts.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{
                      padding:'10px 16px', borderRadius:10, fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:10,
                      background: a.type === 'danger' ? 'rgba(239,68,68,0.08)' : a.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)',
                      border: `1px solid ${a.type === 'danger' ? 'rgba(239,68,68,0.2)' : a.type === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}`,
                      color: a.type === 'danger' ? 'var(--danger)' : a.type === 'warning' ? 'var(--warning,#f59e0b)' : 'var(--accent3,#3b82f6)',
                    }}>
                      <Ic icon={a.type === 'danger' ? AlertTriangle : a.type === 'warning' ? AlertCircle : Activity} size={15} />
                      {a.msg}
                    </div>
                  ))}
                </div>
              )}

              {/* Cash position cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                {[
                  { label:'Outstanding', val: `$${unpaidTotal.toLocaleString()}`, sub:`${unpaidInvoices.length} unpaid`, color:'var(--accent)', icon: Clock },
                  { label:'Overdue', val: `$${overdueTotal.toLocaleString()}`, sub:`${overdueInvoices.length} past due`, color: overdueTotal > 0 ? 'var(--danger)' : 'var(--muted)', icon: AlertTriangle },
                  { label:'Factored', val: `$${factoredTotal.toLocaleString()}`, sub:`${factoredInvoices.length} invoices`, color:'var(--accent3,#8b5cf6)', icon: Zap },
                  { label:'Collected', val: `$${collectedTotal.toLocaleString()}`, sub:`${paidInvoices.length} paid`, color:'var(--success)', icon: CheckCircle },
                ].map(c => (
                  <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{c.label}</div>
                      <Ic icon={c.icon} size={14} color={c.color} />
                    </div>
                    <div style={{ fontSize:24, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Two-column: Revenue chart + P&L summary */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Revenue vs Expenses chart */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Revenue vs Expenses (6 Mo)</div>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:140 }}>
                    {monthlyData.map(m => (
                      <div key={m.key} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                        <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', justifyContent:'center', height:120 }}>
                          <div style={{ width:'40%', background:'var(--accent)', borderRadius:'4px 4px 0 0', height: Math.max((m.revenue / maxChart) * 120, 2), transition:'height 0.3s' }} title={`Rev: $${m.revenue.toLocaleString()}`} />
                          <div style={{ width:'40%', background:'var(--danger)', borderRadius:'4px 4px 0 0', opacity:0.7, height: Math.max((m.expenses / maxChart) * 120, 2), transition:'height 0.3s' }} title={`Exp: $${m.expenses.toLocaleString()}`} />
                        </div>
                        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:16, marginTop:12, justifyContent:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:'var(--muted)' }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:'var(--accent)' }} /> Revenue
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:'var(--muted)' }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:'var(--danger)', opacity:0.7 }} /> Expenses
                    </div>
                  </div>
                </div>

                {/* P&L Summary */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Profit & Loss Summary</div>
                  {[
                    { label:'Gross Revenue', val:`$${totalRevenue.toLocaleString()}`, color:'var(--accent)' },
                    { label:'Total Expenses', val:`-$${totalExpenses.toLocaleString()}`, color:'var(--danger)' },
                    { label:'Fuel (est.)', val:`-$${Math.round((deliveredLoads||[]).reduce((s,l)=>s+(Number(l.miles)||0),0) * fuelCostPerMile).toLocaleString()}`, color:'var(--danger)' },
                    { label:'Driver Pay (est.)', val:`-$${Math.round(totalRevenue * avgPayPct).toLocaleString()}`, color:'var(--danger)' },
                  ].map((r, i, arr) => (
                    <div key={r.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize:13, color:'var(--text-secondary,#94a3b8)' }}>{r.label}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:r.color }}>{r.val}</span>
                    </div>
                  ))}
                  <div style={{ borderTop:'2px solid var(--border)', marginTop:8, paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>Net Profit</span>
                    <span style={{ fontSize:22, fontWeight:800, color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{netProfit >= 0 ? '' : '-'}${Math.abs(netProfit).toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                    <span style={{ fontSize:11, color:'var(--muted)' }}>Margin: <span style={{ color: marginColor, fontWeight:700 }}>{margin.toFixed(1)}%</span></span>
                    <span style={{ fontSize:11, color:'var(--muted)' }}>Per truck: <span style={{ fontWeight:700 }}>${profitPerTruck.toLocaleString()}</span></span>
                  </div>
                </div>
              </div>

              {/* Recent transactions */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>Recent Activity</div>
                  <button onClick={() => setTab('invoices')} style={{ fontSize:11, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>View All Invoices →</button>
                </div>
                {recentTransactions.length === 0 ? (
                  <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No transactions yet</div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <tbody>
                      {recentTransactions.map((t, i) => (
                        <tr key={t.id || i} style={{ borderBottom: i < recentTransactions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding:'10px 20px', width:32 }}>
                            <div style={{ width:28, height:28, borderRadius:8, background: t.type === 'invoice' ? 'rgba(240,165,0,0.08)' : 'rgba(239,68,68,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Ic icon={t.type === 'invoice' ? ArrowUpRight : ArrowDownRight} size={13} color={t.type === 'invoice' ? 'var(--accent)' : 'var(--danger)'} />
                            </div>
                          </td>
                          <td style={{ padding:'10px 8px' }}>
                            <div style={{ fontSize:12, fontWeight:600 }}>{t.desc}</div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{t.broker || ''}</div>
                          </td>
                          <td style={{ padding:'10px 8px', fontSize:11, color:'var(--muted)' }}>{t.date ? new Date(t.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}</td>
                          <td style={{ padding:'10px 8px', textAlign:'right' }}>
                            <span style={{ fontSize:13, fontWeight:700, color: t.amount >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                              {t.amount >= 0 ? '+' : ''}{t.amount < 0 ? '-' : ''}${Math.abs(t.amount).toLocaleString()}
                            </span>
                          </td>
                          <td style={{ padding:'10px 20px', textAlign:'right' }}>
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:12, textTransform:'capitalize',
                              background: t.status === 'Paid' ? 'rgba(34,197,94,0.1)' : t.status === 'Factored' ? 'rgba(139,92,246,0.1)' : t.status === 'Unpaid' ? 'rgba(240,165,0,0.1)' : t.status === 'Expense' ? 'rgba(239,68,68,0.1)' : 'rgba(74,85,112,0.1)',
                              color: t.status === 'Paid' ? 'var(--success)' : t.status === 'Factored' ? 'var(--accent3,#8b5cf6)' : t.status === 'Unpaid' ? 'var(--accent)' : t.status === 'Expense' ? 'var(--danger)' : 'var(--muted)',
                            }}>{t.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === 'invoices' && <InvoicesHub />}
          {tab === 'expenses' && <ExpenseTracker />}
          {tab === 'factoring' && <FactoringCashflow />}

          {tab === 'reports' && (
            <div style={{ display:'flex', flexDirection:'column' }}>
              <div style={{ flexShrink:0, display:'flex', gap:0, padding:'0 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
                {REPORTS_TABS.map(rt => (
                  <button key={rt.id} onClick={() => setReportsTab(rt.id)} style={{
                    padding:'10px 18px', fontSize:12, fontWeight: reportsTab === rt.id ? 700 : 500, cursor:'pointer', border:'none', background:'none',
                    color: reportsTab === rt.id ? 'var(--accent)' : 'var(--muted)',
                    borderBottom: reportsTab === rt.id ? '2px solid var(--accent)' : '2px solid transparent',
                    transition:'all 0.15s',
                  }}>{rt.label}</button>
                ))}
              </div>
              <div style={{ flex:1, minHeight:0 }}>
                {reportsTab === 'pl' && <PLDashboard />}
                {reportsTab === 'profit-iq' && <ProfitIQTab />}
                {reportsTab === 'receivables' && <ReceivablesAging />}
                {reportsTab === 'payables' && <AccountsPayable />}
                {reportsTab === 'cash-flow' && <CashFlowForecaster />}
                {reportsTab === 'quickbooks' && <QuickBooksExport />}
              </div>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}

// ── Safety Intelligence Dashboard (AI Crash Risk + Weather + Geofencing) ──
export function SafetyIntelligenceDashboard({ drivers, vehicles, compData }) {
  const { loads } = useCarrier()
  const [fleetRisk, setFleetRisk] = useState(null)
  const [weather, setWeather] = useState(null)
  const [routeZones, setRouteZones] = useState([])
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    import('../../lib/crashRiskEngine').then(engine => {
      if (cancelled) return
      const allCompChecks = []
      if (compData.validateFleet) {
        const result = compData.validateFleet(drivers || [], vehicles || [], {
          clearinghouseOrders: compData.chOrders, hosLogs: compData.hosLogs, dvirHistory: compData.dvirs, settings: compData.settings,
        })
        allCompChecks.push(...(result.failures || []), ...(result.warnings || []), ...(result.passing || []))
      }
      const risk = engine.calculateFleetRisk(drivers || [], {
        vehicles: vehicles || [],
        loads: loads || [],
        hosLogs: compData.hosLogs,
        incidents: compData.incidents,
        complianceChecks: allCompChecks,
      })
      if (!cancelled) {
        setFleetRisk(risk)
        setRouteZones(engine.getHighRiskZones())
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [drivers, vehicles, loads, compData])

  // Fetch weather for Vegas (default) — carriers can change location later
  useEffect(() => {
    fetch('/api/weather-safety?lat=36.17&lng=-115.14')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setWeather(d) })
      .catch(() => {})
  }, [])

  const riskColor = (score) => score >= 75 ? '#ef4444' : score >= 50 ? '#f97316' : score >= 30 ? '#f59e0b' : '#22c55e'
  const riskBg = (score) => score >= 75 ? 'rgba(239,68,68,0.08)' : score >= 50 ? 'rgba(249,115,22,0.08)' : score >= 30 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)'
  const riskBorder = (score) => score >= 75 ? 'rgba(239,68,68,0.2)' : score >= 50 ? 'rgba(249,115,22,0.2)' : score >= 30 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'
  const riskLabel = (score) => score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 30 ? 'MODERATE' : 'LOW'

  if (loading || !fleetRisk) {
    return <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Analyzing fleet safety data...</div>
  }

  const driverDetail = selectedDriver ? fleetRisk.driverRisks.find(r => r.driverName === selectedDriver) : null

  return (
    <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Ic icon={Activity} size={20} color="#3b82f6" />
        </div>
        <div>
          <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>AI Safety Intelligence</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Predictive crash risk scoring, weather alerts & route hazards</div>
        </div>
      </div>

      {/* Fleet Risk Summary Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:12 }}>
        {[
          { label:'Fleet Risk Score', val: fleetRisk.averageScore, color: riskColor(fleetRisk.averageScore), suffix:'/100' },
          { label:'Critical Risk', val: fleetRisk.riskDistribution.critical, color:'#ef4444', suffix:' drivers' },
          { label:'High Risk', val: fleetRisk.riskDistribution.high, color:'#f97316', suffix:' drivers' },
          { label:'Moderate Risk', val: fleetRisk.riskDistribution.moderate, color:'#f59e0b', suffix:' drivers' },
          { label:'Low Risk', val: fleetRisk.riskDistribution.low + fleetRisk.riskDistribution.minimal, color:'#22c55e', suffix:' drivers' },
        ].map(c => (
          <div key={c.label} style={{ padding:'16px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, textAlign:'center' }}>
            <div style={{ fontSize:24, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}<span style={{ fontSize:11, fontWeight:500, color:'var(--muted)' }}>{c.suffix}</span></div>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8, marginTop:4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Two column: Driver Risk Table + Weather/Geofence */}
      <div style={{ display:'grid', gridTemplateColumns: drivers?.length > 0 ? '1fr 320px' : '1fr', gap:16 }}>
        {/* Driver Risk Table */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)' }}>Driver Risk Assessment</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{(fleetRisk.driverRisks || []).length} drivers analyzed</div>
          </div>
          {(fleetRisk.driverRisks || []).length === 0 ? (
            <div style={{ padding:30, textAlign:'center', color:'var(--muted)', fontSize:12 }}>Add drivers to see crash risk scores</div>
          ) : (
            <div style={{ maxHeight:400, overflow:'auto' }}>
              {[...fleetRisk.driverRisks].sort((a, b) => b.score - a.score).map((dr, i) => (
                <div key={i} onClick={() => setSelectedDriver(selectedDriver === dr.driverName ? null : dr.driverName)}
                  style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', background: selectedDriver === dr.driverName ? 'rgba(59,130,246,0.06)' : 'transparent', transition:'background 0.15s' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:riskBg(dr.score), border:`1px solid ${riskBorder(dr.score)}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:riskColor(dr.score) }}>
                        {dr.score}
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{dr.driverName}</div>
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{dr.summary}</div>
                      </div>
                    </div>
                    <div style={{ padding:'3px 8px', borderRadius:6, fontSize:10, fontWeight:700, letterSpacing:0.5, background:riskBg(dr.score), color:riskColor(dr.score), border:`1px solid ${riskBorder(dr.score)}` }}>
                      {dr.level}
                    </div>
                  </div>
                  {/* Expanded detail */}
                  {selectedDriver === dr.driverName && (
                    <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                      {/* Factor breakdown */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                        {dr.factors.map((f, fi) => (
                          <div key={fi} style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ flex:1, fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>{f.label}</div>
                            <div style={{ width:60, height:6, borderRadius:3, background:'var(--border)', overflow:'hidden' }}>
                              <div style={{ width:`${f.score}%`, height:'100%', borderRadius:3, background:riskColor(f.score), transition:'width 0.3s' }} />
                            </div>
                            <div style={{ fontSize:10, fontWeight:700, color:riskColor(f.score), width:24, textAlign:'right' }}>{f.score}</div>
                          </div>
                        ))}
                      </div>
                      {/* Risk details */}
                      {dr.factors.filter(f => f.details.length > 0).map((f, fi) => (
                        <div key={fi} style={{ marginBottom:6 }}>
                          {f.details.map((d, di) => (
                            <div key={di} style={{ fontSize:11, color: f.score >= 30 ? riskColor(f.score) : 'var(--muted)', paddingLeft:8, borderLeft:`2px solid ${riskColor(f.score)}`, marginBottom:3, lineHeight:1.4 }}>
                              {d}
                            </div>
                          ))}
                        </div>
                      ))}
                      {/* Recommendations */}
                      {dr.recommendations.length > 0 && (
                        <div style={{ marginTop:8 }}>
                          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--muted)', letterSpacing:0.8, marginBottom:6 }}>Recommendations</div>
                          {dr.recommendations.map((rec, ri) => (
                            <div key={ri} style={{ fontSize:11, padding:'6px 10px', borderRadius:6, marginBottom:4, background: rec.priority === 'critical' ? 'rgba(239,68,68,0.08)' : rec.priority === 'high' ? 'rgba(249,115,22,0.08)' : 'rgba(59,130,246,0.08)', color: rec.priority === 'critical' ? '#fca5a5' : rec.priority === 'high' ? '#fdba74' : '#93c5fd', border:`1px solid ${rec.priority === 'critical' ? 'rgba(239,68,68,0.15)' : rec.priority === 'high' ? 'rgba(249,115,22,0.15)' : 'rgba(59,130,246,0.15)'}` }}>
                              {rec.action}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Weather + Route Hazards */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Weather Card */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={CloudSun} size={14} /> Weather Safety
            </div>
            {weather ? (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{weather.location || 'Current Location'}</div>
                  <div style={{ padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:riskBg(weather.riskScore || 0), color:riskColor(weather.riskScore || 0), border:`1px solid ${riskBorder(weather.riskScore || 0)}` }}>
                    {weather.riskLevel || 'CLEAR'}
                  </div>
                </div>
                {weather.forecast && (
                  <div style={{ fontSize:12, color:'var(--text)', marginBottom:6 }}>
                    {weather.forecast.shortForecast} — {weather.forecast.temperature}°{weather.forecast.temperatureUnit}
                  </div>
                )}
                {weather.forecast?.windSpeed && (
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Wind: {weather.forecast.windSpeed} {weather.forecast.windDirection}</div>
                )}
                {(weather.alerts || []).length > 0 && (
                  <div style={{ marginTop:8 }}>
                    {weather.alerts.map((a, i) => (
                      <div key={i} style={{ padding:'6px 10px', borderRadius:6, marginBottom:4, fontSize:11, fontWeight:600, background:'rgba(239,68,68,0.08)', color:'#fca5a5', border:'1px solid rgba(239,68,68,0.15)' }}>
                        {a.event}: {a.headline?.slice(0, 80)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize:11, color:'var(--muted)' }}>Loading weather data...</div>
            )}
          </div>

          {/* Route Hazard Zones */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={AlertTriangle} size={14} /> Known Hazard Zones
            </div>
            <div style={{ maxHeight:250, overflow:'auto' }}>
              {routeZones.map((zone, i) => (
                <div key={i} style={{ padding:'8px 0', borderBottom: i < routeZones.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{zone.name}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4 }}>{zone.detail}</div>
                  <div style={{ display:'inline-block', marginTop:4, padding:'1px 6px', borderRadius:4, fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5,
                    background: zone.risk === 'winter' ? 'rgba(59,130,246,0.1)' : zone.risk === 'grade' ? 'rgba(245,158,11,0.1)' : 'rgba(168,85,247,0.1)',
                    color: zone.risk === 'winter' ? '#60a5fa' : zone.risk === 'grade' ? '#fbbf24' : '#c084fc',
                    border: `1px solid ${zone.risk === 'winter' ? 'rgba(59,130,246,0.2)' : zone.risk === 'grade' ? 'rgba(245,158,11,0.2)' : 'rgba(168,85,247,0.2)'}`,
                  }}>{zone.risk}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Safety Score Legend */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:10 }}>Risk Score Legend</div>
            {[
              { range:'75-100', label:'Critical — Do not dispatch', color:'#ef4444' },
              { range:'50-74', label:'High — Review before dispatch', color:'#f97316' },
              { range:'30-49', label:'Moderate — Proceed with caution', color:'#f59e0b' },
              { range:'0-29', label:'Low — Clear to dispatch', color:'#22c55e' },
            ].map(l => (
              <div key={l.range} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <div style={{ width:10, height:10, borderRadius:3, background:l.color, flexShrink:0 }} />
                <div style={{ fontSize:11, color:'var(--muted)' }}><span style={{ fontWeight:700, color:l.color }}>{l.range}</span> — {l.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Compliance Hub ──
export function ComplianceHub() {
  const [tab, setTab] = useState('overview')
  const { drivers, vehicles } = useCarrier()
  const [compData, setCompData] = useState({ dvirs:[], chOrders:[], hosLogs:[], drugTests:[], incidents:[], dqFiles:[], settings:null, validateFleet:null, loaded:false })

  useEffect(() => {
    Promise.all([
      db.fetchDVIRs().catch(() => []),
      db.fetchClearinghouseQueries().catch(() => []),
      db.fetchHOSLogs().catch(() => []),
      db.fetchDrugTests().catch(() => []),
      db.fetchIncidents().catch(() => []),
      db.fetchDQFiles().catch(() => []),
      db.fetchCarrierSettings().catch(() => null),
      import('../../lib/compliance').then(m => m.validateFleet),
    ]).then(([dvirs, ch, hos, drugs, incidents, dqFiles, s, vf]) => {
      setCompData({ dvirs:dvirs||[], chOrders:ch||[], hosLogs:hos||[], drugTests:drugs||[], incidents:incidents||[], dqFiles:dqFiles||[], settings:s, validateFleet:vf, loaded:true })
    })
  }, [])

  const { failures, warnings, passing, stats } = useMemo(() => {
    if (!compData.validateFleet) return { failures:[], warnings:[], passing:[], stats:{ critCount:0, warnCount:0, total:0, driverFails:0, vehicleFails:0, driverCount:0, vehicleCount:0 } }
    return compData.validateFleet(drivers || [], vehicles || [], {
      clearinghouseOrders: compData.chOrders, hosLogs: compData.hosLogs, dvirHistory: compData.dvirs, settings: compData.settings,
    })
  }, [drivers, vehicles, compData])

  // Derived metrics
  const expiringDocs = useMemo(() => {
    const now = new Date()
    const in30 = new Date(now.getTime() + 30 * 86400000)
    return (compData.dqFiles || []).filter(d => d.expiry_date && new Date(d.expiry_date) <= in30 && new Date(d.expiry_date) >= now)
  }, [compData.dqFiles])

  const expiredDocs = useMemo(() => {
    const now = new Date()
    return (compData.dqFiles || []).filter(d => d.expiry_date && new Date(d.expiry_date) < now)
  }, [compData.dqFiles])

  const openIncidents = (compData.incidents || []).filter(i => i.status === 'open' || i.status === 'investigating')
  const pendingDrugTests = (compData.drugTests || []).filter(t => t.result === 'pending')
  const dvirDefects = (compData.dvirs || []).filter(d => d.defects_found && d.status !== 'resolved')
  const passCount = (passing || []).length
  const totalChecks = passCount + stats.critCount + stats.warnCount
  const complianceScore = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 100

  const complianceSummary = useMemo(() => {
    if (!compData.loaded) return ''
    return `HUB: Compliance\nDrivers: ${(drivers||[]).length}\nVehicles: ${(vehicles||[]).length}\nCompliance score: ${complianceScore}%\nCritical failures: ${stats.critCount}\nWarnings: ${stats.warnCount}\nPassing checks: ${passCount} of ${totalChecks}\nExpired docs: ${expiredDocs.length}\nExpiring within 30 days: ${expiringDocs.length}\nOpen incidents: ${openIncidents.length}\nDVIR defects unresolved: ${dvirDefects.length}\nPending drug tests: ${pendingDrugTests.length}\nFailure details: ${(failures||[]).slice(0,10).map(f => `${f.entity}: ${f.label}`).join(', ') || 'None'}\nWarning details: ${(warnings||[]).slice(0,10).map(w => `${w.entity}: ${w.label}`).join(', ') || 'None'}`
  }, [compData.loaded, drivers, vehicles, complianceScore, stats, passCount, totalChecks, expiredDocs, expiringDocs, openIncidents, dvirDefects, pendingDrugTests, failures, warnings])

  const headerColor = stats.critCount > 0 ? 'var(--danger)' : stats.warnCount > 0 ? 'var(--warning,#f59e0b)' : 'var(--success)'
  const headerIcon = stats.critCount > 0 ? 'rgba(239,68,68,0.08)' : stats.warnCount > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)'
  const headerBorder = stats.critCount > 0 ? 'rgba(239,68,68,0.15)' : stats.warnCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)'
  const statusLabel = stats.critCount > 0 ? 'At Risk' : stats.warnCount > 0 ? 'Review' : 'Clear'

  const TABS = [{ id:'overview', label:'Overview' },{ id:'safety-intel', label:'Safety Intelligence' },{ id:'audit', label:'Audit Today' },{ id:'center', label:'DVIR / ELD' },{ id:'ifta', label:'IFTA' },{ id:'broker-risk', label:'Broker Risk' },{ id:'clearinghouse', label:'Drug & Alcohol' }]

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Corporate compliance header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:headerIcon, border:`1px solid ${headerBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={Shield} size={18} color={headerColor} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Safety & Compliance</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>FMCSA, IFTA, ELD, DVIR & DOT readiness</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            {[
              { label:'Score', val: compData.loaded ? `${complianceScore}%` : '—', color: complianceScore >= 90 ? 'var(--success)' : complianceScore >= 70 ? 'var(--warning,#f59e0b)' : 'var(--danger)' },
              { label:'Failures', val: compData.loaded ? String(stats.critCount) : '—', color: stats.critCount > 0 ? 'var(--danger)' : 'var(--success)' },
              { label:'Warnings', val: compData.loaded ? String(stats.warnCount) : '—', color: stats.warnCount > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)' },
              { label:'Status', val: compData.loaded ? statusLabel : '—', color: headerColor },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:50 }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>

          {tab === 'overview' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              {/* Q Intelligence */}
              {compData.loaded && <QInsightsFeed hub="compliance" summary={complianceSummary} onNavigate={(target) => { if (target) setTab(target) }} />}
              {/* Empty state */}
              {drivers.length === 0 && (vehicles || []).length === 0 && (
                <div style={{ padding:'30px 20px', textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Shield} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>COMPLIANCE STARTS HERE</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:340, margin:'0 auto', lineHeight:1.6 }}>Add drivers and vehicles to activate DOT compliance monitoring, DVIR tracking, clearinghouse checks, and expiry alerts.</div>
                </div>
              )}
              {/* Alerts */}
              {compData.loaded && (() => {
                const alerts = []
                if (stats.critCount > 0) alerts.push({ type:'danger', msg:`${stats.critCount} critical compliance failure${stats.critCount !== 1 ? 's' : ''} — not DOT audit ready` })
                if (expiredDocs.length > 0) alerts.push({ type:'danger', msg:`${expiredDocs.length} expired document${expiredDocs.length !== 1 ? 's' : ''} need immediate renewal` })
                if (expiringDocs.length > 0) alerts.push({ type:'warning', msg:`${expiringDocs.length} document${expiringDocs.length !== 1 ? 's' : ''} expiring within 30 days` })
                if (openIncidents.length > 0) alerts.push({ type:'warning', msg:`${openIncidents.length} open incident${openIncidents.length !== 1 ? 's' : ''} under investigation` })
                if (pendingDrugTests.length > 0) alerts.push({ type:'info', msg:`${pendingDrugTests.length} drug test result${pendingDrugTests.length !== 1 ? 's' : ''} pending` })
                if (dvirDefects.length > 0) alerts.push({ type:'warning', msg:`${dvirDefects.length} unresolved DVIR defect${dvirDefects.length !== 1 ? 's' : ''} on vehicles` })
                if (alerts.length === 0) alerts.push({ type:'success', msg:'All compliance checks passing — you are DOT audit ready' })
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {alerts.map((a, i) => (
                      <div key={i} style={{
                        padding:'10px 16px', borderRadius:10, fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:10,
                        background: a.type === 'danger' ? 'rgba(239,68,68,0.08)' : a.type === 'warning' ? 'rgba(245,158,11,0.08)' : a.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(59,130,246,0.08)',
                        border: `1px solid ${a.type === 'danger' ? 'rgba(239,68,68,0.2)' : a.type === 'warning' ? 'rgba(245,158,11,0.2)' : a.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)'}`,
                        color: a.type === 'danger' ? '#fca5a5' : a.type === 'warning' ? '#fcd34d' : a.type === 'success' ? '#86efac' : '#93c5fd',
                      }}>
                        <Ic icon={a.type === 'danger' ? AlertTriangle : a.type === 'warning' ? AlertCircle : a.type === 'success' ? CheckCircle : Activity} size={15} />
                        {a.msg}
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Compliance Score + Status Cards */}
              <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:16 }}>
                {/* Score Ring */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'24px 20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ position:'relative', width:120, height:120 }}>
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
                      <circle cx="60" cy="60" r="52" fill="none"
                        stroke={complianceScore >= 90 ? '#22c55e' : complianceScore >= 70 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(complianceScore / 100) * 327} 327`}
                        transform="rotate(-90 60 60)"
                        style={{ transition:'stroke-dasharray 0.6s ease' }} />
                    </svg>
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                      <div style={{ fontSize:28, fontWeight:800, color:'var(--text)', fontFamily:"'DM Sans',sans-serif" }}>{complianceScore}</div>
                      <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>Score</div>
                    </div>
                  </div>
                  <div style={{ marginTop:12, fontSize:11, fontWeight:700, color: complianceScore >= 90 ? 'var(--success)' : complianceScore >= 70 ? 'var(--warning,#f59e0b)' : 'var(--danger)', textTransform:'uppercase', letterSpacing:1 }}>
                    {complianceScore >= 90 ? 'Excellent' : complianceScore >= 70 ? 'Needs Attention' : 'At Risk'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{passCount} of {totalChecks} checks passing</div>
                </div>

                {/* Status Cards Grid */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                  {[
                    { label:'Critical Failures', val: stats.critCount, sub: stats.critCount === 0 ? 'All clear' : `${stats.driverFails} driver, ${stats.vehicleFails} vehicle`, color: stats.critCount > 0 ? 'var(--danger)' : 'var(--success)', icon: AlertTriangle },
                    { label:'Warnings', val: stats.warnCount, sub: stats.warnCount === 0 ? 'None' : 'Items need review', color: stats.warnCount > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)', icon: AlertCircle },
                    { label:'Expiring Docs', val: expiringDocs.length + expiredDocs.length, sub: expiredDocs.length > 0 ? `${expiredDocs.length} expired` : expiringDocs.length > 0 ? 'Within 30 days' : 'All current', color: expiredDocs.length > 0 ? 'var(--danger)' : expiringDocs.length > 0 ? 'var(--warning,#f59e0b)' : 'var(--success)', icon: FileText },
                    { label:'Open Incidents', val: openIncidents.length, sub: openIncidents.length === 0 ? 'No open cases' : 'Under investigation', color: openIncidents.length > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)', icon: Activity },
                    { label:'DVIR Defects', val: dvirDefects.length, sub: dvirDefects.length === 0 ? 'Fleet clear' : 'Unresolved', color: dvirDefects.length > 0 ? 'var(--danger)' : 'var(--success)', icon: Truck },
                    { label:'Drug Tests', val: pendingDrugTests.length, sub: pendingDrugTests.length === 0 ? 'All complete' : 'Results pending', color: pendingDrugTests.length > 0 ? 'var(--accent3,#3b82f6)' : 'var(--muted)', icon: FlaskConical },
                  ].map(c => (
                    <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 18px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{c.label}</div>
                        <Ic icon={c.icon} size={14} color={c.color} />
                      </div>
                      <div style={{ fontSize:24, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{c.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Two-column: Driver Compliance + Fleet Compliance */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Driver Compliance Breakdown */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Driver Compliance</div>
                  {(drivers || []).length === 0 ? (
                    <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No drivers added yet</div>
                  ) : (drivers || []).slice(0, 8).map(d => {
                    const name = d.full_name || d.name || 'Unknown'
                    const driverFailures = (failures || []).filter(f => f.entityId === d.id)
                    const driverWarnings = (warnings || []).filter(w => w.entityId === d.id)
                    const driverStatus = driverFailures.length > 0 ? 'fail' : driverWarnings.length > 0 ? 'warn' : 'pass'
                    return (
                      <div key={d.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: driverStatus === 'fail' ? '#ef4444' : driverStatus === 'warn' ? '#f59e0b' : '#22c55e' }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          {driverFailures.length > 0 && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(239,68,68,0.1)', color:'#fca5a5' }}>{driverFailures.length} fail</span>
                          )}
                          {driverWarnings.length > 0 && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(245,158,11,0.1)', color:'#fcd34d' }}>{driverWarnings.length} warn</span>
                          )}
                          {driverStatus === 'pass' && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(34,197,94,0.1)', color:'#86efac' }}>Clear</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {(drivers || []).length > 8 && (
                    <div style={{ padding:'8px 0', fontSize:11, color:'var(--accent)', cursor:'pointer', fontWeight:600 }} onClick={() => setTab('audit')}>View all {drivers.length} drivers →</div>
                  )}
                </div>

                {/* Upcoming Expirations */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Upcoming Expirations</div>
                  {(() => {
                    const now = new Date()
                    const in90 = new Date(now.getTime() + 90 * 86400000)
                    const upcoming = [
                      ...(drivers || []).filter(d => d.cdl_expiry || d.license_expiry).map(d => {
                        const exp = d.cdl_expiry || d.license_expiry
                        return { name: d.full_name || d.name, type:'CDL', date:exp, days: Math.round((new Date(exp) - now) / 86400000) }
                      }),
                      ...(drivers || []).filter(d => d.medical_card_expiry || d.med_card_expiry).map(d => {
                        const exp = d.medical_card_expiry || d.med_card_expiry
                        return { name: d.full_name || d.name, type:'Medical Card', date:exp, days: Math.round((new Date(exp) - now) / 86400000) }
                      }),
                      ...(compData.dqFiles || []).filter(d => d.expiry_date).map(d => {
                        const driver = (drivers || []).find(dr => dr.id === d.driver_id)
                        return { name: driver?.full_name || driver?.name || 'Unknown', type: (d.doc_type || '').replace(/_/g,' '), date: d.expiry_date, days: Math.round((new Date(d.expiry_date) - now) / 86400000) }
                      }),
                    ].filter(e => e.days <= 90).sort((a, b) => a.days - b.days)

                    if (upcoming.length === 0) return (
                      <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                        <Ic icon={CheckCircle} size={20} color="var(--success)" style={{ marginBottom:8 }} />
                        <div>No expirations in the next 90 days</div>
                      </div>
                    )

                    return upcoming.slice(0, 8).map((e, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: e.days < 0 ? '#ef4444' : e.days <= 14 ? '#f59e0b' : e.days <= 30 ? '#fcd34d' : '#3b82f6' }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{e.name}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{e.type}</div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color: e.days < 0 ? '#ef4444' : e.days <= 14 ? '#f59e0b' : 'var(--text)' }}>
                            {e.days < 0 ? `${Math.abs(e.days)}d overdue` : e.days === 0 ? 'Today' : `${e.days}d left`}
                          </div>
                          <div style={{ fontSize:9, color:'var(--muted)' }}>{e.date}</div>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>

              {/* Recent Compliance Activity */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>Recent Compliance Activity</div>
                  <button onClick={() => setTab('audit')} style={{ fontSize:11, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Run Full Audit →</button>
                </div>
                {(() => {
                  const activities = [
                    ...(compData.drugTests || []).slice(0, 5).map(t => {
                      const driver = (drivers || []).find(d => d.id === t.driver_id)
                      return { icon: FlaskConical, label: `Drug Test — ${(t.test_type || '').replace(/_/g,' ')}`, entity: driver?.full_name || driver?.name || 'Unknown', date: t.test_date, status: t.result || 'pending', statusColor: t.result === 'negative' ? 'var(--success)' : t.result === 'positive' ? 'var(--danger)' : 'var(--accent3,#3b82f6)' }
                    }),
                    ...(compData.incidents || []).slice(0, 5).map(inc => {
                      const driver = (drivers || []).find(d => d.id === inc.driver_id)
                      return { icon: AlertTriangle, label: `Incident — ${(inc.incident_type || '').replace(/_/g,' ')}`, entity: driver?.full_name || driver?.name || 'Unknown', date: inc.incident_date, status: inc.status, statusColor: inc.status === 'resolved' || inc.status === 'closed' ? 'var(--success)' : 'var(--warning,#f59e0b)' }
                    }),
                    ...(compData.dvirs || []).slice(0, 5).map(d => ({
                      icon: Truck, label: `DVIR — ${d.vehicle_id || 'Vehicle'}`, entity: d.driver_name || 'Unknown', date: d.submitted_at || d.created_at, status: d.defects_found ? 'Defects' : 'Clear', statusColor: d.defects_found ? 'var(--warning,#f59e0b)' : 'var(--success)',
                    })),
                  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 10)

                  if (activities.length === 0) return (
                    <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No compliance activity recorded yet</div>
                  )

                  return (
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <tbody>
                        {activities.map((a, i) => (
                          <tr key={i} style={{ borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <td style={{ padding:'10px 20px', width:32 }}>
                              <div style={{ width:28, height:28, borderRadius:8, background:'rgba(240,165,0,0.06)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <Ic icon={a.icon} size={13} color="var(--muted)" />
                              </div>
                            </td>
                            <td style={{ padding:'10px 8px' }}>
                              <div style={{ fontSize:12, fontWeight:600 }}>{a.label}</div>
                              <div style={{ fontSize:10, color:'var(--muted)' }}>{a.entity}</div>
                            </td>
                            <td style={{ padding:'10px 8px', fontSize:11, color:'var(--muted)' }}>{a.date ? new Date(a.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}</td>
                            <td style={{ padding:'10px 20px', textAlign:'right' }}>
                              <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:12, textTransform:'capitalize', background: `${a.statusColor}15`, color: a.statusColor }}>{a.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            </div>
          )}

          {tab === 'safety-intel' && <SafetyIntelligenceDashboard drivers={drivers} vehicles={vehicles} compData={compData} />}
          {tab === 'audit' && <AuditToday />}
          {tab === 'center' && <CarrierDVIR />}
          {tab === 'ifta' && <CarrierIFTA />}
          {tab === 'broker-risk' && <BrokerRiskIntel />}
          {tab === 'clearinghouse' && <CarrierClearinghouse />}
        </Suspense>
      </div>
    </div>
  )
}

// ── Insurance Hub ──
const INSURERS = [
  { id: 'cover-whale', name: 'Cover Whale', desc: 'AI-powered commercial trucking insurance', tag: 'Recommended' },
  { id: 'progressive', name: 'Progressive Commercial', desc: 'Largest commercial auto insurer in the US', tag: '' },
  { id: 'national-interstate', name: 'National Interstate', desc: 'Specializes in small fleets & owner-operators', tag: '' },
  { id: 'reliance', name: 'Reliance Partners', desc: 'Trucking-only insurance brokerage', tag: '' },
  { id: 'canal', name: 'Canal Insurance', desc: 'Owner-operator focused coverage', tag: '' },
]

export function InsuranceHub() {
  const { company, vehicles, drivers, loads } = useCarrier()
  const { showToast } = useApp()
  const [quoteForm, setQuoteForm] = useState({ name: company?.name || '', mc: company?.mc_number || company?.mc || '', dot: company?.dot_number || company?.dot || '', phone: company?.phone || '', email: company?.email || '', trucks: String(vehicles?.length || drivers?.length || 1), equipment: 'Dry Van', currentInsurer: '', expiryDate: '', coverageNeeded: 'auto-liability' })
  const [submitted, setSubmitted] = useState(false)
  const [selectedInsurers, setSelectedInsurers] = useState(INSURERS.map(i => i.id))
  const [excludedDrivers, setExcludedDrivers] = useState([])

  // Pull real insurance expiry dates from vehicles
  const vehicleInsExpiries = useMemo(() => {
    return (vehicles || []).filter(v => v.insurance_expiry).map(v => ({
      unit: v.unit_number || 'Unknown',
      expiry: v.insurance_expiry,
      daysLeft: Math.ceil((new Date(v.insurance_expiry) - new Date()) / 86400000),
    })).sort((a, b) => a.daysLeft - b.daysLeft)
  }, [vehicles])

  const soonestExpiry = vehicleInsExpiries[0]
  const expiredCount = vehicleInsExpiries.filter(v => v.daysLeft <= 0).length
  const expiringCount = vehicleInsExpiries.filter(v => v.daysLeft > 0 && v.daysLeft <= 60).length

  const policies = useMemo(() => {
    const companyIns = company?.insurance_expiry || company?.insurance_policy
    const companyDays = companyIns ? Math.ceil((new Date(companyIns) - new Date()) / 86400000) : null
    return [
      { type: 'Auto Liability', required: true, minCoverage: '$1,000,000', status: companyIns ? 'active' : 'none', provider: company?.insurance_provider || '', expiry: companyIns || '', daysLeft: companyDays },
      { type: 'Cargo Insurance', required: true, minCoverage: '$100,000', status: 'none', provider: '', expiry: '', daysLeft: null },
      { type: 'General Liability', required: false, minCoverage: '$1,000,000', status: 'none', provider: '', expiry: '', daysLeft: null },
      { type: 'Physical Damage', required: false, minCoverage: 'Truck value', status: 'none', provider: '', expiry: '', daysLeft: null },
      { type: 'Bobtail Insurance', required: false, minCoverage: '$1,000,000', status: 'none', provider: '', expiry: '', daysLeft: null },
      { type: 'Occupational Accident', required: false, minCoverage: '$500,000', status: 'none', provider: '', expiry: '', daysLeft: null },
    ]
  }, [company])

  // Driver risk scoring
  const driverRisks = useMemo(() => {
    return (drivers || []).map(d => {
      const name = d.full_name || d.name || ''
      const driverLoads = (loads || []).filter(l => l.driver === name)
      const incidents = d.incidents || 0
      const violations = d.violations || 0
      const cdlExpired = d.license_expiry && new Date(d.license_expiry) < new Date()
      const medExpired = d.medical_card_expiry && new Date(d.medical_card_expiry) < new Date()
      let score = 100
      if (incidents > 0) score -= incidents * 15
      if (violations > 0) score -= violations * 10
      if (cdlExpired) score -= 30
      if (medExpired) score -= 20
      if (driverLoads.length === 0) score -= 5
      score = Math.max(score, 0)
      const risk = score >= 80 ? 'low' : score >= 50 ? 'medium' : 'high'
      return { ...d, name, score, risk, incidents, violations, cdlExpired, medExpired, loadCount: driverLoads.length }
    }).sort((a, b) => a.score - b.score)
  }, [drivers, loads])

  const toggleInsurer = (id) => setSelectedInsurers(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  const selectAllInsurers = () => setSelectedInsurers(INSURERS.map(i => i.id))
  const toggleExcludeDriver = (driverId) => setExcludedDrivers(prev => prev.includes(driverId) ? prev.filter(i => i !== driverId) : [...prev, driverId])
  const includedDriverCount = (drivers || []).length - excludedDrivers.length

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (selectedInsurers.length === 0) { showToast('error', 'No Partners Selected', 'Select at least one insurer'); return }
    try {
      await apiFetch('/api/insurance-quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ...quoteForm, selectedInsurers, excludedDriverIds: excludedDrivers, includedDriverCount, totalDrivers: (drivers || []).length,
      }) })
    } catch { /* endpoint may not exist yet */ }
    setSubmitted(true)
    showToast('success', 'Quotes Requested', `Sent to ${selectedInsurers.length} insurer${selectedInsurers.length > 1 ? 's' : ''}`)
  }

  const pan = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }
  const panHead = (icon, label, right) => (
    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Ic icon={icon} size={14} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>{label}</span>
      </div>
      {right}
    </div>
  )
  const inp_ = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box' }
  const FieldRow = ({ label, value, onChange, type = 'text', placeholder = '' }) => (
    <div>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inp_} />
    </div>
  )

  const daysLabel = (d) => {
    if (d === null || d === undefined) return null
    if (d <= 0) return { text: 'EXPIRED', color: 'var(--danger)' }
    if (d <= 30) return { text: `${d}d left`, color: 'var(--danger)' }
    if (d <= 60) return { text: `${d}d left`, color: 'var(--warning)' }
    if (d <= 90) return { text: `${d}d left`, color: 'var(--accent)' }
    return { text: `${d}d left`, color: 'var(--success)' }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1020, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, marginBottom: 4 }}>
            INSURANCE <span style={{ color: 'var(--accent)' }}>MARKETPLACE</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Compare quotes from top trucking insurers. Track renewals, manage risk, and get the best rates.
          </div>
        </div>
        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {[
            { v: (vehicles || []).length, l: 'Vehicles', c: 'var(--accent)' },
            { v: (drivers || []).length, l: 'Drivers', c: 'var(--accent2)' },
            { v: expiredCount + expiringCount, l: 'Renewals Due', c: expiredCount > 0 ? 'var(--danger)' : expiringCount > 0 ? 'var(--warning)' : 'var(--success)' },
          ].map(s => (
            <div key={s.l} style={{ textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: s.c, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Renewal Alert Banner */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <div style={{
          padding: '14px 18px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14,
          background: expiredCount > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
          border: `1px solid ${expiredCount > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: expiredCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={AlertTriangle} size={20} color={expiredCount > 0 ? 'var(--danger)' : 'var(--warning)'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: expiredCount > 0 ? 'var(--danger)' : 'var(--warning)', marginBottom: 3 }}>
              {expiredCount > 0 ? `${expiredCount} Vehicle${expiredCount > 1 ? 's' : ''} — Insurance Expired` : `${expiringCount} Vehicle${expiringCount > 1 ? 's' : ''} — Insurance Expiring Soon`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              {soonestExpiry && (soonestExpiry.daysLeft <= 0
                ? <><strong>{soonestExpiry.unit}</strong> expired {Math.abs(soonestExpiry.daysLeft)} days ago. Renew immediately to stay compliant.</>
                : <><strong>{soonestExpiry.unit}</strong> expires in <strong>{soonestExpiry.daysLeft} days</strong> ({soonestExpiry.expiry}). Request quotes below to compare rates.</>
              )}
            </div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11, flexShrink: 0, padding: '8px 16px' }}
            onClick={() => document.getElementById('ins-quote-form')?.scrollIntoView({ behavior: 'smooth' })}>
            Get Quotes Now
          </button>
        </div>
      )}

      {/* Vehicle Insurance Status */}
      {vehicleInsExpiries.length > 0 && (
        <div style={pan}>
          {panHead(Truck, 'VEHICLE INSURANCE STATUS', <span style={{ fontSize: 10, color: 'var(--muted)' }}>{vehicleInsExpiries.length} vehicle{vehicleInsExpiries.length > 1 ? 's' : ''} with insurance dates</span>)}
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {vehicleInsExpiries.map(v => {
              const dl = daysLabel(v.daysLeft)
              return (
                <div key={v.unit} style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: `1px solid ${v.daysLeft <= 0 ? 'rgba(239,68,68,0.25)' : v.daysLeft <= 60 ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{v.unit}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Expires: {v.expiry}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: dl?.color }}>{dl?.text}</div>
                    {v.daysLeft <= 60 && v.daysLeft > 0 && (
                      <div style={{ width: 50, height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(5, (v.daysLeft / 60) * 100)}%`, height: '100%', background: dl?.color, borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Coverage Status */}
      <div style={pan}>
        {panHead(Shield, 'COVERAGE STATUS')}
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {policies.map(p => {
            const isActive = p.status === 'active'
            const dl = daysLabel(p.daysLeft)
            const isExpiring = p.daysLeft !== null && p.daysLeft <= 60
            return (
              <div key={p.type} style={{ padding: '14px 16px', background: 'var(--surface2)', borderRadius: 10, border: `1px solid ${isActive ? (isExpiring ? (dl?.color || 'var(--warning)') + '30' : 'rgba(34,197,94,0.2)') : 'var(--border)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{p.type}</span>
                    {p.required && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', padding: '1px 5px', borderRadius: 3 }}>REQUIRED</span>}
                  </div>
                  {isActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {dl && <span style={{ fontSize: 10, fontWeight: 700, color: dl.color }}>{dl.text}</span>}
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isExpiring ? dl?.color : 'var(--success)', boxShadow: `0 0 6px ${isExpiring ? dl?.color : 'var(--success)'}` }} />
                    </div>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 4 }}>Not covered</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Min: {p.minCoverage}{p.provider ? ` · ${p.provider}` : ''}</div>
                  {isActive && p.expiry && <div style={{ fontSize: 10, color: 'var(--muted)' }}>Exp: {p.expiry}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Driver Risk Management */}
      {driverRisks.length > 0 && (
        <div style={pan}>
          {panHead(Users, 'DRIVER RISK MANAGEMENT', <span style={{ fontSize: 10, color: 'var(--muted)' }}>{includedDriverCount} of {(drivers || []).length} drivers on policy</span>)}
          <div style={{ padding: '8px 18px 6px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Exclude high-risk drivers from your quote to keep premiums low. Excluded drivers can be covered under separate policies.
            </div>
          </div>
          {driverRisks.map(d => {
            const isExcluded = excludedDrivers.includes(d.id)
            const riskColor = d.risk === 'high' ? 'var(--danger)' : d.risk === 'medium' ? 'var(--warning)' : 'var(--success)'
            return (
              <div key={d.id} style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, opacity: isExcluded ? 0.45 : 1, transition: 'opacity 0.15s' }}>
                <div onClick={() => toggleExcludeDriver(d.id)}
                  style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isExcluded ? 'var(--danger)' : 'var(--border)'}`, background: isExcluded ? 'rgba(239,68,68,0.1)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                  {isExcluded && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 800 }}>✕</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{d.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: riskColor, background: riskColor + '10', padding: '2px 7px', borderRadius: 4, letterSpacing: 0.5 }}>
                      {d.risk.toUpperCase()} RISK
                    </span>
                    {isExcluded && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', letterSpacing: 0.5 }}>EXCLUDED</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 12 }}>
                    <span>Score: {d.score}/100</span>
                    {d.loadCount > 0 && <span>{d.loadCount} loads</span>}
                    {d.incidents > 0 && <span style={{ color: 'var(--danger)' }}>{d.incidents} incident{d.incidents > 1 ? 's' : ''}</span>}
                    {d.cdlExpired && <span style={{ color: 'var(--danger)' }}>CDL expired</span>}
                    {d.medExpired && <span style={{ color: 'var(--warning)' }}>Medical expired</span>}
                  </div>
                </div>
                <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: d.score + '%', height: '100%', background: riskColor, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            )
          })}
          {excludedDrivers.length > 0 && (
            <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--border)', background: 'rgba(240,165,0,0.02)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--accent)' }}>Q tip:</strong> Excluding {excludedDrivers.length} driver{excludedDrivers.length > 1 ? 's' : ''} could save 10-25% on your premium. Consider separate occupational accident coverage for excluded drivers.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Select Partners */}
      <div style={pan}>
        {panHead(Star, 'SELECT INSURANCE PARTNERS', <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={selectAllInsurers}>Select All</button>)}
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {INSURERS.map(ins => {
            const isSel = selectedInsurers.includes(ins.id)
            return (
              <div key={ins.id} onClick={() => toggleInsurer(ins.id)}
                style={{ padding: '14px 16px', background: isSel ? 'rgba(240,165,0,0.04)' : 'var(--surface2)', borderRadius: 10, border: `1px solid ${isSel ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`, background: isSel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                    {isSel && <span style={{ fontSize: 12, color: '#000', fontWeight: 800 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{ins.name}</span>
                  {ins.tag && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--accent)', background: 'rgba(240,165,0,0.1)', padding: '2px 7px', borderRadius: 4 }}>{ins.tag}</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4, marginLeft: 28 }}>{ins.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quote Form */}
      <div style={pan} id="ins-quote-form">
        {panHead(FileText, 'REQUEST QUOTES', <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>Sending to {selectedInsurers.length} partner{selectedInsurers.length !== 1 ? 's' : ''}</span>)}
        {submitted ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Ic icon={CheckCircle} size={26} color="var(--success)" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Quotes Requested from {selectedInsurers.length} Partners</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              {selectedInsurers.map(id => INSURERS.find(i => i.id === id)?.name).join(', ')} will review your info and send competitive quotes within 1-2 business days.
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 20, fontSize: 11 }} onClick={() => setSubmitted(false)}>Submit Another Request</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldRow label="Company Name" value={quoteForm.name} onChange={v => setQuoteForm(f => ({ ...f, name: v }))} />
              <FieldRow label="MC Number" value={quoteForm.mc} onChange={v => setQuoteForm(f => ({ ...f, mc: v }))} />
              <FieldRow label="DOT Number" value={quoteForm.dot} onChange={v => setQuoteForm(f => ({ ...f, dot: v }))} />
              <FieldRow label="Trucks on Policy" value={String(includedDriverCount || quoteForm.trucks)} onChange={v => setQuoteForm(f => ({ ...f, trucks: v }))} type="number" />
              <FieldRow label="Phone" value={quoteForm.phone} onChange={v => setQuoteForm(f => ({ ...f, phone: v }))} />
              <FieldRow label="Email" value={quoteForm.email} onChange={v => setQuoteForm(f => ({ ...f, email: v }))} type="email" />
              <FieldRow label="Current Insurer" value={quoteForm.currentInsurer} onChange={v => setQuoteForm(f => ({ ...f, currentInsurer: v }))} placeholder="e.g. Progressive, National Interstate" />
              <FieldRow label="Policy Expiry Date" value={quoteForm.expiryDate} onChange={v => setQuoteForm(f => ({ ...f, expiryDate: v }))} type="date" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Equipment Type</label>
                <select value={quoteForm.equipment} onChange={e => setQuoteForm(f => ({ ...f, equipment: e.target.value }))} style={inp_}>
                  {['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Hotshot', 'Box Truck', 'Tanker', 'Car Hauler'].map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Coverage Needed</label>
                <select value={quoteForm.coverageNeeded} onChange={e => setQuoteForm(f => ({ ...f, coverageNeeded: e.target.value }))} style={inp_}>
                  <option value="auto-liability">Auto Liability ($1M)</option>
                  <option value="cargo">Cargo Insurance ($100K)</option>
                  <option value="general-liability">General Liability</option>
                  <option value="physical-damage">Physical Damage</option>
                  <option value="bobtail">Bobtail / Non-Trucking</option>
                  <option value="occupational-accident">Occupational Accident</option>
                  <option value="full-package">Full Package (All Coverage)</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '13px 32px', fontSize: 14, fontWeight: 800, alignSelf: 'flex-start' }}>
              Send to {selectedInsurers.length === INSURERS.length ? 'All Partners' : `${selectedInsurers.length} Partner${selectedInsurers.length !== 1 ? 's' : ''}`}
            </button>
          </form>
        )}
      </div>

      <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', padding: '0 4px' }}>
        Your data is only shared with insurers you select. Qivori earns a referral fee — at no extra cost to you.
      </div>
    </div>
  )
}

// ── Q Operations Hub ──────────────────────────────────────────────────────────
export function QOperationsHub() {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [simResults, setSimResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [simLoading, setSimLoading] = useState(false)
  const [learningData, setLearningData] = useState(null)
  const [learningLoading, setLearningLoading] = useState(false)
  const [learningTestResults, setLearningTestResults] = useState(null)
  const [feedbackResult, setFeedbackResult] = useState(null)
  const { drivers, vehicles, activeLoads } = useCarrier()

  const TABS = [
    { id:'overview', label:'Live Ops' },
    { id:'decisions', label:'Decisions' },
    { id:'fleet-state', label:'Fleet State' },
    { id:'failures', label:'Failures' },
    { id:'negotiations', label:'Negotiations' },
    { id:'comms', label:'Driver Comms' },
    { id:'simulation', label:'Simulation' },
    { id:'learning', label:'Q Learning' },
    { id:'rules', label:'Rules' },
  ]

  // Load ops dashboard data
  useEffect(() => {
    setLoading(true)
    apiFetch('/api/q-orchestrator', { method:'POST', body: JSON.stringify({ action:'ops_dashboard' }) })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const runSimulation = () => {
    setSimLoading(true)
    apiFetch('/api/q-simulate', { method:'POST', body: JSON.stringify({ scenario:'all' }) })
      .then(d => { setSimResults(d); setSimLoading(false) })
      .catch(() => setSimLoading(false))
  }

  const fleetSummary = data?.fleet || {}
  const decisions = data?.recentDecisions || []
  const failures = data?.unresolvedFailures || []
  const negotiations = data?.activeNegotiations || []
  const pendingComms = data?.pendingDriverResponses || []

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={Activity} size={18} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Q Operations Center</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Autonomous dispatch brain — decisions, fleet state & failures</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            {[
              { label:'Fleet', val: loading ? '—' : String(fleetSummary.total || (vehicles||[]).length), color:'var(--accent)' },
              { label:'Available', val: loading ? '—' : String(fleetSummary.available || 0), color:'var(--success)' },
              { label:'Failures', val: loading ? '—' : String(failures.length), color: failures.length > 0 ? 'var(--danger)' : 'var(--muted)' },
              { label:'Pending', val: loading ? '—' : String(pendingComms.length), color: pendingComms.length > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:50 }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
        <Suspense fallback={<div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading...</div>}>

          {/* ── LIVE OPS OVERVIEW ── */}
          {tab === 'overview' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              {loading ? (
                <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading Q operations data...</div>
              ) : !data?.ok ? (
                <div style={{ padding:20, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, fontSize:12, color:'#fcd34d' }}>
                  <Ic icon={AlertCircle} size={14} /> Q brain connected — waiting for first dispatch data. Process a load to see live operations.
                </div>
              ) : (
                <>
                  {/* Status cards */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                    {[
                      { label:'Total Fleet', val:fleetSummary.total||0, icon:Truck, color:'var(--accent)' },
                      { label:'Available', val:fleetSummary.available||0, icon:CheckCircle, color:'var(--success)' },
                      { label:'In Transit', val:fleetSummary.inTransit||0, icon:Route, color:'var(--accent3,#3b82f6)' },
                      { label:'At Stop', val:fleetSummary.atStop||0, icon:MapPin, color:'var(--warning,#f59e0b)' },
                      { label:'Booked', val:fleetSummary.booked||0, icon:Package, color:'#a78bfa' },
                      { label:'Unavailable', val:fleetSummary.unavailable||0, icon:AlertTriangle, color:'var(--danger)' },
                    ].map(c => (
                      <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 14px', display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:`${c.color}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Ic icon={c.icon} size={16} color={c.color} />
                        </div>
                        <div>
                          <div style={{ fontSize:20, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                          <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.6 }}>{c.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Alerts */}
                  {failures.length > 0 && (
                    <div style={{ padding:'12px 16px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:12, color:'#fca5a5', display:'flex', alignItems:'center', gap:10 }}>
                      <Ic icon={AlertTriangle} size={15} />
                      <span style={{ fontWeight:600 }}>{failures.length} unresolved failure{failures.length !== 1 ? 's' : ''}</span> — check Failures tab
                    </div>
                  )}
                  {pendingComms.length > 0 && (
                    <div style={{ padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:10, fontSize:12, color:'#fcd34d', display:'flex', alignItems:'center', gap:10 }}>
                      <Ic icon={Clock} size={15} />
                      <span style={{ fontWeight:600 }}>{pendingComms.length} driver response{pendingComms.length !== 1 ? 's' : ''} pending</span>
                    </div>
                  )}

                  {/* Recent decisions */}
                  {decisions.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                        <Ic icon={Zap} size={14} color="var(--accent)" /> Today's Decisions
                      </div>
                      {decisions.slice(0, 8).map((d, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < decisions.length - 1 ? '1px solid var(--border)' : 'none', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{
                              padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                              background: d.decision === 'auto_book' ? 'rgba(34,197,94,0.15)' : d.decision === 'negotiate' ? 'rgba(245,158,11,0.15)' : d.decision === 'reject' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                              color: d.decision === 'auto_book' ? '#86efac' : d.decision === 'negotiate' ? '#fcd34d' : d.decision === 'reject' ? '#fca5a5' : '#93c5fd',
                            }}>{d.decision?.replace('_', ' ')}</span>
                            <span style={{ color:'var(--text)' }}>{d.origin} → {d.dest}</span>
                          </div>
                          <div style={{ display:'flex', gap:12, color:'var(--muted)' }}>
                            <span>${d.gross || d.total_rate}</span>
                            <span>{d.confidence}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── DECISIONS TAB ── */}
          {tab === 'decisions' && (
            <div style={{ padding:20 }}>
              {decisions.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Zap} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>NO DECISIONS YET</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>Q will show every load decision here — auto-book, negotiate, or reject with full reasoning.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {decisions.map((d, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{d.origin} → {d.dest}</div>
                          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{d.broker} • {d.equipment || 'Dry Van'} • {d.miles} mi</div>
                        </div>
                        <span style={{
                          padding:'3px 10px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                          background: d.decision === 'auto_book' ? 'rgba(34,197,94,0.15)' : d.decision === 'negotiate' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                          color: d.decision === 'auto_book' ? '#86efac' : d.decision === 'negotiate' ? '#fcd34d' : '#fca5a5',
                        }}>{d.decision?.replace('_', ' ')}</span>
                      </div>
                      <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--muted)' }}>
                        <span>Gross: <b style={{ color:'var(--text)' }}>${d.gross || d.total_rate}</b></span>
                        <span>RPM: <b style={{ color:'var(--text)' }}>${d.rpm?.toFixed(2)}</b></span>
                        <span>Profit: <b style={{ color: d.total_profit > 0 ? 'var(--success)' : 'var(--danger)' }}>${d.total_profit}</b></span>
                        <span>Confidence: <b style={{ color:'var(--accent)' }}>{d.confidence}%</b></span>
                      </div>
                      {d.explanation && (
                        <div style={{ marginTop:8, padding:'8px 12px', background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.1)', borderRadius:8, fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
                          {d.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── FLEET STATE TAB ── */}
          {tab === 'fleet-state' && (
            <div style={{ padding:20 }}>
              {(vehicles || []).length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Truck} size={24} color="var(--accent3,#3b82f6)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>NO TRUCKS REGISTERED</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>Add vehicles in Fleet tab to see real-time truck state here.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {(data?.fleet?.trucks || []).map((t, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <Ic icon={Truck} size={16} color="var(--accent3,#3b82f6)" />
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{t.vehicle_id || `Truck ${i+1}`}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{t.current_city ? `${t.current_city}, ${t.current_state}` : 'Location unknown'} • {t.trailer_type || 'Dry Van'}</div>
                        </div>
                      </div>
                      <span style={{
                        padding:'3px 10px', borderRadius:6, fontSize:10, fontWeight:700,
                        background: ['READY_FOR_LOAD','EMPTY'].includes(t.status) ? 'rgba(34,197,94,0.15)' : ['IN_TRANSIT','LOADED','IN_TRANSIT_TO_PICKUP'].includes(t.status) ? 'rgba(59,130,246,0.15)' : t.status === 'UNAVAILABLE' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                        color: ['READY_FOR_LOAD','EMPTY'].includes(t.status) ? '#86efac' : ['IN_TRANSIT','LOADED','IN_TRANSIT_TO_PICKUP'].includes(t.status) ? '#93c5fd' : t.status === 'UNAVAILABLE' ? '#fca5a5' : '#fcd34d',
                      }}>{(t.status || 'UNKNOWN').replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                  {(!data?.fleet?.trucks || data.fleet.trucks.length === 0) && (
                    <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                      Fleet state not synced yet. Process a load or update truck status via API to see state here.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── FAILURES TAB ── */}
          {tab === 'failures' && (
            <div style={{ padding:20 }}>
              {failures.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={CheckCircle} size={24} color="var(--success)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--success)', marginBottom:8 }}>ALL CLEAR</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>No unresolved failures. Q logs every issue — driver no-response, broker changes, SMS failures, status conflicts — and shows them here for review.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {failures.map((f, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{
                            padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                            background: f.severity === 'critical' ? 'rgba(239,68,68,0.15)' : f.severity === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                            color: f.severity === 'critical' ? '#fca5a5' : f.severity === 'high' ? '#fcd34d' : '#93c5fd',
                          }}>{f.severity}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{(f.failure_type || '').replace(/_/g, ' ')}</span>
                        </div>
                        <span style={{ fontSize:10, color:'var(--muted)' }}>Retry {f.retry_count}/{f.max_retries}</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>{f.description}</div>
                      {f.load_id && <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Load: {f.load_id}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── NEGOTIATIONS TAB ── */}
          {tab === 'negotiations' && (
            <div style={{ padding:20 }}>
              {negotiations.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Target} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>NO ACTIVE NEGOTIATIONS</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>When Q decides to negotiate a load, the session appears here — initial offer, counter, target rate, and outcome.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {negotiations.map((n, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{n.lane || 'Unknown Lane'}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{n.broker_name} • Round {n.counter_rounds}/{n.max_rounds}</div>
                        </div>
                        <span style={{
                          padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                          background: n.status === 'ACCEPTED' ? 'rgba(34,197,94,0.15)' : n.status === 'LOST' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: n.status === 'ACCEPTED' ? '#86efac' : n.status === 'LOST' ? '#fca5a5' : '#fcd34d',
                        }}>{(n.status || '').replace(/_/g, ' ')}</span>
                      </div>
                      <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--muted)' }}>
                        {n.initial_offer && <span>Offered: <b style={{ color:'var(--text)' }}>${n.initial_offer}</b></span>}
                        {n.target_rate && <span>Target: <b style={{ color:'var(--accent)' }}>${n.target_rate}</b></span>}
                        {n.counter_offer && <span>Counter: <b style={{ color:'#fcd34d' }}>${n.counter_offer}</b></span>}
                        {n.final_rate && <span>Final: <b style={{ color:'var(--success)' }}>${n.final_rate}</b></span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── DRIVER COMMS TAB ── */}
          {tab === 'comms' && (
            <div style={{ padding:20 }}>
              {pendingComms.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={CheckCircle} size={24} color="var(--success)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--success)', marginBottom:8 }}>ALL RESPONSES RECEIVED</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>No pending driver responses. Morning checks, load offers, and status updates will show here when waiting for driver reply.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {pendingComms.map((c, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <Ic icon={Smartphone} size={14} color="var(--accent)" />
                          <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{c.message_type?.replace(/_/g, ' ')}</span>
                        </div>
                        <span style={{ fontSize:10, color:'var(--warning,#f59e0b)' }}>
                          {c.response_deadline ? `Due: ${new Date(c.response_deadline).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}` : 'Waiting...'}
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>{c.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SIMULATION TAB ── */}
          {tab === 'simulation' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>Decision Engine Test Suite</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Run 10 realistic scenarios against your carrier settings</div>
                </div>
                <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 20px' }} onClick={runSimulation} disabled={simLoading}>
                  {simLoading ? 'Running...' : 'Run All Scenarios'}
                </button>
              </div>

              {simResults?.results && (
                <>
                  {/* Summary */}
                  <div style={{ display:'flex', gap:12 }}>
                    <div style={{ flex:1, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ fontSize:24, fontWeight:800, color:'var(--success)', fontFamily:"'DM Sans',sans-serif" }}>{simResults.summary?.passed || 0}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Passed</div>
                    </div>
                    <div style={{ flex:1, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ fontSize:24, fontWeight:800, color:'var(--danger)', fontFamily:"'DM Sans',sans-serif" }}>{simResults.summary?.failed || 0}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Failed</div>
                    </div>
                  </div>

                  {/* Scenario results */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {simResults.results.map((r, i) => (
                      <div key={i} style={{ background:'var(--surface)', border:`1px solid ${r.passed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius:12, padding:14 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontSize:14 }}>{r.passed ? '✅' : '❌'}</span>
                              {r.name}
                            </div>
                            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{r.description}</div>
                          </div>
                          <span style={{
                            padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                            background: r.decision === 'auto_book' ? 'rgba(34,197,94,0.15)' : r.decision === 'negotiate' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                            color: r.decision === 'auto_book' ? '#86efac' : r.decision === 'negotiate' ? '#fcd34d' : '#fca5a5',
                          }}>{r.decision?.replace('_', ' ')}</span>
                        </div>
                        <div style={{ display:'flex', gap:12, fontSize:10, color:'var(--muted)', flexWrap:'wrap' }}>
                          <span>{r.load?.origin} → {r.load?.dest}</span>
                          <span>Gross: ${r.load?.gross}</span>
                          <span>RPM: ${r.metrics?.rpm}</span>
                          <span>Profit: ${r.metrics?.totalProfit}</span>
                          <span>Confidence: {r.confidence}%</span>
                        </div>
                        {r.explanation?.summary && (
                          <div style={{ marginTop:6, padding:'6px 10px', background:'rgba(240,165,0,0.04)', borderRadius:6, fontSize:10, color:'var(--muted)', lineHeight:1.5 }}>
                            {r.explanation.summary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!simResults && !simLoading && (
                <div style={{ padding:'30px 20px', textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={FlaskConical} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>TEST YOUR Q BRAIN</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:360, margin:'0 auto', lineHeight:1.6 }}>Run 10 scenarios — profitable loads, trap loads, dead zones, negotiation candidates — and see how Q decides based on your rules.</div>
                </div>
              )}
            </div>
          )}

          {/* ── Q LEARNING TAB ── */}
          {tab === 'learning' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              {/* Controls */}
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 18px' }} disabled={learningLoading}
                  onClick={() => {
                    setLearningLoading(true)
                    apiFetch('/api/q-learning', { method:'POST', body: JSON.stringify({ action:'dashboard' }) })
                      .then(d => { setLearningData(d); setLearningLoading(false) })
                      .catch(() => setLearningLoading(false))
                  }}>
                  {learningLoading ? 'Loading...' : 'Load Learning Data'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'8px 18px' }} disabled={learningLoading}
                  onClick={() => {
                    setLearningLoading(true)
                    apiFetch('/api/q-learning', { method:'POST', body: JSON.stringify({ action:'run_feedback' }) })
                      .then(d => { setFeedbackResult(d); setLearningLoading(false) })
                      .catch(() => setLearningLoading(false))
                  }}>
                  Run Feedback Cycle
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'8px 18px' }} disabled={learningLoading}
                  onClick={() => {
                    setLearningLoading(true)
                    apiFetch('/api/q-learning', { method:'POST', body: JSON.stringify({ action:'daily_summary' }) })
                      .then(d => { setFeedbackResult(d); setLearningLoading(false) })
                      .catch(() => setLearningLoading(false))
                  }}>
                  Generate Daily Summary
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'8px 18px' }}
                  onClick={() => {
                    setLearningLoading(true)
                    apiFetch('/api/q-learning-test', { method:'POST', body: JSON.stringify({ scenario:'all' }) })
                      .then(d => { setLearningTestResults(d); setLearningLoading(false) })
                      .catch(() => setLearningLoading(false))
                  }}>
                  Run Learning Tests
                </button>
              </div>

              {/* Feedback cycle result */}
              {feedbackResult && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:8 }}>
                    {feedbackResult.skipped ? 'Feedback Cycle Skipped' : feedbackResult.q_health_score != null ? 'Daily Summary' : 'Feedback Cycle Complete'}
                  </div>
                  {feedbackResult.skipped ? (
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{feedbackResult.reason}</div>
                  ) : feedbackResult.q_health_score != null ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--muted)' }}>
                        <span>Health: <b style={{ color:'var(--accent)' }}>{feedbackResult.q_health_score}%</b></span>
                        <span>Accuracy: <b style={{ color:'var(--success)' }}>{feedbackResult.decision_accuracy_pct || '—'}%</b></span>
                        <span>Decisions: <b style={{ color:'var(--text)' }}>{feedbackResult.total_decisions}</b></span>
                        <span>Mistakes: <b style={{ color: feedbackResult.total_mistakes > 0 ? 'var(--danger)' : 'var(--muted)' }}>{feedbackResult.total_mistakes}</b></span>
                        <span>Profit Δ: <b style={{ color: feedbackResult.profit_delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>${feedbackResult.profit_delta}</b></span>
                      </div>
                      {feedbackResult.suggested_adjustments?.length > 0 && (
                        <div>
                          <div style={{ fontSize:11, fontWeight:600, color:'var(--accent)', marginBottom:4 }}>Suggested Adjustments:</div>
                          {feedbackResult.suggested_adjustments.map((a, i) => (
                            <div key={i} style={{ fontSize:11, color:'var(--muted)', padding:'4px 0' }}>
                              {a.parameter}: {a.current} → {a.suggested} — {a.reason}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--muted)' }}>
                      <span>Outcomes analyzed: <b style={{ color:'var(--text)' }}>{feedbackResult.outcomes_analyzed}</b></span>
                      <span>Mistakes processed: <b style={{ color:'var(--text)' }}>{feedbackResult.mistakes_processed}</b></span>
                      <span>Adjustments: <b style={{ color:'var(--accent)' }}>{feedbackResult.adjustments?.length || 0}</b></span>
                      <span>Auto-applied: <b style={{ color:'var(--text)' }}>{feedbackResult.auto_applied ? 'Yes' : 'No'}</b></span>
                    </div>
                  )}
                </div>
              )}

              {/* Learning test results */}
              {learningTestResults?.results && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>Learning Loop Test Results</div>
                    <div style={{ display:'flex', gap:12 }}>
                      <span style={{ fontSize:12, color:'var(--success)', fontWeight:700 }}>{learningTestResults.summary?.passed || 0} passed</span>
                      <span style={{ fontSize:12, color:'var(--danger)', fontWeight:700 }}>{learningTestResults.summary?.failed || 0} failed</span>
                    </div>
                  </div>
                  {learningTestResults.results.map((r, i) => (
                    <div key={i} style={{ padding:'12px 16px', borderBottom: i < learningTestResults.results.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                          <span>{r.passed ? '✅' : '❌'}</span> {r.name}
                        </div>
                        <span style={{ fontSize:10, color: r.result === 'good' ? '#86efac' : r.result === 'bad' ? '#fca5a5' : r.result === 'missed_opportunity' ? '#fcd34d' : 'var(--muted)',
                          padding:'2px 8px', borderRadius:6, background: r.result === 'good' ? 'rgba(34,197,94,0.15)' : r.result === 'bad' ? 'rgba(239,68,68,0.15)' : r.result === 'missed_opportunity' ? 'rgba(245,158,11,0.15)' : 'rgba(128,128,128,0.15)',
                          fontWeight:700, textTransform:'uppercase' }}>{r.result}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{r.description}</div>
                      <div style={{ display:'flex', gap:12, fontSize:10, color:'var(--muted)' }}>
                        <span>{r.load?.lane}</span>
                        <span>Expected: ${r.load?.expectedProfit} → Actual: ${r.load?.actualProfit}</span>
                        <span>Δ${r.profitDelta}</span>
                        <span>Mistakes: {r.mistakesDetected}</span>
                      </div>
                      {r.mistakes?.length > 0 && (
                        <div style={{ marginTop:4, display:'flex', gap:6, flexWrap:'wrap' }}>
                          {r.mistakes.map((m, j) => (
                            <span key={j} style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(239,68,68,0.1)', color:'#fca5a5', fontWeight:600 }}>
                              {m.type.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Learning dashboard data */}
              {learningData?.ok && (
                <>
                  {/* Stats cards */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
                    {[
                      { label:'Total Outcomes', val: learningData.stats?.totalOutcomes || 0, color:'var(--accent)' },
                      { label:'Good Decisions', val: learningData.stats?.goodOutcomes || 0, color:'var(--success)' },
                      { label:'Bad Decisions', val: learningData.stats?.badOutcomes || 0, color:'var(--danger)' },
                      { label:'Accuracy', val: learningData.stats?.accuracy != null ? `${learningData.stats.accuracy}%` : '—', color:'var(--accent3,#3b82f6)' },
                    ].map(c => (
                      <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:20, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                        <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.6 }}>{c.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Recent mistakes */}
                  {learningData.recentMistakes?.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                        Recent Mistakes
                      </div>
                      {learningData.recentMistakes.slice(0, 8).map((m, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < 7 ? '1px solid var(--border)' : 'none', fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ padding:'2px 6px', borderRadius:4, fontSize:9, fontWeight:700, textTransform:'uppercase',
                              background: m.severity === 'critical' ? 'rgba(239,68,68,0.15)' : m.severity === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                              color: m.severity === 'critical' ? '#fca5a5' : m.severity === 'high' ? '#fcd34d' : '#93c5fd' }}>{m.severity}</span>
                            <span style={{ color:'var(--muted)' }}>{m.description?.substring(0, 80)}</span>
                          </div>
                          {m.impact_dollars != null && <span style={{ color:'var(--danger)', fontWeight:600 }}>${Math.round(m.impact_dollars)}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recent adjustments */}
                  {learningData.recentAdjustments?.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                        Recent Adjustments
                      </div>
                      {learningData.recentAdjustments.slice(0, 5).map((a, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', fontSize:12 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                            <span style={{ fontWeight:600, color:'var(--text)' }}>{a.parameter}</span>
                            <span style={{ color:'var(--accent)', fontWeight:700 }}>{a.old_value} → {a.new_value}</span>
                          </div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{a.reason}</div>
                          {a.guardrail_hit && <div style={{ fontSize:10, color:'var(--warning,#f59e0b)', marginTop:2 }}>Guardrail: {a.guardrail_hit}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top lanes */}
                  {learningData.topLanes?.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                        Lane Intelligence
                      </div>
                      {learningData.topLanes.slice(0, 8).map((l, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < 7 ? '1px solid var(--border)' : 'none', fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <span style={{ fontWeight:600, color:'var(--text)' }}>{l.lane}</span>
                            <span style={{ fontSize:10, color:'var(--muted)', marginLeft:8 }}>{l.total_loads} loads</span>
                          </div>
                          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                            <span style={{ fontSize:11, color:'var(--muted)' }}>RPM: ${l.avg_rpm}</span>
                            <span style={{ padding:'2px 8px', borderRadius:6, fontSize:9, fontWeight:700, textTransform:'uppercase',
                              background: l.quality === 'hot_market' ? 'rgba(34,197,94,0.15)' : l.quality === 'dead_zone' ? 'rgba(239,68,68,0.15)' : 'rgba(128,128,128,0.15)',
                              color: l.quality === 'hot_market' ? '#86efac' : l.quality === 'dead_zone' ? '#fca5a5' : 'var(--muted)' }}>{l.quality?.replace('_',' ')}</span>
                            <span style={{ fontSize:10, color:'var(--accent)' }}>{l.confidence_score}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top brokers */}
                  {learningData.topBrokers?.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                        Broker Reliability
                      </div>
                      {learningData.topBrokers.slice(0, 8).map((b, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < 7 ? '1px solid var(--border)' : 'none', fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <span style={{ fontWeight:600, color:'var(--text)' }}>{b.broker_name}</span>
                            <span style={{ fontSize:10, color:'var(--muted)', marginLeft:8 }}>{b.total_loads} loads</span>
                          </div>
                          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                            <span style={{ padding:'2px 8px', borderRadius:6, fontSize:9, fontWeight:700, textTransform:'uppercase',
                              background: b.reliability_tier === 'excellent' ? 'rgba(34,197,94,0.15)' : b.reliability_tier === 'poor' || b.reliability_tier === 'blacklist' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                              color: b.reliability_tier === 'excellent' ? '#86efac' : b.reliability_tier === 'poor' || b.reliability_tier === 'blacklist' ? '#fca5a5' : '#fcd34d' }}>{b.reliability_tier}</span>
                            <span style={{ fontSize:10, color:'var(--accent)' }}>{b.reliability_score}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Empty state */}
              {!learningData && !learningTestResults && !feedbackResult && (
                <div style={{ padding:'30px 20px', textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={TrendingUp} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>Q LEARNS FROM EVERY LOAD</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:400, margin:'0 auto', lineHeight:1.6 }}>
                    Track outcomes, detect mistakes, adjust scoring weights, and build lane/broker intelligence — all with guardrails. Click "Load Learning Data" to see what Q has learned, or "Run Learning Tests" to validate the feedback loop.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RULES TAB ── */}
          {tab === 'rules' && (
            <div style={{ padding:20 }}>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Q Decision Rules</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>Current thresholds driving autonomous dispatch decisions</div>
                {data?.settings ? (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {[
                      { label:'Min Profit', val:`$${data.settings.minProfit || 0}`, desc:'Minimum total profit to consider' },
                      { label:'Auto-Accept Above', val:`$${data.settings.autoAcceptAbove || 0}`, desc:'Auto-book if profit exceeds this' },
                      { label:'Auto-Reject Below', val:`$${data.settings.autoRejectBelow || 0}`, desc:'Instant reject below this profit' },
                      { label:'Min RPM', val:`$${data.settings.minRpm || 0}`, desc:'Minimum revenue per mile' },
                      { label:'Fuel Cost/Mile', val:`$${data.settings.fuelCostPerMile || 0}`, desc:'Used for profit calculations' },
                    ].map((r, i) => (
                      <div key={i} style={{ padding:'12px 14px', background:'var(--bg)', borderRadius:10, border:'1px solid var(--border)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{r.label}</span>
                          <span style={{ fontSize:14, fontWeight:800, color:'var(--accent)', fontFamily:"'DM Sans',sans-serif" }}>{r.val}</span>
                        </div>
                        <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{r.desc}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:'var(--muted)' }}>Loading carrier settings...</div>
                )}
                <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.1)', borderRadius:8, fontSize:11, color:'var(--muted)' }}>
                  To update these rules, go to <b style={{ color:'var(--accent)' }}>Settings → Dispatch Preferences</b>. Changes take effect immediately on the next load evaluation.
                </div>
              </div>
            </div>
          )}

        </Suspense>
      </div>
    </div>
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
    case 'edi':          return <EDIDashboard />
    case 'ai-dashboard': return <AIDispatchDashboard />
    case 'q-ops':        return <QOperationsHub />
    case 'simulation':   return <SimulationDashboard />
    case 'activity-log': return <ActivityLog />
    case 'analytics':   return <AnalyticsDashboard />
    case 'load-board':  return <AILoadBoard />
    case 'rate-check':  return <RateNegotiation />
    case 'referrals':   return <ReferralProgram />
    default:            return <OverviewTab onTabChange={(viewId) => navTo(viewId)} />
  }
}
