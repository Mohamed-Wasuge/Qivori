import { useApp } from '../context/AppContext'
import { Users, Truck, Building2, Package, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight, Activity, Clock, AlertTriangle, CheckCircle, UserPlus } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export default function Dashboard() {
  const { navigatePage, showToast } = useApp()

  const stats = [
    { label: 'Total Users', value: '66', change: '+8 this week', up: true, color: 'var(--accent)', icon: Users },
    { label: 'Carriers', value: '52', change: '+5 this month', up: true, color: 'var(--success)', icon: Truck },
    { label: 'Brokers', value: '14', change: '+3 this month', up: true, color: 'var(--accent3)', icon: Building2 },
    { label: 'Active Loads', value: '247', change: '+18 today', up: true, color: 'var(--accent2)', icon: Package },
    { label: 'MRR', value: '$4,830', change: '+22% vs last mo', up: true, color: 'var(--accent)', icon: DollarSign },
    { label: 'Platform Uptime', value: '99.9%', change: 'Last 30 days', up: true, color: 'var(--success)', icon: Activity },
  ]

  const recentSignups = [
    { name: 'FastHaul Express', type: 'Carrier', plan: 'Small Fleet', status: 'Active', date: 'Today', color: 'var(--success)' },
    { name: 'Apex Logistics', type: 'Broker', plan: 'Standard', status: 'Trial', date: 'Yesterday', color: 'var(--accent3)' },
    { name: 'Summit Transport', type: 'Carrier', plan: 'Solo', status: 'Active', date: 'Mar 8', color: 'var(--success)' },
    { name: 'PrimeRoute LLC', type: 'Carrier', plan: 'Solo', status: 'Pending', date: 'Mar 7', color: 'var(--warning)' },
    { name: 'Midwest Freight Co', type: 'Broker', plan: 'Standard', status: 'Active', date: 'Mar 6', color: 'var(--accent3)' },
  ]

  const alerts = [
    { icon: AlertTriangle, color: 'var(--danger)', bg: 'rgba(239,68,68,0.04)', border: 'var(--danger)', title: '3 carriers pending approval', sub: 'MC verification needed before activation' },
    { icon: DollarSign, color: 'var(--warning)', bg: 'rgba(245,158,11,0.04)', border: 'var(--warning)', title: '2 failed subscription payments', sub: 'Retry scheduled for tomorrow' },
    { icon: CheckCircle, color: 'var(--success)', bg: 'rgba(34,197,94,0.04)', border: 'var(--success)', title: 'Platform update deployed', sub: 'v1.2 — Broker portal + load posting' },
  ]

  const revenue = [
    { label: 'Carrier Subs', value: '$3,280', pct: 68, color: 'var(--success)' },
    { label: 'Broker Subs', value: '$1,050', pct: 22, color: 'var(--accent3)' },
    { label: 'Factoring Fees', value: '$500', pct: 10, color: 'var(--accent)' },
  ]

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Platform banner */}
      <div className="ai-banner fade-in">
        <div className="ai-pulse" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Activity} size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>Platform Health — All Systems Operational</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>52 carriers · 14 brokers · 247 active loads · $4,830 MRR</div>
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
            else if (s.label === 'MRR') navigatePage('payments')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="stat-label" style={{ marginBottom: 0 }}>{s.label}</div>
              <Ic icon={s.icon} size={14} color="var(--muted)" />
            </div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-change up" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Ic icon={s.up ? ArrowUpRight : ArrowDownRight} size={11} /> {s.change}
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
          <table>
            <thead><tr><th>Company</th><th>Type</th><th>Plan</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {recentSignups.map(s => (
                <tr key={s.name} onClick={() => showToast('', s.name, s.type + ' · ' + s.plan + ' plan · ' + s.status)}>
                  <td><strong>{s.name}</strong></td>
                  <td>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: s.type === 'Carrier' ? 'rgba(34,197,94,0.1)' : 'rgba(77,142,240,0.1)',
                      color: s.type === 'Carrier' ? 'var(--success)' : 'var(--accent3)' }}>
                      {s.type}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{s.plan}</td>
                  <td>
                    <span className={'pill ' + (s.status === 'Active' ? 'pill-green' : s.status === 'Trial' ? 'pill-blue' : 'pill-yellow')}>
                      <span className="pill-dot" />{s.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{s.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Alerts */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title"><Ic icon={AlertTriangle} size={14} /> Alerts</div>
              <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 20 }}>3 Active</span>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map(a => (
                <div key={a.title} style={{ padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid ' + a.border, background: a.bg, cursor: 'pointer' }}
                  onClick={() => showToast('', a.title, a.sub)}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={a.icon} size={14} color={a.color} /> {a.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue breakdown */}
          <div className="panel">
            <div className="panel-header"><div className="panel-title"><Ic icon={TrendingUp} size={14} /> Revenue Breakdown</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {revenue.map(r => (
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
                <span style={{ fontSize: 12, fontWeight: 700 }}>Total MRR</span>
                <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>$4,830</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
