import { useState, useEffect } from 'react'

const FEATURES = [
  { icon: '\u{1F916}', title: 'AI Broker Calling', description: 'Qivori AI calls brokers, negotiates rates, and books loads hands-free with voice AI.' },
  { icon: '\u{1F4CA}', title: 'Smart Load Matching', description: 'AI finds highest-paying loads on your lanes. Filters by equipment, distance, rate per mile.' },
  { icon: '\u{1F4B0}', title: 'Auto Invoice & Settlement', description: 'Upload POD, invoice goes out. When payment hits, driver settlement is calculated.' },
  { icon: '\u{1F4CB}', title: 'Carrier Packet on Autopilot', description: 'Insurance, W9, authority stored securely. Auto-sent to brokers when load is booked.' },
  { icon: '\u{1F4DE}', title: 'Automated Check Calls', description: 'AI calls broker after pickup and before delivery with status updates.' },
  { icon: '\u{1F3E6}', title: 'Factoring Integration', description: 'Connected to OTR, RTS, Triumph. POD uploaded = invoice submitted to factoring.' }
]

const STATS = [
  { label: 'Active Loads', value: '247' },
  { label: 'AI Calls Made', value: '1,892' },
  { label: 'Book Rate', value: '94%' },
  { label: 'On-Time', value: '96%' }
]

export default function LandingPage({ onGetStarted }) {
  const [founderSpots, setFounderSpots] = useState(100)

  useEffect(() => {
    fetch('/api/pricing').then(r => r.json()).then(d => setFounderSpots(d.founderSpotsRemaining ?? 100)).catch(() => {})
  }, [])

  const spotsUsed = 100 - founderSpots
  const pct = Math.min(100, (spotsUsed / 100) * 100)
  const goSignup = () => onGetStarted && onGetStarted()

  return (
    <div className='landing-wrap'>
      <div className='landing-ambient landing-ambient-one' />
      <div className='landing-ambient landing-ambient-two' />
      <header className='landing-nav'>
        <div className='landing-brand'>QIVORI</div>
        <div className='landing-nav-actions'>
          <button className='btn btn-ghost' onClick={goSignup}>Sign In</button>
          <button className='btn btn-primary' onClick={goSignup}>Start Free Trial</button>
        </div>
      </header>
      <main className='landing-main'>
        <section className='landing-hero'>
          <p className='landing-kicker'>AI-Powered Trucking Dispatch</p>
          <h1>Your AI Dispatcher That<span> Books Loads, Calls Brokers, and Gets You Paid.</span></h1>
          <p className='landing-sub'>Qivori handles everything \u2014 finding loads, calling brokers with voice AI, negotiating rates, sending carrier packets, invoicing, and settlements. One platform. One price.</p>
          <div className='landing-hero-actions'>
            <button className='btn btn-primary' style={{padding:'12px 32px',fontSize:14}} onClick={goSignup}>Start 14-Day Free Trial</button>
            <span style={{fontSize:13,color:'var(--muted)'}}>No credit card required</span>
          </div>
          <div className='landing-stats-grid'>
            {STATS.map(item => (<div key={item.label} className='landing-stat-card'><div className='landing-stat-value'>{item.value}</div><div className='landing-stat-label'>{item.label}</div></div>))}
          </div>
        </section>

        <section style={{maxWidth:520,margin:'0 auto 60px',padding:'0 24px'}} id='pricing'>
          <h2 style={{textAlign:'center',fontSize:28,marginBottom:8}}>Simple Pricing. Everything Included.</h2>
          <p style={{textAlign:'center',color:'var(--muted)',marginBottom:32,fontSize:15}}>One plan. Every feature. No upsells.</p>
          <div className='panel' style={{padding:32,border:'1px solid var(--accent)',borderRadius:16,position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:'linear-gradient(90deg,var(--accent),var(--accent4))'}} />
            <div style={{display:'inline-block',background:'var(--accent)',color:'#000',fontSize:11,fontWeight:700,padding:'4px 12px',borderRadius:20,marginBottom:16}}>{founderSpots > 0 ? 'FOUNDER PRICING' : 'STANDARD'}</div>
            <div style={{display:'flex',alignItems:'baseline',gap:2,marginBottom:20}}>
              <span style={{fontSize:24,fontWeight:600,color:'var(--accent)'}}>$</span>
              <span style={{fontSize:56,fontWeight:800,lineHeight:1,fontFamily:"'JetBrains Mono',monospace"}}>{founderSpots > 0 ? '399' : '549'}</span>
              <span style={{fontSize:15,color:'var(--muted)',marginLeft:4}}>/truck/month</span>
            </div>
            {founderSpots > 0 && founderSpots < 100 && (
              <div style={{background:'var(--surface2)',borderRadius:10,padding:14,marginBottom:20}}>
                <div style={{fontSize:13,marginBottom:8}}><span style={{color:'var(--accent)'}}>{founderSpots} of 100</span> founder spots remaining at $399/truck</div>
                <div style={{width:'100%',height:6,background:'var(--surface3)',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',background:'linear-gradient(90deg,var(--accent),var(--accent4))',borderRadius:3,width:pct+'%'}} /></div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Founders lock in $399/truck forever</div>
              </div>
            )}
            {['AI Voice Broker Calling','Smart Load Matching from DAT & 123Loadboard','Rate Negotiation with Driver Approval','Automated Check Calls','Auto Invoice on POD Upload','Auto Settlement on Payment','Carrier Packet Auto-Send','Factoring Integration (OTR, RTS, Triumph, TCI, Riviera)','Insurance Expiry Alerts','Rate Confirmation Email','Driver SMS + Push Notifications','Admin Dashboard','14-Day Free Trial'].map(f => (
              <div key={f} style={{padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:13,display:'flex',alignItems:'center',gap:8}}><span style={{color:'var(--success)',fontWeight:700}}>\u2713</span>{f}</div>
            ))}
            <button className='btn btn-primary' style={{width:'100%',marginTop:16,padding:'14px 0',fontSize:15}} onClick={goSignup}>Start Free Trial \u2014 $0 for 14 Days</button>
          </div>
        </section>

        <section className='landing-values'>
          {FEATURES.map(item => (<article key={item.title} className='landing-value-card'><div style={{fontSize:28,marginBottom:8}}>{item.icon}</div><h3>{item.title}</h3><p>{item.description}</p></article>))}
        </section>

        <section style={{textAlign:'center',padding:'40px 24px 60px'}}>
          <h2 style={{fontSize:22,marginBottom:12}}>Ready to automate your dispatch?</h2>
          <button className='btn btn-primary' style={{padding:'12px 32px'}} onClick={goSignup}>Start Free Trial</button>
        </section>
      </main>
      <footer style={{textAlign:'center',padding:20,borderTop:'1px solid var(--border)',fontSize:12,color:'var(--muted)'}}>&copy; 2026 Qivori Inc. | hello@qivori.com</footer>
    </div>
  )
}
