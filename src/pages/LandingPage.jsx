import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { trackDemoRequest, trackDemoEnter, trackCheckout } from '../lib/analytics'
import { useTranslation } from '../lib/i18n'
import { TrendingUp, Truck, Zap, Check, X, Mail, Users, Shield, Send, Play, Clock } from 'lucide-react'

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

function WaitlistSection() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | success | error
  const [count, setCount] = useState(200)

  useEffect(() => {
    (async () => {
      const { count: c } = await supabase.from('waitlist').select('*', { count: 'exact', head: true })
      if (c && c > 0) setCount(200 + c)
    })()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setStatus('submitting')
    const { error } = await supabase.from('waitlist').insert({ email: email.trim().toLowerCase() })
    if (error) {
      if (error.code === '23505') {
        setStatus('success')
        return
      }
      setStatus('error')
      return
    }
    setCount(c => c + 1)
    setStatus('success')
  }

  return (
    <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '32px 40px', background: 'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
          <Ic icon={Users} size={16} color="var(--accent)" />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 2, color: 'var(--accent)' }}>{count}+</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('landing.waitlistJoin', { count })}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>{t('landing.waitlistEarlyAccess')}</div>

        {status === 'success' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12 }}>
            <Ic icon={Check} size={16} color="var(--success)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>{t('landing.waitlistSuccess')}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, maxWidth: 420, margin: '0 auto' }}>
            <input
              type="email"
              placeholder={t('landing.waitlistPlaceholder')}
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={status === 'submitting'}
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', opacity: status === 'submitting' ? 0.6 : 1 }}
            >
              {status === 'submitting' ? t('landing.waitlistJoining') : t('landing.waitlistButton')}
            </button>
          </form>
        )}
        {status === 'error' && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 8 }}>{t('landing.waitlistError')}</div>
        )}
      </div>
    </section>
  )
}


// Pricing
const PRICING = {
  tms_pro: { price: 79, additional: 39 },
  ai_dispatch: { price: 199, additional: 79 },
  autonomous_fleet: { percent: 3 },
}

export default function LandingPage({ onGetStarted }) {
  const { goToLogin, enterDemo, user } = useApp()
  const { t, language } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(null)
  const [founderCount, setFounderCount] = useState(0)
  const [demoModal, setDemoModal] = useState(false)
  const [videoModal, setVideoModal] = useState(false)
  const [demoForm, setDemoForm] = useState({ name: '', email: '', phone: '', company: '', truckCount: '', currentELD: '', factoringCompany: '', loadBoards: '', painPoints: '', _hp: '' })
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoSent, setDemoSent] = useState(false)
  const [demoError, setDemoError] = useState('')

  // Close video modal on Escape key
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') setVideoModal(false) }
    if (videoModal) {
      window.addEventListener('keydown', handleEsc)
      return () => window.removeEventListener('keydown', handleEsc)
    }
  }, [videoModal])

  // Check URL for ?demo=true (from email link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === 'true') {
      trackDemoEnter()
      enterDemo('carrier')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [enterDemo])

  const handleDemoSubmit = async () => {
    if (!demoForm.name.trim() || !demoForm.email.trim() || !demoForm.phone.trim() || !demoForm.company.trim()) return
    setDemoError('')
    setDemoLoading(true)
    try {
      // Get reCAPTCHA token if available
      let recaptchaToken = ''
      if (window.grecaptcha) {
        try {
          recaptchaToken = await window.grecaptcha.execute(
            window.__RECAPTCHA_SITE_KEY || '6Lfx35ksAAAAAD2c8XGkgHraPTPXrSVP0v0bPFft',
            { action: 'demo_request' }
          )
        } catch {}
      }
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...demoForm, recaptchaToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDemoError(data.error || 'Something went wrong. Please try again.')
        setDemoLoading(false)
        return
      }
      trackDemoRequest(demoForm.email)
      setDemoLoading(false)
      setDemoModal(false)
      // Enter demo mode after collecting lead info
      trackDemoEnter()
      enterDemo('carrier')
    } catch {
      // Even if API fails, still let them in — we'll capture the lead next time
      setDemoLoading(false)
      setDemoModal(false)
      trackDemoEnter()
      enterDemo('carrier')
    }
  }

  // Track referral code from URL (?ref=code or /ref/code)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get('ref')
    if (refCode) {
      localStorage.setItem('qivori_ref', refCode)
      // Track referral click
      fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'click', referralCode: refCode }),
      }).catch(() => {})
    }
  }, [])

  // Fetch Autopilot AI subscriber count for founder spots
  useEffect(() => {
    async function fetchFounderCount() {
      try {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
          .eq('subscription_plan', 'autopilot_ai').in('subscription_status', ['active', 'trialing'])
        setFounderCount(count || 0)
      } catch {}
    }
    fetchFounderCount()
  }, [])

  const handleTry = () => goToLogin()

  const handleCheckout = async (planId) => {
    trackCheckout(planId)
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
    <div style={{ background: '#FAFAFA', color: '#1a1a1a', fontFamily: "'DM Sans', sans-serif", overflowY: 'auto', height: '100dvh', position: 'fixed', inset: 0, zIndex: 10, WebkitOverflowScrolling: 'touch', '--bg': '#FAFAFA', '--surface': '#FFFFFF', '--text': '#1a1a1a', '--muted': 'rgba(26,26,26,0.45)', '--border': 'rgba(0,0,0,0.08)', '--accent': '#f0a500', '--accent2': 'rgba(240,165,0,0.15)', '--success': '#22c55e', '--danger': '#ef4444' }}>

      {/* ── STYLES ────────────────────────────────────────────────────── */}
      <style>{`
        .lp-nav-links { display: flex; align-items: center; gap: 28px; }
        .lp-mob-toggle { display: none !important; }
        .lp-mob-menu { display: none; }

        /* Premium CTA button */
        .lp-cta-btn {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative; overflow: hidden;
        }
        .lp-cta-btn:hover {
          transform: translateY(-3px) scale(1.02);
          box-shadow: 0 20px 60px rgba(240,165,0,0.35) !important;
        }
        .lp-cta-btn:active { transform: translateY(-1px) scale(0.98); }
        .lp-cta-btn::after {
          content: ''; position: absolute; top: 0; left: -100%;
          width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
          transition: left 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .lp-cta-btn:hover::after { left: 100%; }

        /* Premium feature cards */
        .lp-feature-card {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        .lp-feature-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(240,165,0,0.2) !important;
          border-color: rgba(240,165,0,0.25) !important;
        }

        /* Nav link underline */
        .lp-nav-link { position: relative; transition: color 0.2s; }
        .lp-nav-link::after {
          content: ''; position: absolute; bottom: -2px; left: 0;
          width: 0; height: 2px; background: #f0a500;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .lp-nav-link:hover::after { width: 100%; }

        /* Premium mockup cards */
        .lp-mockup-card {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .lp-mockup-card:hover {
          box-shadow: 0 32px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(240,165,0,0.1) !important;
          transform: translateY(-4px);
        }

        /* Hero background grid (light version of fb-ad) */
        .lp-hero-bg {
          position: absolute; inset: 0; overflow: hidden; pointer-events: none;
        }
        .lp-hero-bg::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(240,165,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(240,165,0,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: lpGridMove 30s linear infinite;
        }
        .lp-hero-bg::after {
          content: '';
          position: absolute;
          width: 600px; height: 600px;
          top: 50%; left: 60%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%);
          animation: lpGlow 5s ease-in-out infinite alternate;
        }
        @keyframes lpGridMove { to { background-position: 60px 60px; } }
        @keyframes lpGlow {
          from { opacity: 0.5; transform: translate(-50%,-50%) scale(0.9); }
          to { opacity: 1; transform: translate(-50%,-50%) scale(1.15); }
        }

        /* Q Voice bars animation */
        @keyframes lpVoiceBar {
          from { height: 8px; opacity: 0.3; }
          to { height: 36px; opacity: 1; }
        }

        /* Truck dot pulse */
        .lp-truck-dot {
          animation: lpTruckPulse 2.5s ease-in-out infinite;
        }
        @keyframes lpTruckPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }

        /* Route dash animation */
        .lp-route-dash {
          animation: lpDashMove 3s linear infinite;
        }
        @keyframes lpDashMove {
          to { stroke-dashoffset: -20; }
        }

        /* Live dot blink */
        .lp-live-dot {
          animation: lpBlink 1.5s infinite;
        }
        @keyframes lpBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Floating particles (light) */
        .lp-particle {
          position: absolute;
          width: 4px; height: 4px;
          background: rgba(240,165,0,0.2);
          border-radius: 50%;
          animation: lpFloat 12s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes lpFloat {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
          25% { opacity: 0.5; }
          50% { transform: translateY(-100px) translateX(30px); opacity: 0.3; }
          75% { opacity: 0.15; }
        }

        /* Section divider glow */
        .lp-section-glow {
          position: relative;
        }
        .lp-section-glow::before {
          content: '';
          position: absolute; top: -1px; left: 50%;
          transform: translateX(-50%);
          width: 200px; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(240,165,0,0.4), transparent);
        }

        /* Premium card glass effect (light) */
        .lp-glass {
          background: rgba(255,255,255,0.8) !important;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        @media (max-width: 780px) {
          .lp-nav { padding: 0 16px !important; }
          .lp-nav-links { display: none !important; }
          .lp-mob-toggle { display: flex !important; }
          .lp-mob-menu {
            display: flex; flex-direction: column; gap: 8px;
            position: absolute; top: 64px; left: 0; right: 0;
            background: rgba(250,250,250,0.98); border-bottom: 1px solid rgba(0,0,0,0.06);
            padding: 20px; z-index: 99; backdrop-filter: blur(16px);
          }
          .lp-mob-menu a { font-size: 15px; color: rgba(26,26,26,0.5); text-decoration: none; padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
          .lp-mob-menu .lp-mob-btns { display: flex; gap: 10px; margin-top: 12px; }
          .lp-mob-menu .lp-mob-btns button { flex: 1; }
          .lp-hero-grid { grid-template-columns: 1fr !important; text-align: center !important; }
          .lp-hero-left { align-items: center !important; }
          .lp-hero { padding: 80px 20px 60px !important; }
          .lp-section { padding: 60px 20px !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-pipeline-cols { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-invoice-grid { grid-template-columns: 1fr !important; }
          .lp-q-voice-grid { grid-template-columns: 1fr !important; }
          .lp-section-heading { font-size: 36px !important; }
          .lp-footer-grid { grid-template-columns: 1fr !important; text-align: center !important; }
        }
        @media (max-width: 480px) {
          .lp-hero h1 { font-size: 36px !important; }
          .lp-section-heading { font-size: 30px !important; }
          .lp-pipeline-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <nav className="lp-nav" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(250,250,250,0.88)', borderBottom: '1px solid rgba(0,0,0,0.05)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', padding: '0 48px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, fontFamily: "'Bebas Neue', sans-serif" }}><span style={{ color: '#f0a500' }}>QI</span><span style={{ color: '#1a1a1a' }}>VORI</span></span><span style={{ marginLeft: 10, padding: '3px 8px', background: 'rgba(240,165,0,0.15)', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#f0a500', letterSpacing: 1 }}>AI</span>
        </div>

        <button className="lp-mob-toggle" onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: 'none', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '8px 12px', color: '#1a1a1a', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>
          {menuOpen ? '✕' : '☰'}
        </button>

        <div className="lp-nav-links">
          {[
            { label: 'Features', href: '#features' },
            { label: 'Pricing', href: '#pricing' },
          ].map(item => (
            <a key={item.label} href={item.href} className="lp-nav-link"
              style={{ fontSize: 13, color: 'rgba(26,26,26,0.5)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
              onMouseOver={e => e.target.style.color = '#1a1a1a'}
              onMouseOut={e => e.target.style.color = 'rgba(26,26,26,0.5)'}>
              {item.label}
            </a>
          ))}
          <button onClick={onGetStarted}
            style={{ background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: '8px 18px', color: '#1a1a1a', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
            Sign In
          </button>
          <button className="lp-cta-btn" onClick={handleTry}
            style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 10, padding: '9px 22px', color: '#000', fontSize: 13, cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", fontWeight: 800, letterSpacing: 1, boxShadow: '0 4px 16px rgba(240,165,0,0.25)' }}>
            START FREE TRIAL
          </button>
        </div>

        {menuOpen && (
          <div className="lp-mob-menu">
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <div className="lp-mob-btns">
              <button onClick={onGetStarted} style={{ padding: '12px', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, color: '#1a1a1a', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Sign In</button>
              <button onClick={handleTry} style={{ padding: '12px', background: '#f0a500', border: 'none', borderRadius: 10, color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>START FREE TRIAL</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="lp-hero" style={{ padding: '140px 48px 100px', maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
        {/* Cinematic background */}
        <div className="lp-hero-bg" />
        <div className="lp-particle" style={{ top: '20%', left: '8%', animationDelay: '0s' }} />
        <div className="lp-particle" style={{ top: '60%', left: '85%', animationDelay: '2s' }} />
        <div className="lp-particle" style={{ top: '40%', left: '45%', animationDelay: '4s' }} />
        <div className="lp-particle" style={{ top: '75%', left: '25%', animationDelay: '6s' }} />

        <div className="lp-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div className="lp-hero-left" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <FadeIn>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 24, padding: '8px 18px', marginBottom: 24 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 2 }}>AI-POWERED TRUCKING TMS</span>
              </div>
              <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 76, letterSpacing: 4, lineHeight: 0.95, marginBottom: 28, color: '#1a1a1a' }}>
                YOUR DISPATCHER<br />IS NOW <span style={{ color: '#f0a500', textShadow: '0 0 40px rgba(240,165,0,0.15)' }}>AI.</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.1}>
              <p style={{ fontSize: 19, color: 'rgba(26,26,26,0.55)', lineHeight: 1.7, marginBottom: 14, maxWidth: 460 }}>
                Q finds loads, calculates real profit, negotiates rates, and runs your operation — automatically.
              </p>
              <p style={{ fontSize: 16, color: '#f0a500', fontWeight: 700, marginBottom: 40 }}>
                More money. Less stress. No extra apps.
              </p>
            </FadeIn>
            <FadeIn delay={0.2}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="lp-cta-btn" onClick={handleTry}
                  style={{ background: 'linear-gradient(135deg, #f0a500, #d48e00)', border: 'none', borderRadius: 14, padding: '18px 48px', color: '#000', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", boxShadow: '0 12px 40px rgba(240,165,0,0.3)', letterSpacing: 2 }}>
                  START FREE TRIAL
                </button>
                <button onClick={() => setVideoModal(true)}
                  style={{ background: 'rgba(255,255,255,0.8)', border: '2px solid rgba(26,26,26,0.1)', borderRadius: 14, padding: '16px 32px', color: '#1a1a1a', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', backdropFilter: 'blur(10px)' }}>
                  <Ic icon={Play} size={14} color="#f0a500" /> Watch Demo
                </button>
              </div>
              <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(26,26,26,0.3)', fontWeight: 500 }}>14-day free trial · No credit card required</p>
            </FadeIn>
          </div>

          {/* RIGHT — Live Fleet Dashboard Mockup */}
          <FadeIn delay={0.15}>
            <div className="lp-mockup-card" style={{ background: '#0a0a0e', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.2), 0 0 60px rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.1)' }}>
              {/* Browser chrome */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                </div>
                <div style={{ flex: 1, marginLeft: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>qivori.com/dashboard</div>
              </div>
              {/* Fleet header */}
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.6)' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f0a500', letterSpacing: 1.5 }}>LIVE FLEET</span>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[{ v: '8', l: 'On Load' }, { v: '$34.2K', l: 'This Week' }].map(s => (
                    <div key={s.l} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#f0a500', lineHeight: 1 }}>{s.v}</div>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Active loads pipeline */}
              <div style={{ padding: '16px 20px' }}>
                {[
                  { route: 'DAL → ATL', rate: '$3,840', rpm: '$2.95/mi', status: 'In Transit', statusColor: '#22c55e', driver: 'Mike J.', truckColor: '#f0a500', progress: 65 },
                  { route: 'CHI → MIA', rate: '$3,590', rpm: '$2.60/mi', status: 'Loaded', statusColor: '#00d4aa', driver: 'Carlos R.', truckColor: '#00d4aa', progress: 10 },
                  { route: 'NYC → PHL', rate: '$680', rpm: '$7.00/mi', status: 'At Pickup', statusColor: '#4d8ef0', driver: 'James W.', truckColor: '#3498db', progress: 0 },
                ].map((load, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, marginBottom: 8, background: i === 0 ? 'rgba(240,165,0,0.06)' : 'rgba(255,255,255,0.02)', border: i === 0 ? '1px solid rgba(240,165,0,0.15)' : '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: load.truckColor, boxShadow: `0 0 6px ${load.truckColor}60`, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{load.route}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: load.statusColor, background: `${load.statusColor}15`, padding: '2px 8px', borderRadius: 4, letterSpacing: 0.5 }}>{load.status}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{load.driver} · {load.rpm}</span>
                        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#f0a500' }}>{load.rate}</span>
                      </div>
                      {load.progress > 0 && (
                        <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, marginTop: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${load.progress}%`, height: '100%', background: load.truckColor, borderRadius: 1 }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {/* Q AI status bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '10px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                  <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Q analyzed 247 loads · Auto-booked 3 · Saved $1,840 in negotiations</span>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FLEET MAP ─────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 12, textAlign: 'center' }}>REAL-TIME TRACKING</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, textAlign: 'center', marginBottom: 52, color: '#1a1a1a' }}>Your Fleet. Live.</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="lp-mockup-card" style={{ background: '#0a0a0e', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.2), 0 0 60px rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.1)' }}>
              {/* Map header */}
              <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="lp-live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.6)' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 1.5 }}>LIVE FLEET — 8 ON LOAD</span>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[{ v: '10', l: 'Total' }, { v: '2', l: 'Available' }, { v: '$34.2K', l: 'This Week' }].map(s => (
                    <div key={s.l} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#f0a500', lineHeight: 1 }}>{s.v}</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Map area */}
              <div style={{ position: 'relative', height: 420, background: 'linear-gradient(180deg, #0d1117 0%, #131720 100%)' }}>
                {/* US outline shape — simplified SVG path */}
                <svg viewBox="0 0 960 520" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.06 }}>
                  <path d="M 180,100 L 200,80 280,75 350,70 420,68 500,70 580,72 650,80 720,90 780,100 820,120 840,140 850,180 860,220 850,260 840,300 800,340 760,360 720,370 680,380 640,390 600,400 560,410 520,420 480,410 440,400 400,390 360,380 320,370 280,360 240,350 200,340 180,320 160,280 150,240 148,200 150,160 160,130 Z" fill="none" stroke="rgba(240,165,0,0.3)" strokeWidth="1.5" />
                </svg>

                {/* City dots + labels */}
                {[
                  { name: 'SEA', top: '12%', left: '8%' },
                  { name: 'DEN', top: '32%', left: '25%' },
                  { name: 'LAX', top: '48%', left: '8%' },
                  { name: 'DAL', top: '58%', left: '42%' },
                  { name: 'CHI', top: '22%', left: '55%' },
                  { name: 'MEM', top: '45%', left: '55%' },
                  { name: 'ATL', top: '50%', left: '68%' },
                  { name: 'MIA', top: '75%', left: '78%' },
                  { name: 'NYC', top: '20%', left: '82%' },
                  { name: 'PHL', top: '28%', left: '80%' },
                ].map(city => (
                  <div key={city.name}>
                    <div style={{ position: 'absolute', top: city.top, left: city.left, width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                    <div style={{ position: 'absolute', top: city.top, left: city.left, marginLeft: 10, marginTop: -3, fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600, letterSpacing: 0.5 }}>{city.name}</div>
                  </div>
                ))}

                {/* Truck dots with pulse animation */}
                {[
                  { top: '35%', left: '50%', color: '#f0a500', name: 'Unit 101 — Mike J.', route: 'CHI → ATL · 718 mi', status: 'In Transit', statusColor: '#22c55e', showLabel: true },
                  { top: '52%', left: '28%', color: '#00d4aa', name: 'Unit 205 — Carlos R.', route: 'DAL → LAX · 1,436 mi', status: 'Loaded', statusColor: '#00d4aa', showLabel: true },
                  { top: '42%', left: '75%', color: '#3498db', name: 'Unit 312 — James W.', route: 'NYC → MIA · 1,280 mi', status: 'En Route', statusColor: '#3498db', showLabel: true },
                  { top: '20%', left: '14%', color: '#9b59b6', name: 'Unit 408 — Amir K.', route: 'SEA → DEN · 1,321 mi', status: 'In Transit', statusColor: '#9b59b6', showLabel: false },
                  { top: '40%', left: '60%', color: '#e74c3c', name: '', route: '', status: '', showLabel: false },
                  { top: '30%', left: '38%', color: '#1abc9c', name: '', route: '', status: '', showLabel: false },
                  { top: '55%', left: '62%', color: '#e67e22', name: '', route: '', status: '', showLabel: false },
                  { top: '32%', left: '10%', color: '#6b7280', name: '', route: '', status: '', showLabel: false },
                ].map((truck, i) => (
                  <div key={i}>
                    <div className="lp-truck-dot" style={{ position: 'absolute', top: truck.top, left: truck.left, width: 12, height: 12, borderRadius: '50%', background: truck.color, boxShadow: `0 0 12px ${truck.color}80`, zIndex: 3 }} />
                    {truck.showLabel && (
                      <div style={{ position: 'absolute', top: truck.top, left: truck.left, marginLeft: 18, marginTop: -12, zIndex: 4, background: 'rgba(10,10,14,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px', whiteSpace: 'nowrap', backdropFilter: 'blur(8px)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: truck.color, marginBottom: 2 }}>🚛 {truck.name}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{truck.route}</div>
                        <div style={{ display: 'inline-block', fontSize: 8, fontWeight: 700, color: truck.statusColor, background: `${truck.statusColor}15`, padding: '2px 6px', borderRadius: 3, marginTop: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{truck.status}</div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Route arcs */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', zIndex: 2 }}>
                  <path d="M 528,92 Q 580,60 653,210" fill="none" stroke="rgba(240,165,0,0.25)" strokeWidth="1.5" strokeDasharray="6 4" className="lp-route-dash" />
                  <path d="M 403,243 Q 250,150 77,202" fill="none" stroke="rgba(0,212,170,0.25)" strokeWidth="1.5" strokeDasharray="6 4" className="lp-route-dash" />
                  <path d="M 787,84 Q 810,250 749,315" fill="none" stroke="rgba(52,152,219,0.25)" strokeWidth="1.5" strokeDasharray="6 4" className="lp-route-dash" />
                  <path d="M 77,50 Q 150,30 240,134" fill="none" stroke="rgba(155,89,182,0.25)" strokeWidth="1.5" strokeDasharray="6 4" className="lp-route-dash" />
                </svg>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── LOAD PIPELINE ──────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 48px', background: '#fff', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 12, textAlign: 'center' }}>THE PIPELINE</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, textAlign: 'center', marginBottom: 16, color: '#1a1a1a' }}>Every Load. Every Stage.</h2>
            <p style={{ fontSize: 16, color: 'rgba(26,26,26,0.45)', textAlign: 'center', marginBottom: 52, maxWidth: 500, margin: '0 auto 52px' }}>From booking to invoice — Q moves your loads through every stage automatically.</p>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="lp-mockup-card" style={{ background: '#0a0a0e', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.2), 0 0 60px rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.1)' }}>
              {/* Pipeline tabs */}
              <div style={{ padding: '14px 24px 0', display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
                {[
                  { label: 'Booked', count: 2, color: '#3b82f6', active: false },
                  { label: 'Dispatched', count: 1, color: '#a855f7', active: false },
                  { label: 'In Transit', count: 3, color: '#f0a500', active: true },
                  { label: 'Delivered', count: 2, color: '#22c55e', active: false },
                  { label: 'Invoiced', count: 4, color: '#00d4aa', active: false },
                ].map(tab => (
                  <div key={tab.label} style={{ padding: '10px 20px 14px', fontSize: 12, fontWeight: 700, color: tab.active ? '#f0a500' : 'rgba(255,255,255,0.25)', letterSpacing: 0.5, borderBottom: tab.active ? '2px solid #f0a500' : '2px solid transparent', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {tab.label}
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: tab.active ? 'rgba(240,165,0,0.15)' : 'rgba(255,255,255,0.04)', color: tab.active ? '#f0a500' : 'rgba(255,255,255,0.2)' }}>{tab.count}</span>
                  </div>
                ))}
              </div>
              {/* Pipeline columns */}
              <div className="lp-pipeline-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, padding: '18px 20px 22px' }}>
                {[
                  { title: 'Booked', color: '#3b82f6', loads: [
                    { route: 'PHX → LAX', rate: '$1,600', rpm: '$3.20/mi', driver: 'Open' },
                    { route: 'SEA → PDX', rate: '$890', rpm: '$4.10/mi', driver: 'Open' },
                  ]},
                  { title: 'Dispatched', color: '#a855f7', loads: [
                    { route: 'ATL → MIA', rate: '$2,100', rpm: '$2.80/mi', driver: 'Carlos R.' },
                  ]},
                  { title: 'In Transit', color: '#f0a500', loads: [
                    { route: 'DAL → ATL', rate: '$3,840', rpm: '$2.95/mi', driver: 'Mike J.', progress: 65 },
                    { route: 'CHI → DET', rate: '$1,890', rpm: '$6.75/mi', driver: 'Amir K.', progress: 40 },
                    { route: 'DEN → LAX', rate: '$2,450', rpm: '$2.35/mi', driver: 'James W.', progress: 80 },
                  ]},
                  { title: 'Delivered', color: '#22c55e', loads: [
                    { route: 'NYC → BOS', rate: '$1,450', rpm: '$4.80/mi', driver: 'Sarah M.' },
                    { route: 'MEM → CHI', rate: '$1,720', rpm: '$3.10/mi', driver: 'David L.' },
                  ]},
                  { title: 'Invoiced', color: '#00d4aa', loads: [
                    { route: 'MIA → ATL', rate: '$1,980', rpm: '$2.90/mi', inv: '#1845' },
                    { route: 'HOU → DAL', rate: '$680', rpm: '$7.00/mi', inv: '#1846' },
                    { route: 'LAX → PHX', rate: '$1,200', rpm: '$3.40/mi', inv: '#1847' },
                    { route: 'BOS → NYC', rate: '$890', rpm: '$4.50/mi', inv: '#1848' },
                  ]},
                ].map(col => (
                  <div key={col.title}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: col.color, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: col.color }} />
                      {col.title}
                    </div>
                    {col.loads.map((load, j) => (
                      <div key={j} style={{ background: `${col.color}08`, borderLeft: `2px solid ${col.color}`, borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{load.route}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{load.driver || load.inv}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: col.color }}>{load.rate}</span>
                        </div>
                        {load.progress && (
                          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, marginTop: 5, overflow: 'hidden' }}>
                            <div style={{ width: `${load.progress}%`, height: '100%', background: col.color, borderRadius: 1 }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {/* Pipeline footer stats */}
              <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Active: <strong style={{ color: '#f0a500' }}>12 loads</strong></span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Revenue: <strong style={{ color: '#22c55e' }}>$20,690</strong></span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Profit: <strong style={{ color: '#00d4aa' }}>$9,380</strong></span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>Q auto-dispatched <strong style={{ color: '#f0a500' }}>4 loads</strong> today</span>
              </div>
            </div>
          </FadeIn>

          {/* ── INVOICE FACTORY — Bill to Broker ──────────────────────── */}
          <FadeIn delay={0.2}>
            <div style={{ marginTop: 48 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 16, textAlign: 'center' }}>INVOICE FACTORY</p>
              <h3 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 2, textAlign: 'center', marginBottom: 32, color: '#1a1a1a' }}>Delivered? Billed. Automatically.</h3>
            </div>
            <div className="lp-invoice-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Invoice cards — bills to brokers */}
              <div className="lp-mockup-card" style={{ background: '#0a0a0e', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(240,165,0,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f0a500', letterSpacing: 1 }}>RECENT INVOICES</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>This Week</span>
                </div>
                <div style={{ padding: '12px 18px' }}>
                  {[
                    { inv: 'INV-1845', broker: 'TQL Logistics', route: 'MIA → ATL', amount: '$1,980', status: 'Sent', statusColor: '#f0a500' },
                    { inv: 'INV-1846', broker: 'CH Robinson', route: 'HOU → DAL', amount: '$680', status: 'Paid', statusColor: '#22c55e' },
                    { inv: 'INV-1847', broker: 'Echo Global', route: 'LAX → PHX', amount: '$1,200', status: 'Sent', statusColor: '#f0a500' },
                    { inv: 'INV-1848', broker: 'Coyote Logistics', route: 'BOS → NYC', amount: '$890', status: 'Factored', statusColor: '#00d4aa' },
                    { inv: 'INV-1844', broker: 'XPO Logistics', route: 'DAL → ATL', amount: '$3,840', status: 'Paid', statusColor: '#22c55e' },
                  ].map((inv, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: inv.statusColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{inv.inv}</span>
                          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#f0a500' }}>{inv.amount}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{inv.broker} · {inv.route}</span>
                          <span style={{ fontSize: 8, fontWeight: 700, color: inv.statusColor, background: `${inv.statusColor}15`, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.5 }}>{inv.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Total billed: <strong style={{ color: '#f0a500' }}>$8,590</strong></span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Collected: <strong style={{ color: '#22c55e' }}>$4,520</strong></span>
                </div>
              </div>

              {/* Single invoice preview */}
              <div className="lp-mockup-card" style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
                <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(26,26,26,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Invoice</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a' }}>INV-1845</div>
                  </div>
                  <div style={{ padding: '4px 10px', background: 'rgba(240,165,0,0.08)', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#f0a500', letterSpacing: 0.5 }}>SENT TO BROKER</div>
                </div>
                <div style={{ padding: '16px 22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)', marginBottom: 2 }}>Bill To</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>TQL Logistics</div>
                      <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)' }}>Cincinnati, OH</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)', marginBottom: 2 }}>Date</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>Apr 4, 2026</div>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12 }}>
                    {[
                      { label: 'Route', value: 'Miami, FL → Atlanta, GA' },
                      { label: 'Miles', value: '662 mi' },
                      { label: 'Load #', value: 'TQL-482917' },
                      { label: 'Driver', value: 'Sarah M. — Unit 312' },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)' }}>{row.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '2px solid rgba(0,0,0,0.08)', marginTop: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a' }}>Total Due</span>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#f0a500', lineHeight: 1 }}>$1,980</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <div style={{ flex: 1, padding: '8px 0', background: 'linear-gradient(135deg, #f0a500, #e09000)', borderRadius: 8, textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#000', letterSpacing: 0.5 }}>SEND INVOICE</div>
                    <div style={{ flex: 1, padding: '8px 0', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 8, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#00d4aa', letterSpacing: 0.5 }}>QUICK FACTOR</div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── MEET Q — VOICE AI SECTION ──────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 48px', background: 'linear-gradient(180deg, #0a0a0e 0%, #12141a 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(240,165,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(240,165,0,0.02) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle, rgba(240,165,0,0.1) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 12 }}>MEET Q</p>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, color: '#fff', marginBottom: 16 }}>Your AI That Talks Back</h2>
              <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', maxWidth: 500, margin: '0 auto' }}>Q doesn't just analyze — it speaks. Call Q, ask for loads, check status, get paid. Hands-free while you drive.</p>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
            {/* Q Orb + Voice Bars */}
            <FadeIn delay={0.1}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%, #f0a500, #c48400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 60, color: '#0a0a0e', boxShadow: '0 0 60px rgba(240,165,0,0.3), 0 0 120px rgba(240,165,0,0.1)' }}>
                  Q
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 40 }}>
                  {[0, 0.1, 0.2, 0.15, 0.25, 0.05, 0.3, 0.12, 0.22, 0.08, 0.28, 0.18].map((d, i) => (
                    <div key={i} style={{ width: 4, background: '#f0a500', borderRadius: 2, animation: 'lpVoiceBar 0.8s ease-in-out infinite alternate', animationDelay: `${d}s`, height: 10 }} />
                  ))}
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>"Hey Q, find me a load from Atlanta..."</p>
              </div>
            </FadeIn>
            {/* Phone mockup with chat */}
            <FadeIn delay={0.2}>
              <div style={{ width: 280, height: 480, background: '#131720', borderRadius: 36, border: '2px solid rgba(240,165,0,0.15)', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.5)', margin: '0 auto' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0a500', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#0a0a0e', fontWeight: 700 }}>Q</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Q Dispatch AI</div>
                    <div style={{ fontSize: 9, color: '#22c55e' }}>● Autonomous Mode</div>
                  </div>
                </div>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { q: true, text: '🚛 New load dispatched!\nDAL → ATL · 1,300 mi\n$3,840 · $2.95/mi' },
                    { q: false, text: 'Got it Q, rolling out now' },
                    { q: true, text: '✅ GPS check-in at shipper.\nStatus → At Pickup\nDock 7. Load time: 45 min.' },
                    { q: true, text: '💰 Delivered. POD uploaded.\nInvoice #1847 sent.\nDriver pay: $1,075.20' },
                    { q: false, text: 'Q, find backhaul from ATL' },
                    { q: true, text: 'Best: ATL → MIA\n$2,190 · $2.80/mi\nBroker: TQL (A-rated)' },
                  ].map((msg, i) => (
                    <div key={i} style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 14, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-line', alignSelf: msg.q ? 'flex-start' : 'flex-end', background: msg.q ? 'rgba(240,165,0,0.08)' : 'rgba(255,255,255,0.05)', border: msg.q ? '1px solid rgba(240,165,0,0.15)' : '1px solid rgba(255,255,255,0.08)', borderBottomLeftRadius: msg.q ? 4 : 14, borderBottomRightRadius: msg.q ? 14 : 4, color: 'rgba(255,255,255,0.85)' }}>
                      {msg.text}
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── FEATURES + PRICING ─────────────────────────────────────── */}
      <section id="features" className="lp-section lp-section-glow" style={{ padding: '100px 40px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 12, textAlign: 'center' }}>EVERYTHING INCLUDED</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, textAlign: 'center', marginBottom: 52, color: '#1a1a1a' }}>One Platform. One Price.</h2>
          </FadeIn>

          {/* Features grid — compact 3-column */}
          <div className="lp-features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 64 }}>
            {[
              { title: 'AI Dispatch', desc: 'Q picks loads based on your lanes, equipment, and profit targets.', icon: Truck, color: '#f0a500' },
              { title: 'Auto Invoicing', desc: 'Invoices created after delivery. Send, track, and factor instantly.', icon: Zap, color: '#22c55e' },
              { title: 'Profit Tracking', desc: 'Real profit per load, driver, and lane. Not estimates — real numbers.', icon: TrendingUp, color: '#3b82f6' },
              { title: 'Driver Management', desc: 'Assign loads, settlements, pay — percentage, per-mile, or flat.', icon: Users, color: '#a855f7' },
              { title: 'IFTA & Compliance', desc: 'Mileage tracking, fuel tax reports, and alerts — automatic.', icon: Shield, color: '#00d4aa' },
              { title: 'Fleet Tracking', desc: 'GPS tracking, geofence alerts, detention timers — real-time.', icon: Clock, color: '#e67e22' },
            ].map((feat, i) => (
              <FadeIn key={feat.title} delay={i * 0.04}>
                <div className="lp-feature-card" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 16, padding: '24px 22px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${feat.color}12`, border: `1px solid ${feat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <Ic icon={feat.icon} size={18} color={feat.color} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>{feat.title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(26,26,26,0.45)', lineHeight: 1.6 }}>{feat.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Pricing — inline, not its own section */}
          <FadeIn delay={0.2}>
            <div id="pricing" style={{ maxWidth: 520, margin: '0 auto', background: '#0a0a0e', borderRadius: 24, padding: '48px 40px', position: 'relative', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.15), 0 0 60px rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.12)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #f0a500, #d48e00)' }} />
              <div style={{ position: 'absolute', width: 300, height: 300, top: '-50%', right: '-10%', background: 'radial-gradient(circle, rgba(240,165,0,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 72, color: '#f0a500', lineHeight: 1 }}>$79</span>
                  <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)' }}>/mo</span>
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', marginBottom: 28 }}>+ $39/mo per additional truck</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, textAlign: 'left', marginBottom: 32 }}>
                  {['AI dispatch', 'Auto invoicing', 'IFTA reporting', 'Compliance', 'Fleet tracking', 'Driver management', 'Expense tracking', 'P&L dashboard', 'Voice AI (Q)', 'Receipt scanning'].map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '5px 0' }}>
                      <Ic icon={Check} size={13} color="#f0a500" /><span>{f}</span>
                    </div>
                  ))}
                </div>
                <button className="lp-cta-btn" onClick={() => handleCheckout('tms_pro')} disabled={checkoutLoading === 'tms_pro'}
                  style={{ width: '100%', padding: '18px 0', fontSize: 16, fontWeight: 800, borderRadius: 14, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, background: 'linear-gradient(135deg, #f0a500, #e09000)', color: '#000', border: 'none', opacity: checkoutLoading === 'tms_pro' ? 0.6 : 1, boxShadow: '0 12px 40px rgba(240,165,0,0.3)' }}>
                  {checkoutLoading === 'tms_pro' ? 'Loading...' : 'START 14-DAY FREE TRIAL'}
                </button>
                <p style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>No credit card required · Cancel anytime</p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── BOTTOM CTA ─────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '140px 40px', textAlign: 'center', background: '#fff', borderTop: '1px solid rgba(0,0,0,0.06)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 500, height: 500, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <FadeIn>
          <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative', zIndex: 1 }}>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 60, letterSpacing: 4, lineHeight: 0.95, marginBottom: 22, color: '#1a1a1a' }}>
              RUN YOUR ENTIRE<br />TRUCKING BUSINESS<br /><span style={{ color: '#f0a500', textShadow: '0 0 40px rgba(240,165,0,0.15)' }}>WITH AI.</span>
            </h2>
            <p style={{ fontSize: 19, color: 'rgba(26,26,26,0.45)', lineHeight: 1.7, marginBottom: 40 }}>Set up in minutes. Start your first load today.</p>
            <button className="lp-cta-btn" onClick={handleTry}
              style={{ background: 'linear-gradient(135deg, #f0a500, #d48e00)', border: 'none', borderRadius: 14, padding: '20px 64px', color: '#000', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, boxShadow: '0 16px 50px rgba(240,165,0,0.35)' }}>
              START FREE TRIAL
            </button>
            <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(26,26,26,0.25)', fontWeight: 500 }}>No credit card required</p>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '48px 40px 60px', background: 'var(--surface)' }}>
        <div className="lp-footer-grid" style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, fontFamily: "'Bebas Neue', sans-serif" }}><span style={{ color: 'var(--accent)' }}>QI</span><span style={{ color: '#1a1a1a' }}>VORI</span></span><span style={{ marginLeft: 10, padding: '3px 8px', background: 'rgba(240,165,0,0.1)', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#f0a500', letterSpacing: 1 }}>AI</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 280 }}>
              {t('landing.footerDesc')}
            </p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 14 }}>{t('landing.footerPlatform')}</div>
            {[
              { key: 'landing.feat.aiLoadBoard' },
              { key: 'landing.aiFleetTracking' },
              { key: 'landing.iftaFiling' },
              { key: 'landing.invoicing' },
              { key: 'landing.compliance' },
            ].map(l => (
              <a key={l.key} href="#features" style={{ display: 'block', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '4px 0', transition: 'color 0.15s' }}
                onMouseOver={e => e.target.style.color = 'var(--text)'} onMouseOut={e => e.target.style.color = 'var(--muted)'}>{t(l.key)}</a>
            ))}
            <a href="#/loads" style={{ display: 'block', fontSize: 13, color: 'var(--accent)', textDecoration: 'none', padding: '6px 0 4px', fontWeight: 600, transition: 'color 0.15s' }}
              onMouseOver={e => e.target.style.color = '#ffc340'} onMouseOut={e => e.target.style.color = 'var(--accent)'}>
              {t('landing.searchLoadsFooter')} &rarr;
            </a>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 14 }}>{t('landing.footerCompany')}</div>
            {[
              { key: 'landing.about', href: '#about' },
              { key: 'landing.navPricing', href: '#pricing' },
              { key: 'landing.blog', href: '#/guides/ifta-reporting' },
              { key: 'landing.careers', href: 'mailto:hello@qivori.com' },
              { key: 'landing.contact', href: 'mailto:hello@qivori.com' },
            ].map(l => (
              <a key={l.key} href={l.href} style={{ display: 'block', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '4px 0', transition: 'color 0.15s' }}
                onMouseOver={e => e.target.style.color = 'var(--text)'} onMouseOut={e => e.target.style.color = 'var(--muted)'}>{t(l.key)}</a>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 14 }}>{t('landing.footerLegal')}</div>
            {[
              { key: 'landing.privacyPolicy', href: '#/privacy' },
              { key: 'landing.termsOfService', href: '#/terms' },
              { key: 'landing.cookiePolicy', href: '#', title: 'Coming soon' },
            ].map(l => (
              <a key={l.key} href={l.href} title={l.title} style={{ display: 'block', fontSize: 13, color: 'var(--muted)', textDecoration: 'none', padding: '4px 0', transition: 'color 0.15s' }}
                onMouseOver={e => e.target.style.color = 'var(--text)'} onMouseOut={e => e.target.style.color = 'var(--muted)'}>{t(l.key)}</a>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 960, margin: '0 auto', paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('landing.footerCopyright')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Built from the cab, not Silicon Valley.</div>
        </div>
      </footer>

      {/* ── LIVE CHAT BUBBLE ───────────────────────────────────────── */}

      {/* ── VIDEO MODAL ─────────────────────────────────────────────── */}
      {videoModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setVideoModal(false) }}
        >
          <div style={{ position: 'relative', width: '100%', maxWidth: 900, aspectRatio: '16/9' }}>
            <button
              onClick={() => setVideoModal(false)}
              style={{ position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 28, lineHeight: 1, padding: 4, zIndex: 1 }}
              aria-label="Close video"
            >
              <Ic icon={X} size={28} color="#fff" />
            </button>
            {/* TODO: Replace with YouTube embed once demo video is recorded */}
            <div style={{ width: '100%', height: '100%', borderRadius: 16, background: 'linear-gradient(135deg, #12141a 0%, #1a1f2a 100%)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', border: '2px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><polygon points="9.5,7.5 16.5,12 9.5,16.5" fill="#f0a500"/></svg>
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2, color: '#c8d0dc' }}>Demo Video Coming Soon</div>
              <div style={{ fontSize: 13, color: '#6b7590', maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>We're putting the finishing touches on our product walkthrough. Check back soon.</div>
            </div>
          </div>
        </div>
      )}

      {/* ── DEMO REQUEST MODAL ─────────────────────────────────────── */}
      {(demoModal || demoSent) && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setDemoModal(false); setDemoSent(false) } }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:32, maxWidth:420, width:'100%', position:'relative', maxHeight:'90vh', overflowY:'auto' }}>
            <button onClick={() => { setDemoModal(false); setDemoSent(false) }} style={{ position:'absolute', top:16, right:16, background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:18 }}><Ic icon={X} size={18} /></button>

            {demoSent ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ fontSize:48, marginBottom:16 }}><Ic icon={Mail} size={48} color="var(--accent)" /></div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:8 }}>
                  CHECK YOUR EMAIL
                </div>
                <div style={{ fontSize:14, color:'var(--muted)', lineHeight:1.7, marginBottom:8 }}>
                  We sent a demo access link to
                </div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--accent)', marginBottom:24 }}>
                  {demoForm.email}
                </div>
                <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, marginBottom:24 }}>
                  Click the link in your email to explore the full Qivori platform with sample data.
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <button onClick={() => { setDemoSent(false); setDemoModal(false) }}
                    style={{ width:'100%', padding:'14px', background:'linear-gradient(135deg, #f0a500, #e09000)', border:'none', borderRadius:12, color:'#000', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Got it
                  </button>
                  <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center' }}>
                    Didn't get it? Check your spam folder or <button onClick={() => { setDemoSent(false) }} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif", padding:0 }}>try again</button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{ textAlign:'center', marginBottom:24 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>
                    TRY <span style={{ color:'var(--accent)' }}>QIVORI</span>
                  </div>
                  <div style={{ fontSize:13, color:'var(--muted)' }}>Enter your info to get demo access</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { key:'name', label:'Full Name *', ph:'John Smith', required: true },
                    { key:'email', label:'Email *', ph:'john@trucking.com', type:'email', required: true },
                    { key:'phone', label:'Phone *', ph:'(555) 123-4567', type:'tel', required: true },
                    { key:'company', label:'Company *', ph:'Your Trucking LLC', required: true },
                    { key:'truckCount', label:'How many trucks?', ph:'1-3', required: false },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                      <input value={demoForm[f.key]} onChange={e => { setDemoError(''); setDemoForm(p => ({ ...p, [f.key]: e.target.value })) }}
                        placeholder={f.ph} type={f.type || 'text'} required={f.required}
                        onKeyDown={e => e.key === 'Enter' && handleDemoSubmit()}
                        style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', color:'var(--text)', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }} />
                    </div>
                  ))}
                  <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, marginTop:4 }}>
                    <div style={{ fontSize:11, color:'var(--accent)', fontWeight:700, marginBottom:8, letterSpacing:1, textTransform:'uppercase' }}>Help us build for you</div>
                  </div>
                  {[
                    { key:'currentELD', label:'Current ELD Provider', ph:'Samsara, Motive, KeepTruckin, None...' },
                    { key:'factoringCompany', label:'Factoring Company', ph:'OTR Solutions, Triumph, RTS, None...' },
                    { key:'loadBoards', label:'Load Boards You Use', ph:'DAT, 123Loadboard, Truckstop, None...' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                      <input value={demoForm[f.key]} onChange={e => { setDemoError(''); setDemoForm(p => ({ ...p, [f.key]: e.target.value })) }}
                        placeholder={f.ph} type="text"
                        onKeyDown={e => e.key === 'Enter' && handleDemoSubmit()}
                        style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', color:'var(--text)', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Biggest pain point right now?</label>
                    <textarea value={demoForm.painPoints} onChange={e => { setDemoError(''); setDemoForm(p => ({ ...p, painPoints: e.target.value })) }}
                      placeholder="Finding loads, cash flow, compliance, dispatching..."
                      rows={2}
                      style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', color:'var(--text)', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box', resize:'none' }} />
                  </div>
                  {/* Honeypot — hidden from real users, bots will fill it */}
                  <input name="website" value={demoForm._hp} onChange={e => setDemoForm(p => ({ ...p, _hp: e.target.value }))}
                    tabIndex={-1} autoComplete="off" aria-hidden="true"
                    style={{ position:'absolute', left:'-9999px', opacity:0, height:0, width:0, overflow:'hidden' }} />
                </div>
                {demoError && (
                  <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, fontSize:13, color:'#ef4444', textAlign:'center' }}>
                    {demoError}
                  </div>
                )}
                <button onClick={handleDemoSubmit} disabled={demoLoading || !demoForm.name.trim() || !demoForm.email.trim() || !demoForm.phone.trim() || !demoForm.company.trim()}
                  style={{ width:'100%', marginTop:20, padding:'14px', background: demoLoading ? 'var(--border)' : 'linear-gradient(135deg, #f0a500, #e09000)', border:'none', borderRadius:12, color:'#000', fontSize:15, fontWeight:800, cursor: demoLoading ? 'wait' : 'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  {demoLoading ? 'Sending...' : <><Ic icon={Send} size={16} /> Get Demo Link</>}
                </button>
                <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:12 }}>
                  No credit card needed · We'll email you a demo link
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
