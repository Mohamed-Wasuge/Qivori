import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import { Users, TrendingUp, Shield, Zap, DollarSign, Activity, User, UserPlus, Bell, Star, BarChart2 } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export function RevenueDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/api/revenue-stats')
      if (res.ok) setStats(await res.json())
    } catch { /* analytics fetch error */ }
    setLoading(false)
  }

  useEffect(() => { fetchStats() }, [])
  useEffect(() => { const iv = setInterval(fetchStats, 60000); return () => clearInterval(iv) }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading revenue data...</div>
  if (!stats) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Could not load revenue stats. Check API configuration.</div>

  const S = {
    page: { padding: 20, paddingBottom: 60, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 },
    panel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
    panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' },
    panelTitle: { fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 },
  }

  const statCards = [
    { label: 'MRR', value: stats.mrrFormatted, sub: 'Monthly Recurring Revenue', color: '#22c55e', icon: DollarSign },
    { label: 'ARR', value: stats.arrFormatted, sub: 'Annual Recurring Revenue', color: '#f0a500', icon: TrendingUp },
    { label: 'Paying Customers', value: stats.payingCustomers, sub: `${stats.trialingUsers} trialing`, color: '#4d8ef0', icon: Users },
    { label: 'Churn Rate', value: `${stats.churnRate}%`, sub: 'This month', color: stats.churnRate > 5 ? '#ef4444' : '#22c55e', icon: Activity },
    { label: 'ARPU', value: stats.arpuFormatted, sub: 'Avg revenue per user', color: '#a855f7', icon: User },
    { label: 'LTV', value: stats.ltvFormatted, sub: 'Lifetime value estimate', color: '#f0a500', icon: Star },
    { label: 'Trial Conversion', value: `${stats.trialConversionRate}%`, sub: 'Trial → paid', color: stats.trialConversionRate > 20 ? '#22c55e' : '#ef4444', icon: Zap },
    { label: 'Founder Spots', value: `${stats.founderSpotsLeft} left`, sub: `${stats.founderCount}/100 claimed`, color: '#f0a500', icon: Shield },
  ]

  return (
    <div style={S.page}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{s.label}</span>
              <s.icon size={14} color={s.color} />
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color, letterSpacing: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Signups */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={UserPlus} /> Signups</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 12 }}><strong style={{ color: 'var(--success)' }}>{stats.signupsToday}</strong> today</span>
            <span style={{ fontSize: 12 }}><strong style={{ color: 'var(--accent)' }}>{stats.signupsWeek}</strong> this week</span>
            <span style={{ fontSize: 12 }}><strong style={{ color: 'var(--accent2)' }}>{stats.signupsMonth}</strong> this month</span>
          </div>
        </div>
      </div>

      {/* Plan Breakdown */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={BarChart2} /> Revenue by Plan</div>
          {stats.topPlan && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Top: {stats.topPlan.name} (${stats.topPlan.revenue}/mo)</span>}
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(stats.planBreakdown || {}).sort((a, b) => b[1].revenue - a[1].revenue).map(([plan, data]) => {
            const pct = stats.mrr > 0 ? (data.revenue / stats.mrr * 100) : 0
            const colors = { basic: 'var(--accent2)', pro: 'var(--accent)', autopilot: 'var(--accent3)', autopilot_ai: '#f0a500' }
            return (
              <div key={plan} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 80, fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{plan.replace('_', ' ')}</div>
                <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: colors[plan] || 'var(--accent)', borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
                <div style={{ width: 90, textAlign: 'right', fontSize: 12, fontWeight: 700, color: colors[plan] || 'var(--text)' }}>${data.revenue}/mo</div>
                <div style={{ width: 60, textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{data.count} users</div>
              </div>
            )
          })}
          {!stats.planBreakdown || Object.keys(stats.planBreakdown).length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>No paying customers yet</div>
          ) : null}
        </div>
      </div>

      {/* Recent Signups Feed */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Bell} /> Recent Signups</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{stats.totalUsers} total users</span>
        </div>
        <div>
          {(stats.recentSignups || []).map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                {(u.name || u.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{u.name || u.email?.split('@')[0]}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
              </div>
              {u.plan && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(240,165,0,0.1)', color: 'var(--accent)', fontWeight: 700, textTransform: 'capitalize' }}>{u.plan.replace('_', ' ')}</span>}
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: u.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', color: u.status === 'active' ? 'var(--success)' : 'var(--accent)', fontWeight: 700 }}>{u.status || 'new'}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
