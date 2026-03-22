import { useState, useEffect, useRef, useCallback } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, TrendingUp, Truck, ChevronRight, AlertCircle,
  FileText, Clock, CheckCircle, ArrowUpRight, Mic, Send, MapPin,
  Camera, ScanLine
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor } from './shared'
import { apiFetch } from '../../lib/api'

export default function MobileHomeTab({ onNavigate, onOpenQ }) {
  const ctx = useCarrier() || {}
  const { user, profile } = useApp()
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const [expandedLoad, setExpandedLoad] = useState(null)
  const [qInput, setQInput] = useState('')
  const [qGreeting, setQGreeting] = useState('')
  const greetingSpokenRef = useRef(false)
  const pendingAudioRef = useRef(null)

  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(0) : 0
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  // Recent activity — last 5 loads sorted by date
  const recentLoads = [...loads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5)

  // ── Q speaks on app open ──────────────────────────
  // Builds a short contextual greeting, calls AI to generate it, then speaks it out loud via TTS
  const buildGreetingContext = useCallback(() => {
    const active = loads.filter(l => !['Delivered', 'Invoiced', 'Paid'].includes(l.status))
    const unpaid = invoices.filter(i => i.status !== 'Paid')
    return [
      `DRIVER: ${profile?.full_name || user?.user_metadata?.full_name || 'Driver'}`,
      `Revenue MTD: $${totalRevenue.toLocaleString()} | Net: $${(totalRevenue - totalExpenses).toLocaleString()}`,
      `Active loads (${active.length}): ${active.map(l => `${l.origin}→${l.destination || l.dest} $${l.rate || 0} [${l.status}]`).join(' | ') || 'none'}`,
      `Unpaid invoices: ${unpaid.length}`,
    ].join('\n')
  }, [loads, invoices, totalRevenue, totalExpenses, profile, user])

  useEffect(() => {
    if (greetingSpokenRef.current) return
    if (ctx.dataReady === false) return

    // Only greet once per session
    const sessionKey = 'qivori_q_spoken'
    if (sessionStorage.getItem(sessionKey)) return

    greetingSpokenRef.current = true
    sessionStorage.setItem(sessionKey, '1')

    const hour = new Date().getHours()
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

    const doGreeting = async () => {
      try {
        // Ask AI to generate a short spoken greeting
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `[SYSTEM: Generate a brief spoken greeting for the driver opening their app. ${timeGreeting}. Look at their data and say something useful in 1-2 short sentences. Be warm but direct. Reference specific numbers or loads if relevant. End by asking what they're working on today. Keep it under 30 words — this will be spoken out loud.]`,
            }],
            context: buildGreetingContext(),
          }),
        })

        if (!res.ok) return
        const data = await res.json()
        const reply = (data.reply || '').replace(/```action[\s\S]*?```/g, '').replace(/\*\*/g, '').trim()
        if (!reply) return

        setQGreeting(reply)

        // Speak it via TTS
        const ttsRes = await apiFetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: reply }),
        })

        if (ttsRes.ok && ttsRes.status !== 204) {
          const blob = await ttsRes.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audio.onended = () => URL.revokeObjectURL(url)
          audio.onerror = () => URL.revokeObjectURL(url)
          try {
            await audio.play()
          } catch {
            // Autoplay blocked (mobile Safari) — store blob, play on first tap
            pendingAudioRef.current = { url, audio }
            const playOnTap = () => {
              if (pendingAudioRef.current) {
                pendingAudioRef.current.audio.play().catch(() => {})
                pendingAudioRef.current = null
              }
              document.removeEventListener('touchstart', playOnTap)
              document.removeEventListener('click', playOnTap)
            }
            document.addEventListener('touchstart', playOnTap, { once: true })
            document.addEventListener('click', playOnTap, { once: true })
          }
        }
      } catch {
        // Silent fail — greeting is a nice-to-have
      }
    }

    doGreeting()
  }, [ctx.dataReady, buildGreetingContext])

  // Context-aware quick actions — show what matters right now
  const getSmartActions = () => {
    const actions = []
    const hasActiveLoad = activeLoads.length > 0
    const currentLoad = activeLoads[0]
    const status = (currentLoad?.status || '').toLowerCase()

    if (hasActiveLoad && (status.includes('transit') || status.includes('loaded'))) {
      actions.push({ icon: CheckCircle, label: 'Mark Delivered', color: 'var(--success)', action: () => onOpenQ?.('Mark my current load as delivered', qGreeting) })
      actions.push({ icon: MapPin, label: 'Check Call', color: 'var(--accent2)', action: () => onOpenQ?.('Submit a check call for my current load', qGreeting) })
    } else if (hasActiveLoad && (status.includes('booked') || status.includes('dispatched'))) {
      actions.push({ icon: Truck, label: 'Start Trip', color: 'var(--accent)', action: () => onOpenQ?.('Update my load to In Transit', qGreeting) })
    }

    if (!hasActiveLoad) {
      actions.push({ icon: Package, label: 'Find a Load', color: 'var(--accent)', action: () => onOpenQ?.('Find me a good paying load', qGreeting) })
    }

    actions.push({ icon: ScanLine, label: 'Snap Rate Con', color: 'var(--accent2)', action: () => onNavigate?.('loads') })

    if (unpaidInvoices.length > 0) {
      actions.push({ icon: DollarSign, label: 'Send Invoice', color: 'var(--success)', action: () => onNavigate?.('money') })
    }

    actions.push({ icon: Camera, label: 'Scan Receipt', color: '#8b5cf6', action: () => onNavigate?.('money', 'expenses') })

    return actions.slice(0, 3) // Show max 3
  }

  const smartActions = getSmartActions()

  const handleQSubmit = () => {
    if (!qInput.trim()) return
    haptic()
    onOpenQ?.(qInput.trim(), qGreeting)
    setQInput('')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── AI Command Center: Greeting + Q Input ── */}
      <div style={{ animation: 'fadeInUp 0.3s ease' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Hey, {firstName}</div>
        {qGreeting ? (
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px 14px 14px 14px', lineHeight: 1.5, animation: 'fadeInUp 0.3s ease', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 12, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <span style={{ opacity: 0.9 }}>{qGreeting}</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {activeLoads.length > 0
              ? `${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''} — what do you need?`
              : "No active loads — let's find one"}
          </div>
        )}

        {/* Q Input Bar — type or tap mic */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 28, padding: '6px 6px 6px 16px',
        }}>
          <input
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQSubmit()}
            placeholder="Ask Q anything..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
            }}
          />
          {qInput.trim() ? (
            <button onClick={handleQSubmit}
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Send} size={16} color="#000" />
            </button>
          ) : (
            <button onClick={() => onOpenQ?.(null, qGreeting)}
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Mic} size={16} color="#000" />
            </button>
          )}
        </div>
      </div>

      {/* ── Smart Actions — context-aware ── */}
      <div style={{ display: 'flex', gap: 8, animation: 'fadeInUp 0.3s ease 0.05s both' }}>
        {smartActions.map((action, i) => (
          <button key={i} onClick={() => { haptic(); action.action() }}
            style={{
              flex: 1, padding: '12px 8px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s ease',
            }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${action.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={action.icon} size={16} color={action.color} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>{action.label}</span>
          </button>
        ))}
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, animation: 'fadeInUp 0.3s ease 0.1s both' }}>
        <KPICard icon={DollarSign} label="Revenue MTD" value={fmt$(totalRevenue)} color="var(--accent)" />
        <KPICard icon={TrendingUp} label="Net Profit" value={fmt$(netProfit)} color={netProfit >= 0 ? 'var(--success)' : 'var(--danger)'} sub={`${profitMargin}% margin`} />
        <KPICard icon={Package} label="Active Loads" value={activeLoads.length} color="var(--accent2)" onClick={() => onNavigate?.('loads')} />
        <KPICard icon={FileText} label="Unpaid" value={unpaidInvoices.length} color={unpaidInvoices.length > 0 ? 'var(--danger)' : 'var(--success)'} sub={unpaidInvoices.length > 0 ? fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)) : 'All clear'} onClick={() => onNavigate?.('money')} />
      </div>

      {/* ── Active Load Card ── */}
      {activeLoads.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.3s ease 0.15s both' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8 }}>ACTIVE LOADS</div>
          {activeLoads.slice(0, 3).map((load, index) => {
            const isExpanded = expandedLoad === (load.id || load.load_id)
            return (
              <div key={load.id || load.load_id} style={{ marginBottom: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', animation: `fadeInUp 0.3s ease ${0.15 + index * 0.05}s both` }}>
                <div
                  onClick={() => { haptic(); setExpandedLoad(isExpanded ? null : (load.id || load.load_id)) }}
                  style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(240,165,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic icon={Truck} size={16} color="var(--accent)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {load.origin || '?'} → {load.destination || load.dest || '?'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: statusColor(load.status), fontWeight: 700 }}>{load.status}</span>
                      <span>·</span>
                      <span>{fmt$(load.gross || load.rate)}</span>
                      {load.miles > 0 && <><span>·</span><span>{load.miles} mi</span></>}
                    </div>
                  </div>
                  <ChevronRight size={14} color="var(--muted)" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                    {[
                      ['Load ID', load.load_id || load.loadId || '—'],
                      ['Broker', load.broker_name || load.broker || '—'],
                      ['Rate', fmt$(load.gross || load.rate)],
                      ['RPM', load.miles > 0 ? `$${((load.gross || load.rate || 0) / load.miles).toFixed(2)}/mi` : '—'],
                      ['Equipment', load.equipment || load.equipment_type || '—'],
                      ['Pickup', load.pickup_date || '—'],
                      ['Delivery', load.delivery_date || '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11 }}>
                        <span style={{ color: 'var(--muted)' }}>{k}</span>
                        <span style={{ fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                    {/* Quick action for this load */}
                    <button onClick={(e) => { e.stopPropagation(); haptic(); onOpenQ?.(`What's the status on load ${load.load_id || load.id}?`, qGreeting) }}
                      style={{ width: '100%', marginTop: 8, padding: '8px', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Sans',sans-serif" }}>
                      Ask Q about this load
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Alerts ── */}
      {unpaidInvoices.length > 0 && (
        <div onClick={() => onNavigate?.('money')} style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', animation: 'fadeInUp 0.3s ease 0.2s both' }}>
          <Ic icon={AlertCircle} size={18} color="var(--danger)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{unpaidInvoices.length} Unpaid Invoice{unpaidInvoices.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total: {fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0))}</div>
          </div>
          <ArrowUpRight size={14} color="var(--danger)" />
        </div>
      )}

      {/* ── Recent Activity ── */}
      {recentLoads.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.3s ease 0.25s both' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8 }}>RECENT ACTIVITY</div>
          {recentLoads.map((load, index) => (
            <div key={load.id || load.load_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', animation: `fadeInUp 0.2s ease ${0.25 + index * 0.03}s both` }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(load.status), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {load.origin || '?'} → {load.destination || load.dest || '?'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{load.status} · {fmt$(load.gross || load.rate)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}

function KPICard({ icon, label, value, color, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Ic icon={icon} size={13} color={color} />
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
