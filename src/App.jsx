import { lazy, Suspense, useState, useEffect, Component } from 'react'
import * as Sentry from '@sentry/react'
import { AppProvider, useApp } from './context/AppContext'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import { TermsPage, PrivacyPage } from './pages/LegalPages'
import Toast from './components/Toast'

// Lazy-load heavy role-specific layouts
const CarrierLayout = lazy(() => import('./components/CarrierLayout'))
const MobileLayout = lazy(() => import('./components/MobileLayout'))
const BrokerApp = lazy(() => import('./pages/BrokerPages').then(m => ({ default: m.BrokerApp || m.BrokerDashboard })))

// Admin pages (lighter)
import Dashboard from './pages/Dashboard'
import LoadBoard from './pages/LoadBoard'
import Carriers from './pages/Carriers'
import { Shippers, Payments, Documents } from './pages/MorePages'
import { Onboarding, AIEngine, Settings } from './pages/ExtraPages'
import { WaitlistManager, Analytics, ActivityLog, MasterAgent, RevenueDashboard, DemoRequests, AdminEmail } from './pages/AdminPages'
import { BrokerDashboard, BrokerPostLoad, BrokerLoads, BrokerCarriers, BrokerPayments } from './pages/BrokerPages'
import {
  CarrierDashboard, SmartDispatch, RevenueIntel,
  CarrierFleet, LaneIntel, FuelOptimizer, BrokerRiskIntel,
  CarrierELD, CarrierIFTA, CarrierDVIR, CarrierCSA, CarrierClearinghouse
} from './pages/CarrierPages'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'

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
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 4, marginBottom: 12 }}>
        QI<span style={{ color: 'var(--accent)' }}>VORI</span>
        <span style={{ fontSize: 12, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, marginLeft: 6 }}>AI</span>
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

  // Handle hash-based routing for legal pages and 404
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash
      if (hash === '#/terms') setLegalPage('terms')
      else if (hash === '#/privacy') setLegalPage('privacy')
      else setLegalPage(null)
    }
    handleHash()
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  const closeLegal = () => { setLegalPage(null); window.location.hash = '' }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      {/* Legal Pages overlay */}
      {legalPage === 'terms' && <TermsPage onBack={closeLegal} />}
      {legalPage === 'privacy' && <PrivacyPage onBack={closeLegal} />}

      {/* Landing Page */}
      {view === 'landing' && <LandingPage onGetStarted={goToLogin} />}

      {/* Login View */}
      {view === 'login' && <LoginPage />}

      {/* Carrier — mobile gets AI chat, desktop gets full TMS */}
      {view === 'app' && currentRole === 'carrier' && (
        <Suspense fallback={<LoadingFallback />}>
          {isMobile ? <MobileLayout /> : <CarrierLayout />}
        </Suspense>
      )}

      {/* Admin / Broker — sidebar layout */}
      {view === 'app' && currentRole !== 'carrier' && (
        <div style={{
          display: 'flex', width: '100%', height: '100%',
          position: 'relative'
        }}>
          <Sidebar />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Topbar />
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 40 }}>
              <PageComponent key={currentPage} />
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
  )
}

class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(err, info) { console.error('[Qivori] App crash:', err, info); Sentry.captureException(err, { extra: { componentStack: info?.componentStack } }) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ width:'100vw', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0c0f15', color:'#c8d0dc', fontFamily:"'DM Sans',sans-serif" }}>
          <div style={{ textAlign:'center', maxWidth:400, padding:32 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:4, marginBottom:8 }}>
              QI<span style={{ color:'#f0a500' }}>VORI</span>
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
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AppErrorBoundary>
  )
}
