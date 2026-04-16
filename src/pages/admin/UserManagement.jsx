import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { apiFetch } from '../../lib/api'
import {
  Users, Search, Trash2, AlertTriangle, RefreshCw, Mail,
  ChevronDown, ChevronUp, Truck, Plus, Download, Eye,
  Clock, CheckCircle, Circle, MessageSquare, ExternalLink,
  Activity, Shield, Edit3, Check, X, Smartphone,
} from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n) {
  const v = Number(n || 0)
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v).toLocaleString()}`
}

function timeAgo(iso) {
  if (!iso) return null
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 2)   return 'Just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOnline(iso) {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < 15 * 60000
}

function isRecent(iso) {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < 24 * 3600000
}

function daysLeft(iso) {
  if (!iso) return null
  return Math.round((new Date(iso) - new Date()) / 86400000)
}

function planLabel(p) {
  if (!p) return 'Trial'
  if (p === 'autonomous_fleet') return 'Auto Fleet'
  return p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const BG = {
  green:  { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e'  },
  red:    { bg: 'rgba(239,68,68,0.1)',    color: '#ef4444'  },
  gold:   { bg: 'rgba(240,165,0,0.1)',    color: '#f0a500'  },
  blue:   { bg: 'rgba(59,130,246,0.1)',   color: '#3b82f6'  },
  purple: { bg: 'rgba(139,92,246,0.1)',   color: '#8b5cf6'  },
  muted:  { bg: 'rgba(107,114,128,0.08)', color: '#6b7280'  },
}

function Pill({ label, variant = 'muted', style }) {
  const { bg, color } = BG[variant] || BG.muted
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      background: bg, color, letterSpacing: 0.5, whiteSpace: 'nowrap', ...style }}>
      {label}
    </span>
  )
}

function OnlineDot({ active }) {
  return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: active ? '#22c55e' : 'var(--border)', flexShrink: 0,
      boxShadow: active ? '0 0 0 2px rgba(34,197,94,0.3)' : 'none' }} />
  )
}

// ─── Onboarding progress ──────────────────────────────────────────────────────
function OnboardingBar({ loads, calls, invoices, hasELD }) {
  const steps = [
    { label: 'Added Load',    done: loads > 0    },
    { label: 'Used Q',        done: calls > 0    },
    { label: 'Sent Invoice',  done: invoices > 0 },
    { label: 'ELD Connected', done: hasELD       },
  ]
  const pct = Math.round((steps.filter(s => s.done).length / steps.length) * 100)

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {steps.map(s => (
          <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
            color: s.done ? '#22c55e' : 'var(--muted)', fontWeight: s.done ? 700 : 400 }}>
            {s.done
              ? <CheckCircle size={11} color="#22c55e" />
              : <Circle size={11} color="var(--muted)" />}
            {s.label}
          </span>
        ))}
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#f0a500', borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

// ─── Inline notes editor ──────────────────────────────────────────────────────
function NotesCell({ userId, initial, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(initial || '')
  const ref = useRef()

  const save = async () => {
    setEditing(false)
    await supabase.from('profiles').update({ admin_notes: val }).eq('id', userId)
    onSave(val)
  }

  if (!editing) return (
    <div onClick={() => { setEditing(true); setTimeout(() => ref.current?.focus(), 50) }}
      style={{ fontSize: 12, color: val ? 'var(--text)' : 'var(--muted)', cursor: 'text',
        padding: '6px 8px', borderRadius: 6, border: '1px solid transparent',
        transition: 'border 0.15s', minHeight: 32, lineHeight: 1.5 }}
      onMouseEnter={e => e.currentTarget.style.border = '1px solid var(--border)'}
      onMouseLeave={e => e.currentTarget.style.border = '1px solid transparent'}>
      {val || '+ Add note'}
    </div>
  )

  return (
    <div style={{ position: 'relative' }}>
      <textarea ref={ref} value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) save() }}
        style={{ width: '100%', minHeight: 64, padding: 8, fontSize: 12, fontFamily: "'DM Sans',sans-serif",
          background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 6,
          color: 'var(--text)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button onClick={save} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          Save
        </button>
        <button onClick={() => { setEditing(false); setVal(initial || '') }}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          Cancel
        </button>
        <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center', marginLeft: 4 }}>⌘↵ to save</span>
      </div>
    </div>
  )
}

// ─── Send Email Modal ─────────────────────────────────────────────────────────
function SendEmailModal({ user, onClose, showToast }) {
  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')
  const [sending, setSending] = useState(false)

  const TEMPLATES = [
    { label: 'Welcome to Beta', subject: 'Welcome to Qivori — You\'re in!', body: `<p style="color:#c8d0dc;font-size:15px;line-height:1.7">Hey ${user.full_name?.split(' ')[0] || 'there'},</p><p style="color:#c8d0dc;font-size:15px;line-height:1.7">Welcome to the Qivori beta. You now have full access to the platform — AI dispatch, load board, compliance, and everything in between.</p><p style="color:#c8d0dc;font-size:15px;line-height:1.7">Log in at <a href="https://qivori.com" style="color:#f0a500">qivori.com</a> and let Q start working for you.</p><p style="color:#c8d0dc;font-size:15px;line-height:1.7">Any questions? Just reply to this email.</p><p style="color:#f0a500;font-weight:700">— Mohamed, Qivori</p>` },
    { label: 'Check In', subject: 'How\'s Qivori working for you?', body: `<p style="color:#c8d0dc;font-size:15px;line-height:1.7">Hey ${user.full_name?.split(' ')[0] || 'there'},</p><p style="color:#c8d0dc;font-size:15px;line-height:1.7">Just checking in — how has Qivori been working for you so far? Any loads booked through Q?</p><p style="color:#c8d0dc;font-size:15px;line-height:1.7">Reply and let me know what's working and what's not. Your feedback directly shapes what we build next.</p><p style="color:#f0a500;font-weight:700">— Mohamed, Qivori</p>` },
    { label: 'Trial Ending', subject: 'Your Qivori trial ends in 3 days', body: `<p style="color:#c8d0dc;font-size:15px;line-height:1.7">Hey ${user.full_name?.split(' ')[0] || 'there'},</p><p style="color:#c8d0dc;font-size:15px;line-height:1.7">Your free trial ends in 3 days. To keep Q dispatching and your TMS running, add a payment method in Settings → Subscription.</p><p style="color:#c8d0dc;font-size:15px;line-height:1.7">Questions? Just reply — happy to help.</p><p style="color:#f0a500;font-weight:700">— Mohamed, Qivori</p>` },
  ]

  const send = async () => {
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    try {
      const res  = await apiFetch('/api/admin-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, subject, html: `<p style="color:#c8d0dc;font-size:15px;line-height:1.7;white-space:pre-wrap">${body}</p>` }),
      })
      const data = await res.json()
      if (data.sent > 0) { showToast('', 'Email Sent', `Sent to ${user.email}`); onClose() }
      else showToast('error', 'Failed', data.error || 'Could not send')
    } catch (e) { showToast('error', 'Error', e.message) }
    setSending(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Send Email</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{user.email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        {/* Templates */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button key={t.label} onClick={() => { setSubject(t.subject); setBody(t.body) }}
              style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              {t.label}
            </button>
          ))}
        </div>

        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line..."
          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", marginBottom: 10, boxSizing: 'border-box', outline: 'none' }} />
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Message..." rows={8}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={send} disabled={sending || !subject || !body}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", opacity: (!subject || !body || sending) ? 0.5 : 1 }}>
            {sending ? 'Sending...' : 'Send Email'}
          </button>
          <button onClick={onClose} style={{ padding: '11px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUPER ELITE USER MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */
export function UserManagement() {
  const { user: adminUser, showToast } = useApp()
  const [users,         setUsers]         = useState([])
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [filter,        setFilter]        = useState('all')
  const [actionLoading, setActionLoading] = useState(null)
  const [confirmDel,    setConfirmDel]    = useState(null)
  const [expanded,      setExpanded]      = useState(null)
  const [emailModal,    setEmailModal]    = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [
      { data: profiles },
      { data: companies },
      { data: loads },
      { data: retellCalls },
      { data: invoices },
      { data: eldConns },
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('companies').select('id, owner_id, name, mc_number, dot_number, email'),
      supabase.from('loads').select('owner_id, gross_pay, status'),
      supabase.from('retell_calls').select('user_id'),
      supabase.from('invoices').select('owner_id'),
      supabase.from('eld_connections').select('user_id').then(r => r).catch(() => ({ data: [] })),
    ])

    const compMap  = {}; (companies  || []).forEach(c => { compMap[c.owner_id]  = c })
    const loadMap  = {}; (loads      || []).forEach(l => {
      if (!loadMap[l.owner_id]) loadMap[l.owner_id] = { count: 0, revenue: 0 }
      loadMap[l.owner_id].count++
      if (['Delivered','Invoiced','Paid'].includes(l.status)) loadMap[l.owner_id].revenue += Number(l.gross_pay || 0)
    })
    const callMap  = {}; (retellCalls || []).forEach(r => { callMap[r.user_id] = (callMap[r.user_id] || 0) + 1 })
    const invMap   = {}; (invoices    || []).forEach(i => { invMap[i.owner_id] = (invMap[i.owner_id] || 0) + 1 })
    const eldSet   = new Set((eldConns  || []).map(e => e.user_id))

    setUsers((profiles || []).map(p => ({
      ...p,
      company:   compMap[p.id]  || null,
      loadStat:  loadMap[p.id]  || { count: 0, revenue: 0 },
      qCalls:    callMap[p.id]  || 0,
      invoices:  invMap[p.id]   || 0,
      hasELD:    eldSet.has(p.id),
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAction = async (userId, email, action) => {
    setActionLoading(userId)
    try {
      const res  = await apiFetch('/api/admin-manage-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      const data = await res.json()
      if (data.success) {
        if (action === 'remove') {
          setUsers(prev => prev.filter(u => u.id !== userId))
          showToast('', 'Deleted', `${email} and all their data removed`)
        } else {
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: action === 'suspend' ? 'suspended' : 'active' } : u))
          showToast('', action === 'suspend' ? 'Suspended' : 'Activated', email)
        }
      } else { showToast('error', 'Error', data.error || 'Failed') }
    } catch (e) { showToast('error', 'Error', e.message) }
    setActionLoading(null)
    setConfirmDel(null)
  }

  const handleResetPW = async (userId, email) => {
    setActionLoading(userId)
    try {
      const res  = await apiFetch('/api/admin-reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, action: 'send_reset_link' }),
      })
      const data = await res.json()
      if (data.success) showToast('', 'Reset Link Sent', `Sent to ${email}`)
      else showToast('error', 'Error', data.error)
    } catch (e) { showToast('error', 'Error', e.message) }
    setActionLoading(null)
  }

  const handleExtendTrial = async (userId, email) => {
    setActionLoading(userId)
    const newEnd = new Date(Date.now() + 14 * 86400000).toISOString()
    await supabase.from('profiles').update({ trial_ends_at: newEnd }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, trial_ends_at: newEnd } : u))
    showToast('', 'Trial Extended', `${email} — +14 days`)
    setActionLoading(null)
  }

  const handleImpersonate = async (email) => {
    try {
      const res  = await apiFetch('/api/admin-impersonate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank')
      else showToast('error', 'Error', data.error || 'Could not generate link')
    } catch (e) { showToast('error', 'Error', e.message) }
  }

  const exportCSV = () => {
    const rows = [
      ['Name','Email','Company','MC','DOT','Plan','Status','Last Active','Loads','Revenue','Q Calls','Q App Installed','Joined'].join(','),
      ...filtered.map(u => [
        u.full_name || '',
        u.email || '',
        u.company?.name || '',
        u.company?.mc_number || '',
        u.company?.dot_number || '',
        planLabel(u.subscription_plan),
        u.status || '',
        u.last_active_at ? new Date(u.last_active_at).toLocaleString() : 'Never',
        u.loadStat.count,
        Math.round(u.loadStat.revenue),
        u.qCalls,
        u.mobile_app_installed_at ? new Date(u.mobile_app_installed_at).toLocaleString() : '',
        new Date(u.created_at).toLocaleDateString(),
      ].join(','))
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }))
    a.download = `qivori-beta-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const filtered = users.filter(u => {
    if (filter === 'carrier'   && u.role !== 'carrier')                     return false
    if (filter === 'online'    && !isOnline(u.last_active_at))              return false
    if (filter === 'active'    && u.status !== 'active')                    return false
    if (filter === 'trial'     && u.subscription_status !== 'trialing')     return false
    if (filter === 'suspended' && u.status !== 'suspended')                 return false
    if (filter === 'never'     && u.loadStat.count > 0)                     return false
    if (filter === 'app'       && !u.mobile_app_installed_at)               return false
    if (search) {
      const q = search.toLowerCase()
      return (u.email || '').toLowerCase().includes(q)
          || (u.full_name || '').toLowerCase().includes(q)
          || (u.company?.name || '').toLowerCase().includes(q)
          || (u.company?.mc_number || '').toLowerCase().includes(q)
    }
    return true
  })

  const online      = users.filter(u => isOnline(u.last_active_at))
  const carriers    = users.filter(u => u.role === 'carrier')
  const trialing    = users.filter(u => u.subscription_status === 'trialing')
  const noActivity  = carriers.filter(u => u.loadStat.count === 0)
  const totalRev    = users.reduce((s, u) => s + u.loadStat.revenue, 0)
  const hasApp      = users.filter(u => u.mobile_app_installed_at)

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--muted)' }}>
      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading...
    </div>
  )

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1280 }}>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
        {[
          { label: 'Total Users',    value: users.length,       color: 'var(--accent)'  },
          { label: 'Online Now',     value: online.length,      color: '#22c55e', dot: true },
          { label: 'Carriers',       value: carriers.length,    color: 'var(--accent3)' },
          { label: 'In Trial',       value: trialing.length,    color: '#3b82f6'        },
          { label: 'No Activity',    value: noActivity.length,  color: '#ef4444'        },
          { label: 'Downloaded App', value: hasApp.length,      color: '#8b5cf6', phone: true },
          { label: 'Total Revenue',  value: fmt$(totalRev),     color: '#22c55e'        },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              {s.dot   && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)' }} />}
              {s.phone && <Smartphone size={10} color="#8b5cf6" />}
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Name, email, company, MC..."
            style={{ width: '100%', paddingLeft: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px 8px 30px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box', outline: 'none' }} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
          <option value="all">All Users</option>
          <option value="online">🟢 Online Now</option>
          <option value="app">📱 Downloaded App</option>
          <option value="carrier">Carriers</option>
          <option value="active">Active</option>
          <option value="trial">In Trial</option>
          <option value="never">No Activity</option>
          <option value="suspended">Suspended</option>
        </select>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <RefreshCw size={12} /> Refresh
        </button>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <Download size={12} /> CSV
        </button>
        <button onClick={() => document.querySelector('[data-action="invite-user"]')?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <Plus size={14} /> Invite Beta Tester
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={13} color="var(--accent)" />
          <span style={{ fontSize: 12, fontWeight: 700 }}>Users</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>({filtered.length})</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['','User','Company','Plan','Activity','Status','Last Active',''].map((h,i) => (
                <th key={i} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const isAdmin  = u.role === 'admin'
              const isSelf   = u.id === adminUser?.id
              const isSusp   = u.status === 'suspended'
              const online_  = isOnline(u.last_active_at)
              const recent   = isRecent(u.last_active_at)
              const days     = daysLeft(u.trial_ends_at)
              const isLoading = actionLoading === u.id
              const isOpen   = expanded === u.id

              return (
                <>
                  <tr key={u.id}
                    onClick={() => setExpanded(isOpen ? null : u.id)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'rgba(240,165,0,0.03)' : 'transparent', transition: 'background 0.12s' }}
                    onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Online dot */}
                    <td style={{ padding: '12px 8px 12px 16px', width: 24 }}>
                      <OnlineDot active={online_} />
                    </td>

                    {/* User */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: isAdmin ? 'rgba(240,165,0,0.15)' : 'var(--surface2)', color: isAdmin ? 'var(--accent)' : 'var(--muted)' }}>
                          {(u.full_name || u.email || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{u.full_name || 'No Name'}</span>
                            {u.mobile_app_installed_at && (
                              <span title={`Q app installed ${timeAgo(u.mobile_app_installed_at)}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', borderRadius: 4, padding: '1px 5px' }}>
                                <Smartphone size={9} /> APP
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Company */}
                    <td style={{ padding: '12px 14px' }}>
                      {u.company ? (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{u.company.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                            {[u.company.mc_number && `MC ${u.company.mc_number}`, u.company.dot_number && `DOT ${u.company.dot_number}`].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      ) : <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                    </td>

                    {/* Plan */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <Pill label={isAdmin ? 'ADMIN' : planLabel(u.subscription_plan)} variant={isAdmin ? 'gold' : 'muted'} />
                        {days !== null && (
                          <Pill label={days < 0 ? 'EXPIRED' : `${days}d left`} variant={days < 0 ? 'red' : days <= 3 ? 'red' : days <= 7 ? 'gold' : 'blue'} />
                        )}
                      </div>
                    </td>

                    {/* Activity */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: u.loadStat.count > 0 ? 'var(--text)' : 'var(--muted)' }}>{u.loadStat.count}</div>
                          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>LOADS</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: u.qCalls > 0 ? 'var(--accent)' : 'var(--muted)' }}>{u.qCalls}</div>
                          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>Q CALLS</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: u.loadStat.revenue > 0 ? '#22c55e' : 'var(--muted)' }}>{u.loadStat.revenue > 0 ? fmt$(u.loadStat.revenue) : '—'}</div>
                          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>REV</div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}>
                      <Pill label={(u.status || 'pending').toUpperCase()}
                        variant={isSusp ? 'red' : u.status === 'active' ? 'green' : 'gold'} />
                    </td>

                    {/* Last Active */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 12, color: online_ ? '#22c55e' : recent ? 'var(--text)' : 'var(--muted)', fontWeight: online_ ? 700 : 400 }}>
                        {u.last_active_at ? timeAgo(u.last_active_at) : 'Never'}
                      </div>
                    </td>

                    {/* Expand */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {isOpen ? <ChevronUp size={13} color="var(--muted)" /> : <ChevronDown size={13} color="var(--muted)" />}
                    </td>
                  </tr>

                  {/* ── Expanded detail ── */}
                  {isOpen && (
                    <tr key={u.id + '-exp'} style={{ background: 'rgba(240,165,0,0.02)', borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={8} style={{ padding: '0 16px 20px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, paddingTop: 16 }}>

                          {/* Left: onboarding + actions */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Onboarding Progress</div>
                              <OnboardingBar loads={u.loadStat.count} calls={u.qCalls} invoices={u.invoices} hasELD={u.hasELD} />
                            </div>

                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Actions</div>
                              {!isSelf && !isAdmin ? (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <Btn label={isSusp ? 'Activate' : 'Suspend'} color={isSusp ? '#22c55e' : '#f0a500'} loading={isLoading}
                                    onClick={() => handleAction(u.id, u.email, isSusp ? 'activate' : 'suspend')} />
                                  <Btn label="Reset PW"   color="#3b82f6"    loading={isLoading} onClick={() => handleResetPW(u.id, u.email)} />
                                  <Btn label="+14d Trial" color="var(--accent)" loading={isLoading} onClick={() => handleExtendTrial(u.id, u.email)} />
                                  <Btn label="Send Email" color="#8b5cf6"    loading={isLoading} onClick={() => setEmailModal(u)} icon={<Mail size={11} />} />
                                  <Btn label="View as Carrier" color="#06b6d4" loading={isLoading} onClick={() => handleImpersonate(u.email)} icon={<ExternalLink size={11} />} />
                                  <Btn label="Delete" color="#ef4444" loading={isLoading} onClick={() => setConfirmDel({ userId: u.id, email: u.email })} />
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{isSelf ? 'Your account — protected' : 'Admin — protected'}</span>
                              )}
                            </div>
                          </div>

                          {/* Right: admin notes */}
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Internal Notes</div>
                            <NotesCell userId={u.id} initial={u.admin_notes}
                              onSave={val => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, admin_notes: val } : x))} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40, fontSize: 13 }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Delete Modal ── */}
      {confirmDel && (
        <>
          <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={20} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--danger)' }}>Delete Account</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Permanent — cannot be undone</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8, marginBottom: 20, padding: 14, background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)' }}>
              Deleting <strong>{confirmDel.email}</strong> — removes auth account, all loads, invoices, expenses, drivers, vehicles, documents, and compliance records.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleAction(confirmDel.userId, confirmDel.email, 'remove')}
                disabled={actionLoading === confirmDel.userId}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                {actionLoading === confirmDel.userId ? 'Deleting...' : 'Delete Permanently'}
              </button>
              <button onClick={() => setConfirmDel(null)}
                style={{ padding: '11px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Email Modal ── */}
      {emailModal && <SendEmailModal user={emailModal} onClose={() => setEmailModal(null)} showToast={showToast} />}
    </div>
  )
}

function Btn({ label, color, loading, onClick, icon }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8,
        border: `1px solid ${color}40`, background: `${color}12`, color, fontSize: 11, fontWeight: 700,
        cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", opacity: loading ? 0.5 : 1 }}>
      {icon}{loading ? '...' : label}
    </button>
  )
}
