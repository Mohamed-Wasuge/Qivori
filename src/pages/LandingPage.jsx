import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { trackDemoRequest, trackDemoEnter } from '../lib/analytics'
import { TrendingUp, Zap, Check, X, Shield, Play, Clock, ChevronDown, ArrowRight, DollarSign, PhoneOff, FileText, Brain } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

// Pricing config — CLAUDE.md: NEVER hardcode pricing in components
const PLANS = {
  founder: { price: 199, additional: 99 },
  regular: { price: 299, additional: 149 },
  tms: { price: 79, additional: 39 },
}

// Animate elements on scroll (one-time fade in)
function useOnScreen(ref) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [ref])
  return visible
}

// Track if a section is currently visible (starts/stops when entering/leaving viewport)
function useSectionVisible() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.01 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, visible]
}

function FadeIn({ children, delay = 0, style = {} }) {
  const ref = useRef(null)
  const visible = useOnScreen(ref)
  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(12px)', transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`, ...style }}>
      {children}
    </div>
  )
}


export default function LandingPage({ onGetStarted }) {
  const { goToLogin, enterDemo } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [demoModal, setDemoModal] = useState(false)
  const [demoForm, setDemoForm] = useState({ name: '', email: '', phone: '', company: '', truckCount: '', currentELD: '', factoringCompany: '', loadBoards: '', painPoints: '', _hp: '' })
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoSent, setDemoSent] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [faqOpen, setFaqOpen] = useState(null)

  // ── Section visibility refs — animations only run when on-screen ──
  const [qRef, qVisible] = useSectionVisible()
  const [pipeRef, pipeVisible] = useSectionVisible()
  const [featRef, featVisible] = useSectionVisible()
  const [backRef, backVisible] = useSectionVisible()
  const [mobileRef, mobileVisible] = useSectionVisible()

  // Q Simulator state
  const [qStep, setQStep] = useState(0)
  const [qFade, setQFade] = useState(true)
  useEffect(() => {
    if (!qVisible) return
    const iv = setInterval(() => {
      setQFade(false)
      setTimeout(() => { setQStep(s => (s + 1) % 8); setQFade(true) }, 300)
    }, 2500)
    return () => clearInterval(iv)
  }, [qVisible])

  // Pipeline animation — card flows through stages
  const [pipelineStep, setPipelineStep] = useState(0)
  const [profitAnim, setProfitAnim] = useState(0)
  useEffect(() => {
    if (!pipeVisible) return
    const iv = setInterval(() => setPipelineStep(p => (p + 1) % 6), 1800)
    return () => clearInterval(iv)
  }, [pipeVisible])
  useEffect(() => {
    if (!pipeVisible) return
    const iv = setInterval(() => setProfitAnim(p => p >= 100 ? 100 : p + 3), 50)
    return () => clearInterval(iv)
  }, [pipeVisible])
  useEffect(() => { if (pipelineStep === 0) setProfitAnim(0) }, [pipelineStep])

  // Invoice/Factor animation
  const [invoicePhase, setInvoicePhase] = useState(0)
  useEffect(() => {
    if (!backVisible) return
    const durations = [2200, 1800, 2000, 2500]
    const timeout = setTimeout(() => setInvoicePhase(p => (p + 1) % 4), durations[invoicePhase])
    return () => clearTimeout(timeout)
  }, [invoicePhase, backVisible])

  // EDI animation
  const [ediPhase, setEdiPhase] = useState(0)
  useEffect(() => {
    if (!backVisible) return
    const durations = [2400, 2000, 2200, 2800]
    const timeout = setTimeout(() => setEdiPhase(p => (p + 1) % 4), durations[ediPhase])
    return () => clearTimeout(timeout)
  }, [ediPhase, backVisible])

  // Command Center animation
  const [ccTick, setCcTick] = useState(0)
  const [ccAlert, setCcAlert] = useState(0)
  useEffect(() => {
    if (!featVisible) return
    const iv = setInterval(() => setCcTick(p => (p + 1) % 100), 120)
    return () => clearInterval(iv)
  }, [featVisible])
  useEffect(() => {
    if (!featVisible) return
    const iv = setInterval(() => setCcAlert(p => (p + 1) % 3), 3000)
    return () => clearInterval(iv)
  }, [featVisible])

  // AI Dispatch animation
  const [dispatchPhase, setDispatchPhase] = useState(0)
  useEffect(() => {
    if (!featVisible) return
    const durations = [2000, 2200, 2400, 3000]
    const timeout = setTimeout(() => setDispatchPhase(p => (p + 1) % 4), durations[dispatchPhase])
    return () => clearTimeout(timeout)
  }, [dispatchPhase, featVisible])

  // Rate Check animation
  const [ratePhase, setRatePhase] = useState(0)
  const [rateCosts, setRateCosts] = useState(0)
  useEffect(() => {
    if (!featVisible) return
    const durations = [2200, 2000, 2500, 3000]
    const timeout = setTimeout(() => {
      setRatePhase(p => {
        const next = (p + 1) % 4
        if (next === 0) setRateCosts(0)
        return next
      })
    }, durations[ratePhase])
    return () => clearTimeout(timeout)
  }, [ratePhase, featVisible])
  useEffect(() => {
    if (!featVisible || ratePhase < 2) return
    const iv = setInterval(() => setRateCosts(p => p >= 100 ? 100 : p + 4), 50)
    return () => clearInterval(iv)
  }, [ratePhase, featVisible])

  // Financial dashboard animation
  const [finAnim, setFinAnim] = useState(0)
  const [finAlert, setFinAlert] = useState(0)
  useEffect(() => {
    if (!featVisible) return
    const iv = setInterval(() => setFinAnim(p => p >= 100 ? 100 : p + 2), 60)
    return () => clearInterval(iv)
  }, [featVisible])
  useEffect(() => {
    if (!featVisible) return
    const durations = [2500, 2000, 2200, 3000]
    const timeout = setTimeout(() => {
      setFinAlert(p => {
        const next = (p + 1) % 4
        if (next === 0) setFinAnim(0)
        return next
      })
    }, durations[finAlert])
    return () => clearTimeout(timeout)
  }, [finAlert, featVisible])

  // Mobile phone animations
  const [scanPhase, setScanPhase] = useState(0)
  const [dvirPhase, setDvirPhase] = useState(0)
  const [iftaBars, setIftaBars] = useState(0)
  useEffect(() => {
    if (!mobileVisible) return
    const iv = setInterval(() => setScanPhase(p => (p + 1) % 3), 2000)
    return () => clearInterval(iv)
  }, [mobileVisible])
  useEffect(() => {
    if (!mobileVisible) return
    const iv = setInterval(() => setDvirPhase(p => (p + 1) % 3), 2200)
    return () => clearInterval(iv)
  }, [mobileVisible])
  useEffect(() => {
    if (!mobileVisible) return
    const iv = setInterval(() => setIftaBars(p => p >= 100 ? 0 : p + 2), 80)
    return () => clearInterval(iv)
  }, [mobileVisible])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === 'true') { trackDemoEnter(); enterDemo('carrier'); window.history.replaceState({}, '', window.location.pathname) }
  }, [enterDemo])

  const handleDemoSubmit = async () => {
    if (!demoForm.name.trim() || !demoForm.email.trim() || !demoForm.phone.trim() || !demoForm.company.trim()) return
    setDemoError(''); setDemoLoading(true)
    try {
      let recaptchaToken = ''
      if (window.grecaptcha) { try { recaptchaToken = await window.grecaptcha.execute(window.__RECAPTCHA_SITE_KEY || '6Lfx35ksAAAAAD2c8XGkgHraPTPXrSVP0v0bPFft', { action: 'demo_request' }) } catch {} }
      const res = await fetch('/api/demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...demoForm, recaptchaToken }) })
      const data = await res.json()
      if (!res.ok) { setDemoError(data.error || 'Something went wrong. Please try again.'); setDemoLoading(false); return }
      trackDemoRequest(demoForm.email); setDemoLoading(false); setDemoModal(false); trackDemoEnter(); enterDemo('carrier')
    } catch { setDemoLoading(false); setDemoModal(false); trackDemoEnter(); enterDemo('carrier') }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get('ref')
    if (refCode) { localStorage.setItem('qivori_ref', refCode); fetch('/api/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'click', referralCode: refCode }) }).catch(() => {}) }
  }, [])

  // Q simulator steps
  const qSteps = [
    { label: 'Scanning load boards...', icon: '🔍', detail: 'DAT, Truckstop, 123Loadboard' },
    { label: 'Found 47 matching loads', icon: '📋', detail: 'Filtering by lane, weight, rate' },
    { label: 'Rate analysis complete', icon: '📊', detail: '$3.42/mi avg — this one pays $3.87/mi' },
    { label: 'Calling broker...', icon: '📞', detail: 'Negotiating $200 above posted rate' },
    { label: 'Load booked at $4,640', icon: '✅', detail: 'Rate con received, dispatched to driver' },
    { label: 'Driver checked in at pickup', icon: '📍', detail: 'BOL uploaded, loaded at 2:14 PM' },
    { label: 'POD delivered, invoice sent', icon: '📄', detail: '$4,640 invoice — factored in 4 hours' },
    { label: 'Driver paid, profit logged', icon: '💰', detail: 'Net profit: $1,847 after all costs' },
  ]

  // Feature sections data
  const featureSections = [
    {
      tag: 'AI DISPATCH',
      title: 'You Drive. Q Finds the Loads.',
      desc: 'While you focus on the road, Q is scanning every load board, analyzing rates, and calling brokers to negotiate the best price. You wake up to booked loads and rate cons — not hours of phone calls.',
      bullets: ['Scans DAT, Truckstop & 123Loadboard around the clock', 'AI-powered rate analysis with profit/mile breakdown', 'Autonomous broker calling & negotiation — no phone time'],
      img: '/screenshots/dispatch.png',
      cinematic: 'dispatch',
    },
    {
      tag: 'LOAD INTELLIGENCE',
      title: 'Never Accept a Bad Load Again',
      desc: 'Q analyzes every load before you see it — comparing rates to market, calculating true profit after fuel and expenses, and flagging broker reliability. It even writes your counter-offer script.',
      bullets: ['Know if a load is above or below market in seconds', 'True profit breakdown: fuel, insurance, driver pay, net', 'Counter-offer scripts generated automatically'],
      img: '/screenshots/rate-check.png',
      cinematic: 'ratecheck',
    },
    {
      tag: 'COMMAND CENTER',
      title: 'Your Entire Fleet. One Glance.',
      desc: 'Stop juggling spreadsheets and phone calls. See every truck on the map, every driver\'s HOS, every load\'s status — from booked to paid — in a single view that updates in real-time.',
      bullets: ['Live GPS tracking with ETA and route visualization', 'Hours of Service monitoring — never miss a compliance check', 'Full pipeline: Booked → Dispatched → Delivered → Paid'],
      img: '/screenshots/command-center.png',
      cinematic: 'commandcenter',
    },
    {
      tag: 'FINANCIALS',
      title: 'Q Handles the Books. You Keep the Profit.',
      desc: 'Invoicing, expense tracking, factoring, driver pay — Q runs your entire back office. Get daily briefings on where your money is, and alerts when trucks are sitting idle losing revenue.',
      bullets: ['One-click invoicing with instant factoring', 'P&L, fuel spend, and unpaid aging — always current', 'Q alerts you on idle trucks and missed opportunities'],
      img: '/screenshots/financial.png',
      cinematic: 'financials',
    },
  ]

  // FAQ data
  const faqs = [
    { q: 'What is Q?', a: 'Q is your AI dispatcher. It finds loads, analyzes rates, calls brokers, tracks your fleet, handles invoicing, and manages driver pay — autonomously. Think of it as a dispatcher that works 24/7 and never misses a profitable load.' },
    { q: 'Can Q really call brokers?', a: 'Yes. Q uses AI voice technology to call brokers, negotiate rates, and book loads. It follows your negotiation rules (min rate/mile, counter markup, max rounds) and only books loads that meet your criteria.' },
    { q: 'Do I need to be tech-savvy?', a: 'No. If you can use a smartphone, you can use Qivori. The mobile app lets drivers manage everything with voice commands — just talk to Q. The desktop dashboard is designed for simplicity.' },
    { q: 'How much does it cost?', a: 'Start with a 14-day free trial — no credit card required. After that, we have simple plans that scale with your fleet. Sign up to see pricing details, or book a demo and we\'ll walk you through it.' },
    { q: 'What load boards does Q connect to?', a: 'Q integrates with DAT, Truckstop, and 123Loadboard. It scans all three simultaneously and cross-references rates to find the most profitable loads for your lanes.' },
    { q: 'Is my data secure?', a: 'Absolutely. We use Supabase with Row Level Security on every table, encrypted connections, and your data is never shared with other carriers. You own your data.' },
    { q: 'How long does setup take?', a: 'Most carriers are up and running in under 15 minutes. Connect your MC number, add your trucks and drivers, and Q starts finding loads immediately.' },
    { q: 'Can I try it before committing?', a: 'Yes. We offer a 14-day free trial with full access to every feature — no credit card required. You can also request a live demo where we walk you through Q with your actual lanes.' },
  ]

  return (
    <div className="lp-root-container" style={{ background: '#ffffff', color: '#1a1a2e', fontFamily: "'DM Sans', sans-serif", position: 'fixed', inset: 0, zIndex: 10, overflowY: 'scroll', overscrollBehavior: 'none', '--bg': '#ffffff', '--surface': '#f8f8fa', '--text': '#1a1a2e', '--muted': 'rgba(26,26,46,0.5)', '--border': 'rgba(0,0,0,0.08)', '--accent': '#d4910a', '--accent2': 'rgba(212,145,10,0.1)', '--success': '#16a34a', '--danger': '#dc2626' }}>

      <style>{`
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; box-sizing: border-box; }
        ::selection { background: rgba(212,145,10,0.2); color: #1a1a2e; }
        nav a { transition: color 0.2s !important; }
        nav a:hover { color: rgba(255,255,255,0.85) !important; }
        img { max-width: 100%; height: auto; }
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .lp-root-container { padding-bottom: env(safe-area-inset-bottom); }
        }

        .lp-cta-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 32px; font-size: 15px; font-weight: 700;
          background: linear-gradient(135deg, #d4910a 0%, #f0a500 100%);
          color: #fff; border: none; border-radius: 12px;
          cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 20px rgba(212,145,10,0.3), inset 0 1px 0 rgba(255,255,255,0.15);
          letter-spacing: 0.3px;
        }
        .lp-cta-primary:hover {
          transform: translateY(-2px); box-shadow: 0 12px 36px rgba(212,145,10,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
          background: linear-gradient(135deg, #c18409 0%, #d4910a 100%);
        }
        .lp-cta-primary:active { transform: translateY(0); }

        .lp-cta-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 28px; font-size: 15px; font-weight: 600;
          background: rgba(255,255,255,0.04); color: #1a1a2e;
          border: 1.5px solid rgba(0,0,0,0.12);
          border-radius: 12px; cursor: pointer; transition: all 0.3s ease;
          backdrop-filter: blur(4px); letter-spacing: 0.3px;
        }
        .lp-cta-secondary:hover {
          background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.2);
          transform: translateY(-1px);
        }

        .lp-screenshot {
          width: 100%; border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 20px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02);
          transition: transform 0.5s cubic-bezier(0.16,1,0.3,1), box-shadow 0.5s ease;
        }
        .lp-screenshot:hover { transform: translateY(-6px) scale(1.01); box-shadow: 0 32px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04); }

        .lp-phone-frame {
          max-width: 280px; margin: 0 auto; border-radius: 32px;
          border: 4px solid rgba(212,145,10,0.3); overflow: hidden;
          box-shadow: 0 24px 60px rgba(0,0,0,0.4), 0 0 40px rgba(212,145,10,0.05);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .lp-phone-frame:hover {
          transform: translateY(-6px);
          box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 60px rgba(212,145,10,0.1);
        }
        .lp-phone-frame img { width: 100%; display: block; }

        .lp-feature-row {
          display: flex; align-items: center; gap: 48px;
          max-width: 1100px; margin: 0 auto; padding: 64px 20px;
        }
        .lp-feature-text { flex: 1; min-width: 0; }
        .lp-feature-img { flex: 1.2; min-width: 0; }

        .lp-hero-video {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          object-fit: cover; z-index: 0; opacity: 0; transition: opacity 1.5s ease-in;
        }
        .lp-hero-video.ready { opacity: 0.45; }
        .lp-hero-overlay {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(180deg, rgba(8,9,12,0.55) 0%, rgba(10,10,14,0.50) 40%, rgba(10,10,14,0.70) 100%);
          z-index: 1; pointer-events: none;
        }
        @media (max-width: 768px) { .lp-hero-video { display: none; } .lp-hero-overlay { display: none; } }
        @media (prefers-reduced-motion: reduce) { .lp-hero-video { display: none !important; } .lp-hero-overlay { display: none !important; } }

        .lp-hero-split {
          display: flex; flex-direction: column; align-items: center;
          max-width: 1140px; margin: 0 auto; padding: 0 20px 48px;
          position: relative; z-index: 3; gap: 32px; text-align: center;
        }
        .lp-hero-left { max-width: 560px; }
        .lp-hero-right {
          position: relative; width: 100%; max-width: 500px; min-height: 280px;
          display: none;
        }
        .lp-hero-float {
          border-radius: 14px; border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 40px rgba(212,145,10,0.05);
          overflow: hidden;
        }
        .lp-hero-float img { width: 100%; display: block; }
        .lp-hero-float-sm {
          position: absolute; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 16px 48px rgba(0,0,0,0.5);
          overflow: hidden; background: rgba(15,17,24,0.85);
          backdrop-filter: blur(8px);
        }
        .lp-hero-float-sm img { width: 100%; display: block; }
        .lp-float-1 { animation: lp-float1 3s ease-in-out infinite; }
        .lp-float-2 { animation: lp-float2 3.5s ease-in-out infinite; }
        @keyframes lp-float1 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes lp-float2 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        /* Mobile first */
        .lp-nav-links { display: none; }
        .lp-mob-toggle { display: flex; }
        .lp-hero-title { font-size: 36px; }
        .lp-section-title { font-size: 28px; }
        .lp-stats-grid { grid-template-columns: 1fr 1fr; }
        .lp-feature-row { flex-direction: column; gap: 28px; padding: 48px 20px; }
        .lp-feature-img { order: -1; }
        .lp-back-grid { grid-template-columns: 1fr !important; }
        .lp-pipeline-cols { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .lp-pipeline-cols::-webkit-scrollbar { display: none; }
        .lp-pipeline-cols > div { min-width: 140px; }
        .lp-phone-grid { grid-template-columns: 1fr !important; max-width: 280px !important; margin: 0 auto !important; }

        @media (min-width: 769px) {
          .lp-nav-links { display: flex !important; }
          .lp-mob-toggle { display: none !important; }
          .lp-hero-title { font-size: 60px !important; }
          .lp-section-title { font-size: 40px !important; }
          .lp-stats-grid { grid-template-columns: repeat(4, 1fr) !important; }
          .lp-feature-row { flex-direction: row !important; gap: 48px !important; padding: 80px 24px !important; }
          .lp-feature-row-reverse { flex-direction: row-reverse !important; }
          .lp-feature-img { order: 0 !important; }
          .lp-back-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-phone-grid { grid-template-columns: repeat(4, 1fr) !important; max-width: 960px !important; }
          nav { padding: 14px 32px !important; }
          .lp-hero-split {
            flex-direction: row !important; text-align: left !important;
            align-items: center !important; gap: 48px !important;
            padding: 0 40px 60px !important;
          }
          .lp-hero-left { flex: 1 !important; }
          .lp-hero-right { display: block !important; flex: 1 !important; max-width: 520px !important; min-height: 400px !important; }
          .lp-hero-ctas { justify-content: flex-start !important; }
        }

        @media (min-width: 481px) and (max-width: 768px) {
          .lp-phone-grid { grid-template-columns: repeat(2, 1fr) !important; max-width: 500px !important; }
        }

        @media (max-width: 480px) {
          .lp-hero-title { font-size: 32px !important; }
          .lp-section-title { font-size: 24px !important; }
          .lp-stats-grid { grid-template-columns: 1fr 1fr !important; }
        }

        /* ── Cinematic mobile overrides ── */
        .lp-cc-body { display: flex; }
        .lp-cc-left { width: 30%; border-right: 1px solid rgba(0,0,0,0.05); padding: 10px 12px; flex-shrink: 0; }
        .lp-cc-map { flex: 1; padding: 10px; position: relative; min-height: 200px; }
        .lp-cc-right { width: 28%; border-left: 1px solid rgba(0,0,0,0.05); padding: 10px 12px; flex-shrink: 0; }
        .lp-dispatch-body { display: flex; }
        .lp-dispatch-left { flex: 1; border-right: 1px solid rgba(0,0,0,0.05); padding: 12px 14px; }
        .lp-dispatch-right { flex: 1.3; padding: 12px 14px; }
        .lp-fin-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-bottom: 1px solid rgba(0,0,0,0.05); }
        .lp-fin-split { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid rgba(0,0,0,0.05); }
        .lp-rate-tabs { display: flex; gap: 16; overflow: hidden; }
        .lp-rate-profit-row { display: flex; gap: 12; }
        .lp-rate-donut { width: 64px; height: 64px; flex-shrink: 0; }
        .lp-rate-counter-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 6; }
        .lp-rec-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8; margin-top: 12; }
        .lp-fin-weekly { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 12px 14px; }

        @media (max-width: 768px) {
          /* Command Center — just show map, hide side panels */
          .lp-cc-body { flex-direction: column !important; }
          .lp-cc-left { display: none !important; }
          .lp-cc-map { min-height: 220px !important; }
          .lp-cc-right { display: none !important; }

          /* Dispatch — stack, hide broker card */
          .lp-dispatch-body { flex-direction: column !important; }
          .lp-dispatch-left { border-right: none !important; border-bottom: 1px solid rgba(0,0,0,0.05); }
          .lp-dispatch-broker { display: none !important; }

          /* Financials — 2×2, hide weekly/pipeline detail */
          .lp-fin-metrics { grid-template-columns: 1fr 1fr !important; }
          .lp-fin-split { display: none !important; }
          .lp-fin-weekly { display: none !important; }
          .lp-fin-briefing { padding: 10px 14px !important; }

          /* Rate check — hide tabs + counter script, keep factors + donut */
          .lp-rate-tabs { display: none !important; }
          .lp-rate-profit-row { flex-direction: column !important; align-items: center !important; }
          .lp-rate-donut { width: 80px !important; height: 80px !important; }
          .lp-rate-counter-btns { grid-template-columns: 1fr !important; }
          .lp-rate-counter-section { display: none !important; }

          /* Q Recommendation — 2×2 grid */
          .lp-rec-metrics { grid-template-columns: 1fr 1fr !important; }

          /* Pipeline — vertical on mobile */
          .lp-pipeline-cols {
            grid-template-columns: 1fr 1fr !important;
            gap: 12px !important;
            overflow-x: visible !important;
          }
          .lp-pipeline-cols > div { min-width: 0 !important; }
          .lp-pipeline-hide-mobile { display: none !important; }

          /* Back office grid — always single column */
          .lp-back-grid { grid-template-columns: 1fr !important; gap: 20px !important; }

          /* Scale up cinematic mockups on mobile for readability */
          .lp-cinematic-card { transform: none !important; }

          /* Hide CC bottom status bar on mobile — too cramped */
          .lp-cc-status-bar { display: none !important; }

          /* Feature section — tighter padding */
          .lp-feature-row { padding: 36px 16px !important; gap: 20px !important; }
        }

        .lp-trust-section { padding: 32px 20px; text-align: center; overflow: hidden; }
        .lp-trust-title {
          font-family: 'Bebas Neue', sans-serif; font-size: 22px;
          letter-spacing: 3px; color: rgba(26,26,46,0.25); margin-bottom: 24px;
        }
        .lp-trust-track {
          display: flex; align-items: center; gap: 48px;
          animation: lp-scroll 20s linear infinite;
          width: max-content;
        }
        .lp-trust-track:hover { animation-play-state: paused; }
        .lp-trust-logo {
          font-family: 'Bebas Neue', sans-serif; font-size: 20px;
          letter-spacing: 3px; color: rgba(26,26,46,0.3); white-space: nowrap;
          transition: color 0.3s;
        }
        .lp-trust-logo:hover { color: rgba(26,26,46,0.6); }
        @keyframes lp-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(34,197,94,0.6); }
          50% { opacity: 0.4; box-shadow: 0 0 4px rgba(34,197,94,0.3); }
        }
        @keyframes lp-card-enter {
          0% { opacity: 0; transform: translateY(-12px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes lp-scanline {
          0% { top: 10%; }
          100% { top: 85%; }
        }
        @keyframes lp-scanpulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes lp-viewfinder {
          0%, 100% { border-color: rgba(212,145,10,0.4); }
          50% { border-color: rgba(212,145,10,0.8); }
        }
        @keyframes lp-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .lp-testimonial-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, transparent, rgba(212,145,10,0.3), transparent);
          opacity: 0; transition: opacity 0.3s;
        }
        .lp-testimonial-card { position: relative; overflow: hidden; }
        .lp-testimonial-card:hover::before { opacity: 1; }

        .lp-compare-grid {
          display: grid; grid-template-columns: 1fr; gap: 16px;
          max-width: 800px; margin: 0 auto;
        }
        @media (min-width: 769px) {
          .lp-compare-grid { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
        }
        .lp-compare-card {
          padding: 28px 24px; border-radius: 16px; position: relative; overflow: hidden;
        }
        .lp-compare-card ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
        .lp-compare-card li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.5; }

        .lp-testimonial-card {
          padding: 28px; background: #fff; border: 1px solid rgba(0,0,0,0.06);
          border-radius: 16px; height: 100%; display: flex; flex-direction: column;
          box-shadow: 0 2px 12px rgba(0,0,0,0.04);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .lp-testimonial-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.08);
        }

        .lp-faq-item {
          border-bottom: 1px solid rgba(0,0,0,0.06);
          transition: background 0.2s;
        }
        .lp-faq-item:hover { background: rgba(0,0,0,0.02); }
        .lp-faq-q {
          display: flex; justify-content: space-between; align-items: center;
          padding: 20px 0; cursor: pointer; font-size: 16px; font-weight: 600;
          color: #1a1a2e; background: none; border: none; width: 100%; text-align: left;
        }
        .lp-faq-a {
          overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease;
          font-size: 14px; color: rgba(26,26,46,0.6); line-height: 1.7;
        }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(24px) saturate(1.5)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3 }}>
          <span style={{ color: '#fff' }}>QIVORI</span><span style={{ color: '#f0a500' }}> AI</span>
        </div>
        <div className="lp-nav-links" style={{ alignItems: 'center', gap: 32 }}>
          <a href="#features" style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontWeight: 500 }}>Features</a>
          <a href="#how-it-works" style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontWeight: 500 }}>How It Works</a>
          <a href="#faq" style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontWeight: 500 }}>FAQ</a>
          <button onClick={goToLogin} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer' }}>Sign In</button>
          <button onClick={goToLogin} className="lp-cta-primary" style={{ padding: '9px 20px', fontSize: 13, boxShadow: 'none' }}>Start Free Trial</button>
        </div>
        <button className="lp-mob-toggle" onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 8, flexDirection: 'column', gap: 5 }}>
          <span style={{ width: 22, height: 2, background: '#fff', borderRadius: 2, transition: '0.3s', transform: menuOpen ? 'rotate(45deg) translateY(7px)' : 'none' }} />
          <span style={{ width: 22, height: 2, background: '#fff', borderRadius: 2, opacity: menuOpen ? 0 : 1, transition: '0.3s' }} />
          <span style={{ width: 22, height: 2, background: '#fff', borderRadius: 2, transition: '0.3s', transform: menuOpen ? 'rotate(-45deg) translateY(-7px)' : 'none' }} />
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, zIndex: 99, background: 'rgba(10,10,14,0.98)', backdropFilter: 'blur(24px)', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <a href="#features" onClick={() => setMenuOpen(false)} style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Features</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)} style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>How It Works</a>
          <a href="#faq" onClick={() => setMenuOpen(false)} style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>FAQ</a>
          <button onClick={() => { setMenuOpen(false); goToLogin() }} style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', textAlign: 'left', padding: '12px 0', cursor: 'pointer' }}>Sign In</button>
          <button onClick={() => { setMenuOpen(false); goToLogin() }} className="lp-cta-primary" style={{ marginTop: 16, justifyContent: 'center' }}>Start Free Trial</button>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════════
          HERO — Product-first, screenshot hero
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ paddingTop: 90, paddingBottom: 0, position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg, #08090c 0%, #0f1118 30%, #161a28 100%)' }}>
        {/* Radial glow */}
        <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)', width: 900, height: 700, background: 'radial-gradient(ellipse at center, rgba(212,145,10,0.12) 0%, rgba(212,145,10,0.03) 40%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="lp-hero-split">
          {/* LEFT — Text */}
          <div className="lp-hero-left">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px', background: 'rgba(212,145,10,0.08)', border: '1px solid rgba(212,145,10,0.2)', borderRadius: 100, marginBottom: 28, backdropFilter: 'blur(8px)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f0a500', letterSpacing: 1.5 }}>AI-POWERED TMS FOR CARRIERS</span>
            </div>

            <h1 className="lp-hero-title" style={{ fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1, letterSpacing: 1, margin: '0 0 20px', color: '#fff' }}>
              Stop Dispatching.<br />Start Earning.
            </h1>

            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 36, maxWidth: 480 }}>
              Qivori comes with Q — your AI dispatcher that finds loads, calls brokers, tracks your fleet, handles invoicing, and manages compliance. You focus on driving. Q handles everything else.
            </p>

            <div className="lp-hero-ctas" style={{ display: 'flex', gap: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
              <button onClick={goToLogin} className="lp-cta-primary" style={{ padding: '16px 32px', fontSize: 16 }}>Get Started Free <Ic icon={ArrowRight} size={16} /></button>
              <button onClick={() => setDemoModal(true)} className="lp-cta-secondary" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.15)', padding: '16px 28px', fontSize: 16 }}><Ic icon={Play} size={14} /> Book a Demo</button>
            </div>

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>14-day free trial &middot; No credit card &middot; Cancel anytime</p>
          </div>

          {/* RIGHT — Floating product screenshots */}
          <div className="lp-hero-right">
            {/* Main screenshot — Command Center */}
            <div className="lp-hero-float">
              <img src="/screenshots/command-center.png" alt="Qivori Fleet Command Center" />
            </div>

            {/* Floating card — Rate Analysis */}
            <div className="lp-hero-float-sm lp-float-1" style={{ width: '55%', top: -16, right: -12 }}>
              <img src="/screenshots/rate-check.png" alt="Rate Analysis" />
            </div>

            {/* Floating card — Dispatch notification */}
            <div className="lp-hero-float-sm lp-float-2" style={{ width: '50%', bottom: -10, left: -16 }}>
              <img src="/screenshots/dispatch.png" alt="AI Dispatch" />
            </div>
          </div>
        </div>

        {/* Fade to white */}
        <div style={{ height: 120, background: 'linear-gradient(180deg, transparent 0%, #ffffff 100%)', marginTop: -20 }} />
      </section>


      {/* ═══════════════════════════════════════════════════════════
          STATS BAR
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ borderTop: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fafafa' }}>
        <div className="lp-stats-grid" style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, textAlign: 'center' }}>
          {[
            { num: '24/7', label: 'Autonomous Dispatch' },
            { num: '3min', label: 'Average Load Match' },
            { num: '14', label: 'Day Free Trial' },
            { num: '196%', label: 'Above Market Avg' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: '#d4910a', letterSpacing: 1, lineHeight: 1 }}>{s.num}</div>
              <div style={{ fontSize: 12, color: 'rgba(26,26,46,0.4)', fontWeight: 600, marginTop: 6, letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          TRUST BAR — Integration Partners (scrolling like Alvys)
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}>
        <div className="lp-trust-section">
          <div className="lp-trust-title">TRUSTED INTEGRATIONS</div>
          <div style={{ overflow: 'hidden' }}>
            <div className="lp-trust-track">
              {[...['DAT FREIGHT', 'TRUCKSTOP', '123LOADBOARD', 'MOTIVE', 'STRIPE', 'QUICKBOOKS', 'COMDATA', 'EFS'], ...['DAT FREIGHT', 'TRUCKSTOP', '123LOADBOARD', 'MOTIVE', 'STRIPE', 'QUICKBOOKS', 'COMDATA', 'EFS']].map((name, i) => (
                <span key={i} className="lp-trust-logo">{name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          HOW Q WORKS — Cinematic Q Simulator
      ═══════════════════════════════════════════════════════════ */}
      <section ref={qRef} id="how-it-works" style={{ padding: '72px 0', background: 'linear-gradient(180deg, #0a0a0e 0%, #12141e 50%, #0a0a0e 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* Cinematic truck background video */}
        <video
          autoPlay loop muted playsInline
          poster="/videos/hero-truck-poster.jpg"
          preload="metadata"
          className="lp-hero-video"
          onCanPlay={e => e.target.classList.add('ready')}
        >
          <source src="/videos/hero-truck.mp4" type="video/mp4" />
        </video>
        <div className="lp-hero-overlay" />

        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 600, background: `radial-gradient(circle, ${qStep >= 4 ? 'rgba(34,197,94,0.08)' : 'rgba(212,145,10,0.08)'} 0%, transparent 70%)`, pointerEvents: 'none', transition: 'background 1s', zIndex: 2 }} />

        <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px', position: 'relative', zIndex: 3 }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 4, color: '#d4910a', textAlign: 'center', marginBottom: 12 }}>MEET YOUR AI DISPATCHER</p>
            <h2 className="lp-section-title" style={{ fontFamily: "'Bebas Neue', sans-serif", textAlign: 'center', margin: '0 0 8px', color: '#fff' }}>Q Runs Your Business While You Drive</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 48, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>Q is the AI dispatcher built into Qivori. It finds loads, calls brokers, negotiates rates, books freight, sends invoices, and gets you paid — all without you lifting a finger. Here's what one load cycle looks like:</p>
          </FadeIn>

          <FadeIn delay={0.15}>
            {/* Q Terminal Card */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '28px 24px', position: 'relative', overflow: 'hidden', boxShadow: `0 0 80px ${qStep >= 4 ? 'rgba(34,197,94,0.06)' : 'rgba(212,145,10,0.06)'}, 0 24px 48px rgba(0,0,0,0.4)`, transition: 'box-shadow 1s' }}>

              {/* Top bar — fake window controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ marginLeft: 12, fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: 1, fontFamily: 'monospace' }}>Q — AUTONOMOUS MODE</span>
                <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.6)', animation: 'lp-pulse 2s ease-in-out infinite' }} />
              </div>

              {/* Progress pipeline */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 28 }}>
                {qSteps.map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < qStep ? '#d4910a' : i === qStep ? '#f0a500' : 'rgba(255,255,255,0.06)', transition: 'background 0.5s', boxShadow: i === qStep ? '0 0 8px rgba(240,165,0,0.4)' : 'none' }} />
                ))}
              </div>

              {/* Active step content */}
              <div style={{ opacity: qFade ? 1 : 0, transform: qFade ? 'translateY(0)' : 'translateY(8px)', transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)', minHeight: 120 }}>
                {/* Q Avatar + Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #d4910a, #f0a500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#fff', fontWeight: 700, boxShadow: '0 4px 16px rgba(212,145,10,0.3)' }}>Q</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, marginBottom: 2 }}>STEP {qStep + 1} OF 8</div>
                    <div style={{ fontSize: 11, color: qStep >= 4 ? 'rgba(34,197,94,0.6)' : 'rgba(212,145,10,0.5)', letterSpacing: 1, transition: 'color 0.5s' }}>{qStep >= 7 ? '● COMPLETE' : qStep >= 4 ? '● EXECUTING' : '● WORKING'}</div>
                  </div>
                </div>

                {/* Main action text */}
                <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8, lineHeight: 1.3 }}>
                  {qSteps[qStep].label}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 16 }}>
                  {qSteps[qStep].detail}
                </div>

                {/* Live metrics bar */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {qStep >= 2 && (
                    <div style={{ padding: '6px 12px', background: 'rgba(212,145,10,0.08)', border: '1px solid rgba(212,145,10,0.15)', borderRadius: 8 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Rate: </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f0a500', fontFamily: 'monospace' }}>$3.87/mi</span>
                    </div>
                  )}
                  {qStep >= 4 && (
                    <div style={{ padding: '6px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Booked: </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>$4,640</span>
                    </div>
                  )}
                  {qStep >= 7 && (
                    <div style={{ padding: '6px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Profit: </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>$1,847</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom label */}
            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.2)', letterSpacing: 2 }}>FULLY AUTONOMOUS — NO HUMAN INPUT REQUIRED</p>
          </FadeIn>
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          BEFORE / AFTER COMPARISON
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding: '64px 20px', borderTop: '1px solid rgba(0,0,0,0.04)', background: '#f9f9fb' }}>
        <FadeIn>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: '#d4910a', textAlign: 'center', marginBottom: 12 }}>THE DIFFERENCE</p>
          <h2 className="lp-section-title" style={{ fontFamily: "'Bebas Neue', sans-serif", textAlign: 'center', margin: '0 0 40px', color: '#1a1a2e' }}>Before Qivori vs. After Qivori</h2>
        </FadeIn>
        <div className="lp-compare-grid">
          <FadeIn delay={0.1}>
            <div className="lp-compare-card" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(26,26,46,0.35)', letterSpacing: 2, marginBottom: 20 }}>WITHOUT Q</div>
              <ul>
                {[
                  { icon: PhoneOff, text: '4+ hours/day calling brokers and refreshing load boards' },
                  { icon: FileText, text: 'Manual invoicing — chasing payments for weeks' },
                  { icon: Clock, text: 'Spreadsheets for IFTA, expenses, compliance, driver pay' },
                  { icon: DollarSign, text: 'Accepting bad loads because you don\'t have time to analyze rates' },
                ].map((item, i) => (
                  <li key={i} style={{ color: 'rgba(26,26,46,0.5)' }}>
                    <Ic icon={item.icon} size={16} color="rgba(26,26,46,0.25)" style={{ marginTop: 2, flexShrink: 0 }} />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div className="lp-compare-card" style={{ background: 'linear-gradient(135deg, rgba(212,145,10,0.04) 0%, rgba(212,145,10,0.02) 100%)', border: '2px solid rgba(212,145,10,0.15)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#d4910a', letterSpacing: 2, marginBottom: 20 }}>WITH Q</div>
              <ul>
                {[
                  { icon: Brain, text: 'Q scans load boards, calls brokers, and books loads — while you sleep' },
                  { icon: Zap, text: 'One-click invoicing with instant factoring — get paid in hours' },
                  { icon: Shield, text: 'IFTA, compliance, expenses auto-tracked — always audit-ready' },
                  { icon: TrendingUp, text: 'AI rate analysis on every load — never leave money on the table' },
                ].map((item, i) => (
                  <li key={i} style={{ color: 'rgba(26,26,46,0.7)' }}>
                    <Ic icon={item.icon} size={16} color="#d4910a" style={{ marginTop: 2, flexShrink: 0 }} />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          THE PIPELINE — every load, every stage (dark premium)
          The original section that made the app feel "modern AI screaming"
      ═══════════════════════════════════════════════════════════ */}
      <section style={{
        background: 'radial-gradient(ellipse at top, #0c0f17 0%, #07090e 60%)',
        color: '#fff',
        padding: '80px 20px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <FadeIn>
            <div style={{
              fontSize: 12, fontWeight: 800, color: '#f0a500',
              letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14,
            }}>
              THE PIPELINE
            </div>
            <h2 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(36px, 7vw, 56px)',
              lineHeight: 1.05,
              letterSpacing: 1,
              margin: '0 0 18px',
              color: '#fff',
            }}>
              EVERY LOAD. EVERY STAGE.
            </h2>
            <p style={{
              fontSize: 15, color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.6, margin: '0 auto 40px', maxWidth: 520,
            }}>
              From booking to invoice — Q moves your loads through every stage automatically.
            </p>
          </FadeIn>

          {/* Tab pills with counts */}
          <FadeIn delay={0.1}>
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'center',
              marginBottom: 36, flexWrap: 'wrap',
            }}>
              {[
                { label: 'Booked', count: 2, active: false },
                { label: 'Dispatched', count: 1, active: false },
                { label: 'In Transit', count: 3, active: true },
              ].map((tab) => (
                <div key={tab.label} style={{
                  padding: '10px 20px',
                  borderRadius: 999,
                  background: tab.active ? 'rgba(240,165,0,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tab.active ? 'rgba(240,165,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 13, fontWeight: 700,
                  color: tab.active ? '#f0a500' : 'rgba(255,255,255,0.6)',
                }}>
                  <span>{tab.label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 900,
                    background: tab.active ? 'rgba(240,165,0,0.25)' : 'rgba(255,255,255,0.08)',
                    padding: '2px 8px', borderRadius: 999,
                    color: tab.active ? '#f0a500' : 'rgba(255,255,255,0.6)',
                  }}>{tab.count}</span>
                </div>
              ))}
            </div>
          </FadeIn>

          {/* Stacked stages */}
          {[
            {
              label: 'BOOKED',
              color: '#3b82f6',
              loads: [
                { route: 'PHX → LAX', sub: 'Open', amount: '$1,600' },
                { route: 'SEA → PDX', sub: 'Open', amount: '$890' },
              ],
            },
            {
              label: 'DISPATCHED',
              color: '#a855f7',
              loads: [
                { route: 'ATL → MIA', sub: 'Carlos R.', amount: '$2,100' },
              ],
            },
            {
              label: 'IN TRANSIT',
              color: '#f0a500',
              loads: [
                { route: 'DAL → ATL', sub: 'Mike J.', amount: '$3,840', progress: 0.65 },
                { route: 'CHI → DET', sub: 'Amir K.', amount: '$1,890', progress: 0.42 },
              ],
            },
          ].map((stage, si) => (
            <FadeIn key={si} delay={0.2 + si * 0.1}>
              <div style={{ marginBottom: 24, textAlign: 'left' }}>
                {/* Stage header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: stage.color,
                    boxShadow: `0 0 12px ${stage.color}80`,
                  }} />
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    color: stage.color, letterSpacing: 2,
                  }}>
                    {stage.label}
                  </span>
                </div>

                {/* Load cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {stage.loads.map((load, li) => (
                    <div key={li} style={{
                      position: 'relative',
                      padding: '16px 18px',
                      background: 'rgba(255,255,255,0.03)',
                      borderLeft: `3px solid ${stage.color}`,
                      borderRadius: 12,
                      overflow: 'hidden',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 16, fontWeight: 800, color: '#fff',
                            marginBottom: 4, fontFamily: "'DM Sans', sans-serif",
                          }}>
                            {load.route}
                          </div>
                          <div style={{
                            fontSize: 12, color: 'rgba(255,255,255,0.5)',
                            fontWeight: 600,
                          }}>
                            {load.sub}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 22, fontWeight: 900,
                          color: stage.color,
                          fontFamily: "'Bebas Neue', sans-serif",
                          letterSpacing: 0.5,
                        }}>
                          {load.amount}
                        </div>
                      </div>
                      {/* Progress bar for in-transit cards */}
                      {load.progress != null && (
                        <div style={{
                          marginTop: 14,
                          height: 3,
                          background: 'rgba(255,255,255,0.06)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${load.progress * 100}%`,
                            background: `linear-gradient(90deg, ${stage.color}, ${stage.color}aa)`,
                            borderRadius: 2,
                            boxShadow: `0 0 12px ${stage.color}60`,
                          }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          FEATURES — Alternating screenshot sections
      ═══════════════════════════════════════════════════════════ */}
      <section ref={featRef} id="features">
        {featureSections.map((f, i) => (
          <div key={i} style={{ borderTop: '1px solid rgba(0,0,0,0.04)', background: i % 2 === 0 ? '#fff' : '#f9f9fb' }}>
            <div className={`lp-feature-row lp-feature-row-${i % 2 === 0 ? 'normal' : 'reverse'}`}>
              <div className="lp-feature-text">
                <FadeIn>
                  <div style={{ display: 'inline-flex', padding: '4px 10px', background: 'rgba(212,145,10,0.08)', borderRadius: 6, marginBottom: 14 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: '#d4910a' }}>{f.tag}</span>
                  </div>
                  <h3 className="lp-section-title" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, lineHeight: 1.1, margin: '0 0 16px', color: '#1a1a2e' }}>{f.title}</h3>
                  <p style={{ fontSize: 15, color: 'rgba(26,26,46,0.5)', lineHeight: 1.7, marginBottom: 24 }}>{f.desc}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {f.bullets.map((b, bi) => (
                      <li key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'rgba(26,26,46,0.6)' }}>
                        <Ic icon={Check} size={16} color="#d4910a" style={{ marginTop: 2, flexShrink: 0 }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </FadeIn>
              </div>
              <div className="lp-feature-img">
                <FadeIn delay={0.15}>
                  {f.cinematic === 'commandcenter' ? (
                    <div style={{ background: '#fafaf8', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
                      {/* Header */}
                      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'lp-pulse 2s infinite' }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#d4910a', letterSpacing: 1.5, fontFamily: "'Bebas Neue',sans-serif" }}>Q LOAD INTELLIGENCE</span>
                        </div>
                        <span style={{ fontSize: 9, color: 'rgba(26,26,46,0.3)' }}>Command Center</span>
                      </div>

                      <div className="lp-cc-body">
                        {/* Left panel — Dispatch Queue + Fleet Status */}
                        <div className="lp-cc-left">
                          {/* Dispatch Queue */}
                          <div style={{ fontSize: 8, fontWeight: 700, color: '#d4910a', letterSpacing: 1.5, marginBottom: 6 }}>DISPATCH QUEUE</div>
                          <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
                            {['All', 'In Transit', 'Loaded', 'Assigned'].map((f2, fi) => (
                              <span key={fi} style={{ fontSize: 7, padding: '2px 5px', borderRadius: 3, background: fi === 0 ? '#1a1a2e' : 'rgba(0,0,0,0.04)', color: fi === 0 ? '#fff' : 'rgba(26,26,46,0.35)', fontWeight: 600 }}>{f2}</span>
                            ))}
                          </div>
                          {/* Stat pills */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
                            {[
                              { label: 'Active Loads', value: '4', color: '#d4910a' },
                              { label: 'Total Miles', value: '2,126', color: '#1a1a2e' },
                              { label: 'Total Gross', value: '$12,250', color: '#22c55e' },
                              { label: 'Avg Rate', value: '$6.14', color: '#1a1a2e' },
                            ].map((s, si) => (
                              <div key={si} style={{ padding: '4px 6px', background: 'rgba(212,145,10,0.04)', border: '1px solid rgba(212,145,10,0.08)', borderRadius: 4, textAlign: 'center' }}>
                                <div style={{ fontSize: 6, color: 'rgba(26,26,46,0.3)', letterSpacing: 0.5 }}>{s.label}</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: s.color, fontFamily: "'Bebas Neue',sans-serif" }}>{s.value}</div>
                              </div>
                            ))}
                          </div>

                          {/* Fleet Status */}
                          <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(26,26,46,0.35)', letterSpacing: 1, marginBottom: 6 }}>FLEET STATUS</div>
                          {[
                            { unit: 'Unit 1', name: 'David', status: 'In Transit', color: '#22c55e' },
                            { unit: 'Unit 2', name: 'Marcus', status: 'Rate Con Received', color: '#3b82f6' },
                            { unit: 'Unit 3', name: 'James', status: 'Available', color: 'rgba(26,26,46,0.25)' },
                            { unit: 'Unit 4', name: 'Andre', status: 'Available', color: 'rgba(26,26,46,0.25)' },
                            { unit: 'Unit 5', name: 'Mohamed', status: 'Available', color: 'rgba(26,26,46,0.25)' },
                          ].map((truck, ti) => {
                            const isActive = ti === ccAlert
                            return (
                              <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', marginBottom: 2, background: isActive ? 'rgba(212,145,10,0.04)' : 'transparent', borderRadius: 4, transition: 'background 0.3s' }}>
                                <div style={{ width: 5, height: 5, borderRadius: '50%', background: truck.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 8, fontWeight: 600, color: '#1a1a2e', flex: 1 }}>{truck.unit} <span style={{ fontWeight: 400, color: 'rgba(26,26,46,0.35)' }}>{truck.name}</span></span>
                                <span style={{ fontSize: 7, color: truck.color, fontWeight: 600 }}>{truck.status}</span>
                              </div>
                            )
                          })}
                        </div>

                        {/* Center — Map */}
                        <div className="lp-cc-map">
                          {/* Map background */}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #e8e4d8 0%, #d4cfc2 50%, #e0dbd0 100%)', borderRadius: 0, overflow: 'hidden' }}>
                            {/* Grid lines for map feel */}
                            {[20, 40, 60, 80].map(p => (
                              <div key={`h${p}`} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, height: 1, background: 'rgba(0,0,0,0.04)' }} />
                            ))}
                            {[20, 40, 60, 80].map(p => (
                              <div key={`v${p}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 1, background: 'rgba(0,0,0,0.04)' }} />
                            ))}

                            {/* Route line LA → Phoenix */}
                            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                              <path d={`M 25 45 Q 50 35 ${25 + ccTick * 0.5} ${45 - ccTick * 0.1} L 78 55`} stroke="#3b82f6" strokeWidth="0.8" fill="none" strokeDasharray="2 1" opacity="0.6" />
                            </svg>

                            {/* City markers */}
                            <div style={{ position: 'absolute', left: '20%', top: '40%', transform: 'translate(-50%, -50%)' }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.4)' }} />
                              <div style={{ fontSize: 6, color: 'rgba(26,26,46,0.5)', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' }}>Los Angeles</div>
                            </div>
                            <div style={{ position: 'absolute', left: '78%', top: '52%', transform: 'translate(-50%, -50%)' }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.4)' }} />
                              <div style={{ fontSize: 6, color: 'rgba(26,26,46,0.5)', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' }}>Phoenix</div>
                            </div>

                            {/* Moving truck dot */}
                            <div style={{ position: 'absolute', left: `${20 + ccTick * 0.58}%`, top: `${40 + ccTick * 0.12}%`, transform: 'translate(-50%, -50%)', transition: 'left 0.12s linear, top 0.12s linear' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d4910a', border: '2px solid #fff', boxShadow: '0 0 8px rgba(212,145,10,0.5)' }} />
                              <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#1a1a2e', color: '#fff', fontSize: 5, padding: '1px 4px', borderRadius: 2, whiteSpace: 'nowrap' }}>5 hr 14 min</div>
                            </div>

                            {/* Route label */}
                            <div style={{ position: 'absolute', left: 10, top: 10, background: 'rgba(255,255,255,0.9)', padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.06)' }}>
                              <div style={{ fontSize: 7, fontWeight: 700, color: '#d4910a' }}>XPO-5548 <span style={{ color: '#22c55e', fontWeight: 600 }}>In Transit</span></div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#1a1a2e' }}>Los Angeles → Phoenix</div>
                              <div style={{ fontSize: 7, color: 'rgba(26,26,46,0.4)' }}>370 mi · 65% complete · $6.49/mi</div>
                            </div>
                          </div>
                        </div>

                        {/* Right panel — Driver + HOS + Active Load */}
                        <div className="lp-cc-right">
                          {/* Driver card */}
                          <div style={{ textAlign: 'center', marginBottom: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #d4910a, #f0a500)', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>D</div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#1a1a2e' }}>David Rodriguez</div>
                            <div style={{ fontSize: 7, color: 'rgba(26,26,46,0.35)' }}>Unit 1 · CDL A</div>
                          </div>

                          {/* HOS */}
                          <div style={{ fontSize: 7, fontWeight: 700, color: 'rgba(26,26,46,0.35)', letterSpacing: 1, marginBottom: 4 }}>HOURS OF SERVICE</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', fontFamily: "'Bebas Neue',sans-serif", marginBottom: 4 }}>
                            {Math.max(0, 6 - Math.floor(ccTick * 0.06))}h {Math.max(0, 50 - Math.floor(ccTick * 0.5) % 60)}m <span style={{ fontSize: 9, fontWeight: 400, color: 'rgba(26,26,46,0.3)' }}>REMAINING</span>
                          </div>
                          {/* HOS bar */}
                          <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 2, background: ccTick > 70 ? '#f59e0b' : '#22c55e', width: `${Math.max(10, 100 - ccTick * 0.9)}%`, transition: 'width 0.12s linear, background 0.3s' }} />
                          </div>

                          {/* Active Load */}
                          <div style={{ fontSize: 7, fontWeight: 700, color: '#d4910a', letterSpacing: 1, marginBottom: 4 }}>ACTIVE LOAD</div>
                          {[
                            ['Load ID', 'XPO-5548'],
                            ['Broker', 'XPO Logistics'],
                            ['Miles', '370 mi'],
                            ['Rate', '$6.49/mi'],
                            ['Gross Pay', '$2,400'],
                            ['Commodity', 'Produce — temp-sensitive'],
                            ['Weight', '35,000 lbs'],
                          ].map(([k, v], ki) => (
                            <div key={ki} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 7, color: 'rgba(26,26,46,0.3)' }}>{k}</span>
                              <span style={{ fontSize: 7, fontWeight: 600, color: '#1a1a2e' }}>{v}</span>
                            </div>
                          ))}

                          {/* Performance */}
                          <div style={{ fontSize: 7, fontWeight: 700, color: 'rgba(26,26,46,0.35)', letterSpacing: 1, marginTop: 8, marginBottom: 4 }}>PERFORMANCE · MTD</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
                            <span style={{ color: 'rgba(26,26,46,0.3)' }}>Loads Run</span>
                            <span style={{ fontWeight: 700, color: '#1a1a2e' }}>3</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7 }}>
                            <span style={{ color: 'rgba(26,26,46,0.3)' }}>Miles</span>
                            <span style={{ fontWeight: 700, color: '#1a1a2e' }}>1,206</span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom — Live status bar */}
                      <div className="lp-cc-status-bar" style={{ padding: '6px 14px', borderTop: '1px solid rgba(0,0,0,0.05)', background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'lp-pulse 2s infinite', flexShrink: 0 }} />
                        <span style={{ fontSize: 8, color: 'rgba(26,26,46,0.4)', whiteSpace: 'nowrap' }}>Unit 1</span>
                        <span style={{ fontSize: 8, fontWeight: 600, color: '#1a1a2e', whiteSpace: 'nowrap' }}>David</span>
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#d4910a', whiteSpace: 'nowrap' }}>XPO-5548</span>
                        <span style={{ fontSize: 8, color: '#1a1a2e', whiteSpace: 'nowrap' }}>Los Angeles → Phoenix</span>
                        <span style={{ fontSize: 8, color: '#22c55e', fontWeight: 600, whiteSpace: 'nowrap' }}>{Math.round(65 + ccTick * 0.35)}%</span>
                        <span style={{ fontSize: 8, color: 'rgba(26,26,46,0.3)', whiteSpace: 'nowrap' }}>Mar 26</span>
                        <span style={{ fontSize: 8, color: 'rgba(26,26,46,0.3)', fontWeight: 600, whiteSpace: 'nowrap' }}>65.0h</span>
                      </div>
                    </div>
                  ) : f.cinematic === 'dispatch' ? (
                    <div style={{ background: '#fafaf8', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
                      {/* Dispatch Header */}
                      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'lp-pulse 2s infinite' }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#d4910a', letterSpacing: 1.5, fontFamily: "'Bebas Neue',sans-serif" }}>Q DISPATCH AI</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: dispatchPhase === 3 ? 'rgba(34,197,94,0.08)' : 'rgba(212,145,10,0.08)', border: `1px solid ${dispatchPhase === 3 ? 'rgba(34,197,94,0.15)' : 'rgba(212,145,10,0.15)'}`, borderRadius: 4, transition: 'all 0.4s' }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: dispatchPhase === 3 ? '#22c55e' : '#d4910a', animation: 'lp-pulse 1.5s infinite' }} />
                          <span style={{ fontSize: 9, fontWeight: 700, color: dispatchPhase === 3 ? '#22c55e' : '#d4910a', transition: 'color 0.4s' }}>
                            {dispatchPhase === 3 ? 'CALLING BROKER' : 'AUTO-NEGOTIATE'}
                          </span>
                        </div>
                      </div>

                      <div className="lp-dispatch-body">
                        {/* Left — Load list */}
                        <div className="lp-dispatch-left">
                          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(26,26,46,0.35)', letterSpacing: 1, marginBottom: 8 }}>LOADS READY FOR DISPATCH <span style={{ color: '#d4910a', marginLeft: 4 }}>2</span></div>

                          {/* Load cards */}
                          {[
                            { id: 'CH-9102', route: 'Memphis → Houston', rate: '$3,200', mi: '586 mi', broker: 'C.H. Robinson', active: true },
                            { id: 'TQL-7733', route: 'Atlanta → Nashville', rate: '$1,850', mi: '250 mi', broker: 'TQL', active: false },
                          ].map((load, li) => (
                            <div key={li} style={{ padding: '10px', marginBottom: 6, background: li === 0 && dispatchPhase >= 1 ? 'rgba(212,145,10,0.04)' : '#fff', border: `1px solid ${li === 0 && dispatchPhase >= 1 ? 'rgba(212,145,10,0.15)' : 'rgba(0,0,0,0.06)'}`, borderRadius: 8, transition: 'all 0.4s', transform: li === 0 && dispatchPhase >= 1 ? 'scale(1.01)' : 'scale(1)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#d4910a' }}>{load.id}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#1a1a2e' }}>{load.rate}</span>
                              </div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e', marginBottom: 2 }}>{load.route}</div>
                              <div style={{ fontSize: 9, color: 'rgba(26,26,46,0.35)' }}>{load.rate} · {load.mi} · {load.broker}</div>
                            </div>
                          ))}
                        </div>

                        {/* Right — Selected load detail + broker card */}
                        <div className="lp-dispatch-right">
                          {/* Selected load detail */}
                          <div style={{ opacity: dispatchPhase >= 1 ? 1 : 0.3, transition: 'opacity 0.5s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#d4910a' }}>CH-9102</span>
                              <span style={{ fontSize: 16, fontWeight: 700, color: '#22c55e', fontFamily: "'Bebas Neue',sans-serif" }}>$3,200</span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Memphis → Houston</div>

                            {/* Profit metrics row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                              {[
                                { label: 'EST PROFIT', value: '$1,278', color: '#22c55e' },
                                { label: 'PROFIT/MI', value: '$2.18', color: '#1a1a2e' },
                                { label: 'PROJECTION', value: '$638', color: '#22c55e' },
                              ].map((m, mi) => (
                                <div key={mi} style={{ padding: '6px 8px', background: 'rgba(212,145,10,0.04)', border: '1px solid rgba(212,145,10,0.1)', borderRadius: 6, textAlign: 'center' }}>
                                  <div style={{ fontSize: 7, fontWeight: 700, color: 'rgba(26,26,46,0.3)', letterSpacing: 1 }}>{m.label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: m.color, fontFamily: "'Bebas Neue',sans-serif" }}>{m.value}</div>
                                </div>
                              ))}
                            </div>

                            {/* Accept bar */}
                            <div style={{ padding: '4px 8px', background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)', borderRadius: 4, marginBottom: 8 }}>
                              <div style={{ fontSize: 8, color: 'rgba(34,197,94,0.6)', textAlign: 'center' }}>Strong rate. Accept and secure before broker shops elsewhere.</div>
                            </div>

                            {/* Call Broker button */}
                            <div style={{ padding: '8px 0', borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: 700, background: dispatchPhase >= 3 ? 'rgba(34,197,94,0.1)' : 'linear-gradient(135deg, #d4910a, #f0a500)', color: dispatchPhase >= 3 ? '#22c55e' : '#fff', border: dispatchPhase >= 3 ? '1px solid rgba(34,197,94,0.2)' : 'none', transition: 'all 0.4s' }}>
                              {dispatchPhase >= 3 ? '✓ Q is calling C.H. Robinson...' : 'ACTIVATE Q — CALL BROKER'}
                            </div>

                            {/* Driver assignment */}
                            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: dispatchPhase >= 2 ? 1 : 0.3, transition: 'opacity 0.4s' }}>
                              <span style={{ fontSize: 9, color: 'rgba(26,26,46,0.35)' }}>Test Driver: "Marcus Johnson" → Accept/Decline</span>
                            </div>
                          </div>

                          {/* Broker card — slides in phase 2+ */}
                          {dispatchPhase >= 2 && (
                            <div className="lp-dispatch-broker" style={{ marginTop: 10, padding: '10px', background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, animation: 'lp-card-enter 0.5s ease-out' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>C.H. Robinson <span style={{ fontSize: 8, fontWeight: 600, color: '#d4910a', marginLeft: 4 }}>B</span></div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 8 }}>
                                {[
                                  ['RATE', '$5.46/mi'],
                                  ['RESPONSE', 'On Time'],
                                  ['TARGET RATE', '$3,200'],
                                  ['CREDIT STANDING', '+$150-300'],
                                  ['PROFICIENCY', 'Medium'],
                                  ['AUTO-ACCEPT', 'OFF'],
                                ].map(([k, v], ki) => (
                                  <div key={ki} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'rgba(26,26,46,0.3)' }}>{k}</span>
                                    <span style={{ fontWeight: 600, color: v === 'On Time' ? '#22c55e' : '#1a1a2e' }}>{v}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{ marginTop: 6, fontSize: 8, fontWeight: 700, color: 'rgba(26,26,46,0.3)', letterSpacing: 1 }}>NEGOTIATION RULES</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3, fontSize: 8 }}>
                                {[['Min Rate/Mile', '$2.50'], ['Counter Markup', '15%'], ['Max Rounds', '3']].map(([k, v], ki) => (
                                  <div key={ki} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'rgba(26,26,46,0.3)' }}>{k}</span>
                                    <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{v}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : f.cinematic === 'ratecheck' ? (
                    <div style={{ background: '#fafaf8', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
                      {/* Rate Check Header */}
                      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'lp-pulse 2s infinite' }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#d4910a', letterSpacing: 1.5, fontFamily: "'Bebas Neue',sans-serif" }}>Q LOAD INTELLIGENCE</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(26,26,46,0.35)' }}>
                          Est. Portfolio Profit: <span style={{ fontWeight: 700, color: '#1a1a2e', fontFamily: "'Bebas Neue',sans-serif", fontSize: 14 }}>$4,484</span>
                        </div>
                      </div>

                      {/* Tab bar */}
                      <div className="lp-rate-tabs" style={{ padding: '0 18px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        {['Pipeline', 'Q Dispatch', 'List View', 'Dispatch Board', 'Check Calls', 'Command Center', 'Lane Intel', 'Rate Check'].map((tab, ti) => (
                          <span key={ti} style={{ fontSize: 10, padding: '10px 0', color: ti === 7 ? '#d4910a' : 'rgba(26,26,46,0.35)', borderBottom: ti === 7 ? '2px solid #d4910a' : '2px solid transparent', fontWeight: ti === 7 ? 700 : 400, whiteSpace: 'nowrap' }}>{tab}</span>
                        ))}
                      </div>

                      <div style={{ padding: '16px 18px' }}>
                        {/* Rate Factors */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(26,26,46,0.4)', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Ic icon={TrendingUp} size={10} color="rgba(26,26,46,0.3)" />
                            Rate Factors
                          </div>
                          {[
                            { factor: 'Rate vs Market', detail: 'Offered $5.46/mi is 76% above $3.10/mi market average', delay: 0 },
                            { factor: 'Profit Margin', detail: '60% profit margin with $1,800 net profit is exceptional', delay: 0.15 },
                            { factor: 'Weight Utilization', detail: '44,000 lbs provides good revenue without overweight concerns', delay: 0.3 },
                          ].map((rf, ri) => {
                            const visible = ratePhase >= 1 || (ratePhase === 0 && ri === 0)
                            return (
                              <div key={ri} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', marginBottom: 4, background: visible ? 'rgba(34,197,94,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${visible ? 'rgba(34,197,94,0.1)' : 'rgba(0,0,0,0.04)'}`, borderRadius: 6, opacity: ratePhase === 0 && ri > 0 ? 0.3 : 1, transition: 'all 0.5s ease' }}>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e', marginBottom: 1 }}>{rf.factor}</div>
                                  <div style={{ fontSize: 9, color: 'rgba(26,26,46,0.4)' }}>{rf.detail}</div>
                                </div>
                                <span style={{ fontSize: 9, fontWeight: 800, color: visible ? '#22c55e' : 'rgba(26,26,46,0.2)', letterSpacing: 0.5, transition: 'color 0.5s', flexShrink: 0, marginLeft: 8 }}>
                                  {visible ? 'POSITIVE' : '...'}
                                </span>
                              </div>
                            )
                          })}
                        </div>

                        {/* Profit Breakdown */}
                        <div style={{ marginBottom: 14, opacity: ratePhase >= 2 ? 1 : 0.3, transition: 'opacity 0.5s' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(26,26,46,0.4)', letterSpacing: 1, marginBottom: 8 }}>$ Profit Breakdown</div>
                          <div className="lp-rate-profit-row">
                            {/* Donut placeholder */}
                            <div className="lp-rate-donut" style={{ borderRadius: '50%', background: `conic-gradient(#22c55e 0% ${Math.round(55 * Math.min(rateCosts, 100) / 100)}%, #3b82f6 ${Math.round(55 * Math.min(rateCosts, 100) / 100)}% ${Math.round(70 * Math.min(rateCosts, 100) / 100)}%, #f59e0b ${Math.round(70 * Math.min(rateCosts, 100) / 100)}% ${Math.round(82 * Math.min(rateCosts, 100) / 100)}%, #8b5cf6 ${Math.round(82 * Math.min(rateCosts, 100) / 100)}% ${Math.round(90 * Math.min(rateCosts, 100) / 100)}%, #ec4899 ${Math.round(90 * Math.min(rateCosts, 100) / 100)}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.3s' }}>
                              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fafaf8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#1a1a2e', fontFamily: "'Bebas Neue',sans-serif" }}>${Math.round(1600 * Math.min(rateCosts, 100) / 100).toLocaleString()}</div>
                                <div style={{ fontSize: 6, color: 'rgba(26,26,46,0.3)' }}>NET</div>
                              </div>
                            </div>
                            {/* Cost lines */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {[
                                { label: 'Fuel', amount: 438, color: '#ef4444' },
                                { label: 'Insurance', amount: 78, color: '#3b82f6' },
                                { label: 'Maintenance', amount: 55, color: '#f59e0b' },
                                { label: 'Tolls', amount: 32, color: '#8b5cf6' },
                                { label: 'Truck PMT', amount: 117, color: '#ec4899' },
                                { label: 'Driver Pay', amount: 864, color: '#14b8a6' },
                                { label: 'Net Profit', amount: 1600, color: '#22c55e' },
                              ].map((c, ci) => (
                                <div key={ci} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <div style={{ width: 5, height: 5, borderRadius: 1, background: c.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: 9, color: 'rgba(26,26,46,0.45)' }}>{c.label}</span>
                                  </div>
                                  <span style={{ fontSize: 9, fontWeight: ci === 6 ? 800 : 600, color: ci === 6 ? '#22c55e' : '#1a1a2e', fontFamily: 'monospace' }}>${Math.round(c.amount * Math.min(rateCosts, 100) / 100).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Counter-Offer Script */}
                        <div className="lp-rate-counter-section" style={{ opacity: ratePhase >= 3 ? 1 : 0.2, transition: 'opacity 0.6s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(26,26,46,0.4)', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Ic icon={FileText} size={10} color="rgba(26,26,46,0.3)" />
                              Counter-Offer Script
                            </div>
                            <span style={{ fontSize: 8, fontWeight: 700, color: '#d4910a', padding: '2px 8px', background: 'rgba(212,145,10,0.08)', borderRadius: 4 }}>Copy Script</span>
                          </div>
                          <div style={{ padding: '10px 12px', background: 'rgba(212,145,10,0.03)', border: '1px solid rgba(212,145,10,0.1)', borderRadius: 8, fontSize: 9, color: 'rgba(26,26,46,0.55)', lineHeight: 1.6, fontStyle: 'italic' }}>
                            "Hi, this is [Name] regarding your Memphis to Houston flatbed load. Market rates are running <span style={{ fontWeight: 700, color: '#1a1a2e' }}>$3.10/mi</span> average, and you're offering <span style={{ fontWeight: 700, color: '#1a1a2e' }}>$5.46</span> which is competitive. Could we bump it to <span style={{ fontWeight: 700, color: '#22c55e' }}>$5.61 per mile</span> at <span style={{ fontWeight: 700, color: '#22c55e' }}>$3,287 total</span>?"
                          </div>
                          <div className="lp-rate-counter-btns" style={{ marginTop: 8 }}>
                            <div style={{ padding: '6px 0', borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 700, background: 'linear-gradient(135deg, #d4910a, #f0a500)', color: '#fff' }}>Copy Counter Script</div>
                            <div style={{ padding: '6px 0', borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 600, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)', color: 'rgba(26,26,46,0.5)' }}>Call Broker</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : f.cinematic === 'financials' ? (
                    <div style={{ background: '#fafaf8', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
                      {/* Financial Snapshot Header */}
                      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Ic icon={DollarSign} size={14} color="#d4910a" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', letterSpacing: 0.5 }}>FINANCIAL SNAPSHOT</span>
                        </div>
                        <span style={{ fontSize: 10, color: 'rgba(26,26,46,0.35)' }}>Full P&L →</span>
                      </div>

                      {/* Revenue / Profit / Fuel / Unpaid row */}
                      <div className="lp-fin-metrics">
                        {[
                          { label: 'REVENUE', value: `$${Math.round(18400 * Math.min(finAnim, 100) / 100).toLocaleString()}`, color: '#22c55e', sub: 'This week' },
                          { label: 'PROFIT', value: `$${Math.round(6847 * Math.min(finAnim, 100) / 100).toLocaleString()}`, color: '#22c55e', sub: 'After all costs' },
                          { label: 'FUEL', value: `$${Math.round(1800 * Math.min(finAnim, 100) / 100).toLocaleString()}`, color: '#f59e0b', sub: 'EIA avg $3.41' },
                          { label: 'UNPAID', value: `$${Math.round(4200 * Math.min(finAnim, 100) / 100).toLocaleString()}`, color: '#ef4444', sub: '2 invoices' },
                        ].map((m, mi) => (
                          <div key={mi} style={{ padding: '12px 14px', textAlign: 'center', borderRight: mi < 3 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(26,26,46,0.3)', marginBottom: 4 }}>{m.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: "'Bebas Neue',sans-serif" }}>{m.value}</div>
                            <div style={{ fontSize: 8, color: 'rgba(26,26,46,0.25)', marginTop: 2 }}>{m.sub}</div>
                          </div>
                        ))}
                      </div>

                      {/* Pipeline mini + Activity Log */}
                      <div className="lp-fin-split">
                        <div style={{ padding: '12px 14px', borderRight: '1px solid rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#d4910a' }} />
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(26,26,46,0.4)', letterSpacing: 1 }}>PIPELINE</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {[
                              { n: 1, l: 'BKD', c: '#d4910a' },
                              { n: 1, l: 'DSP', c: '#3b82f6' },
                              { n: 1, l: 'TRN', c: '#22c55e' },
                              { n: 0, l: 'DLV', c: '#8b5cf6' },
                              { n: 0, l: 'INV', c: '#ec4899' },
                              { n: 1, l: 'PAD', c: '#14b8a6' },
                            ].map((p, pi) => (
                              <div key={pi} style={{ flex: 1, textAlign: 'center', padding: '4px 0', background: p.n > 0 ? `${p.c}08` : 'rgba(0,0,0,0.02)', border: `1px solid ${p.n > 0 ? `${p.c}20` : 'rgba(0,0,0,0.04)'}`, borderRadius: 4 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: p.n > 0 ? p.c : 'rgba(26,26,46,0.15)' }}>{p.n}</div>
                                <div style={{ fontSize: 6, fontWeight: 700, color: 'rgba(26,26,46,0.25)', letterSpacing: 0.5 }}>{p.l}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                            <Ic icon={Clock} size={9} color="rgba(26,26,46,0.3)" />
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(26,26,46,0.4)', letterSpacing: 1 }}>ACTIVITY LOG</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 9, color: 'rgba(26,26,46,0.45)' }}>XPO-5548 in transit</div>
                            <div style={{ fontSize: 9, color: 'rgba(26,26,46,0.45)' }}>CH-9102 rate con received</div>
                          </div>
                        </div>
                      </div>

                      {/* Q Daily Briefing — animated alert */}
                      <div className="lp-fin-briefing" style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <div style={{ width: 18, height: 18, borderRadius: 5, background: 'linear-gradient(135deg, #d4910a, #f0a500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', fontFamily: "'Bebas Neue',sans-serif" }}>Q</div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#d4910a', letterSpacing: 1 }}>Q DAILY BRIEFING</span>
                        </div>
                        {[
                          { text: '4 trucks idle — losing ~$0/day', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)' },
                          { text: 'Weekly profit up 23% vs last week', color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.15)' },
                          { text: '2 unpaid invoices aging past 15 days', color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.15)' },
                          { text: 'Hot lane detected: ATL→MEM paying $4.10/mi', color: '#d4910a', bg: 'rgba(212,145,10,0.06)', border: 'rgba(212,145,10,0.15)' },
                        ].map((alert, ai) => (
                          <div key={ai} style={{ padding: '6px 10px', marginBottom: 4, background: ai === finAlert ? alert.bg : 'transparent', border: `1px solid ${ai === finAlert ? alert.border : 'transparent'}`, borderRadius: 6, transition: 'all 0.4s', opacity: ai === finAlert ? 1 : 0.35 }}>
                            <span style={{ fontSize: 10, color: ai === finAlert ? alert.color : 'rgba(26,26,46,0.3)', fontWeight: ai === finAlert ? 600 : 400, transition: 'all 0.4s' }}>
                              {ai === finAlert ? '→ ' : ''}{alert.text}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Weekly Report / Goal */}
                      <div className="lp-fin-weekly">
                        <div style={{ paddingRight: 12, borderRight: '1px solid rgba(0,0,0,0.04)' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(26,26,46,0.4)', letterSpacing: 1, marginBottom: 6 }}>WEEKLY REPORT</div>
                          {[
                            ['Profit this week', `$${Math.round(6847 * Math.min(finAnim, 100) / 100).toLocaleString()}`],
                            ['Loads completed', Math.round(7 * Math.min(finAnim, 100) / 100)],
                            ['Avg $/mile', `$${(3.42 * Math.min(finAnim, 100) / 100).toFixed(2)}`],
                          ].map(([k, v], ki) => (
                            <div key={ki} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 9, color: 'rgba(26,26,46,0.35)' }}>{k}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#1a1a2e', fontFamily: 'monospace' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ paddingLeft: 12 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(26,26,46,0.4)', letterSpacing: 1, marginBottom: 6 }}>WEEKLY GOAL</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', fontFamily: "'Bebas Neue',sans-serif" }}>${Math.round(6847 * Math.min(finAnim, 100) / 100).toLocaleString()}</span>
                            <span style={{ fontSize: 9, color: 'rgba(26,26,46,0.3)' }}>/ $8,000</span>
                          </div>
                          {/* Progress bar */}
                          <div style={{ height: 6, background: 'rgba(0,0,0,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #d4910a, #f0a500)', width: `${Math.min(85 * finAnim / 100, 85)}%`, transition: 'width 0.15s linear' }} />
                          </div>
                          <div style={{ fontSize: 8, color: 'rgba(26,26,46,0.25)', marginTop: 4 }}>{Math.round(85 * Math.min(finAnim, 100) / 100)}% complete</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img src={f.img} alt={f.title} className="lp-screenshot" />
                  )}
                </FadeIn>
              </div>
            </div>
          </div>
        ))}
      </section>


      {/* ═══════════════════════════════════════════════════════════
          FULL DASHBOARD — Pipeline + Fleet
      ═══════════════════════════════════════════════════════════ */}
      <section ref={backRef} style={{ padding: '64px 20px', borderTop: '1px solid rgba(0,0,0,0.04)', background: '#f9f9fb' }}>
        <FadeIn>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: '#d4910a', textAlign: 'center', marginBottom: 12 }}>EVERYTHING ELSE Q HANDLES</p>
          <h2 className="lp-section-title" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, textAlign: 'center', margin: '0 0 8px', color: '#1a1a2e' }}>The Back Office That Runs Itself</h2>
          <p style={{ fontSize: 15, color: 'rgba(26,26,46,0.5)', textAlign: 'center', marginBottom: 48, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>Compliance, IFTA, expenses, EDI, load pipeline — the stuff that eats your evenings. Q handles all of it so you don't have to.</p>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div ref={pipeRef} style={{ maxWidth: 1100, margin: '0 auto', marginBottom: 24, background: '#fafaf8', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            {/* ── Q Load Intelligence Header ── */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'lp-pulse 2s infinite', boxShadow: '0 0 6px rgba(34,197,94,0.4)' }} />
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 2, color: '#d4910a' }}>Q LOAD INTELLIGENCE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'rgba(26,26,46,0.45)' }}>
                <span>Evaluating 4 loads in real time</span>
                <span style={{ fontWeight: 700, color: '#1a1a2e' }}>Est. Portfolio Profit: <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#1a1a2e' }}>${Math.round(4484 * Math.min(profitAnim, 100) / 100).toLocaleString()}</span></span>
              </div>
            </div>

            {/* ── Q Recommendation Card ── */}
            <div style={{ margin: '12px 16px', padding: '14px 18px', background: 'linear-gradient(135deg, rgba(212,145,10,0.04), rgba(212,145,10,0.08))', border: '1px solid rgba(212,145,10,0.15)', borderRadius: 10, opacity: profitAnim > 20 ? 1 : 0, transform: profitAnim > 20 ? 'translateY(0)' : 'translateY(-8px)', transition: 'all 0.6s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d4910a' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#d4910a' }}>Q RECOMMENDATION</span>
                    <span style={{ fontSize: 10, color: 'rgba(26,26,46,0.4)' }}>Top load detected</span>
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: '#1a1a2e', letterSpacing: 1 }}>ATLANTA → NASHVILLE</div>
                  <div style={{ fontSize: 11, color: 'rgba(26,26,46,0.5)', marginTop: 2 }}>Rate: $1,850 · 250 mi · 32,000 lbs</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: '#fff', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6, cursor: 'pointer' }}>
                    <Ic icon={Check} size={12} color="#22c55e" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>ACCEPT</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(34,197,94,0.6)', marginTop: 4 }}>98% confidence</div>
                </div>
              </div>
              {/* Profit metrics */}
              <div className="lp-rec-metrics">
                {[
                  { label: 'EST. PROFIT', value: `$${Math.round(732 * Math.min(profitAnim, 100) / 100)}`, color: '#22c55e' },
                  { label: 'PROFIT/MI', value: `$${(2.93 * Math.min(profitAnim, 100) / 100).toFixed(2)}`, color: '#1a1a2e' },
                  { label: 'BROKER', value: 'A', color: '#1a1a2e' },
                  { label: 'PROFIT/DAY', value: `$${Math.round(732 * Math.min(profitAnim, 100) / 100)}`, color: '#22c55e' },
                ].map((m, i) => (
                  <div key={i} style={{ background: '#1a1a2e', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: m.color === '#22c55e' ? '#22c55e' : '#fff', fontFamily: "'Bebas Neue',sans-serif" }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(34,197,94,0.5)', marginTop: 8, fontStyle: 'italic' }}>High profit per mile, 196% above market avg ($2.50/mi). Strong profit margin</div>
            </div>

            {/* ── Pipeline Columns ── */}
            {(() => {
              const cols = [
                { name: 'Booked', color: '#d4910a' },
                { name: 'Dispatched', color: '#3b82f6' },
                { name: 'In Transit', color: '#22c55e' },
                { name: 'Delivered', color: '#8b5cf6' },
                { name: 'Invoiced', color: '#ec4899' },
                { name: 'Paid', color: '#14b8a6' },
              ]
              // Static loads that stay in their columns
              const staticLoads = {
                0: { id: 'CH-9102', route: 'Memphis → Houston', rate: '$3,200', mi: '586 mi', broker: 'C.H. Robinson' },
                5: { id: 'DAT-4821', route: 'Chicago → Dallas', rate: '$4,800', mi: '920 mi', broker: 'Echo Global' },
              }
              // The moving load — TQL-7733 travels through each column
              const movingLoad = { id: 'TQL-7733', route: 'Atlanta → Nashville', rate: '$1,850', mi: '250 mi', broker: 'TQL' }
              return (
                <div className="lp-pipeline-cols" style={{ padding: '12px 16px 20px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {cols.map((col, ci) => {
                    const hasMovingCard = ci === pipelineStep
                    const staticLoad = staticLoads[ci]
                    const cardCount = (staticLoad ? 1 : 0) + (hasMovingCard ? 1 : 0)
                    const isActive = hasMovingCard
                    // On mobile: show Booked(0), In Transit(2), Paid(5) — hide others
                    const hideOnMobile = ci === 1 || ci === 3 || ci === 4
                    return (
                      <div key={ci} className={hideOnMobile ? 'lp-pipeline-hide-mobile' : ''} style={{ minWidth: 130 }}>
                        {/* Column header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottom: `2px solid ${isActive ? col.color : 'rgba(0,0,0,0.06)'}`, transition: 'border-color 0.4s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: col.color }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e' }}>{col.name}</span>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 600, color: col.color, background: `${col.color}15`, borderRadius: 4, padding: '1px 5px', transition: 'all 0.3s' }}>{cardCount}</span>
                        </div>

                        {/* Moving load card — appears in whichever column pipelineStep points to */}
                        {hasMovingCard && (
                          <div style={{ background: `${col.color}08`, border: `1.5px solid ${col.color}40`, borderRadius: 8, padding: '10px', marginBottom: staticLoad ? 8 : 0, transform: 'scale(1)', animation: 'lp-card-enter 0.5s ease-out', boxShadow: `0 3px 16px ${col.color}20` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: col.color }}>{movingLoad.id}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 4 }}>
                                <Ic icon={Check} size={8} color="#22c55e" />
                                <span style={{ fontSize: 8, fontWeight: 700, color: '#22c55e' }}>ACCEPT</span>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>{movingLoad.route}</div>
                            <div style={{ fontSize: 11, color: '#1a1a2e', marginBottom: 2 }}>
                              <span style={{ fontWeight: 700, color: col.color }}>{movingLoad.rate}</span>
                              <span style={{ color: 'rgba(26,26,46,0.35)', marginLeft: 4 }}>{movingLoad.mi}</span>
                            </div>
                            <div style={{ fontSize: 9, color: 'rgba(26,26,46,0.3)', marginTop: 4 }}>{movingLoad.broker}</div>
                          </div>
                        )}

                        {/* Static load card */}
                        {staticLoad && (
                          <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: col.color }}>{staticLoad.id}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 4 }}>
                                <Ic icon={Check} size={8} color="#22c55e" />
                                <span style={{ fontSize: 8, fontWeight: 700, color: '#22c55e' }}>ACCEPT</span>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>{staticLoad.route}</div>
                            <div style={{ fontSize: 11, color: '#1a1a2e', marginBottom: 2 }}>
                              <span style={{ fontWeight: 700, color: col.color }}>{staticLoad.rate}</span>
                              <span style={{ color: 'rgba(26,26,46,0.35)', marginLeft: 4 }}>{staticLoad.mi}</span>
                            </div>
                            <div style={{ fontSize: 9, color: 'rgba(26,26,46,0.3)', marginTop: 4 }}>{staticLoad.broker}</div>
                          </div>
                        )}

                        {/* Empty placeholder when no cards */}
                        {!hasMovingCard && !staticLoad && (
                          <div style={{ border: '1px dashed rgba(0,0,0,0.08)', borderRadius: 8, padding: '20px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, color: 'rgba(26,26,46,0.2)' }}>Drop loads here</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </FadeIn>
        <div className="lp-back-grid" style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {[
            { img: '/screenshots/compliance.png', alt: 'Safety & Compliance', title: 'Safety & Compliance', desc: 'AI compliance score, FMCSA, HOS, DVIR, CSA — always audit-ready' },
            { img: '/screenshots/expenses.png', alt: 'Expense Tracking', title: 'Expense Tracking', desc: 'Snap a receipt, Q categorizes it. Fuel, tolls, maintenance — done.' },
          ].map((item, idx) => (
            <FadeIn key={idx} delay={0.2 + idx * 0.1}>
              <div>
                <img src={item.img} alt={item.alt} className="lp-screenshot" />
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginTop: 12, textAlign: 'center' }}>{item.title}</p>
                <p style={{ fontSize: 12, color: 'rgba(26,26,46,0.45)', textAlign: 'center' }}>{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <div className="lp-back-grid" style={{ maxWidth: 1100, margin: '24px auto 0', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {/* ── Cinematic Invoice / Factoring ── */}
          <FadeIn delay={0.3}>
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
              {/* Invoice header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ic icon={FileText} size={14} color="#d4910a" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>Invoice #QIV-4821</span>
                </div>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, fontWeight: 700, background: invoicePhase === 0 ? 'rgba(212,145,10,0.1)' : invoicePhase === 1 ? 'rgba(59,130,246,0.1)' : invoicePhase === 2 ? 'rgba(236,72,153,0.1)' : 'rgba(34,197,94,0.1)', color: invoicePhase === 0 ? '#d4910a' : invoicePhase === 1 ? '#3b82f6' : invoicePhase === 2 ? '#ec4899' : '#22c55e', transition: 'all 0.4s' }}>
                  {invoicePhase === 0 ? 'Generating...' : invoicePhase === 1 ? 'Sent to Broker' : invoicePhase === 2 ? 'Factoring...' : 'Funded ✓'}
                </span>
              </div>

              {/* Invoice body */}
              <div style={{ padding: '16px 18px' }}>
                {/* Route + rate */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Chicago → Dallas</div>
                    <div style={{ fontSize: 10, color: 'rgba(26,26,46,0.4)', marginTop: 2 }}>DAT-4821 · Echo Global Logistics · 920 mi</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', fontFamily: "'Bebas Neue',sans-serif" }}>$4,800</div>
                  </div>
                </div>

                {/* Line items appearing */}
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    ['Line Haul', '$4,800.00'],
                    ['Fuel Surcharge', '$0.00'],
                    ['Detention (2h)', '$150.00'],
                  ].map(([label, val], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', opacity: invoicePhase >= 0 ? 1 : 0, transition: `opacity 0.4s ${i * 0.15}s` }}>
                      <span style={{ fontSize: 11, color: 'rgba(26,26,46,0.5)' }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e' }}>{val}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>Total</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>$4,950.00</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <div style={{ flex: 1, padding: '8px 0', borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: 700, background: invoicePhase >= 1 ? 'rgba(34,197,94,0.1)' : 'linear-gradient(135deg, #d4910a, #f0a500)', color: invoicePhase >= 1 ? '#22c55e' : '#000', border: invoicePhase >= 1 ? '1px solid rgba(34,197,94,0.2)' : 'none', transition: 'all 0.4s' }}>
                    {invoicePhase >= 1 ? '✓ Invoice Sent' : 'Send Invoice'}
                  </div>
                  <div style={{ flex: 1, padding: '8px 0', borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: 700, background: invoicePhase === 3 ? 'rgba(34,197,94,0.1)' : invoicePhase === 2 ? 'rgba(236,72,153,0.1)' : 'rgba(0,0,0,0.04)', color: invoicePhase === 3 ? '#22c55e' : invoicePhase === 2 ? '#ec4899' : 'rgba(26,26,46,0.35)', border: `1px solid ${invoicePhase === 3 ? 'rgba(34,197,94,0.2)' : invoicePhase === 2 ? 'rgba(236,72,153,0.2)' : 'rgba(0,0,0,0.06)'}`, transition: 'all 0.4s' }}>
                    {invoicePhase === 3 ? '✓ $4,752 Funded' : invoicePhase === 2 ? 'Factoring...' : 'Factor Now'}
                  </div>
                </div>

                {/* Factor breakdown — appears in phase 2-3 */}
                {invoicePhase >= 2 && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: invoicePhase === 3 ? 'rgba(34,197,94,0.04)' : 'rgba(236,72,153,0.04)', border: `1px solid ${invoicePhase === 3 ? 'rgba(34,197,94,0.1)' : 'rgba(236,72,153,0.1)'}`, borderRadius: 6, animation: 'lp-card-enter 0.4s ease-out', transition: 'all 0.4s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                      <span style={{ color: 'rgba(26,26,46,0.4)' }}>Invoice Amount</span>
                      <span style={{ color: '#1a1a2e', fontWeight: 600 }}>$4,950.00</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                      <span style={{ color: 'rgba(26,26,46,0.4)' }}>Factor Fee (4%)</span>
                      <span style={{ color: '#ec4899', fontWeight: 600 }}>-$198.00</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 4 }}>
                      <span style={{ fontWeight: 700, color: '#1a1a2e' }}>You Receive</span>
                      <span style={{ fontWeight: 700, color: invoicePhase === 3 ? '#22c55e' : '#1a1a2e', transition: 'color 0.4s' }}>$4,752.00</span>
                    </div>
                    {invoicePhase === 3 && (
                      <div style={{ fontSize: 9, color: 'rgba(34,197,94,0.5)', textAlign: 'center', marginTop: 6, fontStyle: 'italic', animation: 'lp-card-enter 0.4s ease-out' }}>Deposited to account ending ••4821 — same day</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginTop: 12, textAlign: 'center' }}>Invoice & Factoring</p>
            <p style={{ fontSize: 12, color: 'rgba(26,26,46,0.45)', textAlign: 'center' }}>Auto-invoice on delivery. One-tap factoring — get paid same day.</p>
          </FadeIn>

          {/* ── Cinematic EDI Hub ── */}
          <FadeIn delay={0.35}>
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
              {/* EDI header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ic icon={Zap} size={14} color="#d4910a" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>EDI Hub</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'lp-pulse 2s infinite' }} />
                  <span style={{ fontSize: 10, color: 'rgba(26,26,46,0.4)' }}>Connected</span>
                </div>
              </div>

              {/* EDI transaction log */}
              <div style={{ padding: '16px 18px' }}>
                {/* Active transaction */}
                <div style={{ marginBottom: 14 }}>
                  {[
                    { code: '204', label: 'Load Tender', detail: 'C.H. Robinson — Chicago → Memphis', sub: '$3,200 · 42,000 lbs · Dry Van', color: '#3b82f6', status: 'Incoming' },
                    { code: '990', label: 'Auto-Accept', detail: 'Tender accepted — dispatched to Driver #1', sub: 'Response time: 0.3 seconds', color: '#22c55e', status: 'Sent' },
                    { code: '214', label: 'Status Update', detail: 'Shipment picked up at origin', sub: 'ETA: 6h 22m · Next update at delivery', color: '#f59e0b', status: 'Transmitted' },
                    { code: '210', label: 'Freight Invoice', detail: 'Invoice QIV-3201 generated & transmitted', sub: '$3,200.00 — payment terms: Net 30', color: '#8b5cf6', status: 'Submitted' },
                  ].map((tx, i) => {
                    const isActive = i === ediPhase
                    const isPast = i < ediPhase
                    const isFuture = i > ediPhase
                    return (
                      <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < 3 ? '1px solid rgba(0,0,0,0.04)' : 'none', opacity: isFuture ? 0.3 : 1, transition: 'all 0.5s ease' }}>
                        {/* Transaction code badge */}
                        <div style={{ width: 42, height: 42, borderRadius: 8, background: isActive ? `${tx.color}12` : isPast ? 'rgba(34,197,94,0.06)' : 'rgba(0,0,0,0.03)', border: `1.5px solid ${isActive ? `${tx.color}30` : isPast ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.4s' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: isActive ? tx.color : isPast ? '#22c55e' : 'rgba(26,26,46,0.25)', fontFamily: 'monospace', transition: 'color 0.4s' }}>{tx.code}</span>
                        </div>
                        {/* Transaction details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#1a1a2e' : 'rgba(26,26,46,0.5)', transition: 'color 0.4s' }}>{tx.label}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: isPast ? 'rgba(34,197,94,0.08)' : isActive ? `${tx.color}10` : 'transparent', color: isPast ? '#22c55e' : isActive ? tx.color : 'rgba(26,26,46,0.2)', transition: 'all 0.4s' }}>
                              {isPast ? '✓ Complete' : isActive ? tx.status : 'Pending'}
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: isActive ? 'rgba(26,26,46,0.6)' : 'rgba(26,26,46,0.35)', transition: 'color 0.4s', marginBottom: 1 }}>{tx.detail}</div>
                          {(isActive || isPast) && (
                            <div style={{ fontSize: 9, color: 'rgba(26,26,46,0.3)', animation: isActive ? 'lp-card-enter 0.4s ease-out' : 'none' }}>{tx.sub}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Bottom status bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: ediPhase === 3 ? 'rgba(34,197,94,0.04)' : 'rgba(0,0,0,0.02)', border: `1px solid ${ediPhase === 3 ? 'rgba(34,197,94,0.1)' : 'rgba(0,0,0,0.04)'}`, borderRadius: 6, transition: 'all 0.4s' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: ediPhase === 3 ? '#22c55e' : 'rgba(26,26,46,0.3)', transition: 'color 0.4s' }}>
                    {ediPhase === 3 ? 'Full cycle complete — zero manual entry' : `Processing step ${ediPhase + 1} of 4...`}
                  </span>
                  <span style={{ fontSize: 9, color: 'rgba(26,26,46,0.25)', fontFamily: 'monospace' }}>EDI 2.0</span>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginTop: 12, textAlign: 'center' }}>EDI Hub</p>
            <p style={{ fontSize: 12, color: 'rgba(26,26,46,0.45)', textAlign: 'center' }}>204, 990, 214, 210 — tender to payment, fully automated</p>
          </FadeIn>
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          Q MOBILE — Voice, Loads, DVIR
      ═══════════════════════════════════════════════════════════ */}
      <section ref={mobileRef} style={{ padding: '72px 0', background: 'linear-gradient(180deg, #0a0a0e 0%, #12141e 50%, #0a0a0e 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', width: 700, height: 500, background: 'radial-gradient(ellipse, rgba(212,145,10,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', position: 'relative', zIndex: 1 }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 4, color: '#d4910a', textAlign: 'center', marginBottom: 12 }}>Q MOBILE</p>
            <h2 className="lp-section-title" style={{ fontFamily: "'Bebas Neue', sans-serif", textAlign: 'center', margin: '0 0 8px', color: '#fff' }}>Talk to Q. Hands Free.</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 56, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>"Hey Q, mark my load delivered and find me a reload from Memphis." Q handles it. Updates status. Sends invoice. Finds your next load. All by voice.</p>
          </FadeIn>

          {/* 4 cinematic phone mockups */}
          <div className="lp-phone-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, maxWidth: 960, margin: '0 auto', justifyItems: 'center' }}>

            {/* ── VOICE COMMANDS ── */}
            <FadeIn delay={0.1}>
              <div style={{ textAlign: 'center', maxWidth: 220 }}>
                <div className="lp-phone-frame" style={{ marginBottom: 16, background: '#0a0a0e', padding: '20px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #d4910a, #f0a500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, color: '#fff', fontWeight: 700 }}>Q</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#f0a500' }}>Q is listening...</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                      {[0, 0.2, 0.4].map((d, i) => <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#f0a500', animation: `lp-pulse 1.2s infinite ${d}s` }} />)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ background: 'rgba(212,145,10,0.12)', border: '1px solid rgba(212,145,10,0.18)', borderRadius: '10px 10px 10px 3px', padding: '8px 10px', fontSize: 10, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, textAlign: 'left' }}>Load marked delivered. Sending invoice to TQL for $3,400.</div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px 10px 3px 10px', padding: '8px 10px', fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, textAlign: 'left', alignSelf: 'flex-end' }}>Find me a reload heading west</div>
                    <div style={{ background: 'rgba(212,145,10,0.12)', border: '1px solid rgba(212,145,10,0.18)', borderRadius: '10px 10px 10px 3px', padding: '8px 10px', fontSize: 10, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, textAlign: 'left' }}>Best: Memphis → Dallas, $2.90/mi, 452 mi. Book it?</div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px 10px 3px 10px', padding: '8px 10px', fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'left', alignSelf: 'flex-end' }}>Book it</div>
                    <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px 10px 10px 3px', padding: '8px 10px', fontSize: 10, color: 'rgba(34,197,94,0.7)', lineHeight: 1.5, textAlign: 'left' }}>Booked! Rate con sent to driver. ETA: 6h 12m.</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Voice Commands</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>Deliver, invoice, reload — all by voice while you drive</div>
              </div>
            </FadeIn>

            {/* ── BOL SMART SCAN ── */}
            <FadeIn delay={0.2}>
              <div style={{ textAlign: 'center', maxWidth: 220 }}>
                <div className="lp-phone-frame" style={{ marginBottom: 16, background: '#0a0a0e', padding: '20px 14px', position: 'relative', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #d4910a, #f0a500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, color: '#fff', fontWeight: 700 }}>Q</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: scanPhase === 2 ? '#22c55e' : '#f0a500' }}>{scanPhase === 0 ? 'Scanning BOL...' : scanPhase === 1 ? 'Analyzing...' : 'BOL Verified ✓'}</span>
                  </div>

                  {/* Document mockup */}
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, position: 'relative', overflow: 'hidden', minHeight: 160 }}>
                    {/* Scan line */}
                    {scanPhase === 0 && (
                      <div style={{ position: 'absolute', left: 8, right: 8, height: 2, background: 'linear-gradient(90deg, transparent, #f0a500, transparent)', animation: 'lp-scanline 1.5s ease-in-out infinite', boxShadow: '0 0 12px rgba(240,165,0,0.4)' }} />
                    )}
                    {/* Document lines */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: scanPhase >= 1 ? 1 : 0.4, transition: 'opacity 0.5s' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>BILL OF LADING</div>
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                      {[
                        ['Shipper', 'ABC Manufacturing Co'],
                        ['Origin', 'Chicago, IL 60601'],
                        ['Dest', 'Dallas, TX 75201'],
                        ['Weight', '38,000 lbs'],
                        ['Ref #', 'BOL-88471'],
                        ['Commodity', 'Dry van freight'],
                      ].map(([k, v], i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', opacity: scanPhase >= 1 ? 1 : 0, transition: `opacity 0.4s ${i * 0.1}s` }}>
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{k}</span>
                          <span style={{ fontSize: 9, color: scanPhase === 2 ? 'rgba(34,197,94,0.7)' : 'rgba(255,255,255,0.5)', fontWeight: 600, transition: 'color 0.3s' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {/* Analyzing spinner */}
                    {scanPhase === 1 && (
                      <div style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 9, color: 'rgba(240,165,0,0.5)', animation: 'lp-scanpulse 1s infinite' }}>Extracting data...</div>
                    )}
                  </div>

                  {/* Result badge */}
                  <div style={{ marginTop: 10, padding: '6px 10px', background: scanPhase === 2 ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${scanPhase === 2 ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 6, transition: 'all 0.5s' }}>
                    <div style={{ fontSize: 9, color: scanPhase === 2 ? 'rgba(34,197,94,0.7)' : 'rgba(255,255,255,0.2)', fontWeight: 600, textAlign: 'center' }}>
                      {scanPhase === 2 ? '6 fields extracted — auto-matched to load' : 'Point camera at document'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Smart Document Scan</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>Q reads your BOL, extracts every field, matches it to the load</div>
              </div>
            </FadeIn>

            {/* ── DVIR TIRE INSPECTION ── */}
            <FadeIn delay={0.3}>
              <div style={{ textAlign: 'center', maxWidth: 220 }}>
                <div className="lp-phone-frame" style={{ marginBottom: 16, background: '#0a0a0e', padding: '20px 14px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #d4910a, #f0a500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, color: '#fff', fontWeight: 700 }}>Q</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: dvirPhase === 2 ? '#22c55e' : '#f0a500' }}>{dvirPhase === 0 ? 'DVIR — Take Photo' : dvirPhase === 1 ? 'Analyzing tire...' : 'Inspection Pass ✓'}</span>
                  </div>

                  {/* Camera viewfinder */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, position: 'relative', minHeight: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* Viewfinder corners */}
                    {dvirPhase < 2 && <>
                      <div style={{ position: 'absolute', top: 8, left: 8, width: 16, height: 16, borderTop: '2px solid', borderLeft: '2px solid', borderColor: 'rgba(212,145,10,0.4)', borderRadius: '3px 0 0 0', animation: 'lp-viewfinder 1.5s infinite' }} />
                      <div style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderTop: '2px solid', borderRight: '2px solid', borderColor: 'rgba(212,145,10,0.4)', borderRadius: '0 3px 0 0', animation: 'lp-viewfinder 1.5s infinite 0.2s' }} />
                      <div style={{ position: 'absolute', bottom: 8, left: 8, width: 16, height: 16, borderBottom: '2px solid', borderLeft: '2px solid', borderColor: 'rgba(212,145,10,0.4)', borderRadius: '0 0 0 3px', animation: 'lp-viewfinder 1.5s infinite 0.4s' }} />
                      <div style={{ position: 'absolute', bottom: 8, right: 8, width: 16, height: 16, borderBottom: '2px solid', borderRight: '2px solid', borderColor: 'rgba(212,145,10,0.4)', borderRadius: '0 0 3px 0', animation: 'lp-viewfinder 1.5s infinite 0.6s' }} />
                    </>}

                    {/* Tire icon / result */}
                    <div style={{ textAlign: 'center' }}>
                      {dvirPhase === 0 && <div style={{ fontSize: 36, marginBottom: 4 }}>🛞</div>}
                      {dvirPhase === 1 && (
                        <div>
                          <div style={{ fontSize: 36, marginBottom: 4, animation: 'lp-scanpulse 0.8s infinite' }}>🛞</div>
                          <div style={{ fontSize: 9, color: 'rgba(240,165,0,0.5)', animation: 'lp-scanpulse 1s infinite' }}>AI analyzing tread depth...</div>
                        </div>
                      )}
                      {dvirPhase === 2 && (
                        <div style={{ fontSize: 9, color: 'rgba(34,197,94,0.7)', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                          <div style={{ fontSize: 28 }}>✅</div>
                          <span style={{ fontWeight: 700 }}>No Defects Found</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checklist items */}
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {['Tread Depth', 'Sidewall Condition', 'Air Pressure', 'Valve Stem'].map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{item}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: dvirPhase === 2 ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.15)', transition: `color 0.4s ${i * 0.1}s` }}>{dvirPhase === 2 ? 'PASS' : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>AI Tire Inspection</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>Snap a photo — Q checks tread, sidewall, pressure, defects</div>
              </div>
            </FadeIn>

            {/* ── IFTA AUTO-CALC ── */}
            <FadeIn delay={0.4}>
              <div style={{ textAlign: 'center', maxWidth: 220 }}>
                <div className="lp-phone-frame" style={{ marginBottom: 16, background: '#0a0a0e', padding: '20px 14px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #d4910a, #f0a500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, color: '#fff', fontWeight: 700 }}>Q</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#f0a500' }}>IFTA — Q2 Report</span>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>Total Miles</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#f0a500', fontFamily: 'monospace' }}>{Math.round(1756 * Math.min(iftaBars, 100) / 100).toLocaleString()}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>Net Tax</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>${Math.round(47 * Math.min(iftaBars, 100) / 100)}</div>
                    </div>
                  </div>

                  {/* State breakdown label */}
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: '#d4910a', marginBottom: 8 }}>STATE BREAKDOWN</div>

                  {/* Animated bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { state: 'TX', miles: 426, pct: 100 },
                      { state: 'TN', miles: 358, pct: 84 },
                      { state: 'IL', miles: 312, pct: 73 },
                      { state: 'MO', miles: 268, pct: 63 },
                      { state: 'OK', miles: 224, pct: 53 },
                      { state: 'AR', miles: 168, pct: 39 },
                    ].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 700, width: 18, textAlign: 'right' }}>{s.state}</span>
                        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: i === 0 ? 'linear-gradient(90deg, #d4910a, #f0a500)' : 'rgba(212,145,10,0.4)', width: `${Math.min(s.pct * iftaBars / 100, s.pct)}%`, transition: 'width 0.15s linear' }} />
                        </div>
                        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', width: 32, textAlign: 'right' }}>{Math.round(s.miles * Math.min(iftaBars, 100) / 100)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Bottom status */}
                  <div style={{ marginTop: 10, padding: '6px 8px', background: iftaBars >= 100 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${iftaBars >= 100 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 6, textAlign: 'center', transition: 'all 0.3s' }}>
                    <span style={{ fontSize: 8, fontWeight: 600, color: iftaBars >= 100 ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.2)', transition: 'color 0.3s' }}>
                      {iftaBars >= 100 ? 'Ready to file — tap to submit' : 'Calculating miles by state...'}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Auto IFTA</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>Miles counted, tax calculated, ready to file — Q does it all</div>
              </div>
            </FadeIn>

          </div>
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          TESTIMONIALS
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding: '64px 20px', borderTop: '1px solid rgba(0,0,0,0.04)', background: '#fff' }}>
        <FadeIn>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: '#d4910a', textAlign: 'center', marginBottom: 12 }}>TESTIMONIALS</p>
          <h2 className="lp-section-title" style={{ fontFamily: "'Bebas Neue', sans-serif", textAlign: 'center', margin: '0 0 40px', color: '#1a1a2e' }}>What Carriers Are Saying</h2>
        </FadeIn>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { quote: "Q found me a $4,200 load on a lane I didn't even know was profitable. Booked it before I finished my coffee. That's $800 more than what I would've taken off the board myself.", name: 'Marcus Johnson', role: 'Owner-Operator', detail: '3 trucks · Atlanta, GA · Using Qivori since Jan 2026' },
            { quote: "I used to spend 4 hours a day on the phone with brokers. Now Q handles all of that. I just drive. Last month I ran 23 loads — all booked by Q. My revenue went up 30%.", name: 'David Rodriguez', role: 'Owner-Operator', detail: '1 truck · Dallas, TX · Solo driver' },
            { quote: "The rate analysis alone pays for itself. I haven't accepted a below-market load since I started using Qivori. Q caught a $1,200 difference on a Houston to Miami lane that I almost took at face value.", name: 'Sarah Thompson', role: 'Fleet Manager', detail: '8 trucks · Chicago, IL · Mid-size carrier' },
          ].map((t, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="lp-testimonial-card">
                <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                  {[1,2,3,4,5].map(s => <span key={s} style={{ color: '#d4910a', fontSize: 16 }}>★</span>)}
                </div>
                <p style={{ fontSize: 14, color: 'rgba(26,26,46,0.65)', lineHeight: 1.7, flex: 1, marginBottom: 20 }}>"{t.quote}"</p>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: 'rgba(26,26,46,0.5)', fontWeight: 500 }}>{t.role}</div>
                  <div style={{ fontSize: 11, color: 'rgba(26,26,46,0.3)', marginTop: 4 }}>{t.detail}</div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          FAQ
      ═══════════════════════════════════════════════════════════ */}
      <section id="faq" style={{ padding: '64px 20px', borderTop: '1px solid rgba(0,0,0,0.04)', background: '#fff' }}>
        <FadeIn>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: '#d4910a', textAlign: 'center', marginBottom: 12 }}>FAQ</p>
          <h2 className="lp-section-title" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, textAlign: 'center', margin: '0 0 36px', color: '#1a1a2e' }}>Frequently Asked Questions</h2>
        </FadeIn>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {faqs.map((faq, i) => (
            <div key={i} className="lp-faq-item">
              <button className="lp-faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                <span>{faq.q}</span>
                <Ic icon={ChevronDown} size={18} color="rgba(26,26,46,0.3)" style={{ transition: 'transform 0.3s', transform: faqOpen === i ? 'rotate(180deg)' : 'rotate(0)' }} />
              </button>
              <div className="lp-faq-a" style={{ maxHeight: faqOpen === i ? 500 : 0, opacity: faqOpen === i ? 1 : 0, paddingBottom: faqOpen === i ? 20 : 0 }}>
                {faq.a}
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* ═══════════════════════════════════════════════════════════
          FINAL CTA
      ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding: '80px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg, #08090c 0%, #0f1118 50%, #08090c 100%)' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(212,145,10,0.1) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <FadeIn>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 className="lp-section-title" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, lineHeight: 1.05, margin: '0 0 16px', color: '#fff' }}>
              Focus on Driving.<br />Q Handles Everything Else.
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', marginBottom: 40, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Loads, brokers, invoices, compliance, IFTA, expenses — your entire back office runs on autopilot. Start your 14-day free trial today.
            </p>
            <div style={{ display: 'flex', gap: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={goToLogin} className="lp-cta-primary" style={{ padding: '18px 40px', fontSize: 17 }}>
                Get Started Free <Ic icon={ArrowRight} size={18} />
              </button>
              <button onClick={() => setDemoModal(true)} className="lp-cta-secondary" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.12)', padding: '18px 36px', fontSize: 17 }}>
                <Ic icon={Play} size={14} /> Book a Demo
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 20 }}>No credit card required &middot; Cancel anytime</p>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '32px 24px', paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#08090c' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, marginBottom: 4 }}>
              <span style={{ color: '#fff' }}>QIVORI</span><span style={{ color: '#f0a500' }}> AI</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>&copy; {new Date().getFullYear()} Qivori AI. All rights reserved.</div>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <a href="/privacy" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>Privacy</a>
            <a href="/terms" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>Terms</a>
            <a href="mailto:hello@qivori.com" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>hello@qivori.com</a>
          </div>
        </div>
      </footer>


      {/* ═══════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════ */}

      {demoModal && (
        <div onClick={() => { setDemoModal(false); setDemoError('') }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 20, padding: 32, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
            <button onClick={() => { setDemoModal(false); setDemoError('') }} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'rgba(26,26,46,0.4)', cursor: 'pointer' }}>
              <Ic icon={X} size={20} />
            </button>

            <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1, margin: '0 0 4px', color: '#1a1a2e' }}>Book a Demo</h3>
            <p style={{ fontSize: 13, color: 'rgba(26,26,46,0.5)', marginBottom: 24 }}>See Q dispatch live for your lanes. Takes 15 minutes.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" value={demoForm._hp} onChange={e => setDemoForm(f => ({ ...f, _hp: e.target.value }))} style={{ position: 'absolute', left: -9999, opacity: 0, height: 0 }} tabIndex={-1} autoComplete="off" />

              {[
                { key: 'name', label: 'Your Name', ph: 'John Smith', req: true },
                { key: 'email', label: 'Email', ph: 'john@carrier.com', type: 'email', req: true },
                { key: 'phone', label: 'Phone', ph: '(555) 123-4567', type: 'tel', req: true },
                { key: 'company', label: 'Company / MC#', ph: 'Smith Trucking / MC-123456', req: true },
                { key: 'truckCount', label: 'How many trucks?', ph: '1-5' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(26,26,46,0.5)', marginBottom: 4, display: 'block' }}>{f.label}{f.req && ' *'}</label>
                  <input type={f.type || 'text'} placeholder={f.ph} value={demoForm[f.key]} onChange={e => setDemoForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={{ width: '100%', padding: '10px 14px', fontSize: 14, background: '#f9f9fb', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(26,26,46,0.5)', marginBottom: 4, display: 'block' }}>Biggest pain point?</label>
                <textarea placeholder="Finding good loads, broker calls, paperwork..." value={demoForm.painPoints} onChange={e => setDemoForm(prev => ({ ...prev, painPoints: e.target.value }))} rows={3} style={{ width: '100%', padding: '10px 14px', fontSize: 14, background: '#f9f9fb', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, color: '#1a1a2e', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {demoError && <div style={{ fontSize: 12, color: '#ef4444' }}>{demoError}</div>}

              <button onClick={handleDemoSubmit} disabled={demoLoading} className="lp-cta-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8, opacity: demoLoading ? 0.6 : 1 }}>
                {demoLoading ? 'Scheduling...' : 'Schedule My Demo'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
