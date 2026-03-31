import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { trackDemoRequest, trackDemoEnter, trackCheckout } from '../lib/analytics'
import { useTranslation } from '../lib/i18n'
import { Bot, TrendingUp, Truck, Zap, Satellite, Check, Mic, Send, Play, MessageCircle, X, Mail, Users, Clock, Shield } from 'lucide-react'

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

function ChatBubble() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Q online. Ask me anything — pricing, how Q runs your operation, or what it can do for your fleet.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMsg }].map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text || m.content })),
          context: 'This is a landing page visitor asking about Qivori / Q, an AI-powered TMS for trucking. Three plans: (1) TMS Pro $99/mo + $49/additional truck — full TMS, no AI, everything manual. (2) AI Dispatch $199/mo + $79/additional truck — AI scans boards, finds loads, you approve. No voice AI. (3) Autonomous Fleet 3% per load — fully hands-free AI dispatch, voice AI, auto booking, only charged when Q books. 14-day free trial, no credit card. Keep answers short, confident, and helpful. Direct them to sign up. You are Q, the AI assistant.',
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || 'Sorry, I had trouble responding. Try again!' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Having trouble connecting. Please try again in a moment.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Chat Window */}
      {open && (
        <div style={{ position: 'fixed', bottom: 90, right: 20, width: 360, maxWidth: 'calc(100vw - 40px)', height: 480, maxHeight: 'calc(100dvh - 120px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', zIndex: 999, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Q</div>
                <div style={{ fontSize: 10, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)' }} /> Online
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <Ic icon={X} size={16} color="var(--muted)" />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                  color: m.role === 'user' ? '#000' : 'var(--text)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                  fontSize: 13, lineHeight: 1.55, fontWeight: m.role === 'user' ? 600 : 400
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', fontSize: 13, color: 'var(--muted)' }}>
                Typing...
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask Q anything..."
              style={{ flex: 1, padding: '10px 14px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', outline: 'none' }}
            />
            <button onClick={handleSend} disabled={loading} style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.5 : 1 }}>
              <Ic icon={Send} size={14} color="#000" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 20, right: 20, width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(240,165,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 998, transition: 'transform 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <Ic icon={open ? X : MessageCircle} size={24} color="#000" />
      </button>
    </>
  )
}

const HOW_Q_WORKS = [
  { step: '01', title: 'Q analyzes your options', desc: 'Evaluates available loads in real time. Compares lanes, rates, and broker reliability — so you pick the most profitable match.', icon: Satellite },
  { step: '02', title: 'Q protects your fleet', desc: 'Predicts crash risk, checks driver safety scores, monitors weather & HOS — blocks unsafe dispatches before they happen.', icon: Shield },
  { step: '03', title: 'Q executes', desc: 'Contacts brokers, assigns drivers, and books approved loads. You stay in control while Q handles the routine.', icon: Zap },
]

const Q_SYSTEM = [
  {
    title: 'Q Intelligence', icon: Bot, color: '#f0a500',
    items: ['Load evaluation', 'Rate negotiation', 'Load board integration', 'Broker risk scoring'],
  },
  {
    title: 'Fleet Control', icon: Truck, color: '#00d4aa',
    items: ['Driver assignment', 'Dispatch automation', 'Route optimization', 'Real-time tracking'],
  },
  {
    title: 'Safety & Compliance', icon: Shield, color: '#ef4444',
    items: ['Crash risk prediction', 'HOS & fatigue monitoring', 'FMCSA compliance', 'Weather route safety'],
  },
  {
    title: 'Profit Engine', icon: TrendingUp, color: '#4d8ef0',
    items: ['Margin tracking', 'Fuel optimization', 'Invoice + cash flow', 'P&L intelligence'],
  },
]

// Pricing — three plans
const PRICING = {
  tms_pro: { price: 99, additional: 49 },
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
            ACTIVATE Q
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
              <button onClick={handleTry} style={{ padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>ACTIVATE Q</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="lp-hero" style={{ position: 'relative', padding: '120px 48px 100px', maxWidth: 1000, margin: '0 auto', textAlign: 'center', overflow: 'hidden' }}>
        {/* Background glow effects */}
        <div style={{ position: 'absolute', top: '-50%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.08) 0%, transparent 70%)', animation: 'heroGlow 4s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '-30%', right: '-10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,170,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <FadeIn>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 50, padding: '8px 20px 8px 10px', marginBottom: 40 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.5 }}>THE AI OPERATING SYSTEM FOR TRUCKING</span>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 84, letterSpacing: 4, lineHeight: 0.92, marginBottom: 28, color: 'var(--text)', position: 'relative' }}>
            <span style={{ color: 'var(--accent)', textShadow: '0 0 80px rgba(240,165,0,0.3)' }}>Q</span> POWERS YOUR<br />TRUCKING BUSINESS.
          </h1>
        </FadeIn>

        <FadeIn delay={0.2}>
          <p style={{ fontSize: 20, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 600, margin: '0 auto 20px', fontWeight: 400 }}>
            Evaluate loads, negotiate rates, predict safety risks, and maximize profit — automatically.
          </p>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', maxWidth: 420, margin: '0 auto 48px', fontWeight: 500 }}>
            Safer fleets. Smarter dispatch. More profit.
          </p>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleTry}
              style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 14, padding: '18px 48px', color: '#000', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, boxShadow: '0 8px 40px rgba(240,165,0,0.35)', display: 'inline-flex', alignItems: 'center', gap: 10, transition: 'all 0.2s' }}>
              ACTIVATE Q
            </button>
            <button onClick={() => setVideoModal(true)}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '18px 36px', color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", backdropFilter: 'blur(8px)', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Ic icon={Play} size={16} /> Watch Q in action
            </button>
          </div>
        </FadeIn>

      </section>

      {/* ── TRUSTED PARTNERS ──────────────────────────────────── */}
      <section style={{ padding: '48px 40px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 2, marginBottom: 28 }}>TRUSTED PARTNERS & INTEGRATIONS</div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 56, flexWrap: 'wrap' }}>
            {/* Google */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>Google</span>
            </div>
            {/* QuickBooks */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#2CA01C"/><path d="M7.5 8v8h1.8v-2.4H11c1.9 0 3-1.1 3-2.8S12.9 8 11 8H7.5zm1.8 1.5H11c.8 0 1.2.5 1.2 1.3S11.8 12 11 12H9.3V9.5z" fill="#fff"/></svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>QuickBooks</span>
            </div>
            {/* Stripe */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#635BFF"/><path d="M11.2 9.6c0-.6.5-.8 1.3-.8.9 0 2.1.3 3 .8V6.8c-1-.4-2-.6-3-.6-2.5 0-4.1 1.3-4.1 3.4 0 3.4 4.6 2.8 4.6 4.3 0 .7-.6.9-1.4.9-1.2 0-2.7-.5-3.4-1.1v2.9c1.2.5 2.3.7 3.4.7 2.5 0 4.2-1.2 4.2-3.4 0-3.6-4.6-3-4.6-4.3z" fill="#fff"/></svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>Stripe</span>
            </div>
            {/* Twilio */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#F22F46"/><circle cx="9.5" cy="9.5" r="1.8" fill="#fff"/><circle cx="14.5" cy="9.5" r="1.8" fill="#fff"/><circle cx="9.5" cy="14.5" r="1.8" fill="#fff"/><circle cx="14.5" cy="14.5" r="1.8" fill="#fff"/></svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>Twilio</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW Q WORKS (3 STEPS) ──────────────────────────────────── */}
      <section id="how-it-works" className="lp-section" style={{ padding: '100px 40px', maxWidth: 900, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>HOW IT WORKS</div>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, marginBottom: 14 }}>
              Q OPERATES. YOU PROFIT.
            </h2>
          </div>
        </FadeIn>
        <div className="lp-how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {HOW_Q_WORKS.map((h, i) => (
            <FadeIn key={h.step} delay={i * 0.1}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '32px 24px', textAlign: 'center', position: 'relative' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 52, color: 'rgba(240,165,0,0.08)', position: 'absolute', top: 12, right: 18 }}>{h.step}</div>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                  <Ic icon={h.icon} size={24} color="var(--accent)" />
                </div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 1, marginBottom: 10, color: 'var(--text)' }}>{h.title}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>{h.desc}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── THE Q OPERATING SYSTEM ─────────────────────────────────── */}
      <section id="features" className="lp-section" style={{ padding: '100px 40px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>THE PLATFORM</div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, marginBottom: 14 }}>
                THE Q OPERATING SYSTEM
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 480, margin: '0 auto' }}>
                One system. Four engines. Total control.
              </p>
            </div>
          </FadeIn>
          <div className="lp-how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 20, maxWidth: 720, margin: '0 auto' }}>
            {Q_SYSTEM.map((block, i) => (
              <FadeIn key={block.title} delay={i * 0.1}>
                <div className="lp-feature-card" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 18, padding: '32px 24px', height: '100%', borderTop: `3px solid ${block.color}` }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: `${block.color}12`, border: `1px solid ${block.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                    <Ic icon={block.icon} size={24} color={block.color} />
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1, marginBottom: 16, color: block.color }}>{block.title}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {block.items.map(item => (
                      <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: block.color, flexShrink: 0 }} />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE Q DECISION (SCENARIO) ────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px', maxWidth: 700, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>LIVE INTELLIGENCE</div>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3 }}>
              WATCH Q DECIDE
            </h2>
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div style={{ background: 'var(--surface)', border: '2px solid rgba(240,165,0,0.2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            {/* Load header */}
            <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>INCOMING LOAD</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 1, color: 'var(--text)' }}>
                  DALLAS <span style={{ color: 'var(--accent)' }}>&rarr;</span> HOUSTON
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>RATE OFFERED</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: 'var(--accent)' }}>$1,950</div>
              </div>
            </div>
            {/* Q Decision */}
            <div style={{ padding: '28px', background: 'rgba(0,212,170,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
                </div>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: 'var(--success)' }}>ACCEPT</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>High profit, light weight, strong lane — driver safety: clear</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>EST. PROFIT</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--success)' }}>$1,180</div>
                </div>
                <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>RPM</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--accent)' }}>$3.25</div>
                </div>
                <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>MARGIN</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--accent)' }}>60%</div>
                </div>
                <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>SAFETY RISK</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--success)' }}>LOW</div>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── DIFFERENTIATION ────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>THE DIFFERENCE</div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3 }}>
                NOT JUST ANOTHER<br />DISPATCH TOOL.
              </h2>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="lp-features-grid">
              {/* Others column */}
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 18, padding: '32px 28px' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, letterSpacing: 2, color: 'var(--muted)', marginBottom: 24 }}>OTHERS</div>
                {['Manual decisions', 'No safety prediction', 'Basic automation', 'You do the work'].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14, color: 'var(--muted)' }}>
                    <span style={{ color: 'rgba(239,68,68,0.5)', fontSize: 16 }}>&#x2715;</span>
                    {item}
                  </div>
                ))}
              </div>
              {/* Q column */}
              <div style={{ background: 'rgba(240,165,0,0.04)', border: '2px solid rgba(240,165,0,0.2)', borderRadius: 18, padding: '32px 28px' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, letterSpacing: 2, color: 'var(--accent)', marginBottom: 24 }}>Q</div>
                {['Recommends best decisions', 'Predicts safety risks', 'Maximizes profit automatically', 'Q handles the routine'].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(240,165,0,0.1)', fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
                    <Ic icon={Check} size={16} color="var(--success)" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── TALK TO Q (VOICE + AI) ──────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px', maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
        <FadeIn>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 60px rgba(240,165,0,0.2)' }}>
            <Ic icon={Mic} size={28} color="#000" />
          </div>
          <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, marginBottom: 14 }}>
            TALK TO Q
          </h2>
          <p style={{ fontSize: 17, color: 'var(--muted)', marginBottom: 48, maxWidth: 420, margin: '0 auto 48px' }}>
            Use your voice to run your business.
          </p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400, margin: '0 auto' }}>
            {[
              '"Q, show me the most profitable loads"',
              '"Q, is this load safe for my driver?"',
              '"Q, what\'s my profit today?"',
              '"Q, assign this to my best available driver"',
            ].map((cmd, i) => (
              <div key={i} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                padding: '16px 20px', fontSize: 15, color: 'var(--text)', fontWeight: 500,
                fontStyle: 'italic', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                {cmd}
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── TESTIMONIALS / SOCIAL PROOF ───────────────────────────────── */}
      <section className="lp-section" style={{ padding: '100px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 20px', borderRadius: 100,
                background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)',
                marginBottom: 20,
              }}>
                <Ic icon={Users} size={14} color="var(--accent)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>100+ CARRIERS TRUST QIVORI AI</span>
              </div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, marginBottom: 14 }}>
                TRUSTED BY OWNER-OPERATORS
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 460, margin: '0 auto', lineHeight: 1.7 }}>
                Real carriers. Real results. Hear from operators who switched to Q.
              </p>
            </div>
          </FadeIn>

          <div className="lp-testimonials-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {[
              { quote: 'I used to spend 2 hours a day booking loads and doing paperwork. Qivori cut that down to 15 minutes. More time driving, more money in my pocket.', name: 'James Mitchell', detail: '4 trucks', location: 'Atlanta, GA' },
              { quote: 'The AI found me a backhaul I would\'ve missed. Paid for 3 months of Qivori in one load.', name: 'Maria Santos', detail: 'Owner-Operator', location: 'Dallas, TX' },
              { quote: 'IFTA used to take me a whole weekend. Now it\'s done in 2 minutes. I actually look forward to tax season.', name: 'Darnell Washington', detail: '2 trucks', location: 'Memphis, TN' },
              { quote: 'Everything I need in one place — loads, invoicing, compliance, fuel tracking. No more juggling 5 different apps.', name: 'Sarah Kim', detail: '6 trucks', location: 'Phoenix, AZ' },
            ].map((t, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="lp-feature-card" style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
                  padding: '28px 24px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                      {[...Array(5)].map((_, s) => (
                        <span key={s} style={{ color: 'var(--accent)', fontSize: 16, lineHeight: 1 }}>&#9733;</span>
                      ))}
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                      "{t.quote}"
                    </p>
                  </div>
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(240,165,0,0.05))',
                      border: '1px solid rgba(240,165,0,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, fontWeight: 700, color: 'var(--accent)',
                    }}>
                      {t.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.detail} &middot; {t.location}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-section" style={{ padding: '100px 40px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <FadeIn>
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>PRICING</div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 3, marginBottom: 14 }}>
                PLANS THAT SCALE WITH YOU
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 440, margin: '0 auto', lineHeight: 1.7 }}>
                From basic TMS to AI-powered dispatch with built-in safety intelligence. Pick your level of automation — upgrade anytime.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(240,165,0,0.06), rgba(240,165,0,0.02))',
              border: '2px solid rgba(240,165,0,0.3)', borderRadius: 20, padding: '40px 32px', marginBottom: 24,
            }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 2, color: 'var(--accent)', marginBottom: 6 }}>3 PLANS</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Starting at</span>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 56, color: 'var(--accent)', lineHeight: 1 }}>$99</span>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>/month</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 340, margin: '0 auto 28px', textAlign: 'left' }}>
                {[
                  { label: 'TMS Pro', desc: 'Full platform — loads, fleet, safety, compliance, invoicing', color: '#4d8ef0' },
                  { label: 'AI Dispatch', desc: 'Q evaluates loads, predicts risk, highlights matches — you approve', color: '#f0a500' },
                  { label: 'Autonomous Fleet', desc: 'AI-powered — Q evaluates, books approved loads, and dispatches safely', color: '#00d4aa' },
                ].map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* CTA */}
          <FadeIn delay={0.2}>
            <button onClick={() => handleCheckout('autonomous_fleet')} disabled={checkoutLoading === 'autonomous_fleet'}
              style={{
                width: '100%', padding: '18px 0', fontSize: 17, fontWeight: 800, borderRadius: 14, cursor: 'pointer',
                fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2,
                background: 'linear-gradient(135deg, #f0a500, #e09000)', color: '#000', border: 'none',
                opacity: checkoutLoading === 'autonomous_fleet' ? 0.6 : 1,
                boxShadow: '0 4px 20px rgba(240,165,0,0.3)', transition: 'all 0.2s',
              }}>
              {checkoutLoading === 'autonomous_fleet' ? 'Loading...' : 'START FREE TRIAL'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
              14-day free trial · No credit card · Cancel anytime
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>FAQ</div>
              <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 2 }}>COMMON QUESTIONS</h2>
            </div>
          </FadeIn>
          {[
            { q: 'What exactly does Q do?', a: 'Q is an AI-powered TMS for trucking. It evaluates loads for profitability, predicts crash risk, monitors driver safety, negotiates rates, assigns drivers, tracks fleet, manages invoicing and compliance — automatically. It works alongside your existing load boards to help you make smarter, safer decisions.' },
            { q: 'How does Q improve fleet safety?', a: 'Q uses predictive AI to score crash risk for every driver before dispatch. It monitors HOS fatigue levels, weather conditions, vehicle maintenance, CSA compliance, and route hazards — blocking unsafe dispatches before they happen. Think of it as a safety co-pilot for your fleet.' },
            { q: 'Do I need to be tech-savvy?', a: 'No. Q is voice-first. Just talk to it. "Q, find me a load." "Q, what\'s my profit today?" It works like having an intelligent dispatcher on call 24/7.' },
            { q: 'How does pricing work?', a: 'Three simple plans. TMS Pro at $99/mo — full management platform with safety monitoring. AI Dispatch at $199/mo — Q reviews available loads and highlights the best matches, you approve everything. Autonomous Fleet at 3% per load — AI-powered, Q only charges when it executes an approved load for you. All plans include a 14-day free trial, no credit card required.' },
            { q: 'Does Q work with my load boards?', a: 'Yes. Q integrates with Truckstop, 123Loadboard, DAT, and more. It doesn\'t replace your load boards — it makes them more powerful by analyzing loads for profitability, safety risk, and optimal driver match.' },
            { q: 'Can I try it before paying?', a: '14-day free trial. No credit card required. Full access to every feature. Cancel anytime.' },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px', marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif", fontSize: 16 }}>Q.</span> {item.q}
                </div>
                <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, paddingLeft: 26 }}>{item.a}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '120px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <FadeIn>
          <div style={{ maxWidth: 640, margin: '0 auto', position: 'relative' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px', boxShadow: '0 0 80px rgba(240,165,0,0.25)' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <h2 className="lp-cta-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, letterSpacing: 3, lineHeight: 1, marginBottom: 20 }}>
              LET Q RUN<br />
              <span style={{ color: 'var(--accent)', textShadow: '0 0 60px rgba(240,165,0,0.3)' }}>YOUR BUSINESS.</span>
            </h2>
            <p style={{ fontSize: 17, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 44 }}>
              Start today and see the difference.
            </p>
            <button onClick={handleTry}
              style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 14, padding: '20px 56px', color: '#000', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, boxShadow: '0 8px 40px rgba(240,165,0,0.35)', transition: 'all 0.2s' }}>
              ACTIVATE Q
            </button>
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
      <ChatBubble />

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
