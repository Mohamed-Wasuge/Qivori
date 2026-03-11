import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Truck, Search, CheckCircle, Ban, Eye, Shield, Building2, Zap, ChevronDown, UserPlus, X } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />
const FILTERS = ['All', 'active', 'trial', 'pending', 'suspended']
const ROLE_FILTERS = ['All Roles', 'carrier', 'broker', 'admin']

export default function Carriers() {
  const { showToast } = useApp()
  const [filter, setFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All Roles')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingRole, setEditingRole] = useState(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', company_name: '', role: 'carrier' })
  const [addingUser, setAddingUser] = useState(false)

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const updateStatus = async (id, status, name) => {
    await supabase.from('profiles').update({ status }).eq('id', id)
    showToast('', status === 'active' ? 'Approved' : status === 'suspended' ? 'Suspended' : 'Updated', name + ' — ' + status)
    fetchUsers()
  }

  const updateRole = async (id, role, name) => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    showToast('', 'Role Changed', name + ' is now ' + role.toUpperCase())
    setEditingRole(null)
    fetchUsers()
  }

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      showToast('', 'Error', 'Fill in name, email, and password')
      return
    }
    setAddingUser(true)
    try {
      const res = await fetch('https://jrencclzfztrilrldmwf.supabase.co/auth/v1/admin/users', {
        method: 'POST',
        headers: {
          'apikey': 'sb_secret_FqzPMGPOIz-ivGkm2h0aRA_2SgAH26C',
          'Authorization': 'Bearer sb_secret_FqzPMGPOIz-ivGkm2h0aRA_2SgAH26C',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: newUser.email, password: newUser.password, email_confirm: true })
      })
      const authData = await res.json()
      if (authData.id) {
        await supabase.from('profiles').insert({
          id: authData.id, email: newUser.email, role: newUser.role,
          full_name: newUser.full_name, company_name: newUser.company_name || null,
          status: 'active'
        })
        showToast('', 'User Created', newUser.full_name + ' added as ' + newUser.role)
        setShowAddUser(false)
        setNewUser({ email: '', password: '', full_name: '', company_name: '', role: 'carrier' })
        fetchUsers()
      } else {
        showToast('', 'Error', authData.msg || 'Failed to create user')
      }
    } catch (e) {
      showToast('', 'Error', 'Failed to create user')
    }
    setAddingUser(false)
  }

  const filtered = users.filter(u => {
    if (filter !== 'All' && u.status !== filter) return false
    if (roleFilter !== 'All Roles' && u.role !== roleFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (u.full_name || '').toLowerCase().includes(q) ||
        (u.company_name || '').toLowerCase().includes(q) ||
        (u.mc_number || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    }
    return true
  })

  const carriers = users.filter(u => u.role === 'carrier')
  const brokers = users.filter(u => u.role === 'broker')
  const admins = users.filter(u => u.role === 'admin')
  const pending = users.filter(u => u.status === 'pending')

  const statusPill = (s) => ({ active: 'pill-green', trial: 'pill-blue', pending: 'pill-yellow', suspended: 'pill-red' }[s] || 'pill-muted')
  const roleIcon = (r) => ({ admin: Zap, broker: Building2, carrier: Truck }[r] || Truck)
  const roleColor = (r) => ({ admin: 'var(--accent)', broker: 'var(--accent3)', carrier: 'var(--success)' }[r] || 'var(--muted)')
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading users...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Users', value: users.length, color: 'var(--accent)' },
          { label: 'Carriers', value: carriers.length, color: 'var(--success)' },
          { label: 'Brokers', value: brokers.length, color: 'var(--accent3)' },
          { label: 'Pending Approval', value: pending.length, color: 'var(--warning)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAddUser(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 400, maxWidth: '90%' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Add New User</div>
              <button onClick={() => setShowAddUser(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Ic icon={X} size={18} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Role</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['carrier', 'broker', 'admin'].map(r => (
                  <button key={r} onClick={() => setNewUser(p => ({ ...p, role: r }))}
                    style={{
                      flex: 1, padding: '8px 0', border: `1px solid ${newUser.role === r ? roleColor(r) : 'var(--border)'}`,
                      borderRadius: 8, background: newUser.role === r ? roleColor(r) + '15' : 'var(--surface2)',
                      color: newUser.role === r ? roleColor(r) : 'var(--muted)', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center'
                    }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} placeholder="John Smith" />
            </div>
            <div className="form-group">
              <label className="form-label">Company Name</label>
              <input className="form-input" value={newUser.company_name} onChange={e => setNewUser(p => ({ ...p, company_name: e.target.value }))} placeholder="ABC Trucking LLC" />
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="user@company.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Password *</label>
              <input className="form-input" type="text" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="min 6 characters" />
            </div>

            <button className="btn btn-primary" onClick={handleAddUser} disabled={addingUser}
              style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 13, marginTop: 8, opacity: addingUser ? 0.7 : 1 }}>
              {addingUser ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={Shield} size={14} /> All Users</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
              <input className="form-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 180, height: 34, fontSize: 12 }} />
            </div>
            <button className="btn btn-primary" onClick={() => setShowAddUser(true)}>
              <Ic icon={UserPlus} size={14} /> Add User
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ROLE_FILTERS.map(f => (
            <button key={f} className={'filter-chip' + (roleFilter === f ? ' active' : '')} onClick={() => setRoleFilter(f)}
              style={{ fontSize: 11 }}>
              {f === 'All Roles' ? f : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
            </button>
          ))}
          <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
          {FILTERS.map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}
              style={{ fontSize: 11 }}>
              {f === 'All' ? f : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No users match your filter.</div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.full_name || 'No name'}</strong></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</td>
                  <td style={{ fontSize: 12 }}>{u.company_name || '—'}</td>
                  <td>
                    {editingRole === u.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['admin', 'broker', 'carrier'].map(r => (
                          <button key={r} onClick={() => updateRole(u.id, r, u.full_name || u.email)}
                            style={{
                              padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                              border: `1px solid ${roleColor(r)}`, background: u.role === r ? roleColor(r) + '25' : 'transparent',
                              color: roleColor(r), textTransform: 'uppercase'
                            }}>
                            {r}
                          </button>
                        ))}
                        <button onClick={() => setEditingRole(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 10 }}>
                          <Ic icon={X} size={12} />
                        </button>
                      </div>
                    ) : (
                      <span onClick={() => setEditingRole(u.id)} style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                        background: roleColor(u.role) + '15', color: roleColor(u.role),
                        display: 'inline-flex', alignItems: 'center', gap: 4
                      }}>
                        <Ic icon={roleIcon(u.role)} size={10} /> {u.role.toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td><span className={'pill ' + statusPill(u.status)}><span className="pill-dot" />{u.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(u.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {u.status === 'pending' && (
                        <button className="btn btn-success" style={{ padding: '4px 8px', fontSize: 10 }}
                          onClick={() => updateStatus(u.id, 'active', u.full_name || u.email)}>
                          <Ic icon={CheckCircle} size={12} /> Approve
                        </button>
                      )}
                      {u.status === 'suspended' && (
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                          onClick={() => updateStatus(u.id, 'active', u.full_name || u.email)}>
                          <Ic icon={CheckCircle} size={12} /> Reactivate
                        </button>
                      )}
                      {(u.status === 'active' || u.status === 'trial') && (
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--danger)' }}
                          onClick={() => updateStatus(u.id, 'suspended', u.full_name || u.email)}>
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
