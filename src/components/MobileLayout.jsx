import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import {
  Zap, Send, MapPin, Camera, DollarSign, Package, Truck, Phone,
  Navigation, Receipt, Plus, ChevronRight, ArrowLeft, Home, X,
  CheckCircle, Mic, FileText, Clock
} from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export default function MobileLayout() {
  return (
    <CarrierProvider>
      <MobileAI />
    </CarrierProvider>
  )
}

// ── MAIN AI-DRIVEN MOBILE APP ─────────────────────────────
function MobileAI() {
  const { logout, showToast } = useApp()
  const ctx = useCarrier()
  const { loads, activeLoads, invoices, expenses, company, totalRevenue, totalExpenses, addExpense, createCheckCall } = ctx

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [pendingAction, setPendingAction] = useState(null)
  const [gpsLocation, setGpsLocation] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Build context for AI
  const buildContext = useCallback(() => {
    const active = loads.filter(l => !['Delivered', 'Invoiced'].includes(l.status))
    const unpaid = invoices.filter(i => i.status !== 'Paid')
    const netProfit = totalRevenue - totalExpenses
    return [
      `CARRIER: ${company?.name || 'Unknown'}`,
      `Revenue MTD: $${totalRevenue.toLocaleString()} | Expenses: $${totalExpenses.toLocaleString()} | Net: $${netProfit.toLocaleString()}`,
      `Active loads (${active.length}): ${active.map(l => `${l.load_id || l.id} ${l.origin}→${l.destination} $${Number(l.rate || 0).toLocaleString()} [${l.status}]`).join(' | ') || 'none'}`,
      `Total loads: ${loads.length}`,
      `Unpaid invoices: ${unpaid.length} totaling $${unpaid.reduce((s, i) => s + Number(i.amount || 0), 0).toLocaleString()}`,
      `Recent expenses: ${expenses.slice(0, 5).map(e => `${e.category} $${e.amount} ${e.merchant || ''}`).join(', ') || 'none'}`,
      gpsLocation ? `Driver current location: ${gpsLocation}` : '',
    ].filter(Boolean).join('\n')
  }, [loads, invoices, expenses, totalRevenue, totalExpenses, company, gpsLocation])

  // Parse action blocks from AI response
  const parseActions = (text) => {
    const actionRegex = /```action\s*\n?([\s\S]*?)```/g
    const actions = []
    let match
    while ((match = actionRegex.exec(text)) !== null) {
      try { actions.push(JSON.parse(match[1].trim())) } catch {}
    }
    // Clean display text (remove action blocks)
    const displayText = text.replace(/```action\s*\n?[\s\S]*?```/g, '').trim()
    return { actions, displayText }
  }

  // Execute an action from the AI
  const executeAction = async (action) => {
    try {
      switch (action.type) {
        case 'add_expense': {
          await addExpense({
            category: action.category || 'Other',
            amount: parseFloat(action.amount) || 0,
            merchant: action.merchant || '',
            notes: action.notes || '',
            date: new Date().toISOString().split('T')[0],
          })
          showToast('success', 'Expense Added', `$${action.amount} — ${action.category}`)
          return true
        }
        case 'check_call': {
          const loadId = action.load_id || activeLoads[0]?.id
          if (!loadId) { showToast('error', 'Error', 'No active load found'); return false }
          await createCheckCall(loadId, {
            location: action.location || gpsLocation || 'Unknown',
            status: action.status || 'On Time',
            notes: action.notes || '',
            called_at: new Date().toISOString(),
          })
          showToast('success', 'Check Call Submitted', action.location || gpsLocation)
          return true
        }
        case 'get_gps': {
          getGPS()
          return true
        }
        case 'call_broker': {
          if (action.phone) window.location.href = `tel:${action.phone}`
          return true
        }
        case 'navigate': {
          // Could expand later — for now toast
          showToast('info', 'Navigate', `Opening ${action.to}`)
          return true
        }
        default:
          return false
      }
    } catch (err) {
      showToast('error', 'Action Failed', err.message)
      return false
    }
  }

  // Get GPS location
  const getGPS = () => {
    if (!navigator.geolocation) { showToast('error', 'Error', 'GPS not available'); return }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`)
        const data = await res.json()
        const addr = data.address || {}
        const city = addr.city || addr.town || addr.village || ''
        const state = addr.state || ''
        const loc = [city, state].filter(Boolean).join(', ')
        setGpsLocation(loc)
        showToast('success', 'Location Found', loc)
      } catch {
        const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
        setGpsLocation(loc)
      }
    }, () => { showToast('error', 'Error', 'Location permission denied') })
  }

  // Send message
  const sendMessage = async (text) => {
    const userText = text || input.trim()
    if (!userText || loading) return

    setShowQuickActions(false)
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(-20), // Keep last 20 messages
          context: buildContext(),
        }),
      })
      const data = await res.json()
      const rawReply = data.reply || data.error || 'Something went wrong.'

      // Parse actions from the response
      const { actions, displayText } = parseActions(rawReply)

      // Execute any actions
      for (const action of actions) {
        await executeAction(action)
      }

      setMessages(m => [...m, {
        role: 'assistant',
        content: displayText || rawReply,
        actions,
      }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error — check your internet.' }])
    } finally {
      setLoading(false)
    }
  }

  // Quick action chips
  const quickActions = [
    { icon: Navigation, label: 'Check In', msg: 'Submit a check call with my GPS location' },
    { icon: Receipt, label: 'Add Expense', msg: 'I need to add an expense' },
    { icon: Package, label: 'My Loads', msg: 'Show me my active loads' },
    { icon: DollarSign, label: 'Revenue', msg: "What's my revenue and profit this month?" },
    { icon: FileText, label: 'Invoices', msg: 'Show me my unpaid invoices' },
    { icon: Truck, label: 'Next Load', msg: "What's my next pickup?" },
  ]

  // Suggested prompts for empty state
  const suggestions = [
    'Submit check call — I\'m in Dallas, TX',
    'Add fuel expense $120 at Pilot in Memphis',
    'How much have I made this month?',
    'What loads do I have active?',
    'Call my broker for load ' + (activeLoads[0]?.load_id || 'QV-1001'),
  ]

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden' }}>

      {/* ── HEADER ──────────────────────────────────── */}
      <div style={{ height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(0,212,170,0.1))', border: '1px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ic icon={Zap} size={18} color="var(--accent)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 3 }}>
            QI<span style={{ color: 'var(--accent)' }}>VORI</span>
            <span style={{ fontSize: 11, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, marginLeft: 6 }}>AI</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            {activeLoads.length > 0 ? `${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''}` : 'Ready to help'}
          </div>
        </div>

        {/* Mini stats */}
        <div style={{ display: 'flex', gap: 8 }}>
          <MiniStat label="MTD" value={'$' + totalRevenue.toLocaleString()} color="var(--accent)" />
          <MiniStat label="Loads" value={activeLoads.length} color="var(--accent2)" />
        </div>

        <button onClick={logout} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', color: 'var(--danger)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
          Log Out
        </button>
      </div>

      {/* ── ACTIVE LOAD BANNER ──────────────────────── */}
      {activeLoads.length > 0 && showQuickActions && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}
          onClick={() => sendMessage(`Tell me about load ${activeLoads[0].load_id}`)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={Truck} size={16} color="var(--accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeLoads[0].origin} → {activeLoads[0].destination}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{activeLoads[0].load_id} · ${Number(activeLoads[0].rate || 0).toLocaleString()}</div>
          </div>
          <ChevronRight size={14} color="var(--muted)" />
        </div>
      )}

      {/* ── CHAT MESSAGES ───────────────────────────── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Empty state — suggestions */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20 }}>
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(240,165,0,0.12), rgba(0,212,170,0.08))', border: '1px solid rgba(240,165,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Ic icon={Zap} size={26} color="var(--accent)" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Hey, Driver</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                I'm your AI co-pilot. Tell me what you need —<br />
                expenses, check calls, load info, anything.
              </div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginTop: 8 }}>TRY SAYING</div>
            {suggestions.map(s => (
              <button key={s} onClick={() => sendMessage(s)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: 10 }}>
                <Ic icon={Send} size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic icon={Zap} size={10} color="var(--accent)" />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>Qivori AI</span>
              </div>
            )}
            <div style={{
              maxWidth: '88%',
              padding: '11px 14px',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--surface)',
              color: m.role === 'user' ? '#000' : 'var(--text)',
              border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
              fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>

            {/* Show action confirmation badges */}
            {m.actions && m.actions.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {m.actions.map((a, j) => (
                  <ActionBadge key={j} action={a} />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={Zap} size={10} color="var(--accent)" />
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '10px 16px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <span className="ai-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out infinite' }} />
                <span className="ai-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out 0.2s infinite' }} />
                <span className="ai-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out 0.4s infinite' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── QUICK ACTION CHIPS ──────────────────────── */}
      <div style={{ flexShrink: 0, padding: '6px 16px', display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {quickActions.map(a => (
          <button key={a.label} onClick={() => sendMessage(a.msg)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>
            <Ic icon={a.icon} size={13} color={a.label === 'Check In' ? 'var(--success)' : 'var(--accent)'} />
            {a.label}
          </button>
        ))}
      </div>

      {/* ── INPUT BAR ───────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {/* GPS quick button */}
        <button onClick={getGPS}
          style={{ width: 40, height: 40, borderRadius: 12, background: gpsLocation ? 'rgba(0,212,170,0.12)' : 'var(--surface2)', border: '1px solid ' + (gpsLocation ? 'rgba(0,212,170,0.3)' : 'var(--border)'), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ic icon={Navigation} size={16} color={gpsLocation ? 'var(--success)' : 'var(--muted)'} />
        </button>

        {/* Text input */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder={gpsLocation ? `📍 ${gpsLocation} — Ask me anything...` : 'Tell me what you need...'}
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', color: 'var(--text)', fontSize: 16, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Send button */}
        <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
          style={{ width: 40, height: 40, borderRadius: 12, background: input.trim() ? 'var(--accent)' : 'var(--surface2)', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
          <Ic icon={Send} size={16} color={input.trim() ? '#000' : 'var(--muted)'} />
        </button>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes aipulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}

// ── MINI STAT ──────────────────────────────────────────
function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

// ── ACTION BADGE ────────────────────────────────────────
function ActionBadge({ action }) {
  const icons = {
    add_expense: Receipt,
    check_call: MapPin,
    get_gps: Navigation,
    call_broker: Phone,
    navigate: ArrowLeft,
  }
  const labels = {
    add_expense: `Expense: $${action.amount} ${action.category || ''}`,
    check_call: `Check Call: ${action.location || 'submitted'}`,
    get_gps: 'Getting location...',
    call_broker: 'Calling broker',
    navigate: `Opening ${action.to}`,
  }
  const Icon = icons[action.type] || CheckCircle
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 8, fontSize: 10, fontWeight: 600, color: 'var(--success)' }}>
      <Ic icon={Icon} size={11} />
      <Ic icon={CheckCircle} size={9} />
      {labels[action.type] || action.type}
    </div>
  )
}
