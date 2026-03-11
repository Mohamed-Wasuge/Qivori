import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Truck, Star, Search, CheckCircle, XCircle, Eye, Ban, Mail, Filter } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const CARRIERS = [
  { name: 'R&J Transport', mc: 'MC-338821', email: 'james@rjtransport.com', city: 'Atlanta, GA', equip: "Dry Van 53'", plan: 'Small Fleet', mrr: '$99', status: 'Active', joined: 'Jan 15', loads: 48, rating: 4.9 },
  { name: 'Express Carriers Inc', mc: 'MC-449022', email: 'dispatch@expresscarriers.com', city: 'Chicago, IL', equip: "Dry Van 53'", plan: 'Growing Fleet', mrr: '$199', status: 'Active', joined: 'Jan 22', loads: 32, rating: 4.9 },
  { name: 'Southern Freight', mc: 'MC-221198', email: 'ops@southernfreight.com', city: 'Dallas, TX', equip: "Reefer 53'", plan: 'Small Fleet', mrr: '$99', status: 'Active', joined: 'Feb 3', loads: 56, rating: 4.8 },
  { name: 'Blue Line Freight', mc: 'MC-118844', email: 'info@bluelinefreight.com', city: 'Memphis, TN', equip: "Flatbed 48'", plan: 'Solo', mrr: '$49', status: 'Active', joined: 'Feb 10', loads: 18, rating: 4.7 },
  { name: 'FastHaul Express', mc: 'MC-552109', email: 'admin@fasthaulexpress.com', city: 'Houston, TX', equip: "Dry Van 53'", plan: 'Small Fleet', mrr: '$99', status: 'Trial', joined: 'Mar 8', loads: 3, rating: 0 },
  { name: 'PrimeRoute LLC', mc: 'MC-667432', email: 'contact@primeroute.com', city: 'Phoenix, AZ', equip: "Reefer 48'", plan: 'Solo', mrr: '$0', status: 'Pending', joined: 'Mar 7', loads: 0, rating: 0 },
  { name: 'Summit Transport', mc: 'MC-443218', email: 'dispatch@summit.com', city: 'Denver, CO', equip: "Flatbed 48'", plan: 'Solo', mrr: '$49', status: 'Active', joined: 'Mar 5', loads: 7, rating: 4.6 },
  { name: "Mike's Hauling LLC", mc: 'MC-339012', email: 'mike@mikeshauling.com', city: 'Dallas, TX', equip: "Reefer 48'", plan: 'Solo', mrr: '$49', status: 'Suspended', joined: 'Dec 12', loads: 14, rating: 3.2 },
]

const FILTERS = ['All', 'Active', 'Trial', 'Pending', 'Suspended']

export default function Carriers() {
  const { showToast } = useApp()
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  const filtered = CARRIERS.filter(c => {
    if (filter !== 'All' && c.status !== filter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.mc.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statusPill = (s) => {
    const map = { Active: 'pill-green', Trial: 'pill-blue', Pending: 'pill-yellow', Suspended: 'pill-red' }
    return map[s] || 'pill-muted'
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Carriers', value: '52', change: '+5 this month', color: 'var(--accent)' },
          { label: 'Active', value: '46', change: 'Paying customers', color: 'var(--success)' },
          { label: 'On Trial', value: '3', change: '14-day free trial', color: 'var(--accent3)' },
          { label: 'Carrier MRR', value: '$3,280', change: '+18% vs last mo', color: 'var(--accent)' },
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
          <div className="panel-title"><Ic icon={Truck} size={14} /> Carrier Accounts</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
              <input className="form-input" placeholder="Search carriers..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 200, height: 34, fontSize: 12 }} />
            </div>
            <button className="btn btn-primary" onClick={() => showToast('', 'Invite Sent', 'Carrier invitation email sent')}>+ Invite Carrier</button>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        <table>
          <thead><tr><th>Company</th><th>Plan</th><th>MRR</th><th>Loads</th><th>Rating</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.mc}>
                <td>
                  <strong>{c.name}</strong><br />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{c.mc} · {c.city}</span>
                </td>
                <td><span style={{ fontSize: 11, fontWeight: 600 }}>{c.plan}</span></td>
                <td className="mono" style={{ fontWeight: 700, color: c.mrr === '$0' ? 'var(--muted)' : 'var(--accent)' }}>{c.mrr}</td>
                <td>{c.loads}</td>
                <td>
                  {c.rating > 0 ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Ic icon={Star} size={12} color="var(--accent)" /> {c.rating}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>New</span>
                  )}
                </td>
                <td><span className={'pill ' + statusPill(c.status)}><span className="pill-dot" />{c.status}</span></td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>{c.joined}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {c.status === 'Pending' && (
                      <button className="btn btn-success" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={e => { e.stopPropagation(); showToast('', 'Carrier Approved', c.name + ' is now active on the platform') }}>
                        <Ic icon={CheckCircle} size={12} /> Approve
                      </button>
                    )}
                    {c.status === 'Active' && (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={e => { e.stopPropagation(); showToast('', 'Viewing', c.name + ' · ' + c.email) }}>
                        <Ic icon={Eye} size={12} /> View
                      </button>
                    )}
                    {c.status === 'Suspended' && (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={e => { e.stopPropagation(); showToast('', 'Reactivated', c.name + ' account restored') }}>
                        <Ic icon={CheckCircle} size={12} /> Reactivate
                      </button>
                    )}
                    {c.status !== 'Suspended' && c.status !== 'Pending' && (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--danger)' }}
                        onClick={e => { e.stopPropagation(); showToast('', 'Suspended', c.name + ' has been suspended') }}>
                        <Ic icon={Ban} size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
