import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { apiFetch } from '../../lib/api'
import { Users, Search, CheckCircle, Trash2, Shield, Eye, AlertTriangle, X } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

/* ═══════════════════════════════════════════════════════════════════════════
   USER MANAGEMENT — Suspend, Activate, or Remove Users
   ═══════════════════════════════════════════════════════════════════════════ */
export function UserManagement() {
  const { user: adminUser, showToast } = useApp()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // { userId, email, action }

  useEffect(() => {
    loadProfiles()
  }, [])

  const loadProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setProfiles(data || [])
    setLoading(false)
  }

  const handleAction = async (userId, email, action) => {
    setActionLoading(userId)
    try {
      const res = await apiFetch('/api/admin-manage-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      const data = await res.json()
      if (data.success) {
        if (action === 'remove') {
          setProfiles(prev => prev.filter(p => p.id !== userId))
          showToast('', 'User Removed', `${email} has been permanently deleted along with all their data`)
        } else if (action === 'suspend') {
          setProfiles(prev => prev.map(p => p.id === userId ? { ...p, status: 'suspended' } : p))
          showToast('', 'User Suspended', `${email} has been suspended`)
        } else if (action === 'activate') {
          setProfiles(prev => prev.map(p => p.id === userId ? { ...p, status: 'active' } : p))
          showToast('', 'User Activated', `${email} has been reactivated`)
        }
      } else {
        showToast('error', 'Error', data.error || 'Action failed')
      }
    } catch (err) {
      showToast('error', 'Error', err.message || 'Action failed')
    }
    setActionLoading(null)
    setConfirmAction(null)
  }

  const handleResetPassword = async (userId, email) => {
    setActionLoading(userId)
    try {
      const res = await apiFetch('/api/admin-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, action: 'send_reset_link' }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('', 'Reset Link Sent', `Password reset email sent to ${email}`)
      } else {
        showToast('error', 'Error', data.error || 'Failed to send reset link')
      }
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to send reset link')
    }
    setActionLoading(null)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading users...</div>

  const filtered = profiles.filter(p => {
    if (filter !== 'all' && p.status !== filter && p.role !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (p.email || '').toLowerCase().includes(q) || (p.full_name || '').toLowerCase().includes(q) || (p.role || '').toLowerCase().includes(q)
    }
    return true
  })

  const statusBadge = (status) => {
    const map = {
      active: { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
      trial: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
      suspended: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
      cancelled: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
      pending: { bg: 'rgba(240,165,0,0.1)', color: '#f0a500' },
    }
    const s = map[status] || map.pending
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: s.bg, color: s.color }}>{(status || 'unknown').toUpperCase()}</span>
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Users', value: profiles.length, color: 'var(--accent)' },
          { label: 'Active', value: profiles.filter(p => p.status === 'active').length, color: 'var(--success)' },
          { label: 'Trial', value: profiles.filter(p => p.status === 'trial' || p.subscription_status === 'trialing').length, color: 'var(--accent3)' },
          { label: 'Suspended', value: profiles.filter(p => p.status === 'suspended').length, color: 'var(--danger)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="panel fade-in">
        <div className="panel-header" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="panel-title"><Ic icon={Users} size={14} /> All Users ({filtered.length})</div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email..."
              style={{ paddingLeft: 30, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px 7px 30px', color: 'var(--text)', fontSize: 12, width: 200, fontFamily: "'DM Sans',sans-serif" }} />
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
            <option value="admin">Admins</option>
            <option value="carrier">Carriers</option>
            <option value="broker">Brokers</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Joined</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const isAdmin = p.role === 'admin'
              const isSelf = p.id === adminUser?.id
              const isSuspended = p.status === 'suspended'
              return (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: isAdmin ? 'rgba(240,165,0,0.15)' : 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: isAdmin ? 'var(--accent)' : 'var(--muted)', flexShrink: 0 }}>
                        {(p.full_name || p.email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.full_name || 'No Name'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: isAdmin ? 'rgba(240,165,0,0.1)' : 'var(--surface2)', color: isAdmin ? 'var(--accent)' : 'var(--muted)', textTransform: 'uppercase' }}>{p.role || 'user'}</span></td>
                  <td style={{ fontSize: 12 }}>{p.plan || 'trial'}</td>
                  <td>{statusBadge(p.status)}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td style={{ textAlign: 'right' }}>
                    {!isSelf && !isAdmin && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {isSuspended ? (
                          <button onClick={() => handleAction(p.id, p.email, 'activate')}
                            disabled={actionLoading === p.id}
                            style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                            {actionLoading === p.id ? '...' : 'Activate'}
                          </button>
                        ) : (
                          <button onClick={() => handleAction(p.id, p.email, 'suspend')}
                            disabled={actionLoading === p.id}
                            style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(240,165,0,0.3)', background: 'rgba(240,165,0,0.08)', color: '#f0a500', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                            {actionLoading === p.id ? '...' : 'Suspend'}
                          </button>
                        )}
                        <button onClick={() => handleResetPassword(p.id, p.email)}
                          disabled={actionLoading === p.id}
                          style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)', color: '#3b82f6', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                          {actionLoading === p.id ? '...' : 'Reset PW'}
                        </button>
                        <button onClick={() => setConfirmAction({ userId: p.id, email: p.email, action: 'remove' })}
                          disabled={actionLoading === p.id}
                          style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                          {actionLoading === p.id ? '...' : 'Remove'}
                        </button>
                      </div>
                    )}
                    {isSelf && <span style={{ fontSize: 10, color: 'var(--muted)' }}>You</span>}
                    {isAdmin && !isSelf && <span style={{ fontSize: 10, color: 'var(--muted)' }}>Admin</span>}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30, fontSize: 13 }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Confirm remove modal */}
      {confirmAction && (
        <>
          <div onClick={() => setConfirmAction(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic icon={AlertTriangle} size={20} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)' }}>Permanently Remove User</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>This cannot be undone</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, marginBottom: 20, padding: 14, background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
              This will permanently delete <strong>{confirmAction.email}</strong> and all their data:
              <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
                <li>Auth account</li>
                <li>Profile</li>
                <li>All loads, invoices, expenses</li>
                <li>All drivers, vehicles, documents</li>
                <li>All settings and compliance records</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleAction(confirmAction.userId, confirmAction.email, 'remove')}
                disabled={actionLoading === confirmAction.userId}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                {actionLoading === confirmAction.userId ? 'Removing...' : 'Yes, Remove Permanently'}
              </button>
              <button onClick={() => setConfirmAction(null)}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
