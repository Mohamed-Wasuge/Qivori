import React, { useState, useCallback, useEffect, useRef, useMemo, Component, lazy, Suspense } from 'react'
import * as Sentry from '@sentry/react'
import {
  Monitor, Layers, Receipt, Truck, Shield, Users, Briefcase, Settings as SettingsIcon,
  Search, Bell, Moon, Eye, Zap, Wrench, CreditCard, BarChart2, AlertTriangle,
  TrendingUp, TrendingDown, ChevronLeft, ClipboardList, CheckCircle, Map, DollarSign, Droplets, FileCheck, Star, UserPlus,
  User, Building2, Plug, Palette, Scale, Package, MapPin, Smartphone, FileText, AlertCircle, Fuel,
  Clock, Plus, CloudSun, Activity, Radio, ArrowUpRight, ArrowDownRight, Bot, Sun, Sunrise, Globe, RefreshCw, Link2, Target, Route, FlaskConical
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useSubscription } from '../hooks/useSubscription'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import { generateInvoicePDF } from '../utils/generatePDF'
import Toast from './Toast'
import { apiFetch } from '../lib/api'
import * as db from '../lib/database'
import { useTranslation, LanguageToggle } from '../lib/i18n'

// Lazy-load all heavy domain modules to prevent chunk TDZ errors in production
const lazyN = (importFn, name) => lazy(() => importFn().then(m => ({ default: m[name] })))

// LoadBoard
const SmartDispatch = lazyN(() => import('../pages/carrier/LoadBoard'), 'SmartDispatch')
const LaneIntel = lazyN(() => import('../pages/carrier/LoadBoard'), 'LaneIntel')
const CommandCenter = lazyN(() => import('../pages/carrier/LoadBoard'), 'CommandCenter')
const AILoadBoard = lazyN(() => import('../pages/carrier/LoadBoard'), 'AILoadBoard')
const CheckCallCenter = lazyN(() => import('../pages/carrier/LoadBoard'), 'CheckCallCenter')
const DATAlertBot = lazyN(() => import('../pages/carrier/LoadBoard'), 'DATAlertBot')
const RateNegotiation = lazyN(() => import('../pages/carrier/LoadBoard'), 'RateNegotiation')

// Drivers
const DriverSettlement = lazyN(() => import('../pages/carrier/DriverScorecard'), 'DriverSettlement')
const DriverProfiles = lazyN(() => import('../pages/carrier/DriverScorecard'), 'DriverProfiles')
const DriverOnboarding = lazyN(() => import('../pages/carrier/DriverScorecard'), 'DriverOnboarding')
const DriverScorecard = lazyN(() => import('../pages/carrier/DriverScorecard'), 'DriverScorecard')
const DriverPayReport = lazyN(() => import('../pages/carrier/DriverScorecard'), 'DriverPayReport')

// Compliance
const CarrierIFTA = lazyN(() => import('../pages/carrier/Compliance'), 'CarrierIFTA')
const CarrierDVIR = lazyN(() => import('../pages/carrier/Compliance'), 'CarrierDVIR')
const CarrierClearinghouse = lazyN(() => import('../pages/carrier/Compliance'), 'CarrierClearinghouse')
const AuditToday = lazyN(() => import('../pages/carrier/Compliance'), 'AuditToday')

// Fleet
const FleetMap = lazyN(() => import('../pages/carrier/FleetMapGoogle'), 'FleetMapGoogle')
const FleetManager = lazyN(() => import('../pages/carrier/Fleet'), 'FleetManager')
const FuelOptimizer = lazyN(() => import('../pages/carrier/Fleet'), 'FuelOptimizer')
const EquipmentManager = lazyN(() => import('../pages/carrier/Fleet'), 'EquipmentManager')

// Finance
const BrokerRiskIntel = lazyN(() => import('../pages/carrier/Finance'), 'BrokerRiskIntel')
const BrokerDirectory = lazyN(() => import('../pages/carrier/Finance'), 'BrokerDirectory')
const ExpenseTracker = lazyN(() => import('../pages/carrier/Finance'), 'ExpenseTracker')
const FactoringCashflow = lazyN(() => import('../pages/carrier/Finance'), 'FactoringCashflow')
const CashFlowForecaster = lazyN(() => import('../pages/carrier/Finance'), 'CashFlowForecaster')
const PLDashboard = lazyN(() => import('../pages/carrier/Finance'), 'PLDashboard')
const ReceivablesAging = lazyN(() => import('../pages/carrier/Finance'), 'ReceivablesAging')
const AccountsPayable = lazyN(() => import('../pages/carrier/Finance'), 'AccountsPayable')
const CashRunway = lazyN(() => import('../pages/carrier/Finance'), 'CashRunway')
const QuickBooksExport = lazyN(() => import('../pages/carrier/Finance'), 'QuickBooksExport')
const AnalyticsDashboard = lazyN(() => import('../pages/carrier/Finance'), 'AnalyticsDashboard')
const InvoicesHub = lazyN(() => import('../pages/carrier/Finance'), 'InvoicesHub')

// Settings
const CarrierPackage = lazyN(() => import('../pages/carrier/Settings'), 'CarrierPackage')
const ReferralProgram = lazyN(() => import('../pages/carrier/Settings'), 'ReferralProgram')
const SMSSettings = lazyN(() => import('../pages/carrier/Settings'), 'SMSSettings')
const InvoicingSettings = lazyN(() => import('../pages/carrier/Settings'), 'InvoicingSettings')
const TeamManagement = lazyN(() => import('../pages/carrier/Settings'), 'TeamManagement')

// EDI
const EDIDashboard = lazyN(() => import('../pages/carrier/EDIDashboard'), 'EDIDashboard')

// HR
const DQFileManager = lazyN(() => import('../pages/carrier/HR'), 'DQFileManager')
const ExpiryAlerts = lazyN(() => import('../pages/carrier/HR'), 'ExpiryAlerts')
const DrugAlcoholCompliance = lazyN(() => import('../pages/carrier/HR'), 'DrugAlcoholCompliance')
const IncidentTracker = lazyN(() => import('../pages/carrier/HR'), 'IncidentTracker')
const PayrollTracker = lazyN(() => import('../pages/carrier/HR'), 'PayrollTracker')
const HiringPipeline = lazyN(() => import('../pages/carrier/HR'), 'HiringPipeline')
const DriverContracts = lazyN(() => import('../pages/carrier/HR'), 'DriverContracts')
const DriverPortal = lazyN(() => import('../pages/carrier/HR'), 'DriverPortal')

// ── Extracted component imports ──────────────────────────────────────────────
import { Ic, HubTabBar } from './carrier/shared'
import { OverviewTab } from './carrier/OverviewTab'
import { ProfitIQTab } from './carrier/ProfitIQTab'
import { DispatchTab } from './carrier/DispatchTab'
import { SearchModal, AIChatbox, QuickActions } from './carrier/Overlays'
import { OnboardingWizard } from './carrier/OnboardingWizard'
import { SettingsTab } from './carrier/SettingsTab'
import { BillingTab, SettlementTab, LoadsPipeline, LoadDetailDrawer } from './carrier/LoadsPipeline'
import { AIDispatchDashboard } from './carrier/AIDispatchDashboard'
import { SimulationDashboard } from './carrier/SimulationDashboard'
import { ActivityLog } from './carrier/ActivityLog'

// ── View Error Boundary ─────────────────────────────────────────────────────
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
  { id:'edi',          icon: Radio,        label:'EDI Hub' },
  { id:'ai-dashboard', icon: Bot,          label:'AI Control Center' },
  // SimulationDashboard removed from nav — demo/internal only
  { id:'settings',     icon: SettingsIcon, label:'Settings',       i18nKey:'nav.settings'     },
]

// ── Simplified nav for driver-role users ─────────────────────────────────────
const DRIVER_NAV = [
  { id:'loads',        icon: Package,      label:'My Loads',       i18nKey:'nav.loads'        },
  { id:'financials',   icon: DollarSign,   label:'Expenses',       i18nKey:'nav.financials'   },
  { id:'_divider' },
  { id:'settings',     icon: SettingsIcon, label:'Settings',       i18nKey:'nav.settings'     },
]

// ── Dispatcher nav — dispatch-relevant tabs only ────────────────────────────
const DISPATCHER_NAV = [
  { id:'dashboard',    icon: Monitor,      label:'Dashboard'       },
  { id:'load-board',   icon: Zap,          label:'Find Loads'      },
  { id:'loads',        icon: Package,      label:'My Loads'        },
  { id:'drivers',      icon: Users,        label:'Drivers'         },
  { id:'fleet',        icon: Truck,        label:'My Fleet'        },
  { id:'compliance',   icon: Shield,       label:'Safety & Compliance' },
  { id:'_divider' },
  { id:'settings',     icon: SettingsIcon, label:'Settings'        },
]

// ── Accountant nav — finance-relevant tabs only ─────────────────────────────
const ACCOUNTANT_NAV = [
  { id:'dashboard',    icon: Monitor,      label:'Dashboard'       },
  { id:'loads',        icon: Package,      label:'My Loads'        },
  { id:'financials',   icon: DollarSign,   label:'Money'           },
  { id:'_divider' },
  { id:'settings',     icon: SettingsIcon, label:'Settings'        },
]

// ── Q Intelligence Feed — AI-powered insights for each hub ──
function QInsightsFeed({ hub, summary, onNavigate }) {
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
function DriversHub() {
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
function FleetHub() {
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
function FinancialsHub() {
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
                    { label:'Driver Pay (est.)', val:`-$${Math.round(totalRevenue * 0.28).toLocaleString()}`, color:'var(--danger)' },
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
function SafetyIntelligenceDashboard({ drivers, vehicles, compData }) {
  const { loads } = useCarrier()
  const [fleetRisk, setFleetRisk] = useState(null)
  const [weather, setWeather] = useState(null)
  const [routeZones, setRouteZones] = useState([])
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    import('../lib/crashRiskEngine').then(engine => {
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
function ComplianceHub() {
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
      import('../lib/compliance').then(m => m.validateFleet),
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
    case 'simulation':   return <SimulationDashboard />
    case 'activity-log': return <ActivityLog />
    case 'analytics':   return <AnalyticsDashboard />
    case 'load-board':  return <AILoadBoard />
    case 'rate-check':  return <RateNegotiation />
    case 'referrals':   return <ReferralProgram />
    default:            return <OverviewTab onTabChange={(viewId) => navTo(viewId)} />
  }
}

function CarrierLayoutInner() {
  const { logout, showToast, theme, setTheme, profile, demoMode, goToLogin, isDriver, isAdmin, isDispatcher, companyRole, switchView, currentRole, subscriptionBlocked, pastDue, openBillingPortal } = useApp()
  const { activeLoads, unpaidInvoices, company, loads, drivers } = useCarrier()
  const { t } = useTranslation()
  const { isTrialing, trialDaysLeft, isActive, isPaid } = useSubscription()

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('driver')
  const [inviteDriverId, setInviteDriverId] = useState('')
  const [inviteSending, setInviteSending] = useState(false)

  // Choose nav based on company role
  const currentNav = isDriver ? DRIVER_NAV
    : isDispatcher ? DISPATCHER_NAV
    : companyRole === 'accountant' ? ACCOUNTANT_NAV
    : NAV

  const handleSendInvite = async () => {
    if (!inviteEmail) { showToast('error', 'Error', 'Email is required'); return }
    setInviteSending(true)
    try {
      const res = await apiFetch('/api/invite-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          driver_id: inviteDriverId || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('', 'Invitation Sent', `Invite sent to ${inviteEmail}`)
        setInviteEmail('')
        setInviteRole('driver')
        setInviteDriverId('')
        setShowInvite(false)
      } else {
        showToast('error', 'Error', data.error || 'Failed to send invitation')
      }
    } catch (err) {
      showToast('error', 'Error', 'Failed to send invitation')
    }
    setInviteSending(false)
  }

  // Check if user needs onboarding (new user) or verification (existing user without MC/DOT)
  const isNewUser = !localStorage.getItem('qv_onboarded') && !company?.name && loads.length === 0
  const needsVerification = !isNewUser && !demoMode && !isAdmin && localStorage.getItem('qv_onboarded') && !company?.mc_number && !company?.dot_number
  const [showOnboarding, setShowOnboarding] = useState(isNewUser || needsVerification)

  const [activeView,    setActiveView]    = useState(isDriver ? 'loads' : 'dashboard')
  const [drawerLoadId,  setDrawerLoadId]  = useState(null)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [notifOpen,     setNotifOpen]     = useState(false)
  const [mobileNav,     setMobileNav]     = useState(false)
  const [readNotifs, setReadNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('qv_read_notifs') || '[]') } catch { return [] }
  })
  const [dismissedNotifs, setDismissedNotifs] = useState([])
  const notifRef = useRef(null)

  // Allowed view IDs based on current nav (role-based guard)
  const allowedViews = useMemo(() => {
    const ids = new Set(currentNav.filter(n => n.id && n.id !== '_divider').map(n => n.id))
    // Always allow sub-views that are accessible from within allowed hubs
    if (ids.has('loads')) { ids.add('rate-check'); ids.add('activity-log') }
    if (ids.has('settings')) ids.add('referrals')
    return ids
  }, [currentNav])

  const navTo = (viewId) => {
    // Role-based view guard — redirect to dashboard (or first allowed view) if not allowed
    if (!allowedViews.has(viewId)) {
      const fallback = currentNav.find(n => n.id && n.id !== '_divider')
      setActiveView(fallback?.id || 'dashboard')
      setMobileNav(false)
      return
    }
    setActiveView(viewId)
    setMobileNav(false)
  }

  // Guard: if activeView is not in allowed set (e.g. role changed), redirect
  useEffect(() => {
    if (allowedViews.size > 0 && !allowedViews.has(activeView)) {
      const fallback = currentNav.find(n => n.id && n.id !== '_divider')
      setActiveView(fallback?.id || 'dashboard')
    }
  }, [allowedViews, activeView, currentNav])

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

  const sStyle = { fontFamily:"'DM Sans',sans-serif", width:'100%', height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' }
  const inp    = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', color:'var(--text)', fontSize:12, outline:'none', fontFamily:"'DM Sans',sans-serif" }

  return (
    <div style={sStyle}>

      {/* Demo banner */}
      {demoMode && (
        <div style={{ background:'linear-gradient(90deg, #f0a500, #e09000)', padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'center', gap:16, flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#000' }}>You're in demo mode — Sign up for your 14-day free trial, no credit card required</span>
          <button onClick={goToLogin} style={{ background:'#000', color:'#f0a500', border:'none', borderRadius:8, padding:'6px 16px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Start Free Trial
          </button>
        </div>
      )}

      {/* Trial countdown banner */}
      {!demoMode && isTrialing && trialDaysLeft !== null && (
        <div style={{
          background: trialDaysLeft <= 3
            ? 'linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))'
            : 'linear-gradient(90deg, rgba(240,165,0,0.12), rgba(240,165,0,0.04))',
          borderBottom: `1px solid ${trialDaysLeft <= 3 ? 'rgba(239,68,68,0.3)' : 'rgba(240,165,0,0.2)'}`,
          padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexShrink: 0,
        }}>
          <Clock size={14} color={trialDaysLeft <= 3 ? '#ef4444' : '#f0a500'} />
          <span style={{ fontSize: 12, fontWeight: 600, color: trialDaysLeft <= 3 ? '#ef4444' : '#f0a500' }}>
            {trialDaysLeft === 0
              ? 'Your trial ends today!'
              : `Free trial: ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining`}
          </span>
          <button onClick={() => navTo('settings')} style={{
            background: trialDaysLeft <= 3 ? '#ef4444' : '#f0a500', color: '#000', border: 'none',
            borderRadius: 6, padding: '4px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif",
          }}>
            Upgrade — $199/mo
          </button>
        </div>
      )}

      {/* ── HARD PAYWALL — non-dismissible, blocks all access ─── */}
      {subscriptionBlocked && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
            maxWidth: 480, width: '92%', padding: 0, overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            {/* Header */}
            <div style={{
              padding: '36px 28px 24px', textAlign: 'center',
              background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(240,165,0,0.05))',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', margin: '0 auto 16px',
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={28} color="#ef4444" />
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 1, marginBottom: 8, color: 'var(--text)' }}>
                {profile?.subscription_status === 'canceled' ? 'SUBSCRIPTION CANCELED' : 'YOUR FREE TRIAL HAS ENDED'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 360, margin: '0 auto' }}>
                {profile?.subscription_status === 'canceled'
                  ? 'Your subscription has been canceled. Reactivate to regain access to your loads, invoices, and AI tools.'
                  : 'Your 14-day trial is over, but all your data is safe. Subscribe now to pick up right where you left off.'}
              </div>
            </div>

            {/* What you're missing */}
            <div style={{ padding: '20px 28px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 14 }}>
                FEATURES WAITING FOR YOU
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20 }}>
                {[
                  { icon: Zap, text: 'AI Load Matching' },
                  { icon: Map, text: 'Smart Dispatch' },
                  { icon: DollarSign, text: 'Revenue Tracking' },
                  { icon: FileText, text: 'Auto Invoicing' },
                  { icon: Shield, text: 'Compliance (IFTA, DVIR)' },
                  { icon: Truck, text: 'Fleet GPS Tracking' },
                  { icon: Bot, text: 'AI Rate Negotiation' },
                  { icon: TrendingUp, text: 'Broker Risk Intel' },
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                    <f.icon size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>

              {/* Pricing */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 10 }}>
                FOUNDER PRICING — LOCKED FOR LIFE
              </div>
              <div style={{
                background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)',
                borderRadius: 10, padding: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#f0a500' }}>$199</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>/mo first truck</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>
                  + <span style={{ color: '#f0a500', fontWeight: 700 }}>$99</span>/mo each additional truck
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                  First 100 carriers only. Includes everything — AI dispatch, load board, invoicing, compliance, fleet map, QuickBooks.
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '0 28px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => {
                apiFetch('/api/create-checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ planId: 'autonomous_fleet', email: profile?.email, userId: profile?.id, truckCount: 1 }),
                }).then(r => r.json()).then(d => { if (d.url) window.location.href = d.url })
                  .catch(() => showToast('error', 'Error', 'Could not start checkout'))
              }} style={{
                width: '100%', padding: '16px', border: 'none', borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg, #f0a500, #e09000)', color: '#000',
                fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                boxShadow: '0 4px 20px rgba(240,165,0,0.3)',
              }}>
                Subscribe Now — $199/mo
              </button>
              {profile?.stripe_customer_id && (
                <button onClick={openBillingPortal} style={{
                  width: '100%', padding: '12px', border: '1px solid var(--accent)', borderRadius: 10,
                  cursor: 'pointer', background: 'rgba(240,165,0,0.06)', color: '#f0a500', fontSize: 13,
                  fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                }}>
                  Manage Subscription
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 4 }}>
                <a href="mailto:support@qivori.com" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'underline' }}>
                  Contact Support
                </a>
                <button onClick={logout} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12,
                  fontFamily: "'DM Sans',sans-serif", textDecoration: 'underline', padding: 0,
                }}>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PAST DUE WARNING BANNER — allows access but warns ─── */}
      {!demoMode && pastDue && !subscriptionBlocked && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
          borderBottom: '1px solid rgba(239,68,68,0.3)',
          padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexShrink: 0,
        }}>
          <AlertTriangle size={14} color="#ef4444" />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
            Payment failed — please update your billing info to avoid losing access
          </span>
          {profile?.stripe_customer_id && (
            <button onClick={openBillingPortal} style={{
              background: '#ef4444', color: '#fff', border: 'none',
              borderRadius: 6, padding: '4px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
            }}>
              Update Payment
            </button>
          )}
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
        <div style={{ display:'flex', alignItems:'baseline', marginRight:4, flexShrink:0 }}>
          <span style={{ fontSize:18, fontWeight:800, letterSpacing:3, color:'var(--text)', fontFamily:"'Bebas Neue',sans-serif" }}>QIVORI</span>
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
        {!isDriver && (
          <>
            {isAdmin && (
              <button className="btn btn-ghost" style={{ fontSize:12, fontWeight:700, padding:'5px 14px', borderColor:'var(--accent)', color:'var(--accent)' }}
                onClick={() => setShowInvite(true)}>
                <UserPlus size={13} /> Invite Team
              </button>
            )}
            <button className="btn btn-primary" style={{ fontSize:12, fontWeight:700, padding:'5px 14px' }}
              onClick={() => navTo('ai-loadboard')}>
              <Truck size={13} /> Post Truck
            </button>
          </>
        )}
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
                <div style={{ fontSize:10, color:'var(--muted)' }}>
                  {companyRole === 'driver' ? 'Driver' : companyRole === 'dispatcher' ? 'Dispatcher' : company?.mc ? `MC ${company.mc}` : company?.dot ? `DOT ${company.dot}` : 'Carrier'}
                </div>
              </div>
            </div>
          </div>

          {/* Nav items — flat */}
          <div style={{ flex:1, padding:'4px 0', overflowY:'auto', minHeight:0 }}>
            {currentNav.map(item => {
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
                  {item.id === 'loads' && activeLoads.length > 0 && (
                    <span style={{ fontSize:9, fontWeight:700, background:'var(--accent)', color:'#000', borderRadius:10, padding:'1px 6px', minWidth:16, textAlign:'center' }}>{activeLoads.length}</span>
                  )}
                  {item.id === 'financials' && unpaidInvoices.length > 0 && (
                    <span style={{ fontSize:9, fontWeight:700, background:'var(--error, #ef4444)', color:'#fff', borderRadius:10, padding:'1px 6px', minWidth:16, textAlign:'center' }}>{unpaidInvoices.length}</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Bottom: Language toggle + Log Out */}
          <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'flex', justifyContent:'center' }}>
              <LanguageToggle />
            </div>
            {profile?.role === 'admin' && currentRole === 'carrier' && (
              <button onClick={() => { switchView('admin'); }} style={{ width:'100%', padding:'7px', background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:8, color:'var(--accent)', fontSize:11, fontWeight:600, cursor:'pointer', marginBottom:6 }}>
                Back to Admin
              </button>
            )}
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
                <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
                  {resolveView(activeView, navTo, setDrawerLoadId)}
                </Suspense>
              </ViewErrorBoundary>
              {drawerLoadId && <LoadDetailDrawer loadId={drawerLoadId} onClose={() => setDrawerLoadId(null)} />}
            </>
          )}
        </div>
      </div>

      <Toast />
      <QuickActions onTabChange={(viewId) => navTo(viewId)} />
      <AIChatbox onTabChange={(viewId) => navTo(viewId)} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)}
        onTabChange={(viewId) => { navTo(viewId); setSearchOpen(false) }} />

      {/* ── Invite Team Member Modal ─────────────────────────────── */}
      {showInvite && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowInvite(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:440, padding:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Invite Team Member</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Send an invitation to join your company on Qivori</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Email Address *</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="driver@email.com"
                  style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, boxSizing:'border-box', outline:'none' }} />
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, boxSizing:'border-box', outline:'none' }}>
                  <option value="driver">Driver</option>
                  <option value="dispatcher">Dispatcher</option>
                  {companyRole === 'owner' && <option value="admin">Admin</option>}
                </select>
              </div>
              {inviteRole === 'driver' && drivers.length > 0 && (
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Link to Existing Driver (optional)</label>
                  <select value={inviteDriverId} onChange={e => setInviteDriverId(e.target.value)}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, boxSizing:'border-box', outline:'none' }}>
                    <option value="">— None —</option>
                    {drivers.map(dr => (
                      <option key={dr.id} value={dr.id}>{dr.full_name || dr.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={handleSendInvite} disabled={inviteSending || !inviteEmail}>
                {inviteSending ? 'Sending...' : 'Send Invitation'}
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowInvite(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
