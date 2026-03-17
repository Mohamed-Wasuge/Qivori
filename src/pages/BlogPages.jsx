import { useState, useEffect, useRef } from 'react'

// ─── Shared Styles ───────────────────────────────────────────────
const colors = {
  bg: '#0c0f15',
  surface: '#131720',
  surface2: '#1a1f2e',
  border: '#1e2330',
  text: '#c8d0dc',
  textMuted: '#6b7590',
  accent: '#f0a500',
  accent2: '#00d4ff',
  white: '#ffffff',
}

const fonts = {
  heading: "'Bebas Neue', sans-serif",
  body: "'DM Sans', sans-serif",
}

// ─── SEO Meta Helper ─────────────────────────────────────────────
function useMeta(title, description) {
  useEffect(() => {
    const prev = document.title
    document.title = title + ' | Qivori AI'
    let meta = document.querySelector('meta[name="description"]')
    const prevDesc = meta?.getAttribute('content')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)

    // OG tags
    const setOg = (prop, val) => {
      let el = document.querySelector(`meta[property="${prop}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el) }
      el.setAttribute('content', val)
    }
    setOg('og:title', title)
    setOg('og:description', description)
    setOg('og:type', 'article')
    setOg('og:site_name', 'Qivori AI')

    return () => {
      document.title = prev
      if (prevDesc) meta.setAttribute('content', prevDesc)
    }
  }, [title, description])
}

// ─── Table of Contents ───────────────────────────────────────────
function TableOfContents({ items }) {
  const [active, setActive] = useState('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    )
    items.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [items])

  return (
    <nav style={{
      position: 'sticky', top: 100, alignSelf: 'start',
      background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: 12, padding: '20px 24px', minWidth: 220, maxWidth: 260,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: colors.accent, marginBottom: 14, fontFamily: fonts.body }}>
        Contents
      </div>
      {items.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
          style={{
            display: 'block', fontSize: 13, color: active === id ? colors.accent : colors.textMuted,
            textDecoration: 'none', padding: '5px 0', fontFamily: fonts.body, fontWeight: active === id ? 600 : 400,
            borderLeft: `2px solid ${active === id ? colors.accent : 'transparent'}`,
            paddingLeft: 12, marginLeft: -12, transition: 'all 0.2s',
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  )
}

// ─── Share Buttons ───────────────────────────────────────────────
function ShareButtons({ title }) {
  const url = window.location.href
  const encoded = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
    borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.surface2,
    color: colors.text, fontSize: 13, fontFamily: fonts.body, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none', transition: 'all 0.2s',
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
      <a href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encoded}`} target="_blank" rel="noopener noreferrer" style={btnStyle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Share on X
      </a>
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`} target="_blank" rel="noopener noreferrer" style={btnStyle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        Share on LinkedIn
      </a>
    </div>
  )
}

// ─── CTA Banner ──────────────────────────────────────────────────
function CTABanner() {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${colors.surface2}, ${colors.surface})`,
      border: `1px solid ${colors.accent}33`, borderRadius: 16, padding: '40px 32px',
      textAlign: 'center', marginTop: 48,
    }}>
      <div style={{ fontFamily: fonts.heading, fontSize: 28, letterSpacing: 3, color: colors.white, marginBottom: 8 }}>
        QI<span style={{ color: colors.accent }}>VORI</span>
        <span style={{ fontSize: 14, color: colors.accent2, letterSpacing: 1, fontFamily: fonts.body, fontWeight: 700, marginLeft: 6 }}>AI</span>
      </div>
      <p style={{ fontSize: 16, color: colors.text, marginBottom: 20, fontFamily: fonts.body, maxWidth: 500, margin: '0 auto 20px' }}>
        Manage all of this — IFTA, dispatch, expenses, rates — with one AI-powered platform built for owner-operators.
      </p>
      <a
        href="#/"
        onClick={() => { window.location.hash = '' }}
        style={{
          display: 'inline-block', padding: '14px 36px', background: colors.accent,
          color: '#000', fontWeight: 700, fontSize: 15, borderRadius: 10,
          textDecoration: 'none', fontFamily: fonts.body, letterSpacing: 0.5,
          transition: 'transform 0.2s',
        }}
      >
        Start Free Trial
      </a>
      <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 10, fontFamily: fonts.body }}>
        No credit card required. Set up in 5 minutes.
      </p>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────
function GuideHeader() {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: `${colors.bg}ee`, backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${colors.border}`, padding: '0 24px',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', height: 56,
      }}>
        <a href="#/" onClick={() => { window.location.hash = '' }} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: fonts.heading, fontSize: 22, letterSpacing: 3, color: colors.white }}>
            QI<span style={{ color: colors.accent }}>VORI</span>
          </span>
          <span style={{ fontSize: 10, color: colors.accent2, fontFamily: fonts.body, fontWeight: 700, letterSpacing: 1 }}>AI</span>
        </a>
        <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <a href="#/guides/ifta" style={navLink}>IFTA Guide</a>
          <a href="#/guides/start-trucking" style={navLink}>Start Trucking</a>
          <a href="#/guides/rate-negotiation" style={navLink}>Rates</a>
          <a href="#/guides/trucking-expenses" style={navLink}>Expenses</a>
          <a
            href="#/"
            onClick={() => { window.location.hash = '' }}
            style={{
              padding: '7px 18px', background: colors.accent, color: '#000',
              borderRadius: 8, fontWeight: 700, fontSize: 12, textDecoration: 'none',
              fontFamily: fonts.body,
            }}
          >
            Try Qivori
          </a>
        </nav>
      </div>
    </header>
  )
}

const navLink = {
  color: colors.textMuted, fontSize: 12, fontWeight: 600, textDecoration: 'none',
  fontFamily: fonts.body, letterSpacing: 0.3, transition: 'color 0.2s',
}

// ─── Article Layout ──────────────────────────────────────────────
function ArticleLayout({ title, subtitle, readTime, tocItems, children }) {
  return (
    <div style={{ minHeight: '100vh', background: colors.bg, color: colors.text, fontFamily: fonts.body }}>
      <GuideHeader />

      {/* Hero */}
      <div style={{
        background: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.bg} 100%)`,
        padding: '60px 24px 40px', textAlign: 'center',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: colors.accent, marginBottom: 12 }}>
            Qivori Guide
          </div>
          <h1 style={{
            fontFamily: fonts.heading, fontSize: 'clamp(28px, 5vw, 44px)', letterSpacing: 2,
            color: colors.white, margin: '0 0 12px', lineHeight: 1.15,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 16, color: colors.textMuted, maxWidth: 560, margin: '0 auto 16px', lineHeight: 1.6 }}>
              {subtitle}
            </p>
          )}
          <div style={{ fontSize: 12, color: colors.textMuted }}>
            {readTime} min read &middot; Updated March 2026
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px',
        display: 'flex', gap: 40, alignItems: 'flex-start',
      }}>
        {/* Sidebar TOC — hidden on mobile */}
        <div className="guide-toc" style={{ flex: '0 0 auto' }}>
          <TableOfContents items={tocItems} />
        </div>

        {/* Article Content */}
        <article style={{ flex: 1, minWidth: 0 }}>
          {children}
          <CTABanner />
        </article>
      </div>

      {/* Responsive styles */}
      <style>{`
        .guide-toc { display: block; }
        @media (max-width: 860px) {
          .guide-toc { display: none !important; }
        }
        h2[id] { scroll-margin-top: 80px; }
        h3[id] { scroll-margin-top: 80px; }
      `}</style>
    </div>
  )
}

// ─── Content Style Helpers ───────────────────────────────────────
const h2Style = {
  fontFamily: fonts.heading, fontSize: 26, letterSpacing: 2, color: colors.white,
  marginTop: 48, marginBottom: 16, paddingBottom: 8,
  borderBottom: `1px solid ${colors.border}`,
}

const h3Style = {
  fontFamily: fonts.body, fontSize: 17, fontWeight: 700, color: colors.white,
  marginTop: 28, marginBottom: 10,
}

const pStyle = {
  fontSize: 15, lineHeight: 1.75, color: colors.text, marginBottom: 16,
}

const ulStyle = {
  paddingLeft: 20, marginBottom: 16,
}

const liStyle = {
  fontSize: 14, lineHeight: 1.75, color: colors.text, marginBottom: 6,
}

const tipBox = {
  background: `${colors.accent}11`, border: `1px solid ${colors.accent}33`,
  borderRadius: 10, padding: '16px 20px', marginBottom: 20, marginTop: 16,
}

const tipLabel = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5,
  color: colors.accent, marginBottom: 6,
}


// ═══════════════════════════════════════════════════════════════════
// PAGE 1: IFTA GUIDE
// ═══════════════════════════════════════════════════════════════════
export function IFTAGuidePage() {
  useMeta(
    'Complete IFTA Filing Guide for Owner-Operators (2026)',
    'Learn how to file IFTA taxes, calculate state mileage, meet quarterly deadlines, and avoid common mistakes. Free guide for truckers and owner-operators.'
  )

  const toc = [
    { id: 'what-is-ifta', label: 'What Is IFTA?' },
    { id: 'who-needs-ifta', label: 'Who Needs to File' },
    { id: 'quarterly-deadlines', label: 'Quarterly Deadlines' },
    { id: 'calculate-mileage', label: 'Calculate State Mileage' },
    { id: 'filing-step-by-step', label: 'Filing Step by Step' },
    { id: 'common-mistakes', label: 'Common Mistakes' },
    { id: 'qivori-ifta', label: 'Automate with Qivori' },
  ]

  return (
    <ArticleLayout
      title="Complete IFTA Filing Guide for Owner-Operators (2026)"
      subtitle="Everything you need to know about the International Fuel Tax Agreement — deadlines, calculations, and how to avoid costly mistakes."
      readTime={8}
      tocItems={toc}
    >
      <h2 id="what-is-ifta" style={h2Style}>What Is IFTA?</h2>
      <p style={pStyle}>
        The International Fuel Tax Agreement (IFTA) is an agreement between the 48 contiguous U.S. states and 10 Canadian provinces that simplifies fuel tax reporting for motor carriers operating in multiple jurisdictions. Instead of filing separate fuel tax returns in every state you drive through, IFTA lets you file a single quarterly return with your base jurisdiction, which then distributes the taxes to the appropriate states.
      </p>
      <p style={pStyle}>
        Think of it this way: every state charges fuel tax at different rates. When you buy fuel in one state but drive through five others, IFTA ensures each state gets its fair share of fuel tax based on the miles you drove there — regardless of where you actually purchased the fuel.
      </p>
      <p style={pStyle}>
        As an owner-operator, you receive an IFTA license and decals for your truck. These decals show other jurisdictions that you're a registered IFTA carrier. Without them, you could face fines at weigh stations and during roadside inspections.
      </p>

      <h2 id="who-needs-ifta" style={h2Style}>Who Needs to File IFTA?</h2>
      <p style={pStyle}>
        You need an IFTA license if your vehicle meets <strong>both</strong> of these conditions:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Qualifies as a "qualified motor vehicle"</strong> — This means it has two axles and a gross vehicle weight or registered gross vehicle weight exceeding 26,000 pounds, OR has three or more axles regardless of weight, OR is used in combination when the combined weight exceeds 26,000 pounds.</li>
        <li style={liStyle}><strong>Travels in two or more IFTA jurisdictions</strong> — If you only operate within a single state, you don't need IFTA. But the moment you cross a state line with a qualifying vehicle, IFTA applies.</li>
      </ul>
      <div style={tipBox}>
        <div style={tipLabel}>Pro Tip</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Recreational vehicles are exempt from IFTA. Also, if you only operate in one state, check that state's intrastate fuel tax requirements — they're separate from IFTA.
        </p>
      </div>

      <h2 id="quarterly-deadlines" style={h2Style}>2026 Quarterly Deadlines</h2>
      <p style={pStyle}>
        IFTA returns are due on the last day of the month following the end of each quarter. Here are the 2026 deadlines:
      </p>
      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: colors.accent, fontWeight: 700 }}>Quarter</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: colors.accent, fontWeight: 700 }}>Period</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: colors.accent, fontWeight: 700 }}>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Q1', 'Jan 1 – Mar 31', 'April 30, 2026'],
              ['Q2', 'Apr 1 – Jun 30', 'July 31, 2026'],
              ['Q3', 'Jul 1 – Sep 30', 'October 31, 2026'],
              ['Q4', 'Oct 1 – Dec 31', 'January 31, 2027'],
            ].map(([q, period, due], i) => (
              <tr key={q} style={{ borderBottom: `1px solid ${colors.border}`, background: i % 2 === 0 ? colors.surface : 'transparent' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: colors.white }}>{q}</td>
                <td style={{ padding: '10px 14px', color: colors.text }}>{period}</td>
                <td style={{ padding: '10px 14px', color: colors.accent2, fontWeight: 600 }}>{due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={tipBox}>
        <div style={tipLabel}>Warning</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Late filing penalties can be significant — typically $50 or 10% of the net tax liability (whichever is greater), plus interest. Some states add their own penalties on top. File on time, every time.
        </p>
      </div>

      <h2 id="calculate-mileage" style={h2Style}>How to Calculate State Mileage</h2>
      <p style={pStyle}>
        Accurate mileage tracking is the foundation of IFTA compliance. You need to track exactly how many miles you drove in each state during the quarter. Here's how the calculation works:
      </p>
      <h3 style={h3Style}>Step 1: Record Total Miles Driven</h3>
      <p style={pStyle}>
        Your odometer readings at the start and end of each trip form the basis. Record the reading when you cross each state line. Many drivers use a trip sheet or a GPS-based tracking system to automate this.
      </p>
      <h3 style={h3Style}>Step 2: Break Down Miles by State</h3>
      <p style={pStyle}>
        For each trip, note the miles driven in each jurisdiction. If you drove 1,200 miles from Dallas, TX to Atlanta, GA, you might have 400 miles in Texas, 300 in Louisiana, 200 in Mississippi, 100 in Alabama, and 200 in Georgia. Every mile must be accounted for.
      </p>
      <h3 style={h3Style}>Step 3: Calculate Your Fleet MPG</h3>
      <p style={pStyle}>
        Divide your total miles by total gallons purchased during the quarter. If you drove 30,000 miles and purchased 5,000 gallons, your average MPG is 6.0. This single number is used across all jurisdictions.
      </p>
      <h3 style={h3Style}>Step 4: Determine Taxable Gallons per State</h3>
      <p style={pStyle}>
        Divide the miles driven in each state by your fleet MPG. If you drove 4,500 miles in Ohio and your MPG is 6.0, Ohio's taxable gallons = 750. Then multiply by Ohio's tax rate to determine your tax obligation.
      </p>
      <h3 style={h3Style}>Step 5: Apply Credits for Fuel Purchased</h3>
      <p style={pStyle}>
        You already paid fuel tax at the pump in states where you bought fuel. Those are credits. Subtract the gallons purchased in each state from the taxable gallons. If you owe for 750 gallons in Ohio but purchased 600 gallons there, you owe the tax on 150 gallons. If you purchased more than you owe, you get a credit.
      </p>

      <h2 id="filing-step-by-step" style={h2Style}>Filing Your IFTA Return Step by Step</h2>
      <p style={pStyle}>
        Once you have your mileage and fuel data compiled, filing is straightforward:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Gather your records:</strong> Trip sheets with state-by-state mileage, fuel receipts showing gallons, price, vendor, and location.</li>
        <li style={liStyle}><strong>Log into your base state's IFTA portal:</strong> Most states offer online filing. You'll need your IFTA account number and login credentials.</li>
        <li style={liStyle}><strong>Enter mileage by jurisdiction:</strong> Input the miles driven in each state/province during the quarter.</li>
        <li style={liStyle}><strong>Enter fuel purchases by jurisdiction:</strong> Input the gallons purchased in each state/province, along with tax-paid and tax-exempt amounts.</li>
        <li style={liStyle}><strong>Review the calculated taxes:</strong> The system will compute what you owe each state and what credits you have. Review for accuracy.</li>
        <li style={liStyle}><strong>Submit and pay:</strong> If you owe a net amount, pay via the portal. If you're due a refund, it will typically be applied as a credit to your next quarter.</li>
      </ul>

      <h2 id="common-mistakes" style={h2Style}>Common IFTA Mistakes to Avoid</h2>
      <p style={pStyle}>
        After working with hundreds of owner-operators, we've seen the same mistakes come up repeatedly. Here's what to watch out for:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Not keeping fuel receipts:</strong> You must retain receipts for at least 4 years. Digital copies are acceptable in most jurisdictions. Missing receipts mean missing credits — you'll overpay.</li>
        <li style={liStyle}><strong>Estimating mileage instead of tracking it:</strong> Auditors compare your reported mileage against GPS data and industry standards. Estimates that don't hold up lead to assessments and penalties.</li>
        <li style={liStyle}><strong>Forgetting to include deadhead miles:</strong> All miles count — loaded, empty, deadhead, bobtail. If wheels are turning, it counts toward IFTA.</li>
        <li style={liStyle}><strong>Using personal card for fuel:</strong> Keep business and personal fuel purchases separate. Mixed-use receipts create headaches during audits.</li>
        <li style={liStyle}><strong>Filing late or not at all:</strong> Even if you didn't operate during a quarter, you still need to file a zero return. Missing filings can result in license revocation.</li>
        <li style={liStyle}><strong>Ignoring toll and ELD data:</strong> Auditors can cross-reference your reported mileage with toll receipts and ELD logs. Make sure all data sources agree.</li>
      </ul>

      <h2 id="qivori-ifta" style={h2Style}>How Qivori Automates Your IFTA</h2>
      <p style={pStyle}>
        Qivori AI's built-in IFTA module eliminates the manual spreadsheet work that eats hours of your time each quarter. Here's what it does:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Automatic mileage tracking by state:</strong> Qivori's GPS integration records every mile and automatically assigns it to the correct jurisdiction. No more trip sheets.</li>
        <li style={liStyle}><strong>Fuel receipt scanning:</strong> Snap a photo of your fuel receipt, and Qivori extracts the gallons, price, location, and tax paid using AI-powered OCR.</li>
        <li style={liStyle}><strong>Real-time tax calculations:</strong> See your estimated IFTA liability throughout the quarter — no more surprises at filing time.</li>
        <li style={liStyle}><strong>One-click quarterly reports:</strong> Generate your complete IFTA return data with a single click. Export it in the format your base state requires.</li>
        <li style={liStyle}><strong>Audit-ready records:</strong> Every data point is timestamped, GPS-verified, and stored securely. If you're audited, your records are already organized.</li>
      </ul>
      <p style={pStyle}>
        Owner-operators using Qivori save an average of 6 hours per quarter on IFTA paperwork and reduce filing errors by over 90%. The system handles the complexity so you can focus on driving and earning.
      </p>

      <ShareButtons title="Complete IFTA Filing Guide for Owner-Operators (2026)" />
    </ArticleLayout>
  )
}


// ═══════════════════════════════════════════════════════════════════
// PAGE 2: OWNER-OPERATOR STARTUP GUIDE
// ═══════════════════════════════════════════════════════════════════
export function StartTruckingPage() {
  useMeta(
    'How to Start a Trucking Company: Owner-Operator Guide',
    'Step-by-step guide to becoming an owner-operator. CDL, FMCSA registration, MC/DOT numbers, insurance, finding loads, and essential tools.'
  )

  const toc = [
    { id: 'get-cdl', label: 'Get Your CDL' },
    { id: 'business-structure', label: 'Business Structure' },
    { id: 'fmcsa-registration', label: 'FMCSA Registration' },
    { id: 'mc-dot-numbers', label: 'MC & DOT Numbers' },
    { id: 'insurance', label: 'Insurance Requirements' },
    { id: 'equipment', label: 'Get Your Equipment' },
    { id: 'first-load', label: 'Find Your First Load' },
    { id: 'essential-tools', label: 'Essential Tools' },
  ]

  return (
    <ArticleLayout
      title="How to Start a Trucking Company: Owner-Operator Guide"
      subtitle="Your complete roadmap from CDL to first load. Everything you need to know to launch a successful trucking business in 2026."
      readTime={10}
      tocItems={toc}
    >
      <h2 id="get-cdl" style={h2Style}>Step 1: Get Your CDL</h2>
      <p style={pStyle}>
        A Commercial Driver's License (CDL) is your entry ticket to the trucking industry. Since the FMCSA's Entry-Level Driver Training (ELDT) rule took effect, you must complete training at a registered program before taking your CDL skills test.
      </p>
      <p style={pStyle}>
        There are three classes of CDL. For most owner-operators, you'll need a <strong>Class A CDL</strong>, which allows you to operate combination vehicles with a gross combination weight rating (GCWR) of 26,001 pounds or more, provided the towed vehicle is heavier than 10,000 pounds. This covers tractor-trailers, the bread and butter of long-haul trucking.
      </p>
      <p style={pStyle}>
        CDL training programs typically cost between $3,000 and $10,000 and take 3-8 weeks. Some larger carriers offer sponsored training where they cover the cost in exchange for a commitment to drive for them for a period. This can be a smart way to get experience before going independent.
      </p>
      <div style={tipBox}>
        <div style={tipLabel}>Pro Tip</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Get at least 1-2 years of experience driving for a company before going owner-operator. You'll learn the business, build a safety record, and understand what lanes and freight types suit you best.
        </p>
      </div>

      <h2 id="business-structure" style={h2Style}>Step 2: Choose Your Business Structure</h2>
      <p style={pStyle}>
        Before you register with the FMCSA, decide on your business structure. Most owner-operators choose one of these:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Sole Proprietorship:</strong> The simplest option. You and the business are one entity. Easy to set up, but your personal assets are at risk if someone sues the business.</li>
        <li style={liStyle}><strong>LLC (Limited Liability Company):</strong> The most popular choice. It protects your personal assets from business liabilities while offering flexible tax treatment. Formation costs $50-$500 depending on the state.</li>
        <li style={liStyle}><strong>S-Corporation:</strong> Offers potential tax savings if you're earning over $80,000/year. You pay yourself a reasonable salary and take the rest as distributions, potentially saving on self-employment tax. More complex to maintain.</li>
      </ul>
      <p style={pStyle}>
        We recommend starting with an LLC. It provides liability protection without the complexity of a corporation. You can always elect S-Corp tax status later when your revenue justifies it. Get an EIN (Employer Identification Number) from the IRS — it's free and takes minutes online.
      </p>

      <h2 id="fmcsa-registration" style={h2Style}>Step 3: Register with FMCSA</h2>
      <p style={pStyle}>
        The Federal Motor Carrier Safety Administration (FMCSA) regulates all commercial motor carriers in the United States. To operate legally as an owner-operator, you must register through the <strong>Unified Registration System (URS)</strong> at the FMCSA website.
      </p>
      <p style={pStyle}>
        During registration, you'll provide information about your business, the type of freight you plan to haul, your operating radius, and your safety practices. The registration process involves a filing fee of $300 and requires you to designate process agents in every state where you operate.
      </p>
      <p style={pStyle}>
        You'll also need a <strong>BOC-3 filing</strong> — this designates process agents who can accept legal documents on your behalf in each state. Several companies offer BOC-3 filing services for $30-$50.
      </p>

      <h2 id="mc-dot-numbers" style={h2Style}>Step 4: Get Your MC and DOT Numbers</h2>
      <p style={pStyle}>
        When you register with FMCSA, you'll receive two critical numbers:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>USDOT Number:</strong> This is your unique identifier for safety tracking and compliance. Every commercial vehicle must display this number. It's required for all interstate carriers and many intrastate carriers.</li>
        <li style={liStyle}><strong>MC (Motor Carrier) Number:</strong> This is your operating authority — your license to haul freight for hire. Without active MC authority, you cannot legally broker or carry freight across state lines for compensation.</li>
      </ul>
      <p style={pStyle}>
        After your MC number is issued, there's a mandatory 10-day waiting period during which your authority is "pending." During this time, other parties can protest your application (rare). After the waiting period and once you have proof of insurance on file, your authority becomes active. The entire process from application to active authority typically takes 4-6 weeks.
      </p>

      <h2 id="insurance" style={h2Style}>Step 5: Insurance Requirements</h2>
      <p style={pStyle}>
        Insurance is one of the largest ongoing costs for owner-operators. The FMCSA sets minimum requirements, but your contracts and common sense often demand more. Here's what you need:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Primary Liability Insurance:</strong> Minimum $750,000 for general freight, $1,000,000 for hazmat. This covers damage you cause to others. Most brokers require $1,000,000 regardless of freight type. Budget $8,000-$16,000/year for a new authority.</li>
        <li style={liStyle}><strong>Cargo Insurance:</strong> Covers the freight you're hauling if it's damaged or lost. The FMCSA doesn't mandate a minimum, but most brokers require $100,000. Standard policies cost $1,500-$3,000/year.</li>
        <li style={liStyle}><strong>Physical Damage Insurance:</strong> Covers your truck and trailer against collision, theft, and weather damage. Not federally required but essential if you're financing your equipment. Cost depends on the value of your truck.</li>
        <li style={liStyle}><strong>Bobtail/Non-Trucking Liability:</strong> Covers your truck when it's being used without a trailer (bobtailing) or for personal use. Required by most lease agreements. Around $400-$800/year.</li>
        <li style={liStyle}><strong>Occupational Accident Insurance:</strong> Since you're self-employed, you don't have workers' comp. This covers you if you're injured on the job. $150-$300/month.</li>
      </ul>
      <div style={tipBox}>
        <div style={tipLabel}>Budget Tip</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Your insurance rates will be highest in your first 2 years due to having a new authority. Rates typically drop 20-30% after you establish a clean safety record. Shop multiple insurers and consider working with a trucking-specific insurance broker.
        </p>
      </div>

      <h2 id="equipment" style={h2Style}>Step 6: Get Your Equipment</h2>
      <p style={pStyle}>
        You have three main options for getting a truck:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Buy new:</strong> $130,000-$180,000 for a quality sleeper cab. Lowest maintenance costs, full warranty, latest fuel efficiency. Highest upfront cost.</li>
        <li style={liStyle}><strong>Buy used:</strong> $40,000-$90,000 for a 3-5 year old truck with 400,000-600,000 miles. Good balance of cost and reliability. Get a thorough pre-purchase inspection.</li>
        <li style={liStyle}><strong>Lease:</strong> $1,500-$2,500/month with a lease-purchase option. Lower barrier to entry, but you'll pay more over time. Read the contract carefully — some lease agreements are predatory.</li>
      </ul>
      <p style={pStyle}>
        For your trailer, a standard 53-foot dry van runs $25,000-$45,000 used. Reefer trailers (refrigerated) cost $40,000-$70,000 used but open access to higher-paying temperature-controlled freight. Flatbed trailers are $15,000-$30,000 used and can access specialized freight markets.
      </p>

      <h2 id="first-load" style={h2Style}>Step 7: Find Your First Load</h2>
      <p style={pStyle}>
        With your authority active, insurance in place, and truck ready, it's time to find freight. Here are the main channels:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Load boards:</strong> Platforms like DAT, Truckstop.com, and Qivori's free load board connect you with available freight. Start here to learn the market and build relationships.</li>
        <li style={liStyle}><strong>Freight brokers:</strong> Brokers match carriers with shippers. They take a cut (typically 10-25%), but they handle the sales, billing, and sometimes fuel advances. A good broker relationship is gold.</li>
        <li style={liStyle}><strong>Direct shipper contracts:</strong> The holy grail. Eliminate the middleman, get better rates, and have consistent freight. These take time to develop but are worth pursuing from day one.</li>
        <li style={liStyle}><strong>Carrier networks:</strong> Partner with other small carriers to bid on larger contracts that no single truck could handle.</li>
      </ul>
      <p style={pStyle}>
        For your first few loads, prioritize reliability over rate. Deliver on time, communicate proactively, and build your reputation. Word travels fast in trucking — a few solid deliveries open doors to better freight.
      </p>

      <h2 id="essential-tools" style={h2Style}>Essential Tools for Owner-Operators</h2>
      <p style={pStyle}>
        Running a trucking business requires more than just a truck and a CDL. These tools will keep you profitable and compliant:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>ELD (Electronic Logging Device):</strong> Legally required for tracking your hours of service. Budget $20-$40/month for a quality ELD solution.</li>
        <li style={liStyle}><strong>TMS (Transportation Management System):</strong> Tracks loads, invoices, expenses, and profitability. This is where Qivori shines — it combines TMS, accounting, IFTA, and AI-powered dispatch into one platform.</li>
        <li style={liStyle}><strong>Accounting software:</strong> Track revenue, expenses, and tax obligations. QuickBooks Self-Employed works, but Qivori's built-in expense tracking is purpose-built for trucking.</li>
        <li style={liStyle}><strong>Dashcam:</strong> Front and rear facing cameras protect you in accident disputes. $200-$500 for a quality dual-camera setup.</li>
        <li style={liStyle}><strong>Fuel card:</strong> Cards like Comdata or EFS offer per-gallon discounts at truck stops. Savings of $0.05-$0.15/gallon add up fast.</li>
        <li style={liStyle}><strong>Factoring service (optional):</strong> If cash flow is tight, factoring companies advance you 90-95% of your invoice value within 24 hours, then collect from the broker. They charge 1-5% per invoice.</li>
      </ul>

      <ShareButtons title="How to Start a Trucking Company: Owner-Operator Guide" />
    </ArticleLayout>
  )
}


// ═══════════════════════════════════════════════════════════════════
// PAGE 3: RATE NEGOTIATION
// ═══════════════════════════════════════════════════════════════════
export function RateNegotiationPage() {
  useMeta(
    'How to Negotiate Freight Rates: Scripts & Strategies',
    'Proven strategies, email templates, and phone scripts for negotiating better freight rates. Learn when to push back and how to counter-offer effectively.'
  )

  const toc = [
    { id: 'market-research', label: 'Market Rate Research' },
    { id: 'when-to-negotiate', label: 'When to Negotiate' },
    { id: 'phone-scripts', label: 'Phone Scripts' },
    { id: 'email-templates', label: 'Email Templates' },
    { id: 'counter-offers', label: 'Counter-Offer Strategies' },
    { id: 'red-flags', label: 'Red Flags to Watch' },
    { id: 'qivori-rates', label: 'Qivori Rate Intelligence' },
  ]

  const scriptBox = {
    background: colors.surface, border: `1px solid ${colors.border}`,
    borderRadius: 10, padding: '20px 24px', marginBottom: 20, marginTop: 12,
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, lineHeight: 1.7,
    color: colors.text, whiteSpace: 'pre-wrap',
  }

  return (
    <ArticleLayout
      title="How to Negotiate Freight Rates: Scripts & Strategies"
      subtitle="Stop leaving money on the table. Learn the exact words, timing, and tactics that top owner-operators use to get better rates on every load."
      readTime={9}
      tocItems={toc}
    >
      <h2 id="market-research" style={h2Style}>Know Your Market Rates</h2>
      <p style={pStyle}>
        You can't negotiate effectively if you don't know what a load should pay. Market rate research is the foundation of every negotiation. Before you call or email a broker, you should know the going rate for that lane within a narrow range.
      </p>
      <p style={pStyle}>
        Use multiple data sources to triangulate the current rate. Load boards like DAT and Truckstop publish lane averages. Qivori's Rate Intelligence tool aggregates real-time data across multiple sources to give you a confidence score for any lane. Industry surveys from ATRI provide cost-per-mile benchmarks.
      </p>
      <p style={pStyle}>
        Know your own numbers cold. What is your cost per mile? For most owner-operators, total operating costs fall between $1.50 and $2.20 per mile when you include fuel, insurance, truck payment, maintenance, permits, and your salary. If a load doesn't cover your costs plus a reasonable profit margin, it's not worth taking — no matter how persuasive the broker is.
      </p>
      <div style={tipBox}>
        <div style={tipLabel}>Key Numbers to Know</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Average dry van rate per mile (national): $2.30-$2.80 in 2026. Reefer: $2.60-$3.20. Flatbed: $2.80-$3.50. Your specific lane may be higher or lower. Always check the lane-specific rate, not just national averages.
        </p>
      </div>

      <h2 id="when-to-negotiate" style={h2Style}>When to Negotiate (Timing Is Everything)</h2>
      <p style={pStyle}>
        Timing dramatically affects your negotiating power. Understanding market cycles gives you leverage:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>End of month/quarter:</strong> Shippers need to move freight before period-end. Brokers are more flexible on rates to clear their boards.</li>
        <li style={liStyle}><strong>Produce season (April-August):</strong> Reefer demand spikes. If you have a reefer, your leverage increases significantly in warmer months.</li>
        <li style={liStyle}><strong>Holiday seasons:</strong> Retail freight surges before Thanksgiving and Christmas. Rates climb 15-25% above baseline.</li>
        <li style={liStyle}><strong>Severe weather events:</strong> Disruptions tighten capacity in affected regions. Rates in and out of those areas increase.</li>
        <li style={liStyle}><strong>When a load is posted multiple times:</strong> If you see the same load reposted, the broker is struggling to cover it. That's your leverage.</li>
        <li style={liStyle}><strong>Close to pickup time:</strong> A load that picks up in 4 hours pays more than one that picks up in 3 days. Urgency is your friend.</li>
      </ul>

      <h2 id="phone-scripts" style={h2Style}>Phone Negotiation Scripts</h2>
      <p style={pStyle}>
        The phone is where most rate negotiations happen. Here are proven scripts for common scenarios:
      </p>
      <h3 style={h3Style}>Script 1: Initial Rate Inquiry</h3>
      <div style={scriptBox}>
{`"Hi, this is [Name] with [Company], MC number [XXXXXX].
I'm calling about the load from [Origin] to [Destination]
posted on [Board/Reference].

I'm available for pickup on [Date]. What's the rate
on this one?"

[Let them state the rate first. Never go first.]

If rate is low:
"I appreciate that. I'm seeing rates on this lane
running $X.XX to $X.XX per mile this week. My truck
is available and I can guarantee on-time pickup and
delivery. I'd need [$Amount] to make this work.
Can you get closer to that?"`}
      </div>

      <h3 style={h3Style}>Script 2: Counter-Offer After Low Initial Rate</h3>
      <div style={scriptBox}>
{`"I understand you're working with a budget on this one.
Here's my situation — after fuel, insurance, and
operating costs, I need at least $X.XX per mile to
run this lane profitably.

I've got a clean safety record, I'm always on time,
and I communicate proactively. What can you do to
get closer to [$Amount]?"

[If they say they can't move:]
"Okay, is there any flexibility on detention pay?
Or do you have anything else moving out of
[Destination city] that I could pair with this?"`}
      </div>

      <h3 style={h3Style}>Script 3: Leveraging a Competing Offer</h3>
      <div style={scriptBox}>
{`"I've got another offer on a load heading that
direction at [$Higher Amount]. I'd prefer to work
with you since we've had a good relationship, but
I need the numbers to make sense. Can you match
[$Amount] on this one?"

[Only use this if you actually have another offer.
Bluffing damages trust and your reputation.]`}
      </div>

      <h2 id="email-templates" style={h2Style}>Email Negotiation Templates</h2>
      <p style={pStyle}>
        Email works well for lane contracts and ongoing rate negotiations. It creates a paper trail and gives both sides time to think.
      </p>
      <h3 style={h3Style}>Template: Requesting a Rate Increase on an Existing Lane</h3>
      <div style={scriptBox}>
{`Subject: Rate Review Request — [Origin] to [Destination]

Hi [Broker Name],

I've valued our partnership on the [Origin] to
[Destination] lane over the past [X months]. My
on-time rate has been [X%] and I've handled
[X loads] without any claims or issues.

Due to increased operating costs — fuel is up [X%],
insurance renewed [X%] higher, and maintenance costs
have risen — I need to adjust my rate on this lane
from [$Current] to [$Requested] per mile, effective
[Date].

This keeps me competitive on this lane while
maintaining the service level you've come to expect.
I'm happy to discuss if you'd like to talk through
the numbers.

Best regards,
[Your Name]
[Company] | MC# [XXXXXX]
[Phone]`}
      </div>

      <h2 id="counter-offers" style={h2Style}>Counter-Offer Strategies That Work</h2>
      <p style={pStyle}>
        Effective counter-offering is an art. Here are the strategies that consistently produce better results:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Never accept the first offer:</strong> Brokers build negotiation room into their initial rates. Even if the first number sounds good, a polite counter often yields $50-$200 more.</li>
        <li style={liStyle}><strong>Justify with data, not emotion:</strong> "I'm seeing $2.75/mile on this lane from three different sources" is stronger than "That's too low." Data-backed counters are taken more seriously.</li>
        <li style={liStyle}><strong>Offer value-adds:</strong> "I'll guarantee pickup within a 2-hour window and provide live GPS tracking" justifies a premium rate. Make it easy for the broker to sell you to the shipper.</li>
        <li style={liStyle}><strong>Ask about the full package:</strong> If the line-haul rate is firm, negotiate detention pay, layover pay, fuel surcharges, or quick-pay terms. A load paying $2.50/mile with $75/hour detention after 2 hours free might beat a $2.65/mile load with no detention pay.</li>
        <li style={liStyle}><strong>Use the "split the difference" close:</strong> "You're at $3,200 and I need $3,600. Can we meet in the middle at $3,400?" This feels fair and usually works if the gap is reasonable.</li>
        <li style={liStyle}><strong>Be willing to walk away:</strong> The most powerful tool is your willingness to say no. If a load doesn't meet your minimums, declining it keeps your per-mile revenue strong.</li>
      </ul>

      <h2 id="red-flags" style={h2Style}>Red Flags in Rate Negotiations</h2>
      <p style={pStyle}>
        Not every load is worth taking, and not every broker is worth working with. Watch for these warning signs:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Rates far below market:</strong> If a broker consistently offers 20-30% below market, they're either padding their margin excessively or the shipper is a problem account.</li>
        <li style={liStyle}><strong>"The rate is the rate" on every load:</strong> Good brokers negotiate. If they refuse to budge on anything, ever, they likely don't value the carrier relationship.</li>
        <li style={liStyle}><strong>Vague detention policies:</strong> If they can't clearly explain when detention starts and what it pays, expect to sit for free.</li>
        <li style={liStyle}><strong>Pressure to book immediately:</strong> "This load will be gone in 5 minutes" is a classic high-pressure tactic. Good loads do move fast, but legitimate urgency doesn't require bullying.</li>
        <li style={liStyle}><strong>Bad credit or payment history:</strong> Check the broker's credit score on services like Carrier411 or TransCredit. A broker who doesn't pay isn't worth any rate.</li>
        <li style={liStyle}><strong>Changing terms after booking:</strong> If the rate, pickup time, or delivery requirements change after you've confirmed, that's a pattern that will continue. Address it immediately or move on.</li>
      </ul>

      <h2 id="qivori-rates" style={h2Style}>How Qivori Helps You Negotiate Better</h2>
      <p style={pStyle}>
        Qivori AI's Rate Intelligence gives you real-time ammunition for every negotiation:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Lane rate benchmarks:</strong> See the average, high, and low rates for any lane in the last 7, 14, and 30 days. Know exactly where the market stands before you pick up the phone.</li>
        <li style={liStyle}><strong>Broker score cards:</strong> Qivori tracks broker payment reliability, average days-to-pay, and rate fairness. Know who you're dealing with before you book.</li>
        <li style={liStyle}><strong>Cost-per-mile calculator:</strong> Input your specific costs and Qivori tells you the minimum rate per mile you need. No more guessing whether a load is profitable.</li>
        <li style={liStyle}><strong>AI-powered rate predictions:</strong> Our machine learning model predicts rate movements 1-2 weeks out, so you know whether to book now or wait for rates to climb.</li>
      </ul>

      <ShareButtons title="How to Negotiate Freight Rates: Scripts & Strategies" />
    </ArticleLayout>
  )
}


// ═══════════════════════════════════════════════════════════════════
// PAGE 4: TRUCKING EXPENSES
// ═══════════════════════════════════════════════════════════════════
export function TruckingExpensesPage() {
  useMeta(
    'Tax Deductible Trucking Expenses: Complete List for Owner-Operators',
    'Complete list of tax-deductible expenses for truck drivers and owner-operators. Per diem, fuel, maintenance, insurance, tolls, ELD, and more.'
  )

  const toc = [
    { id: 'per-diem', label: 'Per Diem Deduction' },
    { id: 'fuel', label: 'Fuel Expenses' },
    { id: 'truck-costs', label: 'Truck & Equipment' },
    { id: 'maintenance', label: 'Maintenance & Repairs' },
    { id: 'insurance-expenses', label: 'Insurance' },
    { id: 'road-costs', label: 'Tolls, Scales & Parking' },
    { id: 'technology', label: 'Technology & Subscriptions' },
    { id: 'other-deductions', label: 'Other Deductions' },
    { id: 'tracking-expenses', label: 'How to Track Expenses' },
  ]

  return (
    <ArticleLayout
      title="Tax Deductible Trucking Expenses: Complete List for Owner-Operators"
      subtitle="Stop overpaying the IRS. This comprehensive list covers every legitimate deduction available to owner-operators and truck drivers."
      readTime={10}
      tocItems={toc}
    >
      <h2 id="per-diem" style={h2Style}>Per Diem Deduction</h2>
      <p style={pStyle}>
        The per diem deduction is one of the most valuable tax benefits for truck drivers. When you're away from home overnight for work, you can deduct a fixed amount for meals and incidental expenses — no receipts required for the standard rate.
      </p>
      <p style={pStyle}>
        For 2026, the per diem rate for transportation workers is <strong>$69 per day</strong> within the continental U.S. and $74 per day for travel outside CONUS. As a transportation worker, you can deduct <strong>80%</strong> of this amount (versus 50% for other industries), making your effective deduction $55.20 per day.
      </p>
      <p style={pStyle}>
        If you're on the road 250 days per year, that's a deduction of $13,800 — reducing your taxable income significantly. You can claim per diem for any day you're away from your tax home overnight, including the day you leave and the day you return (as partial days at 75%).
      </p>
      <div style={tipBox}>
        <div style={tipLabel}>Important</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          You can choose the standard per diem rate OR actual meal expenses — not both. Most drivers find the standard rate simpler and often more generous. Keep a log of your travel days as documentation.
        </p>
      </div>

      <h2 id="fuel" style={h2Style}>Fuel Expenses</h2>
      <p style={pStyle}>
        Fuel is typically the largest single expense for an owner-operator, often 30-40% of total costs. Every gallon is deductible as a business expense.
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Diesel fuel:</strong> Every gallon for your truck, whether purchased at a truck stop or cardlock station. Keep all receipts.</li>
        <li style={liStyle}><strong>DEF (Diesel Exhaust Fluid):</strong> Required for modern trucks with SCR systems. Fully deductible.</li>
        <li style={liStyle}><strong>Reefer fuel:</strong> If you run a refrigerated trailer, the fuel for the reefer unit is a separate deductible expense.</li>
        <li style={liStyle}><strong>Fuel additives:</strong> Anti-gel treatments, injector cleaners, and other fuel additives used for your truck.</li>
        <li style={liStyle}><strong>Fuel surcharges received:</strong> Note that fuel surcharges you receive from brokers are taxable income. They offset your fuel costs but must be reported as revenue.</li>
      </ul>
      <p style={pStyle}>
        Use a fuel card like Comdata, EFS, or TCS to automatically categorize and track fuel purchases. This simplifies both your bookkeeping and your IFTA reporting.
      </p>

      <h2 id="truck-costs" style={h2Style}>Truck and Equipment Costs</h2>
      <p style={pStyle}>
        The cost of your truck and trailer is deductible, but how you deduct it depends on whether you own or lease:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Truck payments (if leasing):</strong> Monthly lease payments are fully deductible as a business expense. Straightforward and immediate.</li>
        <li style={liStyle}><strong>Depreciation (if you own):</strong> Spread the cost of the truck over its useful life (typically 3-7 years). You may be able to use Section 179 to deduct the full purchase price in the year you buy it (up to the annual limit).</li>
        <li style={liStyle}><strong>Loan interest:</strong> If you financed your truck, the interest portion of your payments is deductible.</li>
        <li style={liStyle}><strong>Trailer costs:</strong> Same rules apply — lease payments are deductible, or depreciate if you own.</li>
        <li style={liStyle}><strong>Auxiliary equipment:</strong> Chains, tarps, straps, load bars, pallet jacks, dollies, and other freight-handling equipment.</li>
        <li style={liStyle}><strong>APU (Auxiliary Power Unit):</strong> If you installed an APU for idle-free climate control, the cost is deductible through depreciation or Section 179.</li>
      </ul>
      <div style={tipBox}>
        <div style={tipLabel}>Section 179 Tip</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Section 179 allows you to deduct the full purchase price of qualifying equipment in the year you buy it, rather than depreciating it over years. For 2026, the deduction limit is $1,220,000. This can dramatically reduce your tax bill in the year you buy a truck.
        </p>
      </div>

      <h2 id="maintenance" style={h2Style}>Maintenance and Repairs</h2>
      <p style={pStyle}>
        Every dollar you spend keeping your truck running is deductible. This includes:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Oil changes and filters:</strong> Engine oil, oil filters, fuel filters, air filters, cabin filters.</li>
        <li style={liStyle}><strong>Tires:</strong> New tires, retreads, tire repairs, tire balancing, and alignments.</li>
        <li style={liStyle}><strong>Brake work:</strong> Pads, drums, shoes, adjustments, and air brake system repairs.</li>
        <li style={liStyle}><strong>Engine and drivetrain repairs:</strong> Any mechanical repair to the engine, transmission, differential, or drivetrain.</li>
        <li style={liStyle}><strong>Electrical repairs:</strong> Lighting, wiring, alternator, starter, and battery replacements.</li>
        <li style={liStyle}><strong>Preventive maintenance:</strong> Scheduled services, DOT inspections, grease jobs, and fluid flushes.</li>
        <li style={liStyle}><strong>Truck wash:</strong> Exterior wash, interior cleaning, and detailing for your truck and trailer.</li>
        <li style={liStyle}><strong>Roadside repairs:</strong> Emergency service calls, mobile mechanic fees, and towing.</li>
      </ul>

      <h2 id="insurance-expenses" style={h2Style}>Insurance Premiums</h2>
      <p style={pStyle}>
        All business-related insurance premiums are fully deductible:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Primary liability insurance</strong></li>
        <li style={liStyle}><strong>Cargo insurance</strong></li>
        <li style={liStyle}><strong>Physical damage (comprehensive and collision)</strong></li>
        <li style={liStyle}><strong>Bobtail / non-trucking liability</strong></li>
        <li style={liStyle}><strong>Occupational accident insurance</strong></li>
        <li style={liStyle}><strong>Health insurance:</strong> Self-employed individuals can deduct 100% of their health insurance premiums (for themselves, spouse, and dependents) as an adjustment to income — not even itemized. This is huge.</li>
        <li style={liStyle}><strong>Workers' compensation</strong> (if required by your state or contracts)</li>
      </ul>

      <h2 id="road-costs" style={h2Style}>Tolls, Scales, and Parking</h2>
      <p style={pStyle}>
        Road-related expenses add up fast and are all deductible:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Toll fees:</strong> All tolls on toll roads, bridges, and tunnels. Use a PrePass or E-ZPass transponder and the statements serve as your records.</li>
        <li style={liStyle}><strong>Scale fees:</strong> CAT scale tickets, state weigh station fees, and pre-trip weight verifications.</li>
        <li style={liStyle}><strong>Parking fees:</strong> Truck stop parking, reserved parking services, and overnight parking fees. With safe parking becoming scarcer, these costs are rising.</li>
        <li style={liStyle}><strong>Lumper fees:</strong> Fees paid for loading/unloading at warehouses (when not reimbursed by the broker).</li>
        <li style={liStyle}><strong>Permits:</strong> Oversize/overweight permits, trip permits, fuel permits, and state-specific operating permits.</li>
        <li style={liStyle}><strong>Highway Use Tax (HVUT):</strong> The annual Form 2290 tax for trucks over 55,000 lbs GVW. Currently $550/year for most trucks.</li>
      </ul>

      <h2 id="technology" style={h2Style}>Technology and Subscriptions</h2>
      <p style={pStyle}>
        Modern trucking runs on technology, and all of it is deductible:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>ELD device and subscription:</strong> Your electronic logging device hardware and monthly service fee.</li>
        <li style={liStyle}><strong>Cell phone:</strong> The business-use percentage of your phone and plan. If you use your phone 80% for business, deduct 80% of the cost.</li>
        <li style={liStyle}><strong>GPS and navigation:</strong> Truck-specific GPS devices or navigation app subscriptions.</li>
        <li style={liStyle}><strong>Dashcam:</strong> Camera hardware and cloud storage subscriptions.</li>
        <li style={liStyle}><strong>Load board subscriptions:</strong> DAT, Truckstop, or any load board you pay for.</li>
        <li style={liStyle}><strong>TMS software:</strong> Transportation management system subscriptions like Qivori AI.</li>
        <li style={liStyle}><strong>Satellite radio:</strong> If used primarily for traffic and weather updates during driving.</li>
        <li style={liStyle}><strong>Internet/hotspot:</strong> Mobile hotspot device and data plan for business use on the road.</li>
      </ul>

      <h2 id="other-deductions" style={h2Style}>Other Deductions You Might Miss</h2>
      <p style={pStyle}>
        These commonly overlooked deductions can save you hundreds or thousands per year:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Uniforms and work clothing:</strong> Safety vests, steel-toe boots, gloves, and branded work shirts. Laundry costs for work clothes too.</li>
        <li style={liStyle}><strong>DOT physical:</strong> The cost of your required medical examination and any drug/alcohol testing fees.</li>
        <li style={liStyle}><strong>CDL renewal and endorsements:</strong> Renewal fees, TWIC card, HazMat endorsement, and any required background checks.</li>
        <li style={liStyle}><strong>Association dues:</strong> OOIDA membership, state trucking association fees, and other professional memberships.</li>
        <li style={liStyle}><strong>Tax preparation fees:</strong> The cost of having a professional prepare your tax return (including this if you're paying an accountant).</li>
        <li style={liStyle}><strong>Home office:</strong> If you use a dedicated space in your home exclusively for business administration, you can deduct a portion of rent/mortgage, utilities, and internet.</li>
        <li style={liStyle}><strong>Continuing education:</strong> Training courses, safety certifications, and industry conferences.</li>
        <li style={liStyle}><strong>Bank fees and interest:</strong> Business bank account fees, credit card interest on business expenses, and merchant processing fees.</li>
        <li style={liStyle}><strong>Factoring fees:</strong> If you use a factoring company, their fees are a deductible business expense.</li>
        <li style={liStyle}><strong>Shower credits:</strong> Truck stop loyalty programs often provide shower credits — if you pay for showers, those are deductible.</li>
      </ul>

      <h2 id="tracking-expenses" style={h2Style}>How to Track Your Expenses</h2>
      <p style={pStyle}>
        The IRS requires "adequate records" to support your deductions. Here's how to stay audit-proof:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Keep every receipt:</strong> The IRS can disallow deductions you can't prove. Digital copies are acceptable — snap a photo as soon as you get the receipt.</li>
        <li style={liStyle}><strong>Use a dedicated business account:</strong> Never mix personal and business expenses. A separate business checking account and credit card make tracking simple.</li>
        <li style={liStyle}><strong>Record expenses immediately:</strong> Don't rely on memory or a pile of receipts at year-end. Log each expense the day it happens.</li>
        <li style={liStyle}><strong>Categorize consistently:</strong> Use the same categories your tax preparer uses. This saves time and money when tax season arrives.</li>
        <li style={liStyle}><strong>Retain records for 3-7 years:</strong> The IRS can audit returns up to 3 years back (6 years if they suspect underreporting). Keep records for at least 4 years to be safe.</li>
      </ul>
      <p style={pStyle}>
        Qivori AI makes expense tracking effortless. Snap a photo of any receipt and the AI extracts the date, amount, vendor, and category automatically. It syncs with your fuel card, categorizes recurring expenses, and generates tax-ready reports. No more shoeboxes of receipts or spreadsheet nightmares.
      </p>

      <ShareButtons title="Tax Deductible Trucking Expenses: Complete List for Owner-Operators" />
    </ArticleLayout>
  )
}
