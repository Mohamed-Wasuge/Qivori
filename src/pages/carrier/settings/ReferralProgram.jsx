import React, { useState, useEffect } from 'react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { apiFetch } from '../../../lib/api'
import {
  Send, RefreshCw, Trophy, UserPlus, CreditCard, Zap, Star, Users, Phone, MessageCircle, Check,
} from 'lucide-react'

// ─── REFERRAL PROGRAM ─────────────────────────────────────────────────────────
const REFERRAL_TIERS = [
  { id: 'bronze',  label: 'Bronze',  min: 0,  max: 2,  color: '#cd7f32', monthsPerSignup: 1, perks: ['1 free month per signup'] },
  { id: 'silver',  label: 'Silver',  min: 3,  max: 5,  color: '#c0c0c0', monthsPerSignup: 1, perks: ['1 free month per signup', 'Priority support'] },
  { id: 'gold',    label: 'Gold',    min: 6,  max: 10, color: '#f0a500', monthsPerSignup: 2, perks: ['2 free months per signup', 'Priority support'] },
  { id: 'diamond', label: 'Diamond', min: 11, max: 999, color: '#4d8ef0', monthsPerSignup: 2, perks: ['2 free months per signup', 'Priority support', 'Featured carrier badge'] },
]

function getReferralTier(signups) {
  return REFERRAL_TIERS.find(t => signups >= t.min && signups <= t.max) || REFERRAL_TIERS[0]
}
function getNextReferralTier(signups) {
  const current = getReferralTier(signups)
  const idx = REFERRAL_TIERS.indexOf(current)
  return idx < REFERRAL_TIERS.length - 1 ? REFERRAL_TIERS[idx + 1] : null
}

export function ReferralProgram() {
  const { showToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [referralData, setReferralData] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // Load referral data from API
  useEffect(() => {
    let cancelled = false
    async function loadData() {
      try {
        const res = await apiFetch('/api/referral-stats')
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        if (!cancelled) setReferralData(data)
      } catch {
        // Fallback: try the basic referral endpoint
        try {
          const res = await apiFetch('/api/referral')
          if (res.ok) {
            const data = await res.json()
            if (!cancelled) setReferralData({
              code: data.code,
              link: data.link,
              stats: { totalSent: data.totalReferrals, signups: data.signups, paid: data.paid, pending: data.totalReferrals - data.signups, totalClicks: data.totalClicks, rewardsEarned: data.rewardsEarned },
              tier: { current: getReferralTier(data.signups), next: getNextReferralTier(data.signups), referralsToNextTier: (getNextReferralTier(data.signups)?.min || 0) - data.signups },
              leaderboard: [],
              userRank: null,
              referrals: data.referrals || [],
              rewards: [],
            })
          }
        } catch { /* referral data unavailable */ }
      }
      if (!cancelled) setLoading(false)
    }
    loadData()
    return () => { cancelled = true }
  }, [])

  const referralCode = referralData?.code || ''
  const referralLink = referralData?.link || `https://qivori.com/ref/${referralCode}`
  const stats = referralData?.stats || { totalSent: 0, signups: 0, paid: 0, pending: 0, totalClicks: 0, rewardsEarned: 0 }
  const tierInfo = referralData?.tier || { current: REFERRAL_TIERS[0], next: REFERRAL_TIERS[1], referralsToNextTier: 3 }
  const currentTier = tierInfo.current || REFERRAL_TIERS[0]
  const nextTier = tierInfo.next
  const referrals = referralData?.referrals || []
  const leaderboard = referralData?.leaderboard || []

  const copyLink = () => {
    navigator.clipboard?.writeText(referralLink)
    setCopied(true)
    showToast('success', 'Copied!', 'Referral link copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const sendInvite = async () => {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      showToast('error', 'Invalid Email', 'Please enter a valid email address')
      return
    }
    setSending(true)
    try {
      // Send email via existing endpoint
      await apiFetch('/api/send-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: inviteEmail, referralCode, referralLink }),
      })
      // Also track it as a referral
      await apiFetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signup', referralCode, email: inviteEmail }),
      }).catch(() => {})
      showToast('success', 'Invite Sent!', `Referral email sent to ${inviteEmail}`)
      // Add to local state
      setReferralData(prev => prev ? {
        ...prev,
        stats: { ...prev.stats, totalSent: prev.stats.totalSent + 1, pending: prev.stats.pending + 1 },
        referrals: [{ id: 'local-' + Date.now(), email: inviteEmail, status: 'pending', clicks: 0, reward_applied: false, reward_months: 0, created_at: new Date().toISOString() }, ...prev.referrals],
      } : prev)
      setInviteEmail('')
    } catch {
      showToast('error', 'Error', 'Failed to send invite')
    }
    setSending(false)
  }

  const fmtDate = (d) => {
    if (!d) return '-'
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return d }
  }

  const statusLabel = (s) => {
    const map = { pending: 'Pending', clicked: 'Clicked', signed_up: 'Signed Up', paid: 'Subscribed', rewarded: 'Rewarded' }
    return map[s] || s
  }
  const statusColor = (s) => {
    const map = { pending: 'var(--muted)', clicked: 'var(--accent2)', signed_up: 'var(--accent)', paid: 'var(--success)', rewarded: 'var(--success)' }
    return map[s] || 'var(--muted)'
  }

  // Progress bar toward next tier
  const tierProgress = (() => {
    if (!nextTier) return 100
    const currentMin = currentTier.min
    const nextMin = nextTier.min
    const range = nextMin - currentMin
    if (range <= 0) return 100
    return Math.min(100, Math.round(((stats.signups - currentMin) / range) * 100))
  })()

  if (loading) {
    return (
      <div style={S.page}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, gap:12 }}>
          <RefreshCw size={18} style={{ animation:'spin 1s linear infinite', color:'var(--accent)' }} />
          <span style={{ color:'var(--muted)', fontSize:13 }}>Loading referral data...</span>
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>REFERRAL PROGRAM</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Invite drivers, earn free months</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ background: currentTier.color + '20', border: `1px solid ${currentTier.color}40`, borderRadius: 10, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={14} color={currentTier.color} />
            <span style={{ fontSize: 12, fontWeight: 700, color: currentTier.color, letterSpacing: 1 }}>{currentTier.label.toUpperCase()}</span>
          </div>
          {referralData?.userRank && (
            <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px' }}>
              Rank #{referralData.userRank}
            </div>
          )}
        </div>
      </div>

      {/* Hero Banner */}
      <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.12), rgba(77,142,240,0.08))', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, padding:'24px', textAlign:'center' }}>
        <div style={{ marginBottom:8 }}><Trophy size={40} color="var(--accent)" /></div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:3, marginBottom:6 }}>
          REFER A DRIVER, GET A <span style={{ color:'var(--accent)' }}>FREE MONTH</span>
        </div>
        <div style={{ fontSize:13, color:'var(--muted)', maxWidth:480, margin:'0 auto', lineHeight:1.6 }}>
          When your referral subscribes to any Qivori plan, you both get rewarded. The more you refer, the higher your tier and rewards.
        </div>
      </div>

      {/* Stats Cards */}
      <div style={S.grid(4)}>
        <StatCard label="Referrals Sent" value={String(stats.totalSent)} change={`${stats.totalClicks} link clicks`} color="var(--accent)" changeType="neutral" />
        <StatCard label="Signups" value={String(stats.signups)} change={stats.paid > 0 ? `${stats.paid} subscribed` : 'From your referrals'} color="var(--success)" changeType={stats.signups > 0 ? 'up' : 'neutral'} />
        <StatCard label="Rewards Earned" value={`${stats.rewardsEarned} mo`} change={`$${stats.rewardsEarned * 49} saved`} color="var(--accent2)" changeType={stats.rewardsEarned > 0 ? 'up' : 'neutral'} />
        <StatCard label="Pending" value={String(stats.pending)} change="Awaiting signup" color="var(--muted)" changeType="neutral" />
      </div>

      {/* Tier Progress */}
      <div style={S.panel}>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: currentTier.color + '15', border: `1px solid ${currentTier.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trophy size={18} color={currentTier.color} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  <span style={{ color: currentTier.color }}>{currentTier.label}</span> Tier
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {currentTier.perks.join(' + ')}
                </div>
              </div>
            </div>
            {nextTier && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: nextTier.color }}>
                  Next: {nextTier.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {tierInfo.referralsToNextTier} more referral{tierInfo.referralsToNextTier !== 1 ? 's' : ''} needed
                </div>
              </div>
            )}
          </div>
          {/* Progress bar */}
          <div style={{ position: 'relative', height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${tierProgress}%`, background: `linear-gradient(90deg, ${currentTier.color}, ${nextTier?.color || currentTier.color})`, borderRadius: 4, transition: 'width 0.6s ease' }} />
          </div>
          {/* All tiers */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {REFERRAL_TIERS.map(t => {
              const isActive = t.id === currentTier.id
              return (
                <div key={t.id} style={{ flex: 1, background: isActive ? t.color + '12' : 'var(--surface2)', border: `1px solid ${isActive ? t.color + '40' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: t.color, letterSpacing: 1, marginBottom: 4 }}>{t.label.toUpperCase()}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.min}-{t.max > 100 ? '...' : t.max} referrals</div>
                  <div style={{ fontSize: 10, color: isActive ? t.color : 'var(--muted)', marginTop: 4, fontWeight: 600 }}>
                    {t.monthsPerSignup} mo/signup
                  </div>
                  {isActive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.color, margin: '6px auto 0' }} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, alignSelf: 'flex-start' }}>
        {[
          { id: 'overview', label: 'Share & Invite' },
          { id: 'history', label: 'Referral History' },
          { id: 'leaderboard', label: 'Leaderboard' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500, borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
              color: activeTab === tab.id ? '#000' : 'var(--muted)' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Share & Invite Tab ─── */}
      {activeTab === 'overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* Share Section */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Send} /> Share Your Link</div>
            </div>
            <div style={{ padding:20 }}>
              {/* Referral Code Display */}
              <div style={{ background: 'var(--surface2)', border: '1px dashed var(--accent)', borderRadius: 10, padding: '12px 16px', textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>YOUR CODE</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 800, color: 'var(--accent)', letterSpacing: 3 }}>{referralCode}</div>
              </div>

              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8, fontWeight:600 }}>Your Referral Link</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input readOnly value={referralLink} style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', color:'var(--text)', fontSize:12, fontFamily:'monospace' }} />
                  <button onClick={copyLink} style={{ padding:'10px 16px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                    background: copied ? 'rgba(34,197,94,0.15)' : 'var(--accent)', color: copied ? 'var(--success)' : '#000' }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8, fontWeight:600 }}>Send Email Invite</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="driver@company.com"
                    onKeyDown={e => e.key === 'Enter' && sendInvite()}
                    style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
                  <button onClick={sendInvite} disabled={sending}
                    style={{ padding:'10px 20px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", background:'var(--accent2)', color:'#fff', opacity:sending?0.7:1 }}>
                    {sending ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </div>

              {/* Share buttons */}
              <div style={{ display:'flex', gap:8, marginTop:16 }}>
                {[
                  { label:'Copy Link', icon:Check, action: copyLink },
                  { label:'SMS', icon:Phone, action: () => { window.open(`sms:?body=Check out Qivori AI for trucking! ${referralLink}`); showToast('','SMS','Opening messages...') }},
                  { label:'WhatsApp', icon:MessageCircle, action: () => { window.open(`https://wa.me/?text=Check out Qivori AI for trucking! Use my code: ${referralCode} ${referralLink}`); showToast('','WhatsApp','Opening WhatsApp...') }},
                  { label:'Email', icon:Send, action: () => { window.open(`mailto:?subject=Try Qivori AI for Trucking&body=Hey! Check out Qivori AI, the best TMS for trucking. Use my referral code: ${referralCode}%0A%0A${referralLink}`); showToast('','Email','Opening email...') }},
                ].map(s => (
                  <button key={s.label} onClick={s.action} className="btn btn-ghost" style={{ flex:1, fontSize:11, justifyContent:'center', gap:5, padding:'8px 6px' }}>
                    <Ic icon={s.icon} size={13} /> {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* How It Works + Rewards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Zap} /> How It Works</div>
              </div>
              <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  { step:1, icon:Send, title:'Share Your Link', desc:'Send via SMS, email, WhatsApp, or word of mouth' },
                  { step:2, icon:UserPlus, title:'They Sign Up', desc:'Your friend creates a free Qivori account' },
                  { step:3, icon:CreditCard, title:'They Subscribe', desc:'When they pick a paid plan, rewards trigger' },
                  { step:4, icon:Trophy, title:'You Both Win', desc:`You get ${currentTier.monthsPerSignup} free month${currentTier.monthsPerSignup > 1 ? 's' : ''}, they get 1 free month` },
                ].map(s => (
                  <div key={s.step} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:`rgba(240,165,0,${0.06 + s.step*0.03})`, border:'1px solid rgba(240,165,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, fontWeight:800, color:'var(--accent)' }}>
                      {s.step}
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, marginBottom:1 }}>{s.title}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rewards explanation */}
            <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(240,165,0,0.06))', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Star size={14} /> Rewards Breakdown
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
                <strong>Both you and your friend</strong> get rewarded when they subscribe.
                You earn <strong style={{ color: 'var(--accent)' }}>{currentTier.monthsPerSignup} free month{currentTier.monthsPerSignup > 1 ? 's' : ''}</strong> per successful referral at your current tier.
                {nextTier && (
                  <> Reach <strong style={{ color: nextTier.color }}>{nextTier.label}</strong> tier ({nextTier.min}+ referrals) to unlock {nextTier.monthsPerSignup} months per referral{nextTier.perks.length > 1 ? ` + ${nextTier.perks.slice(1).join(', ')}` : ''}.</>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Referral History Tab ─── */}
      {activeTab === 'history' && (
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Users} /> Referral History</div>
            <span style={{ fontSize:11, color:'var(--muted)' }}>{referrals.length} total</span>
          </div>
          {referrals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <UserPlus size={32} color="var(--muted)" style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>No referrals yet</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', opacity: 0.7 }}>Share your link to start earning free months</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    {['Date', 'Email', 'Status', 'Clicks', 'Reward'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((r, i) => (
                    <tr key={r.id || i}>
                      <td style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{r.email || '-'}</td>
                      <td>
                        <span style={S.tag(statusColor(r.status))}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, textAlign: 'center' }}>{r.clicks || 0}</td>
                      <td>
                        {r.reward_applied ? (
                          <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 12 }}>
                            +{r.reward_months || 1} month{(r.reward_months || 1) > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {r.status === 'pending' || r.status === 'clicked' ? 'Pending' : 'Processing'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Leaderboard Tab ─── */}
      {activeTab === 'leaderboard' && (
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Trophy} /> Top Referrers</div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Community leaderboard</span>
          </div>
          {leaderboard.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Trophy size={32} color="var(--muted)" style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Leaderboard is empty</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', opacity: 0.7 }}>Be the first to refer and claim the top spot</div>
            </div>
          ) : (
            <div>
              {leaderboard.map((entry, i) => {
                const tier = getReferralTier(entry.signups)
                const isTop3 = entry.rank <= 3
                const rankColors = ['#f0a500', '#c0c0c0', '#cd7f32']
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
                    borderBottom: '1px solid var(--border)',
                    background: entry.isYou ? 'rgba(240,165,0,0.06)' : 'transparent',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: isTop3 ? rankColors[entry.rank - 1] + '20' : 'var(--surface2)',
                      border: `1px solid ${isTop3 ? rankColors[entry.rank - 1] + '40' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                      color: isTop3 ? rankColors[entry.rank - 1] : 'var(--muted)',
                    }}>
                      {entry.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {entry.name} {entry.isYou && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>(You)</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{entry.signups} successful referral{entry.signups !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                      background: tier.color + '15', color: tier.color, border: `1px solid ${tier.color}30`,
                    }}>
                      {entry.tier}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
