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
  const updatePlan = useCallback(async (companyId, newPlan, companyName) => {
    const old = companies.find(c => c.id === companyId)
    await supabase.from('companies').update({ plan: newPlan }).eq('id', companyId)
    await logAudit(companyId, 'plan_change', { old_plan: old?.plan, new_plan: newPlan })
    showToast('', 'Plan Updated', `${companyName} changed to ${newPlan.toUpperCase()}`)
    fetchData()
  }, [companies, showToast, fetchData])

  const updateStatus = useCallback(async (companyId, newStatus, companyName) => {
    const old = companies.find(c => c.id === companyId)
    await supabase.from('companies').update({ carrier_status: newStatus }).eq('id', companyId)
    await logAudit(companyId, 'status_change', { old_status: old?.carrier_status, new_status: newStatus })
    const verb = newStatus === 'active' ? 'Approved' : newStatus === 'suspended' ? 'Suspended' : 'Updated'
    showToast('', verb, `${companyName} -- ${newStatus}`)
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

  const openDrawer = useCallback(async (carrier) => {
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
    return <div style={{ width: size, height: size, borderRadius: radius, background: c + '20', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 800, flexShrink: 0, fontFamily: "'Bebas Neue', sans-serif" }}>{letter}</div>
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading carriers...</div>

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }} onClick={() => planDropdown && setPlanDropdown(null)}>

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
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: `1px solid ${active ? s.color + '60' : 'var(--border)'}`, background: active ? s.color + '10' : 'var(--surface)', cursor: 'pointer', transition: 'all .15s', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = s.color + '50'; e.currentTarget.style.background = s.color + '08' }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' } else { e.currentTarget.style.borderColor = s.color + '60' } }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px', background: s.color }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, lineHeight: 1, color: 'var(--text)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{s.label}</div>
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

      {/* -- Carrier Cards -- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontSize: 14, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <Ic icon={Building2} size={28} style={{ marginBottom: 8, opacity: 0.4 }} /><br />
            No carriers match your filters.
          </div>
        ) : filtered.map(c => {
          const co = c.company; const isExp = expanded[co.id]; const isLegacy = c.isLegacy
          if (isLegacy) return (
            <div key="__legacy__" style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', opacity: 0.7 }}>
              <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setExpanded(p => ({ ...p, __legacy__: !p.__legacy__ }))}>
                <Ic icon={isExp ? ChevronDown : ChevronRight} size={14} color="var(--muted)" />
                <Ic icon={Users} size={16} color="var(--muted)" />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>Individual Users ({c.members.length})</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>Users not assigned to a company</span>
              </div>
              {isExp && c.members.map(m => {
                const p = m.profile || {}
                return (
                  <div key={m.user_id} style={{ padding: '10px 16px 10px 48px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.full_name || p.email || '--'}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1 }}>{p.email || '--'}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent2)', textTransform: 'uppercase' }}>{m.role}</span>
                    <StatusPill status={m.status} />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{loadCounts[m.user_id] || 0} loads</span>
                  </div>
                )
              })}
            </div>
          )
          return (
            <div key={co.id} style={{ background: 'var(--surface)', borderRadius: 12, border: `1px solid ${isExp ? 'var(--accent)30' : 'var(--border)'}`, transition: 'border-color .15s' }}>
              {/* Main row */}
              <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'background .1s', borderRadius: isExp ? '12px 12px 0 0' : 12 }}
                onClick={() => setExpanded(p => ({ ...p, [co.id]: !p[co.id] }))}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Ic icon={isExp ? ChevronDown : ChevronRight} size={14} color="var(--muted)" style={{ flexShrink: 0 }} />
                <Avatar name={co.name} />
                <div style={{ minWidth: 0, flex: '1.5 1 0' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{co.mc_number ? `MC-${co.mc_number}` : co.dot_number ? `DOT-${co.dot_number}` : 'No MC/DOT'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, flex: '0.8 1 0' }}>
                  <PlanBadge plan={co.plan} companyId={co.id} companyName={co.name} clickable />
                  <span style={{ fontSize: 10, color: PLAN_COLORS[co.plan] || 'var(--muted)' }}>{PLAN_PRICING[co.plan] || ''}</span>
                </div>
                <div style={{ flex: '0.5 1 0' }}><StatusPill status={co.carrier_status} /></div>
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><Ic icon={Mail} size={11} />{c.owner?.email || '--'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Ic icon={Calendar} size={10} />{formatDate(co.created_at)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0.4 1 0', justifyContent: 'center' }}>
                  <Ic icon={Package} size={11} color="var(--muted)" />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{c.loadCount}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => openDrawer(c)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--accent)30', background: 'var(--accent)10', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, transition: 'all .1s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#000' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)10'; e.currentTarget.style.color = 'var(--accent)' }}>
                    <Ic icon={Eye} size={12} /> View
                  </button>
                  {co.carrier_status === 'pending' && (
                    <button onClick={() => updateStatus(co.id, 'active', co.name)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--success)30', background: 'var(--success)10', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Ic icon={CheckCircle} size={12} /> Approve
                    </button>
                  )}
                  {co.carrier_status === 'suspended' && (
                    <button onClick={() => updateStatus(co.id, 'active', co.name)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--success)30', background: 'var(--success)10', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Ic icon={RotateCcw} size={12} /> Reactivate
                    </button>
                  )}
                  {(co.carrier_status === 'active' || co.carrier_status === 'trial') && (
                    <button onClick={() => updateStatus(co.id, 'suspended', co.name)} style={{ padding: '6px 10px', fontSize: 11, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--danger)30', background: 'var(--danger)10', color: 'var(--danger)', display: 'flex', alignItems: 'center' }}
                      title="Suspend carrier">
                      <Ic icon={Ban} size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded sub-users */}
              {isExp && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '0 0 12px 12px' }}>
                  {c.members.length === 0 && addSubUser !== co.id ? (
                    <div style={{ padding: '24px 56px', color: 'var(--muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Ic icon={Users} size={16} style={{ opacity: 0.4 }} />
                      No team members yet -- add your first dispatcher or driver
                    </div>
                  ) : c.members.map(m => {
                    const p = m.profile || {}
                    return (
                      <div key={m.id || m.user_id} style={{ padding: '10px 16px 10px 56px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, transition: 'background .1s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.02)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <Avatar name={p.full_name || p.email} size={32} radius={8} fontSize={13} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.full_name || '--'}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email || '--'}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', background: 'var(--accent2, #3b82f6)15', color: 'var(--accent2, #3b82f6)' }}>{m.role || '--'}</span>
                        <StatusPill status={m.status || 'active'} />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => sendPasswordReset(p.email)} title="Send password reset"
                            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                            <Ic icon={KeyRound} size={12} />
                          </button>
                          {(m.status || 'active') !== 'deactivated' ? (
                            <button onClick={() => suspendSubUser(m.id, co.id, p.email)} title="Suspend user"
                              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                              <Ic icon={Ban} size={12} />
                            </button>
                          ) : (
                            <button onClick={() => reactivateSubUser(m.id, co.id, p.email)} title="Reactivate user"
                              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .1s' }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--success)'; e.currentTarget.style.color = 'var(--success)' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                              <Ic icon={RotateCcw} size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {/* Add sub-user inline form */}
                  <div style={{ padding: '10px 16px 12px 56px' }}>
                    {addSubUser === co.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input className="form-input" placeholder="email@example.com" value={subUserForm.email}
                          onChange={e => setSubUserForm(p => ({ ...p, email: e.target.value }))}
                          style={{ height: 34, fontSize: 12, flex: 1, borderRadius: 8 }} />
                        <select className="form-input" value={subUserForm.role}
                          onChange={e => setSubUserForm(p => ({ ...p, role: e.target.value }))}
                          style={{ height: 34, fontSize: 12, width: 110, cursor: 'pointer', borderRadius: 8 }}>
                          <option value="driver">Driver</option>
                          <option value="dispatcher">Dispatcher</option>
                        </select>
                        <button disabled={addingSubUser} onClick={() => handleAddSubUser(co.id)}
                          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 12, cursor: addingSubUser ? 'not-allowed' : 'pointer', opacity: addingSubUser ? 0.6 : 1 }}>
                          {addingSubUser ? '...' : 'Add'}
                        </button>
                        <button onClick={() => { setAddSubUser(null); setSubUserForm({ email: '', role: 'driver' }) }}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                          <Ic icon={X} size={14} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setAddSubUser(co.id)}
                        style={{ padding: '7px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s' }}
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
          <div style={{ position: 'relative', width: 560, maxWidth: '94vw', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '-8px 0 32px rgba(0,0,0,.3)' }}>
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
                  { label: 'Company Name', field: 'name', value: drawer.carrier.company.name },
                  { label: 'MC Number', field: 'mc_number', value: drawer.carrier.company.mc_number },
                  { label: 'DOT Number', field: 'dot_number', value: drawer.carrier.company.dot_number },
                  { label: 'Email', field: 'email', value: drawer.carrier.company.email },
                  { label: 'Phone', field: 'phone', value: drawer.carrier.company.phone },
                  { label: 'Address', field: 'address', value: drawer.carrier.company.address },
                ].map(d => (
                  <div key={d.label}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{d.label}</div>
                    <input className="form-input"
                      style={{ width: '100%', height: 34, fontSize: 12, background: 'var(--surface2)', borderRadius: 8 }}
                      defaultValue={d.value || ''}
                      onBlur={e => { if (e.target.value !== (d.value || '')) updateCompanyField(drawer.carrier.company.id, d.field, e.target.value, d.label) }}
                      placeholder={`Enter ${d.label.toLowerCase()}...`} />
                  </div>
                ))}
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
                    <option value="driver">Driver</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="admin">Admin</option>
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
      )}
    </div>
  )
}
