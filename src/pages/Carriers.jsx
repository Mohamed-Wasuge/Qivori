import { useApp } from '../context/AppContext'
import { Truck, Star } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const CARRIERS = [
  { name: "R&J Transport", mc: 'MC-338821', city: 'Atlanta, GA', equip: "Dry Van 53'", score: 97, scoreColor: 'var(--success)', rating: '4.9', loads: 12, pill: 'pill-green', status: 'Online', btnLabel: 'Send Load', btnMsg: ",SMS Sent,Load offer sent to R&J Transport" },
  { name: 'Express Carriers Inc', mc: 'MC-449022', city: 'Chicago, IL', equip: "Dry Van 53'", score: 94, scoreColor: 'var(--success)', rating: '4.9', loads: 8, pill: 'pill-green', status: 'Online', btnLabel: 'Send Load', btnMsg: ',SMS Sent,Load offer sent to Express Carriers' },
  { name: 'Southern Freight', mc: 'MC-221198', city: 'Dallas, TX', equip: "Reefer 53'", score: 91, scoreColor: 'var(--accent)', rating: '4.8', loads: 14, pill: 'pill-blue', status: 'On Load', btnLabel: 'Busy', btnMsg: '' },
  { name: 'Blue Line Freight', mc: 'MC-118844', city: 'Memphis, TN', equip: "Flatbed 48'", score: 88, scoreColor: 'var(--accent)', rating: '4.7', loads: 5, pill: 'pill-green', status: 'Online', btnLabel: 'Send Load', btnMsg: ',SMS Sent,Load offer sent to Blue Line Freight' },
  { name: "Mike's Hauling LLC", mc: 'MC-339012', city: 'Dallas, TX', equip: "Reefer 48'", score: 82, scoreColor: 'var(--muted)', rating: '4.6', loads: 4, pill: 'pill-muted', status: 'Offline', btnLabel: 'Message', btnMsg: ",SMS Sent,Message sent to Mike's Hauling" },
]

export default function Carriers() {
  const { navigatePage, showToast } = useApp()

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Carriers', value: '52', change: '↑ 7 this week', type: 'up', color: 'var(--accent)' },
          { label: 'Online Now', value: '18', change: 'Available', type: 'neutral', color: 'var(--success)' },
          { label: 'Avg Rating', value: '4.8', change: '↑ 0.1', type: 'up', color: 'var(--accent2)' },
          { label: 'Loads This Month', value: '184', change: '↑ 12%', type: 'up', color: 'var(--accent3)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className={'stat-change ' + s.type}>{s.change}</div>
          </div>
        ))}
      </div>

      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Truck} size={14} /> Carrier Network</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost">Export</button>
            <button className="btn btn-primary" onClick={() => navigatePage('onboarding')}>+ Onboard Carrier</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Carrier</th><th>Location</th><th>Equipment</th><th>Score</th><th>Rating</th><th>Loads</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {CARRIERS.map(c => (
              <tr key={c.mc} onClick={() => showToast('', c.name, c.city + ' · ' + c.mc + ' · ' + c.rating + ' stars')}>
                <td>
                  <strong>{c.name}</strong><br />
                  <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{c.mc}</span>
                </td>
                <td style={{ fontSize: 12 }}>{c.city}</td>
                <td style={{ fontSize: 12 }}>{c.equip}</td>
                <td style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: c.scoreColor }}>{c.score}</td>
                <td style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic icon={Star} size={12} /> {c.rating}</td>
                <td>{c.loads}</td>
                <td><span className={'pill ' + c.pill}><span className="pill-dot" />{c.status}</span></td>
                <td>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '5px 10px', fontSize: 11, opacity: c.btnLabel === 'Busy' ? 0.5 : 1 }}
                    onClick={e => {
                      e.stopPropagation()
                      if (c.btnMsg) { const [i,t,s] = c.btnMsg.split(','); showToast(i,t,s) }
                    }}
                    disabled={c.btnLabel === 'Busy'}
                  >
                    {c.btnLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
