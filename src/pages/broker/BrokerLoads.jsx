import { useState, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { fetchLoads, fetchMessages, sendMessage } from '../../lib/database'
import {
  Package, DollarSign, Clock, CheckCircle, MapPin,
  ChevronDown, ChevronUp, FileText, ArrowRight,
  Truck, Send, MessageSquare
} from 'lucide-react'
import { Ic, panel, panelHead, statCard, badge, statusColor, getState } from './helpers'

const STATUS_DISPLAY = { open: 'Posted', booked: 'Booked', assigned: 'Assigned', en_route_pickup: 'En Route to Pickup', at_pickup: 'At Pickup', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled' }

// ── Load Status Tracker ──
function LoadStatusTracker({ status }) {
  const steps = [
    { key: 'open', label: 'Posted' },
    { key: 'booked', label: 'Booked' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'en_route_pickup', label: 'En Route' },
    { key: 'at_pickup', label: 'At Pickup' },
    { key: 'in_transit', label: 'In Transit' },
    { key: 'delivered', label: 'Delivered' },
  ]
  const currentIdx = steps.findIndex(s => s.key === status)
  const activeIdx = currentIdx >= 0 ? currentIdx : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '16px 0' }}>
      {steps.map((step, i) => {
        const done = i <= activeIdx
        const isCurrent = i === activeIdx
        return (
          <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div style={{ position: 'absolute', top: 10, right: '50%', width: '100%', height: 3,
                background: done ? 'var(--success)' : 'var(--border)', zIndex: 0 }} />
            )}
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
              background: done ? 'var(--success)' : 'var(--surface2)', border: `2px solid ${done ? 'var(--success)' : 'var(--border)'}`,
              boxShadow: isCurrent ? '0 0 8px rgba(34,197,94,0.4)' : 'none' }}>
              {done && <Ic icon={CheckCircle} size={12} style={{ color: '#fff' }} />}
            </div>
            <div style={{ fontSize: 9, color: done ? 'var(--success)' : 'var(--muted)', fontWeight: isCurrent ? 800 : 600, marginTop: 4, textAlign: 'center' }}>{step.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Message Thread ──
function MessageThread({ loadId, user }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const loadMessages = async () => {
    const data = await fetchMessages(loadId)
    setMessages(data)
  }

  useEffect(() => { loadMessages() }, [loadId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadMessages, 10000)
    return () => clearInterval(interval)
  }, [loadId])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await sendMessage(loadId, input.trim(), user?.email?.split('@')[0] || 'Broker', 'broker')
      setInput('')
      await loadMessages()
    } catch (e) {
    }
    setSending(false)
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', marginTop: 16 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
        <Ic icon={MessageSquare} size={14} style={{ color: 'var(--accent)' }} /> Messages
        {messages.length > 0 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>({messages.length})</span>}
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', padding: '10px 14px' }}>
        {messages.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No messages yet — start a conversation with the carrier</div>
        ) : messages.map(msg => (
          <div key={msg.id} style={{ marginBottom: 10, display: 'flex', flexDirection: 'column',
            alignItems: msg.sender_role === 'broker' ? 'flex-end' : 'flex-start' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
              {msg.sender_name} · {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
            <div style={{ maxWidth: '75%', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
              background: msg.sender_role === 'broker' ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
              color: 'var(--text)', border: `1px solid ${msg.sender_role === 'broker' ? 'rgba(240,165,0,0.25)' : 'var(--border)'}` }}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '8px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', outline: 'none' }} />
        <button onClick={handleSend} disabled={sending || !input.trim()}
          style={{ padding: '8px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending || !input.trim() ? 0.5 : 1 }}>
          <Ic icon={Send} size={13} />
        </button>
      </div>
    </div>
  )
}

export function BrokerLoads() {
  const { showToast, navigatePage, user } = useApp()
  const [filter, setFilter] = useState('All')
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const filters = ['All', 'Active', 'Booked', 'Delivered']

  const loadData = async () => {
    const data = await fetchLoads()
    setLoads(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Poll for real-time status updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [])

  const filtered = loads.filter(l => {
    const display = STATUS_DISPLAY[l.status] || l.status
    if (filter === 'All') return true
    if (filter === 'Active') return ['Posted', 'In Transit'].includes(display)
    if (filter === 'Booked') return display === 'Booked'
    if (filter === 'Delivered') return display === 'Delivered'
    return true
  })

  const stats = {
    total: loads.length,
    active: loads.filter(l => ['open', 'in_transit'].includes(l.status)).length,
    booked: loads.filter(l => l.status === 'booked').length,
    delivered: loads.filter(l => l.status === 'delivered').length,
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading loads...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>MY LOADS</div>
        <button className="btn btn-primary" onClick={() => navigatePage('broker-post')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic icon={Package} size={14} /> Post a Load
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Total Loads', value: stats.total, color: 'var(--accent)' },
          { label: 'Active', value: stats.active, color: 'var(--warning)' },
          { label: 'Booked', value: stats.booked, color: 'var(--success)' },
          { label: 'Delivered', value: stats.delivered, color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} style={statCard(s.color)}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              background: filter === f ? 'var(--accent)' : 'var(--surface)', color: filter === f ? '#000' : 'var(--muted)',
              border: filter === f ? 'none' : '1px solid var(--border)' }}>
            {f}
          </button>
        ))}
      </div>

      <div style={panel}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Load ID', 'Route', 'Rate', 'Weight', 'Equipment', 'Status', 'Posted'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                {loads.length === 0 ? 'No loads yet — post your first load!' : 'No loads match this filter.'}
              </td></tr>
            ) : filtered.map(load => {
              const display = STATUS_DISPLAY[load.status] || load.status
              const sc = statusColor(display)
              const originState = getState(load.origin)
              const destState = getState(load.destination)
              const isExp = expanded === load.id
              return [
                <tr key={load.id} onClick={() => setExpanded(isExp ? null : load.id)}
                  style={{ cursor: 'pointer', background: isExp ? 'rgba(240,165,0,0.03)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent3)' }}>{load.load_id}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {originState} <Ic icon={ArrowRight} size={10} style={{ margin: '0 4px', color: 'var(--muted)' }} /> {destState}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{load.origin} → {load.destination}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>${Number(load.rate || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>{load.weight ? Number(load.weight).toLocaleString() + ' lbs' : '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>{load.equipment || '—'}</td>
                  <td style={{ padding: '10px 14px' }}><span style={badge(sc + '18', sc)}><span style={{ width: 6, height: 6, borderRadius: '50%', background: sc }} /> {display}</span></td>
                  <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{load.posted_at ? new Date(load.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                    <Ic icon={isExp ? ChevronUp : ChevronDown} size={14} style={{ color: 'var(--muted)' }} />
                  </td>
                </tr>,
                isExp && (
                  <tr key={load.id + '-detail'}>
                    <td colSpan={7} style={{ padding: 0, background: 'var(--surface2)', borderTop: '2px solid var(--accent)' }}>
                      <div style={{ padding: '20px 24px' }}>
                        {/* Route Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Ic icon={Package} size={20} style={{ color: 'var(--accent)' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{load.load_id}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{load.origin} → {load.destination}</div>
                          </div>
                          <div style={{ marginLeft: 'auto' }}>
                            <span style={{ ...badge(sc + '18', sc), fontSize: 12, padding: '5px 14px' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: sc }} /> {display}</span>
                          </div>
                        </div>

                        {/* Detail Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
                          {[
                            { label: 'Origin', value: load.origin || '—', icon: MapPin, color: 'var(--success)' },
                            { label: 'Destination', value: load.destination || '—', icon: MapPin, color: 'var(--danger)' },
                            { label: 'Rate', value: '$' + Number(load.rate || 0).toLocaleString(), icon: DollarSign, color: 'var(--accent)' },
                            { label: 'Weight', value: load.weight ? Number(load.weight).toLocaleString() + ' lbs' : '—', icon: Package, color: 'var(--accent2)' },
                          ].map(d => (
                            <div key={d.label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <Ic icon={d.icon} size={11} style={{ color: d.color }} /> {d.label}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: d.color }}>{d.value}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
                          {[
                            { label: 'Equipment', value: load.equipment || '—' },
                            { label: 'Load Type', value: load.load_type || '—' },
                            { label: 'Pickup Date', value: load.pickup_date ? new Date(load.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                            { label: 'Delivery Date', value: load.delivery_date ? new Date(load.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                          ].map(d => (
                            <div key={d.label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{d.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.value}</div>
                            </div>
                          ))}
                        </div>

                        {/* Notes */}
                        {load.notes && (
                          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)', marginBottom: 18 }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Special Instructions</div>
                            <div style={{ fontSize: 12, lineHeight: 1.6 }}>{load.notes}</div>
                          </div>
                        )}

                        {/* Rate Con + Carrier */}
                        <div style={{ display: 'flex', gap: 12 }}>
                          {load.rate_con_url && (
                            <a href={load.rate_con_url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                              <Ic icon={FileText} size={14} /> View Rate Confirmation
                            </a>
                          )}
                          {load.carrier_name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>
                              <Ic icon={Truck} size={14} /> {load.carrier_name}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
                              <Ic icon={Clock} size={14} /> Waiting for carrier match
                            </div>
                          )}
                        </div>

                        {/* ── Real-time Status Tracker ── */}
                        <LoadStatusTracker status={load.status} />

                        {/* ── Direct Messaging ── */}
                        <MessageThread loadId={load.load_id} user={user} />
                      </div>
                    </td>
                  </tr>
                )
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
