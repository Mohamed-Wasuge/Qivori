import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Ic, S, StatCard } from './shared'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import {
  ArrowRight, AlertTriangle, Check, CheckCircle, Clock, DollarSign,
  FileText, Filter, Inbox, Package, RefreshCw, Send, Shield, Truck,
  X, XCircle, Zap, ChevronDown, ChevronRight, Eye, RotateCw,
  Activity, AlertCircle, Bot, Search, Plus, Upload,
} from 'lucide-react'

// ── EDI Dashboard Hub ────────────────────────────────────────────────────────

export function EDIDashboard() {
  const [tab, setTab] = useState('tenders')
  const tabs = [
    { id: 'tenders', label: 'Incoming Tenders', icon: Inbox },
    { id: 'transactions', label: 'All Transactions', icon: FileText },
    { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle },
    { id: 'partners', label: 'Trading Partners', icon: Shield },
    { id: 'test', label: 'Test & Sandbox', icon: Zap },
  ]

  return (
    <div style={S.page}>
      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.id ? 'var(--accent)' : 'transparent',
              color: tab === t.id ? '#000' : 'var(--muted)',
              fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all .2s',
            }}>
            <Ic icon={t.icon} size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tenders' && <IncomingTenders />}
      {tab === 'transactions' && <AllTransactions />}
      {tab === 'exceptions' && <ExceptionsQueue />}
      {tab === 'partners' && <TradingPartners />}
      {tab === 'test' && <TestSandbox />}
    </div>
  )
}

// ── Stats Header ─────────────────────────────────────────────────────────────

function EDIStats({ transactions }) {
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const tenders204 = transactions.filter(t => t.transaction_type === '204' && t.direction === 'inbound')
    const todayTenders = tenders204.filter(t => (t.created_at || '').startsWith(today))
    const accepted = tenders204.filter(t => t.ai_decision === 'accept')
    const rejected = tenders204.filter(t => t.ai_decision === 'reject')
    const negotiate = tenders204.filter(t => t.ai_decision === 'negotiate')
    const errors = transactions.filter(t => t.status === 'error')

    return {
      totalTenders: tenders204.length,
      todayTenders: todayTenders.length,
      accepted: accepted.length,
      rejected: rejected.length,
      negotiate: negotiate.length,
      errors: errors.length,
      acceptRate: tenders204.length > 0 ? Math.round(accepted.length / tenders204.length * 100) : 0,
    }
  }, [transactions])

  return (
    <div style={S.grid(5)}>
      <StatCard label="Total Tenders" value={stats.totalTenders} />
      <StatCard label="Today" value={stats.todayTenders} color="var(--accent)" />
      <StatCard label="Accepted" value={stats.accepted} color="var(--success)" />
      <StatCard label="Rejected" value={stats.rejected} color="var(--danger)" />
      <StatCard label="Negotiate" value={stats.negotiate} color="var(--warning)" />
    </div>
  )
}

// ── Incoming Tenders Tab ─────────────────────────────────────────────────────

function IncomingTenders() {
  const { showToast } = useApp()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (await apiFetch('/api/edi/transactions?type=204&direction=inbound&limit=100')).json()
      setTransactions(res.transactions || [])
    } catch {
      // Fallback: fetch directly from Supabase via context
      setTransactions([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (filter === 'all') return transactions
    return transactions.filter(t => t.ai_decision === filter || t.status === filter)
  }, [transactions, filter])

  const handleManualDecision = async (txn, decision) => {
    try {
      const res = await (await apiFetch('/api/edi/send-990', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ load_id: txn.load_id, decision, transaction_id: txn.id }),
      })).json()
      if (res.success) {
        showToast(`990 ${decision} sent for ${txn.load_number || txn.id}`)
        fetchData()
      }
    } catch (e) {
      showToast(`Failed to send 990: ${e.message}`, 'error')
    }
  }

  const decisionColor = {
    accept: 'var(--success)', reject: 'var(--danger)', negotiate: 'var(--warning)',
  }
  const decisionIcon = {
    accept: CheckCircle, reject: XCircle, negotiate: Clock,
  }

  return (
    <>
      <EDIStats transactions={transactions} />

      {/* Filter Row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Ic icon={Filter} size={13} style={{ color: 'var(--muted)' }} />
        {['all', 'accept', 'reject', 'negotiate', 'error'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid',
              borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
              background: filter === f ? 'rgba(240,165,0,0.1)' : 'transparent',
              color: filter === f ? 'var(--accent)' : 'var(--muted)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={fetchData} className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>
          <Ic icon={RefreshCw} size={12} /> Refresh
        </button>
      </div>

      {/* Tender List */}
      <div style={S.panel}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading EDI transactions...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Ic icon={Inbox} size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>No tenders found</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Send a 204 via the Test tab or API to see it here</div>
          </div>
        ) : (
          filtered.map(txn => (
            <TenderRow key={txn.id} txn={txn} expanded={expanded === txn.id}
              onToggle={() => setExpanded(expanded === txn.id ? null : txn.id)}
              onDecision={handleManualDecision}
              decisionColor={decisionColor} decisionIcon={decisionIcon} />
          ))
        )}
      </div>
    </>
  )
}

function TenderRow({ txn, expanded, onToggle, onDecision, decisionColor, decisionIcon }) {
  const canonical = txn.canonical_load || {}
  const metrics = txn.ai_metrics || {}
  const DecIcon = decisionIcon[txn.ai_decision] || Clock
  const color = decisionColor[txn.ai_decision] || 'var(--muted)'

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Row */}
      <div onClick={onToggle} style={{ ...S.row, cursor: 'pointer' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ic icon={DecIcon} size={16} style={{ color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {canonical.origin || '—'} <Ic icon={ArrowRight} size={11} style={{ color: 'var(--muted)' }} /> {canonical.destination || '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {txn.load_number || canonical.load_id || txn.id?.slice(0, 8)} · {canonical.broker_name || 'Unknown broker'} · {canonical.equipment || 'Dry Van'}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 100 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color }}>
            ${(canonical.rate || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {canonical.miles || '—'} mi · ${metrics.rpm || '—'}/mi
          </div>
        </div>
        <div style={{ ...S.badge(color), textTransform: 'uppercase' }}>
          {txn.ai_decision || txn.status || '—'}
        </div>
        <Ic icon={expanded ? ChevronDown : ChevronRight} size={14} style={{ color: 'var(--muted)' }} />
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', background: 'var(--surface2)' }}>
          {/* Metrics Grid */}
          <div style={{ ...S.grid(4), marginBottom: 12, marginTop: 8 }}>
            <MiniStat label="Est. Profit" value={`$${metrics.estProfit || 0}`} color={metrics.estProfit >= 1200 ? 'var(--success)' : metrics.estProfit >= 800 ? 'var(--warning)' : 'var(--danger)'} />
            <MiniStat label="RPM" value={`$${metrics.rpm || 0}`} />
            <MiniStat label="Profit/Day" value={`$${metrics.profitPerDay || 0}`} />
            <MiniStat label="Transit" value={`${metrics.transitDays || 0}d`} />
          </div>

          {/* AI Reasons */}
          {txn.ai_reasons && txn.ai_reasons.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>AI ANALYSIS</div>
              {txn.ai_reasons.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text)', padding: '3px 0', display: 'flex', gap: 6 }}>
                  <Ic icon={Bot} size={11} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
                  {r}
                </div>
              ))}
            </div>
          )}

          {/* Negotiation Script */}
          {txn.ai_decision === 'negotiate' && txn.ai_metrics?.negotiation && (
            <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', marginBottom: 4 }}>NEGOTIATION SCRIPT</div>
              <div style={{ fontSize: 12, color: 'var(--text)', fontStyle: 'italic' }}>
                "{txn.ai_metrics.negotiation?.script || 'Counter-offer recommended'}"
              </div>
            </div>
          )}

          {/* Reference Numbers */}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
            {canonical.reference_numbers?.bol && <span>BOL: {canonical.reference_numbers.bol} · </span>}
            {canonical.reference_numbers?.po && <span>PO: {canonical.reference_numbers.po} · </span>}
            {canonical.weight && <span>Weight: {canonical.weight} lbs · </span>}
            {canonical.pickup_date && <span>Pickup: {canonical.pickup_date} · </span>}
            {canonical.delivery_date && <span>Delivery: {canonical.delivery_date}</span>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            {txn.ai_decision === 'negotiate' && (
              <>
                <button onClick={() => onDecision(txn, 'accept')} className="btn btn-primary" style={{ fontSize: 11, padding: '6px 14px' }}>
                  <Ic icon={Check} size={12} /> Accept
                </button>
                <button onClick={() => onDecision(txn, 'reject')} className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 14px', color: 'var(--danger)' }}>
                  <Ic icon={X} size={12} /> Reject
                </button>
              </>
            )}
            {txn.status === 'error' && (
              <button onClick={() => onDecision(txn, 'reprocess')} className="btn btn-ghost" style={{ fontSize: 11 }}>
                <Ic icon={RotateCw} size={12} /> Reprocess
              </button>
            )}
          </div>

          {/* Timestamps */}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
            Received: {new Date(txn.received_at || txn.created_at).toLocaleString()} ·
            Confidence: {txn.ai_confidence || 0}%
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color, letterSpacing: 0.5 }}>{value}</div>
    </div>
  )
}

// ── All Transactions Tab ─────────────────────────────────────────────────────

function AllTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await (await apiFetch('/api/edi/transactions?limit=200')).json()
        setTransactions(res.transactions || [])
      } catch { setTransactions([]) }
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return transactions
    return transactions.filter(t => t.transaction_type === typeFilter)
  }, [transactions, typeFilter])

  const typeColors = { '204': '#3b82f6', '990': '#10b981', '214': '#f59e0b', '210': '#8b5cf6' }

  return (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        {['all', '204', '990', '214', '210'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid',
              borderColor: typeFilter === t ? (typeColors[t] || 'var(--accent)') : 'var(--border)',
              background: typeFilter === t ? (typeColors[t] || 'var(--accent)') + '15' : 'transparent',
              color: typeFilter === t ? (typeColors[t] || 'var(--accent)') : 'var(--muted)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      <div style={S.panel}>
        <div style={{ ...S.panelHead, padding: '10px 16px' }}>
          <div style={{ ...S.grid(6), flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            <div>Type</div><div>Direction</div><div>Load</div><div>Status</div><div>Decision</div><div>Time</div>
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No transactions</div>
        ) : (
          filtered.map(txn => {
            const tc = typeColors[txn.transaction_type] || 'var(--muted)'
            return (
              <div key={txn.id} style={{ ...S.grid(6), padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }}>
                <div><span style={S.badge(tc)}>{txn.transaction_type}</span></div>
                <div style={{ color: 'var(--muted)' }}>
                  <Ic icon={txn.direction === 'inbound' ? Inbox : Send} size={11} /> {txn.direction}
                </div>
                <div style={{ fontWeight: 600 }}>{txn.load_number || '—'}</div>
                <div><span style={S.badge(txn.status === 'processed' ? 'var(--success)' : txn.status === 'error' ? 'var(--danger)' : 'var(--muted)')}>{txn.status}</span></div>
                <div style={{ color: txn.ai_decision ? decisionColorMap[txn.ai_decision] || 'var(--muted)' : 'var(--muted)' }}>
                  {txn.ai_decision || '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{timeAgo(txn.created_at)}</div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

const decisionColorMap = { accept: 'var(--success)', reject: 'var(--danger)', negotiate: 'var(--warning)' }

// ── Exceptions Queue Tab ─────────────────────────────────────────────────────

function ExceptionsQueue() {
  const { showToast } = useApp()
  const [exceptions, setExceptions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchExceptions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (await apiFetch('/api/edi/exceptions')).json()
      setExceptions(res.exceptions || [])
    } catch { setExceptions([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchExceptions() }, [fetchExceptions])

  const handleResolve = async (id) => {
    try {
      await apiFetch('/api/edi/exceptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'resolved' }),
      })
      showToast('Exception resolved')
      fetchExceptions()
    } catch {}
  }

  const severityColor = { critical: 'var(--danger)', error: '#ef4444', warning: 'var(--warning)', info: '#3b82f6' }

  return (
    <div style={S.panel}>
      <div style={S.panelHead}>
        <div style={S.panelTitle}>
          <Ic icon={AlertTriangle} size={14} style={{ color: 'var(--warning)', marginRight: 8 }} />
          Exception Queue ({exceptions.filter(e => e.status === 'open').length} open)
        </div>
        <button onClick={fetchExceptions} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
          <Ic icon={RefreshCw} size={11} /> Refresh
        </button>
      </div>
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
      ) : exceptions.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Ic icon={CheckCircle} size={32} style={{ color: 'var(--success)', marginBottom: 12 }} />
          <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 700 }}>All clear</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>No open exceptions</div>
        </div>
      ) : (
        exceptions.map(exc => (
          <div key={exc.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
              background: severityColor[exc.severity] || 'var(--muted)',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{exc.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{exc.description}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                <span style={S.badge(severityColor[exc.severity] || 'var(--muted)')}>{exc.severity}</span>
                {' · '}<span style={S.badge('var(--muted)')}>{exc.exception_type}</span>
                {' · '}{timeAgo(exc.created_at)}
              </div>
            </div>
            {exc.status === 'open' && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => handleResolve(exc.id)} className="btn btn-ghost" style={{ fontSize: 10, padding: '4px 10px' }}>
                  <Ic icon={Check} size={11} /> Resolve
                </button>
              </div>
            )}
            {exc.status === 'resolved' && (
              <span style={S.badge('var(--success)')}>Resolved</span>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ── Trading Partners Tab ─────────────────────────────────────────────────────

function TradingPartners() {
  const { showToast } = useApp()
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', isa_id: '', gs_id: '', partner_type: 'broker', connection_type: 'api', api_endpoint: '', contact_email: '' })

  const fetchPartners = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (await apiFetch('/api/edi/partners')).json()
      setPartners(res.partners || [])
    } catch { setPartners([]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPartners() }, [fetchPartners])

  const handleAdd = async () => {
    if (!form.name) return showToast('Name required', 'error')
    try {
      await apiFetch('/api/edi/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      showToast('Partner added')
      setShowAdd(false)
      setForm({ name: '', isa_id: '', gs_id: '', partner_type: 'broker', connection_type: 'api', api_endpoint: '', contact_email: '' })
      fetchPartners()
    } catch (e) {
      showToast(`Error: ${e.message}`, 'error')
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{partners.length} trading partners configured</div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary" style={{ fontSize: 11, padding: '6px 14px' }}>
          <Ic icon={Plus} size={12} /> Add Partner
        </button>
      </div>

      {/* Add Partner Form */}
      {showAdd && (
        <div style={{ ...S.panel, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Trading Partner</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Apex Freight Solutions" />
            <Input label="ISA ID" value={form.isa_id} onChange={v => setForm({ ...form, isa_id: v })} placeholder="APEXFREIGHT" />
            <Input label="GS ID" value={form.gs_id} onChange={v => setForm({ ...form, gs_id: v })} placeholder="APEX" />
            <select value={form.partner_type} onChange={e => setForm({ ...form, partner_type: e.target.value })}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }}>
              <option value="broker">Broker</option>
              <option value="shipper">Shipper</option>
              <option value="3pl">3PL</option>
            </select>
            <Input label="API Endpoint" value={form.api_endpoint} onChange={v => setForm({ ...form, api_endpoint: v })} placeholder="https://partner.com/edi/webhook" />
            <Input label="Contact Email" value={form.contact_email} onChange={v => setForm({ ...form, contact_email: v })} placeholder="dispatch@partner.com" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleAdd} className="btn btn-primary" style={{ fontSize: 11 }}>Save Partner</button>
            <button onClick={() => setShowAdd(false)} className="btn btn-ghost" style={{ fontSize: 11 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Partner List */}
      <div style={S.panel}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
        ) : partners.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Ic icon={Shield} size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>No trading partners yet</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Add a partner to start receiving EDI tenders</div>
          </div>
        ) : (
          partners.map(p => (
            <div key={p.id} style={{ ...S.row }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic icon={Shield} size={16} style={{ color: 'var(--accent)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  ISA: {p.isa_id || '—'} · {p.partner_type} · {p.connection_type}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{p.transaction_count || 0}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>transactions</div>
              </div>
              <span style={S.badge(p.status === 'active' ? 'var(--success)' : 'var(--muted)')}>{p.status}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}

// ── Test & Sandbox Tab ───────────────────────────────────────────────────────

function TestSandbox() {
  const { showToast } = useApp()
  const [mode, setMode] = useState('sample')  // 'sample', 'raw', 'api'
  const [rawEdi, setRawEdi] = useState('')
  const [apiLoad, setApiLoad] = useState({
    broker_name: 'Test Broker LLC',
    origin: 'Chicago, IL',
    destination: 'Dallas, TX',
    rate: 4800,
    miles: 920,
    equipment: 'Dry Van',
    weight: '42000',
    pickup_date: new Date().toISOString().split('T')[0],
    delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
  })
  const [result, setResult] = useState(null)
  const [sending, setSending] = useState(false)

  const sampleEdi = `ISA*00*          *00*          *ZZ*BROKERTEST     *ZZ*QIVORI         *${new Date().toISOString().slice(2,10).replace(/-/g,'')}*1430*U*00401*000000001*0*P*>~
GS*SM*BROKERTEST*QIVORI*${new Date().toISOString().slice(0,10).replace(/-/g,'')}*1430*000000001*X*004010~
ST*204*0001~
B2**QVRI**REF-TEST-001**PP~
B2A*00~
L11*BOL-TEST-001*BM~
L11*PO-TEST-001*PO~
MS3*QVRI*B*CL*TL~
NTE*GEN*Test shipment - sandbox mode~
S5*1*CL*24*42000*L~
N1*SH*ABC Manufacturing~
N3*1200 Industrial Blvd~
N4*Chicago*IL*60601~
G62*10*${new Date(Date.now() + 86400000).toISOString().slice(0,10).replace(/-/g,'')}*1*0800~
S5*2*UL*24*42000*L~
N1*CN*XYZ Distribution~
N3*4500 Commerce Drive~
N4*Dallas*TX*75201~
G62*11*${new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10).replace(/-/g,'')}*1*1400~
N1*BT*Test Broker LLC~
AT8*G*L*42000*1~
L3*42000****4800.00~
SE*22*0001~
GE*1*000000001~
IEA*1*000000001~`

  const handleSend = async () => {
    setSending(true)
    setResult(null)
    try {
      let body = {}
      if (mode === 'sample') body = { raw_edi: sampleEdi }
      else if (mode === 'raw') body = { raw_edi: rawEdi }
      else body = { load: apiLoad }

      const rawRes = await apiFetch('/api/edi/receive-204', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const res = await rawRes.json()
      setResult(res)
      if (res.success) showToast(`204 processed: ${res.decision?.toUpperCase()} (${res.confidence}%)`)
      else showToast(`Error: ${res.errors?.join(', ') || res.error}`, 'error')
    } catch (e) {
      setResult({ success: false, error: e.message })
      showToast(`Failed: ${e.message}`, 'error')
    }
    setSending(false)
  }

  return (
    <>
      {/* Mode Selector */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { id: 'sample', label: 'Sample 204', icon: Zap },
          { id: 'raw', label: 'Raw X12', icon: FileText },
          { id: 'api', label: 'API/JSON', icon: Package },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid',
              borderColor: mode === m.id ? 'var(--accent)' : 'var(--border)',
              background: mode === m.id ? 'rgba(240,165,0,0.1)' : 'var(--surface)',
              color: mode === m.id ? 'var(--accent)' : 'var(--muted)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Ic icon={m.icon} size={13} /> {m.label}
          </button>
        ))}
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}>
            {mode === 'sample' ? 'Sample 204 (Chicago → Dallas, $4,800)' :
             mode === 'raw' ? 'Paste Raw X12 EDI' : 'JSON Load Tender'}
          </div>
          <button onClick={handleSend} disabled={sending} className="btn btn-primary" style={{ fontSize: 11 }}>
            {sending ? 'Processing...' : <><Ic icon={Send} size={12} /> Send 204</>}
          </button>
        </div>
        <div style={S.panelBody}>
          {mode === 'sample' && (
            <pre style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', background: 'var(--surface2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              {sampleEdi}
            </pre>
          )}
          {mode === 'raw' && (
            <textarea value={rawEdi} onChange={e => setRawEdi(e.target.value)}
              placeholder="Paste X12 204 EDI document here..."
              style={{ width: '100%', minHeight: 200, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }} />
          )}
          {mode === 'api' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input label="Broker" value={apiLoad.broker_name} onChange={v => setApiLoad({ ...apiLoad, broker_name: v })} />
              <Input label="Origin" value={apiLoad.origin} onChange={v => setApiLoad({ ...apiLoad, origin: v })} />
              <Input label="Destination" value={apiLoad.destination} onChange={v => setApiLoad({ ...apiLoad, destination: v })} />
              <Input label="Rate ($)" value={apiLoad.rate} onChange={v => setApiLoad({ ...apiLoad, rate: parseFloat(v) || 0 })} type="number" />
              <Input label="Miles" value={apiLoad.miles} onChange={v => setApiLoad({ ...apiLoad, miles: parseInt(v) || 0 })} type="number" />
              <Input label="Weight (lbs)" value={apiLoad.weight} onChange={v => setApiLoad({ ...apiLoad, weight: v })} />
              <Input label="Equipment" value={apiLoad.equipment} onChange={v => setApiLoad({ ...apiLoad, equipment: v })} />
              <Input label="Pickup Date" value={apiLoad.pickup_date} onChange={v => setApiLoad({ ...apiLoad, pickup_date: v })} type="date" />
            </div>
          )}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div style={{ ...S.panel, borderColor: result.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }}>
          <div style={{ ...S.panelHead, background: result.success ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)' }}>
            <div style={{ ...S.panelTitle, color: result.success ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ic icon={result.success ? CheckCircle : XCircle} size={16} />
              {result.success ? `${result.decision?.toUpperCase()} — ${result.confidence}% confidence` : 'Processing Failed'}
            </div>
          </div>
          <div style={S.panelBody}>
            {result.success ? (
              <>
                {/* Metrics */}
                <div style={{ ...S.grid(4), marginBottom: 12 }}>
                  <MiniStat label="Profit" value={`$${result.metrics?.estProfit || 0}`} color={result.metrics?.estProfit >= 1200 ? 'var(--success)' : 'var(--warning)'} />
                  <MiniStat label="RPM" value={`$${result.metrics?.rpm || 0}`} />
                  <MiniStat label="$/Day" value={`$${result.metrics?.profitPerDay || 0}`} />
                  <MiniStat label="Fuel" value={`$${result.metrics?.fuelCost || 0}`} />
                </div>

                {/* Reasons */}
                {result.reasons?.map((r, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text)', padding: '2px 0', display: 'flex', gap: 6 }}>
                    <Ic icon={Bot} size={11} style={{ color: 'var(--accent)', marginTop: 2 }} /> {r}
                  </div>
                ))}

                {/* Load + Driver Info */}
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
                  {result.load_number && <div>Load: {result.load_number}</div>}
                  {result.driver && <div>Driver: {result.driver.name}</div>}
                  {result.response_990 && <div style={{ color: 'var(--success)' }}>990 response sent</div>}
                </div>

                {/* Timeline */}
                {result.timeline && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>PROCESSING TIMELINE</div>
                    {result.timeline.map((t, i) => (
                      <div key={i} style={{ fontSize: 10, color: 'var(--muted)', padding: '2px 0', display: 'flex', gap: 8 }}>
                        <Ic icon={Activity} size={10} style={{ marginTop: 2, color: 'var(--accent)' }} />
                        <span style={{ fontWeight: 600, minWidth: 80 }}>{t.step}</span>
                        {t.detail}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                {result.errors?.join(', ') || result.error || 'Unknown error'}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Shared Components ────────────────────────────────────────────────────────

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      {label && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }} />
    </div>
  )
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
