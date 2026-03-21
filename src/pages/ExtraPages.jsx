import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Settings as SettingsIcon, Smartphone, Wrench, Bot, Landmark, Search, Check, Globe, Shield, Bell, Users, CreditCard, Mail, Zap, Truck, ArrowRight, CheckCircle, SkipForward } from 'lucide-react'
import { apiFetch } from '../lib/api'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export function Onboarding() {
  const { navigatePage, showToast, user } = useApp()
  const [step, setStep] = useState(1)
  const [companyInfo, setCompanyInfo] = useState({ name: '', mc: '', dot: '', phone: '' })
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [lbCredentials, setLbCredentials] = useState({})
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)

  const STEPS = [
    { num: 1, label: 'Welcome' },
    { num: 2, label: 'Company Info' },
    { num: 3, label: 'Load Board' },
    { num: 4, label: 'Ready!' },
  ]

  const LB_OPTIONS = [
    { id: 'dat', name: 'DAT Load Board', desc: 'Premium freight marketplace', color: '#22c55e', fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client Secret' }] },
    { id: '123loadboard', name: '123Loadboard', desc: 'Affordable API access', color: '#3b82f6', fields: [{ key: 'apiKey', label: 'API Key' }] },
    { id: 'truckstop', name: 'Truckstop.com', desc: 'Full-service load board', color: '#f0a500', fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client Secret' }] },
  ]

  const connectLoadBoard = async () => {
    if (!selectedProvider) return
    setConnecting(true)
    try {
      const res = await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, credentials: lbCredentials }),
      })
      const data = await res.json()
      if (data.success && data.status === 'connected') {
        setConnected(true)
        showToast('success', 'Connected!', `${selectedProvider} is now linked to your account`)
      } else {
        showToast('error', 'Connection Failed', data.testResult?.message || data.error || 'Check your credentials')
      }
    } catch {
      showToast('error', 'Error', 'Could not connect. Try again later.')
    }
    setConnecting(false)
  }

  const saveCompanyInfo = async () => {
    if (!user?.id) return
    try {
      await supabase.from('companies').upsert({
        owner_id: user.id,
        name: companyInfo.name,
        mc_number: companyInfo.mc,
        dot_number: companyInfo.dot,
        phone: companyInfo.phone,
      }, { onConflict: 'owner_id' })
    } catch { /* company info save error */ }
    setStep(3)
  }

  const finishOnboarding = () => {
    localStorage.setItem('qv_onboarded', 'true')
    navigatePage('carrier-dashboard')
  }

  const selectedProv = LB_OPTIONS.find(p => p.id === selectedProvider)

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: step >= s.num ? 'var(--accent)' : 'var(--surface2)', border: '2px solid ' + (step >= s.num ? 'var(--accent)' : 'var(--border)'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: step >= s.num ? '#000' : 'var(--muted)', flexShrink: 0 }}>
              {step > s.num ? <Ic icon={Check} size={14} /> : s.num}
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: step > s.num ? 'var(--accent)' : 'var(--border)', margin: '0 4px' }} />}
          </div>
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, letterSpacing: 3 }}>Welcome to </span>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: 2, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>Q</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginLeft: 6, letterSpacing: 0.5, fontFamily: "'DM Sans',sans-serif" }}>by Qivori</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32, lineHeight: 1.7 }}>
            Let's get your account set up in 3 quick steps.<br />
            AI-powered load matching, fleet management, and compliance — all in one place.
          </div>
          <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: 14 }} onClick={() => setStep(2)}>
            Get Started <Ic icon={ArrowRight} size={16} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
          </button>
        </div>
      )}

      {/* Step 2: Company Info */}
      {step === 2 && (
        <>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, marginBottom: 4 }}>COMPANY INFO</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Tell us about your trucking operation</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { key: 'name', label: 'Company Name', ph: 'Your Trucking LLC' },
              { key: 'mc', label: 'MC Number', ph: 'MC-1234567' },
              { key: 'dot', label: 'DOT Number', ph: '1234567' },
              { key: 'phone', label: 'Phone', ph: '(555) 123-4567' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input value={companyInfo[f.key]} onChange={e => setCompanyInfo(c => ({ ...c, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={saveCompanyInfo}>
              Continue <Ic icon={ArrowRight} size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            </button>
          </div>
        </>
      )}

      {/* Step 3: Connect Load Board */}
      {step === 3 && (
        <>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, marginBottom: 4 }}>CONNECT YOUR LOAD BOARD</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            Already have DAT, 123Loadboard, or Truckstop? Connect it and let Qivori AI find loads for you automatically.
          </div>
          <div style={{ fontSize: 11, color: 'var(--accent3)', marginBottom: 20 }}>
            Your credentials are encrypted with AES-256 and never shared with anyone.
          </div>

          {/* Provider selection */}
          {!selectedProvider && !connected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {LB_OPTIONS.map(p => (
                <button key={p.id} onClick={() => setSelectedProvider(p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: "'DM Sans',sans-serif" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: p.color + '15', border: '1px solid ' + p.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ic icon={Truck} size={20} color={p.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.desc}</div>
                  </div>
                  <Ic icon={ArrowRight} size={16} color="var(--muted)" />
                </button>
              ))}
            </div>
          )}

          {/* Credential entry form */}
          {selectedProvider && !connected && selectedProv && (
            <div style={{ background: 'var(--surface)', border: '1px solid ' + selectedProv.color + '30', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Ic icon={Truck} size={18} color={selectedProv.color} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{selectedProv.name}</span>
                <button onClick={() => { setSelectedProvider(null); setLbCredentials({}) }}
                  style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                  Change
                </button>
              </div>
              {selectedProv.fields.map(f => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input type="password" value={lbCredentials[f.key] || ''} onChange={e => setLbCredentials(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={'Enter your ' + f.label}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <button className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 12 }}
                disabled={connecting || !selectedProv.fields.every(f => lbCredentials[f.key])}
                onClick={connectLoadBoard}>
                {connecting ? 'Connecting...' : 'Connect & Test'}
              </button>
            </div>
          )}

          {/* Connected success */}
          {connected && (
            <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
              <Ic icon={CheckCircle} size={36} color="#22c55e" />
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>{selectedProv?.name} Connected!</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Qivori AI will now search loads using your account.</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={() => setStep(4)}>
              {connected ? 'Continue' : 'Skip for Now'} <Ic icon={connected ? ArrowRight : SkipForward} size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            </button>
          </div>
          {!connected && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
              You can connect your load board anytime from Settings → Load Boards
            </div>
          )}
        </>
      )}

      {/* Step 4: All Done */}
      {step === 4 && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Ic icon={CheckCircle} size={32} color="#22c55e" />
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 2, marginBottom: 8 }}>
            YOU'RE ALL SET!
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32, lineHeight: 1.7 }}>
            Your Qivori AI dashboard is ready. Start finding loads,<br />
            managing your fleet, and growing your business.
          </div>
          <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: 14 }} onClick={finishOnboarding}>
            Go to Dashboard <Ic icon={ArrowRight} size={16} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
          </button>
        </div>
      )}
    </div>
  )
}

export function AIEngine() {
  const { navigatePage } = useApp()
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--muted)' }}>AI engine settings have moved to platform Settings.</div>
      <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigatePage('settings')}>Go to Settings →</button>
    </div>
  )
}

export function Settings() {
  const { showToast } = useApp()
  const [toggles, setToggles] = useState({
    autoApprove: false,
    emailNotifs: true,
    aiMatching: true,
    maintenance: false,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('platform_settings').select('key, value')
      if (!error && data) {
        const obj = {}
        data.forEach(r => { obj[r.key] = r.value === true || r.value === 'true' })
        setToggles(prev => ({ ...prev, ...obj }))
      }
      setLoading(false)
    })()
  }, [])

  const toggle = async (key, label) => {
    const newVal = !toggles[key]
    setToggles(prev => ({ ...prev, [key]: newVal }))
    showToast('', label, newVal ? 'Enabled' : 'Disabled')
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return
    const { error } = await supabase
      .from('platform_settings')
      .upsert({ owner_id: userId, key, value: String(newVal), updated_at: new Date().toISOString() }, { onConflict: 'owner_id,key' })
    if (error) showToast('', label, 'Failed to save setting')
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: 700 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, marginBottom: 20 }}>PLATFORM SETTINGS</div>

        {/* General */}
        <div className="panel fade-in" style={{ marginBottom: 16 }}>
          <div className="panel-header"><div className="panel-title"><Ic icon={Globe} size={14} /> General</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Platform Name</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Displayed to all users</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Qivori AI</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Domain</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Primary website URL</div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>qivori.com</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Support Email</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Where tickets are sent</div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>hello@qivori.com</span>
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="panel fade-in" style={{ marginBottom: 16 }}>
          <div className="panel-header"><div className="panel-title"><Ic icon={Zap} size={14} /> Feature Toggles</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { key: 'autoApprove', label: 'Auto-Approve New Users', sub: 'Skip manual approval for new carrier/broker signups', color: 'var(--accent)' },
              { key: 'emailNotifs', label: 'Email Notifications', sub: 'Send email alerts for signups, payments, and tickets', color: 'var(--success)' },
              { key: 'aiMatching', label: 'AI Load Matching', sub: 'Enable AI-powered load scoring and carrier matching', color: 'var(--accent3)' },
              { key: 'maintenance', label: 'Maintenance Mode', sub: 'Show maintenance page to all users (emergency only)', color: 'var(--danger)' },
            ].map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.sub}</div>
                </div>
                <div
                  style={{ width: 44, height: 24, background: toggles[t.key] ? t.color : 'var(--border)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                  onClick={() => toggle(t.key, t.label)}
                >
                  <div style={{ width: 18, height: 18, background: '#fff', borderRadius: '50%', position: 'absolute', top: 3, transition: 'left 0.2s', left: toggles[t.key] ? 23 : 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="panel fade-in" style={{ marginBottom: 16 }}>
          <div className="panel-header"><div className="panel-title"><Ic icon={CreditCard} size={14} /> Subscription Plans</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { name: 'Autonomous Fleet AI', price: '$399/truck/mo', users: '64 users', color: '#f0a500' },
            ].map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: p.color }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.users}</div>
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.price}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Referral Program */}
        <ReferralPanel />

        {/* Integrations */}
        <div className="panel fade-in">
          <div className="panel-header"><div className="panel-title"><Ic icon={Wrench} size={14} /> Integrations</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: CreditCard, name: 'Stripe', sub: 'Subscription billing & payouts', connected: true },
              { icon: Mail, name: 'SendGrid', sub: 'Transactional email & notifications', connected: true },
              { icon: Bot, name: 'Claude AI', sub: 'Load matching & document OCR', connected: true },
              { icon: Search, name: 'FMCSA API', sub: 'MC/DOT carrier verification', connected: true },
              { icon: Smartphone, name: 'Twilio', sub: 'SMS notifications to carriers', connected: false },
            ].map(int => (
              <div key={int.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                <Ic icon={int.icon} size={22} color="var(--muted)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{int.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{int.sub}</div>
                </div>
                {int.connected ? (
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', padding: '3px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>Connected <Ic icon={Check} size={10} /></span>
                ) : (
                  <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10 }}
                    onClick={() => showToast('', 'Connect ' + int.name, 'Opening integration setup...')}>Connect</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReferralPanel() {
  const { showToast } = useApp()
  const [referralData, setReferralData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { apiFetch } = await import('../lib/api')
        const res = await apiFetch('/api/referral')
        if (res.ok) setReferralData(await res.json())
      } catch { /* referral fetch error */ }
      setLoading(false)
    })()
  }, [])

  const copyLink = () => {
    if (referralData?.link) {
      navigator.clipboard.writeText(referralData.link).then(() => {
        showToast('', 'Link Copied!', referralData.link)
      })
    }
  }

  return (
    <div className="panel fade-in" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <div className="panel-title"><Ic icon={Users} size={14} /> Referral Program</div>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', padding: '3px 8px', borderRadius: 20 }}>Earn Free Months</span>
      </div>
      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>Loading referral data...</div>
        ) : referralData ? (
          <>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>YOUR REFERRAL LINK</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={referralData.link || ''} readOnly style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text)' }} />
                <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700 }} onClick={copyLink}>Copy</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Share this link. When someone signs up and pays, you get <strong style={{ color: 'var(--success)' }}>1 month free</strong>. They get <strong style={{ color: 'var(--accent)' }}>14 extra days</strong> on their trial.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Clicks', value: referralData.totalClicks || 0, color: 'var(--accent)' },
                { label: 'Signups', value: referralData.signups || 0, color: 'var(--accent2)' },
                { label: 'Paid', value: referralData.paid || 0, color: 'var(--success)' },
                { label: 'Rewards', value: referralData.rewardsEarned || 0, color: '#f0a500' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>Sign in to see your referral link</div>
        )}
      </div>
    </div>
  )
}
