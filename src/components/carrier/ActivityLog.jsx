import { useState, useEffect, useMemo, useCallback } from 'react'
import { Clock, Download, Filter, Search, ChevronDown, ChevronRight, FileText, Package, Users, Truck, DollarSign, Shield, Building2, RefreshCw } from 'lucide-react'
import { useCarrier } from '../../context/CarrierContext'
import * as db from '../../lib/database'

// ─── Action labels & icons ────────────────────────────────────────────────────
const ACTION_META = {
  'load.created':       { label: 'Load Created',        icon: Package,    color: '#22c55e' },
  'load.deleted':       { label: 'Load Deleted',        icon: Package,    color: '#ef4444' },
  'load_status_change': { label: 'Load Status Changed', icon: Package,    color: '#3b82f6' },
  'load.assigned':      { label: 'Load Assigned',       icon: Package,    color: '#8b5cf6' },
  'load.stop_advanced': { label: 'Stop Advanced',       icon: Package,    color: '#06b6d4' },
  'invoice.created':    { label: 'Invoice Created',     icon: DollarSign, color: '#22c55e' },
  'invoice.status':     { label: 'Invoice Updated',     icon: DollarSign, color: '#3b82f6' },
  'invoice.deleted':    { label: 'Invoice Deleted',     icon: DollarSign, color: '#ef4444' },
  'expense.created':    { label: 'Expense Added',       icon: DollarSign, color: '#f59e0b' },
  'expense.updated':    { label: 'Expense Updated',     icon: DollarSign, color: '#3b82f6' },
  'expense.deleted':    { label: 'Expense Deleted',     icon: DollarSign, color: '#ef4444' },
  'driver.created':     { label: 'Driver Added',        icon: Users,      color: '#22c55e' },
  'driver.updated':     { label: 'Driver Updated',      icon: Users,      color: '#3b82f6' },
  'driver.deleted':     { label: 'Driver Removed',      icon: Users,      color: '#ef4444' },
  'vehicle.created':    { label: 'Vehicle Added',       icon: Truck,      color: '#22c55e' },
  'vehicle.updated':    { label: 'Vehicle Updated',     icon: Truck,      color: '#3b82f6' },
  'vehicle.deleted':    { label: 'Vehicle Removed',     icon: Truck,      color: '#ef4444' },
  'company.updated':    { label: 'Company Updated',     icon: Building2,  color: '#8b5cf6' },
  'checkcall.created':  { label: 'Check Call Logged',   icon: Clock,      color: '#06b6d4' },
  'dispatch_compliance_blocked': { label: 'Compliance Block', icon: Shield, color: '#ef4444' },
  'dispatch_vehicle_blocked':    { label: 'Vehicle Block',    icon: Shield, color: '#ef4444' },
  'dispatch_hos_blocked':        { label: 'HOS Violation',    icon: Shield, color: '#ef4444' },
}

const ENTITY_FILTERS = [
  { value: '', label: 'All Activity' },
  { value: 'load', label: 'Loads' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'expense', label: 'Expenses' },
  { value: 'driver', label: 'Drivers' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'company', label: 'Company' },
]

const TIME_FILTERS = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'all', label: 'All Time' },
]

function getSince(timeFilter) {
  const now = new Date()
  switch (timeFilter) {
    case '24h': return new Date(now - 24 * 60 * 60 * 1000).toISOString()
    case '7d':  return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
    case '90d': return new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()
    default:    return null
  }
}

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 172800000) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function formatValue(val) {
  if (!val) return '—'
  if (typeof val === 'string') return val
  if (typeof val === 'number') return val.toLocaleString()
  if (typeof val === 'object') {
    const entries = Object.entries(val).filter(([, v]) => v != null && v !== '')
    if (entries.length === 0) return '—'
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ')
  }
  return String(val)
}

// ─── Change Diff Display ──────────────────────────────────────────────────────
function ChangeDiff({ oldVal, newVal }) {
  if (!oldVal && !newVal) return null
  const oldObj = typeof oldVal === 'object' && oldVal ? oldVal : {}
  const newObj = typeof newVal === 'object' && newVal ? newVal : {}
  const allKeys = [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])]
  const changes = allKeys.filter(k => JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k]))
  if (changes.length === 0 && typeof newVal === 'string') {
    return <span style={{ color: 'var(--muted)', fontSize: 12 }}>{newVal}</span>
  }
  if (changes.length === 0) return null
  return (
    <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6 }}>
      {changes.map(k => (
        <div key={k} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--muted)', minWidth: 80 }}>{k}:</span>
          {oldObj[k] != null && <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{String(oldObj[k])}</span>}
          {newObj[k] != null && <span style={{ color: '#22c55e' }}>{String(newObj[k])}</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Single Log Entry ─────────────────────────────────────────────────────────
function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false)
  const meta = ACTION_META[log.action] || { label: log.action, icon: Clock, color: '#64748b' }
  const Icon = meta.icon
  const hasDetails = log.old_value || log.new_value || log.metadata

  return (
    <div
      style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: hasDetails ? 'pointer' : 'default' }}
      onClick={() => hasDetails && setExpanded(!expanded)}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: meta.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color={meta.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{meta.label}</span>
          {log.entity_id && <span style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{log.entity_id.slice(0, 8)}</span>}
          {hasDetails && (expanded ? <ChevronDown size={12} color="var(--muted)" /> : <ChevronRight size={12} color="var(--muted)" />)}
        </div>
        {log.reason && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{log.reason}</div>}
        {expanded && <ChangeDiff oldVal={log.old_value} newVal={log.new_value} />}
        {expanded && log.metadata && Object.keys(log.metadata).length > 0 && (
          <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {formatValue(log.metadata)}
          </div>
        )}
      </div>
      <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>{formatTimestamp(log.created_at)}</span>
    </div>
  )
}

// ─── Data Export Panel ────────────────────────────────────────────────────────
function DataExport() {
  const { loads, invoices, expenses, drivers, vehicles, company } = useCarrier()
  const [exporting, setExporting] = useState(null)

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.type = 'application/octet-stream'
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    // Safari needs a small delay before click
    setTimeout(() => {
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 500)
    }, 50)
  }

  const downloadCSV = (filename, headers, rows) => {
    const escape = v => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
    triggerDownload(new Blob([csv], { type: 'text/csv' }), filename)
  }

  const downloadJSON = (filename, data) => {
    triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: 'application/octet-stream' }), filename)
  }

  const exportLoads = () => {
    setExporting('loads')
    const headers = ['Load ID', 'Origin', 'Destination', 'Status', 'Gross Pay', 'Rate/Mile', 'Miles', 'Weight', 'Driver', 'Broker', 'Pickup Date', 'Delivery Date', 'Equipment', 'Created']
    const rows = loads.map(l => [
      l.loadId || l.load_number || '', l.origin || '', l.destination || l.dest || '', l.status || '',
      l.gross || l.gross_pay || '', l.rate || l.rate_per_mile || '', l.miles || '', l.weight || '',
      l.driver || l.driver_name || '', l.broker || l.broker_name || '', l.pickup_date || '', l.delivery_date || '',
      l.equipment || l.load_type || '', l.created_at || '',
    ])
    downloadCSV(`qivori-loads-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
    setTimeout(() => setExporting(null), 1000)
  }

  const exportInvoices = () => {
    setExporting('invoices')
    const headers = ['Invoice #', 'Load ID', 'Broker', 'Amount', 'Status', 'Due Date', 'Created']
    const rows = invoices.map(i => [
      i.invoice_number || '', i.loadId || i.load_number || '', i.broker || i.broker_name || '',
      i.amount || i.total || '', i.status || '', i.due_date || '', i.created_at || '',
    ])
    downloadCSV(`qivori-invoices-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
    setTimeout(() => setExporting(null), 1000)
  }

  const exportExpenses = () => {
    setExporting('expenses')
    const headers = ['Date', 'Category', 'Description', 'Amount', 'Driver', 'Vehicle', 'Receipt']
    const rows = expenses.map(e => [
      e.date || e.expense_date || '', e.category || '', e.description || e.vendor || '',
      e.amount || '', e.driver || e.driver_name || '', e.vehicle || '', e.receipt_url ? 'Yes' : 'No',
    ])
    downloadCSV(`qivori-expenses-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
    setTimeout(() => setExporting(null), 1000)
  }

  const exportDrivers = () => {
    setExporting('drivers')
    const headers = ['Name', 'Phone', 'Email', 'CDL #', 'CDL Expiry', 'Medical Expiry', 'Pay Model', 'Pay Rate', 'Status', 'Created']
    const rows = drivers.map(d => [
      d.full_name || d.name || '', d.phone || '', d.email || '', d.cdl_number || '',
      d.cdl_expiry || '', d.medical_expiry || '', d.pay_model || 'percent', d.pay_rate || '',
      d.status || 'active', d.created_at || '',
    ])
    downloadCSV(`qivori-drivers-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
    setTimeout(() => setExporting(null), 1000)
  }

  const exportVehicles = () => {
    setExporting('vehicles')
    const headers = ['Unit #', 'Year', 'Make', 'Model', 'VIN', 'License Plate', 'Type', 'Status', 'Insurance Expiry', 'Inspection Expiry']
    const rows = vehicles.map(v => [
      v.unit_number || '', v.year || '', v.make || '', v.model || '',
      v.vin || '', v.license_plate || '', v.type || '', v.status || 'active',
      v.insurance_expiry || '', v.inspection_expiry || '',
    ])
    downloadCSV(`qivori-vehicles-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
    setTimeout(() => setExporting(null), 1000)
  }

  const exportFullBackup = () => {
    setExporting('backup')
    const backup = {
      exported_at: new Date().toISOString(),
      company: company || {},
      loads: loads.map(l => ({ ...l })),
      invoices: invoices.map(i => ({ ...i })),
      expenses: expenses.map(e => ({ ...e })),
      drivers: drivers.map(d => ({ ...d })),
      vehicles: vehicles.map(v => ({ ...v })),
    }
    downloadJSON(`qivori-full-backup-${new Date().toISOString().slice(0, 10)}.json`, backup)
    setTimeout(() => setExporting(null), 1000)
  }

  const EXPORTS = [
    { id: 'loads', label: 'Loads', count: loads.length, desc: 'All loads with status, rates, drivers, brokers', action: exportLoads },
    { id: 'invoices', label: 'Invoices', count: invoices.length, desc: 'All invoices with amounts, status, due dates', action: exportInvoices },
    { id: 'expenses', label: 'Expenses', count: expenses.length, desc: 'All expenses with categories, amounts, receipts', action: exportExpenses },
    { id: 'drivers', label: 'Drivers', count: drivers.length, desc: 'Driver profiles, CDL info, pay models', action: exportDrivers },
    { id: 'vehicles', label: 'Vehicles', count: vehicles.length, desc: 'Fleet vehicles, VINs, inspection dates', action: exportVehicles },
    { id: 'backup', label: 'Full Backup (JSON)', count: null, desc: 'Everything in one file — loads, invoices, expenses, drivers, vehicles, company', action: exportFullBackup },
  ]

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Download size={18} color="#f0a500" />
        <span style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>Export Your Data</span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Download your data anytime. CSV files open in Excel/Google Sheets. The full backup contains everything in JSON format.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {EXPORTS.map(exp => (
          <button
            key={exp.id}
            onClick={exp.action}
            disabled={exporting === exp.id}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16,
              cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>{exp.label}</span>
              {exp.count != null && <span style={{ color: 'var(--muted)', fontSize: 12 }}>{exp.count} records</span>}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{exp.desc}</div>
            {exporting === exp.id && <div style={{ color: '#22c55e', fontSize: 12, marginTop: 6 }}>Downloading...</div>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Activity Log Component ──────────────────────────────────────────────
export function ActivityLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [entityFilter, setEntityFilter] = useState('')
  const [timeFilter, setTimeFilter] = useState('7d')
  const [searchQuery, setSearchQuery] = useState('')
  const [tab, setTab] = useState('log') // 'log' | 'export'

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const filters = { limit: 500 }
      if (entityFilter) filters.entity_type = entityFilter
      const since = getSince(timeFilter)
      if (since) filters.since = since
      const data = await db.fetchAuditLogs(filters)
      setLogs(data || [])
    } catch (e) {
      console.error('Failed to fetch audit logs:', e)
      setLogs([])
    }
    setLoading(false)
  }, [entityFilter, timeFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered = useMemo(() => {
    if (!searchQuery) return logs
    const q = searchQuery.toLowerCase()
    return logs.filter(l =>
      (l.action || '').toLowerCase().includes(q) ||
      (l.entity_id || '').toLowerCase().includes(q) ||
      (l.reason || '').toLowerCase().includes(q) ||
      JSON.stringify(l.metadata || {}).toLowerCase().includes(q)
    )
  }, [logs, searchQuery])

  // Group by date
  const grouped = useMemo(() => {
    const groups = {}
    filtered.forEach(log => {
      const date = new Date(log.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      if (!groups[date]) groups[date] = []
      groups[date].push(log)
    })
    return groups
  }, [filtered])

  const exportAuditCSV = () => {
    const headers = ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Old Value', 'New Value', 'Reason']
    const rows = filtered.map(l => [
      l.created_at, l.action, l.entity_type || '', l.entity_id || '',
      JSON.stringify(l.old_value || ''), JSON.stringify(l.new_value || ''), l.reason || '',
    ])
    const escape = v => {
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `qivori-audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const sty = {
    sel: (active) => ({
      padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
      background: active ? '#f0a500' : 'transparent', color: active ? '#000' : 'var(--muted)',
    }),
    filter: {
      padding: '6px 12px', borderRadius: 6, fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)',
      color: 'var(--text)', cursor: 'pointer', outline: 'none',
    },
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ color: 'var(--text)', fontSize: 20, fontWeight: 700, margin: 0 }}>Activity Log & Data</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>Every change tracked. Your data, always exportable.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={sty.sel(tab === 'log')} onClick={() => setTab('log')}>Activity Log</button>
            <button style={sty.sel(tab === 'export')} onClick={() => setTab('export')}>Export Data</button>
          </div>
        </div>
      </div>

      {tab === 'export' ? <DataExport /> : (
        <>
          {/* Filters */}
          <div style={{ padding: '0 24px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 300 }}>
              <Search size={14} color="var(--muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                placeholder="Search activity..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ ...sty.filter, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }}
              />
            </div>
            <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={sty.filter}>
              {ENTITY_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} style={sty.filter}>
              {TIME_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <button onClick={fetchLogs} style={{ ...sty.filter, display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} /> Refresh
            </button>
            <button onClick={exportAuditCSV} style={{ ...sty.filter, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Download size={12} /> Export CSV
            </button>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{filtered.length} entries</span>
          </div>

          {/* Log List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
            {loading ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>Loading activity...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <Clock size={32} color="var(--muted)" style={{ marginBottom: 12 }} />
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>No activity found</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                  {entityFilter || timeFilter !== 'all' ? 'Try adjusting your filters' : 'Activity will appear here as you use Qivori'}
                </div>
              </div>
            ) : (
              Object.entries(grouped).map(([date, entries]) => (
                <div key={date} style={{ marginBottom: 16 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    {date}
                  </div>
                  {entries.map(log => <LogEntry key={log.id || log.created_at} log={log} />)}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
