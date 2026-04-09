import React, { useState, useCallback, useEffect, useRef, useMemo, Component, lazy, Suspense } from 'react'
import * as Sentry from '@sentry/react'
import {
  Monitor, Truck, Shield, Users, Settings as SettingsIcon,
  Search, Bell, Moon, Eye, Zap, CreditCard, BarChart2, AlertTriangle,
  TrendingUp, TrendingDown, ChevronLeft, CheckCircle, DollarSign, Star, UserPlus,
  User, Building2, Package, AlertCircle,
  Clock, Bot, Sun, Globe, RefreshCw, Sparkles, Radio, Activity
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useSubscription } from '../hooks/useSubscription'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import { generateInvoicePDF } from '../utils/generatePDF'
import Toast from './Toast'
import { apiFetch } from '../lib/api'
import * as db from '../lib/database'
import { useTranslation, LanguageToggle } from '../lib/i18n'

// Lazy-load remaining domain modules only used in resolveView
const lazyN = (importFn, name) => lazy(() => importFn().then(m => ({ default: m[name] })))
const AILoadBoard = lazyN(() => import('../pages/carrier/LoadBoard'), 'AILoadBoard')
const RateNegotiation = lazyN(() => import('../pages/carrier/LoadBoard'), 'RateNegotiation')
const AnalyticsDashboard = lazyN(() => import('../pages/carrier/Finance'), 'AnalyticsDashboard')
const ReferralProgram = lazyN(() => import('../pages/carrier/Settings'), 'ReferralProgram')
const EDIDashboard = lazyN(() => import('../pages/carrier/EDIDashboard'), 'EDIDashboard')

// ── Extracted component imports ──────────────────────────────────────────────
import { Ic } from './carrier/shared'
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
import { DriversHub, FleetHub, FinancialsHub, ComplianceHub, QOperationsHub, InsuranceHub } from './carrier/Hubs'

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
  { id:'q-ops',        icon: Activity,     label:'Q Operations' },
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

// Hub components extracted to ./carrier/Hubs.jsx

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
  const [referralStats, setReferralStats] = useState(null)

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

  // ── Onboarding wizard gate ──
  // Reactive: re-evaluates whenever `company` actually loads from CarrierContext.
  // Was previously a one-shot useState initial value, which fired before
  // CarrierContext had finished its Supabase fetch — so `company.name` was
  // empty on first mount and the wizard showed for users who already had a
  // real company row. Logging out + back in re-mounted the layout and
  // reproduced the bug on every login. Fixed 2026-04-09.
  //
  // Auto-marks the user "onboarded" the first time we see a real company —
  // so even if localStorage gets cleared (e.g. by signOut flow), the next
  // session won't show the wizard once company data arrives.
  const [showOnboarding, setShowOnboarding] = useState(false)
  useEffect(() => {
    if (isAdmin) { setShowOnboarding(false); return }
    const onboardedFlag = localStorage.getItem('qv_onboarded') === '1'
    const hasRealCompany = !!(company?.id || company?.name)
    const hasLoads = loads.length > 0

    // First sighting of a real company → mark them onboarded forever
    if (hasRealCompany && !onboardedFlag) {
      localStorage.setItem('qv_onboarded', '1')
    }

    // True new user: no flag, no company, no loads
    const isNewUser = !onboardedFlag && !hasRealCompany && !hasLoads
    // Existing user but profile incomplete (MC/DOT missing): show verification step
    const needsVerification = (onboardedFlag || hasRealCompany) && !demoMode && !company?.mc_number && !company?.dot_number

    setShowOnboarding(isNewUser || needsVerification)
  }, [company?.id, company?.name, company?.mc_number, company?.dot_number, loads.length, isAdmin, demoMode])

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

  // Fetch referral stats (fire once on mount, skip in demo mode)
  useEffect(() => {
    if (demoMode) return
    apiFetch('/api/referral-stats').then(r => r.json()).then(data => {
      if (data && !data.error) setReferralStats(data)
    }).catch(() => {})
  }, [demoMode])

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

    // Referral notifications — wired to /api/referral-stats data
    if (referralStats?.stats) {
      const { signups, rewardsEarned, pending } = referralStats.stats
      if (signups > 0) {
        n.push({ id: `referral-signups-${signups}`, icon: UserPlus, title: `${signups} Referral Signup${signups > 1 ? 's' : ''}`, desc: `${rewardsEarned} free month${rewardsEarned !== 1 ? 's' : ''} earned — ${referralStats.tier?.current?.label || 'Bronze'} tier`, color: 'var(--accent2)', view: 'referrals', type: 'referral', time: 360 })
      }
      if (pending > 0) {
        n.push({ id: `referral-pending-${pending}`, icon: Link2, title: `${pending} Pending Referral${pending > 1 ? 's' : ''}`, desc: 'Shared your link — waiting for signups', color: 'var(--muted)', view: 'referrals', type: 'referral', time: 720 })
      }
    }

    // Weekly summary available
    if (loads.length >= 3) n.push({ id: 'weekly-summary', icon: BarChart2, title: 'Weekly Summary Ready', desc: `${loads.length} loads, $${loads.reduce((s,l) => s + (l.gross || 0), 0).toLocaleString()} gross — view your analytics`, color: 'var(--accent2)', view: 'analytics', type: 'summary', time: 4320 })

    // Getting started prompts
    if (loads.length === 0) n.push({ id: 'get-started', icon: Package, title: 'Get Started', desc: 'Add your first load to begin dispatching', color: 'var(--accent)', view: 'loads', type: 'system', time: 5 })
    if (drivers.length === 0) n.push({ id: 'add-drivers', icon: Users, title: 'Add Drivers', desc: 'Add your drivers to assign loads', color: 'var(--accent2)', view: 'drivers', type: 'system', time: 10 })

    return n
  }, [loads, activeLoads, unpaidInvoices, drivers, referralStats])

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
        <div style={{ background:'linear-gradient(90deg, #f0a500, #e09000)', padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'center', gap:16, flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(0,0,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Sparkles size={13} color="#000" />
            </div>
            <span style={{ fontSize:13, fontWeight:700, color:'#000' }}>You're exploring demo mode</span>
          </div>
          <span style={{ fontSize:12, color:'rgba(0,0,0,0.7)' }}>14-day free trial, no credit card required</span>
          <button onClick={goToLogin} style={{ background:'#000', color:'#f0a500', border:'none', borderRadius:10, padding:'8px 24px', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", letterSpacing:'0.3px', boxShadow:'0 2px 8px rgba(0,0,0,0.3)', transition:'transform 0.15s' }}
            onMouseOver={e => e.currentTarget.style.transform='scale(1.05)'}
            onMouseOut={e => e.currentTarget.style.transform='scale(1)'}>
            Create Real Account
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
            {demoMode && (
              <button onClick={goToLogin} style={{ width:'100%', padding:'10px', background:'linear-gradient(135deg, #f0a500, #e09000)', border:'none', borderRadius:10, color:'#000', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:4, transition:'transform 0.15s, box-shadow 0.15s', boxShadow:'0 2px 8px rgba(240,165,0,0.3)' }}
                onMouseOver={e => { e.currentTarget.style.transform='scale(1.03)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(240,165,0,0.5)' }}
                onMouseOut={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.boxShadow='0 2px 8px rgba(240,165,0,0.3)' }}>
                Create Real Account
              </button>
            )}
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
