import { useState, useEffect, useRef, useCallback } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, TrendingUp, Truck, ChevronRight, AlertCircle,
  FileText, CheckCircle, ArrowUpRight, Send, MapPin,
  Camera, ScanLine, ArrowRight
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

  // Q greeting state
  const [qGreeting, setQGreeting] = useState('')
  const [qLoading, setQLoading] = useState(true)
  const greetingFetchedRef = useRef(false)

  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(0) : 0
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  const recentLoads = [...loads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5)

  // Build context for Q's greeting — same data the chat uses
  const buildContext = useCallback(() => {
    const active = loads.filter(l => !['Delivered', 'Invoiced', 'Paid'].includes(l.status))
    const unpaid = invoices.filter(i => i.status !== 'Paid')
    const net = totalRevenue - totalExpenses
    return [
      `DRIVER NAME: ${profile?.full_name || user?.user_metadata?.full_name || 'Driver'}`,
      `CARRIER: ${ctx.company?.name || 'Unknown'}`,
      `Revenue MTD: $${totalRevenue.toLocaleString()} | Expenses: $${totalExpenses.toLocaleString()} | Net: $${net.toLocaleString()}`,
      `Active loads (${active.length}): ${active.map(l => `${l.load_id || l.id} ${l.origin}→${l.destination || l.dest} $${Number(l.rate || 0).toLocaleString()} [${l.status}]`).join(' | ') || 'none'}`,
      `Unpaid invoices: ${unpaid.length} totaling $${unpaid.reduce((s, i) => s + Number(i.amount || 0), 0).toLocaleString()}`,
      `Recent expenses: ${expenses.slice(0, 3).map(e => `${e.category} $${e.amount}`).join(', ') || 'none'}`,
    ].join('\n')
  }, [loads, invoices, expenses, totalRevenue, totalExpenses, ctx.company, profile, user])

  // Fetch Q's real AI greeting on app open
  useEffect(() => {
    if (greetingFetchedRef.current) return
    // Wait for data to be ready (loads/invoices loaded)
    const dataReady = ctx.dataReady !== false
    if (!dataReady) return

    greetingFetchedRef.current = true

    // Check if we already have a cached greeting from this session
    const cacheKey = 'qivori_q_greeting'
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      setQGreeting(cached)
      setQLoading(false)
      return
    }

    const hour = new Date().getHours()
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

    const fetchGreeting = async () => {
      try {
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: `[SYSTEM: This is a home screen greeting, not a user message. Generate a brief, warm opening message for the driver. ${timeGreeting}. Look at their current situation and proactively tell them what matters most right now. Be specific — reference their actual loads, amounts, statuses. Keep it to 2-3 sentences max. Sound like a smart copilot who already knows what's going on, not a generic assistant. Don't use emojis. End with a question about what they need help with.]`,
              },
            ],
            context: buildContext(),
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const reply = (data.reply || '').replace(/```action[\s\S]*?```/g, '').trim()
          if (reply) {
            setQGreeting(reply)
            sessionStorage.setItem(cacheKey, reply)
          }
        }
      } catch {
        // Fallback to static greeting if API fails
      }
      setQLoading(false)
    }

    fetchGreeting()
  }, [buildContext, ctx.dataReady])

  // Fallback greeting while AI loads or if it fails
  const fallbackGreeting = (() => {
    const hour = new Date().getHours()
    const time = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    if (activeLoads.length > 0) {
      const load = activeLoads[0]
      const status = (load.status || '').toLowerCase()
      if (status.includes('transit') || status.includes('loaded')) {
        return `${time}, ${firstName}. You're hauling to ${load.destination || load.dest || '?'}${load.miles ? ` — ${load.miles} mi to go` : ''}. Need to check in, mark delivered, or find your next load?`
      }
      return `${time}, ${firstName}. You have a load booked: ${load.origin} → ${load.destination || load.dest} for ${fmt$(load.gross || load.rate)}. What do you need?`
    }
    if (unpaidInvoices.length > 0) {
      return `${time}, ${firstName}. You have ${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length > 1 ? 's' : ''} totaling ${fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0))}. Want to send them out or find a new load?`
    }
    return `${time}, ${firstName}. No active loads right now. Ready to find your next one?`
  })()

  const displayGreeting = qGreeting || fallbackGreeting

  // Context-aware quick actions based on current situation
  const getSmartActions = () => {
    const actions = []
    const currentLoad = activeLoads[0]
    const status = (currentLoad?.status || '').toLowerCase()

    if (currentLoad && (status.includes('transit') || status.includes('loaded'))) {
      actions.push({ label: 'Mark Delivered', icon: CheckCircle, color: 'var(--success)', msg: 'Mark my current load as delivered' })
      actions.push({ label: 'Check Call', icon: MapPin, color: 'var(--accent2)', msg: 'Submit a check call for my current load' })
      actions.push({ label: 'Find Next Load', icon: Package, color: 'var(--accent)', msg: `Find me loads from ${currentLoad.destination || currentLoad.dest || 'my delivery city'}` })
    } else if (currentLoad && (status.includes('booked') || status.includes('dispatched'))) {
      actions.push({ label: 'Start Trip', icon: Truck, color: 'var(--accent)', msg: 'Update my load to In Transit' })
      actions.push({ label: 'Navigate', icon: ArrowRight, color: 'var(--success)', msg: 'Navigate me to my pickup location' })
      actions.push({ label: 'Snap Rate Con', icon: ScanLine, color: 'var(--accent2)', nav: 'loads' })
    } else if (unpaidInvoices.length > 0) {
      actions.push({ label: 'Send Invoices', icon: DollarSign, color: 'var(--success)', nav: 'money' })
      actions.push({ label: 'Find a Load', icon: Package, color: 'var(--accent)', msg: 'Find me the best available loads right now' })
      actions.push({ label: 'Scan Receipt', icon: Camera, color: '#8b5cf6', nav: 'money', navExtra: 'expenses' })
    } else {
      actions.push({ label: 'Find a Load', icon: Package, color: 'var(--accent)', msg: 'Find me a good paying load' })
      actions.push({ label: 'Snap Rate Con', icon: ScanLine, color: 'var(--accent2)', nav: 'loads' })
      actions.push({ label: 'Log Expense', icon: Camera, color: '#8b5cf6', nav: 'money', navExtra: 'expenses' })
    }
    return actions
  }

  const smartActions = getSmartActions()

  const handleQSubmit = () => {
    if (!qInput.trim()) return
    haptic()
    onOpenQ?.(qInput.trim())
    setQInput('')
  }

  const handleAction = (action) => {
    haptic()
    if (action.msg) onOpenQ?.(action.msg)
    else if (action.nav) onNavigate?.(action.nav, action.navExtra)
  }

  // Render bold markdown in Q's greeting
  const renderBold = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Q's Live Greeting ── */}
      <div style={{ animation: 'fadeInUp 0.3s ease' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 20px rgba(240,165,0,0.15)' }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 4, letterSpacing: 0.5 }}>Q</div>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '2px 14px 14px 14px', padding: '12px 14px',
              minHeight: 44,
            }}>
              {qLoading && !qGreeting ? (
                <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out infinite' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out 0.2s infinite' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out 0.4s infinite' }} />
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, animation: 'fadeInUp 0.3s ease' }}>
                  {renderBold(displayGreeting)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Q's suggested actions */}
        {!qLoading && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingLeft: 46, flexWrap: 'wrap', animation: 'fadeInUp 0.25s ease 0.1s both' }}>
            {smartActions.map((action, i) => (
              <button key={i} onClick={() => handleAction(action)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 20,
                  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                  transition: 'all 0.15s ease',
                  animation: `fadeInUp 0.25s ease ${0.15 + i * 0.05}s both`,
                }}>
                <Ic icon={action.icon} size={13} color={action.color} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Reply to Q */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingLeft: 46 }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 24, padding: '4px 4px 4px 14px',
          }}>
            <input
              value={qInput}
              onChange={e => setQInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQSubmit()}
              placeholder="Reply to Q..."
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              }}
            />
            <button onClick={qInput.trim() ? handleQSubmit : () => onOpenQ?.()}
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Send} size={14} color="#000" />
            </button>
          </div>
        </div>
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
                    <button onClick={(e) => { e.stopPropagation(); haptic(); onOpenQ?.(`Tell me about load ${load.load_id || load.id}`) }}
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
