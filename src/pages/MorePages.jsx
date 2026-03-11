import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Building2, Search, CheckCircle, Ban, Eye, Star, DollarSign, TrendingUp, ArrowUpRight, Users, CreditCard, AlertTriangle, MessageSquare, Clock, Mail, Plus, X } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

/* ─── Brokers Management ─────────────────────────────────────────────────── */
const BROKER_FILTERS = ['All', 'active', 'trial', 'pending', 'suspended']

export function Shippers() {
  const { showToast } = useApp()
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [brokers, setBrokers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchBrokers = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'broker').order('created_at', { ascending: false })
    setBrokers(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchBrokers() }, [])

  const updateStatus = async (id, status, name) => {
    await supabase.from('profiles').update({ status }).eq('id', id)
    showToast('', status === 'active' ? 'Approved' : 'Updated', name + ' — ' + status)
    fetchBrokers()
  }

  const filtered = brokers.filter(b => {
    if (filter !== 'All' && b.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (b.full_name || '').toLowerCase().includes(q) || (b.company_name || '').toLowerCase().includes(q) || (b.email || '').toLowerCase().includes(q)
    }
    return true
  })

  const statusPill = (s) => ({ active: 'pill-green', trial: 'pill-blue', pending: 'pill-yellow', suspended: 'pill-red' }[s] || 'pill-muted')
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading brokers...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Brokers', value: brokers.length, color: 'var(--accent3)' },
          { label: 'Active', value: brokers.filter(b => b.status === 'active').length, color: 'var(--success)' },
          { label: 'On Trial', value: brokers.filter(b => b.status === 'trial').length, color: 'var(--accent2)' },
          { label: 'Pending', value: brokers.filter(b => b.status === 'pending').length, color: 'var(--warning)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={Building2} size={14} /> Broker Accounts</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Ic icon={Search} size={13} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--muted)' }} />
              <input className="form-input" placeholder="Search brokers..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: 200, height: 34, fontSize: 12 }} />
            </div>
          </div>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {BROKER_FILTERS.map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
              {f === 'All' ? f : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {brokers.length === 0 ? 'No brokers have signed up yet.' : 'No brokers match your filter.'}
          </div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Location</th><th>Plan</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id}>
                  <td><strong>{b.full_name || 'No name'}</strong></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{b.email}</td>
                  <td style={{ fontSize: 12 }}>{b.company_name || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{[b.city, b.state].filter(Boolean).join(', ') || '—'}</td>
                  <td style={{ fontSize: 11, fontWeight: 600 }}>{b.plan || 'trial'}</td>
                  <td><span className={'pill ' + statusPill(b.status)}><span className="pill-dot" />{b.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(b.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {b.status === 'pending' && (
                        <button className="btn btn-success" style={{ padding: '4px 8px', fontSize: 10 }}
                          onClick={() => updateStatus(b.id, 'active', b.full_name || b.email)}>
                          <Ic icon={CheckCircle} size={12} /> Approve
                        </button>
                      )}
                      {b.status === 'suspended' && (
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                          onClick={() => updateStatus(b.id, 'active', b.full_name || b.email)}>
                          <Ic icon={CheckCircle} size={12} /> Reactivate
                        </button>
                      )}
                      {b.status !== 'suspended' && b.status !== 'pending' && (
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--danger)' }}
                          onClick={() => updateStatus(b.id, 'suspended', b.full_name || b.email)}>
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

/* ─── Revenue & Subscriptions ────────────────────────────────────────────── */
export function Payments() {
  const { showToast } = useApp()

  const subscriptions = [
    { company: 'R&J Transport', type: 'Carrier', plan: 'Small Fleet', amount: '$99', status: 'Paid', next: 'Apr 15', method: 'Visa •••• 4242' },
    { company: 'Express Carriers', type: 'Carrier', plan: 'Growing Fleet', amount: '$199', status: 'Paid', next: 'Apr 22', method: 'MC •••• 8821' },
    { company: 'Elite Logistics', type: 'Broker', plan: 'Standard', amount: '$75', status: 'Paid', next: 'Apr 10', method: 'Visa •••• 1234' },
    { company: 'Southern Freight', type: 'Carrier', plan: 'Small Fleet', amount: '$99', status: 'Paid', next: 'Apr 3', method: 'ACH •••• 6654' },
    { company: 'FastHaul Express', type: 'Carrier', plan: 'Small Fleet', amount: '$99', status: 'Trial', next: 'Mar 22', method: '—' },
    { company: 'Blue Line Freight', type: 'Carrier', plan: 'Solo', amount: '$49', status: 'Failed', next: 'Retry Mar 11', method: 'Visa •••• 9091' },
    { company: 'Apex Logistics', type: 'Broker', plan: 'Standard', amount: '$75', status: 'Trial', next: 'Mar 23', method: '—' },
  ]

  const statusPill = (s) => ({ Paid: 'pill-green', Trial: 'pill-blue', Failed: 'pill-red', Cancelled: 'pill-muted' }[s] || 'pill-yellow')

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Monthly Revenue (MRR)', value: '$4,830', change: '+22% vs last month', color: 'var(--accent)' },
          { label: 'Active Subscriptions', value: '58', change: '52 carriers + 6 brokers', color: 'var(--success)' },
          { label: 'Trial Users', value: '8', change: 'Converting in 14 days', color: 'var(--accent3)' },
          { label: 'Churn Rate', value: '2.1%', change: 'Below 5% target', color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-change up">{s.change}</div>
          </div>
        ))}
      </div>

      <div className="grid2 fade-in">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Ic icon={CreditCard} size={14} /> Subscriptions</div>
            <button className="btn btn-ghost">Export CSV</button>
          </div>
          <table>
            <thead><tr><th>Company</th><th>Type</th><th>Plan</th><th>Amount</th><th>Status</th><th>Next Bill</th></tr></thead>
            <tbody>
              {subscriptions.map(s => (
                <tr key={s.company} onClick={() => showToast('', s.company, s.plan + ' · ' + s.amount + '/mo · ' + s.method)}>
                  <td><strong>{s.company}</strong></td>
                  <td>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: s.type === 'Carrier' ? 'rgba(34,197,94,0.1)' : 'rgba(77,142,240,0.1)',
                      color: s.type === 'Carrier' ? 'var(--success)' : 'var(--accent3)' }}>
                      {s.type}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{s.plan}</td>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.amount}</td>
                  <td><span className={'pill ' + statusPill(s.status)}><span className="pill-dot" />{s.status}</span></td>
                  <td style={{ fontSize: 11, color: s.status === 'Failed' ? 'var(--danger)' : 'var(--muted)' }}>{s.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Plan breakdown */}
          <div className="panel">
            <div className="panel-header"><div className="panel-title"><Ic icon={TrendingUp} size={14} /> Plan Breakdown</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { plan: 'Solo ($49)', count: 28, mrr: '$1,372', pct: 28, color: 'var(--accent2)' },
                { plan: 'Small Fleet ($99)', count: 18, mrr: '$1,782', pct: 37, color: 'var(--accent)' },
                { plan: 'Growing Fleet ($199)', count: 6, mrr: '$1,194', pct: 25, color: 'var(--accent3)' },
                { plan: 'Broker Standard ($75)', count: 6, mrr: '$450', pct: 10, color: 'var(--accent4)' },
              ].map(p => (
                <div key={p.plan}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{p.plan}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.count} users · <span className="mono" style={{ color: p.color, fontWeight: 700 }}>{p.mrr}</span></span>
                  </div>
                  <div style={{ height: 5, background: 'var(--border)', borderRadius: 3 }}>
                    <div style={{ width: p.pct + '%', height: '100%', background: p.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="panel">
            <div className="panel-header"><div className="panel-title"><Ic icon={DollarSign} size={14} /> Revenue Actions</div></div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => showToast('', 'Reminder Sent', 'Payment reminder sent to 2 failed accounts')}>
                <Ic icon={Mail} size={14} /> Send Payment Reminders
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => showToast('', 'Exported', 'Revenue report downloaded as CSV')}>
                <Ic icon={TrendingUp} size={14} /> Export Revenue Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Support Tickets (Supabase) ─────────────────────────────────────────── */

export function Documents() {
  const { showToast } = useApp()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTicket, setNewTicket] = useState({ subject: '', message: '', priority: 'medium' })

  const fetchTickets = async () => {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching tickets:', error)
      showToast('', 'Error', 'Failed to load tickets')
    }
    setTickets(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchTickets() }, [])

  const updateTicketStatus = async (e, id, newStatus) => {
    e.stopPropagation()
    const { error } = await supabase
      .from('tickets')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      showToast('', 'Error', 'Failed to update ticket')
      return
    }
    const label = newStatus === 'in_progress' ? 'In Progress' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)
    showToast('', 'Status Updated', 'Ticket moved to ' + label)
    fetchTickets()
  }

  const createTicket = async () => {
    if (!newTicket.subject.trim() || !newTicket.message.trim()) {
      showToast('', 'Missing Fields', 'Subject and message are required')
      return
    }
    setCreating(true)
    const { error } = await supabase.from('tickets').insert({
      subject: newTicket.subject.trim(),
      message: newTicket.message.trim(),
      priority: newTicket.priority,
      status: 'open',
      user_name: 'Admin',
      user_email: 'admin@qivori.com',
    })
    setCreating(false)
    if (error) {
      showToast('', 'Error', 'Failed to create ticket')
      return
    }
    showToast('', 'Ticket Created', newTicket.subject)
    setNewTicket({ subject: '', message: '', priority: 'medium' })
    setShowCreate(false)
    fetchTickets()
  }

  const formatDate = (d) => {
    if (!d) return '—'
    const date = new Date(d)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHrs = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return diffMins + 'min ago'
    if (diffHrs < 24) return diffHrs + 'hr' + (diffHrs > 1 ? 's' : '') + ' ago'
    if (diffDays < 7) return diffDays + ' day' + (diffDays > 1 ? 's' : '') + ' ago'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  const statusMap = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' }
  const filterMap = { 'All': null, 'Open': 'open', 'In Progress': 'in_progress', 'Resolved': 'resolved' }

  const filtered = tickets.filter(t => {
    if (filter === 'All') return true
    return t.status === filterMap[filter]
  })

  const priorityColor = (p) => ({ high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--muted)' }[p] || 'var(--muted)')
  const statusPill = (s) => ({ open: 'pill-yellow', in_progress: 'pill-blue', resolved: 'pill-green', closed: 'pill-muted' }[s] || 'pill-muted')

  const openCount = tickets.filter(t => t.status === 'open').length
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading tickets...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Tickets', value: tickets.length, color: 'var(--accent3)' },
          { label: 'Open', value: openCount, change: openCount > 0 ? openCount + ' need attention' : 'All clear', color: 'var(--danger)' },
          { label: 'In Progress', value: inProgressCount, change: 'Being worked on', color: 'var(--accent3)' },
          { label: 'Resolved', value: resolvedCount, change: resolvedCount > 0 ? 'Great work' : '—', color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            {s.change && <div className="stat-change up">{s.change}</div>}
          </div>
        ))}
      </div>

      {/* Create Ticket Modal */}
      {showCreate && (
        <div className="panel fade-in" style={{ border: '1px solid var(--accent)', position: 'relative' }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={Plus} size={14} /> Create Test Ticket</div>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)} style={{ padding: 4 }}>
              <Ic icon={X} size={16} />
            </button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Subject</label>
              <input className="form-input" placeholder="Ticket subject..." value={newTicket.subject}
                onChange={e => setNewTicket({ ...newTicket, subject: e.target.value })}
                style={{ width: '100%', height: 36, fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Message</label>
              <textarea className="form-input" placeholder="Describe the issue..." value={newTicket.message}
                onChange={e => setNewTicket({ ...newTicket, message: e.target.value })}
                style={{ width: '100%', height: 80, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>Priority</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['low', 'medium', 'high'].map(p => (
                  <button key={p} className={'filter-chip' + (newTicket.priority === p ? ' active' : '')}
                    onClick={() => setNewTicket({ ...newTicket, priority: p })}
                    style={{ textTransform: 'capitalize' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={createTicket} disabled={creating}
              style={{ alignSelf: 'flex-end', padding: '8px 20px' }}>
              {creating ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </div>
      )}

      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={MessageSquare} size={14} /> Support Tickets</div>
          <button className="btn btn-ghost" onClick={() => setShowCreate(!showCreate)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Ic icon={Plus} size={14} /> Create Ticket
          </button>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {['All', 'Open', 'In Progress', 'Resolved'].map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <Ic icon={MessageSquare} size={28} style={{ marginBottom: 10, opacity: 0.3 }} /><br />
            {tickets.length === 0 ? 'No tickets yet. Create one to get started.' : 'No tickets match this filter.'}
          </div>
        ) : (
          <table>
            <thead><tr><th>ID</th><th>From</th><th>Subject</th><th>Priority</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} onClick={() => showToast('', t.subject, t.message || 'No message')}>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--accent3)' }}>{'#' + String(t.id).slice(-4)}</td>
                  <td>
                    <strong style={{ fontSize: 12 }}>{t.user_name || 'Unknown'}</strong><br />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{t.user_email || ''}</span>
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</td>
                  <td>
                    <span style={{ fontSize: 10, fontWeight: 700, color: priorityColor(t.priority), textTransform: 'capitalize' }}>{t.priority}</span>
                  </td>
                  <td><span className={'pill ' + statusPill(t.status)}><span className="pill-dot" />{statusMap[t.status] || t.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(t.created_at)}</td>
                  <td>
                    {t.status === 'open' && (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={e => updateTicketStatus(e, t.id, 'in_progress')}>
                        <Ic icon={Clock} size={11} /> Start
                      </button>
                    )}
                    {t.status === 'in_progress' && (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10, color: 'var(--success)' }}
                        onClick={e => updateTicketStatus(e, t.id, 'resolved')}>
                        <Ic icon={CheckCircle} size={11} /> Resolve
                      </button>
                    )}
                    {(t.status === 'resolved' || t.status === 'closed') && (
                      <span style={{ fontSize: 10, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 3 }}><Ic icon={CheckCircle} size={11} /> Done</span>
                    )}
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
