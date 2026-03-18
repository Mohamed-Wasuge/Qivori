import { useState, useEffect } from 'react'

const VALUE_POINTS = [
  {
    title: 'AI-Powered Matchmaking',
    description: 'Pair every load with the best-fit carrier using live lane signals, performance history, and pricing intelligence.'
  },
  {
    title: 'Real-Time Operations',
    description: 'Monitor shipments, carrier status, and execution risks from a single command view built for dispatch speed.'
  },
  {
    title: 'Margin Intelligence',
    description: 'Surface profitable opportunities faster with instant lane trends, market movement alerts, and KPI snapshots.'
  }
]

const STATS = [
  { label: 'Active Loads', value: '247' },
  { label: 'Carrier Network', value: '52' },
  { label: 'AI Match Rate', value: '94%' },
  { label: 'On-Time Delivery', value: '96%' }
]

export default function LandingPage({ onGetStarted }) {
  const [founderSpots, setFounderSpots] = useState(100)

  useEffect(() => {
    fetch('/api/pricing').then(r => r.json()).then(d => setFounderSpots(d.founderSpotsRemaining ?? 100)).catch(() => {})
  }, [])

  const goSignup = () => onGetStarted && onGetStarted()

  return (
    <div className='landing-wrap'>
      <div className='landing-ambient landing-ambient-one' />
      <div className='landing-ambient landing-ambient-two' />

      <header className='landing-nav'>
        <div className='landing-brand'>
          QIVORI
        </div>
        <div className='landing-nav-actions'>
          <button className='btn btn-ghost' onClick={goSignup}>Sign In</button>
          <button className='btn btn-primary' onClick={goSignup}>Start Free Trial</button>
        </div>
      </header>

      <main className='landing-main'>
        <section className='landing-hero'>
          <p className='landing-kicker'>AI-Powered Trucking Dispatch</p>
          <h1>Your AI Dispatcher That
            <span> Books Loads, Calls Brokers, and Gets You Paid.</span>
          </h1>
          <p className='landing-sub'>
            Qivori handles everything from finding loads to calling brokers with voice AI, negotiating rates, sending carrier packets, invoicing, and settlements.
          </p>

          <div className='landing-hero-actions'>
            <button className='btn btn-primary' onClick={goSignup}>
              Start 14-Day Free Trial
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>No credit card required</span>
          </div>

          <div className='landing-stats-grid'>
            {STATS.map(item => (
              <div key={item.label} className='landing-stat-card'>
                <div className='landing-stat-value'>{item.value}</div>
                <div className='landing-stat-label'>{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FOUNDER PRICING */}
        <section className='panel' style={{ maxWidth: 480, margin: '0 auto 40px', padding: 28, border: '1px solid var(--accent)', borderRadius: 14 }}>
          <div style={{ display: 'inline-block', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 16, marginBottom: 12 }}>
            {founderSpots > 0 ? 'FOUNDER PRICING' : 'STANDARD'}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 16 }}>
            <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>$</span>
            <span style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>{founderSpots > 0 ? '399' : '549'}</span>
            <span style={{ fontSize: 14, color: 'var(--muted)', marginLeft: 4 }}>/truck/month</span>
          </div>
          {founderSpots > 0 && founderSpots < 100 && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12 }}>
              <span style={{ color: 'var(--accent)' }}>{founderSpots} of 100</span> founder spots left at $399/truck
              <div style={{ width: '100%', height: 4, background: 'var(--surface3)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: ((100 - founderSpots) + '%') }} />
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Everything included. 14-day free trial. No credit card.</div>
          <button className='btn btn-primary' style={{ width: '100%', padding: '10px 0', fontSize: 13 }} onClick={goSignup}>
            Start Free Trial
          </button>
        </section>

        <section className='landing-preview panel'>
          <div className='landing-preview-top'>
            <div>
              <div className='landing-preview-label'>Operations Snapshot</div>
              <div className='landing-preview-title'>Control Tower</div>
            </div>
            <span className='pill pill-green'><span className='pill-dot' />Live</span>
          </div>
          <div className='landing-preview-grid'>
            <div className='landing-preview-item'>
              <div>Rate Opportunity</div>
              <strong>ATL \u2192 CHI +12%</strong>
            </div>
            <div className='landing-preview-item'>
              <div>Urgent Load</div>
              <strong>FM-4412 \u00B7 8h Pickup</strong>
            </div>
            <div className='landing-preview-item'>
              <div>Best Carrier Match</div>
              <strong>R&J Transport \u00B7 97 Score</strong>
            </div>
            <div className='landing-preview-item'>
              <div>Net Margin MTD</div>
              <strong>$16,000 \u00B7 19%</strong>
            </div>
          </div>
        </section>
      </main>

      <section className='landing-values'>
        {VALUE_POINTS.map(item => (
          <article key={item.title} className='landing-value-card'>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
