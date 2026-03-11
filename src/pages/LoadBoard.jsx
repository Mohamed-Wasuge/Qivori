import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Package, Search } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const LOADS = [
  { id: 'QV-4421', from: 'ATL', to: 'CHI', miles: '1,088', broker: 'Elite Logistics', carrier: 'R&J Transport', rate: '$3,200', type: 'FTL', equip: 'Dry Van', status: 'Booked', posted: 'Today' },
  { id: 'QV-4430', from: 'DAL', to: 'MIA', miles: '1,491', broker: 'Elite Logistics', carrier: 'Southern Freight', rate: '$4,800', type: 'FTL', equip: 'Reefer', status: 'In Transit', posted: 'Today' },
  { id: 'QV-4412', from: 'PHX', to: 'LAX', miles: '372', broker: 'Coastal Brokerage', carrier: '—', rate: '$1,850', type: 'FTL', equip: 'Flatbed', status: 'Open', posted: 'Today' },
  { id: 'QV-4440', from: 'MEM', to: 'NYC', miles: '1,100', broker: 'Midwest Freight', carrier: 'Express Carriers', rate: '$5,100', type: 'FTL', equip: 'Dry Van', status: 'In Transit', posted: 'Yesterday' },
  { id: 'QV-4445', from: 'DEN', to: 'HOU', miles: '1,020', broker: 'Coastal Brokerage', carrier: '—', rate: '$3,400', type: 'Partial', equip: 'Dry Van', status: 'Open', posted: 'Yesterday' },
  { id: 'QV-4450', from: 'CHI', to: 'ATL', miles: '718', broker: 'Elite Logistics', carrier: 'Blue Line Freight', rate: '$2,100', type: 'LTL', equip: 'Dry Van', status: 'Delivered', posted: 'Mar 8' },
  { id: 'QV-4455', from: 'MIA', to: 'DAL', miles: '1,312', broker: 'Midwest Freight', carrier: 'R&J Transport', rate: '$3,900', type: 'FTL', equip: 'Reefer', status: 'Delivered', posted: 'Mar 7' },
]

const FILTERS = ['All', 'Open', 'Booked', 'In Transit', 'Delivered']

export default function LoadBoard() {
  const { showToast } = useApp()
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  const filtered = LOADS.filter(l => {
    if (filter !== 'All' && l.status !== filter) return false
    if (search && !l.id.toLowerCase().includes(search.toLowerCase()) && !l.broker.toLowerCase().includes(search.toLowerCase()) && !l.carrier.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statusPill = (s) => ({ Open: 'pill-yellow', Booked: 'pill-blue', 'In Transit': 'pill-green', Delivered: 'pill-muted' }[s] || 'pill-muted')

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Loads', value: '247', change: '+18 today', color: 'var(--accent)' },
          { label: 'Open', value: '42', change: 'Waiting for carrier', color: 'var(--warning)' },
          { label: 'In Transit', value: '89', change: 'On the road', color: 'var(--success)' },
          { label: 'Delivered MTD', value: '116', change: '+12% vs last mo', color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-change up">{s.change}</div>
          </div>
        ))}
      </div>

      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={Package} size={14} /> All Platform Loads</div>
          <div style={{ position: 'relative' }}>
            <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
            <input className="form-input" placeholder="Search loads..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30, width: 200, height: 34, fontSize: 12 }} />
          </div>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        <table>
          <thead><tr><th>Load</th><th>Route</th><th>Broker</th><th>Carrier</th><th>Rate</th><th>Type</th><th>Status</th><th>Posted</th></tr></thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id} onClick={() => showToast('', l.id, l.from + '→' + l.to + ' · ' + l.rate + ' · ' + l.broker)}>
                <td className="mono" style={{ fontSize: 11, color: 'var(--accent3)' }}>{l.id}</td>
                <td>
                  <span style={{ fontWeight: 700 }}>{l.from} → {l.to}</span><br />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{l.miles} mi · {l.equip}</span>
                </td>
                <td style={{ fontSize: 12 }}>{l.broker}</td>
                <td style={{ fontSize: 12, color: l.carrier === '—' ? 'var(--muted)' : 'var(--text)' }}>{l.carrier}</td>
                <td className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{l.rate}</td>
                <td>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--muted)' }}>{l.type}</span>
                </td>
                <td><span className={'pill ' + statusPill(l.status)}><span className="pill-dot" />{l.status}</span></td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>{l.posted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
