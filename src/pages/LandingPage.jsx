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
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", overflowY: 'auto', height: '100dvh', position: 'fixed', inset: 0, zIndex: 10, WebkitOverflowScrolling: 'touch' }}>

      {/* ── STYLES ────────────────────────────────────────────────────── */}
      <style>{`
        .lp-nav-links { display: flex; align-items: center; gap: 28px; }
        .lp-mob-toggle { display: none !important; }
        .lp-mob-menu { display: none; }
        @keyframes heroGlow { 0%,100%{opacity:0.4;} 50%{opacity:0.7;} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes subtlePulse { 0%,100%{box-shadow:0 0 0 0 rgba(240,165,0,0.2)} 50%{box-shadow:0 0 0 8px rgba(240,165,0,0)} }
        .lp-feature-card { transition: all 0.3s ease; }
        .lp-feature-card:hover { transform: translateY(-6px); box-shadow: 0 20px 60px rgba(0,0,0,0.3); border-color: rgba(240,165,0,0.3) !important; }
        .lp-cta-btn { transition: all 0.2s ease; }
        .lp-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(240,165,0,0.4) !important; }
        .lp-ghost-btn { transition: all 0.2s ease; }
        .lp-ghost-btn:hover { background: rgba(255,255,255,0.08) !important; border-color: rgba(255,255,255,0.25) !important; }
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
          .lp-hero-grid { grid-template-columns: 1fr !important; text-align: center !important; }
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-section { padding: 50px 20px !important; }
          .lp-pain-row { grid-template-columns: 1fr !important; gap: 8px !important; }
          .lp-pain-arrow { display: none !important; }
          .lp-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-dat-grid { grid-template-columns: 1fr !important; padding: 28px 20px !important; }
          .lp-dat-heading { font-size: 30px !important; }
          .lp-pricing-grid { grid-template-columns: repeat(2, 1fr) !important; max-width: 100% !important; }
          .lp-savings-grid { grid-template-columns: 1fr !important; max-width: 360px !important; margin: 0 auto !important; }
          .lp-compare-table > div { grid-template-columns: 1.5fr 1fr 1fr 1fr !important; }
          .lp-compare-table > div > div { padding: 10px 8px !important; font-size: 11px !important; }
          .lp-compare-stats { grid-template-columns: 1fr !important; }
          .lp-ai-grid { grid-template-columns: 1fr !important; }
          .lp-how-grid { grid-template-columns: 1fr !important; }
          .lp-testimonials-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-section-heading { font-size: 32px !important; }
          .lp-cta-heading { font-size: 36px !important; }
          .lp-footer-grid { grid-template-columns: 1fr !important; text-align: center !important; }
          .lp-video-tags { display: none !important; }
        }
        @media (max-width: 480px) {
          .lp-hero h1 { font-size: 32px !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-stats-grid { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
          .lp-testimonials-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <nav className="lp-nav" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(7,9,14,0.85)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '0 48px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, fontFamily: "'Bebas Neue', sans-serif" }}><span style={{ color: 'var(--accent)' }}>QI</span><span style={{ color: '#fff' }}>VORI</span></span><span style={{ marginLeft: 10, padding: '3px 8px', background: 'var(--accent2)', borderRadius: 6, fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>AI</span>
        </div>

        <button className="lp-mob-toggle" onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: 'var(--text)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>
          {menuOpen ? '✕' : '☰'}
        </button>

        <div className="lp-nav-links">
          {[
            { key: 'landing.navFeatures', href: '#features' },
            { key: 'landing.navHowItWorks', href: '#how-it-works' },
            { key: 'landing.navPricing', href: '#pricing' },
          ].map(item => (
            <a key={item.key} href={item.href} className="lp-nav-link"
              style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
              onMouseOver={e => e.target.style.color = 'var(--text)'}
              onMouseOut={e => e.target.style.color = 'var(--muted)'}>
              {t(item.key)}
            </a>
          ))}
          <a href="#/loads" className="lp-nav-link"
            style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, transition: 'color 0.2s' }}>
            {t('landing.browseLoads')}
          </a>
          <button onClick={onGetStarted}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 18px', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, transition: 'all 0.2s' }}>
            {t('landing.signIn')}
          </button>
          <button onClick={handleTry}
            style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 10, padding: '9px 22px', color: '#000', fontSize: 13, cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", fontWeight: 800, letterSpacing: 1, boxShadow: '0 4px 16px rgba(240,165,0,0.3)' }}>
            START FREE TRIAL
          </button>
        </div>

        {menuOpen && (
          <div className="lp-mob-menu">
            {[
              { key: 'landing.navFeatures', href: '#features' },
              { key: 'landing.navHowItWorks', href: '#how-it-works' },
              { key: 'landing.navPricing', href: '#pricing' },
            ].map(item => (
              <a key={item.key} href={item.href} onClick={() => setMenuOpen(false)}>{t(item.key)}</a>
            ))}
            <a href="#/loads" onClick={() => setMenuOpen(false)} style={{ color: 'var(--accent) !important', fontWeight: 600 }}>{t('landing.browseLoads')}</a>
            <div className="lp-mob-btns">
              <button onClick={onGetStarted} style={{ padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>{t('landing.signIn')}</button>
              <button onClick={handleTry} style={{ padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>START FREE TRIAL</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="lp-hero" style={{ position: 'relative', padding: '160px 48px 120px', maxWidth: 800, margin: '0 auto', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: 1000, height: 1000, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.03) 0%, transparent 55%)', pointerEvents: 'none' }} />

        <FadeIn>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 84, letterSpacing: 4, lineHeight: 0.95, marginBottom: 32, color: '#fff' }}>
            YOUR DISPATCHER<br />IS NOW <span style={{ color: 'var(--accent)' }}>AI.</span>
          </h1>
        </FadeIn>

        <FadeIn delay={0.1}>
          <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 16px', fontWeight: 400 }}>
            Q finds loads, calculates real profit, negotiates rates, and runs your operation — automatically.
          </p>
          <p style={{ fontSize: 16, color: 'var(--accent)', fontWeight: 600, marginBottom: 48 }}>
            More money. Less stress. No extra apps.
          </p>
        </FadeIn>

        <FadeIn delay={0.2}>
          <button className="lp-cta-btn" onClick={handleTry}
            style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 12, padding: '20px 64px', color: '#000', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", boxShadow: '0 8px 32px rgba(240,165,0,0.3)', letterSpacing: 2 }}>
            START FREE TRIAL
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>14-day free trial &middot; No credit card required</p>
        </FadeIn>
      </section>

      {/* ── PROBLEM ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="lp-section" style={{ padding: '120px 40px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <FadeIn>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, lineHeight: 1.05, marginBottom: 48, textAlign: 'center', color: '#fff' }}>
              YOU'RE NOT RUNNING<br />YOUR BUSINESS.<br /><span style={{ color: 'var(--accent)' }}>YOU'RE CHASING IT.</span>
            </h2>
          </FadeIn>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 48 }}>
            {[
              'Checking load boards all day',
              'Calling brokers nonstop',
              'Tracking everything manually',
              'Not knowing your real profit',
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 0.05}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: 'rgba(239,68,68,0.5)', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>&#x2715;</span>
                  <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{item}</span>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.25}>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.7 }}>
              You don't need another tool.<br />
              <span style={{ color: '#fff', fontWeight: 700 }}>You need control.</span>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── SOLUTION ──────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '120px 40px', background: 'rgba(240,165,0,0.02)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <FadeIn>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2, lineHeight: 1.05, marginBottom: 48, textAlign: 'center', color: '#fff' }}>
              Q RUNS YOUR<br />OPERATION <span style={{ color: 'var(--accent)' }}>FOR YOU.</span>
            </h2>
          </FadeIn>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 48 }}>
            {[
              'Finds the best loads',
              'Calculates real profit (after fuel, not guesses)',
              'Decides what to take, negotiate, or reject',
              'Tracks everything automatically',
            ].map((item, i) => (
              <FadeIn key={i} delay={i * 0.05}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <Ic icon={Check} size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 17, color: 'var(--text)', fontWeight: 500 }}>{item}</span>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.25}>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.7 }}>
              You focus on driving.<br />
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Q handles the rest.</span>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '120px 40px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 16, textAlign: 'center' }}>HOW IT WORKS</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2, textAlign: 'center', marginBottom: 56 }}>
              FROM LOAD TO INVOICE.<br />AUTOMATICALLY.
            </h2>
          </FadeIn>

          {[
            { step: '01', text: 'Q scans available loads' },
            { step: '02', text: 'Calculates profit per load' },
            { step: '03', text: 'Accepts high-profit loads, negotiates mid-range, rejects bad ones' },
            { step: '04', text: 'Dispatches and tracks automatically' },
            { step: '05', text: 'Generates invoice when delivered' },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.06}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: '24px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: 'var(--accent)', lineHeight: 1, flexShrink: 0, minWidth: 40 }}>{item.step}</span>
                <span style={{ fontSize: 17, color: 'var(--text)', fontWeight: 500, lineHeight: 1.5, paddingTop: 4 }}>{item.text}</span>
              </div>
            </FadeIn>
          ))}

          <FadeIn delay={0.35}>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 40 }}>
              No spreadsheets. No switching apps.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FEATURES (OUTCOMES) ────────────────────────────────────────── */}
      <section id="features" className="lp-section" style={{ padding: '120px 40px', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 16, textAlign: 'center' }}>WHAT Q DOES</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2, marginBottom: 64, textAlign: 'center' }}>
              OUTCOMES, NOT FEATURES.
            </h2>
          </FadeIn>

          <div className="lp-features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {[
              { title: 'Smart Dispatch', desc: 'Q doesn\'t just show loads — it picks the right ones.', icon: Truck },
              { title: 'Auto Invoicing', desc: 'Get paid faster. Invoices created automatically.', icon: Zap },
              { title: 'Real Profit Tracking', desc: 'Know exactly what you make per load, driver, and lane.', icon: TrendingUp },
              { title: 'Driver Management', desc: 'Assign, track, and communicate — all in one place.', icon: Users },
              { title: 'IFTA & Compliance', desc: 'Handled in the background. No manual work.', icon: Shield },
              { title: 'Fleet Operations', desc: 'Vehicles, maintenance, fuel, and expenses — one view.', icon: Truck },
            ].map((feat, i) => (
              <FadeIn key={feat.title} delay={i * 0.05}>
                <div className="lp-feature-card" style={{ background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '36px 28px' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                    <Ic icon={feat.icon} size={20} color="var(--accent)" />
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{feat.title}</div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>{feat.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST / DIFFERENTIATION ─────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '120px 40px' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <FadeIn>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, lineHeight: 1, marginBottom: 32, color: '#fff' }}>
              THIS ISN'T<br />ANOTHER TMS.
            </h2>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, marginBottom: 8 }}>
              Most tools track your business.
            </p>
            <p style={{ fontSize: 22, color: 'var(--accent)', fontWeight: 700 }}>
              Q runs it.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── COMPARISON ──────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div className="lp-pain-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <FadeIn>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>WITHOUT Q</div>
                {['Multiple apps', 'Manual calculations', 'Guessing profit', 'Wasted time'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'rgba(239,68,68,0.4)', fontSize: 13 }}>&#x2715;</span>
                    <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={0.1}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, color: 'var(--accent)', marginBottom: 24 }}>WITH Q</div>
                {['One system', 'AI decisions', 'Real profit clarity', 'Fully automated workflow'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <Ic icon={Check} size={14} color="var(--accent)" />
                    <span style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>{item}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-section" style={{ padding: '120px 40px' }}>
        <div style={{ maxWidth: 440, margin: '0 auto', textAlign: 'center' }}>
          <FadeIn>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 16 }}>PRICING</p>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2, marginBottom: 48 }}>
              ONE PLAN. EVERYTHING.
            </h2>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div style={{ background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '52px 36px 44px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #f0a500, #e09000)' }} />

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 72, color: 'var(--accent)', lineHeight: 1 }}>$79</span>
                <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>/mo</span>
              </div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', marginBottom: 36, fontWeight: 500 }}>+ $39/mo per additional truck</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, textAlign: 'left', marginBottom: 36 }}>
                {[
                  'AI dispatch', 'Auto invoicing',
                  'IFTA reporting', 'Compliance center',
                  'Fleet tracking', 'Driver management',
                  'Expense tracking', 'P&L dashboard',
                  'Document storage', 'Fuel optimizer',
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', padding: '5px 0' }}>
                    <Ic icon={Check} size={14} color="var(--accent)" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              <button className="lp-cta-btn" onClick={() => handleCheckout('tms_pro')} disabled={checkoutLoading === 'tms_pro'}
                style={{
                  width: '100%', padding: '18px 0', fontSize: 15, fontWeight: 800, borderRadius: 12, cursor: 'pointer',
                  fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5,
                  background: 'linear-gradient(135deg, #f0a500, #e09000)', color: '#000', border: 'none',
                  opacity: checkoutLoading === 'tms_pro' ? 0.6 : 1,
                  boxShadow: '0 4px 20px rgba(240,165,0,0.3)',
                }}>
                {checkoutLoading === 'tms_pro' ? 'Loading...' : 'START FREE TRIAL'}
              </button>
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
              No credit card required. Cancel anytime.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── BOTTOM CTA ─────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '140px 40px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <FadeIn>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, letterSpacing: 3, lineHeight: 1, marginBottom: 20, color: '#fff' }}>
              RUN YOUR ENTIRE<br />TRUCKING BUSINESS<br /><span style={{ color: 'var(--accent)' }}>WITH AI.</span>
            </h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginBottom: 44 }}>
              Set up in minutes. Start your first load today.
            </p>
            <button className="lp-cta-btn" onClick={handleTry}
              style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 12, padding: '20px 64px', color: '#000', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, boxShadow: '0 8px 32px rgba(240,165,0,0.3)' }}>
              START FREE TRIAL
            </button>
            <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>No credit card required</p>
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
