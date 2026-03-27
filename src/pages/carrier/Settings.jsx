import React, { useState, useEffect } from 'react'
import { Ic, S, StatCard } from './shared'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import {
  Briefcase, Shield, FileText, Check, Send, RefreshCw, Trophy, UserPlus, CreditCard, Zap, Star, Users, Phone, MessageCircle, Package, DollarSign, Clock, Target, Bell, CheckCircle, Upload, Camera,
} from 'lucide-react'
import { uploadFile } from '../../lib/storage'

// ─── CARRIER PACKAGE ──────────────────────────────────────────────────────────
export function CarrierPackage() {
  const { showToast } = useApp()
  const { company, updateCompany } = useCarrier()
  const [tab, setTab] = useState('overview')
  const [logoUploading, setLogoUploading] = useState(false)

  const handleLogoUpload = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > 2 * 1024 * 1024) { showToast('error', 'Too Large', 'Logo must be under 2MB'); return }
      setLogoUploading(true)
      try {
        const result = await uploadFile(file, 'logos')
        await updateCompany({ logo: result.url })
        showToast('success', 'Logo Updated', 'Your company logo has been saved')
      } catch (err) {
        showToast('error', 'Upload Failed', err.message || 'Could not upload logo')
      }
      setLogoUploading(false)
    }
    input.click()
  }

  const [insurance, setInsurance] = useState({
    auto:    { company:'\u2014', policy:'\u2014', amount:'\u2014', expiry:'\u2014' },
    cargo:   { company:'\u2014', policy:'\u2014', amount:'\u2014', expiry:'\u2014' },
    general: { company:'\u2014', policy:'\u2014', amount:'\u2014', expiry:'\u2014' },
  })
  const [docs, setDocs] = useState({
    w9:        { uploaded:true,  filename:'Swift-Carriers-W9.pdf' },
    authority: { uploaded:true,  filename:'MC-294810-Authority.pdf' },
    boc3:      { uploaded:true,  filename:'BOC3-Swift-Carriers.pdf' },
    drug:      { uploaded:false, filename:'' },
  })
  const [brokerEmail, setBrokerEmail] = useState('')
  const [pkgSent, setPkgSent] = useState({})
  const [linkCopied, setLinkCopied] = useState(false)

  const INS = [
    { key:'auto',    label:'Auto Liability',    required:true  },
    { key:'cargo',   label:'Cargo Insurance',   required:true  },
    { key:'general', label:'General Liability', required:false },
  ]
  const DOCS = [
    { key:'w9',        label:'W-9 Tax Form',          required:true  },
    { key:'authority', label:'Operating Authority',   required:true  },
    { key:'boc3',      label:'BOC-3 Process Agent',   required:true  },
    { key:'drug',      label:'Drug & Alcohol Policy', required:false },
  ]

  const linkUrl = 'https://pkg.qivori.com/c/' + (company?.mc||'').replace('MC-','')
  const doneCount = INS.filter(f=>f.required&&insurance[f.key]?.policy).length + DOCS.filter(f=>f.required&&docs[f.key]?.uploaded).length
  const totalReq  = INS.filter(f=>f.required).length + DOCS.filter(f=>f.required).length
  const pct = Math.round((doneCount/totalReq)*100)
  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>CARRIER PACKAGE</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Your broker contracting packet — {pct}% complete</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:120, height:6, borderRadius:3, background:'var(--surface3)' }}>
            <div style={{ height:6, borderRadius:3, width:pct+'%', background:pct===100?'var(--success)':'var(--accent)', transition:'width 0.4s' }} />
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:pct===100?'var(--success)':'var(--accent)' }}>{pct}%</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:6 }}>
        {[
          { id:'overview', label:'Overview' },
          { id:'insurance', label:'Insurance' },
          { id:'documents', label:'Documents' },
          { id:'send', label:'Send to Broker' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="btn" style={{
            background: tab===t.id ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
            color: tab===t.id ? 'var(--accent)' : 'var(--muted)',
            border: `1px solid ${tab===t.id ? 'rgba(240,165,0,0.35)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Company Card */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Briefcase} /> Company Profile</div>
              <span style={S.badge(pct===100?'var(--success)':'var(--accent)')}>{pct===100?'Ready to Send':'In Progress'}</span>
            </div>
            <div style={{ padding:20, display:'flex', alignItems:'center', gap:20 }}>
              <div style={{ position:'relative', width:56, height:56, flexShrink:0 }}>
                <div style={{ width:56, height:56, borderRadius:12, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                  {company?.logo
                    ? <img src={company.logo} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain', borderRadius:12 }} />
                    : <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--accent)' }}>
                        {(company?.name || 'SC').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                      </span>
                  }
                </div>
                <button onClick={handleLogoUpload} disabled={logoUploading}
                  style={{ position:'absolute', bottom:-4, right:-4, width:22, height:22, borderRadius:'50%', background:'var(--accent)', border:'2px solid var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0 }}
                  title="Upload company logo">
                  <Camera size={10} color="#000" />
                </button>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>{company?.name || 'Your Company'}</div>
                <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--muted)' }}>
                  <span>{company?.mc||''}</span>
                  <span>{company?.dot||''}</span>
                  <span>{company?.phone || '(612) 555-0182'}</span>
                </div>
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}><Check size={12} /> Authority Active</span>
            </div>
          </div>

          {/* Status Summary */}
          <div style={S.grid(2)}>
            {/* Insurance Status */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Shield} /> Insurance</div>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setTab('insurance')}>Edit →</button>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
                {INS.map(f => (
                  <div key={f.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--surface2)', borderRadius:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{f.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{insurance[f.key]?.company || 'Not set'}</div>
                    </div>
                    <span style={S.tag(insurance[f.key]?.policy ? 'var(--success)' : 'var(--danger)')}>
                      {insurance[f.key]?.policy ? 'On File' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Documents Status */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={FileText} /> Documents</div>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setTab('documents')}>Edit →</button>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
                {DOCS.map(f => (
                  <div key={f.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--surface2)', borderRadius:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{f.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{docs[f.key]?.uploaded ? docs[f.key].filename : 'Not uploaded'}</div>
                    </div>
                    <span style={S.tag(docs[f.key]?.uploaded ? 'var(--success)' : 'var(--danger)')}>
                      {docs[f.key]?.uploaded ? 'Uploaded' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INSURANCE TAB */}
      {tab === 'insurance' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {INS.map(f => {
            const ins = insurance[f.key]
            return (
              <div key={f.key} style={S.panel}>
                <div style={S.panelHead}>
                  <div style={S.panelTitle}>
                    {f.label}
                    {f.required && <span style={{ fontSize:10, color:'var(--danger)', marginLeft:6 }}>Required</span>}
                  </div>
                  <span style={S.tag(ins?.policy ? 'var(--success)' : 'var(--danger)')}>
                    {ins?.policy ? 'On File' : 'Missing'}
                  </span>
                </div>
                <div style={{ padding:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { key:'company', label:'Insurance Company', ph:'Progressive Commercial' },
                    { key:'policy',  label:'Policy Number',     ph:'PCT-8821047' },
                    { key:'amount',  label:'Coverage Amount',   ph:'$1,000,000' },
                    { key:'expiry',  label:'Expiry Date',       ph:'Nov 15, 2026' },
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:4 }}>{field.label}</label>
                      <input value={(ins && ins[field.key]) || ''} placeholder={field.ph}
                        onChange={e => setInsurance(prev => ({ ...prev, [f.key]: { ...prev[f.key], [field.key]: e.target.value } }))}
                        style={inp} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {tab === 'documents' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {DOCS.map(f => (
            <div key={f.key} style={{ ...S.panel, padding:'14px 18px', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>
                  {f.label}
                  {f.required && <span style={{ fontSize:10, color:'var(--danger)', marginLeft:8 }}>Required</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                  {docs[f.key]?.uploaded ? docs[f.key].filename : 'No file uploaded — PDF, DOC accepted'}
                </div>
              </div>
              {docs[f.key]?.uploaded ? (
                <div style={{ display:'flex', gap:8 }}>
                  <span style={S.tag('var(--success)')}><Check size={11} /> On File</span>
                  <label style={{ padding:'5px 12px', fontSize:11, fontWeight:700, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Replace
                    <input type="file" accept=".pdf,.doc,.docx" style={{ display:'none' }}
                      onChange={e => { if (e.target.files?.[0]) { const name = e.target.files[0].name; setDocs(d => ({ ...d, [f.key]: { uploaded:true, filename:name } })); showToast('', f.label+' Updated', name) } }} />
                  </label>
                </div>
              ) : (
                <label style={{ padding:'8px 18px', fontSize:12, fontWeight:700, borderRadius:8, background:'var(--accent)', color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Upload
                  <input type="file" accept=".pdf,.doc,.docx" style={{ display:'none' }}
                    onChange={e => { if (e.target.files?.[0]) { const name = e.target.files[0].name; setDocs(d => ({ ...d, [f.key]: { uploaded:true, filename:name } })); showToast('', f.label+' Uploaded', name) } }} />
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SEND TAB */}
      {tab === 'send' && (
        <div style={{ maxWidth:500 }}>
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Send} /> Send to Broker</div>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Broker Email</label>
                <input value={brokerEmail} onChange={e => setBrokerEmail(e.target.value)} placeholder="dispatch@broker.com" style={inp} />
              </div>
              <button onClick={async () => { if(!brokerEmail||pkgSent[brokerEmail]) return; try { await apiFetch('/api/carrier-packet', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ brokerEmail }) }); setPkgSent(p => ({...p, [brokerEmail]:true})); showToast('success','Package Sent!','Carrier packet emailed to '+brokerEmail) } catch(e) { showToast('error','Send Failed', e.message||'Could not send packet — check your documents are uploaded') } }}
                style={{ padding:'12px 0', fontSize:13, fontWeight:700, borderRadius:8, border:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
                  background:pkgSent[brokerEmail]?'rgba(34,197,94,0.15)':!brokerEmail?'var(--surface3)':'var(--accent3)',
                  color:pkgSent[brokerEmail]?'var(--success)':!brokerEmail?'var(--muted)':'#fff' }}>
                {pkgSent[brokerEmail] ? 'Package Sent ✓' : 'Send Carrier Package'}
              </button>

              <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>Or share your package link</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input readOnly value={linkUrl} style={{ ...inp, flex:1, fontSize:11, fontFamily:'monospace' }} />
                  <button onClick={() => { try{navigator.clipboard.writeText(linkUrl)}catch{}; setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); showToast('','Link Copied','Share with any broker') }}
                    style={{ fontSize:11, fontWeight:700, padding:'8px 14px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0,
                      background:linkCopied?'rgba(34,197,94,0.15)':'var(--accent)', color:linkCopied?'var(--success)':'#000' }}>
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {Object.keys(pkgSent).length > 0 && (
                <div style={{ background:'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.15)', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--success)', marginBottom:5 }}>Sent History</div>
                  {Object.keys(pkgSent).map(email => (
                    <div key={email} style={{ fontSize:12, color:'var(--muted)' }}><Check size={11} /> {email}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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

// ─── SMS NOTIFICATION SETTINGS ─────────────────────────────────────────────────
export function SMSSettings() {
  const { showToast } = useApp()
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('+1')
  const [enabled, setEnabled] = useState({
    loadStatus: true,
    invoicePaid: true,
    invoiceOverdue: true,
    complianceExpiring: true,
    newLoadMatch: false,
    deliveryReminder: true,
  })
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [smsHistory, setSmsHistory] = useState([])

  const fullPhone = `${countryCode}${phone.replace(/[^\d]/g, '')}`

  // Load saved preferences from Supabase on mount
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const res = await apiFetch('/api/user-profile', { method: 'GET' })
        if (res.ok) {
          const data = await res.json()
          if (data.sms_phone) {
            const savedPhone = data.sms_phone || ''
            if (savedPhone.startsWith('+1')) {
              setCountryCode('+1')
              setPhone(savedPhone.slice(2))
            } else if (savedPhone.startsWith('+')) {
              const code = savedPhone.slice(0, savedPhone.length > 11 ? 3 : 2)
              setCountryCode(code)
              setPhone(savedPhone.slice(code.length))
            } else {
              setPhone(savedPhone)
            }
            setVerified(!!data.sms_verified)
          }
          if (data.sms_preferences) {
            setEnabled(prev => ({ ...prev, ...data.sms_preferences }))
          }
        }
      } catch { /* no saved prefs yet */ }
    }
    loadPrefs()
  }, [])

  const ALERTS = [
    { key:'loadStatus',        icon:Package,      label:'Load Status Updates',     desc:'Get notified when load status changes (booked, in transit, delivered)', color:'var(--accent)' },
    { key:'invoicePaid',       icon:DollarSign,   label:'Invoice Paid',            desc:'Alert when a broker pays your invoice with amount details',              color:'var(--success)' },
    { key:'invoiceOverdue',    icon:Clock,         label:'Invoice Overdue Alerts',  desc:'Reminder when invoices are past due with days overdue',                 color:'var(--danger)' },
    { key:'complianceExpiring',icon:Shield,        label:'Compliance Deadlines',    desc:'Alerts when licenses, insurance, or registrations are expiring soon',   color:'#f59e0b' },
    { key:'newLoadMatch',      icon:Target,        label:'New Load Matches',        desc:'Notifications when AI finds loads matching your lanes and equipment',   color:'var(--accent2)' },
    { key:'deliveryReminder',  icon:Bell,          label:'Delivery Reminders',      desc:'Reminders before scheduled delivery dates to stay on track',            color:'#8b5cf6' },
  ]

  const toggleSetting = (key) => {
    setEnabled(prev => ({ ...prev, [key]: !prev[key] }))
    showToast('', ALERTS.find(a => a.key === key)?.label || key, !enabled[key] ? 'Enabled' : 'Disabled')
  }

  const verifyPhone = async () => {
    const digits = phone.replace(/[^\d]/g, '')
    if (!digits || digits.length < 10) {
      showToast('error', 'Invalid', 'Enter a valid phone number (at least 10 digits)')
      return
    }
    setVerifying(true)
    try {
      const res = await apiFetch('/api/sms-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', to: fullPhone, data: {} }),
      })
      const data = await res.json()
      if (data.success) {
        setVerified(true)
        showToast('success', 'Verified', 'Verification SMS sent — check your phone')
      } else {
        showToast('error', 'Failed', data.error || 'Could not verify number')
      }
    } catch {
      showToast('error', 'Error', 'SMS service unavailable')
    }
    setVerifying(false)
  }

  const sendTest = async () => {
    if (!phone) { showToast('error', 'No Phone', 'Enter your phone number first'); return }
    setTestSending(true)
    try {
      const res = await apiFetch('/api/sms-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', to: fullPhone, data: {} }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'SMS Sent!', 'Check your phone for the test message')
        setSmsHistory(prev => [{ event: 'test', time: new Date().toLocaleString(), status: 'sent' }, ...prev.slice(0, 4)])
      } else {
        showToast('error', 'Failed', data.error || 'Could not send SMS')
      }
    } catch {
      showToast('error', 'Error', 'SMS service not configured yet')
    }
    setTestSending(false)
  }

  const savePreferences = async () => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/user-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sms_phone: fullPhone,
          sms_verified: verified,
          sms_preferences: enabled,
        }),
      })
      if (res.ok) {
        showToast('success', 'Saved', 'SMS notification preferences updated')
      } else {
        showToast('error', 'Error', 'Failed to save preferences')
      }
    } catch {
      showToast('error', 'Error', 'Could not save preferences')
    }
    setSaving(false)
  }

  const COUNTRY_CODES = [
    { code: '+1', label: 'US/CA +1' },
    { code: '+44', label: 'UK +44' },
    { code: '+52', label: 'MX +52' },
    { code: '+91', label: 'IN +91' },
    { code: '+61', label: 'AU +61' },
    { code: '+49', label: 'DE +49' },
  ]

  const enabledCount = Object.values(enabled).filter(Boolean).length

  return (
    <div style={S.page}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>SMS NOTIFICATIONS</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Get text alerts for load updates, payments, compliance deadlines, and more</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <span style={S.badge(enabledCount > 0 ? 'var(--success)' : 'var(--muted)')}>
            {enabledCount}/{ALERTS.length} active
          </span>
        </div>
      </div>

      {/* Phone Number Setup */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={S.panelTitle}><Ic icon={Phone} /> Phone Number</div>
          </div>
          {verified && <span style={S.badge('var(--success)')}><Ic icon={CheckCircle} size={10} /> Verified</span>}
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <select
              value={countryCode}
              onChange={e => setCountryCode(e.target.value)}
              style={{ width:100, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 8px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', cursor:'pointer' }}
            >
              {COUNTRY_CODES.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <input
              value={phone}
              onChange={e => { setPhone(e.target.value); setVerified(false) }}
              placeholder="(555) 123-4567"
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none' }}
            />
            <button onClick={verifyPhone} disabled={verifying}
              style={{ padding:'12px 20px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                background: verified ? 'rgba(34,197,94,0.15)' : 'var(--accent)', color: verified ? 'var(--success)' : '#000', opacity:verifying?0.7:1, whiteSpace:'nowrap' }}>
              {verifying ? 'Verifying...' : verified ? 'Verified' : 'Verify'}
            </button>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={sendTest} disabled={testSending} className="btn btn-ghost" style={{ fontSize:12 }}>
              <Ic icon={Send} size={12} /> {testSending ? 'Sending...' : 'Send Test SMS'}
            </button>
            <div style={{ fontSize:11, color:'var(--muted)' }}>
              {fullPhone && phone ? `Will send to: ${countryCode} ${phone}` : 'Enter a phone number to receive alerts'}
            </div>
          </div>
        </div>
      </div>

      {/* Alert Settings */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Bell} /> Alert Preferences</div>
          <div style={{ display:'flex', gap:8 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize:11, padding:'4px 10px' }}
              onClick={() => {
                const allOn = Object.values(enabled).every(Boolean)
                const newState = {}
                Object.keys(enabled).forEach(k => { newState[k] = !allOn })
                setEnabled(newState)
                showToast('', 'Alerts', allOn ? 'All disabled' : 'All enabled')
              }}
            >
              {Object.values(enabled).every(Boolean) ? 'Disable All' : 'Enable All'}
            </button>
          </div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          {ALERTS.map(a => (
            <div key={a.key} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'var(--surface2)', borderRadius:10, transition:'all 0.15s',
              opacity: enabled[a.key] ? 1 : 0.6 }}>
              <div style={{ width:36, height:36, borderRadius:10, background: (a.color || 'var(--accent)') + '12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ic icon={a.icon} size={16} color={a.color || 'var(--accent)'} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{a.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{a.desc}</div>
              </div>
              <div
                style={{ width:44, height:24, background:enabled[a.key] ? (a.color || 'var(--accent)') : 'var(--border)', borderRadius:12, cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}
                onClick={() => toggleSetting(a.key)}
              >
                <div style={{ width:18, height:18, background:'#fff', borderRadius:'50%', position:'absolute', top:3, transition:'left 0.2s', left:enabled[a.key] ? 23 : 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Message Preview */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={MessageCircle} /> Message Preview</div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
          {[
            { event:'load_status',        key:'loadStatus',        msg:'Qivori: Load LD-4821 status \u2192 Delivered. Chicago\u2192Dallas. Open app: qivori.com' },
            { event:'invoice_paid',       key:'invoicePaid',       msg:'Qivori: Invoice INV-1092 PAID! $3,450 received from XPO. Balance: $12,800' },
            { event:'invoice_overdue',    key:'invoiceOverdue',    msg:'Qivori: Invoice INV-1088 is 14 days overdue ($2,100). Follow up with CH Robinson.' },
            { event:'compliance_expiring', key:'complianceExpiring', msg:'Qivori: Your CDL expires in 30 days. Renew now to stay compliant.' },
            { event:'new_load_match',     key:'newLoadMatch',      msg:'Qivori: New load match! ATL\u2192MIA $2,800 ($3.20/mi). Open app to book.' },
            { event:'delivery_reminder',  key:'deliveryReminder',  msg:'Qivori: Reminder \u2014 Load LD-4825 delivery due Mar 18 at Houston, TX.' },
          ].map(p => {
            if (!enabled[p.key]) return null
            return (
              <div key={p.event} style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', fontSize:12, color:'var(--text)', lineHeight:1.5, border:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>{p.event.replace(/_/g, ' ')}</div>
                {p.msg}
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>{p.msg.length} chars {p.msg.length <= 160 ? '(single SMS)' : '(multi-part SMS)'}</div>
              </div>
            )
          }).filter(Boolean)}
          {Object.values(enabled).every(v => !v) && (
            <div style={{ textAlign:'center', padding:20, color:'var(--muted)', fontSize:12 }}>Enable alerts above to see message previews</div>
          )}
        </div>
      </div>

      {/* Recent SMS History */}
      {smsHistory.length > 0 && (
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Clock} /> Recent SMS</div>
          </div>
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:6 }}>
            {smsHistory.map((h, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--surface2)', borderRadius:8, fontSize:12 }}>
                <span style={{ fontWeight:600 }}>{h.event}</span>
                <span style={{ color:'var(--muted)', fontSize:11 }}>{h.time}</span>
                <span style={S.badge(h.status === 'sent' ? 'var(--success)' : 'var(--danger)')}>{h.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
        <button
          className="btn btn-primary"
          style={{ padding:'12px 32px', fontSize:13, fontWeight:700 }}
          onClick={savePreferences}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        <div style={{ fontSize:11, color:'var(--muted)' }}>Preferences are saved to your Qivori profile</div>
      </div>

      {/* Info */}
      <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.2)', borderRadius:12, padding:'14px 18px', display:'flex', gap:12 }}>
        <Ic icon={Shield} size={18} color="var(--accent2)" />
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          SMS notifications are powered by Twilio. Standard message rates may apply. Rate limit: 10 SMS per hour. You can unsubscribe at any time by toggling off alerts above or replying STOP to any message.
        </div>
      </div>
    </div>
  )
}

// ─── INVOICING SETTINGS ─────────────────────────────────────────────────────
export function InvoicingSettings() {
  const { showToast } = useApp()
  const [autoInvoice, setAutoInvoice] = useState(() => localStorage.getItem('qivori_auto_invoice') === 'true')
  const [defaultTerms, setDefaultTerms] = useState(() => localStorage.getItem('qivori_invoice_terms') || 'Net 30')

  const toggleAutoInvoice = () => {
    const next = !autoInvoice
    setAutoInvoice(next)
    localStorage.setItem('qivori_auto_invoice', String(next))
    showToast('', 'Auto-Invoice', next ? 'Enabled — invoices will be generated and emailed on delivery' : 'Disabled')
  }

  const saveTerms = () => {
    localStorage.setItem('qivori_invoice_terms', defaultTerms)
    showToast('', 'Saved', 'Invoice settings updated')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>INVOICING</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Configure automatic invoicing when loads are delivered</div>
      </div>

      {/* Auto-Invoice Toggle */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <Zap size={14} style={{ color:'var(--accent)' }} /> Auto-Invoice on Delivery
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>Automatically generate & send invoices</div>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
                When a load is marked as "Delivered", Qivori will automatically generate a professional invoice and email it to the broker. The load status will be updated to "Invoiced".
              </div>
            </div>
            <div onClick={toggleAutoInvoice}
              style={{ width:44, height:24, borderRadius:12, background: autoInvoice ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s', flexShrink:0, marginLeft:16 }}>
              <div style={{ position:'absolute', top:3, left: autoInvoice ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
            </div>
          </div>

          {autoInvoice && (
            <div style={{ background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:8, padding:12, fontSize:11, color:'var(--accent)', lineHeight:1.6 }}>
              Auto-invoicing is active. Invoices will be emailed to the broker's email address on file. Make sure your broker email addresses are up to date on each load.
            </div>
          )}
        </div>
      </div>

      {/* Payment Terms */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <Clock size={14} style={{ color:'var(--accent)' }} /> Default Payment Terms
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', gap:8 }}>
            {['Net 15', 'Net 30', 'Net 45', 'Net 60'].map(term => (
              <button key={term} onClick={() => setDefaultTerms(term)}
                style={{ padding:'8px 16px', borderRadius:8, border: defaultTerms === term ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: defaultTerms === term ? 'rgba(240,165,0,0.1)' : 'var(--surface2)',
                  color: defaultTerms === term ? 'var(--accent)' : 'var(--text)',
                  fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                {term}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={saveTerms}>Save Settings</button>
        </div>
      </div>

      {/* Invoice Status Legend */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <FileText size={14} style={{ color:'var(--accent)' }} /> Invoice Status Guide
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:10 }}>
          {[
            { status:'Sent',     color:'#f0a500', bg:'rgba(240,165,0,0.12)',  desc:'Invoice has been generated and emailed to the broker' },
            { status:'Viewed',   color:'#3b82f6', bg:'rgba(59,130,246,0.12)', desc:'Broker has opened the invoice email' },
            { status:'Paid',     color:'#22c55e', bg:'rgba(34,197,94,0.12)',  desc:'Payment received — load fully settled' },
            { status:'Overdue',  color:'#ef4444', bg:'rgba(239,68,68,0.12)',  desc:'Payment is past due date — follow up recommended' },
            { status:'Factored', color:'#8b5cf6', bg:'rgba(139,92,246,0.12)', desc:'Invoice has been factored for early payment' },
          ].map(s => (
            <div key={s.status} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8, background:s.bg, color:s.color, minWidth:70, textAlign:'center' }}>{s.status}</span>
              <span style={{ fontSize:12, color:'var(--muted)' }}>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:14 }}>
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          Invoices are sent via email with Qivori branding. Broker replies go to your company email on file. Rate limited to 10 invoices per minute. You can view, print, or resend any invoice from the load detail drawer.
        </div>
      </div>
    </div>
  )
}

// ─── TEAM MANAGEMENT ────────────────────────────────────────────────────────
export function TeamManagement() {
  const { showToast } = useApp()
  const { company, updateCompany } = useCarrier()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('Dispatcher')
  const [sending, setSending] = useState(false)

  const ROLES = [
    { key:'Owner',      color:'#f0a500', desc:'Full access — billing, settings, team, all data' },
    { key:'Dispatcher', color:'#3b82f6', desc:'Manage loads, dispatch, track shipments, view rates' },
    { key:'Accountant', color:'#8b5cf6', desc:'Invoicing, payments, expenses, financial reports' },
    { key:'Driver',     color:'#22c55e', desc:'View assigned loads, update status, upload PODs' },
  ]

  const members = company?.team_members || []

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return showToast('', 'Error', 'Email is required')
    if (members.find(m => m.email === inviteEmail.trim())) return showToast('', 'Error', 'This email is already on the team')

    setSending(true)
    const newMember = {
      email: inviteEmail.trim(),
      name: inviteName.trim() || inviteEmail.trim().split('@')[0],
      role: inviteRole,
      status: 'pending',
      invited_at: new Date().toISOString(),
    }
    const updated = [...members, newMember]
    try {
      await updateCompany({ team_members: updated })
      showToast('', 'Invite Sent', `${newMember.name} invited as ${inviteRole}`)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('Dispatcher')
    } catch {
      showToast('', 'Error', 'Failed to send invite')
    }
    setSending(false)
  }

  const removeMember = async (email) => {
    const updated = members.filter(m => m.email !== email)
    try {
      await updateCompany({ team_members: updated })
      showToast('', 'Removed', 'Team member removed')
    } catch {
      showToast('', 'Error', 'Failed to remove member')
    }
  }

  const roleColor = (role) => ROLES.find(r => r.key === role)?.color || 'var(--muted)'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>TEAM</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Manage who has access to your Qivori account</div>
      </div>

      {/* Invite New Member */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={UserPlus} size={14} /> Invite Team Member</div>
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', gap:8 }}>
            <input
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              placeholder="Name"
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }}
            />
            <input
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="Email address"
              style={{ flex:2, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }}
            />
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', cursor:'pointer' }}
            >
              {ROLES.map(r => (
                <option key={r.key} value={r.key}>{r.key}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              style={{ padding:'12px 24px', fontSize:13, fontWeight:700, whiteSpace:'nowrap' }}
              onClick={handleInvite}
              disabled={sending}
            >
              <Ic icon={Send} size={12} /> {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>
            An invite email will be sent. They can join your team by creating a Qivori account.
          </div>
        </div>
      </div>

      {/* Team Members List */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Users} size={14} /> Team Members ({members.length})</div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
          {members.length === 0 && (
            <div style={{ textAlign:'center', padding:24, color:'var(--muted)', fontSize:12 }}>
              No team members yet. Invite someone above to get started.
            </div>
          )}
          {members.map((m, i) => (
            <div key={m.email + i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface2)', borderRadius:10, transition:'all 0.15s' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:roleColor(m.role) + '18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14, fontWeight:700, color:roleColor(m.role) }}>
                {(m.name || m.email)[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name || m.email}</div>
                <div style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.email}</div>
              </div>
              <span style={S.badge(roleColor(m.role))}>{m.role}</span>
              {m.status === 'pending' ? (
                <span style={S.badge('var(--accent)')}>Pending</span>
              ) : (
                <span style={S.badge('var(--success)')}><Ic icon={Check} size={10} /> Active</span>
              )}
              <button
                className="btn btn-ghost"
                style={{ fontSize:11, padding:'4px 10px', color:'var(--danger, #ef4444)' }}
                onClick={() => removeMember(m.email)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Role Permissions */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Shield} size={14} /> Role Permissions</div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          {ROLES.map(r => (
            <div key={r.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface2)', borderRadius:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:r.color + '12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ic icon={Shield} size={16} color={r.color} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:r.color }}>{r.key}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.2)', borderRadius:12, padding:'14px 18px', display:'flex', gap:12 }}>
        <Ic icon={Shield} size={18} color="var(--accent2)" />
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          Only Owners can manage team members and billing. Dispatchers, Accountants, and Drivers will only see the parts of Qivori relevant to their role. All activity is logged for security.
        </div>
      </div>
    </div>
  )
}
