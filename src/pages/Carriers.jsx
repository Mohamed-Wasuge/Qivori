import { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { apiFetch } from '../lib/api'
import {
  Search, CheckCircle, Ban, Eye, Building2, ChevronDown, ChevronRight,
  UserPlus, X, Package, Mail, Calendar, KeyRound, Sparkles, Users, StickyNote,
  Activity, Plus, RotateCcw
} from 'lucide-react'

const AdminCarrierOnboarding = lazy(() => import('../components/AdminCarrierOnboarding'))
const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const PLANS = ['trial', 'beta', 'basic', 'pro', 'enterprise']
const PLAN_COLORS = { trial: '#6b7280', beta: '#3b82f6', basic: '#22c55e', pro: '#f0a500', enterprise: '#8b5cf6' }
const PLAN_PRICING = { trial: 'Free \u00b7 14 days', beta: 'Free \u00b7 no limit', basic: '$79/mo', pro: '$199/mo', enterprise: 'Custom' }
const AVATAR_COLORS = ['#f0a500','#3b82f6','#22c55e','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316']
const avatarColor = (name) => AVATAR_COLORS[Math.abs([...(name||'')].reduce((h,c) => (h*31+c.charCodeAt(0))|0, 0)) % AVATAR_COLORS.length]
const STAT_COLORS = { total: 'var(--accent)', active: 'var(--success)', trial: '#3b82f6', beta: '#3b82f6', paid: 'var(--accent)', suspended: 'var(--danger)' }
const SORT_OPTIONS = [
  { label: 'Joined (newest)', key: 'newest' },
  { label: 'Joined (oldest)', key: 'oldest' },
  { label: 'Name A-Z', key: 'name_asc' },
]
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'
const statusColor = (s) => ({ active: 'var(--success)', trial: '#3b82f6', pending: 'var(--warning)', suspended: 'var(--danger)', deactivated: 'var(--danger)' }[s] || 'var(--muted)')

const logAudit = async (companyId, action, details = {}) => {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('admin_audit_log').insert({ company_id: companyId, action, details, performed_by: user?.id || null })
}

function UserActionModal({ modal, onClose, onSetPassword, onUpdateEmail, onDelete }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const S = {
    overlay: { position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 380, maxWidth: '92vw' },
    title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
    sub: { fontSize: 13, color: 'var(--muted)', marginBottom: 20 },
    input: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text)', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' },
    row: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
    cancel: { padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 },
    confirm: (danger) => ({ padding: '9px 18px', borderRadius: 10, border: 'none', background: danger ? 'var(--danger)' : 'var(--accent)', color: danger ? '#fff' : '#000', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: busy ? 0.6 : 1 }),
  }
  const handle = async () => {
    if (busy) return
    setBusy(true)
    if (modal.type === 'password') await onSetPassword(modal.userId, val)
    else if (modal.type === 'email') await onUpdateEmail(modal.userId, val)
    else if (modal.type === 'delete') await onDelete(modal.userId, modal.companyId, modal.name)
    setBusy(false)
  }
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        {modal.type === 'password' && <>
          <div style={S.title}>Set Password</div>
          <div style={S.sub}>{modal.name} · {modal.email}</div>
          <input style={S.input} type="password" placeholder="New password (min 6 chars)" value={val} onChange={e => setVal(e.target.value)} autoFocus />
          <div style={S.row}><button style={S.cancel} onClick={onClose}>Cancel</button><button style={S.confirm(false)} onClick={handle} disabled={val.length < 6}>{busy ? 'Saving...' : 'Set Password'}</button></div>
        </>}
        {modal.type === 'email' && <>
          <div style={S.title}>Change Email</div>
          <div style={S.sub}>{modal.name} · current: {modal.email}</div>
          <input style={S.input} type="email" placeholder="New email address" value={val} onChange={e => setVal(e.target.value)} autoFocus />
          <div style={S.row}><button style={S.cancel} onClick={onClose}>Cancel</button><button style={S.confirm(false)} onClick={handle} disabled={!val.includes('@')}>{busy ? 'Saving...' : 'Update Email'}</button></div>
        </>}
        {modal.type === 'delete' && <>
          <div style={S.title}>Delete User</div>
          <div style={S.sub}>This permanently removes <strong>{modal.name}</strong> from Qivori — auth account, company, and all data. This cannot be undone.</div>
          <div style={S.row}><button style={S.cancel} onClick={onClose}>Cancel</button><button style={S.confirm(true)} onClick={handle}>{busy ? 'Deleting...' : 'Delete Permanently'}</button></div>
        </>}
      </div>
    </div>
  )
}

export default function Carriers() {
  const { showToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [allProfiles, setAllProfiles] = useState([])
  const [members, setMembers] = useState([])
  const [loadCounts, setLoadCounts] = useState({})
  const [search, setSearch] = useState('')
  const [statFilter, setStatFilter] = useState(null)
  const [sortBy, setSortBy] = useState('newest')
  const [expanded, setExpanded] = useState({})
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', company_name: '', role: 'carrier' })
  const [addingUser, setAddingUser] = useState(false)
  const [drawer, setDrawer] = useState(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [editingNotes, setEditingNotes] = useState({})
  const [addSubUser, setAddSubUser] = useState(null)
  const [subUserForm, setSubUserForm] = useState({ email: '', role: 'driver' })
  const [addingSubUser, setAddingSubUser] = useState(false)
  const [planDropdown, setPlanDropdown] = useState(null)
  const [drawerEdits, setDrawerEdits] = useState({}) // { field: value } for inline edits
  const [userModal, setUserModal] = useState(null) // { type: 'password'|'email'|'delete', userId, email, name }

  // -- Data fetching --
  const fetchData = useCallback(async () => {
    const [compRes, memRes, profRes] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('company_members').select('*, profile:profiles(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    ])
    setCompanies(compRes.data || [])
    setMembers(memRes.data || [])
    setAllProfiles(profRes.data || [])
    const { data: loads } = await supabase.from('loads').select('user_id')
    const counts = {}
    ;(loads || []).forEach(l => { counts[l.user_id] = (counts[l.user_id] || 0) + 1 })
    setLoadCounts(counts)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // -- Build carrier list --
  const carrierList = useMemo(() => {
    const membersByCompany = {}
    members.forEach(m => { if (m.company_id) { if (!membersByCompany[m.company_id]) membersByCompany[m.company_id] = []; membersByCompany[m.company_id].push(m) } })
    const profileMap = {}
    allProfiles.forEach(p => { profileMap[p.id] = p })
    const usersInCompanies = new Set()
    members.forEach(m => { if (m.user_id) usersInCompanies.add(m.user_id) })
    const list = companies.map(c => {
      const compMembers = membersByCompany[c.id] || []
      const owner = c.owner_id ? profileMap[c.owner_id] : compMembers.find(m => m.role === 'owner')?.profile
      const totalLoads = compMembers.reduce((sum, m) => sum + (loadCounts[m.user_id] || 0), 0) + (c.owner_id ? (loadCounts[c.owner_id] || 0) : 0)
      const displayName = c.name || owner?.company_name || owner?.full_name || owner?.email || null
      if (!displayName) return null
      return {
        id: c.id,
        company: { ...c, name: displayName, mc_number: c.mc_number || owner?.mc_number || null, dot_number: c.dot_number || owner?.dot_number || null, email: c.email || owner?.email || null, phone: c.phone || owner?.phone || null },
        owner, members: compMembers.map(m => ({ ...m, profile: m.profile || profileMap[m.user_id] })), loadCount: totalLoads,
      }
    }).filter(Boolean)
    companies.forEach(c => { if (c.owner_id) usersInCompanies.add(c.owner_id) })
    const legacyUsers = allProfiles.filter(p => !usersInCompanies.has(p.id) && p.role !== 'admin')
    if (legacyUsers.length > 0) {
      list.push({
        id: '__legacy__', company: { id: '__legacy__', name: 'Individual Users', plan: '--', carrier_status: '--', created_at: null },
        owner: null, members: legacyUsers.map(p => ({ user_id: p.id, profile: p, role: p.role || 'carrier', status: p.status || 'active' })),
        loadCount: legacyUsers.reduce((s, p) => s + (loadCounts[p.id] || 0), 0), isLegacy: true,
      })
    }
    return list
  }, [companies, members, allProfiles, loadCounts])

  // -- Stats --
  const stats = useMemo(() => {
    const real = carrierList.filter(c => !c.isLegacy)
    return {
      total: real.length, active: real.filter(c => c.company.carrier_status === 'active').length,
      trial: real.filter(c => c.company.carrier_status === 'trial' || c.company.plan === 'trial').length,
      beta: real.filter(c => c.company.plan === 'beta').length,
      paid: real.filter(c => ['basic', 'pro', 'enterprise'].includes(c.company.plan)).length,
      suspended: real.filter(c => c.company.carrier_status === 'suspended').length,
    }
  }, [carrierList])

  // -- Filtering + sorting --
  const filtered = useMemo(() => {
    let list = [...carrierList]
    if (statFilter) {
      list = list.filter(c => {
        if (c.isLegacy) return false
        if (statFilter === 'active') return c.company.carrier_status === 'active'
        if (statFilter === 'trial') return c.company.carrier_status === 'trial' || c.company.plan === 'trial'
        if (statFilter === 'beta') return c.company.plan === 'beta'
        if (statFilter === 'paid') return ['basic', 'pro', 'enterprise'].includes(c.company.plan)
        if (statFilter === 'suspended') return c.company.carrier_status === 'suspended'
        return true
      })
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => {
        const co = c.company
        return (co.name || '').toLowerCase().includes(q) || (co.mc_number || '').toLowerCase().includes(q) ||
          (co.dot_number || '').toLowerCase().includes(q) || (co.email || '').toLowerCase().includes(q) || (c.owner?.email || '').toLowerCase().includes(q)
      })
    }
    list.sort((a, b) => {
      if (a.isLegacy) return 1; if (b.isLegacy) return -1
      if (sortBy === 'newest') return new Date(b.company.created_at || 0) - new Date(a.company.created_at || 0)
      if (sortBy === 'oldest') return new Date(a.company.created_at || 0) - new Date(b.company.created_at || 0)
      if (sortBy === 'name_asc') return (a.company.name || '').localeCompare(b.company.name || '')
      return 0
    })
    return list
  }, [carrierList, statFilter, search, sortBy])

  // -- Handlers --
  // Map admin plan names → carrier subscription_plan names
  // Admin uses: trial, beta, basic, pro, enterprise
  // Carrier side uses: null (trial), tms_pro, ai_dispatch, autonomous_fleet
  const PLAN_TO_SUBSCRIPTION = {
    trial: null,
    beta: 'autonomous_fleet',   // beta = full access = autonomous_fleet
    basic: 'tms_pro',
    pro: 'ai_dispatch',
    enterprise: 'autonomous_fleet',
  }

  const updatePlan = useCallback(async (companyId, newPlan, companyName) => {
    const old = companies.find(c => c.id === companyId)
    // 1. Update companies.plan (admin dashboard reads this)
    await supabase.from('companies').update({ plan: newPlan }).eq('id', companyId)
    // 2. Sync to profiles.subscription_plan for ALL users in this company
    // so the carrier-side Subscription page shows the correct plan
    const subscriptionPlan = PLAN_TO_SUBSCRIPTION[newPlan] || null
    const { data: companyMembers } = await supabase
      .from('company_members')
      .select('user_id')
      .eq('company_id', companyId)
    const memberIds = (companyMembers || []).map(m => m.user_id).filter(Boolean)
    // Also include the company owner_id
    const company = companies.find(c => c.id === companyId)
    if (company?.owner_id && !memberIds.includes(company.owner_id)) {
      memberIds.push(company.owner_id)
    }
    if (memberIds.length > 0) {
      await supabase.from('profiles')
        .update({ subscription_plan: subscriptionPlan, plan: newPlan })
        .in('id', memberIds)
    }
    await logAudit(companyId, 'plan_change', { old_plan: old?.plan, new_plan: newPlan, synced_profiles: memberIds.length })
    showToast('', 'Plan Updated', `${companyName} changed to ${newPlan.toUpperCase()} · ${memberIds.length} user(s) synced`)
    fetchData()
  }, [companies, showToast, fetchData])

  const updateStatus = useCallback(async (companyId, newStatus, companyName) => {
    const old = companies.find(c => c.id === companyId)
    // 1. Update companies.carrier_status
    await supabase.from('companies').update({ carrier_status: newStatus }).eq('id', companyId)
    // 2. Sync to profiles.status for all users in this company
    const { data: companyMembers } = await supabase
      .from('company_members')
      .select('user_id')
      .eq('company_id', companyId)
    const memberIds = (companyMembers || []).map(m => m.user_id).filter(Boolean)
    const company = companies.find(c => c.id === companyId)
    if (company?.owner_id && !memberIds.includes(company.owner_id)) {
      memberIds.push(company.owner_id)
    }
    if (memberIds.length > 0) {
      await supabase.from('profiles')
        .update({ status: newStatus })
        .in('id', memberIds)
    }
    await logAudit(companyId, 'status_change', { old_status: old?.carrier_status, new_status: newStatus, synced_profiles: memberIds.length })
    const verb = newStatus === 'active' ? 'Approved' : newStatus === 'suspended' ? 'Suspended' : 'Updated'
    showToast('', verb, `${companyName} -- ${newStatus} · ${memberIds.length} user(s) synced`)
    fetchData()
  }, [companies, showToast, fetchData])

  const saveNotes = useCallback(async (companyId, notes) => {
    await supabase.from('companies').update({ admin_notes: notes }).eq('id', companyId)
    await logAudit(companyId, 'notes_updated', { notes })
    showToast('', 'Notes Saved', 'Admin notes updated')
    setEditingNotes(prev => { const n = { ...prev }; delete n[companyId]; return n })
    fetchData()
  }, [showToast, fetchData])

  const updateCompanyField = useCallback(async (companyId, field, value, label) => {
    await supabase.from('companies').update({ [field]: value }).eq('id', companyId)
    await logAudit(companyId, 'field_updated', { field, value })
    showToast('', 'Updated', `${label || field} saved`)
    fetchData()
    if (drawer?.carrier?.company?.id === companyId) {
      setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, [field]: value } } }))
    }
  }, [showToast, fetchData, drawer])

  const deleteCarrier = useCallback(async (companyId, companyName) => {
    if (!window.confirm(`Delete "${companyName}" and all their data? This cannot be undone.`)) return
    // Delete company_members first (FK constraint)
    await supabase.from('company_members').delete().eq('company_id', companyId)
    // Delete audit log
    await supabase.from('admin_audit_log').delete().eq('company_id', companyId)
    // Delete the company
    await supabase.from('companies').delete().eq('id', companyId)
    showToast('', 'Deleted', `${companyName} removed`)
    if (drawer?.carrier?.company?.id === companyId) setDrawer(null)
    fetchData()
  }, [showToast, fetchData, drawer])

  const handleAddUser = useCallback(async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) { showToast('', 'Error', 'Fill in name, email, and password'); return }
    setAddingUser(true)
    try {
      const res = await apiFetch('/api/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newUser.email, password: newUser.password, full_name: newUser.full_name, company_name: newUser.company_name || null, role: newUser.role }) })
      const data = await res.json()
      if (data.id) { showToast('', 'User Created', `${newUser.full_name} added as ${newUser.role}`); setShowAddUser(false); setNewUser({ email: '', password: '', full_name: '', company_name: '', role: 'carrier' }); fetchData() }
      else showToast('', 'Error', data.error || 'Failed to create user')
    } catch { showToast('', 'Error', 'Failed to create user') }
    setAddingUser(false)
  }, [newUser, showToast, fetchData])

  const handleAddSubUser = useCallback(async (companyId) => {
    if (!subUserForm.email) { showToast('', 'Error', 'Enter an email'); return }
    setAddingSubUser(true)
    try {
      const res = await apiFetch('/api/create-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: subUserForm.email, password: 'Temp1234!', full_name: subUserForm.email.split('@')[0], role: 'carrier', company_id: companyId, company_role: subUserForm.role }) })
      const data = await res.json()
      if (data.id || data.success) { await logAudit(companyId, 'sub_user_added', { email: subUserForm.email, role: subUserForm.role }); showToast('', 'Sub-User Added', `${subUserForm.email} added as ${subUserForm.role}`); setAddSubUser(null); setSubUserForm({ email: '', role: 'driver' }); fetchData(); if (drawer?.carrier?.company?.id === companyId) openDrawer(drawer.carrier) }
      else showToast('', 'Error', data.error || 'Failed')
    } catch { showToast('', 'Error', 'Failed to add sub-user') }
    setAddingSubUser(false)
  }, [subUserForm, showToast, fetchData, drawer])

  const suspendSubUser = useCallback(async (memberId, companyId, email) => {
    await supabase.from('company_members').update({ status: 'deactivated' }).eq('id', memberId)
    await logAudit(companyId, 'sub_user_suspended', { email })
    showToast('', 'User Suspended', email); fetchData()
  }, [showToast, fetchData])

  const reactivateSubUser = useCallback(async (memberId, companyId, email) => {
    await supabase.from('company_members').update({ status: 'active' }).eq('id', memberId)
    await logAudit(companyId, 'sub_user_reactivated', { email })
    showToast('', 'User Reactivated', email); fetchData()
  }, [showToast, fetchData])

  const sendPasswordReset = useCallback(async (email) => {
    try {
      const res = await apiFetch('/api/admin-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, action: 'send_reset_link' }) })
      const data = await res.json()
      if (data.success) showToast('', 'Reset Link Sent', `Sent to ${email}`)
      else showToast('', 'Error', data.error || 'Failed')
    } catch { showToast('', 'Error', 'Failed to send reset') }
  }, [showToast])

  const adminSetPassword = useCallback(async (userId, newPassword) => {
    const res = await apiFetch('/api/admin-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, newPassword, action: 'force_reset' }) })
    const data = await res.json()
    if (data.success) { showToast('', 'Password Set', 'Password updated'); setUserModal(null) }
    else showToast('', 'Error', data.error || 'Failed')
  }, [showToast])

  const adminUpdateEmail = useCallback(async (userId, newEmail) => {
    const res = await apiFetch('/api/admin-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, newEmail, action: 'update_email' }) })
    const data = await res.json()
    if (data.success) { showToast('', 'Email Updated', newEmail); setUserModal(null); fetchData() }
    else showToast('', 'Error', data.error || 'Failed')
  }, [showToast, fetchData])

  const adminDeleteUser = useCallback(async (userId, companyId, name) => {
    const res = await apiFetch('/api/admin-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, action: 'delete_user' }) })
    const data = await res.json()
    if (data.success) {
      if (companyId) await deleteCarrier(companyId, name)
      else { showToast('', 'Deleted', `${name} removed`); setUserModal(null); fetchData() }
    } else showToast('', 'Error', data.error || 'Failed')
  }, [showToast, deleteCarrier, fetchData])

  const openDrawer = useCallback(async (carrier) => {
    setDrawerEdits({})
    setDrawer({ carrier, auditLog: [], recentLoads: [] })
    setDrawerLoading(true)
    const [auditRes, loadsRes] = await Promise.all([
      carrier.company.id !== '__legacy__' ? supabase.from('admin_audit_log').select('*').eq('company_id', carrier.company.id).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
      carrier.owner?.id ? supabase.from('loads').select('load_id, origin, destination, rate, gross_pay, status, created_at').eq('user_id', carrier.owner.id).order('created_at', { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
    ])
    setDrawer({ carrier, auditLog: auditRes.data || [], recentLoads: loadsRes.data || [] })
    setDrawerLoading(false)
  }, [])

  // -- Render helpers --
  const PlanBadge = ({ plan, companyId, companyName, clickable = false }) => {
    const color = PLAN_COLORS[plan] || '#6b7280'
    const isOpen = planDropdown === companyId
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button onClick={e => { e.stopPropagation(); if (clickable) setPlanDropdown(isOpen ? null : companyId) }}
          style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase', background: color + '18', color, border: `1px solid ${color}30`, cursor: clickable ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4, transition: 'all .15s' }}>
          {plan || 'trial'}{clickable && <Ic icon={ChevronDown} size={10} />}
        </button>
        {isOpen && (
          <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, zIndex: 20, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}
            onClick={e => e.stopPropagation()}>
            {PLANS.map(p => {
              const pc = PLAN_COLORS[p]
              return (
                <button key={p} onClick={() => { updatePlan(companyId, p, companyName); setPlanDropdown(null); if (drawer?.carrier?.company?.id === companyId) setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, plan: p } } })) }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '8px 12px', border: 'none', borderRadius: 6, background: plan === p ? pc + '15' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: plan === p ? 700 : 400, transition: 'background .1s' }}
                  onMouseEnter={e => { if (plan !== p) e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { if (plan !== p) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ color: pc, fontWeight: 700, textTransform: 'capitalize' }}>{p}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 10 }}>{PLAN_PRICING[p]}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const StatusPill = ({ status }) => {
    const s = status || 'pending'; const c = statusColor(s)
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize', background: c + '15', color: c, display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />{s}</span>
  }

  const Avatar = ({ name, size = 44, radius = 12, fontSize = 16 }) => {
    const c = avatarColor(name); const letter = (name || '?')[0].toUpperCase()
    return <div style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(135deg, ${c}30, ${c}15)`, color: c, border: `1.5px solid ${c}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 800, flexShrink: 0, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{letter}</div>
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading carriers...</div>

  return (
    <div style={{ padding: '24px 28px', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 24 }} onClick={() => planDropdown && setPlanDropdown(null)}>

      {/* -- Page Header -- */}
      <div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, lineHeight: 1 }}>
          CARRIER <span style={{ color: 'var(--accent)' }}>MANAGEMENT</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Manage your carrier accounts, plans, team members, and billing
        </div>
      </div>

      {/* -- Stats Bar -- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {[
          { label: 'Total Carriers', value: stats.total, key: null, color: STAT_COLORS.total },
          { label: 'Active', value: stats.active, key: 'active', color: STAT_COLORS.active },
          { label: 'Trial', value: stats.trial, key: 'trial', color: STAT_COLORS.trial },
          { label: 'Beta', value: stats.beta, key: 'beta', color: STAT_COLORS.beta },
          { label: 'Paid', value: stats.paid, key: 'paid', color: STAT_COLORS.paid },
          { label: 'Suspended', value: stats.suspended, key: 'suspended', color: STAT_COLORS.suspended },
        ].map(s => {
          const active = statFilter === s.key
          return (
            <button key={s.label} onClick={() => setStatFilter(active ? null : s.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 18px', borderRadius: 14, border: `1px solid ${active ? s.color + '60' : 'var(--border)'}`, background: active ? s.color + '10' : 'var(--surface)', cursor: 'pointer', transition: 'all .15s', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = s.color + '50'; e.currentTarget.style.background = s.color + '08' }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' } else { e.currentTarget.style.borderColor = s.color + '60' } }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px', background: s.color }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, lineHeight: 1, color: active ? s.color : 'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Sans', sans-serif", marginTop: 4, fontWeight: 600 }}>{s.label}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* -- Search + Actions Bar -- */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Ic icon={Search} size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--muted)' }} />
          <input className="form-input" placeholder="Search by name, MC#, DOT#, email..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 34, width: '100%', height: 38, fontSize: 13, borderRadius: 10 }} />
        </div>
        <select className="form-input" value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ height: 38, fontSize: 12, width: 150, cursor: 'pointer', borderRadius: 10 }}>
          {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setShowOnboarding(true)} style={{ background: 'linear-gradient(135deg, #f0a500, #f59e0b)', color: '#000', fontWeight: 800, border: 'none', boxShadow: '0 4px 16px rgba(240,165,0,0.25)', height: 38, padding: '0 18px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <Ic icon={Sparkles} size={14} /> Onboard Carrier
        </button>
        <button className="btn" onClick={() => setShowAddUser(true)} style={{ height: 38, padding: '0 16px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}>
          <Ic icon={UserPlus} size={14} /> Quick Add
        </button>
      </div>

      {/* -- Carrier Table -- */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 1.4fr 60px 100px 160px', gap: 0, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          {['Company', 'Plan', 'Status', 'Owner', 'Loads', 'Joined', 'Actions'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            <Ic icon={Building2} size={28} style={{ marginBottom: 8, opacity: 0.4 }} /><br />
            No carriers match your filters.
          </div>
        ) : filtered.map((c, idx) => {
          const co = c.company; const isExp = expanded[co.id]; const isLegacy = c.isLegacy
          const isLast = idx === filtered.length - 1

          if (isLegacy) return (
            <div key="__legacy__" style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none', opacity: 0.6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 1.4fr 60px 100px 160px', gap: 0, padding: '13px 20px', cursor: 'pointer', alignItems: 'center' }}
                onClick={() => setExpanded(p => ({ ...p, __legacy__: !p.__legacy__ }))}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Ic icon={isExp ? ChevronDown : ChevronRight} size={13} color="var(--muted)" />
                  <Ic icon={Users} size={14} color="var(--muted)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Individual Users ({c.members.length})</span>
                </div>
                <div /><div /><div />
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.members.length}</div>
                <div /><div />
              </div>
              {isExp && c.members.map((m, mi) => {
                const p = m.profile || {}
                return (
                  <div key={m.user_id} style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 1.4fr 60px 100px 160px', gap: 0, padding: '10px 20px 10px 52px', borderTop: '1px solid var(--border)', alignItems: 'center', background: 'var(--surface2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={p.full_name || p.email} size={28} radius={7} fontSize={11} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{p.full_name || p.email || '--'}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.email || '--'}</div>
                      </div>
                    </div>
                    <div />
                    <StatusPill status={m.status} />
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.role || '--'}</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{loadCounts[m.user_id] || 0}</div>
                    <div />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setUserModal({ type: 'password', userId: p.id, email: p.email, name: p.full_name })} title="Set password"
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                        <Ic icon={KeyRound} size={12} />
                      </button>
                      <button onClick={() => setUserModal({ type: 'delete', userId: p.id, companyId: null, email: p.email, name: p.full_name || p.email })} title="Delete"
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                        <Ic icon={X} size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )

          return (
            <div key={co.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
              {/* Main row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 1.4fr 60px 100px 160px', gap: 0, padding: '14px 20px', alignItems: 'center', cursor: 'pointer', transition: 'background .12s', background: isExp ? 'rgba(240,165,0,0.03)' : 'transparent' }}
                onClick={() => setExpanded(p => ({ ...p, [co.id]: !p[co.id] }))}
                onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = 'transparent' }}>

                {/* Company col */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Ic icon={isExp ? ChevronDown : ChevronRight} size={13} color="var(--muted)" style={{ flexShrink: 0 }} />
                  <Avatar name={co.name} size={36} radius={10} fontSize={14} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{co.mc_number ? `MC-${co.mc_number}` : co.dot_number ? `DOT-${co.dot_number}` : 'No MC/DOT'}</div>
                  </div>
                </div>

                {/* Plan col */}
                <div onClick={e => e.stopPropagation()}>
                  <PlanBadge plan={co.plan} companyId={co.id} companyName={co.name} clickable />
                </div>

                {/* Status col */}
                <div><StatusPill status={co.carrier_status} /></div>

                {/* Owner col */}
                <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.owner?.email || '--'}</div>

                {/* Loads col */}
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.loadCount}</div>

                {/* Joined col */}
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(co.created_at)}</div>

                {/* Actions col */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => openDrawer(c)}
                    style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(240,165,0,0.3)', background: 'rgba(240,165,0,0.08)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5, transition: 'all .12s', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#000'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,165,0,0.08)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'rgba(240,165,0,0.3)' }}>
                    <Ic icon={Eye} size={12} /> View
                  </button>
                  {co.carrier_status === 'pending' && (
                    <button onClick={() => updateStatus(co.id, 'active', co.name)}
                      style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--success)', background: 'transparent', color: 'var(--success)', transition: 'all .12s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--success)'; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--success)' }}>
                      Approve
                    </button>
                  )}
                  {co.carrier_status === 'suspended' && (
                    <button onClick={() => updateStatus(co.id, 'active', co.name)}
                      style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--success)', background: 'transparent', color: 'var(--success)', transition: 'all .12s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--success)'; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--success)' }}>
                      Reactivate
                    </button>
                  )}
                  {(co.carrier_status === 'active' || co.carrier_status === 'trial') && (
                    <button onClick={() => updateStatus(co.id, 'suspended', co.name)} title="Suspend"
                      style={{ padding: '6px 9px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', transition: 'all .12s', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--warning)'; e.currentTarget.style.color = 'var(--warning)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                      <Ic icon={Ban} size={12} />
                    </button>
                  )}
                  <button onClick={() => deleteCarrier(co.id, co.name)} title="Delete carrier"
                    style={{ padding: '6px 9px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', transition: 'all .12s', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                    <Ic icon={X} size={12} />
                  </button>
                </div>
              </div>

              {/* Expanded sub-users */}
              {isExp && (
                <div style={{ borderTop: '1px solid rgba(240,165,0,0.15)', background: 'rgba(240,165,0,0.02)' }}>
                  {/* Sub-user header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 1.4fr 60px 100px 160px', padding: '8px 20px 8px 52px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                    {['Member', 'Role', 'Status', 'Email', 'Loads', '', 'Actions'].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                    ))}
                  </div>

                  {c.members.length === 0 && addSubUser !== co.id && (
                    <div style={{ padding: '20px 52px', color: 'var(--muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Ic icon={Users} size={14} style={{ opacity: 0.4 }} />
                      No team members yet
                    </div>
                  )}

                  {c.members.map(m => {
                    const p = m.profile || {}
                    return (
                      <div key={m.id || m.user_id} style={{ display: 'grid', gridTemplateColumns: '2fr 100px 90px 1.4fr 60px 100px 160px', padding: '11px 20px 11px 52px', borderBottom: '1px solid var(--border)', alignItems: 'center', transition: 'background .1s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Avatar name={p.full_name || p.email} size={28} radius={7} fontSize={11} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name || '--'}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>{m.role || '--'}</div>
                        <StatusPill status={m.status || 'active'} />
                        <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || '--'}</div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{loadCounts[m.user_id] || 0}</div>
                        <div />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setUserModal({ type: 'password', userId: p.id, email: p.email, name: p.full_name })} title="Set password"
                            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                            <Ic icon={KeyRound} size={12} />
                          </button>
                          <button onClick={() => setUserModal({ type: 'email', userId: p.id, email: p.email, name: p.full_name })} title="Change email"
                            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                            <Ic icon={Mail} size={12} />
                          </button>
                          {(m.status || 'active') !== 'deactivated' ? (
                            <button onClick={() => suspendSubUser(m.id, co.id, p.email)} title="Suspend"
                              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--warning)'; e.currentTarget.style.color = 'var(--warning)' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                              <Ic icon={Ban} size={12} />
                            </button>
                          ) : (
                            <button onClick={() => reactivateSubUser(m.id, co.id, p.email)} title="Reactivate"
                              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--success)'; e.currentTarget.style.color = 'var(--success)' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                              <Ic icon={RotateCcw} size={12} />
                            </button>
                          )}
                          <button onClick={() => setUserModal({ type: 'delete', userId: p.id, companyId: co.id, email: p.email, name: p.full_name || p.email })} title="Delete"
                            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                            <Ic icon={X} size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Add member row */}
                  <div style={{ padding: '10px 20px 12px 52px' }}>
                    {addSubUser === co.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input className="form-input" placeholder="email@example.com" value={subUserForm.email}
                          onChange={e => setSubUserForm(p => ({ ...p, email: e.target.value }))}
                          style={{ height: 34, fontSize: 12, flex: 1, borderRadius: 8 }} autoFocus />
                        <select className="form-input" value={subUserForm.role}
                          onChange={e => setSubUserForm(p => ({ ...p, role: e.target.value }))}
                          style={{ height: 34, fontSize: 12, width: 130, cursor: 'pointer', borderRadius: 8 }}>
                          <option value="owner">Owner / Driver</option>
                          <option value="dispatcher">Dispatcher</option>
                          <option value="driver">Driver</option>
                        </select>
                        <button disabled={addingSubUser} onClick={() => handleAddSubUser(co.id)}
                          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 12, cursor: addingSubUser ? 'not-allowed' : 'pointer', opacity: addingSubUser ? 0.6 : 1 }}>
                          {addingSubUser ? 'Adding...' : 'Add'}
                        </button>
                        <button onClick={() => { setAddSubUser(null); setSubUserForm({ email: '', role: 'driver' }) }}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                          <Ic icon={X} size={14} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setAddSubUser(co.id)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                        <Ic icon={Plus} size={12} /> Add Member
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* -- Quick Add Modal -- */}
      {showAddUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAddUser(false)}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 420, maxWidth: '92%', boxShadow: '0 16px 48px rgba(0,0,0,.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>Quick Add User</div>
              <button onClick={() => setShowAddUser(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}><Ic icon={X} size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Role</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['carrier', 'broker', 'admin'].map(r => (
                    <button key={r} onClick={() => setNewUser(p => ({ ...p, role: r }))}
                      style={{ flex: 1, padding: '10px 0', border: `1px solid ${newUser.role === r ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, background: newUser.role === r ? 'rgba(240,165,0,0.1)' : 'transparent', color: newUser.role === r ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', transition: 'all .15s' }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Full Name *</div>
                <input className="form-input" value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} placeholder="John Smith" style={{ width: '100%', height: 38, fontSize: 13, borderRadius: 10 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Company Name</div>
                <input className="form-input" value={newUser.company_name} onChange={e => setNewUser(p => ({ ...p, company_name: e.target.value }))} placeholder="ABC Trucking LLC" style={{ width: '100%', height: 38, fontSize: 13, borderRadius: 10 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Email *</div>
                <input className="form-input" type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="user@company.com" style={{ width: '100%', height: 38, fontSize: 13, borderRadius: 10 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Password *</div>
                <input className="form-input" type="text" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="min 6 characters" style={{ width: '100%', height: 38, fontSize: 13, borderRadius: 10 }} />
              </div>
              <button onClick={handleAddUser} disabled={addingUser}
                style={{ width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 800, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f0a500, #f59e0b)', color: '#000', cursor: addingUser ? 'not-allowed' : 'pointer', opacity: addingUser ? 0.6 : 1, marginTop: 4, transition: 'opacity .15s' }}>
                {addingUser ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- User Action Modal (set password / change email / delete) -- */}
      {userModal && <UserActionModal modal={userModal} onClose={() => setUserModal(null)} onSetPassword={adminSetPassword} onUpdateEmail={adminUpdateEmail} onDelete={adminDeleteUser} />}

      {/* -- Onboarding Wizard -- */}
      {showOnboarding && (
        <Suspense fallback={null}>
          <AdminCarrierOnboarding onClose={() => setShowOnboarding(false)} onCreated={() => { setShowOnboarding(false); fetchData() }} />
        </Suspense>
      )}

      {/* -- Detail Drawer -- */}
      {drawer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setDrawer(null)} />
          <div style={{ position: 'relative', width: 560, maxWidth: '94vw', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflowY: 'auto', overflowX: 'hidden', padding: '28px 24px 80px', boxShadow: '-8px 0 32px rgba(0,0,0,.3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5 }}>{drawer.carrier.company.name}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <PlanBadge plan={drawer.carrier.company.plan} companyId={drawer.carrier.company.id} companyName={drawer.carrier.company.name} clickable />
                  <StatusPill status={drawer.carrier.company.carrier_status} />
                </div>
              </div>
              <button onClick={() => setDrawer(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}>
                <Ic icon={X} size={22} />
              </button>
            </div>

            {/* Company Info */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={Building2} size={12} /> Company Info</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Company Name', field: 'name' },
                  { label: 'MC Number', field: 'mc_number' },
                  { label: 'DOT Number', field: 'dot_number' },
                  { label: 'Email', field: 'email' },
                  { label: 'Phone', field: 'phone' },
                  { label: 'Address', field: 'address' },
                ].map(d => {
                  const dbValue = drawer.carrier.company[d.field] || ''
                  const editValue = drawerEdits[d.field]
                  const currentValue = editValue !== undefined ? editValue : dbValue
                  const isDirty = editValue !== undefined && editValue !== dbValue
                  return (
                    <div key={d.field}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {d.label}
                        {isDirty && <span style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>unsaved</span>}
                      </div>
                      <input className="form-input"
                        style={{ width: '100%', height: 34, fontSize: 12, background: 'var(--surface2)', borderRadius: 8, borderColor: isDirty ? 'var(--accent)' : undefined }}
                        value={currentValue}
                        onChange={e => setDrawerEdits(p => ({ ...p, [d.field]: e.target.value }))}
                        onBlur={() => {
                          if (isDirty) {
                            updateCompanyField(drawer.carrier.company.id, d.field, editValue, d.label)
                            setDrawerEdits(p => { const n = { ...p }; delete n[d.field]; return n })
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && isDirty) {
                            updateCompanyField(drawer.carrier.company.id, d.field, editValue, d.label)
                            setDrawerEdits(p => { const n = { ...p }; delete n[d.field]; return n })
                            e.target.blur()
                          }
                        }}
                        placeholder={`Enter ${d.label.toLowerCase()}...`} />
                    </div>
                  )
                })}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Joined</div>
                  <div style={{ fontSize: 14, fontWeight: 600, padding: '7px 0' }}>{formatDate(drawer.carrier.company.created_at)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Loads</div>
                  <div style={{ fontSize: 14, fontWeight: 600, padding: '7px 0' }}>{drawer.carrier.loadCount}</div>
                </div>
              </div>
            </div>

            {/* Plan & Billing */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Plan & Billing</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <select className="form-input" style={{ width: '100%', height: 38, fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 8 }}
                    value={drawer.carrier.company.plan || 'trial'}
                    onChange={e => { updatePlan(drawer.carrier.company.id, e.target.value, drawer.carrier.company.name); setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, plan: e.target.value } } })) }}>
                    {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} -- {PLAN_PRICING[p]}</option>)}
                  </select>
                </div>
                <div style={{ textAlign: 'right', minWidth: 100 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: PLAN_COLORS[drawer.carrier.company.plan] || '#6b7280', fontFamily: "'Bebas Neue', sans-serif" }}>
                    {PLAN_PRICING[drawer.carrier.company.plan] || 'Free'}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {drawer.carrier.company.carrier_status === 'pending' && (
                <button onClick={() => { updateStatus(drawer.carrier.company.id, 'active', drawer.carrier.company.name); setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, carrier_status: 'active' } } })) }}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: 'var(--success)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Ic icon={CheckCircle} size={14} /> Approve Carrier
                </button>
              )}
              {(drawer.carrier.company.carrier_status === 'active' || drawer.carrier.company.carrier_status === 'trial') && (
                <button onClick={() => { updateStatus(drawer.carrier.company.id, 'suspended', drawer.carrier.company.name); setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, carrier_status: 'suspended' } } })) }}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--danger)', background: 'var(--danger)10', color: 'var(--danger)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Ic icon={Ban} size={14} /> Suspend Carrier
                </button>
              )}
              {drawer.carrier.company.carrier_status === 'suspended' && (
                <button onClick={() => { updateStatus(drawer.carrier.company.id, 'active', drawer.carrier.company.name); setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, carrier_status: 'active' } } })) }}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: 'var(--success)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Ic icon={RotateCcw} size={14} /> Reactivate Carrier
                </button>
              )}
              <button onClick={() => deleteCarrier(drawer.carrier.company.id, drawer.carrier.company.name)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--danger)' }}>
                <Ic icon={X} size={14} /> Delete Carrier
              </button>
            </div>

            {/* Admin Notes */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={StickyNote} size={12} /> Admin Notes</div>
              <textarea className="form-input"
                style={{ width: '100%', minHeight: 70, fontSize: 12, resize: 'vertical', background: 'var(--surface2)', borderRadius: 8 }}
                defaultValue={drawer.carrier.company.admin_notes || ''}
                onBlur={e => saveNotes(drawer.carrier.company.id, e.target.value)}
                placeholder="Add internal notes about this carrier..." />
            </div>

            {/* Team Members */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Users} size={13} /> Team Members ({drawer.carrier.members.length})</span>
                <button onClick={() => setAddSubUser(drawer.carrier.company.id)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'opacity .1s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                  <Ic icon={Plus} size={11} /> Add Member
                </button>
              </div>
              {addSubUser === drawer.carrier.company.id && (
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'rgba(240,165,0,0.03)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="form-input" placeholder="Email address" value={subUserForm.email}
                    onChange={e => setSubUserForm(p => ({ ...p, email: e.target.value }))}
                    style={{ flex: 1, height: 34, fontSize: 12, borderRadius: 8 }} />
                  <select className="form-input" value={subUserForm.role}
                    onChange={e => setSubUserForm(p => ({ ...p, role: e.target.value }))}
                    style={{ width: 110, height: 34, fontSize: 12, cursor: 'pointer', borderRadius: 8 }}>
                    <option value="owner">Owner / Driver</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="driver">Driver</option>
                  </select>
                  <button disabled={addingSubUser || !subUserForm.email}
                    onClick={() => handleAddSubUser(drawer.carrier.company.id)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 12, cursor: addingSubUser ? 'not-allowed' : 'pointer', opacity: addingSubUser ? 0.6 : 1 }}>
                    {addingSubUser ? 'Adding...' : 'Add'}
                  </button>
                  <button onClick={() => setAddSubUser(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}><Ic icon={X} size={14} /></button>
                </div>
              )}
              {drawer.carrier.members.length === 0 && addSubUser !== drawer.carrier.company.id ? (
                <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  <Ic icon={Users} size={20} style={{ opacity: 0.3, marginBottom: 6 }} /><br />
                  No team members yet -- add your first dispatcher or driver
                </div>
              ) : drawer.carrier.members.map(m => {
                const p = m.profile || {}
                return (
                  <div key={m.id || m.user_id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, transition: 'background .1s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <Avatar name={p.full_name || p.email} size={36} radius={8} fontSize={14} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.full_name || '--'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.email || '--'}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent2, #3b82f6)', textTransform: 'uppercase' }}>{m.role}</span>
                    <StatusPill status={m.status || 'active'} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => sendPasswordReset(p.email)} title="Send password reset"
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}>
                        <Ic icon={KeyRound} size={12} />
                      </button>
                      {(m.status || 'active') !== 'deactivated' ? (
                        <button onClick={() => suspendSubUser(m.id, drawer.carrier.company.id, p.email)} title="Suspend"
                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}>
                          <Ic icon={Ban} size={12} />
                        </button>
                      ) : (
                        <button onClick={() => reactivateSubUser(m.id, drawer.carrier.company.id, p.email)} title="Reactivate"
                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--success)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}>
                          <Ic icon={RotateCcw} size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Recent Loads */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Package} size={13} /> Recent Loads</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{drawer.carrier.loadCount} total</span>
              </div>
              {drawerLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
              ) : drawer.recentLoads.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No loads yet</div>
              ) : drawer.recentLoads.map((l, i) => (
                <div key={l.load_id || i} style={{ padding: '10px 18px', borderBottom: i < drawer.recentLoads.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10, transition: 'background .1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.load_id || '--'} -- {l.origin || '?'} to {l.destination || '?'}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>${Number(l.rate || l.gross_pay || 0).toLocaleString()} -- {l.status || '--'} -- {formatDate(l.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Audit Log */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Activity} size={13} /> Audit Log</span>
              </div>
              {drawerLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
              ) : drawer.auditLog.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No audit entries yet</div>
              ) : (
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {drawer.auditLog.map((a, i) => {
                    const actionColor = a.action?.includes('suspend') ? 'var(--danger)' : a.action?.includes('plan') ? 'var(--accent)' : a.action?.includes('reactivat') || a.action?.includes('approv') ? 'var(--success)' : '#3b82f6'
                    return (
                      <div key={a.id || i} style={{ padding: '10px 18px', borderBottom: i < drawer.auditLog.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: actionColor, marginTop: 4, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{(a.action || '').replace(/_/g, ' ')}</span>
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDate(a.created_at)}</span>
                          </div>
                          {a.details && Object.keys(a.details).length > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                              {Object.entries(a.details).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
