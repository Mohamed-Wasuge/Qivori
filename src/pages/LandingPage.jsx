import { useState, useEffect } from 'react'

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Broker Calling',
    description: 'Qivori AI calls brokers automatically, negotiates rates, and books loads — all hands-free with voice AI.'
  },
  {
    icon: '📊',
    title: 'Smart Load Matching',
    description: 'AI finds the highest-paying loads on your lanes. Filters by equipment, distance, rate per mile, and pickup window.'
  },
  {
    icon: '💰',
    title: 'Auto Invoice & Settlement',
    description: 'Upload POD, invoice goes out automatically. When payment hits, driver settlement is calculated instantly.'
  },
  {
    icon: '📋',
    title: 'Carrier Packet on Autopilot',
    description: 'Insurance, W9, authority — stored securely. Auto-sent to brokers the moment a load is booked.'
  },
  {
    icon: '📞',
    title: 'Automated Check Calls',
    description: 'AI calls the broker after pickup and before delivery with status updates. You never lift a finger.'
  },
  {
    icon: '🏦',
    title: 'Factoring Integration',
    description: 'Connected to OTR, RTS, Triumph, and more. POD uploaded = invoice submitted to factoring automatically.'
  }
]

const STATS = [
  { label: 'Active Loads', value: '247' },
  { label: 'AI Calls Made', value: '1,892' },
  { label: 'Book Rate', value: '94%' },
  { label: 'On-Time', value: '96%' }
]

export default function LandingPage({ onGetStarted }) {
  const [founderSpots, setFounderSpots] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pricing')
      .then(res => res.json())
      .then(data => {
        setFounderSpots(data.founderSpotsRemaining ?? 100)
        setLoading(false)
      })
      .catch(() => {
        setFounderSpots(100)
        setLoading(false)
      })
  }, [])

  const spotsUsed = 100 - (founderSpots ?? 100)
  const progressPct = Math.min(100, (spotsUsed / 100) * 100)
  const goSignup = () => onGetStarted && onGetStarted()

  return (
    <div className="landing-wrap">
      <div className="landing-ambient landing-ambient-one" />
      <div className="landing-ambient landing-ambient-two" />

      <header className="landing-nav">
        <div className="landing-brand">
          QIVORI
        </div>
        <div className="landing-nav-actions">
          <button className="btn btn-ghost" onClick={goSignup}>Sign In</button>
          <button className="btn btn-primary" onClick={goSignup}>Start Free Trial</button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-kicker">AI-Powered Trucking Dispatch</p>
          <h1>Your AI Dispatcher That<span> Books Loads, Calls Brokers, and Gets You Paid.</span></h1>
          <p className="landing-sub">
            Qivori handles everything — finding loads, calling brokers with voice AI, negotiating rates, sending carrier packets, invoicing, and settlements. One platform. One price. Zero headaches.
          </p>

          <div className="landing-hero-actions">
            <button className="btn btn-primary btn-lg" onClick={goSignup}>
              Start 14-Day Free Trial
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>No credit card required</span>
          </div>

          <div className="landing-stats-grid">
            {STATS.map(item => (
              <div key={item.label} className="landing-stat-card">
                <div className="landing-stat-value">{item.value}</div>
                <div className="landing-stat-label">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING SECTION */}
        <section className="landing-pricing" id="pricing">
          <h2 style={{ textAlign: 'center', fontSize: 28, marginBottom: 8 }}>Simple Pricing. Everything Included.</h2>
          <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: 32, fontSize: 15 }}>
            One plan. Every feature. No upsells. No hidden fees.
          </p>

          <div className="landing-pricing-card panel">
            <div className="landing-pricing-badge">
              {founderSpots > 0 ? 'FOUNDER PRICING' : 'STANDARD PRICING'}
            </div>

            <div className="landing-pricing-amount">
              <span className="landing-pricing-dollar">$</span>
              <span className="landing-pricing-number">{founderSpots > 0 ? '399' : '549'}</span>
              <span className="landing-pricing-per">/truck/month</span>
            </div>

            {founderSpots > 0 && (
              <div className="landing-pricing-founder">
                <div className="landing-pricing-founder-label">
                  <span style={{ color: 'var(--accent)' }}>{founderSpots} of 100</span> founder spots remaining at $399/truck
                </div>
                <div className="landing-pricing-progress-bar">
                  <div className="landing-pricing-progress-fill" style={{ width: progressPct + '%' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Founders lock in $399/truck forever — price never increases
                </div>
              </div>
            )}

            <ul className="landing-pricing-features">
              <li>AI Voice Broker Calling (Retell AI)</li>
              <li>Smart Load Matching from DAT & 123Loadboard</li>
              <li>Rate Negotiation with Driver Approval</li>
              <li>Automated Check Calls (pickup + delivery)</li>
              <li>Auto Invoice on POD Upload</li>
              <li>Auto Settlement on Payment</li>
              <li>Carrier Packet Management & Auto-Send</li>
              <li>Factoring Integration (OTR, RTS, Triumph, TCI, Riviera)</li>
              <li>Insurance Expiry Alerts (30-day + 7-day)</li>
              <li>Rate Confirmation Generation & Email</li>
              <li>Driver Notifications (SMS + Push)</li>
              <li>Admin Dashboard with Full Visibility</li>
              <li>14-Day Free Trial — No Credit Card</li>
            </ul>

            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: 15 }}
              onClick={goSignup}
            >
              Start Free Trial — $0 for 14 Days
            </button>

            {founderSpots > 0 && founderSpots <= 20 && (
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--danger)' }}>
                Only {founderSpots} founder spots left — lock in $399/truck forever
              </div>
            )}
          </div>
        </section>

        {/* FEATURES GRID */}
        <section className="landing-values">
          {FEATURES.map(item => (
            <article key={item.title} className="landing-value-card">
              <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </section>

        {/* HOW IT WORKS */}
        <section style={{ maxWidth: 800, margin: '0 auto 60px', padding: '0 24px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 24, marginBottom: 32 }}>How It Works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {[
              { step: '1', title: 'Find Loads', desc: 'AI scans DAT & 123Loadboard for the best loads on your lanes.' },
              { step: '2', title: 'AI Calls Broker', desc: 'Voice AI calls the broker, introduces your carrier, and negotiates the rate.' },
              { step: '3', title: 'You Approve', desc: 'Get notified with the offer. Accept, counter, or decline — your call.' },
              { step: '4', title: 'Get Paid', desc: 'Load booked, packet sent, invoice auto-generated, payment tracked.' }
            ].map(item => (
              <div key={item.step} className="panel" style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
                  {item.step}
                </div>
                <h4 style={{ fontSize: 15, marginBottom: 6 }}>{item.title}</h4>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section style={{ textAlign: 'center', padding: '40px 24px 60px' }}>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Ready to automate your dispatch?</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: 14 }}>
            Join {spotsUsed > 0 ? spotsUsed : ''} carriers already using Qivori to book more loads and get paid faster.
          </p>
          <button className="btn btn-primary btn-lg" onClick={goSignup}>
            Start Free Trial
          </button>
        </section>
      </main>

      <footer style={{ textAlign: 'center', padding: '20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
        &copy; 2026 Qivori Inc. All rights reserved. &nbsp;|&nbsp; hello@qivori.com
      </footer>
    </div>
  )
}
