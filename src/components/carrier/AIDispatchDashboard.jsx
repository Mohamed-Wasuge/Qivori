import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Bot, Filter, RefreshCw, ChevronDown, ChevronUp, Eye, Edit3, X,
  CheckCircle, XCircle, AlertTriangle, TrendingUp, Activity, Clock,
  DollarSign, Target, Zap, ArrowRight, Search, Calendar, Play,
  FlaskConical, Truck, Package, Flame, Users, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { HubTabBar } from './shared'

const DECISION_COLORS = {
  accept:    { bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)', text: '#22c55e', label: 'ACCEPT' },
  reject:    { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)', text: '#ef4444', label: 'REJECT' },
  negotiate: { bg: 'rgba(240,165,0,0.1)',  border: 'rgba(240,165,0,0.25)', text: '#f0a500', label: 'NEGOTIATE' },
  auto_book: { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', text: '#6366f1', label: 'AUTO-BOOK' },
}

const DECISION_ICONS = {
  accept: CheckCircle,
  reject: XCircle,
  negotiate: AlertTriangle,
  auto_book: Zap,
}

function ConfidenceBar({ value }) {
  const color = value >= 80 ? '#22c55e' : value >= 60 ? '#f0a500' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 48, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{value}%</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 16px', flex: '1 1 140px', minWidth: 140,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} color={color} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 1, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function DecisionDetailModal({ decision, onClose, onOverride, onAutoBook }) {
  const [overrideMode, setOverrideMode] = useState(false)
  const [newDecision, setNewDecision] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [bookingResult, setBookingResult] = useState(null)
  const [booking, setBooking] = useState(false)
  const d = decision
  const load = d.load_data || {}
  const metrics = d.metrics || {}
  const dcfg = DECISION_COLORS[d.decision] || DECISION_COLORS.accept
  const DIcon = DECISION_ICONS[d.decision] || CheckCircle

  const handleOverride = async () => {
    if (!newDecision) return
    setSaving(true)
    await onOverride(d.id, newDecision, reason)
    setSaving(false)
    setOverrideMode(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        maxWidth: 560, width: '95%', maxHeight: '85vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <DIcon size={18} color={dcfg.text} />
              <span style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: 1,
                background: dcfg.bg, border: `1px solid ${dcfg.border}`, color: dcfg.text,
              }}>{dcfg.label}</span>
              <ConfidenceBar value={d.confidence || 0} />
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1, color: 'var(--text)' }}>
              {load.origin || '—'} <ArrowRight size={14} style={{ verticalAlign: 'middle', margin: '0 4px' }} /> {load.dest || '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {new Date(d.created_at).toLocaleString()} {d.auto_booked && <span style={{ color: '#6366f1', fontWeight: 700 }}> — AUTO-BOOKED</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Load Details */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 10 }}>LOAD DETAILS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {[
              ['Gross', `$${(load.gross || 0).toLocaleString()}`],
              ['Miles', load.miles || '—'],
              ['Weight', load.weight ? `${load.weight.toLocaleString()} lbs` : '—'],
              ['Equipment', load.equipment || '—'],
              ['Broker', load.broker || '—'],
              ['Book Type', load.book_type || 'standard'],
              ['Pickup', load.pickup_date || '—'],
              ['Delivery', load.delivery_date || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Metrics */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 10 }}>AI METRICS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {[
              ['Est. Profit', `$${(metrics.estProfit || 0).toLocaleString()}`, metrics.estProfit >= 1200 ? '#22c55e' : metrics.estProfit >= 800 ? '#f0a500' : '#ef4444'],
              ['Profit/Mile', `$${(metrics.profitPerMile || 0).toFixed(2)}`, metrics.profitPerMile >= 1.5 ? '#22c55e' : '#f0a500'],
              ['Profit/Day', `$${(metrics.profitPerDay || 0).toLocaleString()}`, metrics.profitPerDay >= 500 ? '#22c55e' : '#f0a500'],
              ['RPM', `$${(metrics.rpm || 0).toFixed(2)}`, '#6366f1'],
              ['Fuel Cost', `$${(metrics.fuelCost || 0).toLocaleString()}`, '#ef4444'],
              ['Driver Pay', `$${(metrics.driverPay || 0).toLocaleString()}`, '#f0a500'],
              ['Transit Days', metrics.transitDays || '—', 'var(--text)'],
              ['Season ×', (metrics.seasonMultiplier || 1).toFixed(2), '#6366f1'],
              ['Broker Urgency', metrics.brokerUrgency || 0, metrics.brokerUrgency >= 60 ? '#22c55e' : 'var(--muted)'],
            ].map(([k, v, c]) => (
              <div key={k}>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reasoning */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 10 }}>AI REASONING</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(d.reasons || []).map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px',
                background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)',
              }}>
                <Bot size={13} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Negotiation targets */}
        {d.negotiation && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 10 }}>NEGOTIATION TARGETS</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>Target Rate</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f0a500', fontFamily: "'JetBrains Mono',monospace" }}>${d.negotiation.targetRate?.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>Min Accept</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444', fontFamily: "'JetBrains Mono',monospace" }}>${d.negotiation.minAccept?.toLocaleString()}</div>
              </div>
              {d.negotiation.talkingPoints?.length > 0 && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>Talking Points</div>
                  {d.negotiation.talkingPoints.map((tp, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text)', marginBottom: 2 }}>• {tp}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Auto-Book Execution */}
        {(d.decision === 'accept' || d.decision === 'auto_book') && !bookingResult && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <button onClick={async () => {
              setBooking(true)
              const result = await onAutoBook(d)
              setBookingResult(result)
              setBooking(false)
            }} disabled={booking}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 20px', width: '100%', borderRadius: 8, border: 'none',
                background: booking ? 'var(--border)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: booking ? 'default' : 'pointer',
                fontFamily: "'DM Sans',sans-serif", letterSpacing: 0.5,
              }}>
              {booking ? <><RefreshCw size={15} className="spinning" /> Executing Auto-Book...</> : <><Zap size={15} /> Execute Auto-Book — Create Load, Assign Driver, Invoice</>}
            </button>
          </div>
        )}

        {/* Auto-Book Timeline */}
        {bookingResult && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={12} /> AUTO-BOOK EXECUTION LOG
            </div>
            {bookingResult.error ? (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>
                Failed: {bookingResult.error}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {(bookingResult.timeline || []).map((t, i) => {
                  const isLast = i === (bookingResult.timeline || []).length - 1
                  const stepColors = {
                    driver_search: '#f0a500', driver_assigned: '#22c55e', load_created: '#6366f1',
                    driver_updated: '#06b6d4', invoice_created: '#8b5cf6', decision_linked: '#06b6d4', complete: '#22c55e',
                  }
                  const color = stepColors[t.step] || 'var(--muted)'
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10 }}>
                      {/* Timeline dot + line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, border: `2px solid ${color}`, flexShrink: 0, marginTop: 4 }} />
                        {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 16 }} />}
                      </div>
                      <div style={{ paddingBottom: isLast ? 0 : 10, flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{t.detail}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace", marginTop: 1 }}>
                          {new Date(t.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* Summary card */}
                <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
                    <div><span style={{ color: 'var(--muted)' }}>Load:</span> <b style={{ color: '#6366f1' }}>{bookingResult.load_id}</b></div>
                    <div><span style={{ color: 'var(--muted)' }}>Status:</span> <b style={{ color: '#22c55e' }}>{bookingResult.status}</b></div>
                    {bookingResult.driver && <div><span style={{ color: 'var(--muted)' }}>Driver:</span> <b style={{ color: 'var(--text)' }}>{bookingResult.driver.name}</b> <span style={{ fontSize: 9, color: 'var(--muted)' }}>({bookingResult.driver.license} · {bookingResult.driver.state} · {bookingResult.driver.pay})</span></div>}
                    <div><span style={{ color: 'var(--muted)' }}>Invoice:</span> <b style={{ color: '#8b5cf6' }}>{bookingResult.invoice?.number}</b></div>
                    <div><span style={{ color: 'var(--muted)' }}>Amount:</span> <b style={{ color: '#22c55e' }}>${bookingResult.invoice?.amount?.toLocaleString()}</b></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual Override */}
        <div style={{ padding: '16px 20px' }}>
          {!overrideMode ? (
            <button onClick={() => setOverrideMode(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif", width: '100%', justifyContent: 'center',
            }}>
              <Edit3 size={14} /> Manual Override
            </button>
          ) : (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 10 }}>OVERRIDE DECISION</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {['accept', 'reject', 'negotiate'].map(opt => {
                  const cfg = DECISION_COLORS[opt]
                  const selected = newDecision === opt
                  return (
                    <button key={opt} onClick={() => setNewDecision(opt)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      letterSpacing: 0.5, cursor: 'pointer', border: `1.5px solid ${selected ? cfg.text : 'var(--border)'}`,
                      background: selected ? cfg.bg : 'transparent', color: selected ? cfg.text : 'var(--muted)',
                      fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s',
                    }}>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
              <input
                placeholder="Override reason (optional)..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)', fontSize: 12, outline: 'none',
                  fontFamily: "'DM Sans',sans-serif", marginBottom: 12, boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setOverrideMode(false); setNewDecision(''); setReason('') }}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={handleOverride} disabled={!newDecision || saving}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                    background: newDecision ? DECISION_COLORS[newDecision]?.text : 'var(--border)',
                    color: '#fff', fontSize: 12, fontWeight: 700, cursor: newDecision ? 'pointer' : 'default',
                    fontFamily: "'DM Sans',sans-serif", opacity: saving ? 0.6 : 1,
                  }}>
                  {saving ? 'Saving...' : 'Confirm Override'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DecisionsView() {
  const [decisions, setDecisions] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterDecision, setFilterDecision] = useState('')
  const [filterBroker, setFilterBroker] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(0)
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const PAGE_SIZE = 50

  const fetchDecisions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      if (filterDecision) params.set('decision', filterDecision)
      if (filterBroker) params.set('broker', filterBroker)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)

      const res = await apiFetch(`/api/dispatch-decisions?${params}`)
      const data = await res.json()
      if (data.decisions) {
        setDecisions(data.decisions)
        setTotal(data.total || data.decisions.length)
      }
    } catch (err) {
      console.error('Failed to fetch decisions:', err)
    }
    setLoading(false)
  }, [filterDecision, filterBroker, filterFrom, filterTo, page])

  useEffect(() => { fetchDecisions() }, [fetchDecisions])

  const handleAutoBook = async (decision) => {
    try {
      const res = await apiFetch('/api/auto-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load: decision.load_data,
          decision_id: decision.id,
          driver_type: decision.driver_type || 'owner_operator',
          metrics: decision.metrics,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        // Refresh decisions list to show updated state
        fetchDecisions()
      }
      return data
    } catch (err) {
      return { error: err.message || 'Auto-book failed' }
    }
  }

  const handleOverride = async (id, newDecision, reason) => {
    try {
      const res = await apiFetch('/api/dispatch-decisions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision: newDecision, override_reason: reason }),
      })
      const data = await res.json()
      if (data.ok) {
        setDecisions(prev => prev.map(d => d.id === id ? { ...d, ...data.decision } : d))
        setSelected(prev => prev?.id === id ? { ...prev, ...data.decision } : prev)
      }
    } catch (err) {
      console.error('Override failed:', err)
    }
  }

  // Stats
  const stats = useMemo(() => {
    const all = decisions
    const accepts = all.filter(d => d.decision === 'accept' || d.decision === 'auto_book')
    const rejects = all.filter(d => d.decision === 'reject')
    const negotiates = all.filter(d => d.decision === 'negotiate')
    const avgConfidence = all.length > 0 ? Math.round(all.reduce((s, d) => s + (d.confidence || 0), 0) / all.length) : 0
    const totalProfit = all.reduce((s, d) => s + (d.metrics?.estProfit || 0), 0)
    const avgProfit = accepts.length > 0 ? Math.round(accepts.reduce((s, d) => s + (d.metrics?.estProfit || 0), 0) / accepts.length) : 0
    const autoBooked = all.filter(d => d.auto_booked).length
    return { total: all.length, accepts: accepts.length, rejects: rejects.length, negotiates: negotiates.length, avgConfidence, totalProfit, avgProfit, autoBooked }
  }, [decisions])

  // Sorted decisions
  const sorted = useMemo(() => {
    return [...decisions].sort((a, b) => {
      let va, vb
      switch (sortField) {
        case 'decision': va = a.decision; vb = b.decision; break
        case 'confidence': va = a.confidence || 0; vb = b.confidence || 0; break
        case 'profit': va = a.metrics?.estProfit || 0; vb = b.metrics?.estProfit || 0; break
        case 'broker': va = a.load_data?.broker || ''; vb = b.load_data?.broker || ''; break
        default: va = a.created_at; vb = b.created_at
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [decisions, sortField, sortDir])

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
  }

  const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 11, outline: 'none', fontFamily: "'DM Sans',sans-serif" }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Refresh bar */}
      <div style={{ flexShrink: 0, padding: '8px 20px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border)' }}>
        <button onClick={fetchDecisions} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
          color: 'var(--text)', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
        }}>
          <RefreshCw size={13} className={loading ? 'spinning' : ''} /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div style={{ flexShrink: 0, padding: '12px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <StatCard icon={Activity} label="TOTAL DECISIONS" value={stats.total} color="#6366f1" />
        <StatCard icon={CheckCircle} label="ACCEPTED" value={stats.accepts} sub={`${stats.total > 0 ? Math.round(stats.accepts / stats.total * 100) : 0}% rate`} color="#22c55e" />
        <StatCard icon={XCircle} label="REJECTED" value={stats.rejects} color="#ef4444" />
        <StatCard icon={AlertTriangle} label="NEGOTIATE" value={stats.negotiates} color="#f0a500" />
        <StatCard icon={Target} label="AVG CONFIDENCE" value={`${stats.avgConfidence}%`} color="#6366f1" />
        <StatCard icon={DollarSign} label="AVG PROFIT (ACCEPT)" value={`$${stats.avgProfit.toLocaleString()}`} color="#22c55e" />
        <StatCard icon={Zap} label="AUTO-BOOKED" value={stats.autoBooked} color="#6366f1" />
      </div>

      {/* Filters */}
      <div style={{ flexShrink: 0, padding: '10px 20px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <Filter size={13} color="var(--muted)" />
        <select value={filterDecision} onChange={e => { setFilterDecision(e.target.value); setPage(0) }}
          style={{ ...inp, minWidth: 100 }}>
          <option value="">All Decisions</option>
          <option value="accept">Accept</option>
          <option value="reject">Reject</option>
          <option value="negotiate">Negotiate</option>
          <option value="auto_book">Auto-Book</option>
        </select>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={12} color="var(--muted)" style={{ position: 'absolute', left: 8 }} />
          <input placeholder="Broker..." value={filterBroker}
            onChange={e => { setFilterBroker(e.target.value); setPage(0) }}
            onKeyDown={e => e.key === 'Enter' && fetchDecisions()}
            style={{ ...inp, paddingLeft: 26, width: 120 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={12} color="var(--muted)" />
          <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(0) }} style={{ ...inp, width: 120 }} />
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>to</span>
          <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(0) }} style={{ ...inp, width: 120 }} />
        </div>
        {(filterDecision || filterBroker || filterFrom || filterTo) && (
          <button onClick={() => { setFilterDecision(''); setFilterBroker(''); setFilterFrom(''); setFilterTo(''); setPage(0) }}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
            Clear filters
          </button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {total} total
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', fontSize: 13, gap: 8 }}>
            <RefreshCw size={16} className="spinning" /> Loading decisions...
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
            <Bot size={32} color="var(--muted)" />
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>No dispatch decisions yet</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Decisions will appear here as the AI evaluates loads</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[
                  ['created_at', 'Timestamp'],
                  ['decision', 'Decision'],
                  ['confidence', 'Confidence'],
                  ['', 'Route'],
                  ['profit', 'Profit'],
                  ['', 'RPM'],
                  ['broker', 'Broker'],
                  ['', 'Driver Type'],
                  ['', 'Reasoning'],
                  ['', ''],
                ].map(([field, label], i) => (
                  <th key={i} onClick={field ? () => toggleSort(field) : undefined}
                    style={{
                      padding: '10px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10,
                      letterSpacing: 0.5, color: 'var(--muted)', cursor: field ? 'pointer' : 'default',
                      whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1,
                    }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      {label} {field && <SortIcon field={field} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(d => {
                const load = d.load_data || {}
                const metrics = d.metrics || {}
                const dcfg = DECISION_COLORS[d.decision] || DECISION_COLORS.accept
                const DIcon = DECISION_ICONS[d.decision] || CheckCircle
                const isOverride = (d.reasons || []).some(r => r.startsWith('MANUAL OVERRIDE'))
                return (
                  <tr key={d.id} onClick={() => setSelected(d)} style={{
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 11, color: 'var(--text)' }}>{new Date(d.created_at).toLocaleDateString()}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <DIcon size={13} color={dcfg.text} />
                        <span style={{
                          padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                          background: dcfg.bg, border: `1px solid ${dcfg.border}`, color: dcfg.text,
                        }}>
                          {dcfg.label}
                        </span>
                        {isOverride && <span style={{ fontSize: 8, color: '#f0a500', fontWeight: 700, letterSpacing: 0.5 }}>OVERRIDE</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px' }}><ConfidenceBar value={d.confidence || 0} /></td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {(load.origin || '—').split(',')[0]} <ArrowRight size={10} style={{ verticalAlign: 'middle' }} /> {(load.dest || '—').split(',')[0]}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{load.miles || 0} mi · {load.equipment || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
                        color: (metrics.estProfit || 0) >= 1200 ? '#22c55e' : (metrics.estProfit || 0) >= 800 ? '#f0a500' : '#ef4444',
                      }}>
                        ${(metrics.estProfit || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>${(metrics.profitPerMile || 0).toFixed(2)}/mi</div>
                    </td>
                    <td style={{ padding: '10px 8px', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: 'var(--text)' }}>
                      ${(metrics.rpm || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 8px', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
                      {load.broker || '—'}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: d.driver_type === 'owner_operator' ? 'rgba(99,102,241,0.1)' : 'rgba(240,165,0,0.1)',
                        color: d.driver_type === 'owner_operator' ? '#6366f1' : '#f0a500',
                        fontWeight: 600,
                      }}>
                        {d.driver_type === 'owner_operator' ? 'O/O' : 'Company'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', maxWidth: 200 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(d.reasons || []).join(' · ')}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <button onClick={e => { e.stopPropagation(); setSelected(d) }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 4 }}>
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div style={{
          flexShrink: 0, padding: '10px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center',
        }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            style={{ ...inp, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
            Previous
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}
            style={{ ...inp, cursor: (page + 1) * PAGE_SIZE >= total ? 'default' : 'pointer', opacity: (page + 1) * PAGE_SIZE >= total ? 0.4 : 1 }}>
            Next
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selected && <DecisionDetailModal decision={selected} onClose={() => setSelected(null)} onOverride={handleOverride} onAutoBook={handleAutoBook} />}

      <style>{`
        .spinning { animation: spin 1s linear infinite }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

// ── Test Load Generator ─────────────────────────────────────────────────────

const FlippedTrend = (props) => <TrendingUp {...props} style={{ ...props.style, transform: 'scaleY(-1)' }} />

const CATEGORIES = [
  { id: 'low_profit',     label: 'Low Profit',     icon: FlippedTrend, color: '#ef4444', desc: '$1.20-$2.00/mi — triggers reject' },
  { id: 'medium_profit',  label: 'Medium Profit',  icon: TrendingUp,   color: '#f0a500', desc: '$2.50-$3.80/mi — negotiate zone' },
  { id: 'high_profit',    label: 'High Profit',    icon: Flame,        color: '#22c55e', desc: '$4.00-$6.50/mi — strong accept' },
  { id: 'heavy_load',     label: 'Heavy (42K+)',   icon: Truck,        color: '#8b5cf6', desc: '42-45K lbs, flatbed/step deck' },
  { id: 'light_load',     label: 'Light (<37K)',   icon: Package,      color: '#06b6d4', desc: '12-28K lbs, weight bonus' },
  { id: 'urgent',         label: 'Urgent',         icon: Zap,          color: '#f97316', desc: 'Same-day, instant-book, high urgency' },
]

function TestLoadGenerator() {
  const [selectedCats, setSelectedCats] = useState(['low_profit', 'medium_profit', 'high_profit', 'heavy_load', 'light_load', 'urgent'])
  const [bookingStates, setBookingStates] = useState({}) // { idx: { loading, result } }
  const [countPer, setCountPer] = useState(3)
  const [driverType, setDriverType] = useState('owner_operator')
  const [saveToDb, setSaveToDb] = useState(true)
  const [autoBookEnabled, setAutoBookEnabled] = useState(false)
  const [autoBookRunning, setAutoBookRunning] = useState(false)
  const [autoBookProgress, setAutoBookProgress] = useState({ done: 0, total: 0 })
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState(null)
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState(null)

  const toggleCat = (id) => {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const seedDrivers = async () => {
    setSeeding(true)
    try {
      const res = await apiFetch('/api/seed-test-drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const data = await res.json()
      setSeedResult(data)
    } catch (err) {
      setSeedResult({ error: err.message })
    }
    setSeeding(false)
  }

  // Auto-book all eligible loads from results
  const executeAutoBookBatch = async (data) => {
    if (!data?.results) return
    // Collect all auto_book/accept loads with their global indices
    const eligible = []
    let globalIdx = 0
    for (const cat of Object.keys(data.results)) {
      for (const r of data.results[cat]) {
        if (r.result?.decision === 'auto_book' || r.result?.decision === 'accept') {
          eligible.push({ globalIdx, load: r.load, metrics: r.result.metrics })
        }
        globalIdx++
      }
    }
    if (eligible.length === 0) return

    setAutoBookRunning(true)
    setAutoBookProgress({ done: 0, total: eligible.length })

    for (let i = 0; i < eligible.length; i++) {
      const { globalIdx: idx, load, metrics } = eligible[i]
      setBookingStates(prev => ({ ...prev, [idx]: { loading: true } }))
      try {
        const res = await apiFetch('/api/auto-book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ load, driver_type: driverType, metrics }),
        })
        const bookData = await res.json()
        setBookingStates(prev => ({ ...prev, [idx]: { loading: false, result: bookData } }))
      } catch (err) {
        setBookingStates(prev => ({ ...prev, [idx]: { loading: false, result: { error: err.message } } }))
      }
      setAutoBookProgress({ done: i + 1, total: eligible.length })
    }
    setAutoBookRunning(false)
  }

  const runTest = async () => {
    if (selectedCats.length === 0) return
    setRunning(true)
    setResults(null)
    setExpandedIdx(null)
    setBookingStates({})
    try {
      const res = await apiFetch('/api/dispatch-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: selectedCats,
          count_per_category: countPer,
          driver_type: driverType,
          save: saveToDb,
        }),
      })
      const data = await res.json()
      if (data.results) {
        setResults(data)
        // If auto-book toggle is ON, immediately execute for all eligible loads
        if (autoBookEnabled) {
          setRunning(false)
          await executeAutoBookBatch(data)
          return
        }
      }
    } catch (err) {
      console.error('Test failed:', err)
    }
    setRunning(false)
  }

  const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 11, outline: 'none', fontFamily: "'DM Sans',sans-serif" }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Config panel */}
      <div style={{ flexShrink: 0, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <FlaskConical size={16} color="#6366f1" />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 1.5, color: 'var(--text)' }}>
            TEST LOAD GENERATOR
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            Generate simulated freight loads and run them through the AI dispatch engine
          </span>
        </div>

        {/* Seed Test Drivers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <Users size={16} color="#6366f1" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>Test Drivers</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              {seedResult?.ok ? `${seedResult.drivers?.length || 0} drivers ready` : 'Seed 5 realistic drivers for auto-book testing'}
            </div>
          </div>
          {seedResult?.ok ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(seedResult.drivers || []).map((d, i) => (
                <span key={i} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {d.name} · {d.state || d.license_state || ''}
                </span>
              ))}
            </div>
          ) : (
            <button onClick={seedDrivers} disabled={seeding} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
              borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff',
              fontSize: 11, fontWeight: 700, cursor: seeding ? 'default' : 'pointer',
              fontFamily: "'DM Sans',sans-serif", opacity: seeding ? 0.7 : 1,
            }}>
              {seeding ? <><RefreshCw size={12} className="spinning" /> Creating...</> : <><Users size={12} /> Seed 5 Drivers</>}
            </button>
          )}
        </div>

        {/* Category selection */}
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>LOAD CATEGORIES</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const active = selectedCats.includes(cat.id)
            return (
              <button key={cat.id} onClick={() => toggleCat(cat.id)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 8, border: `1.5px solid ${active ? cat.color : 'var(--border)'}`,
                background: active ? cat.color + '15' : 'transparent',
                color: active ? cat.color : 'var(--muted)', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                transition: 'all 0.15s',
              }}>
                <Icon size={14} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700 }}>{cat.label}</div>
                  <div style={{ fontSize: 9, opacity: 0.7 }}>{cat.desc}</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5 }}>PER CATEGORY</span>
            <select value={countPer} onChange={e => setCountPer(parseInt(e.target.value))} style={inp}>
              {[1, 2, 3, 5, 8, 10, 15, 20].map(n => <option key={n} value={n}>{n} loads</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5 }}>DRIVER TYPE</span>
            <select value={driverType} onChange={e => setDriverType(e.target.value)} style={inp}>
              <option value="owner_operator">Owner Operator (50/50)</option>
              <option value="company_driver">Company Driver</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text)' }}>
            <input type="checkbox" checked={saveToDb} onChange={e => setSaveToDb(e.target.checked)} />
            Save to database
          </label>

          {/* Auto-Book Toggle */}
          <button
            onClick={() => setAutoBookEnabled(prev => !prev)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              borderRadius: 8, border: `1.5px solid ${autoBookEnabled ? '#6366f1' : 'var(--border)'}`,
              background: autoBookEnabled ? 'rgba(99,102,241,0.1)' : 'transparent',
              cursor: 'pointer', fontSize: 11, fontWeight: 700,
              color: autoBookEnabled ? '#6366f1' : 'var(--muted)',
              fontFamily: "'DM Sans',sans-serif", transition: 'all 0.2s',
            }}
          >
            {autoBookEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            <div style={{ textAlign: 'left' }}>
              <div>Auto-Book {autoBookEnabled ? 'ON' : 'OFF'}</div>
              <div style={{ fontSize: 8, opacity: 0.7, fontWeight: 500 }}>
                {autoBookEnabled ? 'AI will book automatically' : 'Manual approval required'}
              </div>
            </div>
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              {selectedCats.length * countPer} loads total
            </span>
            <button onClick={runTest} disabled={running || selectedCats.length === 0} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
              borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: running ? 'default' : 'pointer',
              fontFamily: "'DM Sans',sans-serif", opacity: running ? 0.7 : 1,
            }}>
              {running ? <><RefreshCw size={14} className="spinning" /> Running...</> : <><Play size={14} /> Run Test</>}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {!results && !running && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <FlaskConical size={40} color="var(--muted)" />
            <div style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>Configure and run a test</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
              Select load categories, set the count per category, then hit Run Test. The AI engine will evaluate each generated load and show you the decisions.
            </div>
          </div>
        )}

        {running && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, color: 'var(--muted)', fontSize: 13 }}>
            <RefreshCw size={16} className="spinning" /> Generating and evaluating {selectedCats.length * countPer} loads...
          </div>
        )}

        {results && (
          <div style={{ padding: '16px 20px' }}>
            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <StatCard icon={Activity} label="TOTAL GENERATED" value={results.summary.total} color="#6366f1" />
              <StatCard icon={CheckCircle} label="ACCEPTED" value={results.summary.accept} sub={`${results.summary.total > 0 ? Math.round(results.summary.accept / results.summary.total * 100) : 0}%`} color="#22c55e" />
              <StatCard icon={XCircle} label="REJECTED" value={results.summary.reject} sub={`${results.summary.total > 0 ? Math.round(results.summary.reject / results.summary.total * 100) : 0}%`} color="#ef4444" />
              <StatCard icon={AlertTriangle} label="NEGOTIATE" value={results.summary.negotiate} color="#f0a500" />
              <StatCard icon={Zap} label="AUTO-BOOKED" value={results.summary.auto_book} color="#6366f1" />
              <StatCard icon={DollarSign} label="AVG PROFIT" value={`$${results.summary.avgProfit.toLocaleString()}`} color="#22c55e" />
              <StatCard icon={Target} label="AVG CONFIDENCE" value={`${results.summary.avgConfidence}%`} color="#6366f1" />
            </div>
            {results.saved && <div style={{ fontSize: 10, color: 'var(--success)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} /> Saved to database — switch to Decisions tab to see them</div>}

            {/* Auto-Book Progress */}
            {autoBookRunning && (
              <div style={{
                marginBottom: 12, padding: '12px 16px', borderRadius: 10,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <RefreshCw size={14} color="#6366f1" className="spinning" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>
                    AUTO-BOOKING IN PROGRESS
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {autoBookProgress.done} of {autoBookProgress.total} loads booked
                  </div>
                  <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--border)', marginTop: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${autoBookProgress.total > 0 ? (autoBookProgress.done / autoBookProgress.total * 100) : 0}%`,
                      height: '100%', borderRadius: 2, background: '#6366f1', transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              </div>
            )}

            {!autoBookRunning && autoBookProgress.total > 0 && autoBookProgress.done === autoBookProgress.total && (
              <div style={{
                marginBottom: 12, padding: '10px 16px', borderRadius: 10,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#22c55e', fontWeight: 600,
              }}>
                <Zap size={14} /> Auto-booked {autoBookProgress.total} loads — fully autonomous execution complete
              </div>
            )}

            {/* Results grouped by category */}
            {CATEGORIES.filter(c => selectedCats.includes(c.id)).map(cat => {
              const catResults = results.results.filter(r => r.category === cat.id)
              if (catResults.length === 0) return null
              const Icon = cat.icon
              return (
                <div key={cat.id} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Icon size={14} color={cat.color} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: cat.color, letterSpacing: 0.5 }}>{cat.label.toUpperCase()}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>({catResults.length} loads)</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {catResults.map((r, idx) => {
                      const globalIdx = results.results.indexOf(r)
                      const dcfg = DECISION_COLORS[r.result.decision] || DECISION_COLORS.accept
                      const DIcon = DECISION_ICONS[r.result.decision] || CheckCircle
                      const expanded = expandedIdx === globalIdx
                      return (
                        <div key={idx}>
                          <div onClick={() => setExpandedIdx(expanded ? null : globalIdx)} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: expanded ? '8px 8px 0 0' : 8,
                            cursor: 'pointer', transition: 'background 0.1s',
                          }}
                            onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                            onMouseOut={e => e.currentTarget.style.background = 'var(--surface)'}>
                            {/* Decision badge */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 90 }}>
                              <DIcon size={13} color={dcfg.text} />
                              <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 800, background: dcfg.bg, border: `1px solid ${dcfg.border}`, color: dcfg.text, letterSpacing: 0.5 }}>
                                {dcfg.label}
                              </span>
                            </div>
                            {/* Route */}
                            <div style={{ minWidth: 160, fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
                              {r.load.origin.split(',')[0]} <ArrowRight size={10} style={{ verticalAlign: 'middle' }} /> {r.load.dest.split(',')[0]}
                            </div>
                            {/* Key metrics */}
                            <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
                              <span style={{ color: 'var(--text)' }}>${r.load.gross.toLocaleString()}</span>
                              <span style={{ color: 'var(--muted)' }}>{r.load.miles} mi</span>
                              <span style={{ color: r.result.metrics.estProfit >= 1200 ? '#22c55e' : r.result.metrics.estProfit >= 800 ? '#f0a500' : '#ef4444', fontWeight: 700 }}>
                                ${r.result.metrics.estProfit.toLocaleString()} profit
                              </span>
                              <span style={{ color: 'var(--muted)' }}>${r.result.metrics.rpm.toFixed(2)}/mi</span>
                            </div>
                            {/* Confidence */}
                            <div style={{ marginLeft: 'auto' }}><ConfidenceBar value={r.result.confidence} /></div>
                            {/* Broker */}
                            <div style={{ fontSize: 10, color: 'var(--muted)', minWidth: 80 }}>{r.load.broker}</div>
                            {/* Expand */}
                            {expanded ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
                          </div>
                          {expanded && (
                            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 16 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
                                {[
                                  ['Gross', `$${r.load.gross.toLocaleString()}`],
                                  ['Miles', r.load.miles],
                                  ['Weight', `${r.load.weight.toLocaleString()} lbs`],
                                  ['Equipment', r.load.equipment],
                                  ['Broker', r.load.broker],
                                  ['Book Type', r.load.instant_book ? 'Instant Book' : 'Standard'],
                                  ['Pickup', r.load.pickup_date],
                                  ['Delivery', r.load.delivery_date],
                                ].map(([k, v]) => (
                                  <div key={k}>
                                    <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>{k}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{v}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>AI METRICS</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
                                {[
                                  ['Est. Profit', `$${r.result.metrics.estProfit.toLocaleString()}`, r.result.metrics.estProfit >= 1200 ? '#22c55e' : '#ef4444'],
                                  ['Profit/Mile', `$${r.result.metrics.profitPerMile.toFixed(2)}`, r.result.metrics.profitPerMile >= 1.5 ? '#22c55e' : '#f0a500'],
                                  ['Profit/Day', `$${r.result.metrics.profitPerDay}`, r.result.metrics.profitPerDay >= 500 ? '#22c55e' : '#f0a500'],
                                  ['Fuel Cost', `$${r.result.metrics.fuelCost}`, '#ef4444'],
                                  ['Driver Pay', `$${r.result.metrics.driverPay}`, '#f0a500'],
                                  ['Transit', `${r.result.metrics.transitDays}d`, 'var(--text)'],
                                  ['Season', `${r.result.metrics.seasonMultiplier}x`, '#6366f1'],
                                  ['Urgency', r.result.metrics.brokerUrgency, r.result.metrics.brokerUrgency >= 60 ? '#22c55e' : 'var(--muted)'],
                                ].map(([k, v, c]) => (
                                  <div key={k}>
                                    <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{k}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>REASONING</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {r.result.reasons.map((reason, ri) => (
                                  <div key={ri} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 10px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                    <Bot size={11} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.4 }}>{reason}</span>
                                  </div>
                                ))}
                              </div>
                              {r.result.negotiation && (
                                <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(240,165,0,0.06)', borderRadius: 8, border: '1px solid rgba(240,165,0,0.15)' }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: '#f0a500', letterSpacing: 1, marginBottom: 4 }}>NEGOTIATION</div>
                                  <div style={{ display: 'flex', gap: 16, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>
                                    <span>Target: <b style={{ color: '#f0a500' }}>${r.result.negotiation.targetRate}/mi</b></span>
                                    <span>Min: <b style={{ color: '#ef4444' }}>${r.result.negotiation.minAcceptRate}/mi</b></span>
                                  </div>
                                  {r.result.negotiation.script && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>"{r.result.negotiation.script}"</div>}
                                </div>
                              )}
                              {/* Auto-Book button for accept/auto_book */}
                              {(r.result.decision === 'accept' || r.result.decision === 'auto_book') && (
                                <div style={{ marginTop: 12 }}>
                                  {bookingStates[globalIdx]?.result ? (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Zap size={11} /> AUTO-BOOK COMPLETE
                                      </div>
                                      {bookingStates[globalIdx].result.error ? (
                                        <div style={{ fontSize: 11, color: '#ef4444' }}>Error: {bookingStates[globalIdx].result.error}</div>
                                      ) : (
                                        <div>
                                          {(bookingStates[globalIdx].result.timeline || []).map((t, ti) => (
                                            <div key={ti} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                                              <CheckCircle size={11} color="#22c55e" style={{ marginTop: 2, flexShrink: 0 }} />
                                              <span style={{ fontSize: 11, color: 'var(--text)' }}>{t.detail}</span>
                                            </div>
                                          ))}
                                          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 6, display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
                                            <span><b style={{ color: '#6366f1' }}>{bookingStates[globalIdx].result.load_id}</b></span>
                                            <span style={{ color: '#22c55e', fontWeight: 700 }}>{bookingStates[globalIdx].result.status}</span>
                                            {bookingStates[globalIdx].result.driver && <span>Driver: {bookingStates[globalIdx].result.driver.name}</span>}
                                            <span>Invoice: {bookingStates[globalIdx].result.invoice?.number}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button onClick={async (e) => {
                                      e.stopPropagation()
                                      setBookingStates(prev => ({ ...prev, [globalIdx]: { loading: true } }))
                                      try {
                                        const res = await apiFetch('/api/auto-book', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            load: r.load,
                                            driver_type: driverType,
                                            metrics: r.result.metrics,
                                          }),
                                        })
                                        const data = await res.json()
                                        setBookingStates(prev => ({ ...prev, [globalIdx]: { loading: false, result: data } }))
                                      } catch (err) {
                                        setBookingStates(prev => ({ ...prev, [globalIdx]: { loading: false, result: { error: err.message } } }))
                                      }
                                    }} disabled={bookingStates[globalIdx]?.loading}
                                      style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        padding: '10px 16px', width: '100%', borderRadius: 8, border: 'none',
                                        background: bookingStates[globalIdx]?.loading ? 'var(--border)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        color: '#fff', fontSize: 12, fontWeight: 700, cursor: bookingStates[globalIdx]?.loading ? 'default' : 'pointer',
                                        fontFamily: "'DM Sans',sans-serif",
                                      }}>
                                      {bookingStates[globalIdx]?.loading
                                        ? <><RefreshCw size={13} className="spinning" /> Booking...</>
                                        : <><Zap size={13} /> Execute Auto-Book</>}
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
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .spinning { animation: spin 1s linear infinite }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

// ── Main Dashboard Hub ──────────────────────────────────────────────────────

export function AIDispatchDashboard() {
  const [tab, setTab] = useState('decisions')
  const TABS = [
    { id: 'decisions', label: 'Decisions Log' },
    { id: 'test-generator', label: 'Test Load Generator' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 6px #6366f1', animation: 'q-ai-pulse 2s ease-in-out infinite' }} />
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 2, color: 'var(--text)' }}>
          Q <span style={{ color: '#6366f1' }}>AI DISPATCH</span> <span style={{ color: 'var(--muted)', fontSize: 16 }}>CONTROL CENTER</span>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--muted)' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
          ENGINE ACTIVE
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'decisions' && <DecisionsView />}
        {tab === 'test-generator' && <TestLoadGenerator />}
      </div>
      <style>{`
        @keyframes q-ai-pulse { 0%,100%{opacity:1;box-shadow:0 0 4px #6366f1} 50%{opacity:0.4;box-shadow:0 0 10px #6366f1} }
      `}</style>
    </div>
  )
}
