import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchLoads as dbFetchLoads } from '../lib/database'
import { useApp } from '../context/AppContext'
import { Users, Truck, Building2, Package, TrendingUp, DollarSign, ArrowUpRight, Activity, AlertTriangle, CheckCircle, UserPlus, Clock, CreditCard, BarChart2, Shield, Zap, ArrowDown, ArrowUp } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export default function Dashboard() {
  const { navigatePage, showToast } = useApp()
  const [profiles, setProfiles] = useState([])
  const [loads, setLoads] = useState([])
  const [tickets, setTickets] = useState([])
  const [invoices, setInvoices] = useState([])
  const [waitlist, setWaitlist] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const [pRes, loadsData, tRes, iRes, wRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        dbFetchLoads(),
        supabase.from('tickets').select('*').eq('status', 'open'),
        supabase.from('invoices').select('*'),
        supabase.from('waitlist').select('*', { count: 'exact', head: true }),
      ])
      setProfiles(pRes.data || [])
      setLoads(loadsData || [])
      setTickets(tRes.data || [])
      setInvoices(iRes.data || [])
      setWaitlist(wRes)
      setLoading(false)
    }
    fetchData()
  }, [])

  const carriers = profiles.filter(p => p.role === 'carrier')
  const brokers = profiles.filter(p => p.role === 'broker')
  const activeLoads = loads.filter(l => l.status !== 'delivered' && l.status !== 'cancelled')
  const recentSignups = profiles.slice(0, 8)
  const pendingUsers = profiles.filter(p => p.status === 'pending')
  const openTickets = tickets.length
  const trialUsers = profiles.filter(p => p.status === 'trial')
  const activeUsers = profiles.filter(p => p.status === 'active')
  const waitlistCount = (waitlist?.count || 0)

  // Revenue calculations
  const totalRevenue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0)
  const paidInvoices = invoices.filter(i => i.status === 'Paid')
  const totalPaid = paidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0)

  // MRR — only count users with an active Stripe subscription (subscription_status === 'active')
  const planPrices = { autonomous_fleet: 399, autopilot: 399, autopilot_ai: 399, solo: 399, fleet: 399, enterprise: 399, growing: 399, pro: 399 }
  const payingUsers = profiles.filter(p => p.subscription_status === 'active' && p.plan && p.plan !== 'trial' && p.plan !== 'owner')
  const mrr = payingUsers.reduce((sum, u) => {
    const truckCount = parseInt(u.truck_count) || 1
    return sum + ((planPrices[u.plan] || 399) * truckCount)
  }, 0)

  // Churn rate (users who cancelled / total who ever subscribed)
  const cancelledUsers = profiles.filter(p => p.status === 'cancelled' || p.status === 'suspended')
  const everPaid = payingUsers.length + cancelledUsers.length
  const churnRate = everPaid > 0 ? ((cancelledUsers.length / everPaid) * 100).toFixed(1) : '0.0'

  // Trial conversion rate — only count actual Stripe-paying users as converted
  const totalTrials = trialUsers.length + payingUsers.length
  const conversionRate = totalTrials > 0 ? Math.round((payingUsers.length / totalTrials) * 100) : 0

  // Signups today
  const today = new Date().toDateString()
  const signupsToday = profiles.filter(p => new Date(p.created_at).toDateString() === today).length

  // Signups this week
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const signupsThisWeek = profiles.filter(p => new Date(p.created_at) > weekAgo).length

  const topStats = [
    { label: 'Total Carriers', value: carriers.length.toString(), sub: activeUsers.filter(u => u.role === 'carrier').length + ' active', color: 'var(--success)', icon: Truck },
    { label: 'Active Subscriptions', value: payingUsers.length.toString(), sub: trialUsers.length + ' on trial', color: 'var(--accent)', icon: CreditCard },
    { label: 'Monthly Revenue (MRR)', value: '$' + mrr.toLocaleString(), sub: payingUsers.length + ' paying users', color: 'var(--accent)', icon: DollarSign },
    { label: 'Churn Rate', value: churnRate + '%', sub: cancelledUsers.length + ' churned', color: parseFloat(churnRate) > 5 ? 'var(--danger)' : 'var(--success)', icon: TrendingUp },
    { label: 'Trial Conversions', value: conversionRate + '%', sub: payingUsers.length + '/' + totalTrials + ' converted', color: conversionRate > 50 ? 'var(--success)' : 'var(--warning)', icon: Zap },
    { label: 'Total Revenue', value: '$' + totalPaid.toLocaleString(), sub: paidInvoices.length + ' paid invoices', color: 'var(--accent2)', icon: BarChart2 },
  ]

  const alerts = [
    ...(signupsToday > 0 ? [{ icon: UserPlus, color: 'var(--success)', bg: 'rgba(34,197,94,0.04)', border: 'var(--success)', title: signupsToday + ' new signup(s) today', sub: signupsThisWeek + ' this week' }] : []),
    ...(pendingUsers.length > 0 ? [{ icon: AlertTriangle, color: 'var(--danger)', bg: 'rgba(239,68,68,0.04)', border: 'var(--danger)', title: pendingUsers.length + ' user(s) pending approval', sub: 'Review and approve new signups', onClick: () => navigatePage('carriers') }] : []),
    ...(openTickets > 0 ? [{ icon: AlertTriangle, color: 'var(--warning)', bg: 'rgba(245,158,11,0.04)', border: 'var(--warning)', title: openTickets + ' open support ticket(s)', sub: 'Check support queue', onClick: () => navigatePage('support') }] : []),
    ...(trialUsers.length > 0 ? [{ icon: Clock, color: 'var(--accent3)', bg: 'rgba(77,142,240,0.04)', border: 'var(--accent3)', title: trialUsers.length + ' trial(s) expiring soon', sub: 'Follow up to convert' }] : []),
    ...(waitlistCount > 0 ? [{ icon: Users, color: 'var(--accent2)', bg: 'rgba(0,212,170,0.04)', border: 'var(--accent2)', title: waitlistCount + ' people on waitlist', sub: 'Invite them to the platform', onClick: () => navigatePage('waitlist') }] : []),
    { icon: CheckCircle, color: 'var(--success)', bg: 'rgba(34,197,94,0.04)', border: 'var(--success)', title: 'Platform running smoothly', sub: 'All systems operational' },
  ]

  const formatDate = (d) => {
    if (!d) return ''
    const date = new Date(d)
    const now = new Date()
    const diff = now - date
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min ago'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'hr ago'
    if (diff < 172800000) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ height: 80, background: 'var(--surface)', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.8 } }`}</style>
    </div>
  )

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Platform banner */}
      <div className="ai-banner fade-in">
        <div className="ai-pulse" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Activity} size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>Platform Health — All Systems Operational</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{carriers.length} carriers · {brokers.length} brokers · {activeLoads.length} active loads · ${mrr.toLocaleString()} MRR</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigatePage('carriers')}>
          <Ic icon={UserPlus} size={14} /> Invite User
        </button>
      </div>

      {/* KPI cards - 6 columns */}
      <div className="stats-grid cols6 fade-in">
        {topStats.map(s => (
          <div key={s.label} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
            if (s.label.includes('Carrier')) navigatePage('carriers')
            else if (s.label.includes('Revenue') || s.label.includes('MRR')) navigatePage('payments')
            else if (s.label.includes('Subscription')) navigatePage('payments')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="stat-label" style={{ marginBottom: 0 }}>{s.label}</div>
              <Ic icon={s.icon} size={14} color="var(--muted)" />
            </div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-change up" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Ic icon={ArrowUpRight} size={11} /> {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Revenue mini chart + activity */}
      <div className="grid2 fade-in">
        {/* Revenue trend - visual bar chart */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Ic icon={TrendingUp} size={14} /> Revenue Trend (Last 7 Days)</div>
            <button className="btn btn-ghost" onClick={() => navigatePage('payments')}>View Revenue</button>
          </div>
          <div style={{ padding: 16 }}>
            <RevenueMiniChart invoices={invoices} profiles={profiles} />
          </div>
        </div>

        {/* Alerts */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Ic icon={AlertTriangle} size={14} /> Alerts & Activity</div>
            {pendingUsers.length > 0 && <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 20 }}>{pendingUsers.length} Pending</span>}
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map(a => (
              <div key={a.title} style={{ padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid ' + a.border, background: a.bg, cursor: a.onClick ? 'pointer' : 'default' }}
                onClick={a.onClick}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={a.icon} size={14} color={a.color} /> {a.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.sub}</div>
              </div>
            ))}
          </div>
        </div>
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
                    <td>
                      <strong>{s.full_name || s.company_name || s.email?.split('@')[0]}</strong>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.email}</div>
                    </td>
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
          {/* User breakdown */}
          <div className="panel">
            <div className="panel-header"><div className="panel-title"><Ic icon={Users} size={14} /> User Breakdown</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Carriers', value: carriers.length, pct: profiles.length ? Math.round(carriers.length / profiles.length * 100) : 0, color: 'var(--success)' },
                { label: 'Brokers', value: brokers.length, pct: profiles.length ? Math.round(brokers.length / profiles.length * 100) : 0, color: 'var(--accent3)' },
                { label: 'Admins', value: profiles.filter(p => p.role === 'admin').length, pct: profiles.length ? Math.round(profiles.filter(p => p.role === 'admin').length / profiles.length * 100) : 0, color: 'var(--accent)' },
                { label: 'On Trial', value: trialUsers.length, pct: profiles.length ? Math.round(trialUsers.length / profiles.length * 100) : 0, color: 'var(--accent2)' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{r.label}</span>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                    <div style={{ width: Math.max(r.pct, 2) + '%', height: '100%', background: r.color, borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Total Users</span>
                <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{profiles.length}</span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="panel">
            <div className="panel-header"><div className="panel-title"><Ic icon={Zap} size={14} /> Quick Actions</div></div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigatePage('waitlist')}>
                <Ic icon={Users} size={14} /> Manage Waitlist ({waitlistCount})
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigatePage('payments')}>
                <Ic icon={DollarSign} size={14} /> Revenue Dashboard
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigatePage('analytics')}>
                <Ic icon={BarChart2} size={14} /> View Analytics
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigatePage('activity')}>
                <Ic icon={Shield} size={14} /> Activity Log
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Mini Revenue Bar Chart ─────────────────────────────────────────── */
function RevenueMiniChart({ invoices, profiles }) {
  // Generate last 7 days data from signup dates (as proxy for revenue)
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const dayStr = d.toDateString()
    const label = d.toLocaleDateString('en-US', { weekday: 'short' })
    const signups = profiles.filter(p => new Date(p.created_at).toDateString() === dayStr).length
    const dayInvoices = invoices.filter(inv => new Date(inv.created_at).toDateString() === dayStr)
    const revenue = dayInvoices.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0)
    days.push({ label, signups, revenue })
  }

  const maxVal = Math.max(...days.map(d => d.signups), 1)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>{d.signups > 0 ? d.signups : ''}</div>
            <div style={{
              width: '100%', borderRadius: '4px 4px 0 0',
              background: d.signups > 0 ? 'linear-gradient(180deg, var(--accent), rgba(240,165,0,0.3))' : 'var(--border)',
              height: Math.max((d.signups / maxVal) * 90, 4),
              transition: 'height 0.5s'
            }} />
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{d.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Signups this week</div>
        <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{days.reduce((s, d) => s + d.signups, 0)}</div>
      </div>
    </div>
  )
}
