import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { apiFetch } from '../../lib/api'
import { Users, Send, Search, Download, Trash2 } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export function WaitlistManager() {
  const { showToast } = useApp()
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [sending, setSending] = useState(false)

  const fetchWaitlist = async () => {
    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setEmails(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchWaitlist() }, [])

  const filtered = emails.filter(e => {
    if (!search) return true
    return e.email.toLowerCase().includes(search.toLowerCase())
  })

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(e => e.id)))
    }
  }

  const handleInvite = async (email) => {
    try {
      const res = await apiFetch('/api/invite-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'carrier' })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send invite')
      }
      showToast('', 'Invite Sent', 'Invitation email sent to ' + email)
    } catch (e) {
      showToast('', 'Invite Failed', e.message, 'error')
    }
  }

  const handleBulkInvite = async () => {
    if (selected.size === 0) return
    setSending(true)
    const selectedEmails = emails.filter(e => selected.has(e.id))
    let sent = 0, failed = 0
    for (const entry of selectedEmails) {
      try {
        const res = await apiFetch('/api/invite-driver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: entry.email, role: 'carrier' })
        })
        if (res.ok) sent++; else failed++
      } catch { failed++ }
    }
    showToast('', 'Bulk Invite Done', `${sent} sent, ${failed} failed`)
    setSending(false)
    setSelected(new Set())
  }

  const handleExportCSV = () => {
    const csv = ['Email,Signed Up']
    emails.forEach(e => csv.push(`"${e.email}","${e.created_at}"`))
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'qivori-waitlist.csv'; a.click()
    showToast('', 'Exported', `Downloaded ${emails.length} waitlist emails`)
  }

  const handleDelete = async (id) => {
    await supabase.from('waitlist').delete().eq('id', id)
    showToast('', 'Removed', 'Email removed from waitlist')
    fetchWaitlist()
  }

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

  // Signups over time
  const today = new Date().toDateString()
  const todayCount = emails.filter(e => new Date(e.created_at).toDateString() === today).length
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const weekCount = emails.filter(e => new Date(e.created_at) > weekAgo).length

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading waitlist...</div>

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Waitlist', value: emails.length, color: 'var(--accent)' },
          { label: 'Today', value: todayCount, color: todayCount > 0 ? 'var(--success)' : 'var(--muted)' },
          { label: 'This Week', value: weekCount, color: weekCount > 0 ? 'var(--accent2)' : 'var(--muted)' },
          { label: 'Selected', value: selected.size, color: selected.size > 0 ? 'var(--accent3)' : 'var(--muted)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Waitlist table */}
      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={Users} size={14} /> Waitlist Emails</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
              <input className="form-input" placeholder="Search emails..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 180, height: 34, fontSize: 12 }} />
            </div>
            {selected.size > 0 && (
              <button className="btn btn-primary" onClick={handleBulkInvite} disabled={sending} style={{ fontSize: 11 }}>
                <Ic icon={Send} size={12} /> {sending ? 'Sending...' : `Invite ${selected.size} Selected`}
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleExportCSV} style={{ fontSize: 11 }}>
              <Ic icon={Download} size={12} /> Export CSV
            </button>
          </div>
        </div>

        {emails.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <Ic icon={Users} size={28} style={{ marginBottom: 10, opacity: 0.3 }} /><br />
            No waitlist signups yet. Share qivori.com to start collecting leads!
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={selectAll} style={{ cursor: 'pointer' }} />
                </th>
                <th>Email</th>
                <th>Signed Up</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(e.id)}
                      onChange={() => toggleSelect(e.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td><strong style={{ fontSize: 13 }}>{e.email}</strong></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(e.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={() => handleInvite(e.email)}>
                        <Ic icon={Send} size={11} /> Invite
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--danger)' }}
                        onClick={() => handleDelete(e.id)}>
                        <Ic icon={Trash2} size={11} />
                      </button>
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
