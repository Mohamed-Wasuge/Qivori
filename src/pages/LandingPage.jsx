import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Bot, Map, TrendingUp, Fuel, BarChart2, FlaskConical, Landmark, CreditCard, ClipboardList, MapPin, Truck, FileText, Zap, CheckCircle, Frown, Satellite, DollarSign, Check, Mic, Send, Camera, Navigation, Volume2, ScanLine } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const PAIN_SOLUTIONS = [
  { pain: 'Searching DAT for hours finding bad loads', fix: 'AI scores every load 0–100 — best loads surface instantly' },
  { pain: 'Switching between 6 different tools all day', fix: 'Everything in one platform — dispatch, fleet, accounting, compliance' },
  { pain: 'IFTA filing taking a full weekend every quarter', fix: 'Auto-calculated from your mileage — file in minutes' },
  { pain: 'Chasing brokers for payment for weeks', fix: 'Broker risk scores + one-click factoring for same-day cash' },
  { pain: 'Losing money on bad lanes without knowing it', fix: 'Lane Intelligence shows exactly which lanes make money' },
  { pain: 'Fuel costs eating your margin mile by mile', fix: 'Fuel optimizer routes you to cheapest stops on your path' },
  { pain: 'Paperwork until midnight — DVIR, logs, invoices', fix: 'Auto-generated from your loads — review and send in seconds' },
  { pain: 'No idea what your real profit is until tax time', fix: 'Live P&L dashboard — know your margin on every load' },
]

const FEATURES = [
  { icon: Bot, label: 'AI Load Board',       desc: 'DAT-connected · AI scores every load' },
  { icon: Map, label: 'Live Fleet Map',      desc: 'Real-time truck positions & ETAs' },
  { icon: TrendingUp, label: 'P&L Dashboard',       desc: 'Live profit & loss by load, lane, driver' },
  { icon: Fuel, label: 'Fuel Optimizer',      desc: 'Cut fuel spend $80–$140 per load' },
  { icon: BarChart2, label: 'IFTA Filing',         desc: 'Auto-calculated quarterly returns' },
  { icon: FlaskConical, label: 'Pre-Employment',      desc: 'Full FMCSA screening in one click' },
  { icon: Landmark, label: 'Broker Risk Intel',   desc: 'Know who pays before you book' },
  { icon: CreditCard, label: 'Factoring',           desc: 'Same-day cash at 2.5% flat' },
  { icon: ClipboardList, label: 'DVIR / ELD / HOS',   desc: 'Full compliance in one place' },
  { icon: MapPin, label: 'Check Calls',         desc: 'AI-assisted shipper check-in log' },
  { icon: Truck, label: 'Equipment Manager',   desc: 'Trucks, trailers, VINs, expiry alerts' },
  { icon: FileText, label: 'Carrier Package',     desc: 'One-click broker contracting packet' },
]

const PLANS = [
  {
    name: 'Solo',
    sub: '1 truck · Owner-operator',
    price: '$49',
    color: 'var(--accent2)',
    features: ['AI Load Board + DAT', 'Fleet Map', 'P&L Dashboard', 'IFTA Filing', 'Invoicing & Factoring', 'Carrier Package', 'Fuel Optimizer'],
    cta: 'Start Free Trial',
    highlight: false,
  },
  {
    name: 'Small Fleet',
    sub: '2–5 trucks',
    price: '$99',
    color: 'var(--accent)',
    features: ['Everything in Solo', 'Multi-driver dispatch', 'Pre-Employment Screening', 'Driver Scorecards', 'Broker Risk Intel', 'Check Call Center', 'Equipment Manager'],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Growing Fleet',
    sub: '6–15 trucks',
    price: '$199',
    color: 'var(--accent3)',
    features: ['Everything in Small Fleet', 'Unlimited drivers', 'QuickBooks integration', 'DAT API live feed', 'Cash Flow Forecasting', 'Priority support', 'Custom reporting'],
    cta: 'Talk to Us',
    highlight: false,
  },
]

const STATS = [
  { value: '$340', label: 'Avg extra profit per load with AI scoring' },
  { value: '10hrs', label: 'Saved per week on paperwork and admin' },
  { value: '2.5%', label: 'Flat factoring rate — no hidden fees' },
  { value: '94%', label: 'AI load match accuracy on your lanes' },
]

const DAT_ITEMS = [
  { icon: Satellite, text: 'Live DAT load feed on your lanes' },
  { icon: Bot, text: 'AI score 0–100 on every load' },
  { icon: Landmark, text: 'Broker pay history & risk rating' },
  { icon: DollarSign, text: 'Rate vs market benchmark — instant' },
  { icon: Zap, text: 'One-click book → auto-adds to TMS' },
]

export default function LandingPage({ onGetStarted }) {
  const { goToLogin } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleTry = () => {
    goToLogin()
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", overflowY: 'auto', height: '100vh' }}>

      {/* ── RESPONSIVE STYLES ─────────────────────────────────────────── */}
      <style>{`
        .lp-nav-links { display: flex; align-items: center; gap: 32px; }
        .lp-nav-link { display: inline; }
        .lp-mob-toggle { display: none !important; }
        .lp-mob-menu { display: none; }
        @media (max-width: 780px) {
          .lp-nav { padding: 0 16px !important; }
          .lp-nav-links { display: none !important; }
          .lp-mob-toggle { display: flex !important; }
          .lp-mob-menu {
            display: flex; flex-direction: column; gap: 8px;
            position: absolute; top: 60px; left: 0; right: 0;
            background: rgba(7,9,14,0.98); border-bottom: 1px solid var(--border);
            padding: 16px; z-index: 99; backdrop-filter: blur(12px);
          }
          .lp-mob-menu a { font-size: 14px; color: var(--muted); text-decoration: none; padding: 10px 0; }
          .lp-mob-menu .lp-mob-btns { display: flex; gap: 8px; margin-top: 8px; }
          .lp-mob-menu .lp-mob-btns button { flex: 1; }
          .lp-hero { padding: 50px 16px 50px !important; }
          .lp-hero h1 { font-size: 40px !important; }
          .lp-hero p { font-size: 15px !important; }
          .lp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-section { padding: 50px 16px !important; }
          .lp-pain-row { grid-template-columns: 1fr !important; gap: 8px !important; }
          .lp-pain-arrow { display: none !important; }
          .lp-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-dat-grid { grid-template-columns: 1fr !important; padding: 28px 20px !important; }
          .lp-dat-heading { font-size: 30px !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
          .lp-ai-grid { grid-template-columns: 1fr !important; }
          .lp-section-heading { font-size: 32px !important; }
          .lp-cta-heading { font-size: 36px !important; }
          .lp-footer { flex-direction: column !important; gap: 16px !important; text-align: center !important; padding: 24px 16px !important; }
        }
        @media (max-width: 480px) {
          .lp-hero h1 { font-size: 32px !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-stats-grid { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
        }
      `}</style>

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <nav className="lp-nav" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(7,9,14,0.92)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)', padding: '0 40px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3 }}>
          QI<span style={{ color: 'var(--accent)' }}>VORI</span>
          <span style={{ fontSize: 11, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, marginLeft: 6 }}>AI</span>
        </div>

        {/* Mobile hamburger */}
        <button className="lp-mob-toggle" onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>
          {menuOpen ? '✕' : '☰'}
        </button>

        {/* Desktop nav */}
        <div className="lp-nav-links">
          {['Features', 'Pricing', 'DAT Integration'].map(item => (
            <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="lp-nav-link"
              style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.15s' }}
              onMouseOver={e => e.target.style.color = 'var(--text)'}
              onMouseOut={e => e.target.style.color = 'var(--muted)'}>
              {item}
            </a>
          ))}
          <button onClick={onGetStarted}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 16px', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
            Sign In
          </button>
          <button onClick={handleTry}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#000', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>
            Try Free →
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="lp-mob-menu">
            {['Features', 'Pricing', 'DAT Integration'].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} onClick={() => setMenuOpen(false)}>{item}</a>
            ))}
            <div className="lp-mob-btns">
              <button onClick={onGetStarted} className="btn btn-ghost" style={{ fontSize: 13 }}>Sign In</button>
              <button onClick={handleTry} className="btn btn-primary" style={{ fontSize: 13 }}>Try Free →</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="lp-hero" style={{ padding: '90px 40px 80px', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 20, padding: '5px 14px', marginBottom: 28 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>DAT-Connected · AI-Powered · Built for Truckers</span>
        </div>

        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, letterSpacing: 3, lineHeight: 1, marginBottom: 24, color: 'var(--text)' }}>
          STOP RUNNING YOUR<br />
          <span style={{ color: 'var(--accent)' }}>TRUCKING BUSINESS</span><br />
          ON SPREADSHEETS
        </h1>

        <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 640, margin: '0 auto 40px' }}>
          Qivori is the all-in-one AI platform built for owner-operators and small fleets.
          Find better loads, run your fleet, file compliance, and get paid — all in one place.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleTry}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '14px 36px', color: '#000', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 0 30px rgba(240,165,0,0.25)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Ic icon={Zap} size={16} /> Try the Platform Free
          </button>
          <button onClick={onGetStarted}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 36px', color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Sign In →
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>No credit card required · 14-day free trial · Cancel anytime</div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '40px 40px' }}>
        <div className="lp-stats-grid" style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: 'var(--accent)', lineHeight: 1, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PAIN vs SOLUTION ──────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '80px 40px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>THE PROBLEM</div>
          <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2, marginBottom: 14 }}>
            OWNER-OPERATORS ARE DROWNING IN TOOLS
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 560, margin: '0 auto' }}>
            DAT for loads. A different TMS. QuickBooks. ELD app. Spreadsheet for IFTA. Another app for invoices. Qivori replaces all of it.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PAIN_SOLUTIONS.map((item, i) => (
            <div key={i} className="lp-pain-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, flexShrink: 0, display: 'flex', alignItems: 'center' }}><Ic icon={Frown} size={18} /></span>
                <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{item.pain}</span>
              </div>
              <div className="lp-pain-arrow" style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>→</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, flexShrink: 0, display: 'flex', alignItems: 'center' }}><Ic icon={CheckCircle} size={18} color="var(--success)" /></span>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>{item.fix}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <section id="features" className="lp-section" style={{ padding: '80px 40px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>FEATURES</div>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2, marginBottom: 14 }}>EVERYTHING A CARRIER NEEDS</h2>
            <p style={{ fontSize: 15, color: 'var(--muted)' }}>12 modules. One platform. Zero spreadsheets.</p>
          </div>
          <div className="lp-features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {FEATURES.map(f => (
              <div key={f.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 16px', transition: 'all 0.15s', cursor: 'default' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(240,165,0,0.4)'; e.currentTarget.style.background = 'rgba(240,165,0,0.04)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)' }}>
                <div style={{ marginBottom: 10 }}><Ic icon={f.icon} size={26} /></div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI MOBILE EXPERIENCE ─────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '80px 40px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>AI-FIRST MOBILE</div>
          <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2, marginBottom: 14 }}>
            YOUR AI COPILOT ON THE ROAD
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 560, margin: '0 auto' }}>
            No menus. No forms. Just talk to your AI and it handles everything — hands-free while you drive.
          </p>
        </div>

        <div className="lp-ai-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
          {/* Left — Phone mockup */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 280, background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 32, padding: '12px 0', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
              {/* Phone header */}
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

              {/* Chat messages */}
              <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 260 }}>
                <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#000', padding: '8px 12px', borderRadius: '12px 12px 4px 12px', fontSize: 11, fontWeight: 600, maxWidth: '80%' }}>
                  Just delivered, send the invoice
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Ic icon={Zap} size={8} color="var(--accent)" />
                  </div>
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: '12px 12px 12px 4px', fontSize: 10, lineHeight: 1.5, color: 'var(--text)', maxWidth: '85%' }}>
                    Load delivered! Invoice INV-4821 emailed to Echo Global at billing@echo.com for $2,056.
                  </div>
                </div>

                {/* Action badges */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 22 }}>
                  {[
                    { icon: Truck, text: 'Delivered' },
                    { icon: Send, text: 'Invoice Sent' },
                  ].map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 6, fontSize: 8, fontWeight: 600, color: 'var(--success)' }}>
                      <Ic icon={b.icon} size={8} /><Ic icon={CheckCircle} size={7} />{b.text}
                    </div>
                  ))}
                </div>

                <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#000', padding: '8px 12px', borderRadius: '12px 12px 4px 12px', fontSize: 11, fontWeight: 600 }}>
                  Find me a load back to Chicago
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Ic icon={Zap} size={8} color="var(--accent)" />
                  </div>
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: '12px 12px 12px 4px', fontSize: 10, lineHeight: 1.5, color: 'var(--text)', maxWidth: '85%' }}>
                    Found 3 loads back to Chicago. Top pick: ATL→CHI, $3.20/mi, $2,157, Score 96/100. Want me to book it?
                  </div>
                </div>
              </div>

              {/* Phone input bar */}
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic icon={Camera} size={10} color="var(--muted)" />
                </div>
                <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 8, padding: '6px 10px', fontSize: 9, color: 'var(--muted)' }}>Tell me what you need...</div>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic icon={Mic} size={10} color="var(--muted)" />
                </div>
              </div>
            </div>
          </div>

          {/* Right — Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: Mic, title: 'Voice-First', desc: 'Tap and talk — AI processes your commands hands-free while you drive. No typing required.' },
              { icon: Volume2, title: 'AI Reads Back', desc: 'Responses are read aloud so you never take your eyes off the road.' },
              { icon: ScanLine, title: 'Snap Rate Con', desc: 'Take a photo of any rate confirmation — AI reads it and books the load instantly.' },
              { icon: Send, title: 'Auto-Invoice', desc: 'When you deliver, AI emails a professional invoice to the broker in one tap.' },
              { icon: Navigation, title: 'Find Truck Stops', desc: '"Find me a truck stop" — maps open automatically with nearest options.' },
              { icon: Camera, title: 'Smart Documents', desc: 'AI prompts you to upload BOL, signed BOL, and POD at exactly the right time.' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic icon={f.icon} size={16} color="var(--accent)" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DAT INTEGRATION ───────────────────────────────────────────── */}
      <section id="dat-integration" className="lp-section" style={{ padding: '80px 40px', maxWidth: 900, margin: '0 auto' }}>
        <div className="lp-dat-grid" style={{ background: 'linear-gradient(135deg,rgba(240,165,0,0.07),rgba(77,142,240,0.05))', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 20, padding: '48px 48px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 12 }}>DAT INTEGRATION</div>
            <h2 className="lp-dat-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, letterSpacing: 2, lineHeight: 1.1, marginBottom: 16 }}>
              EVERY DAT LOAD<br />SCORED BY AI
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>
              Qivori connects directly to DAT and scores every load on your lanes — rate vs market, broker risk, deadhead, backhaul availability — all in a single number. Stop guessing. Start booking with confidence.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DAT_ITEMS.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <Ic icon={item.icon} size={16} /> <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={ClipboardList} size={14} /> AI LOAD BOARD · LIVE</div>
            {[
              { route: 'ATL → CHI', broker: 'Echo Global',  rate: '$3.20/mi', gross: '$2,157', score: 96, scoreC: 'var(--success)' },
              { route: 'DAL → MIA', broker: 'Coyote',       rate: '$3.22/mi', gross: '$4,802', score: 91, scoreC: 'var(--success)' },
              { route: 'MEM → NYC', broker: 'CH Robinson',  rate: '$3.10/mi', gross: '$3,410', score: 84, scoreC: 'var(--accent)'  },
              { route: 'DEN → HOU', broker: 'Transplace',   rate: '$2.61/mi', gross: '$2,662', score: 61, scoreC: 'var(--warning)' },
            ].map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${l.scoreC}18`, border: `1px solid ${l.scoreC}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: l.scoreC, flexShrink: 0 }}>
                  {l.score}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{l.route}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l.broker}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{l.gross}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.rate}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-section" style={{ padding: '80px 40px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2, marginBottom: 10 }}>PRICING</div>
            <h2 className="lp-section-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, letterSpacing: 2, marginBottom: 14 }}>SIMPLE. FLAT. NO SURPRISES.</h2>
            <p style={{ fontSize: 15, color: 'var(--muted)' }}>One load booked better pays for the whole month.</p>
          </div>

          <div className="lp-pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {PLANS.map(plan => (
              <div key={plan.name} style={{ background: plan.highlight ? 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(240,165,0,0.03))' : 'var(--surface2)',
                border: `1px solid ${plan.highlight ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`, borderRadius: 16, padding: '28px 24px',
                position: 'relative', transition: 'all 0.2s' }}>
                {plan.highlight && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--accent)', color: '#000', fontSize: 10, fontWeight: 800, padding: '3px 14px', borderRadius: 10, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 800, color: plan.color, letterSpacing: 1.5, marginBottom: 6 }}>{plan.name.toUpperCase()}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>{plan.sub}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20 }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 52, color: plan.color, lineHeight: 1 }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>/month</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 24 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                      <span style={{ color: plan.color, flexShrink: 0, marginTop: 1, display: 'flex' }}><Ic icon={Check} size={14} /></span>
                      <span style={{ color: 'var(--text)', lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button onClick={handleTry}
                  style={{ width: '100%', padding: '12px 0', fontSize: 13, fontWeight: 700, borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    background: plan.highlight ? 'var(--accent)' : 'var(--surface)', color: plan.highlight ? '#000' : 'var(--text)',
                    border: plan.highlight ? 'none' : '1px solid var(--border)' }}>
                  {plan.cta} →
                </button>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>
            All plans include 14-day free trial · No credit card required · Cancel anytime
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: '90px 40px', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h2 className="lp-cta-heading" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 2, lineHeight: 1.1, marginBottom: 20 }}>
            READY TO STOP LEAVING<br />
            <span style={{ color: 'var(--accent)' }}>MONEY ON THE TABLE?</span>
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 36 }}>
            Join owner-operators and small fleets using Qivori to find better loads, run leaner, and get paid faster.
          </p>
          <button onClick={handleTry}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 12, padding: '16px 48px', color: '#000', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", boxShadow: '0 0 40px rgba(240,165,0,0.3)', marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Ic icon={Zap} size={18} /> Start Free Trial — No Card Needed
          </button>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>14 days free · Then from $49/month · Cancel anytime</div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="lp-footer" style={{ borderTop: '1px solid var(--border)', padding: '28px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 3 }}>
          QI<span style={{ color: 'var(--accent)' }}>VORI</span>
          <span style={{ fontSize: 10, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, marginLeft: 6 }}>AI</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>© 2026 Qivori AI · Built for carriers and brokers, by people who understand trucking.</div>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Privacy', 'Terms', 'Contact'].map(l => (
            <a key={l} href="#" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}
              onMouseOver={e => e.target.style.color = 'var(--text)'}
              onMouseOut={e => e.target.style.color = 'var(--muted)'}>{l}</a>
          ))}
        </div>
      </footer>

    </div>
  )
}
