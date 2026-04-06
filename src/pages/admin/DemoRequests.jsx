import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { Search, Download, Trash2, RefreshCw, Copy, Monitor } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export function DemoRequests() {
  const { showToast } = useApp()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('demo_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchRequests() }, [])

  const filtered = requests.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (r.email || '').toLowerCase().includes(q) ||
           (r.name || '').toLowerCase().includes(q) ||
           (r.company || '').toLowerCase().includes(q) ||
           (r.current_eld || '').toLowerCase().includes(q) ||
           (r.factoring_company || '').toLowerCase().includes(q) ||
           (r.load_boards || '').toLowerCase().includes(q) ||
           (r.pain_points || '').toLowerCase().includes(q)
  })

  const formatDate = (d) => {
    if (!d) return '—'
    const date = new Date(d)
    const now = new Date()
    const diff = now - date
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min ago'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'hr ago'
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' day(s) ago'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const handleExportCSV = () => {
    const csv = ['Name,Email,Phone,Company,Trucks,ELD,Factoring,Load Boards,Pain Points,Source,Converted,Requested At']
    requests.forEach(r => csv.push(`"${r.name || ''}","${r.email}","${r.phone || ''}","${r.company || ''}","${r.truck_count || ''}","${r.current_eld || ''}","${r.factoring_company || ''}","${r.load_boards || ''}","${(r.pain_points || '').replace(/"/g, '""')}","${r.source || ''}","${r.converted ? 'Yes' : 'No'}","${r.created_at}"`))
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'qivori-demo-requests.csv'; a.click()
    showToast('', 'Exported', `Downloaded ${requests.length} demo requests`)
  }

  const toggleConverted = async (id, current) => {
    await supabase.from('demo_requests').update({ converted: !current }).eq('id', id)
    showToast('', !current ? 'Marked Converted' : 'Unmarked', 'Status updated')
    fetchRequests()
  }

  const handleDelete = async (id) => {
    await supabase.from('demo_requests').delete().eq('id', id)
    showToast('', 'Removed', 'Demo request deleted')
    fetchRequests()
  }

  const today = new Date().toDateString()
  const todayCount = requests.filter(r => new Date(r.created_at).toDateString() === today).length
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const weekCount = requests.filter(r => new Date(r.created_at) > weekAgo).length
  const convertedCount = requests.filter(r => r.converted).length

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading demo requests...</div>

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Requests', value: requests.length, color: 'var(--accent)' },
          { label: 'Today', value: todayCount, color: todayCount > 0 ? 'var(--success)' : 'var(--muted)' },
          { label: 'This Week', value: weekCount, color: weekCount > 0 ? 'var(--accent2)' : 'var(--muted)' },
          { label: 'Converted', value: convertedCount, color: convertedCount > 0 ? 'var(--success)' : 'var(--muted)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={Monitor} size={14} /> Demo Requests</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
              <input className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 180, height: 34, fontSize: 12 }} />
            </div>
            <button className="btn btn-ghost" onClick={handleExportCSV} style={{ fontSize: 11 }}>
              <Ic icon={Download} size={12} /> Export CSV
            </button>
            <button className="btn btn-ghost" onClick={() => { setLoading(true); fetchRequests() }} style={{ fontSize: 11 }}>
              <Ic icon={RefreshCw} size={12} /> Refresh
            </button>
          </div>
        </div>

        {requests.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <Ic icon={Monitor} size={28} style={{ marginBottom: 10, opacity: 0.3 }} /><br />
            No demo requests yet. Share qivori.com to start collecting leads!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Company</th>
                <th>Trucks</th>
                <th>ELD</th>
                <th>Factoring</th>
                <th>Load Boards</th>
                <th>Pain Points</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 13, fontWeight: 600 }}>{r.name || '—'}</td>
                  <td><strong style={{ fontSize: 12 }}>{r.email}</strong></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.phone || '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.company || '—'}</td>
                  <td style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{r.truck_count || '—'}</td>
                  <td style={{ fontSize: 11 }}>{r.current_eld ? <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: 'var(--accent2)', fontWeight: 700, fontSize: 10 }}>{r.current_eld}</span> : '—'}</td>
                  <td style={{ fontSize: 11 }}>{r.factoring_company ? <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', fontWeight: 700, fontSize: 10 }}>{r.factoring_company}</span> : '—'}</td>
                  <td style={{ fontSize: 11 }}>{r.load_boards ? <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(240,165,0,0.1)', color: 'var(--accent)', fontWeight: 700, fontSize: 10 }}>{r.load_boards}</span> : '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.pain_points || ''}>{r.pain_points || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(r.created_at)}</td>
                  <td>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 700, cursor: 'pointer',
                      background: r.converted ? 'rgba(34,197,94,0.1)' : 'rgba(107,117,144,0.1)',
                      color: r.converted ? 'var(--success)' : 'var(--muted)',
                    }} onClick={() => toggleConverted(r.id, r.converted)}>
                      {r.converted ? 'Converted' : 'Lead'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={() => { navigator.clipboard.writeText(r.email); showToast('', 'Copied', r.email) }}>
                        <Ic icon={Copy} size={11} />
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--danger)' }}
                        onClick={() => handleDelete(r.id)}>
                        <Ic icon={Trash2} size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
