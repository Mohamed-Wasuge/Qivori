import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { apiFetch } from '../lib/api'
import { Truck, Search, CheckCircle, Ban, Eye, Shield, Building2, Zap, ChevronDown, UserPlus, X, Package, DollarSign, MapPin, Phone, Mail, Calendar, CreditCard, Clock, Send } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />
const FILTERS = ['All', 'active', 'trial', 'pending', 'suspended']
const ROLE_FILTERS = ['All Roles', 'carrier', 'broker', 'manager', 'admin']

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
  const [selectedUser, setSelectedUser] = useState(null)
  const [userLoads, setUserLoads] = useState([])
  const [drawerLoading, setDrawerLoading] = useState(false)

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
      const res = await apiFetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          company_name: newUser.company_name || null,
          role: newUser.role,
        })
      })
      const data = await res.json()
      if (data.id) {
        showToast('', 'User Created', newUser.full_name + ' added as ' + newUser.role)
        setShowAddUser(false)
        setNewUser({ email: '', password: '', full_name: '', company_name: '', role: 'carrier' })
        fetchUsers()
      } else {
        showToast('', 'Error', data.error || 'Failed to create user')
      }
    } catch (e) {
      showToast('', 'Error', 'Failed to create user')
    }
    setAddingUser(false)
  }

  const openUserDrawer = async (user) => {
    setSelectedUser(user)
    setDrawerLoading(true)
    const { data } = await supabase.from('loads').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
    setUserLoads(data || [])
    setDrawerLoading(false)
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
  const roleIcon = (r) => ({ admin: Zap, manager: Shield, broker: Building2, carrier: Truck }[r] || Truck)
  const roleColor = (r) => ({ admin: 'var(--accent)', manager: 'var(--accent2)', broker: 'var(--accent3)', carrier: 'var(--success)' }[r] || 'var(--muted)')
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
                {['carrier', 'broker', 'manager', 'admin'].map(r => (
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
            <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Role</th><th>Plan</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.full_name || 'No name'}</strong></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</td>
                  <td style={{ fontSize: 12 }}>{u.company_name || '—'}</td>
                  <td>
                    {editingRole === u.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['admin', 'manager', 'broker', 'carrier'].map(r => (
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
                  <td><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(240,165,0,0.1)', color: 'var(--accent)', fontWeight: 700, textTransform: 'capitalize' }}>{(u.plan || 'trial').replace('_', ' ')}</span></td>
                  <td><span className={'pill ' + statusPill(u.status)}><span className="pill-dot" />{u.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(u.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={() => openUserDrawer(u)}>
                        <Ic icon={Eye} size={12} /> View
                      </button>
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

      {/* User Detail Drawer */}
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setSelectedUser(null)} />
          <div style={{ position: 'relative', width: 480, maxWidth: '90vw', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: roleColor(selectedUser.role) + '15', border: `1px solid ${roleColor(selectedUser.role)}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: roleColor(selectedUser.role) }}>
                    {(selectedUser.full_name || selectedUser.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedUser.full_name || 'No name'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selectedUser.company_name || '—'}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: roleColor(selectedUser.role) + '15', color: roleColor(selectedUser.role), textTransform: 'uppercase' }}>{selectedUser.role}</span>
                    <span className={'pill ' + statusPill(selectedUser.status)}><span className="pill-dot" />{selectedUser.status}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}><Ic icon={X} size={20} /></button>
            </div>

            {/* Contact Info */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Contact</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Ic icon={Mail} size={13} color="var(--accent)" /> {selectedUser.email}
                <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 10, marginLeft: 'auto' }}
                  onClick={async () => {
                    try {
                      const res = await apiFetch('/api/invite-driver', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: selectedUser.email, role: 'carrier' })
                      })
                      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed') }
                      showToast('', 'Invite Sent', 'Invitation email sent to ' + selectedUser.email)
                    } catch (e) { showToast('', 'Failed', e.message, 'error') }
                  }}>
                  <Ic icon={Send} size={10} /> Send Invite
                </button>
              </div>
              {selectedUser.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><Ic icon={Phone} size={13} color="var(--accent2)" /> {selectedUser.phone}</div>}
              {(selectedUser.city || selectedUser.state) && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><Ic icon={MapPin} size={13} color="var(--success)" /> {[selectedUser.city, selectedUser.state].filter(Boolean).join(', ')}</div>}
            </div>

            {/* Account Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Plan', value: (selectedUser.plan || 'trial').replace('_', ' '), icon: CreditCard, color: 'var(--accent)' },
                { label: 'Joined', value: formatDate(selectedUser.created_at), icon: Calendar, color: 'var(--accent2)' },
                { label: 'MC Number', value: selectedUser.mc_number || '—', icon: Shield, color: 'var(--success)' },
                { label: 'DOT Number', value: selectedUser.dot_number || '—', icon: Truck, color: 'var(--accent3)' },
              ].map(d => (
                <div key={d.label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <Ic icon={d.icon} size={11} style={{ color: d.color }} /> {d.label}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: d.color, textTransform: 'capitalize' }}>{d.value}</div>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedUser.status === 'pending' && (
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: 10, fontSize: 12 }}
                  onClick={() => { updateStatus(selectedUser.id, 'active', selectedUser.full_name || selectedUser.email); setSelectedUser(s => ({ ...s, status: 'active' })) }}>
                  <Ic icon={CheckCircle} size={14} /> Approve User
                </button>
              )}
              {(selectedUser.status === 'active' || selectedUser.status === 'trial') && (
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 10, fontSize: 12, color: 'var(--danger)' }}
                  onClick={() => { updateStatus(selectedUser.id, 'suspended', selectedUser.full_name || selectedUser.email); setSelectedUser(s => ({ ...s, status: 'suspended' })) }}>
                  <Ic icon={Ban} size={14} /> Suspend
                </button>
              )}
              {selectedUser.status === 'suspended' && (
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 10, fontSize: 12 }}
                  onClick={() => { updateStatus(selectedUser.id, 'active', selectedUser.full_name || selectedUser.email); setSelectedUser(s => ({ ...s, status: 'active' })) }}>
                  <Ic icon={CheckCircle} size={14} /> Reactivate
                </button>
              )}
            </div>

            {/* User's Loads */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Package} size={13} /> Loads</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{userLoads.length} total</span>
              </div>
              {drawerLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
              ) : userLoads.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No loads yet</div>
              ) : (
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {userLoads.map((l, i) => (
                    <div key={l.id} style={{ padding: '10px 16px', borderBottom: i < userLoads.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Ic icon={Package} size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.load_id || '—'} — {l.origin || '?'} → {l.destination || '?'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>${Number(l.rate || l.gross_pay || 0).toLocaleString()} · {l.status || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
