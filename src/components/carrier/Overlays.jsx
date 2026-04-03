import React, { useState, useEffect, useCallback } from 'react'
import {
  Search, Package, Receipt, DollarSign, User, Building2, Zap, FileText, Fuel, Truck, BarChart2, CheckCircle,
  Phone, MapPin, CloudSun, AlertTriangle, ExternalLink, Navigation, Droplets, Wind, X,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { useAIActions } from '../../hooks/useAIActions'
import { Ic } from './shared'

// ── GLOBAL SEARCH MODAL ────────────────────────────────────────────────────────
export function SearchModal({ open, onClose, onTabChange }) {
  const { loads, invoices, expenses } = useCarrier()
  const [q, setQ] = useState('')
  const inputRef = useCallback(el => { if (el && open) el.focus() }, [open])

  useEffect(() => {
    if (!open) { setQ(''); return }
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = q.trim().length < 2 ? [] : [
    ...loads.filter(l =>
      [l.loadId, l.broker, l.driver, l.origin, l.dest, l.status, l.commodity]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(l => ({
      type: 'Load', icon: Package, label: l.loadId,
      sub: `${l.origin?.split(',')[0]} → ${l.dest?.split(',')[0]} · ${l.broker} · ${l.status}`,
      color: 'var(--accent)',
      action: () => { onTabChange('loads'); onClose() }
    })),
    ...invoices.filter(i =>
      [i.id, i.loadId, i.broker, i.route, i.status]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(i => ({
      type: 'Invoice', icon: Receipt, label: i.id,
      sub: `${i.route} · ${i.broker} · $${i.amount?.toLocaleString()} · ${i.status}`,
      color: 'var(--accent2)',
      action: () => { onTabChange('financials'); onClose() }
    })),
    ...expenses.filter(e =>
      [e.cat, e.merchant, e.load, e.driver, e.notes]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(e => ({
      type: 'Expense', icon: DollarSign, label: e.merchant || e.cat,
      sub: `${e.cat} · $${e.amount} · ${e.date}${e.load ? ' · ' + e.load : ''}`,
      color: 'var(--accent3)',
      action: () => { onTabChange('financials'); onClose() }
    })),
  ].slice(0, 12)

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: 560, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <Ic icon={Search} size={16} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search loads, invoices, expenses, drivers, brokers..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }} />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>X</button>}
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>ESC</span>
        </div>
        {q.trim().length >= 2 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {results.length === 0
              ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No results for "{q}"</div>
              : results.map((r, i) => (
                <div key={i} onClick={r.action}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: r.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic icon={r.icon} size={16} color={r.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: r.color, marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: r.color + '15', color: r.color }}>{r.type}</span>
                </div>
              ))
            }
          </div>
        )}
        {q.trim().length < 2 && (
          <div style={{ padding: '16px 18px', display: 'flex', gap: 16 }}>
            {[[Package,'Loads'],[Receipt,'Invoices'],[DollarSign,'Expenses'],[User,'Drivers'],[Building2,'Brokers']].map(([icon, label]) => (
              <button key={label} onClick={() => setQ(label.toLowerCase())}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Sans',sans-serif" }}>
                <Ic icon={icon} size={12} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── TOOL RESULT CARD COMPONENTS ──────────────────────────────────────────────

const cardBase = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }
const cardRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }

function TruckStopCard({ data }) {
  if (!data?.stops?.length && !data?.fallback_url) return null
  return (
    <div style={cardBase}>
      <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'rgba(240,165,0,0.04)' }}>
        <Ic icon={Fuel} size={11} /> Truck Stops Nearby
      </div>
      {(data.stops || []).map((s, i) => (
        <a key={i} href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" style={{ ...cardRow, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={MapPin} size={14} color="var(--accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{s.name}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.address}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{s.miles_away} mi</div>
            {s.phone && <a href={`tel:${s.phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: 'var(--success)' }}><Ic icon={Phone} size={9} /> Call</a>}
          </div>
        </a>
      ))}
      {data.fallback_url && (
        <a href={data.fallback_url} target="_blank" rel="noopener noreferrer" style={{ ...cardRow, justifyContent: 'center', fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
          <Ic icon={ExternalLink} size={11} /> Open in Google Maps
        </a>
      )}
    </div>
  )
}

function RoadsideCard({ data }) {
  if (!data?.providers?.length) return null
  return (
    <div style={cardBase}>
      <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'rgba(239,68,68,0.04)' }}>
        <Ic icon={Phone} size={11} /> Roadside Service — {data.issue_type}
      </div>
      {data.providers.map((p, i) => (
        <div key={i} style={cardRow}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.desc || p.description}</div>
          </div>
          <a href={p.call_url || `tel:${p.phone?.replace(/[^0-9+]/g, '')}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'var(--success)', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
            <Ic icon={Phone} size={12} color="#fff" /> {p.phone}
          </a>
        </div>
      ))}
    </div>
  )
}

function FuelCard({ data }) {
  if (!data?.prices?.length && !data?.maps_url) return null
  return (
    <div style={cardBase}>
      <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.04)' }}>
        <Ic icon={Droplets} size={11} /> Diesel Prices — {data.region || 'Your Area'}
      </div>
      {(data.prices || []).map((p, i) => (
        <div key={i} style={{ ...cardRow, cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{p.station}</div>
            {p.note && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.note}</div>}
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--warning)' }}>{p.price}</div>
        </div>
      ))}
      {data.maps_url && (
        <a href={data.maps_url} target="_blank" rel="noopener noreferrer" style={{ ...cardRow, justifyContent: 'center', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', borderBottom: 'none' }}>
          <Ic icon={Navigation} size={11} /> Find diesel near me
        </a>
      )}
    </div>
  )
}

function WeatherCard({ data }) {
  if (!data?.current || data.error) return null
  return (
    <div style={cardBase}>
      <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'rgba(59,130,246,0.04)' }}>
        <Ic icon={CloudSun} size={11} /> Weather — {data.location}
      </div>
      <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: 'var(--text)' }}>{data.current.temp}°F</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{data.current.condition}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}><Ic icon={Wind} size={9} /> {data.current.wind} mph wind</div>
        </div>
      </div>
      {data.alerts?.length > 0 && data.alerts.map((a, i) => (
        <div key={i} style={{ margin: '0 12px 8px', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, fontSize: 11, fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic icon={AlertTriangle} size={12} /> {a}
        </div>
      ))}
      {data.forecast?.length > 0 && (
        <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
          {data.forecast.map((f, i) => (
            <div key={i} style={{ flex: 1, padding: '8px 10px', textAlign: 'center', borderRight: i < data.forecast.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>{f.date?.slice(5)}</div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{f.high}° / {f.low}°</div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>{f.condition}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoadCard({ data }) {
  if (!data?.loads?.length) return null
  return (
    <div style={cardBase}>
      <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--accent2)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'rgba(0,212,170,0.04)' }}>
        <Ic icon={Package} size={11} /> Available Loads ({data.count})
      </div>
      {data.loads.map((l, i) => (
        <div key={i} style={{ ...cardRow, cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{l.origin} <span style={{ color: 'var(--muted)' }}> → </span> {l.destination}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.broker || '—'} · {l.equipment} · {l.load_number}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--success)' }}>${(l.rate || 0).toLocaleString()}</div>
            {l.miles && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.miles} mi · ${l.rpm || '—'}/mi</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function WebResultCard({ data }) {
  if (!data?.results?.length) return null
  return (
    <div style={cardBase}>
      {data.results.map((r, i) => (
        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...cardRow, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>{r.title}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.snippet}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{r.source}</div>
          </div>
          <Ic icon={ExternalLink} size={12} color="var(--muted)" />
        </a>
      ))}
    </div>
  )
}

function LoadStatusCard({ data }) {
  if (!data || data.error) return null
  const statusColor = { 'Delivered': 'var(--success)', 'In Transit': '#3b82f6', 'Dispatched': 'var(--accent)', 'Cancelled': 'var(--danger)' }
  return (
    <div style={cardBase}>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{data.load_number}</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: (statusColor[data.status] || 'var(--muted)') + '15', color: statusColor[data.status] || 'var(--muted)' }}>{data.status}</span>
        </div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>{data.origin} → {data.destination}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>${(data.rate || 0).toLocaleString()} · {data.equipment} · {data.broker || '—'}</div>
        {data.next_action && <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 6, fontWeight: 600 }}>Next: {data.next_action}</div>}
        {data.broker_phone && (
          <a href={`tel:${data.broker_phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '5px 10px', background: 'var(--success)', borderRadius: 6, color: '#fff', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>
            <Ic icon={Phone} size={10} color="#fff" /> Call Broker
          </a>
        )}
      </div>
    </div>
  )
}

function LaneIntelCard({ data }) {
  if (!data || data.error) return data?.error ? <div style={{ ...cardBase, padding: 12, fontSize: 11, color: 'var(--muted)' }}>{data.error}</div> : null
  const trendColor = data.trend === 'rising' ? 'var(--success)' : data.trend === 'falling' ? 'var(--danger)' : 'var(--muted)'
  const trendArrow = data.trend === 'rising' ? '+' : data.trend === 'falling' ? '' : ''
  const maxRpm = data.history?.length ? Math.max(...data.history.map(w => w.rpm)) : 1
  const minRpm = data.history?.length ? Math.min(...data.history.map(w => w.rpm)) : 0
  const range = maxRpm - minRpm || 1

  return (
    <div style={cardBase}>
      <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'rgba(240,165,0,0.04)' }}>
        <Ic icon={BarChart2} size={11} /> Lane Intelligence — {data.lane}
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Predicted RPM</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--accent)' }}>${data.current_rpm?.toFixed(2)}</div>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 6, background: trendColor + '15', border: '1px solid ' + trendColor + '30' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: trendColor }}>{trendArrow}{data.trend_pct?.toFixed(1)}%</div>
            <div style={{ fontSize: 9, color: trendColor, textTransform: 'uppercase', fontWeight: 700 }}>{data.trend}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Confidence</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{data.confidence}%</div>
            <div style={{ width: 50, height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 3 }}>
              <div style={{ width: `${data.confidence}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
            </div>
          </div>
        </div>
        {/* Mini sparkline */}
        {data.history?.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 32, marginBottom: 8 }}>
            {[...data.history].reverse().map((w, i) => {
              const h = Math.max(4, ((w.rpm - minRpm) / range) * 28)
              return <div key={i} style={{ flex: 1, height: h, background: trendColor + '60', borderRadius: 2, position: 'relative' }} title={`${w.week}: $${w.rpm}/mi (${w.loads} loads)`} />
            })}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
          <span>{data.total_loads || 0} loads · {data.week_count || 0} weeks</span>
          <span>{data.season_note}</span>
        </div>
      </div>
    </div>
  )
}

// Render tool result cards
function ToolCards({ toolResults }) {
  if (!toolResults?.length) return null
  return toolResults.map((tr, i) => {
    const r = tr.result
    if (!r) return null
    if (r.stops || r.fallback_url) return <TruckStopCard key={i} data={r} />
    if (r.providers) return <RoadsideCard key={i} data={r} />
    if (r.type === 'fuel_prices') return <FuelCard key={i} data={r} />
    if (r.type === 'weather') return <WeatherCard key={i} data={r} />
    if (r.type === 'load_results') return <LoadCard key={i} data={r} />
    if (r.type === 'load_status') return <LoadStatusCard key={i} data={r} />
    if (r.type === 'web_results') return <WebResultCard key={i} data={r} />
    if (r.type === 'lane_intel') return <LaneIntelCard key={i} data={r} />
    return null
  })
}

// ── AI CHATBOX ─────────────────────────────────────────────────────────────────

export const SUGGESTED_QUESTIONS = [
  'Find truck stops near me',
  'What\'s the weather on my route?',
  'What\'s diesel running right now?',
  'I have a flat tire',
  'What\'s my profit this month?',
  'Find loads from Dallas to Atlanta',
]

export function AIChatbox({ onTabChange }) {
  const { language: currentLang } = useTranslation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useCallback(el => { if (el) el.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const { loads, invoices, expenses, totalRevenue, totalExpenses } = useCarrier()
  const { processReply } = useAIActions(onTabChange)

  const buildContext = () => {
    const activeLoads = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))
    const unpaid = invoices.filter(i => i.status === 'Unpaid')
    return [
      `CARRIER SNAPSHOT:`,
      `Revenue MTD: $${totalRevenue.toLocaleString()} | Expenses: $${totalExpenses.toLocaleString()} | Net: $${(totalRevenue - totalExpenses).toLocaleString()}`,
      `Active loads: ${activeLoads.length} (${activeLoads.map(l => `${l.loadId} ${l.origin?.split(',')[0]}->${l.dest?.split(',')[0]} $${l.gross}`).join(', ')})`,
      `Unpaid invoices: ${unpaid.length} ($${unpaid.reduce((s,i)=>s+(i.amount||0),0).toLocaleString()})`,
    ].join('\n')
  }

  // Get user location for tool calls
  const getLocation = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000 }
    )
  })

  const send = async (text) => {
    const userText = text || input.trim()
    if (!userText) return

    // Get location if user asks about nearby things
    const needsLocation = /near|truck stop|fuel|diesel|gas|weather|flat tire|breakdown|tow|parking|rest area/i.test(userText)
    let locationContext = ''
    if (needsLocation) {
      const loc = await getLocation()
      if (loc) locationContext = ` [Driver location: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}]`
    }

    const enrichedText = userText + locationContext
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.role === 'user' && m === newMessages[newMessages.length - 1] ? enrichedText : m.content }))
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, context: buildContext(), language: currentLang }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()

      const rawReply = data.reply || 'No response.'
      const toolResults = data.tool_results || []

      // Process existing action blocks in reply text
      const { displayText, actions, results } = await processReply(rawReply)
      const actionSummary = results.length > 0 ? '\n\n' + results.map(r => 'Done: ' + r).join('\n') : ''

      setMessages(m => [...m, {
        role: 'assistant',
        content: displayText + actionSummary,
        toolResults,
        hasActions: actions.length > 0,
      }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection issue. Check your signal and try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Toggle */}
      <button onClick={() => setOpen(o => !o)}
        style={{ position: 'fixed', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: open ? 'var(--surface2)' : 'var(--accent)', border: '2px solid ' + (open ? 'var(--border)' : 'var(--accent)'), boxShadow: '0 4px 20px rgba(240,165,0,0.4)', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, transition: 'all 0.2s' }}>
        {open ? <Ic icon={X} size={20} color="var(--muted)" /> : <Ic icon={Zap} size={22} color="#000" />}
      </button>

      {/* Chat Panel */}
      {open && (
        <div style={{ position: 'fixed', bottom: 88, right: 24, width: 380, height: 560, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', zIndex: 900, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.05))', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(240,165,0,0.15)', border: '1px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Zap} size={14} color="var(--accent)" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Q</div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>AI Dispatch Engine</div>
            </div>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '6px 0' }}>Try asking:</div>
                {SUGGESTED_QUESTIONS.map(q => (
                  <button key={q} onClick={() => send(q)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans',sans-serif", transition: 'border-color 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
                {/* Text bubble */}
                {m.content && (
                  <div style={{
                    maxWidth: '88%', padding: '9px 12px',
                    borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: m.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                    color: m.role === 'user' ? '#000' : 'var(--text)',
                    fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                  }}>
                    {m.content}
                  </div>
                )}
                {/* Tool result cards */}
                {m.toolResults && m.toolResults.length > 0 && (
                  <div style={{ maxWidth: '95%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <ToolCards toolResults={m.toolResults} />
                  </div>
                )}
                {m.hasActions && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
                    <Ic icon={CheckCircle} size={10} color="var(--success)" />
                    <span style={{ fontSize: 9, color: 'var(--success)', fontWeight: 600 }}>Action executed</span>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px 12px 12px 4px', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'qDot 1.2s ease-in-out infinite' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'qDot 1.2s ease-in-out 0.2s infinite' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'qDot 1.2s ease-in-out 0.4s infinite' }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>Q is thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, background: 'var(--surface)' }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask Q anything..."
              style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none' }}
            />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              style={{ background: input.trim() ? 'var(--accent)' : 'var(--surface2)', border: 'none', borderRadius: 10, width: 38, cursor: input.trim() ? 'pointer' : 'default', fontSize: 16, color: input.trim() ? '#000' : 'var(--muted)', transition: 'all 0.15s' }}>
              ↑
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes qDot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </>
  )
}

// ── QUICK ACTIONS BAR ──────────────────────────────────────────────────────────
export function QuickActions({ onTabChange }) {
  const { showToast } = useApp()
  const [open, setOpen] = useState(false)

  const actions = [
    { icon: FileText, label: 'Add Load',           color: 'var(--accent)',  onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Drop a rate confirmation to log a new load') } },
    { icon: Fuel, label: 'Add Expense',        color: 'var(--warning)', onClick: () => { onTabChange('financials'); setOpen(false) } },
    { icon: Package, label: 'Update Load Status', color: 'var(--accent2)', onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Drag a load card to update its status') } },
    { icon: Truck, label: 'Assign Driver',      color: 'var(--accent3)', onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Click a load card to assign a driver') } },
    { icon: DollarSign, label: 'Pay a Driver',       color: 'var(--success)', onClick: () => { onTabChange('drivers'); setOpen(false) } },
    { icon: BarChart2, label: 'View P&L',           color: 'var(--accent)',  onClick: () => { onTabChange('financials'); setOpen(false) } },
  ]

  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 900, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
          {actions.map((a, i) => (
            <button key={a.label} onClick={a.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--surface)', border: `1px solid ${a.color}30`, borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.4)', animation: `slideUp 0.2s ease ${i * 0.04}s both`, whiteSpace: 'nowrap' }}>
              <span><Ic icon={a.icon} size={16} /></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.label}</span>
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: 52, height: 52, borderRadius: '50%', background: open ? 'var(--surface2)' : 'var(--surface)', border: `2px solid ${open ? 'var(--border)' : 'rgba(240,165,0,0.4)'}`, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: open ? 20 : 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: open ? 'var(--muted)' : 'var(--accent)', transition: 'all 0.2s', transform: open ? 'rotate(45deg)' : 'none' }}>
        {open ? <Ic icon={X} size={20} color="var(--muted)" /> : <Ic icon={Zap} size={22} color="var(--accent)" />}
      </button>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
