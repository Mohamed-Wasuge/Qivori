import React, { useState, useEffect } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { Shield, Send, Clock, Users, UserPlus, Check } from 'lucide-react'
import { fetchCompanyMembers, fetchPendingInvitations, removeCompanyMember, updateMemberRole, cancelInvitation } from '../../../lib/database'

// ─── TEAM MANAGEMENT ────────────────────────────────────────────────────────
export function TeamManagement() {
  const { showToast } = useApp()
  const { company } = useCarrier()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('dispatcher')
  const [sending, setSending] = useState(false)
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)

  const ROLES = [
    { key:'owner',      label:'Owner',      color:'#f0a500', desc:'Full access — billing, settings, team, all data' },
    { key:'admin',      label:'Admin',      color:'#f97316', desc:'Manage team, loads, drivers — everything except billing' },
    { key:'dispatcher', label:'Dispatcher', color:'#3b82f6', desc:'Manage loads, dispatch, track shipments, view rates' },
    { key:'driver',     label:'Driver',     color:'#22c55e', desc:'View assigned loads, update status, upload PODs' },
  ]

  const loadData = async () => {
    setLoading(true)
    try {
      const [m, inv] = await Promise.all([fetchCompanyMembers(), fetchPendingInvitations()])
      setMembers(m.filter(x => x.status !== 'deactivated'))
      setInvitations(inv)
    } catch (err) {
      console.error('Failed to load team data:', err)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return showToast('', 'Error', 'Email is required')
    const existing = members.find(m => m.profiles?.email === inviteEmail.trim())
    if (existing) return showToast('', 'Error', 'This email is already on the team')
    const pendingDupe = invitations.find(inv => inv.email === inviteEmail.trim())
    if (pendingDupe) return showToast('', 'Error', 'An invitation is already pending for this email')

    setSending(true)
    try {
      const res = await apiFetch('/api/invite-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, name: inviteName.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send invite')
      showToast('', 'Invite Sent', `${inviteName.trim() || inviteEmail.trim()} invited as ${inviteRole}`)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('dispatcher')
      await loadData()
    } catch (err) {
      showToast('', 'Error', err.message || 'Failed to send invite')
    }
    setSending(false)
  }

  const handleRemove = async (memberId) => {
    try {
      await removeCompanyMember(memberId)
      showToast('', 'Deactivated', 'Team member has been deactivated')
      await loadData()
    } catch {
      showToast('', 'Error', 'Failed to remove member')
    }
  }

  const handleRoleChange = async (memberId, newRole) => {
    try {
      await updateMemberRole(memberId, newRole)
      showToast('', 'Updated', 'Member role updated')
      await loadData()
    } catch {
      showToast('', 'Error', 'Failed to update role')
    }
  }

  const handleCancelInvite = async (invId) => {
    try {
      await cancelInvitation(invId)
      showToast('', 'Cancelled', 'Invitation cancelled')
      await loadData()
    } catch {
      showToast('', 'Error', 'Failed to cancel invitation')
    }
  }

  const roleColor = (role) => ROLES.find(r => r.key === role)?.color || 'var(--muted)'
  const roleLabel = (role) => ROLES.find(r => r.key === role)?.label || role

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>TEAM</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Manage who has access to your Qivori account</div>
      </div>

      {/* Invite New Member */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={UserPlus} size={14} /> Invite Team Member</div>
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', gap:8 }}>
            <input
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              placeholder="Name"
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }}
            />
            <input
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="Email address"
              style={{ flex:2, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }}
            />
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', cursor:'pointer' }}
            >
              {ROLES.filter(r => r.key !== 'owner').map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              style={{ padding:'12px 24px', fontSize:13, fontWeight:700, whiteSpace:'nowrap' }}
              onClick={handleInvite}
              disabled={sending}
            >
              <Ic icon={Send} size={12} /> {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>
            An invite email will be sent. They can join your team by creating a Qivori account.
          </div>
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Clock} size={14} /> Pending Invitations ({invitations.length})</div>
          </div>
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
            {invitations.map(inv => (
              <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface2)', borderRadius:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(77,142,240,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14, fontWeight:700, color:'var(--accent)' }}>
                  {inv.email[0].toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.email}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Invited {new Date(inv.created_at).toLocaleDateString()}{inv.expires_at ? ` — expires ${new Date(inv.expires_at).toLocaleDateString()}` : ''}</div>
                </div>
                <span style={S.badge(roleColor(inv.role))}>{roleLabel(inv.role)}</span>
                <span style={S.badge('var(--accent)')}>Pending</span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize:11, padding:'4px 10px', color:'var(--danger, #ef4444)' }}
                  onClick={() => handleCancelInvite(inv.id)}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members List */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Users} size={14} /> Team Members ({members.length})</div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
          {loading && (
            <div style={{ textAlign:'center', padding:24, color:'var(--muted)', fontSize:12 }}>Loading team...</div>
          )}
          {!loading && members.length === 0 && (
            <div style={{ textAlign:'center', padding:24, color:'var(--muted)', fontSize:12 }}>
              No team members yet. Invite someone above to get started.
            </div>
          )}
          {!loading && members.map(m => {
            const name = m.profiles?.full_name || m.profiles?.email || 'Unknown'
            const email = m.profiles?.email || ''
            return (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface2)', borderRadius:10, transition:'all 0.15s' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:roleColor(m.role) + '18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14, fontWeight:700, color:roleColor(m.role) }}>
                  {name[0].toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{email}</div>
                </div>
                {m.role !== 'owner' ? (
                  <select
                    value={m.role}
                    onChange={e => handleRoleChange(m.id, e.target.value)}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', color:roleColor(m.role), fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:'pointer', outline:'none' }}
                  >
                    {ROLES.filter(r => r.key !== 'owner').map(r => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                ) : (
                  <span style={S.badge(roleColor(m.role))}>{roleLabel(m.role)}</span>
                )}
                {m.status === 'active' ? (
                  <span style={S.badge('var(--success)')}><Ic icon={Check} size={10} /> Active</span>
                ) : (
                  <span style={S.badge('var(--accent)')}>{m.status}</span>
                )}
                {m.role !== 'owner' && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize:11, padding:'4px 10px', color:'var(--danger, #ef4444)' }}
                    onClick={() => handleRemove(m.id)}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Role Permissions */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Shield} size={14} /> Role Permissions</div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          {ROLES.map(r => (
            <div key={r.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface2)', borderRadius:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:r.color + '12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ic icon={Shield} size={16} color={r.color} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:r.color }}>{r.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.2)', borderRadius:12, padding:'14px 18px', display:'flex', gap:12 }}>
        <Ic icon={Shield} size={18} color="var(--accent2)" />
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          Only Owners can manage team members and billing. Dispatchers, Admins, and Drivers will only see the parts of Qivori relevant to their role. All activity is logged for security.
        </div>
      </div>
    </div>
  )
}
