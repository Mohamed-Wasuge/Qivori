import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Package, Search, Plus, X } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const FILTERS = ['All', 'Open', 'Booked', 'In Transit', 'Delivered']

const STATUS_MAP = {
  open: 'Open',
  booked: 'Booked',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const REVERSE_STATUS = Object.fromEntries(Object.entries(STATUS_MAP).map(([k, v]) => [v, k]))

const generateLoadId = () => 'QV-' + String(Math.floor(1000 + Math.random() * 9000))

const formatDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = (now - d) / 86400000
  if (diff < 1 && d.getDate() === now.getDate()) return 'Today'
  if (diff < 2 && d.getDate() === now.getDate() - 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatRate = (r) => r != null ? '$' + Number(r).toLocaleString() : '—'

const INITIAL_FORM = { origin: '', destination: '', rate: '', load_type: 'FTL', equipment: 'Dry Van', weight: '' }

export default function LoadBoard() {
  const { showToast } = useApp()
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [posting, setPosting] = useState(false)

  const fetchLoads = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('loads')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching loads:', error)
      showToast('error', 'Error', 'Failed to load data')
    } else {
      setLoads(data || [])
    }
    setLoading(false)
  }, [showToast])

  useEffect(() => { fetchLoads() }, [fetchLoads])

  const stats = {
    total: loads.length,
    open: loads.filter(l => l.status === 'open').length,
    inTransit: loads.filter(l => l.status === 'in_transit').length,
    delivered: loads.filter(l => l.status === 'delivered').length,
  }

  const filtered = loads.filter(l => {
    const displayStatus = STATUS_MAP[l.status] || l.status
    if (filter !== 'All' && displayStatus !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      const haystack = [l.load_id, l.origin, l.destination, l.broker_name, l.carrier_name]
        .filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const statusPill = (s) => ({
    Open: 'pill-yellow',
    Booked: 'pill-blue',
    'In Transit': 'pill-green',
    Delivered: 'pill-muted',
    Cancelled: 'pill-red',
  }[s] || 'pill-muted')

  const handlePost = async (e) => {
    e.preventDefault()
    if (!form.origin || !form.destination || !form.rate) {
      showToast('error', 'Missing fields', 'Origin, destination and rate are required')
      return
    }
    setPosting(true)
    const newLoad = {
      load_id: generateLoadId(),
      origin: form.origin,
      destination: form.destination,
      rate: parseFloat(form.rate),
      load_type: form.load_type,
      equipment: form.equipment,
      weight: form.weight ? parseFloat(form.weight) : null,
      status: 'open',
      posted_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('loads').insert([newLoad])
    if (error) {
      console.error('Error posting load:', error)
      showToast('error', 'Error', 'Failed to post load')
    } else {
      showToast('success', 'Load Posted', `${newLoad.load_id} created successfully`)
      setForm(INITIAL_FORM)
      setShowModal(false)
      fetchLoads()
    }
    setPosting(false)
  }

  const updateField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Loads', value: stats.total, change: `${loads.length} in system`, color: 'var(--accent)' },
          { label: 'Open', value: stats.open, change: 'Waiting for carrier', color: 'var(--warning)' },
          { label: 'In Transit', value: stats.inTransit, change: 'On the road', color: 'var(--success)' },
          { label: 'Delivered', value: stats.delivered, change: 'Completed', color: 'var(--accent2)' },
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
              <input className="form-input" placeholder="Search loads..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 200, height: 34, fontSize: 12 }} />
            </div>
            <button className="btn btn-primary" style={{ height: 34, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setShowModal(true)}>
              <Ic icon={Plus} size={13} /> Post Load
            </button>
          </div>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading loads...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            <Ic icon={Package} size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>No loads yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {loads.length === 0 ? 'Post your first load to get started' : 'No loads match your current filters'}
            </div>
          </div>
        ) : (
          <table>
            <thead><tr><th>Load</th><th>Route</th><th>Broker</th><th>Carrier</th><th>Rate</th><th>Type</th><th>Status</th><th>Posted</th></tr></thead>
            <tbody>
              {filtered.map(l => {
                const displayStatus = STATUS_MAP[l.status] || l.status
                return (
                  <tr key={l.id} onClick={() => showToast('', l.load_id, l.origin + ' -> ' + l.destination + ' · ' + formatRate(l.rate) + ' · ' + (l.broker_name || '—'))}>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--accent3)' }}>{l.load_id}</td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{l.origin} -> {l.destination}</span><br />
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{l.equipment || '—'}{l.weight ? ' · ' + l.weight + ' lbs' : ''}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{l.broker_name || '—'}</td>
                    <td style={{ fontSize: 12, color: l.carrier_name ? 'var(--text)' : 'var(--muted)' }}>{l.carrier_name || '—'}</td>
                    <td className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatRate(l.rate)}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--muted)' }}>{l.load_type || '—'}</span>
                    </td>
                    <td><span className={'pill ' + statusPill(displayStatus)}><span className="pill-dot" />{displayStatus}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(l.posted_at || l.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Post New Load</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }} onClick={() => setShowModal(false)}>
                <Ic icon={X} size={18} />
              </button>
            </div>
            <form onSubmit={handlePost} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Origin *</label>
                  <input className="form-input" placeholder="e.g. ATL" value={form.origin} onChange={updateField('origin')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Destination *</label>
                  <input className="form-input" placeholder="e.g. CHI" value={form.destination} onChange={updateField('destination')} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Rate ($) *</label>
                  <input className="form-input" type="number" placeholder="3200" value={form.rate} onChange={updateField('rate')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Weight (lbs)</label>
                  <input className="form-input" type="number" placeholder="42000" value={form.weight} onChange={updateField('weight')} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Load Type</label>
                  <select className="form-input" value={form.load_type} onChange={updateField('load_type')} style={inputStyle}>
                    <option value="FTL">FTL</option>
                    <option value="LTL">LTL</option>
                    <option value="Partial">Partial</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Equipment</label>
                  <select className="form-input" value={form.equipment} onChange={updateField('equipment')} style={inputStyle}>
                    <option value="Dry Van">Dry Van</option>
                    <option value="Reefer">Reefer</option>
                    <option value="Flatbed">Flatbed</option>
                    <option value="Step Deck">Step Deck</option>
                    <option value="Box Truck">Box Truck</option>
                  </select>
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={posting}
                style={{ marginTop: 8, height: 40, fontSize: 13, fontWeight: 700 }}>
                {posting ? 'Posting...' : 'Post Load'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' }
const inputStyle = { width: '100%', height: 36, fontSize: 13 }
