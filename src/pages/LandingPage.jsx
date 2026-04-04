import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { trackDemoRequest, trackDemoEnter, trackCheckout } from '../lib/analytics'
import { useTranslation } from '../lib/i18n'
import { TrendingUp, Truck, Zap, Check, X, Mail, Users, Shield, Send } from 'lucide-react'

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
    <div style={{ background: '#0B0F14', color: '#fff', fontFamily: "'DM Sans', sans-serif", overflowY: 'auto', height: '100dvh', position: 'fixed', inset: 0, zIndex: 10, WebkitOverflowScrolling: 'touch' }}>

      {/* ── STYLES ────────────────────────────────────────────────────── */}
      <style>{`
        .lp-nav-links { display: flex; align-items: center; gap: 28px; }
        .lp-mob-toggle { display: none !important; }
        .lp-mob-menu { display: none; }
        .lp-cta-btn { transition: all 0.2s ease; }
        .lp-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 16px 48px rgba(240,165,0,0.35) !important; }
        .lp-feature-card { transition: all 0.3s ease; }
        .lp-feature-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,0.4); border-color: rgba(240,165,0,0.2) !important; }
        .lp-nav-link { position: relative; }
        .lp-nav-link::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 2px; background: #f0a500; transition: width 0.2s; }
        .lp-nav-link:hover::after { width: 100%; }
        .lp-step-card { transition: all 0.25s ease; }
        .lp-step-card:hover { border-color: rgba(240,165,0,0.25) !important; background: rgba(240,165,0,0.03) !important; }
        @media (max-width: 780px) {
          .lp-nav { padding: 0 16px !important; }
          .lp-nav-links { display: none !important; }
          .lp-mob-toggle { display: flex !important; }
          .lp-mob-menu {
            display: flex; flex-direction: column; gap: 8px;
            position: absolute; top: 64px; left: 0; right: 0;
            background: rgba(11,15,20,0.98); border-bottom: 1px solid rgba(255,255,255,0.06);
            padding: 20px; z-index: 99; backdrop-filter: blur(16px);
          }
          .lp-mob-menu a { font-size: 15px; color: rgba(255,255,255,0.5); text-decoration: none; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .lp-mob-menu .lp-mob-btns { display: flex; gap: 10px; margin-top: 12px; }
          .lp-mob-menu .lp-mob-btns button { flex: 1; }
          .lp-hero-grid { grid-template-columns: 1fr !important; text-align: center !important; }
          .lp-hero-left { align-items: center !important; }
          .lp-hero { padding: 80px 20px 60px !important; }
          .lp-section { padding: 60px 20px !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-steps-grid { grid-template-columns: 1fr !important; }
          .lp-compare-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
          .lp-preview-row { flex-direction: column !important; }
          .lp-preview-card { min-width: 0 !important; }
          .lp-section-heading { font-size: 36px !important; }
          .lp-footer-grid { grid-template-columns: 1fr !important; text-align: center !important; }
        }
        @media (max-width: 480px) {
          .lp-hero h1 { font-size: 36px !important; }
          .lp-section-heading { font-size: 30px !important; }
        }
      `}</style>

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <nav className="lp-nav" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(11,15,20,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '0 48px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, fontFamily: "'Bebas Neue', sans-serif" }}><span style={{ color: '#f0a500' }}>QI</span><span style={{ color: '#fff' }}>VORI</span></span><span style={{ marginLeft: 10, padding: '3px 8px', background: 'rgba(240,165,0,0.15)', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#f0a500', letterSpacing: 1 }}>AI</span>
        </div>

        <button className="lp-mob-toggle" onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>
          {menuOpen ? '✕' : '☰'}
        </button>

        <div className="lp-nav-links">
          {[
            { label: 'Features', href: '#features' },
            { label: 'How It Works', href: '#how-it-works' },
            { label: 'Pricing', href: '#pricing' },
          ].map(item => (
            <a key={item.label} href={item.href} className="lp-nav-link"
              style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
              onMouseOver={e => e.target.style.color = '#fff'}
              onMouseOut={e => e.target.style.color = 'rgba(255,255,255,0.5)'}>
              {item.label}
            </a>
          ))}
          <button onClick={onGetStarted}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 18px', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
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
              <button onClick={onGetStarted} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Sign In</button>
              <button onClick={handleTry} style={{ padding: '12px', background: '#f0a500', border: 'none', borderRadius: 10, color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>START FREE TRIAL</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO — split layout with dashboard visual ──────────────── */}
      <section className="lp-hero" style={{ padding: '120px 48px 100px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="lp-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          {/* LEFT — copy */}
          <div className="lp-hero-left" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <FadeIn>
              <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, letterSpacing: 3, lineHeight: 1, marginBottom: 24, color: '#fff' }}>
                Your Dispatcher<br />Is Now <span style={{ color: '#f0a500' }}>AI.</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.1}>
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 12, maxWidth: 440 }}>
                Q finds loads, calculates real profit, negotiates rates, and runs your operation — automatically.
              </p>
              <p style={{ fontSize: 15, color: '#f0a500', fontWeight: 600, marginBottom: 40 }}>
                More money. Less stress. No extra apps.
              </p>
            </FadeIn>
            <FadeIn delay={0.2}>
              <button className="lp-cta-btn" onClick={handleTry}
                style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 12, padding: '18px 48px', color: '#000', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", boxShadow: '0 8px 32px rgba(240,165,0,0.25)', letterSpacing: 1.5 }}>
                START FREE TRIAL
              </button>
              <p style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>14-day free trial &middot; No credit card required</p>
            </FadeIn>
          </div>

          {/* RIGHT — dashboard visual */}
          <FadeIn delay={0.15}>
            <div style={{ background: '#0e1218', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 0, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
              {/* Browser chrome */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                </div>
                <div style={{ flex: 1, marginLeft: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>qivori.com</div>
              </div>

              {/* Dashboard content */}
              <div style={{ padding: '20px 20px 24px' }}>
                {/* Load card */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Dallas, TX → Houston, TX</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 8px', borderRadius: 6 }}>HIGH PROFIT</span>
                  </div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Rate</div><div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>$2,400</div></div>
                    <div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Miles</div><div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>1,200</div></div>
                    <div><div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Profit</div><div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>$1,050</div></div>
                  </div>
                </div>

                {/* AI Decision */}
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 }}>AI Decision</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#22c55e', letterSpacing: 0.5 }}>ACCEPT</div>
                  <div style={{ flex: 1, background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 10, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'rgba(240,165,0,0.5)', letterSpacing: 0.5 }}>NEGOTIATE</div>
                  <div style={{ flex: 1, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 10, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'rgba(239,68,68,0.4)', letterSpacing: 0.5 }}>REJECT</div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── PROBLEM ──────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <FadeIn>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, lineHeight: 1.05, marginBottom: 48, textAlign: 'center' }}>
              You're not running<br />your business.<br /><span style={{ color: '#f0a500' }}>You're chasing it.</span>
            </h2>
          </FadeIn>

          <div style={{ marginBottom: 48 }}>
            {['Checking load boards all day', 'Calling brokers nonstop', 'Tracking everything manually', 'Not knowing your real profit'].map((item, i) => (
              <FadeIn key={i} delay={i * 0.05}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Ic icon={X} size={14} color="rgba(239,68,68,0.5)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>{item}</span>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.25}>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.7 }}>
              You don't need another tool.<br /><span style={{ color: '#fff', fontWeight: 700 }}>You need control.</span>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── SOLUTION ──────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px', background: 'rgba(240,165,0,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <FadeIn>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, lineHeight: 1.05, marginBottom: 48, textAlign: 'center' }}>
              Q runs your<br />operation <span style={{ color: '#f0a500' }}>for you.</span>
            </h2>
          </FadeIn>

          <div style={{ marginBottom: 48 }}>
            {['Finds the best loads', 'Calculates real profit (after fuel, not guesses)', 'Decides what to take, negotiate, or reject', 'Tracks everything automatically'].map((item, i) => (
              <FadeIn key={i} delay={i * 0.05}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Ic icon={Check} size={16} color="#f0a500" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 16, color: '#fff', fontWeight: 500 }}>{item}</span>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.25}>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.7 }}>
              You focus on driving.<br /><span style={{ color: '#f0a500', fontWeight: 700 }}>Q handles the rest.</span>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── HOW IT WORKS — 5 horizontal cards ─────────────────────── */}
      <section id="how-it-works" className="lp-section" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 2, marginBottom: 12, textAlign: 'center' }}>HOW IT WORKS</p>
          </FadeIn>

          <div className="lp-steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 48 }}>
            {[
              { step: '1', text: 'Q scans available loads' },
              { step: '2', text: 'Calculates profit' },
              { step: '3', text: 'Decides: accept, negotiate, or reject' },
              { step: '4', text: 'Dispatches and tracks' },
              { step: '5', text: 'Generates invoice' },
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 0.06}>
                <div className="lp-step-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '28px 20px', textAlign: 'center', height: '100%' }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: '#f0a500', marginBottom: 12, lineHeight: 1 }}>{item.step}</div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{item.text}</div>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.35}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 32 }}>No spreadsheets. No switching apps.</p>
          </FadeIn>
        </div>
      </section>

      {/* ── FEATURES — 2-column card grid ──────────────────────────── */}
      <section id="features" className="lp-section" style={{ padding: '100px 40px', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div className="lp-features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {[
              { title: 'Smart Dispatch', desc: 'Q doesn\'t just show loads — it picks the right ones.', icon: Truck },
              { title: 'Auto Invoicing', desc: 'Invoices created automatically after delivery.', icon: Zap },
              { title: 'Profit Tracking', desc: 'Know exactly what you make per load, driver, and lane.', icon: TrendingUp },
              { title: 'Driver Management', desc: 'Assign and track drivers in one place.', icon: Users },
              { title: 'IFTA & Compliance', desc: 'Handled automatically in the background.', icon: Shield },
            ].map((feat, i) => (
              <FadeIn key={feat.title} delay={i * 0.05}>
                <div className="lp-feature-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '28px 24px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic icon={feat.icon} size={18} color="#f0a500" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{feat.title}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{feat.desc}</div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT PREVIEW — wide dashboard mockup ───────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ background: '#0e1218', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>
              {/* Browser bar */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                </div>
                <div style={{ flex: 1, marginLeft: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>qivori.com/dashboard</div>
              </div>

              {/* Pipeline header */}
              <div style={{ padding: '16px 24px 8px', display: 'flex', gap: 16 }}>
                {['Booked', 'Dispatched', 'In Transit', 'Delivered'].map((s, i) => (
                  <div key={s} style={{ fontSize: 11, fontWeight: 700, color: i === 2 ? '#f0a500' : 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', borderBottom: i === 2 ? '2px solid #f0a500' : '2px solid transparent', paddingBottom: 8 }}>{s}</div>
                ))}
              </div>

              {/* Load rows */}
              <div style={{ padding: '8px 24px 20px' }}>
                {[
                  { route: 'Chicago, IL → Detroit, MI', driver: 'Marcus J.', status: 'In Transit', profit: '$1,280', rpm: '$3.12/mi' },
                  { route: 'Atlanta, GA → Miami, FL', driver: 'David R.', status: 'Dispatched', profit: '$890', rpm: '$2.85/mi' },
                  { route: 'Dallas, TX → Houston, TX', driver: 'James K.', status: 'Delivered', profit: '$1,050', rpm: '$3.25/mi' },
                ].map((load, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{load.route}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{load.driver} &middot; {load.rpm}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: load.status === 'Delivered' ? '#22c55e' : load.status === 'In Transit' ? '#f0a500' : 'rgba(255,255,255,0.4)', background: load.status === 'Delivered' ? 'rgba(34,197,94,0.08)' : load.status === 'In Transit' ? 'rgba(240,165,0,0.08)' : 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: 6, marginRight: 16 }}>{load.status}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#22c55e', minWidth: 70, textAlign: 'right' }}>{load.profit}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── COMPARISON ──────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div className="lp-compare-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
            <FadeIn>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: 'rgba(255,255,255,0.25)', marginBottom: 20 }}>WITHOUT Q</div>
                {['Multiple apps', 'Manual calculations', 'Guessing profit', 'Wasted time'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <Ic icon={X} size={14} color="rgba(239,68,68,0.4)" />
                    <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={0.1}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: '#f0a500', marginBottom: 20 }}>WITH Q</div>
                {['One system', 'AI decisions', 'Real profit clarity', 'Automated workflow'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <Ic icon={Check} size={14} color="#f0a500" />
                    <span style={{ fontSize: 15, color: '#fff', fontWeight: 600 }}>{item}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── DIFFERENTIATION ────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
          <FadeIn>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, lineHeight: 1, marginBottom: 28, color: '#fff' }}>
              This isn't<br />another TMS.
            </h2>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, marginBottom: 8 }}>Most tools track your business.</p>
            <p style={{ fontSize: 22, color: '#f0a500', fontWeight: 700 }}>Q runs it.</p>
          </FadeIn>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-section" style={{ padding: '100px 40px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 2, marginBottom: 12 }}>PRICING</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2, marginBottom: 40 }}>
              One plan. Everything.
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '48px 32px 40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #f0a500, #e09000)' }} />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 68, color: '#f0a500', lineHeight: 1 }}>$79</span>
                <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>/mo</span>
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', marginBottom: 32 }}>+ $39/mo per additional truck</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, textAlign: 'left', marginBottom: 32 }}>
                {['AI dispatch', 'Auto invoicing', 'IFTA reporting', 'Compliance', 'Fleet tracking', 'Driver management', 'Expense tracking', 'P&L dashboard'].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.6)', padding: '5px 0' }}>
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
            <p style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>No credit card required. Cancel anytime.</p>
          </FadeIn>
        </div>
      </section>

      {/* ── BOTTOM CTA ─────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '120px 40px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <FadeIn>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, letterSpacing: 3, lineHeight: 1, marginBottom: 20, color: '#fff' }}>
              Run your entire<br />trucking business<br /><span style={{ color: '#f0a500' }}>with AI.</span>
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, marginBottom: 40 }}>Set up in minutes. Start your first load today.</p>
            <button className="lp-cta-btn" onClick={handleTry}
              style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 12, padding: '18px 56px', color: '#000', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5, boxShadow: '0 8px 32px rgba(240,165,0,0.25)' }}>
              START FREE TRIAL
            </button>
            <p style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>No credit card required</p>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '48px 40px 60px', background: 'var(--surface)' }}>
        <div className="lp-footer-grid" style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, fontFamily: "'Bebas Neue', sans-serif" }}><span style={{ color: 'var(--accent)' }}>QI</span><span style={{ color: '#fff' }}>VORI</span></span><span style={{ marginLeft: 10, padding: '3px 8px', background: 'var(--accent2)', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>AI</span>
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
