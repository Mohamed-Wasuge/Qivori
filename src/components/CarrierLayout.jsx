import React, { useState, useCallback, useEffect, useRef, useMemo, Component, lazy, Suspense } from 'react'
import * as Sentry from '@sentry/react'
import {
  Monitor, Layers, Receipt, Truck, Shield, Users, Briefcase, Settings as SettingsIcon,
  Search, Bell, Moon, Eye, Zap, Wrench, CreditCard, BarChart2, AlertTriangle,
  TrendingUp, TrendingDown, ChevronLeft, ClipboardList, CheckCircle, Map, DollarSign, Droplets, FileCheck, Star, UserPlus,
  User, Building2, Plug, Palette, Scale, Package, MapPin, Smartphone, FileText, AlertCircle, Fuel,
  Clock, Plus, CloudSun, Activity, Radio, ArrowUpRight, ArrowDownRight, Bot, Sun, Sunrise, Globe, RefreshCw, Link2, Target, Route
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useSubscription } from '../hooks/useSubscription'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import { generateInvoicePDF } from '../utils/generatePDF'
import Toast from './Toast'
import { apiFetch } from '../lib/api'
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

// HR
const DQFileManager = lazyN(() => import('../pages/carrier/HR'), 'DQFileManager')
const ExpiryAlerts = lazyN(() => import('../pages/carrier/HR'), 'ExpiryAlerts')
const DrugAlcoholCompliance = lazyN(() => import('../pages/carrier/HR'), 'DrugAlcoholCompliance')
const IncidentTracker = lazyN(() => import('../pages/carrier/HR'), 'IncidentTracker')
const PayrollTracker = lazyN(() => import('../pages/carrier/HR'), 'PayrollTracker')
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
  { id:'ai-dashboard', icon: Bot,          label:'AI Control Center' },
  { id:'settings',     icon: SettingsIcon, label:'Settings',       i18nKey:'nav.settings'     },
]

// ── Simplified nav for driver-role users ─────────────────────────────────────
const DRIVER_NAV = [
  { id:'loads',        icon: Package,      label:'My Loads',       i18nKey:'nav.loads'        },
  { id:'financials',   icon: DollarSign,   label:'Expenses',       i18nKey:'nav.financials'   },
  { id:'_divider' },
  { id:'settings',     icon: SettingsIcon, label:'Settings',       i18nKey:'nav.settings'     },
]

// ── Drivers Hub ──
function DriversHub() {
  const [tab, setTab] = useState('profiles')
  const { drivers, loads, activeLoads, fuelCostPerMile } = useCarrier()
  const TABS = [
    { id:'profiles', label:'Profiles' },{ id:'settlement', label:'Settlement' },{ id:'scorecards', label:'Scorecards' },{ id:'pay-reports', label:'Pay Reports' },{ id:'onboarding', label:'Onboarding' },
    { id:'dq-files', label:'DQ Files' },{ id:'expiry-alerts', label:'Expiry Alerts' },{ id:'drug-alcohol', label:'Drug & Alcohol' },{ id:'incidents', label:'Incidents' },{ id:'payroll', label:'1099 / Payroll' },{ id:'driver-portal', label:'Driver Portal' },
  ]
  // Q driver stats
  const idleCount = drivers.filter(d => {
    const name = d.full_name || d.name
    return !activeLoads.some(l => l.driver === name)
  }).length
  const unassignedLoads = loads.filter(l => !l.driver && ['Rate Con Received','Booked'].includes(l.status)).length
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      {/* Q Driver Intelligence Header */}
      <div style={{ flexShrink:0, padding:'10px 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--success)', boxShadow:'0 0 6px var(--success)', animation:'q-driver-pulse 2s ease-in-out infinite' }} />
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:2, color:'var(--text)' }}>Q <span style={{ color:'var(--accent)' }}>DRIVER INTELLIGENCE</span></span>
          <span style={{ fontSize:9, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace", marginLeft:4 }}>{drivers.length} driver{drivers.length!==1?'s':''} tracked</span>
        </div>
        {(idleCount > 0 || unassignedLoads > 0) && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 12px', background:'rgba(240,165,0,0.06)', borderRadius:8, border:'1px solid rgba(240,165,0,0.15)' }}>
            <div style={{ width:4, height:4, borderRadius:'50%', background:'var(--accent)' }} />
            <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>
              {idleCount > 0 && `${idleCount} idle`}{idleCount > 0 && unassignedLoads > 0 && ' · '}{unassignedLoads > 0 && `${unassignedLoads} unassigned load${unassignedLoads!==1?'s':''}`}
              {idleCount > 0 && unassignedLoads > 0 ? ' — assign now' : ''}
            </span>
          </div>
        )}
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
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
        </Suspense>
      </div>
      <style>{`@keyframes q-driver-pulse { 0%,100%{opacity:1;box-shadow:0 0 4px var(--success)} 50%{opacity:0.4;box-shadow:0 0 10px var(--success)} }`}</style>
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
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
          {tab === 'overview' && <FleetManager />}
          {tab === 'map' && <FleetMap />}
          {tab === 'fuel' && <FuelOptimizer />}
          {tab === 'equipment' && <EquipmentManager />}
        </Suspense>
      </div>
    </div>
  )
}

// ── Financials Hub ──
function FinancialsHub() {
  const [tab, setTab] = useState('invoices')
  const { loads, invoices, expenses, totalRevenue, totalExpenses, drivers: ctxDrivers, fuelCostPerMile } = useCarrier()
  const TABS = [{ id:'invoices', label:'Invoices' },{ id:'pl', label:'P&L' },{ id:'profit-iq', label:'Profit IQ' },{ id:'receivables', label:'Receivables' },{ id:'cash-flow', label:'Cash Flow' },{ id:'expenses', label:'Expenses' },{ id:'factoring', label:'Factoring' },{ id:'quickbooks', label:'QuickBooks' }]

  // Q Profit Engine stats
  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0
  const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid')
  const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const truckCount = Math.max((ctxDrivers || []).length, 1)
  const profitPerTruck = Math.round(netProfit / truckCount)
  const marginColor = margin >= 30 ? 'var(--success)' : margin >= 20 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      {/* Q Profit Engine Header */}
      <div style={{ flexShrink:0, padding:'10px 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--success)', boxShadow:'0 0 6px var(--success)', animation:'q-profit-pulse 2s ease-in-out infinite' }} />
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:2, color:'var(--text)' }}>Q <span style={{ color:'var(--accent)' }}>PROFIT ENGINE</span></span>
          <span style={{ fontSize:9, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace", marginLeft:4 }}>
            ${totalRevenue.toLocaleString()} rev · {margin.toFixed(1)}% margin · ${profitPerTruck.toLocaleString()}/truck
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Live margin indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', background: marginColor + '12', borderRadius:8, border:`1px solid ${marginColor}30` }}>
            <div style={{ width:4, height:4, borderRadius:'50%', background: marginColor }} />
            <span style={{ fontSize:10, fontWeight:700, color: marginColor }}>
              {margin >= 30 ? 'HEALTHY' : margin >= 20 ? 'WATCH' : 'BELOW TARGET'} · {margin.toFixed(1)}%
            </span>
          </div>
          {unpaidTotal > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', background:'rgba(240,165,0,0.06)', borderRadius:8, border:'1px solid rgba(240,165,0,0.15)' }}>
              <div style={{ width:4, height:4, borderRadius:'50%', background:'var(--accent)' }} />
              <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>
                ${unpaidTotal.toLocaleString()} unpaid · {unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
          {tab === 'invoices' && <InvoicesHub />}
          {tab === 'pl' && <PLDashboard />}
          {tab === 'profit-iq' && <ProfitIQTab />}
          {tab === 'receivables' && <ReceivablesAging />}
          {tab === 'cash-flow' && <CashFlowForecaster />}
          {tab === 'expenses' && <ExpenseTracker />}
          {tab === 'factoring' && <FactoringCashflow />}
          {tab === 'quickbooks' && <QuickBooksExport />}
        </Suspense>
      </div>
      <style>{`@keyframes q-profit-pulse { 0%,100%{opacity:1;box-shadow:0 0 4px var(--success)} 50%{opacity:0.4;box-shadow:0 0 10px var(--success)} }`}</style>
    </div>
  )
}

// ── Compliance Hub ──
function ComplianceHub() {
  const [tab, setTab] = useState('audit')
  const TABS = [{ id:'audit', label:'Audit Today' },{ id:'center', label:'Compliance Center' },{ id:'ifta', label:'IFTA & DOT' },{ id:'broker-risk', label:'Broker Risk' },{ id:'clearinghouse', label:'Drug & Alcohol' }]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
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
export function InsuranceHub() {
  const { company, vehicles, drivers } = useCarrier()
  const { showToast } = useApp()
  const [quoteForm, setQuoteForm] = useState({ name: company?.name || '', mc: company?.mc_number || company?.mc || '', dot: company?.dot_number || company?.dot || '', phone: company?.phone || '', email: company?.email || '', trucks: String(vehicles?.length || drivers?.length || 1), equipment: 'Dry Van', currentInsurer: '', expiryDate: '', coverageNeeded: 'auto-liability' })
  const [submitted, setSubmitted] = useState(false)
  const [policies, setPolicies] = useState([
    { type: 'Auto Liability', required: true, minCoverage: '$1,000,000', status: company?.insurance_policy ? 'active' : 'none', provider: company?.insurance_provider || '', expiry: company?.insurance_expiry || '' },
    { type: 'Cargo Insurance', required: true, minCoverage: '$100,000', status: 'none', provider: '', expiry: '' },
    { type: 'General Liability', required: false, minCoverage: '$1,000,000', status: 'none', provider: '', expiry: '' },
    { type: 'Physical Damage', required: false, minCoverage: 'Truck value', status: 'none', provider: '', expiry: '' },
    { type: 'Bobtail Insurance', required: false, minCoverage: '$1,000,000', status: 'none', provider: '', expiry: '' },
    { type: 'Occupational Accident', required: false, minCoverage: '$500,000', status: 'none', provider: '', expiry: '' },
  ])

  const coverageTypes = ['auto-liability','cargo','general-liability','physical-damage','bobtail','occupational-accident','full-package']

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await apiFetch('/api/insurance-quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quoteForm) })
    } catch { /* endpoint may not exist yet — that's ok */ }
    setSubmitted(true)
    showToast('success', 'Quote Requested', 'We\'ll connect you with insurance partners shortly')
  }

  const pan = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }
  const FieldRow = ({ label, value, onChange, type = 'text', placeholder = '' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none' }} />
    </div>
  )

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, marginBottom: 4 }}>
          INSURANCE <span style={{ color: 'var(--accent)' }}>MARKETPLACE</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Compare quotes from top trucking insurers. Your company data is pre-filled — just submit and we'll connect you with partners.
        </div>
      </div>

      {/* Current Coverage Status */}
      <div style={pan}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic icon={Shield} size={13} color="var(--accent)" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>COVERAGE STATUS</span>
        </div>
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {policies.map(p => {
            const isActive = p.status === 'active'
            const isExpiring = p.expiry && new Date(p.expiry) < new Date(Date.now() + 30 * 86400000)
            return (
              <div key={p.type} style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: `1px solid ${isActive ? (isExpiring ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.2)') : 'var(--border)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.type}
                    {p.required && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', padding: '1px 5px', borderRadius: 3 }}>REQUIRED</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    Min: {p.minCoverage} {p.provider && `· ${p.provider}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isActive ? (
                    <>
                      {isExpiring && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)' }}>Expiring soon</span>}
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isExpiring ? 'var(--warning)' : 'var(--success)', boxShadow: `0 0 6px ${isExpiring ? 'var(--warning)' : 'var(--success)'}` }} />
                    </>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 4 }}>Not covered</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Get Quotes */}
      <div style={pan}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic icon={FileText} size={13} color="var(--accent)" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>GET QUOTES</span>
        </div>
        {submitted ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Ic icon={CheckCircle} size={24} color="var(--success)" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Quote Request Submitted</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
              Our insurance partners will review your information and reach out within 1-2 business days with competitive quotes.
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 16, fontSize: 11 }} onClick={() => setSubmitted(false)}>Submit Another Request</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldRow label="Company Name" value={quoteForm.name} onChange={v => setQuoteForm(f => ({ ...f, name: v }))} />
              <FieldRow label="MC Number" value={quoteForm.mc} onChange={v => setQuoteForm(f => ({ ...f, mc: v }))} />
              <FieldRow label="DOT Number" value={quoteForm.dot} onChange={v => setQuoteForm(f => ({ ...f, dot: v }))} />
              <FieldRow label="Number of Trucks" value={quoteForm.trucks} onChange={v => setQuoteForm(f => ({ ...f, trucks: v }))} type="number" />
              <FieldRow label="Phone" value={quoteForm.phone} onChange={v => setQuoteForm(f => ({ ...f, phone: v }))} />
              <FieldRow label="Email" value={quoteForm.email} onChange={v => setQuoteForm(f => ({ ...f, email: v }))} type="email" />
              <FieldRow label="Current Insurer" value={quoteForm.currentInsurer} onChange={v => setQuoteForm(f => ({ ...f, currentInsurer: v }))} placeholder="e.g. Progressive, National Interstate" />
              <FieldRow label="Policy Expiry Date" value={quoteForm.expiryDate} onChange={v => setQuoteForm(f => ({ ...f, expiryDate: v }))} type="date" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Equipment Type</label>
              <select value={quoteForm.equipment} onChange={e => setQuoteForm(f => ({ ...f, equipment: e.target.value }))}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none' }}>
                {['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Hotshot', 'Box Truck', 'Tanker', 'Car Hauler'].map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Coverage Needed</label>
              <select value={quoteForm.coverageNeeded} onChange={e => setQuoteForm(f => ({ ...f, coverageNeeded: e.target.value }))}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none' }}>
                <option value="auto-liability">Auto Liability ($1M)</option>
                <option value="cargo">Cargo Insurance ($100K)</option>
                <option value="general-liability">General Liability</option>
                <option value="physical-damage">Physical Damage</option>
                <option value="bobtail">Bobtail / Non-Trucking</option>
                <option value="occupational-accident">Occupational Accident</option>
                <option value="full-package">Full Package (All Coverage)</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 13, fontWeight: 800, width: 'fit-content' }}>
              Get Insurance Quotes
            </button>
          </form>
        )}
      </div>

      {/* Partner Insurers */}
      <div style={pan}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic icon={Star} size={13} color="var(--accent)" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>INSURANCE PARTNERS</span>
        </div>
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { name: 'Cover Whale', desc: 'AI-powered commercial trucking insurance', tag: 'Recommended' },
            { name: 'Progressive Commercial', desc: 'Largest commercial auto insurer in the US', tag: '' },
            { name: 'National Interstate', desc: 'Specializes in small fleets & owner-operators', tag: '' },
            { name: 'Reliance Partners', desc: 'Trucking-only insurance brokerage', tag: '' },
            { name: 'Canal Insurance', desc: 'Owner-operator focused coverage', tag: '' },
          ].map(p => (
            <div key={p.name} style={{ padding: '14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                {p.tag && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--accent)', background: 'rgba(240,165,0,0.1)', padding: '2px 6px', borderRadius: 3 }}>{p.tag}</span>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{p.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
            Qivori partners with leading trucking insurers to get you the best rates. Your data is only shared with insurers you approve.
          </div>
        </div>
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
    case 'ai-dashboard': return <AIDispatchDashboard />
    case 'analytics':   return <AnalyticsDashboard />
    case 'load-board':  return <AILoadBoard />
    case 'rate-check':  return <RateNegotiation />
    case 'referrals':   return <ReferralProgram />
    default:            return <OverviewTab onTabChange={(viewId) => navTo(viewId)} />
  }
}

function CarrierLayoutInner() {
  const { logout, showToast, theme, setTheme, profile, demoMode, goToLogin, isDriver, isAdmin, companyRole, switchView, currentRole } = useApp()
  const { activeLoads, unpaidInvoices, company, loads, drivers } = useCarrier()
  const { t } = useTranslation()
  const { isTrialing, trialDaysLeft, isActive, isPaid } = useSubscription()

  // Trial expired = had a trial that ended and never paid
  const trialExpired = !demoMode && !isActive && profile?.subscription_status && profile.subscription_status !== 'active' && profile.subscription_status !== 'trialing'
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('driver')
  const [inviteDriverId, setInviteDriverId] = useState('')
  const [inviteSending, setInviteSending] = useState(false)

  // Choose nav based on company role
  const currentNav = isDriver ? DRIVER_NAV : NAV

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

  // Check if user needs onboarding
  const isNewUser = !localStorage.getItem('qv_onboarded') && !company?.name && loads.length === 0
  const [showOnboarding, setShowOnboarding] = useState(isNewUser)

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

  const sStyle = { fontFamily:"'DM Sans',sans-serif", width:'100%', height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' }
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

      {/* Trial expired overlay */}
      {trialExpired && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
            maxWidth: 440, width: '90%', padding: 0, overflow: 'hidden',
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              padding: '32px 24px 20px', textAlign: 'center',
              background: 'linear-gradient(135deg, rgba(240,165,0,0.1), rgba(240,165,0,0.02))',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={24} color="#ef4444" />
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 1, marginBottom: 6 }}>
                YOUR FREE TRIAL HAS ENDED
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                Your 14-day trial is over, but all your data is safe. Upgrade to pick up right where you left off.
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 12 }}>
                FOUNDER PRICING — LOCKED FOR LIFE
              </div>
              <div style={{
                background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)',
                borderRadius: 10, padding: 14, marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: '#f0a500' }}>$199</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>/mo first truck</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>
                  + <span style={{ color: '#f0a500', fontWeight: 700 }}>$79</span>/mo each additional truck
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                  Everything included. AI dispatch, load board, invoicing, compliance, fleet map, QuickBooks.
                </div>
              </div>
            </div>

            <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => {
                import('../lib/api').then(({ apiFetch }) => {
                  apiFetch('/api/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planId: 'autonomous_fleet', email: profile?.email, userId: profile?.id, truckCount: 1 }),
                  }).then(r => r.json()).then(d => { if (d.url) window.location.href = d.url })
                    .catch(() => showToast('error', 'Error', 'Could not start checkout'))
                })
              }} style={{
                width: '100%', padding: '14px', border: 'none', borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg, #f0a500, #e09000)', color: '#000',
                fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                boxShadow: '0 4px 16px rgba(240,165,0,0.25)',
              }}>
                Upgrade Now — $199/mo
              </button>
              <button onClick={logout} style={{
                width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: 10,
                cursor: 'pointer', background: 'transparent', color: 'var(--muted)', fontSize: 12,
                fontFamily: "'DM Sans',sans-serif",
              }}>
                Sign Out
              </button>
            </div>
          </div>
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
