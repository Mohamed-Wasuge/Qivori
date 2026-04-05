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
          .lp-steps-row { flex-direction: column !important; }
          .lp-compare-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .lp-q-voice-grid { grid-template-columns: 1fr !important; }
          .lp-kanban-cols { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-section-heading { font-size: 36px !important; }
          .lp-footer-grid { grid-template-columns: 1fr !important; text-align: center !important; }
        }
        @media (max-width: 480px) {
          .lp-hero h1 { font-size: 36px !important; }
          .lp-section-heading { font-size: 30px !important; }
          .lp-kanban-cols { grid-template-columns: 1fr !important; }
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
            { label: 'How It Works', href: '#how-it-works' },
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
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How It Works</a>
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

      {/* ── LIVE STATS BAR ─────────────────────────────────────────── */}
      <section style={{ background: '#0a0a0e', borderTop: '1px solid rgba(240,165,0,0.1)', borderBottom: '1px solid rgba(240,165,0,0.1)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          {[
            { value: '247', label: 'Loads Scanned Today', color: '#f0a500' },
            { value: '$34.2K', label: 'Weekly Revenue', color: '#22c55e' },
            { value: '$2.74', label: 'Avg Rate/Mile', color: '#00d4aa' },
            { value: '94%', label: 'Q Confidence', color: '#4d8ef0' },
            { value: '8', label: 'Trucks on Load', color: '#a855f7' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center', flex: 1, minWidth: 100 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: stat.color, lineHeight: 1, marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROBLEM ──────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <FadeIn>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, lineHeight: 1.05, marginBottom: 44, textAlign: 'center', color: '#1a1a1a' }}>
              You're not running<br />your business.<br /><span style={{ color: '#f0a500' }}>You're chasing it.</span>
            </h2>
          </FadeIn>
          <div style={{ marginBottom: 40 }}>
            {['Checking load boards all day', 'Calling brokers nonstop', 'Tracking everything manually', 'Not knowing your real profit'].map((item, i) => (
              <FadeIn key={i} delay={i * 0.05}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <Ic icon={X} size={14} color="rgba(239,68,68,0.5)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 17, color: 'rgba(26,26,26,0.5)' }}>{item}</span>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={0.25}>
            <p style={{ fontSize: 18, color: 'rgba(26,26,26,0.45)', textAlign: 'center', lineHeight: 1.7 }}>
              You don't need another tool.<br /><span style={{ color: '#1a1a1a', fontWeight: 700 }}>You need control.</span>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── WATCH Q WORK — 5-step visual walkthrough ────────────────── */}
      <section id="how-it-works" className="lp-section" style={{ padding: '100px 48px', background: '#fff', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 12, textAlign: 'center' }}>HOW IT WORKS</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, textAlign: 'center', marginBottom: 72, color: '#1a1a1a' }}>Watch Q Work</h2>
          </FadeIn>

          {/* Step 1 */}
          <div className="lp-steps-row" style={{ display: 'flex', gap: 48, alignItems: 'center', marginBottom: 64 }}>
            <div className="lp-step-text" style={{ flex: 1 }}>
              <FadeIn>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#f0a500' }}>1</div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Q scans available loads</h3>
                </div>
                <p style={{ fontSize: 16, color: 'rgba(26,26,26,0.5)', lineHeight: 1.7, paddingLeft: 62, margin: 0 }}>Searches every load board and matches loads to your lanes, equipment, and preferences — in seconds.</p>
              </FadeIn>
            </div>
            <div className="lp-step-mockup" style={{ flex: 1 }}>
              <FadeIn delay={0.1}>
                <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
                  {[
                    { route: 'Dallas, TX → Houston, TX', rate: '$2,400', miles: '240 mi', active: true },
                    { route: 'Chicago, IL → Detroit, MI', rate: '$1,890', miles: '280 mi', active: false },
                    { route: 'Atlanta, GA → Miami, FL', rate: '$2,100', miles: '660 mi', active: false },
                  ].map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 10, marginBottom: i < 2 ? 6 : 0, background: l.active ? 'rgba(240,165,0,0.06)' : 'transparent', border: l.active ? '1.5px solid rgba(240,165,0,0.25)' : '1.5px solid transparent' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: l.active ? '#1a1a1a' : 'rgba(26,26,26,0.4)' }}>{l.route}</span>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: l.active ? '#f0a500' : 'rgba(26,26,26,0.3)' }}>{l.rate}</span>
                        <span style={{ fontSize: 12, color: 'rgba(26,26,26,0.25)' }}>{l.miles}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </FadeIn>
            </div>
          </div>

          {/* Step 2 — reversed */}
          <div className="lp-steps-row" style={{ display: 'flex', gap: 48, alignItems: 'center', marginBottom: 64, flexDirection: 'row-reverse' }}>
            <div className="lp-step-text" style={{ flex: 1 }}>
              <FadeIn>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#f0a500' }}>2</div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Calculates real profit</h3>
                </div>
                <p style={{ fontSize: 16, color: 'rgba(26,26,26,0.5)', lineHeight: 1.7, paddingLeft: 62, margin: 0 }}>Not revenue — actual profit. Q factors in fuel, driver pay, insurance, tolls, and deadhead miles.</p>
              </FadeIn>
            </div>
            <div className="lp-step-mockup" style={{ flex: 1 }}>
              <FadeIn delay={0.1}>
                <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', marginBottom: 14 }}>Profit Breakdown</div>
                  {[
                    { label: 'Load Rate', value: '$2,400', color: '#1a1a1a' },
                    { label: 'Fuel Cost', value: '-$480', color: 'rgba(239,68,68,0.7)' },
                    { label: 'Driver Pay (28%)', value: '-$672', color: 'rgba(239,68,68,0.7)' },
                    { label: 'Insurance & Fees', value: '-$198', color: 'rgba(239,68,68,0.7)' },
                  ].map((row, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 3 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: 14, color: 'rgba(26,26,26,0.5)' }}>{row.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', borderTop: '2px solid rgba(0,0,0,0.08)', marginTop: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a' }}>Net Profit</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>$1,050</span>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>

          {/* Step 3 */}
          <div className="lp-steps-row" style={{ display: 'flex', gap: 48, alignItems: 'center', marginBottom: 64 }}>
            <div className="lp-step-text" style={{ flex: 1 }}>
              <FadeIn>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#f0a500' }}>3</div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Decides: accept, negotiate, or reject</h3>
                </div>
                <p style={{ fontSize: 16, color: 'rgba(26,26,26,0.5)', lineHeight: 1.7, paddingLeft: 62, margin: 0 }}>Q doesn't just show options — it makes the call. Based on your history, market rates, and real margins.</p>
              </FadeIn>
            </div>
            <div className="lp-step-mockup" style={{ flex: 1 }}>
              <FadeIn delay={0.1}>
                <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <div style={{ flex: 1, background: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#22c55e' }}>✓ ACCEPT</div>
                    <div style={{ flex: 1, background: 'rgba(240,165,0,0.04)', border: '1px solid rgba(240,165,0,0.12)', borderRadius: 10, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'rgba(240,165,0,0.4)' }}>NEGOTIATE</div>
                    <div style={{ flex: 1, background: 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 10, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'rgba(239,68,68,0.3)' }}>REJECT</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', fontWeight: 600 }}>Q Confidence</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>94%</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: '94%', height: '100%', background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: 3 }} />
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>

          {/* Step 4 — reversed */}
          <div className="lp-steps-row" style={{ display: 'flex', gap: 48, alignItems: 'center', marginBottom: 64, flexDirection: 'row-reverse' }}>
            <div className="lp-step-text" style={{ flex: 1 }}>
              <FadeIn>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#f0a500' }}>4</div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Dispatches and tracks</h3>
                </div>
                <p style={{ fontSize: 16, color: 'rgba(26,26,26,0.5)', lineHeight: 1.7, paddingLeft: 62, margin: 0 }}>Load accepted? Q assigns the driver, sends dispatch details, and tracks the shipment in real time.</p>
              </FadeIn>
            </div>
            <div className="lp-step-mockup" style={{ flex: 1 }}>
              <FadeIn delay={0.1}>
                <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Marcus Johnson</div>
                      <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)', marginTop: 2 }}>Truck #4821 · Freightliner</div>
                    </div>
                    <div style={{ padding: '5px 12px', background: 'rgba(240,165,0,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#f0a500' }}>IN TRANSIT</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f0a500', margin: '0 auto 4px' }} />
                      <div style={{ fontSize: 10, color: 'rgba(26,26,26,0.4)' }}>DAL</div>
                    </div>
                    <div style={{ flex: 1, height: 2, background: 'rgba(0,0,0,0.08)', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '65%', top: -7, transform: 'translateX(-50%)' }}>
                        <Ic icon={Truck} size={16} color="#f0a500" />
                      </div>
                      <div style={{ width: '65%', height: '100%', background: '#f0a500', borderRadius: 1 }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.15)', margin: '0 auto 4px' }} />
                      <div style={{ fontSize: 10, color: 'rgba(26,26,26,0.4)' }}>HOU</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>

          {/* Step 5 */}
          <div className="lp-steps-row" style={{ display: 'flex', gap: 48, alignItems: 'center' }}>
            <div className="lp-step-text" style={{ flex: 1 }}>
              <FadeIn>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#f0a500' }}>5</div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Generates invoice automatically</h3>
                </div>
                <p style={{ fontSize: 16, color: 'rgba(26,26,26,0.5)', lineHeight: 1.7, paddingLeft: 62, margin: 0 }}>Load delivered? Invoice created, sent, and tracked — with one-click factoring if you need cash fast.</p>
              </FadeIn>
            </div>
            <div className="lp-step-mockup" style={{ flex: 1 }}>
              <FadeIn delay={0.1}>
                <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Invoice</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a' }}>INV-2024-0847</div>
                    </div>
                    <div style={{ padding: '5px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#22c55e' }}>SENT</div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12 }}>
                    {[
                      { label: 'Broker', value: 'TQL Logistics' },
                      { label: 'Route', value: 'Dallas → Houston' },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: 'rgba(26,26,26,0.4)' }}>{row.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{row.value}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Total</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a' }}>$2,400.00</span>
                    </div>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>

          <FadeIn delay={0.2}>
            <p style={{ fontSize: 15, color: 'rgba(26,26,26,0.3)', textAlign: 'center', marginTop: 48 }}>No spreadsheets. No switching apps. One system.</p>
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

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <section id="features" className="lp-section lp-section-glow" style={{ padding: '100px 40px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 12, textAlign: 'center' }}>FEATURES</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, textAlign: 'center', marginBottom: 56, color: '#1a1a1a' }}>Everything You Need</h2>
          </FadeIn>
          <div className="lp-features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {[
              { title: 'Smart Dispatch', desc: 'Q doesn\'t just show loads — it picks the right ones based on your lanes, equipment, and profit targets.', icon: Truck, color: '#f0a500' },
              { title: 'Auto Invoicing', desc: 'Invoices created automatically after delivery. Send, track, and factor — all in one place.', icon: Zap, color: '#22c55e' },
              { title: 'Profit Tracking', desc: 'Know exactly what you make per load, driver, and lane. Real numbers, not estimates.', icon: TrendingUp, color: '#3b82f6' },
              { title: 'Driver Management', desc: 'Assign loads, track settlements, manage pay — per-driver or per-mile, your choice.', icon: Users, color: '#a855f7' },
              { title: 'IFTA & Compliance', desc: 'Mileage tracking, fuel tax reports, and compliance alerts handled automatically.', icon: Shield, color: '#00d4aa' },
            ].map((feat, i) => (
              <FadeIn key={feat.title} delay={i * 0.06}>
                <div className="lp-feature-card" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 18, padding: '32px 28px', display: 'flex', gap: 18, alignItems: 'flex-start', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${feat.color}12`, border: `1px solid ${feat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic icon={feat.icon} size={20} color={feat.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>{feat.title}</div>
                    <div style={{ fontSize: 14, color: 'rgba(26,26,26,0.5)', lineHeight: 1.65 }}>{feat.desc}</div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARISON (dark section for contrast) ───────────────────── */}
      <section className="lp-section" style={{ padding: '100px 48px', background: 'linear-gradient(180deg, #0a0a0e 0%, #12141a 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(240,165,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(240,165,0,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle, rgba(240,165,0,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <FadeIn>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, textAlign: 'center', marginBottom: 60, color: '#fff' }}>The Difference</h2>
          </FadeIn>
          <div className="lp-compare-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
            <FadeIn>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: 'rgba(255,255,255,0.25)', marginBottom: 24 }}>YOUR CURRENT WORKFLOW</div>
                <div style={{ position: 'relative', height: 120, marginBottom: 24 }}>
                  {[
                    { name: 'DAT', rot: -3, top: 5, left: 0 },
                    { name: 'Excel', rot: 2, top: 15, left: 60 },
                    { name: 'QuickBooks', rot: -1, top: 35, left: 20 },
                    { name: 'Calculator', rot: 3, top: 50, left: 80 },
                    { name: 'Phone', rot: -2, top: 65, left: 40 },
                    { name: 'Email', rot: 1, top: 80, left: 100 },
                  ].map((app, i) => (
                    <div key={i} style={{ position: 'absolute', top: app.top, left: app.left, transform: `rotate(${app.rot}deg)`, padding: '6px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>{app.name}</div>
                  ))}
                </div>
                {['Multiple apps', 'Manual calculations', 'Guessing profit', 'Wasted time'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <Ic icon={X} size={14} color="rgba(239,68,68,0.4)" />
                    <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={0.1}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: '#f0a500', marginBottom: 24 }}>WITH QIVORI AI</div>
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 24 }}>
                  {[
                    { route: 'CHI → DET', profit: '$1,280', status: 'In Transit' },
                    { route: 'ATL → MIA', profit: '$890', status: 'Dispatched' },
                    { route: 'DAL → HOU', profit: '$1,050', status: 'Delivered' },
                  ].map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{l.route}</span>
                      <span style={{ fontSize: 10, color: l.status === 'Delivered' ? '#22c55e' : l.status === 'In Transit' ? '#f0a500' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{l.status}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>{l.profit}</span>
                    </div>
                  ))}
                </div>
                {['One system', 'AI decisions', 'Real profit clarity', 'Automated workflow'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <Ic icon={Check} size={14} color="#f0a500" />
                    <span style={{ fontSize: 15, color: '#fff', fontWeight: 600 }}>{item}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── PRODUCT SHOWCASE — Kanban Pipeline ────────────────────────── */}
      <section className="lp-section lp-section-glow" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 12, textAlign: 'center' }}>YOUR COMMAND CENTER</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, textAlign: 'center', marginBottom: 52, color: '#1a1a1a' }}>Everything. One Dashboard.</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="lp-mockup-card" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.1), 0 0 0 1px rgba(240,165,0,0.05)' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 8, background: '#f8f8f8' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                </div>
                <div style={{ flex: 1, marginLeft: 12, background: '#fff', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,0,0,0.06)' }}>qivori.com/dashboard</div>
              </div>
              <div style={{ padding: '14px 24px 0', display: 'flex', gap: 24, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                {['Booked', 'Dispatched', 'In Transit', 'Delivered', 'Invoiced'].map((tab, i) => (
                  <div key={tab} style={{ fontSize: 12, fontWeight: 700, color: i === 2 ? '#f0a500' : 'rgba(26,26,26,0.3)', letterSpacing: 0.5, paddingBottom: 12, borderBottom: i === 2 ? '2px solid #f0a500' : '2px solid transparent' }}>{tab}</div>
                ))}
              </div>
              <div className="lp-kanban-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '16px 20px 20px' }}>
                {[
                  { title: 'Booked', color: 'rgba(59,130,246,0.1)', borderColor: '#3b82f6', loads: [{ route: 'PHX → LAX', rate: '$1,600' }] },
                  { title: 'Dispatched', color: 'rgba(168,85,247,0.08)', borderColor: '#a855f7', loads: [{ route: 'ATL → MIA', rate: '$2,100' }] },
                  { title: 'In Transit', color: 'rgba(240,165,0,0.08)', borderColor: '#f0a500', loads: [{ route: 'CHI → DET', rate: '$1,890' }, { route: 'DAL → HOU', rate: '$2,400' }] },
                  { title: 'Delivered', color: 'rgba(34,197,94,0.06)', borderColor: '#22c55e', loads: [{ route: 'NYC → BOS', rate: '$1,450' }] },
                ].map((col) => (
                  <div key={col.title}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'rgba(26,26,26,0.35)', textTransform: 'uppercase', marginBottom: 8 }}>{col.title} <span style={{ color: 'rgba(26,26,26,0.2)' }}>({col.loads.length})</span></div>
                    {col.loads.map((load, j) => (
                      <div key={j} style={{ background: col.color, borderLeft: `3px solid ${col.borderColor}`, borderRadius: 8, padding: '10px 12px', marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>{load.route}</div>
                        <div style={{ fontSize: 11, color: 'rgba(26,26,26,0.4)' }}>{load.rate}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', background: '#FAFAFA', display: 'flex', gap: 32 }}>
                <span style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)' }}>Active Loads: <strong style={{ color: '#1a1a1a' }}>5</strong></span>
                <span style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)' }}>Revenue: <strong style={{ color: '#1a1a1a' }}>$9,440</strong></span>
                <span style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)' }}>Profit: <strong style={{ color: '#22c55e' }}>$4,270</strong></span>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOUNDER ──────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '80px 40px', background: '#fff', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 20 }}>THE FOUNDER</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, letterSpacing: 2, marginBottom: 32, color: '#1a1a1a' }}>Built by a trucker,<br />for truckers.</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ position: 'relative', padding: '28px 32px', background: '#FAFAFA', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 64, color: 'rgba(240,165,0,0.15)', lineHeight: 1, position: 'absolute', top: 12, left: 24 }}>"</div>
              <p style={{ fontSize: 17, color: 'rgba(26,26,26,0.6)', lineHeight: 1.8, textAlign: 'left', position: 'relative', zIndex: 1, margin: 0 }}>
                Qivori was born out of frustration. As an owner-operator, I spent more time on paperwork and phone calls than on the road. Every tool I tried solved one problem but created three more. So I built the system I wished existed — one AI that handles everything, from finding loads to generating invoices. This wasn't built in Silicon Valley. It was built from the cab.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, justifyContent: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #f0a500, #e09000)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic icon={Truck} size={18} color="#000" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Owner-Operator Turned Founder</div>
                  <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.4)' }}>Qivori AI</div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-section lp-section-glow" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 3, marginBottom: 12 }}>SIMPLE PRICING</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 3, marginBottom: 40, color: '#1a1a1a' }}>
              One plan. Everything.
            </h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ maxWidth: 440, margin: '0 auto', background: '#fff', border: '2px solid rgba(240,165,0,0.25)', borderRadius: 28, padding: '52px 36px 44px', position: 'relative', overflow: 'hidden', boxShadow: '0 20px 60px rgba(240,165,0,0.12), 0 0 0 1px rgba(240,165,0,0.05)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f0a500, #d48e00)' }} />
              <div style={{ marginBottom: 20, padding: '6px 14px', background: 'rgba(240,165,0,0.08)', borderRadius: 8, display: 'inline-block' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#f0a500', letterSpacing: 1 }}>EVERYTHING INCLUDED</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 68, color: '#f0a500', lineHeight: 1 }}>$79</span>
                <span style={{ fontSize: 18, color: 'rgba(26,26,26,0.35)' }}>/mo</span>
              </div>
              <div style={{ fontSize: 14, color: 'rgba(26,26,26,0.35)', marginBottom: 28 }}>+ $39/mo per additional truck</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, textAlign: 'left', marginBottom: 32 }}>
                {['AI dispatch', 'Auto invoicing', 'IFTA reporting', 'Compliance', 'Fleet tracking', 'Driver management', 'Expense tracking', 'P&L dashboard'].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(26,26,26,0.6)', padding: '5px 0' }}>
                    <Ic icon={Check} size={13} color="#f0a500" /><span>{f}</span>
                  </div>
                ))}
              </div>
              <button className="lp-cta-btn" onClick={() => handleCheckout('tms_pro')} disabled={checkoutLoading === 'tms_pro'}
                style={{ width: '100%', padding: '16px 0', fontSize: 15, fontWeight: 800, borderRadius: 12, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5, background: 'linear-gradient(135deg, #f0a500, #e09000)', color: '#000', border: 'none', opacity: checkoutLoading === 'tms_pro' ? 0.6 : 1, boxShadow: '0 4px 20px rgba(240,165,0,0.25)' }}>
                {checkoutLoading === 'tms_pro' ? 'Loading...' : 'START FREE TRIAL'}
              </button>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(26,26,26,0.3)' }}>14-day free trial · No credit card required · Cancel anytime</p>
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
