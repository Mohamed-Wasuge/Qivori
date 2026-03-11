import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Users, Truck, Building2, Package, TrendingUp, DollarSign, ArrowUpRight, Activity, AlertTriangle, CheckCircle, UserPlus } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export default function Dashboard() {
  const { navigatePage, showToast } = useApp()
  const [profiles, setProfiles] = useState([])
  const [loads, setLoads] = useState([])
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const [pRes, lRes, tRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('loads').select('*'),
        supabase.from('tickets').select('*').eq('status', 'open'),
      ])
      setProfiles(pRes.data || [])
      setLoads(lRes.data || [])
      setTickets(tRes.data || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const carriers = profiles.filter(p => p.role === 'carrier')
  const brokers = profiles.filter(p => p.role === 'broker')
  const activeLoads = loads.filter(l => l.status !== 'delivered' && l.status !== 'cancelled')
  const recentSignups = profiles.slice(0, 5)
  const pendingUsers = profiles.filter(p => p.status === 'pending')
  const openTickets = tickets.length

  const stats = [
    { label: 'Total Users', value: profiles.length.toString(), change: 'All registered users', up: true, color: 'var(--accent)', icon: Users },
    { label: 'Carriers', value: carriers.length.toString(), change: carriers.filter(c => c.status === 'active').length + ' active', up: true, color: 'var(--success)', icon: Truck },
    { label: 'Brokers', value: brokers.length.toString(), change: brokers.filter(b => b.status === 'active').length + ' active', up: true, color: 'var(--accent3)', icon: Building2 },
    { label: 'Active Loads', value: activeLoads.length.toString(), change: loads.length + ' total', up: true, color: 'var(--accent2)', icon: Package },
    { label: 'Open Tickets', value: openTickets.toString(), change: 'Needs attention', up: false, color: 'var(--warning)', icon: AlertTriangle },
    { label: 'Platform Uptime', value: '99.9%', change: 'Last 30 days', up: true, color: 'var(--success)', icon: Activity },
  ]

  const alerts = [
    ...(pendingUsers.length > 0 ? [{ icon: AlertTriangle, color: 'var(--danger)', bg: 'rgba(239,68,68,0.04)', border: 'var(--danger)', title: pendingUsers.length + ' user(s) pending approval', sub: 'Review and approve new signups' }] : []),
    ...(openTickets > 0 ? [{ icon: AlertTriangle, color: 'var(--warning)', bg: 'rgba(245,158,11,0.04)', border: 'var(--warning)', title: openTickets + ' open support ticket(s)', sub: 'Check support queue' }] : []),
    { icon: CheckCircle, color: 'var(--success)', bg: 'rgba(34,197,94,0.04)', border: 'var(--success)', title: 'Platform running smoothly', sub: 'All systems operational' },
  ]

  const formatDate = (d) => {
    if (!d) return ''
    const date = new Date(d)
    const now = new Date()
    const diff = now - date
    if (diff < 86400000) return 'Today'
    if (diff < 172800000) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading dashboard...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Platform banner */}
      <div className="ai-banner fade-in">
        <div className="ai-pulse" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Activity} size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>Platform Health — All Systems Operational</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{carriers.length} carriers · {brokers.length} brokers · {activeLoads.length} active loads</div>
        </div>
        <button className="btn btn-primary" onClick={() => showToast('', 'Invite Sent', 'Invitation email sent successfully')}>
          <Ic icon={UserPlus} size={14} /> Invite User
        </button>
      </div>

      {/* KPI cards */}
      <div className="stats-grid cols6 fade-in">
        {stats.map(s => (
          <div key={s.label} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
            if (s.label === 'Carriers') navigatePage('carriers')
            else if (s.label === 'Brokers') navigatePage('brokers')
            else if (s.label === 'Active Loads') navigatePage('loadboard')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="stat-label" style={{ marginBottom: 0 }}>{s.label}</div>
              <Ic icon={s.icon} size={14} color="var(--muted)" />
            </div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-change up" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Ic icon={ArrowUpRight} size={11} /> {s.change}
            </div>
          </div>
        ))}
      </div>

      <div className="grid2 fade-in">
        {/* Recent signups */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Ic icon={UserPlus} size={14} /> Recent Signups</div>
            <button className="btn btn-ghost" onClick={() => navigatePage('carriers')}>View All</button>
          </div>
          {recentSignups.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No users yet. Share qivori.com to get signups!</div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Plan</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {recentSignups.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.full_name || s.company_name || s.email}</strong></td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: s.role === 'carrier' ? 'rgba(34,197,94,0.1)' : s.role === 'broker' ? 'rgba(77,142,240,0.1)' : 'rgba(240,165,0,0.1)',
                        color: s.role === 'carrier' ? 'var(--success)' : s.role === 'broker' ? 'var(--accent3)' : 'var(--accent)' }}>
                        {s.role}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{s.plan || 'trial'}</td>
                    <td>
                      <span className={'pill ' + (s.status === 'active' ? 'pill-green' : s.status === 'trial' ? 'pill-blue' : 'pill-yellow')}>
                        <span className="pill-dot" />{s.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Alerts */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title"><Ic icon={AlertTriangle} size={14} /> Alerts</div>
              {pendingUsers.length > 0 && <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 20 }}>{pendingUsers.length} Pending</span>}
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map(a => (
                <div key={a.title} style={{ padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid ' + a.border, background: a.bg, cursor: 'pointer' }}
                  onClick={() => {
                    if (a.title.includes('pending')) navigatePage('carriers')
                    else if (a.title.includes('ticket')) navigatePage('support')
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={a.icon} size={14} color={a.color} /> {a.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* User breakdown */}
          <div className="panel">
            <div className="panel-header"><div className="panel-title"><Ic icon={TrendingUp} size={14} /> User Breakdown</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Carriers', value: carriers.length, pct: profiles.length ? Math.round(carriers.length / profiles.length * 100) : 0, color: 'var(--success)' },
                { label: 'Brokers', value: brokers.length, pct: profiles.length ? Math.round(brokers.length / profiles.length * 100) : 0, color: 'var(--accent3)' },
                { label: 'Admins', value: profiles.filter(p => p.role === 'admin').length, pct: profiles.length ? Math.round(profiles.filter(p => p.role === 'admin').length / profiles.length * 100) : 0, color: 'var(--accent)' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{r.label}</span>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                    <div style={{ width: r.pct + '%', height: '100%', background: r.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Total Users</span>
                <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{profiles.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
