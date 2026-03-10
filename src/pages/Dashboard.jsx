import { useApp } from '../context/AppContext'
import { Bot, Bell, AlertTriangle, DollarSign, Zap } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export default function Dashboard() {
  const { navigatePage, showToast } = useApp()

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ai-banner fade-in">
        <div className="ai-pulse" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Bot} size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>AI Engine Active — 12 high-confidence matches found</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>ATL→CHI corridor showing +12% rate premium · 52 carriers online · 247 active loads</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigatePage('loadboard')}>View Matches →</button>
      </div>

      <div className="stats-grid cols6 fade-in">
        {[
          { label: 'Revenue MTD', value: '$84K', change: '↑ 22%', type: 'up', color: 'var(--accent)' },
          { label: 'Active Loads', value: '247', change: '↑ 18 today', type: 'up', color: 'var(--accent2)' },
          { label: 'Carriers Online', value: '52', change: '7 new today', type: 'neutral', color: 'var(--accent3)' },
          { label: 'AI Match Rate', value: '94%', change: '↑ 2%', type: 'up', color: 'var(--accent4)' },
          { label: 'Pending $', value: '$9.9K', change: '3 invoices', type: 'neutral', color: 'var(--warning)' },
          { label: 'On-Time Rate', value: '96%', change: '↑ 3%', type: 'up', color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className={'stat-change ' + s.type}>{s.change}</div>
          </div>
        ))}
      </div>

      <div className="grid2 fade-in">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><span className="live-dot" /> Live Operations</div>
            <button className="btn btn-ghost" onClick={() => navigatePage('loadboard')}>View All</button>
          </div>
          <table>
            <thead><tr><th>Load</th><th>Route</th><th>Carrier</th><th>Status</th><th>ETA</th></tr></thead>
            <tbody>
              {[
                { id: 'FM-4398', from: 'DAL', to: 'MIA', carrier: 'Southern Freight', pill: 'pill-green', status: 'En Route', eta: '6:30PM ✓', etaColor: 'var(--success)', msg: ',FM-4398,Dallas → Miami · En Route · ETA 6:30PM' },
                { id: 'FM-4388', from: 'MEM', to: 'NYC', carrier: 'Express Carriers', pill: 'pill-green', status: 'En Route', eta: 'Mar 2 2PM', etaColor: 'var(--success)', msg: ',FM-4388,Memphis → NYC · En Route' },
                { id: 'FM-4421', from: 'ATL', to: 'CHI', carrier: 'R&J Transport', pill: 'pill-blue', status: 'Matched', eta: 'Today 2PM PU', etaColor: 'var(--muted)', msg: ',FM-4421,Atlanta → Chicago · Matched' },
                { id: 'FM-4412', from: 'PHX', to: 'LAX', carrier: '—', pill: 'pill-yellow', status: 'Searching', eta: 'Today 5PM', etaColor: 'var(--warning)', msg: ',FM-4412,Phoenix → LA · No Carrier Yet!' },
                { id: 'FM-4355', from: 'NAS', to: 'CLT', carrier: 'Blue Line Freight', pill: 'pill-muted', status: 'Delivered', eta: 'Feb 27 ✓', etaColor: 'var(--muted)', msg: ',FM-4355,Nashville → Charlotte · Delivered' },
              ].map(row => (
                <tr key={row.id} onClick={() => { const [i,t,s] = row.msg.split(','); showToast(i,t,s) }}>
                  <td className="mono" style={{ color: 'var(--accent3)', fontSize: 11 }}>{row.id}</td>
                  <td style={{ fontWeight: 700 }}>{row.from}→{row.to}</td>
                  <td style={{ fontSize: 12 }}>{row.carrier}</td>
                  <td><span className={'pill ' + row.pill}><span className="pill-dot" />{row.status}</span></td>
                  <td style={{ fontSize: 11, color: row.etaColor }}>{row.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Bell} size={14} /> Alerts</div>
              <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 20 }}>5 Active</span>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { borderColor: 'var(--danger)', bg: 'rgba(239,68,68,0.04)', titleIcon: AlertTriangle, titleText: 'FM-4412 — No Carrier Match', sub: 'Pickup in 8 hours · PHX→LAX', msg: ',No Carrier Match,FM-4412 pickup in 8hrs. Action needed!' },
                { borderColor: 'var(--warning)', bg: 'rgba(245,158,11,0.04)', titleIcon: DollarSign, titleText: 'Invoice FM-4301 Overdue', sub: 'SteelWorks · $2,200 · 14 days', msg: ',Invoice Overdue,SteelWorks Corp $2,200 · 14 days overdue' },
                { borderColor: 'var(--accent3)', bg: 'rgba(77,142,240,0.04)', titleIcon: Zap, titleText: 'ATL→CHI Rate Spike +12%', sub: 'Good window · Book shippers now', msg: ',Rate Spike,ATL→CHI rates 12% above avg right now' },
              ].map(alert => (
                <div key={alert.titleText}
                  onClick={() => { const [i,t,s] = alert.msg.split(','); showToast(i,t,s) }}
                  style={{ padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid ' + alert.borderColor, background: alert.bg, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={alert.titleIcon} size={14} /> {alert.titleText}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{alert.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={DollarSign} size={14} /> Revenue Snapshot</div></div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Gross MTD', value: '$84K', color: 'var(--accent)', bg: 'var(--surface2)' },
                  { label: 'Carrier Pay', value: '$68K', color: 'var(--danger)', bg: 'var(--surface2)' },
                  { label: 'Net (19%)', value: '$16K', color: 'var(--success)', bg: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' },
                ].map(item => (
                  <div key={item.label} style={{ background: item.bg, border: item.border, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
