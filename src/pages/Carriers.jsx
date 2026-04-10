import { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { apiFetch } from '../lib/api'
import {
  Truck, Search, CheckCircle, Ban, Eye, Shield, Building2, ChevronDown, ChevronRight,
  UserPlus, X, Package, Mail, Calendar, KeyRound, Sparkles, Users, StickyNote,
  Clock, Activity, FileText, Plus, AlertCircle, RotateCcw
} from 'lucide-react'

const AdminCarrierOnboarding = lazy(() => import('../components/AdminCarrierOnboarding'))
const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const PLANS = ['trial', 'beta', 'basic', 'pro', 'enterprise']
const PLAN_COLORS = { trial: '#6b7280', beta: '#3b82f6', basic: '#22c55e', pro: '#f0a500', enterprise: '#8b5cf6' }
const STATUS_OPTIONS = ['active', 'pending', 'suspended', 'trial']
const SORT_OPTIONS = [
  { label: 'Joined (newest)', key: 'newest' },
  { label: 'Joined (oldest)', key: 'oldest' },
  { label: 'Name A-Z', key: 'name_asc' },
  { label: 'Last Active', key: 'last_active' },
]

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'
const statusColor = (s) => ({ active: 'var(--success)', trial: '#3b82f6', pending: 'var(--warning)', suspended: 'var(--danger)' }[s] || 'var(--muted)')

const logAudit = async (companyId, action, details = {}) => {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('admin_audit_log').insert({
    company_id: companyId,
    action,
    details,
    performed_by: user?.id || null,
  })
}

export default function Carriers() {
  const { showToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [allProfiles, setAllProfiles] = useState([])
  const [members, setMembers] = useState([])
  const [loadCounts, setLoadCounts] = useState({})
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [statFilter, setStatFilter] = useState(null)
  const [sortBy, setSortBy] = useState('newest')
  const [expanded, setExpanded] = useState({})
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', company_name: '', role: 'carrier' })
  const [addingUser, setAddingUser] = useState(false)
  const [drawer, setDrawer] = useState(null) // { carrier, auditLog, recentLoads }
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [editingNotes, setEditingNotes] = useState({})
  const [addSubUser, setAddSubUser] = useState(null) // companyId
  const [subUserForm, setSubUserForm] = useState({ email: '', role: 'driver' })
  const [addingSubUser, setAddingSubUser] = useState(false)

  // ── Fetch all data ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const [compRes, memRes, profRes] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('company_members').select('*, profile:profiles(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    ])
    setCompanies(compRes.data || [])
    setMembers(memRes.data || [])
    setAllProfiles(profRes.data || [])

    // Load counts per owner_id
    const { data: loads } = await supabase.from('loads').select('user_id')
    const counts = {}
    ;(loads || []).forEach(l => { counts[l.user_id] = (counts[l.user_id] || 0) + 1 })
    setLoadCounts(counts)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Build carrier list ──────────────────────────────────────
  const carrierList = useMemo(() => {
    const membersByCompany = {}
    members.forEach(m => {
      if (!m.company_id) return
      if (!membersByCompany[m.company_id]) membersByCompany[m.company_id] = []
      membersByCompany[m.company_id].push(m)
    })
    const profileMap = {}
    allProfiles.forEach(p => { profileMap[p.id] = p })

    const usersInCompanies = new Set()
    members.forEach(m => { if (m.user_id) usersInCompanies.add(m.user_id) })

    const list = companies.map(c => {
      const compMembers = membersByCompany[c.id] || []
      const owner = c.owner_id ? profileMap[c.owner_id] : compMembers.find(m => m.role === 'owner')?.profile
      const totalLoads = compMembers.reduce((sum, m) => sum + (loadCounts[m.user_id] || 0), 0) + (c.owner_id ? (loadCounts[c.owner_id] || 0) : 0)
      return {
        id: c.id,
        company: c,
        owner,
        members: compMembers.map(m => ({ ...m, profile: m.profile || profileMap[m.user_id] })),
        loadCount: totalLoads,
      }
    })

    // Legacy users without company_members entry
    const legacyUsers = allProfiles.filter(p => !usersInCompanies.has(p.id) && p.role !== 'admin')
    if (legacyUsers.length > 0) {
      list.push({
        id: '__legacy__',
        company: { id: '__legacy__', name: 'Individual Users', plan: '--', carrier_status: '--', created_at: null },
        owner: null,
        members: legacyUsers.map(p => ({ user_id: p.id, profile: p, role: p.role || 'carrier', status: p.status || 'active' })),
        loadCount: legacyUsers.reduce((s, p) => s + (loadCounts[p.id] || 0), 0),
        isLegacy: true,
      })
    }
    return list
  }, [companies, members, allProfiles, loadCounts])

  // ── Stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const real = carrierList.filter(c => !c.isLegacy)
    return {
      total: real.length,
      active: real.filter(c => c.company.carrier_status === 'active').length,
      trial: real.filter(c => c.company.carrier_status === 'trial' || c.company.plan === 'trial').length,
      beta: real.filter(c => c.company.plan === 'beta').length,
      paid: real.filter(c => ['basic', 'pro', 'enterprise'].includes(c.company.plan)).length,
      suspended: real.filter(c => c.company.carrier_status === 'suspended').length,
    }
  }, [carrierList])

  // ── Filtering + sorting ─────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...carrierList]

    // Stat chip filter
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

    // Plan filter
    if (planFilter !== 'All') {
      list = list.filter(c => c.company.plan === planFilter.toLowerCase())
    }
    // Status filter
    if (statusFilter !== 'All') {
      list = list.filter(c => c.company.carrier_status === statusFilter.toLowerCase())
    }
    // Search
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => {
        const co = c.company
        return (co.name || '').toLowerCase().includes(q) ||
          (co.mc_number || '').toLowerCase().includes(q) ||
          (co.dot_number || '').toLowerCase().includes(q) ||
          (co.email || '').toLowerCase().includes(q) ||
          (c.owner?.email || '').toLowerCase().includes(q)
      })
    }
    // Sort
    list.sort((a, b) => {
      if (a.isLegacy) return 1
      if (b.isLegacy) return -1
      if (sortBy === 'newest') return new Date(b.company.created_at || 0) - new Date(a.company.created_at || 0)
      if (sortBy === 'oldest') return new Date(a.company.created_at || 0) - new Date(b.company.created_at || 0)
      if (sortBy === 'name_asc') return (a.company.name || '').localeCompare(b.company.name || '')
      return 0
    })
    return list
  }, [carrierList, statFilter, planFilter, statusFilter, search, sortBy])

  // ── Action handlers ─────────────────────────────────────────
  const updatePlan = async (companyId, newPlan, companyName) => {
    const old = companies.find(c => c.id === companyId)
    await supabase.from('companies').update({ plan: newPlan }).eq('id', companyId)
    await logAudit(companyId, 'plan_change', { old_plan: old?.plan, new_plan: newPlan })
    showToast('', 'Plan Updated', `${companyName} changed to ${newPlan.toUpperCase()}`)
    fetchData()
  }

  const updateStatus = async (companyId, newStatus, companyName) => {
    const old = companies.find(c => c.id === companyId)
    await supabase.from('companies').update({ carrier_status: newStatus }).eq('id', companyId)
    await logAudit(companyId, 'status_change', { old_status: old?.carrier_status, new_status: newStatus })
    const verb = newStatus === 'active' ? 'Approved' : newStatus === 'suspended' ? 'Suspended' : 'Updated'
    showToast('', verb, `${companyName} -- ${newStatus}`)
    fetchData()
  }

  const saveNotes = async (companyId, notes) => {
    await supabase.from('companies').update({ admin_notes: notes }).eq('id', companyId)
    await logAudit(companyId, 'notes_updated', { notes })
    showToast('', 'Notes Saved', 'Admin notes updated')
    setEditingNotes(prev => { const n = { ...prev }; delete n[companyId]; return n })
    fetchData()
  }

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      showToast('', 'Error', 'Fill in name, email, and password'); return
    }
    setAddingUser(true)
    try {
      const res = await apiFetch('/api/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newUser.email, password: newUser.password, full_name: newUser.full_name, company_name: newUser.company_name || null, role: newUser.role }),
      })
      const data = await res.json()
      if (data.id) {
        showToast('', 'User Created', `${newUser.full_name} added as ${newUser.role}`)
        setShowAddUser(false)
        setNewUser({ email: '', password: '', full_name: '', company_name: '', role: 'carrier' })
        fetchData()
      } else showToast('', 'Error', data.error || 'Failed to create user')
    } catch { showToast('', 'Error', 'Failed to create user') }
    setAddingUser(false)
  }

  const handleAddSubUser = async (companyId) => {
    if (!subUserForm.email) { showToast('', 'Error', 'Enter an email'); return }
    setAddingSubUser(true)
    try {
      const res = await apiFetch('/api/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: subUserForm.email, password: 'Temp1234!', full_name: subUserForm.email.split('@')[0], role: 'carrier', company_id: companyId, company_role: subUserForm.role }),
      })
      const data = await res.json()
      if (data.id || data.success) {
        await logAudit(companyId, 'sub_user_added', { email: subUserForm.email, role: subUserForm.role })
        showToast('', 'Sub-User Added', `${subUserForm.email} added as ${subUserForm.role}`)
        setAddSubUser(null)
        setSubUserForm({ email: '', role: 'driver' })
        fetchData()
      } else showToast('', 'Error', data.error || 'Failed')
    } catch { showToast('', 'Error', 'Failed to add sub-user') }
    setAddingSubUser(false)
  }

  const suspendSubUser = async (memberId, companyId, email) => {
    await supabase.from('company_members').update({ status: 'deactivated' }).eq('id', memberId)
    await logAudit(companyId, 'sub_user_suspended', { email })
    showToast('', 'User Suspended', email)
    fetchData()
  }

  const reactivateSubUser = async (memberId, companyId, email) => {
    await supabase.from('company_members').update({ status: 'active' }).eq('id', memberId)
    await logAudit(companyId, 'sub_user_reactivated', { email })
    showToast('', 'User Reactivated', email)
    fetchData()
  }

  const sendPasswordReset = async (email) => {
    try {
      const res = await apiFetch('/api/admin-reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'send_reset_link' }),
      })
      const data = await res.json()
      if (data.success) showToast('', 'Reset Link Sent', `Sent to ${email}`)
      else showToast('', 'Error', data.error || 'Failed')
    } catch { showToast('', 'Error', 'Failed to send reset') }
  }

  // ── Detail Drawer ───────────────────────────────────────────
  const openDrawer = async (carrier) => {
    setDrawer({ carrier, auditLog: [], recentLoads: [] })
    setDrawerLoading(true)
    const [auditRes, loadsRes] = await Promise.all([
      carrier.company.id !== '__legacy__'
        ? supabase.from('admin_audit_log').select('*').eq('company_id', carrier.company.id).order('created_at', { ascending: false }).limit(50)
        : Promise.resolve({ data: [] }),
      carrier.owner?.id
        ? supabase.from('loads').select('load_id, origin, destination, rate, gross_pay, status, created_at').eq('user_id', carrier.owner.id).order('created_at', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
    ])
    setDrawer({ carrier, auditLog: auditRes.data || [], recentLoads: loadsRes.data || [] })
    setDrawerLoading(false)
  }

  // ── Styles ──────────────────────────────────────────────────
  const S = {
    chip: (active) => ({
      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      background: active ? 'rgba(240,165,0,0.12)' : 'var(--surface)',
      color: active ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.15s',
    }),
    planBadge: (plan) => ({
      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 6, textTransform: 'uppercase',
      background: (PLAN_COLORS[plan] || '#6b7280') + '20', color: PLAN_COLORS[plan] || '#6b7280',
    }),
    statusPill: (s) => ({
      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize',
      background: statusColor(s) + '18', color: statusColor(s),
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }),
    row: {
      display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 0.8fr 1.5fr 0.7fr 0.7fr 1.4fr',
      alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--border)',
      fontSize: 12, gap: 8, cursor: 'pointer', transition: 'background 0.1s',
    },
    th: { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
    btn: (color = 'var(--muted)') => ({
      padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
      border: `1px solid ${color}30`, background: `${color}10`, color, display: 'inline-flex',
      alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    }),
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading carriers...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Stats Bar ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="fade-in">
        {[
          { label: 'Total Carriers', value: stats.total, key: null },
          { label: 'Active', value: stats.active, key: 'active' },
          { label: 'Trial', value: stats.trial, key: 'trial' },
          { label: 'Beta', value: stats.beta, key: 'beta' },
          { label: 'Paid', value: stats.paid, key: 'paid' },
          { label: 'Suspended', value: stats.suspended, key: 'suspended' },
        ].map(s => (
          <button key={s.label} onClick={() => setStatFilter(statFilter === s.key ? null : s.key)}
            style={{
              ...S.chip(statFilter === s.key),
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18 }}>{s.value}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Search + Filters ───────────────────────────────── */}
      <div className="panel fade-in">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="panel-title"><Ic icon={Building2} size={14} /> Carrier Management</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
              <input className="form-input" placeholder="Search name, MC#, email..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 200, height: 34, fontSize: 12 }} />
            </div>
            <select className="form-input" value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ height: 34, fontSize: 11, width: 140, cursor: 'pointer' }}>
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setShowOnboarding(true)} style={{
              background: 'linear-gradient(135deg, #f0a500, #f59e0b)', color: '#000', fontWeight: 800,
              border: 'none', boxShadow: '0 4px 16px rgba(240,165,0,0.3)',
            }}>
              <Ic icon={Sparkles} size={14} /> Onboard Carrier
            </button>
            <button className="btn" onClick={() => setShowAddUser(true)}>
              <Ic icon={UserPlus} size={14} /> Quick Add
            </button>
          </div>
        </div>

        {/* Filter chips row */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginRight: 4 }}>PLAN:</span>
          {['All', ...PLANS].map(f => (
            <button key={f} style={S.chip(planFilter === (f === 'All' ? 'All' : f))}
              onClick={() => setPlanFilter(f === 'All' ? 'All' : f)}>
              {f === 'All' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px' }} />
          <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginRight: 4 }}>STATUS:</span>
          {['All', ...STATUS_OPTIONS].map(f => (
            <button key={f} style={S.chip(statusFilter === (f === 'All' ? 'All' : f))}
              onClick={() => setStatusFilter(f === 'All' ? 'All' : f)}>
              {f === 'All' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Table Header ───────────────────────────────────── */}
        <div style={{ ...S.row, cursor: 'default', background: 'var(--surface)' }}>
          <span style={S.th}>Carrier</span>
          <span style={S.th}>MC#</span>
          <span style={S.th}>Plan</span>
          <span style={S.th}>Status</span>
          <span style={S.th}>Owner Email</span>
          <span style={S.th}>Joined</span>
          <span style={S.th}>Loads</span>
          <span style={S.th}>Actions</span>
        </div>

        {/* ── Carrier Rows ───────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No carriers match your filters.</div>
        ) : filtered.map(c => {
          const co = c.company
          const isExpanded = expanded[co.id]
          const isLegacy = c.isLegacy
          return (
            <div key={co.id}>
              <div style={{ ...S.row, background: isExpanded ? 'var(--surface)' : 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)' }}
                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}>
                {/* Name + expand chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={() => !isLegacy && setExpanded(p => ({ ...p, [co.id]: !p[co.id] }))}>
                  {!isLegacy && <Ic icon={isExpanded ? ChevronDown : ChevronRight} size={14} color="var(--muted)" />}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{co.name || 'Unnamed'}</div>
                    {co.dot_number && <div style={{ fontSize: 10, color: 'var(--muted)' }}>DOT: {co.dot_number}</div>}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{co.mc_number || '--'}</span>
                <span>{!isLegacy && <span style={S.planBadge(co.plan)}>{co.plan || 'trial'}</span>}</span>
                <span>{!isLegacy && <span style={S.statusPill(co.carrier_status)}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />{co.carrier_status || 'pending'}</span>}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.owner?.email || '--'}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(co.created_at)}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{c.loadCount}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {!isLegacy && (
                    <>
                      <button style={S.btn('var(--accent)')} onClick={(e) => { e.stopPropagation(); openDrawer(c) }}>
                        <Ic icon={Eye} size={11} /> View
                      </button>
                      {co.carrier_status === 'pending' && (
                        <button style={S.btn('var(--success)')} onClick={(e) => { e.stopPropagation(); updateStatus(co.id, 'active', co.name) }}>
                          <Ic icon={CheckCircle} size={11} /> Approve
                        </button>
                      )}
                      {co.carrier_status === 'suspended' && (
                        <button style={S.btn('var(--success)')} onClick={(e) => { e.stopPropagation(); updateStatus(co.id, 'active', co.name) }}>
                          <Ic icon={RotateCcw} size={11} /> Reactivate
                        </button>
                      )}
                      {(co.carrier_status === 'active' || co.carrier_status === 'trial') && (
                        <button style={S.btn('var(--danger)')} onClick={(e) => { e.stopPropagation(); updateStatus(co.id, 'suspended', co.name) }}>
                          <Ic icon={Ban} size={11} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* ── Expanded sub-users ─────────────────────────── */}
              {(isExpanded || isLegacy) && c.members.length > 0 && (
                <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  {/* Notes row for non-legacy */}
                  {!isLegacy && (
                    <div style={{ padding: '8px 18px 8px 50px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                      <Ic icon={StickyNote} size={12} color="var(--warning)" />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>NOTES:</span>
                      <input className="form-input"
                        style={{ flex: 1, height: 28, fontSize: 11, background: 'var(--surface)' }}
                        value={editingNotes[co.id] !== undefined ? editingNotes[co.id] : (co.admin_notes || '')}
                        onChange={e => setEditingNotes(p => ({ ...p, [co.id]: e.target.value }))}
                        onBlur={() => { if (editingNotes[co.id] !== undefined) saveNotes(co.id, editingNotes[co.id]) }}
                        placeholder="Add admin notes..."
                      />
                      {/* Plan dropdown */}
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>PLAN:</span>
                      <select className="form-input"
                        style={{ height: 28, fontSize: 11, width: 110, background: 'var(--surface)', cursor: 'pointer' }}
                        value={co.plan || 'trial'}
                        onChange={e => updatePlan(co.id, e.target.value, co.name)}>
                        {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                      </select>
                    </div>
                  )}
                  {/* Sub-user header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1.5fr', padding: '8px 18px 6px 50px', gap: 8 }}>
                    <span style={S.th}>Name</span>
                    <span style={S.th}>Email</span>
                    <span style={S.th}>Role</span>
                    <span style={S.th}>Status</span>
                    <span style={S.th}>Actions</span>
                  </div>
                  {c.members.map(m => {
                    const p = m.profile || {}
                    return (
                      <div key={m.id || m.user_id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1.5fr', padding: '8px 18px 8px 50px', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{p.full_name || '--'}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || '--'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent2)', textTransform: 'uppercase' }}>{m.role || '--'}</span>
                        <span style={S.statusPill(m.status || 'active')}><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />{m.status || 'active'}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={S.btn('var(--accent2)')} onClick={() => sendPasswordReset(p.email)} title="Reset password">
                            <Ic icon={KeyRound} size={10} />
                          </button>
                          {m.status !== 'deactivated' ? (
                            <button style={S.btn('var(--danger)')} onClick={() => suspendSubUser(m.id, co.id, p.email)} title="Suspend">
                              <Ic icon={Ban} size={10} />
                            </button>
                          ) : (
                            <button style={S.btn('var(--success)')} onClick={() => reactivateSubUser(m.id, co.id, p.email)} title="Reactivate">
                              <Ic icon={RotateCcw} size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {/* Add sub-user */}
                  {!isLegacy && (
                    <div style={{ padding: '8px 18px 10px 50px' }}>
                      {addSubUser === co.id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input className="form-input" placeholder="email@example.com" value={subUserForm.email}
                            onChange={e => setSubUserForm(p => ({ ...p, email: e.target.value }))}
                            style={{ height: 30, fontSize: 11, flex: 1 }} />
                          <select className="form-input" value={subUserForm.role}
                            onChange={e => setSubUserForm(p => ({ ...p, role: e.target.value }))}
                            style={{ height: 30, fontSize: 11, width: 100, cursor: 'pointer' }}>
                            <option value="driver">Driver</option>
                            <option value="dispatcher">Dispatcher</option>
                          </select>
                          <button style={S.btn('var(--success)')} disabled={addingSubUser}
                            onClick={() => handleAddSubUser(co.id)}>
                            {addingSubUser ? '...' : 'Add'}
                          </button>
                          <button style={S.btn()} onClick={() => { setAddSubUser(null); setSubUserForm({ email: '', role: 'driver' }) }}>
                            <Ic icon={X} size={10} />
                          </button>
                        </div>
                      ) : (
                        <button style={{ ...S.btn('var(--accent)'), padding: '5px 12px' }}
                          onClick={() => setAddSubUser(co.id)}>
                          <Ic icon={Plus} size={10} /> Add Sub-User
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Quick Add Modal ────────────────────────────────── */}
      {showAddUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAddUser(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 400, maxWidth: '90%' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Quick Add User</div>
              <button onClick={() => setShowAddUser(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Ic icon={X} size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['carrier', 'broker', 'admin'].map(r => (
                  <button key={r} onClick={() => setNewUser(p => ({ ...p, role: r }))}
                    style={{
                      flex: 1, padding: '8px 0', border: `1px solid ${newUser.role === r ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8, background: newUser.role === r ? 'rgba(240,165,0,0.1)' : 'var(--surface2)',
                      color: newUser.role === r ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
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

      {/* ── Onboarding Wizard ──────────────────────────────── */}
      {showOnboarding && (
        <Suspense fallback={null}>
          <AdminCarrierOnboarding
            onClose={() => setShowOnboarding(false)}
            onCreated={() => { setShowOnboarding(false); fetchData() }}
          />
        </Suspense>
      )}

      {/* ── Detail Drawer ──────────────────────────────────── */}
      {drawer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setDrawer(null)} />
          <div style={{ position: 'relative', width: 520, maxWidth: '92vw', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
                  {drawer.carrier.company.name}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span style={S.planBadge(drawer.carrier.company.plan)}>{drawer.carrier.company.plan || 'trial'}</span>
                  <span style={S.statusPill(drawer.carrier.company.carrier_status)}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                    {drawer.carrier.company.carrier_status || 'pending'}
                  </span>
                </div>
              </div>
              <button onClick={() => setDrawer(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Ic icon={X} size={20} /></button>
            </div>

            {/* Company Info */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'MC Number', value: drawer.carrier.company.mc_number || '--' },
                { label: 'DOT Number', value: drawer.carrier.company.dot_number || '--' },
                { label: 'Owner', value: drawer.carrier.owner?.full_name || '--' },
                { label: 'Email', value: drawer.carrier.owner?.email || drawer.carrier.company.email || '--' },
                { label: 'Phone', value: drawer.carrier.company.phone || '--' },
                { label: 'Joined', value: formatDate(drawer.carrier.company.created_at) },
                { label: 'Load Count', value: String(drawer.carrier.loadCount) },
                { label: 'Invoice Terms', value: drawer.carrier.company.invoice_terms || '--' },
              ].map(d => (
                <div key={d.label}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>{d.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.value}</div>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>PLAN:</span>
                <select className="form-input" style={{ height: 30, fontSize: 11, width: 110, cursor: 'pointer' }}
                  value={drawer.carrier.company.plan || 'trial'}
                  onChange={e => { updatePlan(drawer.carrier.company.id, e.target.value, drawer.carrier.company.name); setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, plan: e.target.value } } })) }}>
                  {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              {drawer.carrier.company.carrier_status === 'pending' && (
                <button style={S.btn('var(--success)')} onClick={() => { updateStatus(drawer.carrier.company.id, 'active', drawer.carrier.company.name); setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, carrier_status: 'active' } } })) }}>
                  <Ic icon={CheckCircle} size={12} /> Approve
                </button>
              )}
              {(drawer.carrier.company.carrier_status === 'active' || drawer.carrier.company.carrier_status === 'trial') && (
                <button style={S.btn('var(--danger)')} onClick={() => { updateStatus(drawer.carrier.company.id, 'suspended', drawer.carrier.company.name); setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, carrier_status: 'suspended' } } })) }}>
                  <Ic icon={Ban} size={12} /> Suspend
                </button>
              )}
              {drawer.carrier.company.carrier_status === 'suspended' && (
                <button style={S.btn('var(--success)')} onClick={() => { updateStatus(drawer.carrier.company.id, 'active', drawer.carrier.company.name); setDrawer(d => ({ ...d, carrier: { ...d.carrier, company: { ...d.carrier.company, carrier_status: 'active' } } })) }}>
                  <Ic icon={RotateCcw} size={12} /> Reactivate
                </button>
              )}
            </div>

            {/* Admin Notes */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Ic icon={StickyNote} size={11} /> Admin Notes
              </div>
              <textarea className="form-input"
                style={{ width: '100%', minHeight: 60, fontSize: 12, resize: 'vertical', background: 'var(--surface2)' }}
                defaultValue={drawer.carrier.company.admin_notes || ''}
                onBlur={e => saveNotes(drawer.carrier.company.id, e.target.value)}
                placeholder="Add internal notes about this carrier..."
              />
            </div>

            {/* Sub-users */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={Users} size={12} /> Team Members ({drawer.carrier.members.length})</span>
              </div>
              {drawer.carrier.members.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No team members</div>
              ) : drawer.carrier.members.map(m => {
                const p = m.profile || {}
                return (
                  <div key={m.id || m.user_id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                      {(p.full_name || p.email || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{p.full_name || '--'}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.email || '--'}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent2)', textTransform: 'uppercase' }}>{m.role}</span>
                    <button style={S.btn('var(--accent2)')} onClick={() => sendPasswordReset(p.email)} title="Reset password">
                      <Ic icon={KeyRound} size={10} />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Recent Loads */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={Package} size={12} /> Recent Loads</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{drawer.carrier.loadCount} total</span>
              </div>
              {drawerLoading ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
              ) : drawer.recentLoads.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No loads yet</div>
              ) : drawer.recentLoads.map((l, i) => (
                <div key={l.load_id || i} style={{ padding: '8px 14px', borderBottom: i < drawer.recentLoads.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Ic icon={Package} size={11} color="var(--accent)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.load_id || '--'} -- {l.origin || '?'} to {l.destination || '?'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>${Number(l.rate || l.gross_pay || 0).toLocaleString()} -- {l.status || '--'}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Audit Log */}
            <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><Ic icon={Activity} size={12} /> Audit Log</span>
              </div>
              {drawerLoading ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
              ) : drawer.auditLog.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No audit entries yet</div>
              ) : (
                <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                  {drawer.auditLog.map((a, i) => (
                    <div key={a.id || i} style={{ padding: '8px 14px', borderBottom: i < drawer.auditLog.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{(a.action || '').replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDate(a.created_at)}</span>
                      </div>
                      {a.details && Object.keys(a.details).length > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                          {Object.entries(a.details).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                        </div>
                      )}
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
