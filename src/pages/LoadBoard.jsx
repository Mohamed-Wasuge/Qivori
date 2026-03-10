import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { CheckCircle, Smartphone, Zap, Package } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const LOADS = [
  { id: 'FM-4421', from: 'ATL', to: 'CHI', miles: '1,088mi', rate: '$3,200', rpm: '$2.94', weight: '42,000 lbs', pill: 'pill-blue', status: 'Matched', ai: true, action: 'Book', actionMsg: ',Booked!,FM-4421 confirmed with R&J Transport' },
  { id: 'FM-4430', from: 'DAL', to: 'MIA', miles: '1,491mi', rate: '$4,800', rpm: '$3.22', weight: '38,500 lbs', pill: 'pill-yellow', status: 'Open', ai: true, action: 'Book', actionMsg: ',Booked!,FM-4430 confirmed with Southern Freight' },
  { id: 'FM-4412', from: 'PHX', to: 'LAX', miles: '372mi', rate: '$1,850', rpm: '$2.41', weight: '45,000 lbs', pill: 'pill-red', status: 'Urgent', ai: false, action: 'SMS Match', actionMsg: ',SMS Sent!,AI texting top 10 matched carriers now' },
  { id: 'FM-4440', from: 'MEM', to: 'NYC', miles: '1,100mi', rate: '$5,100', rpm: '$3.10', weight: '39,800 lbs', pill: 'pill-yellow', status: 'Open', ai: true, action: 'Book', actionMsg: ',Booked!,FM-4440 confirmed' },
  { id: 'FM-4445', from: 'DEN', to: 'HOU', miles: '1,020mi', rate: '$3,400', rpm: '$2.61', weight: '41,200 lbs', pill: 'pill-yellow', status: 'Open', ai: false, action: 'Book', actionMsg: ',Booked!,FM-4445 confirmed' },
]

const FILTERS = ['All Loads', 'AI Match', 'Dry Van', 'Reefer', 'Flatbed', 'Southeast', 'Midwest', 'Northeast']

export default function LoadBoard() {
  const { showToast } = useApp()
  const [activeFilter, setActiveFilter] = useState('All Loads')

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="load-board-filters">
        {FILTERS.map(f => (
          <button key={f} className={'filter-chip' + (activeFilter === f ? ' active' : '')} onClick={() => setActiveFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Active Loads', value: '247', change: '↑ 18 today', type: 'up', color: 'var(--accent)' },
          { label: 'Avg Rate/Mile', value: '$2.84', change: '↓ $0.06', type: 'down' },
          { label: 'AI Matches', value: '38', change: '94% accepted', type: 'neutral', color: 'var(--accent2)' },
          { label: 'Carriers Ready', value: '52', change: '↑ 7 online', type: 'up', color: 'var(--accent3)' },
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
          <div className="panel-title"><span className="live-dot" /> Live Load Board</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost">Sort: Best Rate</button>
            <button className="btn btn-primary" onClick={() => showToast('', 'Post Load', 'Opening load posting form...')}>+ Post Load</button>
          </div>
        </div>
        <div className="load-row header">
          <div>Load ID</div><div>Route</div><div>Rate</div><div>RPM</div><div>Weight</div><div>Status</div><div>Action</div>
        </div>
        {LOADS.map(load => (
          <div key={load.id} className="load-row" onClick={() => showToast('', load.id, load.from + '→' + load.to + ' · ' + load.rate)}>
            <div className="mono" style={{ color: 'var(--accent3)', fontSize: 12 }}>
              {load.id}
              {load.ai && <span style={{ fontSize: 9, background: 'rgba(240,165,0,0.1)', color: 'var(--accent)', padding: '1px 5px', borderRadius: 3, marginLeft: 4 }}>AI</span>}
            </div>
            <div className="route-display">
              <span className="route-city">{load.from}</span>
              <span className="route-arrow">→</span>
              <span className="route-city">{load.to}</span>
              <span className="route-miles">{load.miles}</span>
            </div>
            <div className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>{load.rate}</div>
            <div className="mono" style={{ color: 'var(--accent2)' }}>{load.rpm}</div>
            <div>{load.weight}</div>
            <div><span className={'pill ' + load.pill}><span className="pill-dot" />{load.status}</span></div>
            <div>
              <button
                className="btn btn-ghost"
                style={{ padding: '5px 10px', fontSize: 11 }}
                onClick={e => { e.stopPropagation(); const [i,t,s] = load.actionMsg.split(','); showToast(i,t,s) }}
              >
                {load.action}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
