import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { Bot, Map, TrendingUp, Fuel, BarChart2, FlaskConical, Landmark, CreditCard, ClipboardList, MapPin, Truck, FileText, Zap, CheckCircle, Frown, Satellite, DollarSign, Check, Mic, Send, Camera, Navigation, Volume2, ScanLine, ArrowRight, Star, Shield, Clock, Users, ChevronRight, Globe, Headphones } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

// Animate elements on scroll
function useOnScreen(ref) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.15 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [ref])
  return visible
}

function FadeIn({ children, delay = 0, style = {} }) {
  const ref = useRef(null)
  const visible = useOnScreen(ref)
  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transition: `all 0.6s ease ${delay}s`, ...style }}>
      {children}
    </div>
  )
}

const PAIN_SOLUTIONS = [
  { pain: 'Searching DAT for hours finding bad loads', fix: 'AI scores every load 0–100 — best loads surface instantly' },
  { pain: 'Switching between 6 different tools all day', fix: 'Everything in one platform — dispatch, fleet, accounting, compliance' },
  { pain: 'IFTA filing taking a full weekend every quarter', fix: 'Auto-calculated from your mileage — file in minutes' },
  { pain: 'Chasing brokers for payment for weeks', fix: 'Broker risk scores + one-click factoring for same-day cash' },
  { pain: 'Losing money on bad lanes without knowing it', fix: 'Lane Intelligence shows exactly which lanes make money' },
  { pain: 'Fuel costs eating your margin mile by mile', fix: 'Fuel optimizer routes you to cheapest stops on your path' },
]

const FEATURES = [
  { icon: Bot, label: 'AI Load Board', desc: 'DAT-connected · AI scores every load 0–100', color: '#f0a500' },
  { icon: Map, label: 'Live Fleet Map', desc: 'Real-time truck positions & ETAs', color: '#00d4aa' },
  { icon: TrendingUp, label: 'P&L Dashboard', desc: 'Live profit & loss by load, lane, driver', color: '#4d8ef0' },
  { icon: Fuel, label: 'Fuel Optimizer', desc: 'Cut fuel spend $80–$140 per load', color: '#f06040' },
  { icon: BarChart2, label: 'IFTA Filing', desc: 'Auto-calculated quarterly returns', color: '#a78bfa' },
  { icon: FlaskConical, label: 'Pre-Employment', desc: 'Full FMCSA screening in one click', color: '#f0a500' },
  { icon: Landmark, label: 'Broker Risk Intel', desc: 'Know who pays before you book', color: '#00d4aa' },
  { icon: CreditCard, label: 'Factoring', desc: 'Same-day cash at 2.5% flat', color: '#4d8ef0' },
  { icon: ClipboardList, label: 'DVIR / ELD / HOS', desc: 'Full compliance in one place', color: '#f06040' },
  { icon: MapPin, label: 'Check Calls', desc: 'AI-assisted shipper check-in log', color: '#a78bfa' },
  { icon: Truck, label: 'Equipment Manager', desc: 'Trucks, trailers, VINs, expiry alerts', color: '#f0a500' },
  { icon: FileText, label: 'Carrier Package', desc: 'One-click broker contracting packet', color: '#00d4aa' },
]

const PLANS = [
  {
    name: 'Solo', sub: '1 truck · Owner-operator', price: '$49', color: 'var(--accent2)',
    features: ['AI Load Board + DAT', 'Fleet Map', 'P&L Dashboard', 'IFTA Filing', 'Invoicing & Factoring', 'Carrier Package', 'Fuel Optimizer'],
    cta: 'Start Free Trial', highlight: false, stripeId: 'solo',
  },
  {
    name: 'Small Fleet', sub: '2–5 trucks', price: '$99', color: 'var(--accent)',
    features: ['Everything in Solo', 'Multi-driver dispatch', 'Pre-Employment Screening', 'Driver Scorecards', 'Broker Risk Intel', 'Check Call Center', 'Equipment Manager'],
    cta: 'Start Free Trial', highlight: true, stripeId: 'fleet',
  },
  {
    name: 'Growing Fleet', sub: '6–15 trucks', price: '$199', color: 'var(--accent3)',
    features: ['Everything in Small Fleet', 'Unlimited drivers', 'QuickBooks integration', 'DAT API live feed', 'Cash Flow Forecasting', 'Priority support', 'Custom reporting'],
    cta: 'Start Free Trial', highlight: false, stripeId: 'growing',
  },
]

const TESTIMONIALS = [
  { name: 'James T.', role: 'Owner-Operator, Atlanta', text: 'I used to spend 2 hours a day on DAT just finding decent loads. Now I ask Qivori and it finds me the best ones in seconds. Made $340 more per load last month.', rating: 5 },
  { name: 'Kevin L.', role: 'Fleet Owner, 4 trucks', text: 'IFTA used to take me a whole weekend every quarter. Qivori auto-calculates everything from my loads. Filed in 5 minutes last quarter.', rating: 5 },
  { name: 'Maria S.', role: 'Owner-Operator, Dallas', text: 'The voice AI is a game changer. I just talk to my phone while driving — book loads, submit check calls, send invoices. No more pulling over to use 5 different apps.', rating: 5 },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Sign Up in 60 Seconds', desc: 'Create your account, add your MC number. No credit card needed for the 14-day trial.', icon: Users },
  { step: '02', title: 'AI Learns Your Lanes', desc: 'Qivori analyzes your history and preferences to find the most profitable loads for your operation.', icon: Bot },
  { step: '03', title: 'Run Everything from One Place', desc: 'Dispatch, compliance, invoicing, P&L — all managed by AI. Talk to it or tap, your choice.', icon: Zap },
]

const STATS = [
  { value: '$340', label: 'Extra profit per load', icon: DollarSign },
  { value: '10hrs', label: 'Saved per week', icon: Clock },
  { value: '2.5%', label: 'Flat factoring rate', icon: CreditCard },
  { value: '94%', label: 'AI match accuracy', icon: Bot },
]

export default function LandingPage({ onGetStarted }) {
  const { goToLogin, user } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(null)

  const handleTry = () => goToLogin()

  const handleCheckout = async (planId) => {
    setCheckoutLoading(planId)
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, email: user?.email || undefined, userId: user?.id || undefined }),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url } else { goToLogin() }
    } catch { goToLogin() }
    finally { setCheckoutLoading(null) }
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", overflowY: 'auto', height: '100dvh', position: 'fixed', inset: 0, zIndex: 10, WebkitOverflowScrolling: 'touch' }}>

      {/* ── STYLES ────────────────────────────────────────────────────── */}
      <style>{`
        .lp-nav-links { display: flex; align-items: center; gap: 28px; }
        .lp-mob-toggle { display: none !important; }
        .lp-mob-menu { display: none; }
        @keyframes heroGlow { 0%,100%{opacity:0.4;} 50%{opacity:0.7;} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
        .lp-feature-card { transition: all 0.25s ease; }
        .lp-feature-card:hover { transform: translateY(-4px); border-color: rgba(240,165,0,0.4) !important; box-shadow: 0 12px 40px rgba(240,165,0,0.08); }
        .lp-nav-link { position: relative; }
        .lp-nav-link::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 2px; background: var(--accent); transition: width 0.2s; }
        .lp-nav-link:hover::after { width: 100%; }
        .lp-plan-card { transition: all 0.25s ease; }
        .lp-plan-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.3); }
        @media (max-width: 780px) {
          .lp-nav { padding: 0 16px !important; }
          .lp-nav-links { display: none !important; }
          .lp-mob-toggle { display: flex !important; }
          .lp-mob-menu {
            display: flex; flex-direction: column; gap: 8px;
            position: absolute; top: 64px; left: 0; right: 0;
            background: rgba(7,9,14,0.98); border-bottom: 1px solid var(--border);
            padding: 20px; z-index: 99; backdrop-filter: blur(16px);
          }
          .lp-mob-menu a { font-size: 15px; color: var(--muted); text-decoration: none; padding: 12px 0; border-bottom: 1px solid var(--border); }
          .lp-mob-menu .lp-mob-btns { display: flex; gap: 10px; margin-top: 12px; }
          .lp-mob-menu .lp-mob-btns button { flex: 1; }
          .lp-hero { padding: 60px 20px 50px !important; }
          .lp-hero h1 { font-size: 42px !important; }
          .lp-hero p { font-size: 15px !important; }
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-section { padding: 50px 20px !important; }
          .lp-pain-row { grid-template-columns: 1fr !important; gap: 8px !important; }
          .lp-pain-arrow { display: none !important; }
          .lp-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-dat-grid { grid-template-columns: 1fr !important; padding: 28px 20px !important; }
          .lp-dat-heading { font-size: 30px !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
          .lp-compare-table > div { grid-template-columns: 1.5fr 1fr 1fr 1fr !important; }
          .lp-compare-table > div > div { padding: 10px 8px !important; font-size: 11px !important; }
          .lp-compare-stats { grid-template-columns: 1fr !important; }
          .lp-ai-grid { grid-template-columns: 1fr !important; }
          .lp-how-grid { grid-template-columns: 1fr !important; }
          .lp-testimonials-grid { grid-template-columns: 1fr !important; }
          .lp-section-heading { font-size: 32px !important; }
          .lp-cta-heading { font-size: 36px !important; }
          .lp-footer-grid { grid-template-columns: 1fr !important; text-align: center !important; }
        }
        @media (max-width: 480px) {
          .lp-hero h1 { font-size: 32px !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-stats-grid { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
        }
      `}</style>

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <nav className="lp-nav" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(7,9,14,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '0 48px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          QI<span style={{ color: 'var(--accent)' }}>VORI</span>
          <span style={{ fontSize: 10, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, marginLeft: 6, padding: '2px 6px', background: 'rgba(0,212,170,0.1)', borderRadius: 4 }}>AI</span>
        </div>

        <button className="lp-mob-toggle" onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: 'var(--text)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>
          {menuOpen ? '✕' : '☰'}
        </button>

        <div className="lp-nav-links">
          {['Features', 'How It Works', 'Pricing'].map(item => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, '-')}`} className="lp-nav-link"
              style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
              onMouseOver={e => e.target.style.color = 'var(--text)'}
              onMouseOut={e => e.target.style.color = 'var(--muted)'}>
              {item}
            </a>
          ))}
          <button onClick={onGetStarted}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 18px', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, transition: 'all 0.2s' }}>
            Sign In
          </button>
          <button onClick={handleTry}
            style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 10, padding: '9px 22px', color: '#000', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, boxShadow: '0 4px 16px rgba(240,165,0,0.3)' }}>
            Get Started Free
          </button>
        </div>

        {menuOpen && (
          <div className="lp-mob-menu">
            {['Features', 'How It Works', 'Pricing'].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(/ /g, '-')}`} onClick={() => setMenuOpen(false)}>{item}</a>
            ))}
            <div className="lp-mob-btns">
              <button onClick={onGetStarted} style={{ padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Sign In</button>
              <button onClick={handleTry} style={{ padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Get Started Free</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="lp-hero" style={{ position: 'relative', padding: '100px 48px 90px', maxWidth: 1000, margin: '0 auto', textAlign: 'center', overflow: 'hidden' }}>
        {/* Background glow effects */}
        <div style={{ position: 'absolute', top: '-50%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.08) 0%, transparent 70%)', animation: 'heroGlow 4s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '-30%', right: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,170,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <FadeIn>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 24, padding: '6px 18px', marginBottom: 32 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.5 }}>AI-Powered Trucking Platform — Now Live</span>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 76, letterSpacing: 4, lineHeight: 0.95, marginBottom: 28, color: 'var(--text)', position: 'relative' }}>
            THE OPERATING SYSTEM<br />
            FOR <span style={{ color: 'var(--accent)', textShadow: '0 0 60px rgba(240,165,0,0.3)' }}>MODERN CARRIERS</span>
          </h1>
        </FadeIn>

        <FadeIn delay={0.2}>
          <p style={{ fontSize: 19, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 620, margin: '0 auto 44px', fontWeight: 400 }}>
            AI load matching, voice-first dispatch, auto-invoicing, IFTA, compliance — everything an owner-operator needs, in one platform.
          </p>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleTry}
              style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 12, padding: '16px 40px', color: '#000', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 8px 32px rgba(240,165,0,0.3)', display: 'inline-flex', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}>
              <Ic icon={Zap} size={18} /> Start Free — 14 Day Trial
            </button>
            <button onClick={onGetStarted}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '16px 36px', color: 'var(--text)', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", backdropFilter: 'blur(8px)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Sign In <Ic icon={ArrowRight} size={16} />
            </button>
          </div>
          <div style={{ marginTop: 18, fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={Shield} size={13} color="var(--success)" /> No credit card</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={Clock} size={13} color="var(--accent)" /> Setup in 60 seconds</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={CheckCircle} size={13} color="var(--accent2)" /> Cancel anytime</span>
          </div>
        </FadeIn>
      </section>

      {/* ── TRUSTED BY ────────────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '24px 40px', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: 2, marginBottom: 16 }}>TRUSTED BY CARRIERS ACROSS AMERICA</div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 40, flexWrap: 'wrap', opacity: 0.4 }}>
            {['Swift Carriers', 'PrimeRoute LLC', 'R&J Transport', 'FastHaul Express', 'Southern Freight', 'Express Carriers'].map(name => (
              <span key={name} style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 2, color: 'var(--text)' }}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '60px 40px', background: 'var(--surface)' }}>
        <div className="lp-stats-grid" style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {STATS.map(s => (
            <FadeIn key={s.label}>
              <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Ic icon={s.icon} size={18} color="var(--accent)" />
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, color: 'var(--accent)', lineHeight: 1, marginBottom: 6 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{s.label}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── PAIN vs SOLUTION ──────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '80px 40px', maxWidth: 900, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>THE PROBLEM</div>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, marginBottom: 14 }}>
              OWNER-OPERATORS ARE<br />DROWNING IN TOOLS
            </h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 560, margin: '0 auto' }}>
              DAT for loads. A different TMS. QuickBooks. ELD app. Spreadsheet for IFTA. Another for invoices.<br />Qivori replaces all of it.
            </p>
          </div>
        </FadeIn>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PAIN_SOLUTIONS.map((item, i) => (
            <FadeIn key={i} delay={i * 0.05}>
              <div className="lp-pain-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic icon={Frown} size={16} color="var(--danger)" />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{item.pain}</span>
                </div>
                <div className="lp-pain-arrow" style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(240,165,0,0.12), rgba(0,212,170,0.08))', border: '1px solid rgba(240,165,0,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic icon={ArrowRight} size={14} color="var(--accent)" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,170,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic icon={CheckCircle} size={16} color="var(--success)" />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>{item.fix}</span>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <section id="features" className="lp-section" style={{ padding: '80px 40px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>PLATFORM</div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, marginBottom: 14 }}>12 MODULES. ONE PLATFORM.</h2>
              <p style={{ fontSize: 15, color: 'var(--muted)' }}>Everything you need to run your trucking business — zero spreadsheets required.</p>
            </div>
          </FadeIn>
          <div className="lp-features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {FEATURES.map((f, i) => (
              <FadeIn key={f.label} delay={i * 0.04}>
                <div className="lp-feature-card" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 18px', cursor: 'default', height: '100%' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${f.color}12`, border: `1px solid ${f.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <Ic icon={f.icon} size={20} color={f.color} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section id="how-it-works" className="lp-section" style={{ padding: '80px 40px', maxWidth: 900, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>HOW IT WORKS</div>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, marginBottom: 14 }}>
              UP AND RUNNING IN MINUTES
            </h2>
          </div>
        </FadeIn>
        <div className="lp-how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {HOW_IT_WORKS.map((h, i) => (
            <FadeIn key={h.step} delay={i * 0.1}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 24px', textAlign: 'center', position: 'relative' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 48, color: 'rgba(240,165,0,0.1)', position: 'absolute', top: 12, right: 18 }}>{h.step}</div>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, rgba(240,165,0,0.1), rgba(0,212,170,0.06))', border: '1px solid rgba(240,165,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Ic icon={h.icon} size={22} color="var(--accent)" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{h.title}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{h.desc}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── AI MOBILE EXPERIENCE ─────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '80px 40px', background: 'linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%)', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>AI-FIRST MOBILE</div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, marginBottom: 14 }}>
                YOUR AI COPILOT ON THE ROAD
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 560, margin: '0 auto' }}>
                No menus. No forms. Just talk to your AI and it handles everything — hands-free while you drive.
              </p>
            </div>
          </FadeIn>

          <div className="lp-ai-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
            <FadeIn>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 290, background: 'var(--surface)', border: '2px solid rgba(240,165,0,0.15)', borderRadius: 36, padding: '16px 0', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(240,165,0,0.06)', animation: 'float 6s ease-in-out infinite' }}>
                  <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(0,212,170,0.1))', border: '1px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Ic icon={Zap} size={12} color="var(--accent)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, letterSpacing: 2 }}>QI<span style={{ color: 'var(--accent)' }}>VORI</span> <span style={{ fontSize: 9, color: 'var(--accent2)' }}>AI</span></div>
                      <div style={{ fontSize: 8, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--success)' }} /> 2 active loads
                      </div>
                    </div>
                    <Ic icon={Volume2} size={12} color="var(--success)" />
                  </div>

                  <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 270 }}>
                    <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#000', padding: '9px 14px', borderRadius: '14px 14px 4px 14px', fontSize: 11, fontWeight: 600, maxWidth: '78%' }}>
                      Just delivered, send the invoice
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <Ic icon={Zap} size={9} color="var(--accent)" />
                      </div>
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '9px 13px', borderRadius: '14px 14px 14px 4px', fontSize: 10.5, lineHeight: 1.55, color: 'var(--text)', maxWidth: '83%' }}>
                        Load delivered! Invoice INV-4821 emailed to Echo Global for $2,056.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingLeft: 24 }}>
                      {[{ icon: Truck, text: 'Delivered' }, { icon: Send, text: 'Invoice Sent' }].map((b, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 6, fontSize: 8, fontWeight: 600, color: 'var(--success)' }}>
                          <Ic icon={b.icon} size={8} /><Ic icon={CheckCircle} size={7} />{b.text}
                        </div>
                      ))}
                    </div>
                    <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#000', padding: '9px 14px', borderRadius: '14px 14px 4px 14px', fontSize: 11, fontWeight: 600 }}>
                      Find me a load back to Chicago
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <Ic icon={Zap} size={9} color="var(--accent)" />
                      </div>
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '9px 13px', borderRadius: '14px 14px 14px 4px', fontSize: 10.5, lineHeight: 1.55, color: 'var(--text)', maxWidth: '83%' }}>
                        Top pick: ATL→CHI, $3.20/mi, $2,157 gross. AI Score: 96. Book it?
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Camera} size={11} color="var(--muted)" /></div>
                    <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 8, padding: '7px 10px', fontSize: 9, color: 'var(--muted)' }}>Tell me what you need...</div>
                    <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Mic} size={11} color="var(--accent)" /></div>
                  </div>
                </div>
              </div>
            </FadeIn>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                { icon: Mic, title: 'Voice-First', desc: 'Tap and talk — AI processes your commands hands-free while you drive.' },
                { icon: Volume2, title: 'AI Reads Back', desc: 'Responses are spoken aloud so you never take your eyes off the road.' },
                { icon: ScanLine, title: 'Snap Rate Con', desc: 'Photo a rate confirmation — AI extracts details and books the load.' },
                { icon: Send, title: 'Auto-Invoice', desc: 'Deliver a load and AI emails a branded invoice to the broker.' },
                { icon: Navigation, title: 'Find Truck Stops', desc: '"Find me a truck stop" — maps open with the nearest options.' },
                { icon: Camera, title: 'Smart Documents', desc: 'AI prompts for BOL, signed BOL, and POD at exactly the right time.' },
              ].map((f, i) => (
                <FadeIn key={i} delay={i * 0.08}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Ic icon={f.icon} size={18} color="var(--accent)" />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{f.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{f.desc}</div>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '80px 40px', maxWidth: 960, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>TESTIMONIALS</div>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, marginBottom: 14 }}>
              DRIVERS LOVE QIVORI
            </h2>
          </div>
        </FadeIn>
        <div className="lp-testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {TESTIMONIALS.map((t, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 14 }}>
                  {Array.from({ length: t.rating }).map((_, j) => <Ic key={j} icon={Star} size={14} color="var(--accent)" style={{ fill: 'var(--accent)' }} />)}
                </div>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, flex: 1, margin: 0 }}>"{t.text}"</p>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(0,212,170,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: 'var(--accent)' }}>
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── TMS COMPARISON ─────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>WHY SWITCH</div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, marginBottom: 14 }}>TRADITIONAL TMS vs QIVORI</h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 560, margin: '0 auto' }}>Most TMS platforms were built for mega-carriers with 500+ trucks. You're paying enterprise prices for features you'll never use.</p>
            </div>
          </FadeIn>

          {/* Comparison Table */}
          <FadeIn delay={0.1}>
            <div className="lp-compare-table" style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {/* Table Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                <div style={{ padding: '16px 20px', fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: 2 }}>FEATURE</div>
                <div style={{ padding: '16px 12px', fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, textAlign: 'center' }}>LEGACY TMS</div>
                <div style={{ padding: '16px 12px', fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1, textAlign: 'center' }}>ENTERPRISE TMS</div>
                <div style={{ padding: '16px 12px', fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1, textAlign: 'center' }}>QIVORI</div>
              </div>

              {/* Price Row */}
              {[
                { feature: 'Monthly Cost', legacy: '$150–300/mo', enterprise: '$500–1,200/mo', qivori: '$49/mo', qivoriHighlight: true },
                { feature: 'Setup / Onboarding Fee', legacy: '$500–1,500', enterprise: '$2,000–10,000', qivori: '$0', qivoriHighlight: true },
                { feature: 'Contract Length', legacy: '12 months', enterprise: '24–36 months', qivori: 'Month-to-month', qivoriHighlight: true },
                { feature: 'AI Load Scoring', legacy: false, enterprise: false, qivori: true },
                { feature: 'AI Dispatch Assistant', legacy: false, enterprise: 'Add-on', qivori: true },
                { feature: 'IFTA Auto-Filing', legacy: 'Add-on', enterprise: true, qivori: true },
                { feature: 'Rate Con OCR (Auto-Read)', legacy: false, enterprise: 'Add-on', qivori: true },
                { feature: 'Receipt Scanning', legacy: false, enterprise: false, qivori: true },
                { feature: 'Broker Risk Scores', legacy: false, enterprise: false, qivori: true },
                { feature: 'Invoicing + Factoring', legacy: 'Add-on', enterprise: true, qivori: true },
                { feature: 'Fleet GPS Tracking', legacy: '$20/truck extra', enterprise: true, qivori: true },
                { feature: 'Driver Scorecards', legacy: false, enterprise: 'Add-on', qivori: true },
                { feature: 'Mobile App for Drivers', legacy: 'Extra fee', enterprise: true, qivori: true },
                { feature: 'Weigh Station Alerts', legacy: false, enterprise: false, qivori: true },
                { feature: 'QuickBooks Integration', legacy: true, enterprise: true, qivori: true },
                { feature: 'Free Trial', legacy: false, enterprise: false, qivori: '14 days', qivoriHighlight: true },
              ].map((row, i) => {
                const renderCell = (val, highlight) => {
                  if (val === true) return <span style={{ color: 'var(--success)', fontSize: 16 }}><Ic icon={Check} size={16} /></span>
                  if (val === false) return <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>
                  return <span style={{ fontSize: 12, fontWeight: highlight ? 800 : 600, color: highlight ? 'var(--accent)' : 'var(--text)' }}>{val}</span>
                }
                return (
                  <div key={row.feature} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: i < 15 ? '1px solid var(--border)' : 'none',
                    background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface)', transition: 'background 0.15s' }}>
                    <div style={{ padding: '13px 20px', fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center' }}>{row.feature}</div>
                    <div style={{ padding: '13px 12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{renderCell(row.legacy)}</div>
                    <div style={{ padding: '13px 12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{renderCell(row.enterprise)}</div>
                    <div style={{ padding: '13px 12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: row.qivoriHighlight ? 'rgba(240,165,0,0.04)' : 'transparent' }}>{renderCell(row.qivori, row.qivoriHighlight)}</div>
                  </div>
                )
              })}
            </div>
          </FadeIn>

          {/* Bottom Stats */}
          <FadeIn delay={0.2}>
            <div className="lp-compare-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 32 }}>
              {[
                { stat: '80%', label: 'Less than legacy TMS pricing', color: 'var(--success)' },
                { stat: '$0', label: 'Setup fees, onboarding, or contracts', color: 'var(--accent)' },
                { stat: '12+', label: 'Features included that others charge extra for', color: 'var(--accent2)' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 44, color: s.color, lineHeight: 1, marginBottom: 8 }}>{s.stat}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-section" style={{ padding: '80px 40px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>PRICING</div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, marginBottom: 14 }}>SIMPLE. FLAT. NO SURPRISES.</h2>
              <p style={{ fontSize: 15, color: 'var(--muted)' }}>One load booked better pays for the whole month.</p>
            </div>
          </FadeIn>

          <div className="lp-pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {PLANS.map((plan, i) => (
              <FadeIn key={plan.name} delay={i * 0.1}>
                <div className="lp-plan-card" style={{ background: plan.highlight ? 'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(240,165,0,0.02))' : 'var(--bg)',
                  border: `${plan.highlight ? '2px' : '1px'} solid ${plan.highlight ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`, borderRadius: 18, padding: '32px 26px',
                  position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {plan.highlight && (
                    <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, #f0a500, #e09000)', color: '#000', fontSize: 10, fontWeight: 800, padding: '4px 16px', borderRadius: 12, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                      MOST POPULAR
                    </div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 800, color: plan.color, letterSpacing: 1.5, marginBottom: 6 }}>{plan.name.toUpperCase()}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>{plan.sub}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 56, color: plan.color, lineHeight: 1 }}>{plan.price}</span>
                    <span style={{ fontSize: 14, color: 'var(--muted)' }}>/mo</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, flex: 1 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13 }}>
                        <span style={{ color: plan.color, flexShrink: 0, marginTop: 2, display: 'flex' }}><Ic icon={Check} size={14} /></span>
                        <span style={{ color: 'var(--text)', lineHeight: 1.4 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => handleCheckout(plan.stripeId)} disabled={checkoutLoading === plan.stripeId}
                    style={{ width: '100%', padding: '14px 0', fontSize: 14, fontWeight: 700, borderRadius: 12, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                      background: plan.highlight ? 'linear-gradient(135deg, #f0a500, #e09000)' : 'var(--surface)', color: plan.highlight ? '#000' : 'var(--text)',
                      border: plan.highlight ? 'none' : '1px solid var(--border)', opacity: checkoutLoading === plan.stripeId ? 0.6 : 1, boxShadow: plan.highlight ? '0 4px 16px rgba(240,165,0,0.25)' : 'none', transition: 'all 0.2s' }}>
                    {checkoutLoading === plan.stripeId ? 'Loading...' : `${plan.cta} →`}
                  </button>
                </div>
              </FadeIn>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--muted)', display: 'flex', justifyContent: 'center', gap: 20 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={Shield} size={13} color="var(--success)" /> 14-day free trial</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={CreditCard} size={13} color="var(--accent)" /> No card required</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={CheckCircle} size={13} color="var(--accent2)" /> Cancel anytime</span>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <FadeIn>
          <div style={{ maxWidth: 640, margin: '0 auto', position: 'relative' }}>
            <h2 className="lp-cta-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, letterSpacing: 3, lineHeight: 1.05, marginBottom: 24 }}>
              READY TO STOP LEAVING<br />
              <span style={{ color: 'var(--accent)', textShadow: '0 0 40px rgba(240,165,0,0.2)' }}>MONEY ON THE TABLE?</span>
            </h2>
            <p style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 40 }}>
              Join owner-operators and small fleets using Qivori to find better loads, run leaner, and get paid faster.
            </p>
            <button onClick={handleTry}
              style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 14, padding: '18px 52px', color: '#000', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", boxShadow: '0 8px 40px rgba(240,165,0,0.35)', marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Ic icon={Zap} size={20} /> Start Free — No Card Needed
            </button>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>14 days free · Then from $49/month · Cancel anytime</div>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '48px 40px 60px', background: 'var(--surface)' }}>
        <div className="lp-footer-grid" style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 4, marginBottom: 12 }}>
              QI<span style={{ color: 'var(--accent)' }}>VORI</span>
              <span style={{ fontSize: 10, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginLeft: 6, padding: '2px 6px', background: 'rgba(0,212,170,0.1)', borderRadius: 4 }}>AI</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 280 }}>
              The AI-powered operating system for owner-operators and small fleets. Built by people who understand trucking.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 14 }}>PLATFORM</div>
            {['AI Load Board', 'Fleet Tracking', 'IFTA Filing', 'Invoicing', 'Compliance'].map(l => (
              <a key={l} href="#features" style={{ display: 'block', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '4px 0', transition: 'color 0.15s' }}
                onMouseOver={e => e.target.style.color = 'var(--text)'} onMouseOut={e => e.target.style.color = 'var(--muted)'}>{l}</a>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 14 }}>COMPANY</div>
            {['About', 'Pricing', 'Blog', 'Careers', 'Contact'].map(l => (
              <a key={l} href={l === 'Pricing' ? '#pricing' : '#'} style={{ display: 'block', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '4px 0', transition: 'color 0.15s' }}
                onMouseOver={e => e.target.style.color = 'var(--text)'} onMouseOut={e => e.target.style.color = 'var(--muted)'}>{l}</a>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 14 }}>LEGAL</div>
            {[
              { label: 'Privacy Policy', href: '#/privacy' },
              { label: 'Terms of Service', href: '#/terms' },
              { label: 'Cookie Policy', href: '#' },
            ].map(l => (
              <a key={l.label} href={l.href} style={{ display: 'block', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '4px 0', transition: 'color 0.15s' }}
                onMouseOver={e => e.target.style.color = 'var(--text)'} onMouseOut={e => e.target.style.color = 'var(--muted)'}>{l.label}</a>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 960, margin: '0 auto', paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>© 2026 Qivori AI. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic icon={Globe} size={14} color="var(--muted)" /></div>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ic icon={Headphones} size={14} color="var(--muted)" /></div>
          </div>
        </div>
      </footer>

    </div>
  )
}
