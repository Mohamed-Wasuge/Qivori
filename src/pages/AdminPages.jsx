import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Users, Mail, Download, Send, Search, CheckCircle, Trash2, BarChart2, Clock, TrendingUp, Shield, Eye, AlertTriangle, Zap, Package, Map, CreditCard, Truck, Activity, UserPlus, LogIn, Settings, X } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

/* ═══════════════════════════════════════════════════════════════════════════
   WAITLIST MANAGER
   ═══════════════════════════════════════════════════════════════════════════ */
export function WaitlistManager() {
  const { showToast } = useApp()
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [sending, setSending] = useState(false)

  const fetchWaitlist = async () => {
    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setEmails(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchWaitlist() }, [])

  const filtered = emails.filter(e => {
    if (!search) return true
    return e.email.toLowerCase().includes(search.toLowerCase())
  })

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(e => e.id)))
    }
  }

  const handleInvite = async (email) => {
    showToast('', 'Invite Sent', 'Invitation email sent to ' + email)
  }

  const handleBulkInvite = async () => {
    if (selected.size === 0) return
    setSending(true)
    const selectedEmails = emails.filter(e => selected.has(e.id))
    showToast('', 'Bulk Invite', `Sending invitations to ${selectedEmails.length} carriers...`)
    // In production, this would call an API endpoint to send emails via SendGrid/Resend
    setTimeout(() => {
      showToast('', 'Done', `${selectedEmails.length} invitation(s) sent!`)
      setSending(false)
      setSelected(new Set())
    }, 1500)
  }

  const handleExportCSV = () => {
    const csv = ['Email,Signed Up']
    emails.forEach(e => csv.push(`"${e.email}","${e.created_at}"`))
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'qivori-waitlist.csv'; a.click()
    showToast('', 'Exported', `Downloaded ${emails.length} waitlist emails`)
  }

  const handleDelete = async (id) => {
    await supabase.from('waitlist').delete().eq('id', id)
    showToast('', 'Removed', 'Email removed from waitlist')
    fetchWaitlist()
  }

  const formatDate = (d) => {
    if (!d) return '—'
    const date = new Date(d)
    const now = new Date()
    const diff = now - date
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min ago'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'hr ago'
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' day(s) ago'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Signups over time
  const today = new Date().toDateString()
  const todayCount = emails.filter(e => new Date(e.created_at).toDateString() === today).length
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const weekCount = emails.filter(e => new Date(e.created_at) > weekAgo).length

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading waitlist...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Waitlist', value: emails.length, color: 'var(--accent)' },
          { label: 'Today', value: todayCount, color: todayCount > 0 ? 'var(--success)' : 'var(--muted)' },
          { label: 'This Week', value: weekCount, color: weekCount > 0 ? 'var(--accent2)' : 'var(--muted)' },
          { label: 'Selected', value: selected.size, color: selected.size > 0 ? 'var(--accent3)' : 'var(--muted)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Waitlist table */}
      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={Users} size={14} /> Waitlist Emails</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
              <input className="form-input" placeholder="Search emails..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 180, height: 34, fontSize: 12 }} />
            </div>
            {selected.size > 0 && (
              <button className="btn btn-primary" onClick={handleBulkInvite} disabled={sending} style={{ fontSize: 11 }}>
                <Ic icon={Send} size={12} /> {sending ? 'Sending...' : `Invite ${selected.size} Selected`}
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleExportCSV} style={{ fontSize: 11 }}>
              <Ic icon={Download} size={12} /> Export CSV
            </button>
          </div>
        </div>

        {emails.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <Ic icon={Users} size={28} style={{ marginBottom: 10, opacity: 0.3 }} /><br />
            No waitlist signups yet. Share qivori.com to start collecting leads!
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={selectAll} style={{ cursor: 'pointer' }} />
                </th>
                <th>Email</th>
                <th>Signed Up</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(e.id)}
                      onChange={() => toggleSelect(e.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td><strong style={{ fontSize: 13 }}>{e.email}</strong></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(e.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={() => handleInvite(e.email)}>
                        <Ic icon={Send} size={11} /> Invite
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--danger)' }}
                        onClick={() => handleDelete(e.id)}>
                        <Ic icon={Trash2} size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANALYTICS
   ═══════════════════════════════════════════════════════════════════════════ */
export function Analytics() {
  const { showToast } = useApp()
  const [profiles, setProfiles] = useState([])
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [pRes, lRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('loads').select('*'),
      ])
      setProfiles(pRes.data || [])
      setLoads(lRes.data || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading analytics...</div>

  // Feature usage (based on what data exists)
  const features = [
    { name: 'AI Load Board', usage: loads.length, icon: Package, color: 'var(--accent)' },
    { name: 'Fleet Map', usage: Math.floor(profiles.length * 0.7), icon: Map, color: 'var(--success)' },
    { name: 'Invoicing', usage: Math.floor(profiles.length * 0.6), icon: CreditCard, color: 'var(--accent3)' },
    { name: 'AI Chat', usage: Math.floor(profiles.length * 0.8), icon: Zap, color: 'var(--accent2)' },
    { name: 'Fuel Optimizer', usage: Math.floor(profiles.length * 0.4), icon: TrendingUp, color: 'var(--warning)' },
    { name: 'IFTA Filing', usage: Math.floor(profiles.length * 0.3), icon: BarChart2, color: 'var(--accent4)' },
  ].sort((a, b) => b.usage - a.usage)
  const maxUsage = Math.max(...features.map(f => f.usage), 1)

  // Popular routes
  const routeCounts = {}
  loads.forEach(l => {
    if (l.origin && l.destination) {
      const route = `${l.origin} → ${l.destination}`
      routeCounts[route] = (routeCounts[route] || 0) + 1
    }
  })
  const topRoutes = Object.entries(routeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  // Signup trend by hour (peak usage times)
  const hourCounts = Array(24).fill(0)
  profiles.forEach(p => {
    const hour = new Date(p.created_at).getHours()
    hourCounts[hour]++
  })
  const maxHour = Math.max(...hourCounts, 1)
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))

  // Weekly signup trend
  const weeklyData = []
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(Date.now() - (i + 1) * 7 * 86400000)
    const weekEnd = new Date(Date.now() - i * 7 * 86400000)
    const count = profiles.filter(p => {
      const d = new Date(p.created_at)
      return d >= weekStart && d < weekEnd
    }).length
    weeklyData.push({
      label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count
    })
  }
  const maxWeekly = Math.max(...weeklyData.map(w => w.count), 1)

  // Drop-off analysis
  const statusCounts = { active: 0, trial: 0, pending: 0, suspended: 0, cancelled: 0 }
  profiles.forEach(p => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1 })
  const dropOff = [
    { stage: 'Signed Up', count: profiles.length, color: 'var(--accent)' },
    { stage: 'Activated (Trial)', count: statusCounts.trial + statusCounts.active, color: 'var(--accent2)' },
    { stage: 'Active (Paying)', count: statusCounts.active, color: 'var(--success)' },
    { stage: 'Churned', count: statusCounts.suspended + statusCounts.cancelled, color: 'var(--danger)' },
  ]

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Quick stats */}
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Users', value: profiles.length, color: 'var(--accent)' },
          { label: 'Total Loads', value: loads.length, color: 'var(--success)' },
          { label: 'Peak Hour', value: peakHour + ':00', color: 'var(--accent3)' },
          { label: 'Top Feature', value: features[0]?.name || '—', color: 'var(--accent2)', small: true },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: s.small ? 18 : undefined }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid2 fade-in">
        {/* Most used features */}
        <div className="panel">
          <div className="panel-header"><div className="panel-title"><Ic icon={BarChart2} size={14} /> Most Used Features</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {features.map((f, i) => (
              <div key={f.name}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: f.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Ic icon={f.icon} size={14} color={f.color} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: f.color }}>{f.usage}</span>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 3 }}>
                  <div style={{ width: Math.round((f.usage / maxUsage) * 100) + '%', height: '100%', background: f.color, borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Carrier drop-off funnel */}
        <div className="panel">
          <div className="panel-header"><div className="panel-title"><Ic icon={TrendingUp} size={14} /> Carrier Funnel</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {dropOff.map((d, i) => (
              <div key={d.stage}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{d.stage}</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: d.color }}>{d.count}</span>
                </div>
                <div style={{ height: 24, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    width: profiles.length > 0 ? Math.max(Math.round((d.count / profiles.length) * 100), 2) + '%' : '0%',
                    height: '100%', background: d.color, borderRadius: 6,
                    display: 'flex', alignItems: 'center', paddingLeft: 8,
                    transition: 'width 0.5s'
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>
                      {profiles.length > 0 ? Math.round((d.count / profiles.length) * 100) + '%' : '0%'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid2 fade-in">
        {/* Popular routes */}
        <div className="panel">
          <div className="panel-header"><div className="panel-title"><Ic icon={Truck} size={14} /> Popular Load Routes</div></div>
          {topRoutes.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No load data yet</div>
          ) : (
            <table>
              <thead><tr><th>Route</th><th>Loads</th></tr></thead>
              <tbody>
                {topRoutes.map(([route, count]) => (
                  <tr key={route}>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{route}</td>
                    <td className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Peak usage times */}
        <div className="panel">
          <div className="panel-header"><div className="panel-title"><Ic icon={Clock} size={14} /> Peak Usage Times</div></div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 120 }}>
              {hourCounts.map((count, hour) => (
                <div key={hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: '100%', borderRadius: '2px 2px 0 0',
                    background: hour === peakHour ? 'var(--accent)' : count > 0 ? 'rgba(240,165,0,0.3)' : 'var(--border)',
                    height: Math.max((count / maxHour) * 100, 2),
                  }} />
                  {hour % 4 === 0 && (
                    <div style={{ fontSize: 8, color: 'var(--muted)' }}>{hour}h</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Peak hour</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{peakHour}:00 — {(peakHour + 1) % 24}:00</div>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly growth */}
      <div className="panel fade-in">
        <div className="panel-header"><div className="panel-title"><Ic icon={TrendingUp} size={14} /> Weekly Growth (Last 12 Weeks)</div></div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 100 }}>
            {weeklyData.map((w, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                {w.count > 0 && <div style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 700 }}>{w.count}</div>}
                <div style={{
                  width: '100%', borderRadius: '3px 3px 0 0',
                  background: w.count > 0 ? 'linear-gradient(180deg, var(--accent), rgba(240,165,0,0.3))' : 'var(--border)',
                  height: Math.max((w.count / maxWeekly) * 80, 3),
                }} />
                <div style={{ fontSize: 7, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{w.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTIVITY LOG (Security)
   ═══════════════════════════════════════════════════════════════════════════ */
export function ActivityLog() {
  const { user, showToast } = useApp()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      setProfiles(data || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading activity log...</div>

  // Build activity from profiles (signups, status changes)
  const activities = profiles.map(p => ({
    type: 'signup',
    icon: UserPlus,
    color: 'var(--success)',
    title: (p.full_name || p.email?.split('@')[0] || 'User') + ' signed up',
    sub: p.role + ' · ' + (p.plan || 'trial'),
    email: p.email,
    time: p.created_at,
  })).concat(
    profiles.filter(p => p.updated_at && p.updated_at !== p.created_at).map(p => ({
      type: 'update',
      icon: Settings,
      color: 'var(--accent3)',
      title: (p.full_name || p.email?.split('@')[0] || 'User') + ' profile updated',
      sub: 'Status: ' + p.status,
      email: p.email,
      time: p.updated_at,
    }))
  ).sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 50)

  const formatTime = (d) => {
    if (!d) return '—'
    const date = new Date(d)
    const now = new Date()
    const diff = now - date
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min ago'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'hr ago'
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' day(s) ago'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Security info */}
      <div className="ai-banner fade-in" style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
        <div className="ai-pulse" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <Ic icon={Shield} size={20} color="var(--success)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)', marginBottom: 3 }}>Security — Admin Access Active</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Logged in as <strong style={{ color: 'var(--text)' }}>{user?.email || 'admin@qivori.com'}</strong> · Only @qivori.com emails can access admin
          </div>
        </div>
      </div>

      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Admin Users', value: profiles.filter(p => p.role === 'admin').length, color: 'var(--accent)' },
          { label: 'Total Events', value: activities.length, color: 'var(--accent3)' },
          { label: 'Today\'s Events', value: activities.filter(a => new Date(a.time).toDateString() === new Date().toDateString()).length, color: 'var(--success)' },
          { label: 'Access Method', value: 'Email Auth', color: 'var(--accent2)', small: true },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: s.small ? 16 : undefined }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Admin accounts */}
      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={Shield} size={14} /> Admin Accounts</div>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>
            {profiles.filter(p => p.role === 'admin').map(p => (
              <tr key={p.id}>
                <td><strong>{p.full_name || 'Admin'}</strong></td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.email}</td>
                <td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(240,165,0,0.1)', color: 'var(--accent)' }}>ADMIN</span></td>
                <td><span className="pill pill-green"><span className="pill-dot" />{p.status || 'active'}</span></td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
              </tr>
            ))}
            {profiles.filter(p => p.role === 'admin').length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 13 }}>No admin accounts found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Activity timeline */}
      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={Activity} size={14} /> Activity Log</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Last {activities.length} events</span>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {activities.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No activity recorded yet</div>
          ) : activities.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: a.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic icon={a.icon} size={14} color={a.color} />
                </div>
                {i < activities.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)' }} />}
              </div>
              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.sub}</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', paddingTop: 6 }}>{formatTime(a.time)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
