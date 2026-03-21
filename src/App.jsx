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

// BrokerPages group (heavy â now lazy-loaded as a chunk)
const BrokerDashboard = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerDashboard')
const BrokerPostLoad = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerPostLoad')
const BrokerLoads = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerLoads')
const BrokerCarriers = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerCarriers')
const BrokerPayments = lazyNamed(() => import('./pages/BrokerPages'), 'BrokerPayments')

// CarrierPages group (heaviest â 902KB, now lazy-loaded as a chunk)
const CarrierDashboard = lazyNamed(() => import('./pages/CarrierPages'), 'CarrierDashboard')
const SmartDispatch = lazyNamed(() => import('./pages/CarrierPages'), 'SmartDispatch')
const RevenueIntel = lazyNamed(() => import('./pages/CarrierPages'), 'RevenueIntel')
const CarrierFleet = lazyNamed(() => import('./pages/CarrierPages'), 'CarrierFleet')
const LaneIntel = lazyNamed(() => import('./pages/CarrierPages'), 'LaneIntel')
const FuelOptimizer = lazyNamed(() => import('./pages/CarrierPages'), 'FuelOptimizer')
const BrokerRiskIntel = lazyNamed(() => import('./pages/CarrierPages'), 'BrokerRiskIntel')
const CarrierELD = lazyNamed(() => import('./pages/CarrierPages'), 'CarrierELD')
const CarrierIFTA = lazyNamed(() => import('./pages/CarrierPages'), 'CarrierIFTA')
const CarrierDVIR = lazyNamed(() => import('./pages/CarrierPages'), 'CarrierDVIR')
const CarrierCSA = lazyNamed(() => import('./pages/CarrierPages'), 'CarrierCSA')
const CarrierClearinghouse = lazyNamed(() => import('./pages/CarrierPages'), 'CarrierClearinghouse')

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
  activity: ActivityLog,
  'ai-agent': MasterAgent,
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
  <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
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
  const [guidePage, setGuidePage] = useState(null) // 'ifta' | 'start-trucking' | 'rate-negotiation' | 'trucking-expenses' | null

  const GUIDE_ROUTES = {
    '#/guides/ifta': 'ifta',
    '#/guides/start-trucking': 'start-trucking',
    '#/guides/rate-negotiation': 'rate-negotiation',
    '#/guides/trucking-expenses': 'trucking-expenses',
  }

  // Handle hash-based routing for legal pages, public load board, guides, and 404
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash
      if (hash === '#/terms') { setLegalPage('terms'); setPublicLoadBoard(false); setGuidePage(null) }
      else if (hash === '#/privacy') { setLegalPage('privacy'); setPublicLoadBoard(false); setGuidePage(null) }
      else if (hash === '#/loads') { setPublicLoadBoard(true); setLegalPage(null); setGuidePage(null) }
      else if (GUIDE_ROUTES[hash]) { setGuidePage(GUIDE_ROUTES[hash]); setLegalPage(null); setPublicLoadBoard(false) }
      else { setLegalPage(null); setPublicLoadBoard(false); setGuidePage(null) }
    }
    handleHash()
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  const closeLegal = () => { setLegalPage(null); window.location.hash = '' }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        {/* Legal Pages overlay */}
        {legalPage === 'terms' && <TermsPage onBack={closeLegal} />}
        {legalPage === 'privacy' && <PrivacyPage onBack={closeLegal} />}

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

        {/* Landing Page */}
        {view === 'landing' && !publicLoadBoard && !guidePage && <LandingPage onGetStarted={goToLogin} />}

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
        <div style={{ width:'100vw', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0c0f15', color:'#c8d0dc', fontFamily:"'DM Sans',sans-serif" }}>
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
