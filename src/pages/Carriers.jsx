import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Truck, Star, Search, CheckCircle, XCircle, Eye, Ban, Mail } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />
const FILTERS = ['All', 'active', 'trial', 'pending', 'suspended']

export default function Carriers() {
  const { showToast } = useApp()
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [carriers, setCarriers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCarriers = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'carrier').order('created_at', { ascending: false })
    setCarriers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchCarriers() }, [])

  const updateStatus = async (id, status, name) => {
    await supabase.from('profiles').update({ status }).eq('id', id)
    showToast('', status === 'active' ? 'Approved' : status === 'suspended' ? 'Suspended' : 'Updated', name + ' — ' + status)
    fetchCarriers()
  }

  const filtered = carriers.filter(c => {
    if (filter !== 'All' && c.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.full_name || '').toLowerCase().includes(q) ||
        (c.company_name || '').toLowerCase().includes(q) ||
        (c.mc_number || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    }
    return true
  })

  const active = carriers.filter(c => c.status === 'active').length
  const trial = carriers.filter(c => c.status === 'trial').length
  const pending = carriers.filter(c => c.status === 'pending').length

  const statusPill = (s) => ({ active: 'pill-green', trial: 'pill-blue', pending: 'pill-yellow', suspended: 'pill-red' }[s] || 'pill-muted')

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading carriers...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Carriers', value: carriers.length, color: 'var(--accent)' },
          { label: 'Active', value: active, color: 'var(--success)' },
          { label: 'On Trial', value: trial, color: 'var(--accent3)' },
          { label: 'Pending', value: pending, color: 'var(--warning)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
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
          </div>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
              {f === 'All' ? f : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {carriers.length === 0 ? 'No carriers have signed up yet.' : 'No carriers match your filter.'}
          </div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Location</th><th>Plan</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.full_name || 'No name'}</strong></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{c.email}</td>
                  <td style={{ fontSize: 12 }}>{c.company_name || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td style={{ fontSize: 11, fontWeight: 600 }}>{c.plan || 'trial'}</td>
                  <td><span className={'pill ' + statusPill(c.status)}><span className="pill-dot" />{c.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(c.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {c.status === 'pending' && (
                        <button className="btn btn-success" style={{ padding: '4px 8px', fontSize: 10 }}
                          onClick={() => updateStatus(c.id, 'active', c.full_name || c.email)}>
                          <Ic icon={CheckCircle} size={12} /> Approve
                        </button>
                      )}
                      {c.status === 'suspended' && (
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                          onClick={() => updateStatus(c.id, 'active', c.full_name || c.email)}>
                          <Ic icon={CheckCircle} size={12} /> Reactivate
                        </button>
                      )}
                      {c.status !== 'suspended' && c.status !== 'pending' && (
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--danger)' }}
                          onClick={() => updateStatus(c.id, 'suspended', c.full_name || c.email)}>
                          <Ic icon={Ban} size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
