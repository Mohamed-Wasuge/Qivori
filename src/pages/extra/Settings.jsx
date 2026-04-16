import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { Globe, Shield, Bell, Users, CreditCard, Mail, Zap, Wrench, Bot, Search, Smartphone, Check } from 'lucide-react'
import { Ic } from './helpers'
import { PLAN_DISPLAY } from '../../hooks/useSubscription'

function ReferralPanel() {
  const { showToast } = useApp()
  const [referralData, setReferralData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { apiFetch } = await import('../../lib/api')
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

export function Settings() {
  const { showToast } = useApp()
  const [toggles, setToggles] = useState({
    autoApprove: false,
    emailNotifs: true,
    aiMatching: true,
    maintenance: false,
  })
  const [loading, setLoading] = useState(true)
  const [planCount, setPlanCount] = useState(0)

  useEffect(() => {
    (async () => {
      const [settingsRes, profilesRes] = await Promise.all([
        supabase.from('platform_settings').select('key, value'),
        supabase.from('profiles').select('subscription_status, plan').neq('plan', 'trial').neq('plan', 'owner'),
      ])
      if (!settingsRes.error && settingsRes.data) {
        const obj = {}
        settingsRes.data.forEach(r => { obj[r.key] = r.value === true || r.value === 'true' })
        setToggles(prev => ({ ...prev, ...obj }))
      }
      const paying = (profilesRes.data || []).filter(p => p.subscription_status === 'active' && p.plan)
      setPlanCount(paying.length)
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
              { name: 'Qivori AI', price: `Plans from $${PLAN_DISPLAY.tms_pro.price}/mo`, users: planCount + ' users', color: '#f0a500' },
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
              { icon: Mail, name: 'Resend', sub: 'Transactional email & notifications', connected: true },
              { icon: Bot, name: 'Claude AI', sub: 'Load matching & document OCR', connected: true },
              { icon: Search, name: 'FMCSA API', sub: 'MC/DOT carrier verification', connected: true },
              { icon: Smartphone, name: 'Twilio', sub: 'SMS & voice calling', connected: true },
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
