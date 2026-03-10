import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { CheckCircle, Truck, Landmark, Zap, Smartphone, Bot, MapPin, Route, Star, DollarSign, Package, ClipboardList, FileText, FolderOpen, Eye, PartyPopper, Check, Wrench, Search } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export function Onboarding() {
  const { showToast, navigatePage } = useApp()
  const [step, setStep] = useState(1)

  const advance = (s) => {
    if (s === 1) showToast('', 'MC Verified!', 'FMCSA verification successful · Carrier status: Active')
    if (s === 2) showToast('', 'Equipment Saved', 'AI will now match loads to your truck & lanes')
    if (s === 3) showToast('', 'Bank Connected', 'FastPay enabled · You can now receive same-day payments')
    setStep(s + 1)
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 6 }}>CARRIER ONBOARDING</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Get set up in under 5 minutes. AI verifies your MC number instantly.</div>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
          {[1,2,3,4].map((n, i) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 'none' }}>
              <div className={'ob-step' + (step === n ? ' active' : step > n ? ' done' : '')}>
                {step > n ? '✓' : n}
              </div>
              {i < 3 && <div className={'ob-line' + (step > n ? ' done' : '')} />}
            </div>
          ))}
        </div>

        <div className="panel fade-in">
          {step === 1 && (
            <div>
              <div className="panel-header"><div className="panel-title">Step 1 of 4 — Company & MC Verification</div></div>
              <div style={{ padding: 20 }}>
                <div className="form-group"><label className="form-label">Company Name</label><input className="form-input" placeholder="e.g. R&J Transport LLC" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label className="form-label">MC Number</label><input className="form-input" placeholder="MC-XXXXXX" /></div>
                  <div className="form-group"><label className="form-label">DOT Number</label><input className="form-input" placeholder="DOT-XXXXXXX" /></div>
                </div>
                <div className="form-group"><label className="form-label">Phone Number</label><input className="form-input" type="tel" placeholder="+1 (555) 000-0000" /></div>
                <button className="btn btn-primary" style={{ width: '100%', padding: 13, fontSize: 14, justifyContent: 'center' }} onClick={() => advance(1)}>Verify with FMCSA → AI Check</button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <div className="panel-header"><div className="panel-title">Step 2 of 4 — Equipment & Lanes</div></div>
              <div style={{ padding: 20 }}>
                <div className="form-group"><label className="form-label">Equipment Type</label>
                  <select className="form-input"><option>Dry Van 53'</option><option>Dry Van 48'</option><option>Reefer 53'</option><option>Reefer 48'</option><option>Flatbed 48'</option><option>Step Deck</option><option>Box Truck 26'</option></select>
                </div>
                <div className="form-group"><label className="form-label">Home Base City</label><input className="form-input" placeholder="e.g. Atlanta, GA" /></div>
                <div className="form-group"><label className="form-label">Preferred Lanes</label><input className="form-input" placeholder="e.g. Atlanta, Chicago, Dallas, Miami" /></div>
                <div className="form-group"><label className="form-label">Max Deadhead Radius</label>
                  <select className="form-input"><option>100 miles</option><option>200 miles</option><option selected>300 miles</option><option>500 miles</option></select>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', padding: 13, fontSize: 14, justifyContent: 'center' }} onClick={() => advance(2)}>Save Equipment Info →</button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <div className="panel-header"><div className="panel-title">Step 3 of 4 — Payment Setup</div></div>
              <div style={{ padding: 20 }}>
                <div style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.08),rgba(0,212,170,0.04))', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Zap} size={14} /> Qivori FastPay Available</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Get paid within 24 hours of delivery. 2.5% flat fee. No hidden charges.</div>
                </div>
                <div className="form-group"><label className="form-label">Bank Name</label><input className="form-input" placeholder="e.g. Chase Bank" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label className="form-label">Routing Number</label><input className="form-input" placeholder="9 digits" /></div>
                  <div className="form-group"><label className="form-label">Account Number</label><input className="form-input" placeholder="Account number" /></div>
                </div>
                <div className="form-group"><label className="form-label">Payment Preference</label>
                  <select className="form-input"><option>Same Day Pay (2.5% fee · 24hrs)</option><option>Standard ACH (1.5% fee · 2-3 days)</option><option>Wait for Shipper (0% fee · Net 30)</option></select>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', padding: 13, fontSize: 14, justifyContent: 'center' }} onClick={() => advance(3)}>Save Payment Info →</button>
              </div>
            </div>
          )}
          {step === 4 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 56, marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Ic icon={PartyPopper} size={56} /></div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 2, color: 'var(--success)', marginBottom: 8 }}>YOU'RE LIVE ON QIVORI!</div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>Your carrier profile is active. AI will now match you to loads and send SMS alerts to your phone.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
                {[[Smartphone, 'SMS Alerts'], [Bot, 'AI Matching'], [Zap, 'FastPay']].map(([IconComp, label]) => (
                  <div key={label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 20, marginBottom: 6, display: 'flex', justifyContent: 'center' }}><Ic icon={IconComp} size={20} /></div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>Active <Ic icon={Check} size={11} /></div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ padding: '14px 32px', fontSize: 14 }} onClick={() => navigatePage('carriers')}>View Carrier Network →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AIEngine() {
  const { showToast } = useApp()
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Match Rate', value: '94%', change: '↑ 2% this week', type: 'up', color: 'var(--success)' },
          { label: 'Avg Match Time', value: '4.2m', change: '↓ 1.8m faster', type: 'up', color: 'var(--accent)' },
          { label: 'Auto-Confirmed', value: '61%', change: 'No human needed', type: 'neutral', color: 'var(--accent2)' },
          { label: 'SMS Sent Today', value: '284', change: '38 loads matched', type: 'up', color: 'var(--accent3)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className={'stat-change ' + s.type}>{s.change}</div>
          </div>
        ))}
      </div>
      <div className="grid2 fade-in">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Zap} size={14} /> Signal Weights</div>
            <button className="btn btn-ghost" onClick={() => showToast('', 'AI Weights Updated', 'Model retrained with latest acceptance data')}>Retrain Model</button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { labelIcon: MapPin, labelText: 'Location Proximity', pct: 28, color: 'var(--accent)' },
              { labelIcon: Route, labelText: 'Lane History', pct: 24, color: 'var(--accent2)' },
              { labelIcon: Star, labelText: 'Carrier Rating', pct: 18, color: 'var(--success)' },
              { labelIcon: Truck, labelText: 'Equipment Match', pct: 16, color: 'var(--accent3)' },
              { labelIcon: DollarSign, labelText: 'Rate Compatibility', pct: 14, color: 'var(--accent4)' },
            ].map(w => (
              <div key={w.labelText}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={w.labelIcon} size={14} /> {w.labelText}</span>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: w.color }}>{w.pct}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                  <div style={{ width: w.pct + '%', height: '100%', background: w.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><div className="panel-title"><span className="live-dot" /> Live Match Feed</div></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { score: 97, scoreColor: 'var(--success)', name: 'R&J Transport ↔ ATL→CHI', sub: 'Same city · 14x lane history · 4.9 rating', action: 'Send', onClick: ',SMS Sent!,Offer sent to R&J Transport' },
              { score: 96, scoreColor: 'var(--success)', name: 'Express Carriers ↔ MEM→NYC', sub: 'Lane expert · $5,100 rate history · Fast pay', action: 'Send', onClick: ',SMS Sent!,Offer sent to Express Carriers' },
              { score: 84, scoreColor: 'var(--accent)', name: 'Blue Line Freight ↔ PHX→LAX', sub: 'Flatbed certified · 180mi deadhead', action: 'Review', onClick: ',Reviewing,Score 84 · Manual review recommended' },
            ].map(m => (
              <div key={m.name} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseOut={e => e.currentTarget.style.background = ''}
                onClick={() => showToast('', 'Match', m.name)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 8,
                    background: m.scoreColor + '14', border: '1px solid ' + m.scoreColor + '33',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: m.scoreColor
                  }}>{m.score}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.sub}</div>
                  </div>
                  <button
                    className={m.action === 'Send' ? 'btn btn-success' : 'btn btn-ghost'}
                    style={{ padding: '5px 10px', fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); const [i,t,s] = m.onClick.split(','); showToast(i,t,s) }}
                  >{m.action}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Settings() {
  const { showToast } = useApp()
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: 700 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, marginBottom: 20 }}>PLATFORM SETTINGS</div>
        <div className="panel fade-in" style={{ marginBottom: 16 }}>
          <div className="panel-header"><div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Smartphone} size={14} /> SMS & Notifications</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'AI SMS Load Matching', sub: 'Auto-text carriers when loads are posted', color: 'var(--accent)', msg: ',SMS Matching,AI SMS matching is active for all loads' },
              { label: 'Auto-Factor Invoices', sub: 'FastPay on all new invoices automatically', color: 'var(--success)', msg: ',Auto-Factor,All new invoices will be factored automatically' },
              { label: 'Auto-Confirm High Score Matches', sub: 'Auto-book loads when AI score ≥ 90', color: 'var(--accent3)', msg: ',Auto-Confirm,Loads with 90+ AI score will auto-book' },
            ].map(toggle => (
              <div key={toggle.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{toggle.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{toggle.sub}</div>
                </div>
                <div
                  style={{ width: 44, height: 24, background: toggle.color, borderRadius: 12, cursor: 'pointer', position: 'relative' }}
                  onClick={() => { const [i,t,s] = toggle.msg.split(','); showToast(i,t,s) }}
                >
                  <div style={{ width: 18, height: 18, background: '#fff', borderRadius: '50%', position: 'absolute', right: 3, top: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel fade-in">
          <div className="panel-header"><div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Wrench} size={14} /> Integrations</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: Smartphone, name: 'Twilio SMS', sub: 'Powers carrier text notifications' },
              { icon: Landmark, name: 'Stripe Payments', sub: 'Invoice & payout processing' },
              { icon: Search, name: 'FMCSA Verification', sub: 'Real-time MC/DOT number validation' },
              { icon: Bot, name: 'OpenAI / Claude AI', sub: 'Document OCR + rate intelligence' },
            ].map(int => (
              <div key={int.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={int.icon} size={24} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{int.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{int.sub}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', padding: '3px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>Connected <Ic icon={Check} size={10} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

