import { lazy, Suspense, useState, useEffect, Component } from 'react'
import * as Sentry from '@sentry/react'
import { AppProvider, useApp } from './context/AppContext'
import { LanguageProvider } from './lib/i18n'
import Toast from './components/Toast'

// Helper: create a lazy component from a named export
const lazyNamed = (importFn, name) => lazy(() => importFn().then(m => ({ default: m[name] })))

// Lazy-load ALL page-level components for code splitting
const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const PublicLoadBoard = lazy(() => import('./pages/PublicLoadBoard'))
const TermsPage = lazyNamed(() => import('./pages/LegalPages'), 'TermsPage')
const PrivacyPage = lazyNamed(() => import('./pages/LegalPages'), 'PrivacyPage')
const DriverOnboarding = lazy(() => import('./pages/DriverOnboarding'))
const CarrierPublicPage = lazy(() => import('./pages/CarrierPublicPage'))
const LoadTrackingPage = lazyNamed(() => import('./pages/ExtraPages'), 'LoadTrackingPage')
const SignContract = lazy(() => import('./pages/SignContract'))

// Blog / SEO guide pages (lazy-loaded)
const IFTAGuidePage = lazyNamed(() => import('./pages/BlogPages'), 'IFTAGuidePage')
const StartTruckingPage = lazyNamed(() => import('./pages/BlogPages'), 'StartTruckingPage')
const RateNegotiationPage = lazyNamed(() => import('./pages/BlogPages'), 'RateNegotiationPage')
const TruckingExpensesPage = lazyNamed(() => import('./pages/BlogPages'), 'TruckingExpensesPage')

// Lazy-load heavy role-specific layouts
const CarrierLayout = lazy(() => import('./components/CarrierLayout'))
const MobileLayout = lazy(() => import('./components/MobileLayout'))

// Lazy-load sidebar/topbar (only needed when authenticated)
const Sidebar = lazy(() => import('./components/Sidebar'))
const Topbar = lazy(() => import('./components/Topbar'))

// Admin core pages â small, lazy-loaded individually
const Dashboard = lazy(() => import('./pages/Dashboard'))
const LoadBoard = lazy(() => import('./pages/LoadBoard'))
const Carriers = lazy(() => import('./pages/Carriers'))

// MorePages group
const Shippers = lazyNamed(() => import('./pages/MorePages'), 'Shippers')
const Documents = lazyNamed(() => import('./pages/MorePages'), 'Documents')

// ExtraPages group
const Settings = lazyNamed(() => import('./pages/ExtraPages'), 'Settings')

// AdminPages group (heavy â now lazy-loaded as a chunk)
const WaitlistManager = lazyNamed(() => import('./pages/AdminPages'), 'WaitlistManager')
const Analytics = lazyNamed(() => import('./pages/AdminPages'), 'Analytics')
const ActivityLog = lazyNamed(() => import('./pages/AdminPages'), 'ActivityLog')
const MasterAgent = lazyNamed(() => import('./pages/AdminPages'), 'MasterAgent')
const RevenueDashboard = lazyNamed(() => import('./pages/AdminPages'), 'RevenueDashboard')
const DemoRequests = lazyNamed(() => import('./pages/AdminPages'), 'DemoRequests')
const AdminEmail = lazyNamed(() => import('./pages/AdminPages'), 'AdminEmail')
const UserManagement = lazyNamed(() => import('./pages/AdminPages'), 'UserManagement')
const PlatformIntelligence = lazyNamed(() => import('./pages/AdminPages'), 'PlatformIntelligence')
const EDIAccessManager = lazyNamed(() => import('./pages/AdminPages'), 'EDIAccessManager')

// BrokerPages group (heavy â now lazy-loaded as a chunk)
const BrokerDashboard = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerDashboard')
const BrokerPostLoad = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerPostLoad')
const BrokerLoads = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerLoads')
const BrokerCarriers = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerCarriers')
const BrokerPayments = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerPayments')

// CarrierPages group (heaviest â 902KB, now lazy-loaded as a chunk)
const CarrierDashboard = lazyNamed(() => import('./pages/CarrierPages'), 'CarrierDashboard')
const SmartDispatch = lazyNamed(() => import('./pages/carrier/LoadBoard'), 'SmartDispatch')
const LaneIntel = lazyNamed(() => import('./pages/carrier/LoadBoard'), 'LaneIntel')
const RevenueIntel = lazyNamed(() => import('./pages/carrier/Finance'), 'RevenueIntel')
const BrokerRiskIntel = lazyNamed(() => import('./pages/carrier/Finance'), 'BrokerRiskIntel')
const CarrierFleet = lazyNamed(() => import('./pages/carrier/Fleet'), 'CarrierFleet')
const FuelOptimizer = lazyNamed(() => import('./pages/carrier/Fleet'), 'FuelOptimizer')
const CarrierELD = lazyNamed(() => import('./pages/carrier/Compliance'), 'CarrierELD')
const CarrierIFTA = lazyNamed(() => import('./pages/carrier/Compliance'), 'CarrierIFTA')
const CarrierDVIR = lazyNamed(() => import('./pages/carrier/Compliance'), 'CarrierDVIR')
const CarrierCSA = lazyNamed(() => import('./pages/carrier/Compliance'), 'CarrierCSA')
const CarrierClearinghouse = lazyNamed(() => import('./pages/carrier/Compliance'), 'CarrierClearinghouse')

const PAGES = {
  // Admin (Platform Management)
  dashboard: Dashboard,
  loadboard: LoadBoard,
  carriers: Carriers,
  brokers: Shippers,       // Shippers component now renders Broker management
  payments: RevenueDashboard, // Admin Revenue Dashboard (MRR, ARR, churn, signups)
  support: Documents,      // Documents component now renders Support Tickets
  settings: Settings,
  waitlist: WaitlistManager,
  'demo-requests': DemoRequests,
  'admin-email': AdminEmail,
  analytics: Analytics,
  intelligence: PlatformIntelligence,
  'edi-admin': EDIAccessManager,
  activity: ActivityLog,
  'ai-agent': MasterAgent,
  'users': UserManagement,
  // Broker
  'broker-dashboard': BrokerDashboard,
  'broker-post': BrokerPostLoad,
  'broker-loads': BrokerLoads,
  'broker-carriers': BrokerCarriers,
  'broker-payments': BrokerPayments,
  // Carrier
  'carrier-dashboard':    CarrierDashboard,
  'carrier-dispatch':     SmartDispatch,
  'carrier-revenue':      RevenueIntel,
  'carrier-fleet':        CarrierFleet,
  'carrier-lanes':        LaneIntel,
  'carrier-fuel':         FuelOptimizer,
  'carrier-broker':       BrokerRiskIntel,
  'carrier-eld':          CarrierELD,
  'carrier-ifta':         CarrierIFTA,
  'carrier-dvir':         CarrierDVIR,
  'carrier-csa':          CarrierCSA,
  'carrier-clearinghouse':CarrierClearinghouse,
}

const LoadingFallback = () => (
  <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 3, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>QIVORI</span>
      </div>
      <div style={{ width: 40, height: 3, background: 'var(--surface2)', borderRadius: 2, margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ width: '50%', height: '100%', background: 'var(--accent)', borderRadius: 2, animation: 'lbar 1s ease-in-out infinite alternate' }} />
      </div>
      <style>{`@keyframes lbar { from { transform: translateX(-100%); } to { transform: translateX(100%); } }`}</style>
    </div>
  </div>
)

// Detect mobile (under 768px width or touch-primary device)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

function AppContent() {
  const { view, currentPage, currentRole, goToLogin } = useApp()
  const isMobile = useIsMobile()
  const [legalPage, setLegalPage] = useState(null) // 'terms' | 'privacy' | null
  const PageComponent = PAGES[currentPage] || Dashboard

  const [publicLoadBoard, setPublicLoadBoard] = useState(false)
  const [driverOnboarding, setDriverOnboarding] = useState(false)
  const [carrierSlug, setCarrierSlug] = useState(null) // carrier public page slug
  const [trackingToken, setTrackingToken] = useState(null) // public load tracking token
  const [contractToken, setContractToken] = useState(null) // public contract signing token
  const [guidePage, setGuidePage] = useState(null) // 'ifta' | 'start-trucking' | 'rate-negotiation' | 'trucking-expenses' | null

  const GUIDE_ROUTES = {
    '#/guides/ifta': 'ifta',
    '#/guides/start-trucking': 'start-trucking',
    '#/guides/rate-negotiation': 'rate-negotiation',
    '#/guides/trucking-expenses': 'trucking-expenses',
  }

  // Handle path-based routes for legal pages (Twilio reviewers visit /privacy, /terms directly)
  useEffect(() => {
    const path = window.location.pathname
    if (path === '/privacy' || path === '/terms') {
      setLegalPage(path === '/privacy' ? 'privacy' : 'terms')
    }
  }, [])

  // Handle query params for email links (email clients strip # fragments)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qView = params.get('view')
    const qToken = params.get('token')
    if (qView === 'onboard' && qToken) {
      window.location.hash = `#/onboard?token=${qToken}`
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    } else if (qView === 'invite' && qToken) {
      window.location.hash = `#/onboard?token=${qToken}`
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
  }, [])

  // Handle hash-based routing for legal pages, public load board, guides, and 404
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash
      const clear = () => { setLegalPage(null); setPublicLoadBoard(false); setGuidePage(null); setDriverOnboarding(false); setCarrierSlug(null); setTrackingToken(null); setContractToken(null) }
      if (hash === '#/terms') { clear(); setLegalPage('terms') }
      else if (hash === '#/privacy') { clear(); setLegalPage('privacy') }
      else if (hash === '#/loads') { clear(); setPublicLoadBoard(true) }
      else if (hash.startsWith('#/onboard')) { clear(); setDriverOnboarding(true) }
      else if (hash.startsWith('#/track')) {
        clear()
        // Support both #/track?token=xxx and legacy #/track/TOKEN
        if (hash.includes('?token=')) {
          const params = new URLSearchParams(hash.split('?')[1])
          setTrackingToken(params.get('token') || '')
        } else if (hash.startsWith('#/track/')) {
          setTrackingToken(hash.slice(8))
        }
      }
      else if (hash.startsWith('#/sign-contract')) {
        clear()
        const params = new URLSearchParams(hash.split('?')[1] || '')
        setContractToken(params.get('token') || '')
      }
      else if (hash.startsWith('#/c/')) { clear(); setCarrierSlug(hash.slice(4)) }
      else if (GUIDE_ROUTES[hash]) { clear(); setGuidePage(GUIDE_ROUTES[hash]) }
      else { clear() }
    }
    handleHash()
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  const closeLegal = () => {
    setLegalPage(null)
    // If accessed via /privacy or /terms path, navigate to home
    if (window.location.pathname === '/privacy' || window.location.pathname === '/terms') {
      window.history.replaceState({}, '', '/')
    } else {
      window.location.hash = ''
    }
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        {/* Legal Pages overlay */}
        {legalPage === 'terms' && <TermsPage onBack={closeLegal} />}
        {legalPage === 'privacy' && <PrivacyPage onBack={closeLegal} />}

        {/* Driver Onboarding (public, no auth required) */}
        {driverOnboarding && !legalPage && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10, overflow: 'auto' }}>
            <DriverOnboarding token={(() => { const h = window.location.hash; const m = h.match(/token=([^&]+)/); return m ? m[1] : null })()} />
          </div>
        )}

        {/* Public Load Board (no auth required) */}
        {publicLoadBoard && !legalPage && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10, overflow: 'auto' }}>
            <PublicLoadBoard
              onSignUp={() => { window.location.hash = ''; goToLogin() }}
              onLogin={() => { window.location.hash = ''; goToLogin() }}
            />
          </div>
        )}

        {/* Guide / Blog Pages */}
        {guidePage && !legalPage && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10, overflow: 'auto' }}>
            {guidePage === 'ifta' && <IFTAGuidePage />}
            {guidePage === 'start-trucking' && <StartTruckingPage />}
            {guidePage === 'rate-negotiation' && <RateNegotiationPage />}
            {guidePage === 'trucking-expenses' && <TruckingExpensesPage />}
          </div>
        )}

        {/* Public Load Tracking */}
        {trackingToken && !legalPage && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10, overflow: 'auto' }}>
            <LoadTrackingPage token={trackingToken} />
          </div>
        )}

        {/* Public Contract Signing */}
        {contractToken && !legalPage && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10, overflow: 'auto' }}>
            <SignContract token={contractToken} />
          </div>
        )}

        {/* Carrier Public Page */}
        {carrierSlug && !legalPage && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10, overflow: 'auto' }}>
            <CarrierPublicPage slug={carrierSlug} />
          </div>
        )}

        {/* Landing Page */}
        {view === 'landing' && !publicLoadBoard && !guidePage && !driverOnboarding && !carrierSlug && !trackingToken && <LandingPage onGetStarted={goToLogin} />}

        {/* Login View */}
        {view === 'login' && <LoginPage />}

        {/* Carrier â mobile gets AI chat, desktop gets full TMS */}
        {view === 'app' && currentRole === 'carrier' && (
          isMobile ? <MobileLayout /> : <CarrierLayout />
        )}

        {/* Admin / Broker â sidebar layout */}
        {view === 'app' && currentRole !== 'carrier' && (
          <div style={{
            display: 'flex', width: '100%', height: '100%',
            position: 'relative'
          }}>
            <Sidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Topbar />
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 40 }}>
                <Suspense fallback={<LoadingFallback />}>
                  <PageComponent key={currentPage} />
                </Suspense>
              </div>
            </div>
          </div>
        )}

        <Toast />

        <style>{`
          @media (max-width: 780px) {
            .mob-menu-btn { display: flex !important; }
            .search-wrap { display: none !important; }
            .tb-btn-ghost { display: none !important; }
            .sidebar { position: fixed !important; top: 0 !important; left: 0 !important; bottom: 0 !important; z-index: 250 !important; }
            .tb-btn { font-size: 10px !important; padding: 5px 10px !important; }
          }
        `}</style>
      </div>
    </Suspense>
  )
}

class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(err, info) {
    Sentry.captureException(err, { extra: { componentStack: info?.componentStack } })
    // Report to self-repair AI agent
    try {
      fetch('/api/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error_message: String(err),
          error_stack: err?.stack || '',
          component_stack: info?.componentStack || '',
          page: window.location.pathname + window.location.hash,
          user_agent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {})
    } catch (_) {}
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ width:'100%', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0c0f15', color:'#c8d0dc', fontFamily:"'DM Sans',sans-serif" }}>
          <div style={{ textAlign:'center', maxWidth:400, padding:32 }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'center', marginBottom:8 }}>
              <span style={{ fontSize:28, fontWeight:800, letterSpacing:3, color:'#c8d0dc', fontFamily:"'Bebas Neue',sans-serif" }}>QIVORI</span>
            </div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:16 }}>Something went wrong</div>
            <div style={{ fontSize:12, color:'#6b7590', background:'#131720', border:'1px solid #1e2330', borderRadius:8, padding:'10px 14px', fontFamily:'monospace', marginBottom:20, wordBreak:'break-word' }}>
              {String(this.state.error)}
            </div>
            <button onClick={() => { this.setState({ error: null }); window.location.reload() }}
              style={{ padding:'10px 24px', fontSize:13, fontWeight:700, background:'#f0a500', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <LanguageProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </LanguageProvider>
    </AppErrorBoundary>
  )
}
