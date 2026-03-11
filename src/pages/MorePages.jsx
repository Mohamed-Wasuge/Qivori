import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Building2, Search, CheckCircle, Ban, Eye, Star, DollarSign, TrendingUp, ArrowUpRight, Users, CreditCard, AlertTriangle, MessageSquare, Clock, Mail } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

/* ─── Brokers Management ─────────────────────────────────────────────────── */
const BROKERS = [
  { name: 'Elite Logistics', contact: 'Sarah Chen', email: 'sarah@elitelogistics.com', city: 'Chicago, IL', plan: 'Standard', mrr: '$75', status: 'Active', joined: 'Jan 10', loads: 84, rating: 4.8 },
  { name: 'Apex Logistics', contact: 'David Park', email: 'david@apexlogistics.com', city: 'Atlanta, GA', plan: 'Standard', mrr: '$75', status: 'Trial', joined: 'Mar 9', loads: 6, rating: 0 },
  { name: 'Midwest Freight Co', contact: 'Lisa Wang', email: 'lisa@midwestfreight.com', city: 'Dallas, TX', plan: 'Standard', mrr: '$75', status: 'Active', joined: 'Feb 1', loads: 42, rating: 4.6 },
  { name: 'Coastal Brokerage', contact: 'Tom Rivera', email: 'tom@coastalbrokerage.com', city: 'Miami, FL', plan: 'Standard', mrr: '$75', status: 'Active', joined: 'Feb 15', loads: 38, rating: 4.7 },
  { name: 'NorthStar Freight', contact: 'Amy Torres', email: 'amy@northstarfreight.com', city: 'Denver, CO', plan: 'Standard', mrr: '$0', status: 'Pending', joined: 'Mar 10', loads: 0, rating: 0 },
]

const BROKER_FILTERS = ['All', 'Active', 'Trial', 'Pending']

export function Shippers() {
  const { showToast } = useApp()
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')

  const filtered = BROKERS.filter(b => {
    if (filter !== 'All' && b.status !== filter) return false
    if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statusPill = (s) => ({ Active: 'pill-green', Trial: 'pill-blue', Pending: 'pill-yellow' }[s] || 'pill-muted')

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Total Brokers', value: '14', change: '+3 this month', color: 'var(--accent3)' },
          { label: 'Active', value: '11', change: 'Paying customers', color: 'var(--success)' },
          { label: 'Loads Posted', value: '247', change: 'This month', color: 'var(--accent2)' },
          { label: 'Broker MRR', value: '$1,050', change: '+28% vs last mo', color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-change up">{s.change}</div>
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
            <button className="btn btn-primary" onClick={() => showToast('', 'Invite Sent', 'Broker invitation email sent')}>+ Invite Broker</button>
          </div>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {BROKER_FILTERS.map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        <table>
          <thead><tr><th>Company</th><th>Contact</th><th>Plan</th><th>MRR</th><th>Loads</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.email}>
                <td>
                  <strong>{b.name}</strong><br />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{b.city}</span>
                </td>
                <td>
                  <span style={{ fontSize: 12 }}>{b.contact}</span><br />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{b.email}</span>
                </td>
                <td style={{ fontSize: 11, fontWeight: 600 }}>{b.plan}</td>
                <td className="mono" style={{ fontWeight: 700, color: b.mrr === '$0' ? 'var(--muted)' : 'var(--accent)' }}>{b.mrr}</td>
                <td>{b.loads}</td>
                <td><span className={'pill ' + statusPill(b.status)}><span className="pill-dot" />{b.status}</span></td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>{b.joined}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {b.status === 'Pending' && (
                      <button className="btn btn-success" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={e => { e.stopPropagation(); showToast('', 'Broker Approved', b.name + ' is now active') }}>
                        <Ic icon={CheckCircle} size={12} /> Approve
                      </button>
                    )}
                    {b.status !== 'Pending' && (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={e => { e.stopPropagation(); showToast('', 'Viewing', b.name + ' · ' + b.email) }}>
                        <Ic icon={Eye} size={12} /> View
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

/* ─── Support Tickets ────────────────────────────────────────────────────── */
const TICKETS = [
  { id: 'TK-101', from: 'R&J Transport', type: 'Carrier', subject: 'IFTA report not generating', priority: 'High', status: 'Open', created: '2hrs ago' },
  { id: 'TK-100', from: 'Elite Logistics', type: 'Broker', subject: 'Can\'t post LTL loads', priority: 'Medium', status: 'Open', created: '5hrs ago' },
  { id: 'TK-099', from: 'Southern Freight', type: 'Carrier', subject: 'Fleet map not showing truck #3', priority: 'Medium', status: 'In Progress', created: 'Yesterday' },
  { id: 'TK-098', from: 'Blue Line Freight', type: 'Carrier', subject: 'Subscription payment failed', priority: 'High', status: 'Open', created: 'Yesterday' },
  { id: 'TK-097', from: 'Coastal Brokerage', type: 'Broker', subject: 'How to export carrier packet?', priority: 'Low', status: 'Resolved', created: 'Mar 7' },
  { id: 'TK-096', from: 'Express Carriers', type: 'Carrier', subject: 'Driver settlement calculation off', priority: 'High', status: 'Resolved', created: 'Mar 5' },
]

export function Documents() {
  const { showToast } = useApp()
  const [filter, setFilter] = useState('All')

  const filtered = TICKETS.filter(t => {
    if (filter === 'All') return true
    return t.status === filter
  })

  const priorityColor = (p) => ({ High: 'var(--danger)', Medium: 'var(--warning)', Low: 'var(--muted)' }[p])
  const statusPill = (s) => ({ Open: 'pill-yellow', 'In Progress': 'pill-blue', Resolved: 'pill-green' }[s] || 'pill-muted')

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Open Tickets', value: '3', change: '2 high priority', color: 'var(--danger)' },
          { label: 'In Progress', value: '1', change: 'Being worked on', color: 'var(--accent3)' },
          { label: 'Resolved This Week', value: '8', change: 'Avg 4hr response', color: 'var(--success)' },
          { label: 'Avg Response Time', value: '2.4h', change: 'Below 4hr target', color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-change up">{s.change}</div>
          </div>
        ))}
      </div>

      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title"><Ic icon={MessageSquare} size={14} /> Support Tickets</div>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          {['All', 'Open', 'In Progress', 'Resolved'].map(f => (
            <button key={f} className={'filter-chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        <table>
          <thead><tr><th>Ticket</th><th>From</th><th>Subject</th><th>Priority</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} onClick={() => showToast('', t.id + ' — ' + t.from, t.subject)}>
                <td className="mono" style={{ fontSize: 11, color: 'var(--accent3)' }}>{t.id}</td>
                <td>
                  <strong style={{ fontSize: 12 }}>{t.from}</strong><br />
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                    background: t.type === 'Carrier' ? 'rgba(34,197,94,0.1)' : 'rgba(77,142,240,0.1)',
                    color: t.type === 'Carrier' ? 'var(--success)' : 'var(--accent3)' }}>
                    {t.type}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>{t.subject}</td>
                <td>
                  <span style={{ fontSize: 10, fontWeight: 700, color: priorityColor(t.priority) }}>{t.priority}</span>
                </td>
                <td><span className={'pill ' + statusPill(t.status)}><span className="pill-dot" />{t.status}</span></td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>{t.created}</td>
                <td>
                  {t.status !== 'Resolved' ? (
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
                      onClick={e => { e.stopPropagation(); showToast('', 'Responding', 'Opening ticket ' + t.id) }}>
                      Reply
                    </button>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 3 }}><Ic icon={CheckCircle} size={11} /> Done</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
