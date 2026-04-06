import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { Shield, Activity, UserPlus, Settings } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

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
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
