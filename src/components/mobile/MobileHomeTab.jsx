import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, TrendingUp, Truck, ChevronRight,
  FileText, CheckCircle, ArrowUpRight, Send, MapPin,
  Camera, ScanLine, Zap, Activity, XCircle,
  ToggleLeft, ToggleRight, Navigation, ArrowRight
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor, QInsightCard, getQSystemState } from './shared'
import { apiFetch } from '../../lib/api'

export default function MobileHomeTab({ onNavigate, onOpenQ }) {
  const ctx = useCarrier() || {}
  const { user, profile } = useApp()
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const drivers = ctx.drivers || []
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const fuelCostPerMile = ctx.fuelCostPerMile || 0

  const [expandedLoad, setExpandedLoad] = useState(null)
  const [shiftActive, setShiftActive] = useState(() => localStorage.getItem('q_shift_active') === 'true')
  const [showPreTrip, setShowPreTrip] = useState(false)
  const [preTripItems, setPreTripItems] = useState(null)
  const [preTripSubmitting, setPreTripSubmitting] = useState(false)
  const [qInput, setQInput] = useState('')
  const [qGreeting, setQGreeting] = useState('')
  const [aiDecisions, setAiDecisions] = useState([])
  const [qAutonomous, setQAutonomous] = useState(() => localStorage.getItem('q_autonomous') === 'true')
  const [acceptingId, setAcceptingId] = useState(null)
  const [passingId, setPassingId] = useState(null)
  const [gpsLocation, setGpsLocation] = useState(null)
  const greetingSpokenRef = useRef(false)
  const pendingAudioRef = useRef(null)
  const [statusIdx, setStatusIdx] = useState(0)
  const [lastScanTime, setLastScanTime] = useState(null)
  const [scanAgo, setScanAgo] = useState('')
  const [freshPulse, setFreshPulse] = useState(false)

  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]
  const recentLoads = [...loads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5)
  const qState = getQSystemState(ctx)
  const firstDriver = drivers.find(d => d.user_id === user?.id) || drivers.find(d => (d.full_name || d.name || '') === (profile?.full_name || '')) || drivers[0]
  const marginTarget = 18
  const marginReached = profitMargin >= marginTarget

  // Status lines
  const STATUS_LINES = qAutonomous
    ? ['Auto-booking profitable loads', 'Negotiating rates', 'Scanning all boards', 'Optimizing dispatch']
    : ['Analyzing lane rates', 'Scanning load boards', 'Monitoring market', 'Ready for commands']

  useEffect(() => {
    const interval = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_LINES.length), 3500)
    return () => clearInterval(interval)
  }, [STATUS_LINES.length])

  // GPS location
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 5000 }
    )
  }, [])

  // Toggle autonomous mode
  const toggleAutonomous = () => {
    const next = !qAutonomous
    setQAutonomous(next)
    localStorage.setItem('q_autonomous', String(next))
    haptic(next ? 'success' : 'light')
  }

  // Live "last scan" ticker
  useEffect(() => {
    if (!lastScanTime) return
    const tick = () => {
      const sec = Math.floor((Date.now() - lastScanTime) / 1000)
      setScanAgo(sec < 5 ? 'just now' : sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [lastScanTime])

  // Dynamic subtext based on load state
  const qSubtext = useMemo(() => {
    const inTransit = activeLoads.filter(l => {
      const s = (l.status || '').toLowerCase()
      return s.includes('transit') || s.includes('loaded')
    })
    if (inTransit.length > 0) return `${inTransit.length} load${inTransit.length > 1 ? 's' : ''} in transit`
    if (activeLoads.length > 0) return `${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''} detected`
    return 'No active load detected'
  }, [activeLoads])

  // Q proactive insight
  const qInsight = useMemo(() => {
    const margin = profitMargin
    const avgRPM = activeLoads.length > 0
      ? activeLoads.reduce((s, l) => s + ((l.gross || l.rate || 0) / Math.max(l.miles || 1, 1)), 0) / activeLoads.length
      : 0

    if (unpaidInvoices.length >= 3) {
      const total = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
      return {
        title: 'Q INSIGHT',
        text: `${unpaidInvoices.length} invoices outstanding totaling ${fmt$(total)}. Factor oldest invoices for same-day cash to improve working capital.`,
        sub: `Estimated cash acceleration: +${fmt$(Math.round(total * 0.97))} within 24hrs`,
        accent: 'var(--danger)',
      }
    }
    if (activeLoads.length === 0 && loads.length > 0) {
      return {
        title: 'Q INSIGHT',
        text: 'No active loads on board. Market conditions are favorable for booking. Q is ready to find your next profitable lane.',
        sub: 'Recommended action: Activate Q to begin',
        accent: 'var(--accent)',
      }
    }
    if (margin > 0 && margin < 18) {
      const gap = 18 - margin
      return {
        title: 'Q INSIGHT',
        text: `Operating margin at ${margin.toFixed(0)}% — below 18% target. ${fuelCostPerMile > 0 ? `Current fuel cost: $${fuelCostPerMile.toFixed(2)}/mi.` : ''} Negotiate higher rates or reduce deadhead miles.`,
        sub: `Estimated profit increase if target reached: +${fmt$(Math.round(totalRevenue * gap / 100))}/mo`,
        accent: '#f59e0b',
      }
    }
    if (margin >= 30) {
      return {
        title: 'Q INSIGHT',
        text: `Strong performance — ${margin.toFixed(0)}% margin with ${activeLoads.length} load${activeLoads.length !== 1 ? 's' : ''} active. ${avgRPM > 0 ? `Averaging $${avgRPM.toFixed(2)}/mi.` : ''} Q recommends maintaining current lane strategy.`,
        sub: null,
        accent: 'var(--success)',
      }
    }
    if (activeLoads.length > 0) {
      return {
        title: 'Q INSIGHT',
        text: `${activeLoads.length} load${activeLoads.length !== 1 ? 's' : ''} being tracked. Revenue MTD: ${fmt$(totalRevenue)}.${avgRPM > 0 ? ` Current avg: $${avgRPM.toFixed(2)}/mi.` : ''} Q is monitoring for optimization opportunities.`,
        sub: margin > 0 ? `Current margin: ${margin.toFixed(0)}%` : null,
        accent: 'var(--accent)',
      }
    }
    return {
      title: 'Q INSIGHT',
      text: 'Q is monitoring the market and ready to find profitable loads. Activate Q to begin dispatch intelligence.',
      sub: 'Recommended action: Activate Q',
      accent: 'var(--accent)',
    }
  }, [activeLoads, loads, unpaidInvoices, profitMargin, totalRevenue, fuelCostPerMile])

  // Fetch AI dispatch decisions — 15s interval + instant on visibility
  useEffect(() => {
    let cancelled = false
    const fetchAI = async () => {
      try {
        const res = await apiFetch('/api/dispatch-decisions?limit=8')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.decisions) {
          setAiDecisions(data.decisions)
          setLastScanTime(Date.now())
          setFreshPulse(true)
          setTimeout(() => setFreshPulse(false), 800)
        }
      } catch {}
    }
    fetchAI()
    const interval = setInterval(fetchAI, 15000)
    const onVis = () => { if (document.visibilityState === 'visible') fetchAI() }
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Next Best Move — highest confidence + profit recommendation
  const nextBestMove = useMemo(() => {
    const actionable = aiDecisions.filter(d =>
      (d.decision === 'accept' || d.decision === 'auto_book' || d.decision === 'negotiate') && !d.auto_booked
    )
    if (!actionable.length) return null
    actionable.sort((a, b) => {
      const scoreA = (a.confidence || 0) + ((a.metrics?.estProfit || 0) / 100)
      const scoreB = (b.confidence || 0) + ((b.metrics?.estProfit || 0) / 100)
      return scoreB - scoreA
    })
    return actionable[0]
  }, [aiDecisions])

  // Accept a load
  const handleAccept = async (decision) => {
    setAcceptingId(decision.id)
    haptic('success')
    try {
      const res = await apiFetch('/api/auto-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load: decision.load_data,
          decision_id: decision.id,
          driver_type: firstDriver?.driver_type || 'owner_operator',
          metrics: decision.metrics,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        const refresh = await apiFetch('/api/dispatch-decisions?limit=8')
        if (refresh.ok) {
          const rd = await refresh.json()
          if (rd.decisions) setAiDecisions(rd.decisions)
        }
      }
    } catch {}
    setAcceptingId(null)
  }

  // Pass on a load
  const handlePass = async (decision) => {
    setPassingId(decision.id)
    haptic('light')
    try {
      await apiFetch('/api/dispatch-decisions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: decision.id, decision: 'reject', override_reason: 'Driver passed via mobile' }),
      })
      setAiDecisions(prev => prev.filter(d => d.id !== decision.id))
    } catch {}
    setPassingId(null)
  }

  // Q greeting — spoken aloud on app open
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
    const sessionKey = 'qivori_q_spoken'
    if (sessionStorage.getItem(sessionKey)) return
    greetingSpokenRef.current = true
    sessionStorage.setItem(sessionKey, '1')
    const hour = new Date().getHours()
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    const doGreeting = async () => {
      try {
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `[SYSTEM: You are Q, an intelligent dispatch system. Generate a brief operational status update for the driver opening their app. ${timeGreeting}. Reference their data — active loads, revenue, unpaid invoices. Use system language (not friendly assistant language). Example tone: "System online. 2 loads active, $12K MTD revenue. Unpaid invoice needs attention." Keep it under 25 words — this will be spoken out loud.]`,
            }],
            context: buildGreetingContext(),
          }),
        })
        if (!res.ok) return
        const data = await res.json()
        const reply = (data.reply || '').replace(/```action[\s\S]*?```/g, '').replace(/\*\*/g, '').trim()
        if (!reply) return
        setQGreeting(reply)
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
      } catch {}
    }
    doGreeting()
  }, [ctx.dataReady, buildGreetingContext])

  // Active trip — load currently in transit
  const activeTrip = useMemo(() => {
    return activeLoads.find(l => {
      const s = (l.status || '').toLowerCase()
      return s.includes('transit') || s.includes('loaded') || s.includes('dispatched') || s.includes('en route')
    })
  }, [activeLoads])

  // Q-routed quick actions
  const getSmartActions = () => {
    const actions = []
    const hasActiveLoad = activeLoads.length > 0
    const currentLoad = activeLoads[0]
    const status = (currentLoad?.status || '').toLowerCase()

    if (hasActiveLoad && (status.includes('transit') || status.includes('loaded'))) {
      actions.push({ icon: CheckCircle, label: 'Mark Delivered', color: 'var(--success)', action: () => onOpenQ?.('Mark my current load as delivered', qGreeting, false) })
      actions.push({ icon: MapPin, label: 'Check Call', color: 'var(--accent2)', action: () => onOpenQ?.('Submit a check call for my current load', qGreeting, false) })
    } else if (hasActiveLoad && (status.includes('booked') || status.includes('dispatched'))) {
      actions.push({ icon: Truck, label: 'Start Trip', color: 'var(--accent)', action: () => onOpenQ?.('Update my load to In Transit', qGreeting, false) })
    }

    if (!hasActiveLoad) {
      actions.push({ icon: Package, label: 'Ask Q for Load', color: 'var(--accent)', action: () => onOpenQ?.('Find me a good paying load', qGreeting, false) })
    }

    actions.push({ icon: ScanLine, label: 'Scan Rate Con', color: 'var(--accent2)', action: () => onNavigate?.('loads') })
    actions.push({ icon: Camera, label: 'Upload Receipt', color: '#8b5cf6', action: () => onNavigate?.('money', 'expenses') })
    return actions.slice(0, 3)
  }

  const handleQSubmit = () => {
    if (!qInput.trim()) return
    haptic()
    onOpenQ?.(qInput.trim(), qGreeting)
    setQInput('')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── 1. DRIVER STATUS + KEY NUMBERS + Q TOGGLE ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: qAutonomous ? 'var(--accent)' : 'var(--surface)',
          border: qAutonomous ? 'none' : '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: qAutonomous ? 'qGlow 2s ease-in-out infinite' : 'none', flexShrink: 0,
          transition: 'all 0.3s ease',
        }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: qAutonomous ? '#000' : 'var(--muted)', fontWeight: 800, lineHeight: 1 }}>Q</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, color: 'var(--text)' }}>{firstName}</span>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: freshPulse ? 'var(--accent)' : qState.color, animation: freshPulse ? 'qBreath 0.4s ease' : 'qStatusPulse 2s ease-in-out infinite', transition: 'background 0.3s' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--muted)', overflow: 'hidden' }}>
            {qSubtext}
            {gpsLocation && <><span style={{ color: 'var(--border)' }}>·</span><Ic icon={Navigation} size={8} color="var(--accent)" /></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'center', lineHeight: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)' }}>{fmt$(totalRevenue)}</div>
            <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>MTD</div>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <button onClick={toggleAutonomous} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px',
            background: qAutonomous ? 'rgba(240,165,0,0.12)' : 'var(--surface)',
            border: `1px solid ${qAutonomous ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
            borderRadius: 16, cursor: 'pointer', transition: 'all 0.2s ease',
          }}>
            <Ic icon={qAutonomous ? ToggleRight : ToggleLeft} size={16} color={qAutonomous ? 'var(--accent)' : 'var(--muted)'} />
          </button>
        </div>
      </div>

      {/* ── 2. LIVE Q ACTIVITY BAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        transition: 'border-color 0.3s',
        borderColor: freshPulse ? 'var(--accent)' : 'var(--border)',
      }}>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 3, height: qAutonomous ? 10 + i * 3 : 6,
              borderRadius: 2, background: qAutonomous ? 'var(--accent)' : 'var(--muted)',
              animation: qAutonomous ? `voiceWave 0.8s ease-in-out ${i * 0.15}s infinite alternate` : 'none',
              transition: 'height 0.3s, background 0.3s',
            }} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span key={statusIdx} style={{ fontSize: 10, color: qAutonomous ? 'var(--accent)' : 'var(--muted)', fontWeight: 600, animation: 'fadeInUp 0.25s ease', display: 'inline-block' }}>
            {STATUS_LINES[statusIdx]}
          </span>
        </div>
        {scanAgo && (
          <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{scanAgo}</span>
        )}
      </div>

      {/* ── Q BRIEFING (spoken greeting) ── */}
      {qGreeting && (
        <div style={{
          fontSize: 12, color: 'var(--text)', padding: '10px 14px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '4px 14px 14px 14px', borderLeft: '3px solid var(--accent)',
          lineHeight: 1.5, animation: 'qInsightSlide 0.4s ease',
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: 'var(--accent)', marginBottom: 4 }}>Q BRIEFING</div>
          <span style={{ opacity: 0.9 }}>{qGreeting}</span>
        </div>
      )}

      {/* ── 3. Q DECISION — HERO CARD (dominant) ── */}
      {nextBestMove && (() => {
        const d = nextBestMove
        const load = d.load_data || {}
        const metrics = d.metrics || {}
        const profit = metrics.estProfit || 0
        const rpm = load.miles > 0 ? (parseFloat(load.gross || 0) / load.miles).toFixed(2) : '—'
        const origin = (load.origin || '—').split(',')[0]
        const dest = (load.dest || load.destination || '—').split(',')[0]
        const isNegotiate = d.decision === 'negotiate'
        const decisionLabel = isNegotiate ? 'NEGOTIATE' : 'ACCEPT'
        const decisionColor = isNegotiate ? 'var(--accent)' : '#22c55e'
        return (
          <div style={{
            background: `linear-gradient(145deg, ${isNegotiate ? 'rgba(240,165,0,0.08)' : 'rgba(34,197,94,0.08)'} 0%, rgba(240,165,0,0.02) 100%)`,
            border: `1px solid ${decisionColor}40`, borderRadius: 14,
            overflow: 'hidden', animation: 'fadeInUp 0.4s ease 0.1s both',
            boxShadow: `0 4px 24px ${decisionColor}15, 0 1px 3px rgba(0,0,0,0.2)`,
          }}>
            {/* Q Decision Header */}
            <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: decisionColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: `0 0 12px ${decisionColor}40`,
              }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: decisionColor }}>Q DECISION: {decisionLabel}</span>
              </div>
              <div style={{ padding: '3px 8px', borderRadius: 10, background: `${decisionColor}18`, border: `1px solid ${decisionColor}30` }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: decisionColor, fontFamily: "'JetBrains Mono',monospace" }}>{d.confidence || 0}%</span>
              </div>
            </div>

            {/* Route — large and dominant */}
            <div style={{ padding: '10px 14px 4px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5, color: 'var(--text)', lineHeight: 1.2 }}>
                {origin} <ArrowRight size={15} style={{ verticalAlign: 'middle', color: 'var(--muted)', opacity: 0.6 }} /> {dest}
              </div>
            </div>

            {/* Metrics row */}
            <div style={{ padding: '4px 14px 14px', display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: decisionColor, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>
                +{fmt$(profit)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>est. profit</span>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: "'JetBrains Mono',monospace" }}>{fmt$(parseFloat(load.gross || 0))}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>{load.miles || '—'} mi · ${rpm}/mi</div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', borderTop: `1px solid ${decisionColor}20` }}>
              <button onClick={() => { haptic('success'); handleAccept(d) }} disabled={!!acceptingId}
                style={{
                  flex: 1, padding: '16px', background: acceptingId === d.id ? `${decisionColor}20` : decisionColor,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: "'DM Sans',sans-serif", borderBottomLeftRadius: 14,
                  transition: 'background 0.15s ease',
                }}>
                <Ic icon={CheckCircle} size={16} color={acceptingId === d.id ? decisionColor : '#000'} />
                <span style={{ fontSize: 14, fontWeight: 800, color: acceptingId === d.id ? decisionColor : '#000', letterSpacing: 0.5 }}>
                  {acceptingId === d.id ? 'SECURING...' : isNegotiate ? 'NEGOTIATE RATE' : 'SECURE LOAD'}
                </span>
              </button>
              <button onClick={() => { haptic(); handlePass(d) }} disabled={!!passingId}
                style={{
                  flex: 0, width: 72, padding: '16px 0', background: 'transparent',
                  border: 'none', borderLeft: `1px solid ${decisionColor}20`, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'DM Sans',sans-serif", borderBottomRightRadius: 14,
                }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>PASS</span>
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Q SCANNING STATE (when no recommendation) ── */}
      {!nextBestMove && (
        <div style={{
          background: 'linear-gradient(145deg, rgba(240,165,0,0.06) 0%, rgba(240,165,0,0.02) 100%)',
          border: '1px solid rgba(240,165,0,0.15)', borderRadius: 14,
          padding: '16px 14px', animation: 'fadeInUp 0.3s ease 0.1s both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              animation: 'qBreath 2.5s ease-in-out infinite',
              boxShadow: '0 0 16px rgba(240,165,0,0.2)',
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: 'var(--accent)', marginBottom: 2 }}>Q IS ANALYZING</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>Scanning load boards for profitable opportunities</div>
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', animation: `qDotPulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── START SHIFT / PRE-TRIP ── */}
      {!shiftActive ? (
        <button onClick={() => {
          haptic('medium')
          // Load FMCSA checklist
          setPreTripItems([
            { id:'brakes', cat:'Tractor', item:'Service Brakes', critical:true, status:null },
            { id:'parking_brake', cat:'Tractor', item:'Parking Brake', critical:true, status:null },
            { id:'steering', cat:'Tractor', item:'Steering', critical:true, status:null },
            { id:'horn', cat:'Tractor', item:'Horn', critical:false, status:null },
            { id:'wipers', cat:'Tractor', item:'Wipers', critical:false, status:null },
            { id:'mirrors', cat:'Tractor', item:'Mirrors', critical:false, status:null },
            { id:'headlights', cat:'Tractor', item:'Headlights', critical:true, status:null },
            { id:'tail_lights', cat:'Tractor', item:'Tail/Stop Lights', critical:true, status:null },
            { id:'turn_signals', cat:'Tractor', item:'Turn Signals', critical:true, status:null },
            { id:'tires_front', cat:'Tractor', item:'Front Tires', critical:true, status:null },
            { id:'tires_rear', cat:'Tractor', item:'Rear Tires', critical:true, status:null },
            { id:'wheels', cat:'Tractor', item:'Wheels & Lug Nuts', critical:true, status:null },
            { id:'fuel_system', cat:'Tractor', item:'Fuel System', critical:true, status:null },
            { id:'air_lines', cat:'Tractor', item:'Air Lines', critical:true, status:null },
            { id:'suspension', cat:'Tractor', item:'Suspension', critical:true, status:null },
            { id:'fire_ext', cat:'Safety', item:'Fire Extinguisher', critical:true, status:null },
            { id:'triangles', cat:'Safety', item:'Warning Triangles', critical:true, status:null },
            { id:'seat_belt', cat:'Safety', item:'Seat Belt', critical:true, status:null },
            { id:'trailer_brakes', cat:'Trailer', item:'Trailer Brakes', critical:true, status:null },
            { id:'trailer_tires', cat:'Trailer', item:'Trailer Tires', critical:true, status:null },
            { id:'trailer_lights', cat:'Trailer', item:'Trailer Lights', critical:true, status:null },
            { id:'coupling', cat:'Trailer', item:'Coupling (5th Wheel)', critical:true, status:null },
            { id:'trailer_doors', cat:'Trailer', item:'Doors & Hinges', critical:false, status:null },
            { id:'mud_flaps', cat:'Trailer', item:'Mud Flaps', critical:false, status:null },
          ])
          setShowPreTrip(true)
        }}
          style={{
            width:'100%', padding:'16px 20px', borderRadius:12, border:'2px solid var(--accent)',
            background:'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(240,165,0,0.02))',
            color:'var(--accent)', fontSize:16, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif",
            letterSpacing:2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
          }}>
          <Zap size={20} /> START SHIFT
        </button>
      ) : (
        <div style={{
          padding:'12px 16px', borderRadius:10, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--success)', animation:'qStatusPulse 2s ease-in-out infinite' }} />
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}>ON DUTY — SHIFT ACTIVE</div>
              <div style={{ fontSize:9, color:'var(--muted)' }}>Pre-trip passed · HOS tracking</div>
            </div>
          </div>
          <button onClick={() => { setShiftActive(false); localStorage.removeItem('q_shift_active'); haptic('light') }}
            style={{ padding:'6px 12px', borderRadius:6, border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', color:'var(--danger)', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            End Shift
          </button>
        </div>
      )}

      {/* ── PRE-TRIP INSPECTION OVERLAY ── */}
      {showPreTrip && preTripItems && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, bottom:60, zIndex:999, background:'var(--bg)',
          display:'flex', flexDirection:'column', overflowY:'auto',
        }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)' }}>PRE-TRIP INSPECTION</div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>FMCSA §396.11 — Tap each item: Pass or Defect</div>
            </div>
            <button onClick={() => setShowPreTrip(false)} style={{ width:36, height:36, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>X</button>
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
            {['Tractor', 'Safety', 'Trailer'].map(cat => (
              <div key={cat} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:1, marginBottom:8, textTransform:'uppercase' }}>{cat}</div>
                {preTripItems.filter(i => i.cat === cat).map(item => (
                  <div key={item.id} style={{
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'12px 14px', marginBottom:6, borderRadius:10,
                    background: item.status === 'pass' ? 'rgba(34,197,94,0.06)' : item.status === 'defect' ? 'rgba(239,68,68,0.06)' : 'var(--surface)',
                    border: `1px solid ${item.status === 'pass' ? 'rgba(34,197,94,0.2)' : item.status === 'defect' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                  }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{item.item}</div>
                      {item.critical && <div style={{ fontSize:9, color:'var(--danger)', fontWeight:700 }}>CRITICAL</div>}
                      {item.photoResult && (
                        <div style={{ fontSize:9, color: item.photoResult.status === 'pass' ? 'var(--success)' : 'var(--danger)', fontWeight:700, marginTop:2 }}>
                          Q: {item.photoResult.summary || item.photoResult.status}
                        </div>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <button onClick={() => { haptic('light'); setPreTripItems(items => items.map(i => i.id === item.id ? { ...i, status:'pass' } : i)) }}
                        style={{
                          padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                          background: item.status === 'pass' ? 'var(--success)' : 'var(--surface2)', color: item.status === 'pass' ? '#fff' : 'var(--muted)',
                          fontFamily:"'DM Sans',sans-serif",
                        }}>Pass</button>
                      <button onClick={() => { haptic('warning'); setPreTripItems(items => items.map(i => i.id === item.id ? { ...i, status:'defect' } : i)) }}
                        style={{
                          padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                          background: item.status === 'defect' ? 'var(--danger)' : 'var(--surface2)', color: item.status === 'defect' ? '#fff' : 'var(--muted)',
                          fontFamily:"'DM Sans',sans-serif",
                        }}>Defect</button>
                      <button onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.capture = 'environment'
                        input.onchange = async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          haptic('medium')
                          setPreTripItems(items => items.map(i => i.id === item.id ? { ...i, photoResult: { status: 'analyzing', summary: 'Q is analyzing...' } } : i))
                          try {
                            const { uploadFile: upFn } = await import('../../lib/storage')
                            const uploaded = await upFn(file, `dvir/${item.id}-${Date.now()}`)
                            const res = await apiFetch('/api/inspect-photo', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ image_url: uploaded.url, component: item.id }),
                            })
                            if (res.ok) {
                              const data = await res.json()
                              setPreTripItems(items => items.map(i => i.id === item.id ? {
                                ...i,
                                status: data.out_of_service ? 'defect' : data.status === 'pass' ? 'pass' : i.status || 'defect',
                                photoResult: data,
                              } : i))
                              haptic(data.status === 'pass' ? 'success' : 'error')
                            }
                          } catch {
                            setPreTripItems(items => items.map(i => i.id === item.id ? { ...i, photoResult: { status: 'error', summary: 'Photo upload failed' } } : i))
                          }
                        }
                        input.click()
                      }}
                        style={{
                          padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', cursor:'pointer',
                          background: item.photoResult ? 'rgba(240,165,0,0.1)' : 'var(--surface2)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                        <Camera size={16} color={item.photoResult ? 'var(--accent)' : 'var(--muted)'} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Submit */}
          <div style={{ padding:'12px 16px 80px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
            {(() => {
              const total = preTripItems.length
              const completed = preTripItems.filter(i => i.status).length
              const defects = preTripItems.filter(i => i.status === 'defect')
              const criticalDefects = defects.filter(i => i.critical)
              return (
                <>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8, textAlign:'center' }}>
                    {completed}/{total} inspected · {defects.length} defect{defects.length !== 1 ? 's' : ''}
                    {criticalDefects.length > 0 && <span style={{ color:'var(--danger)', fontWeight:700 }}> · {criticalDefects.length} CRITICAL</span>}
                  </div>
                  <button disabled={completed < total || preTripSubmitting}
                    onClick={async () => {
                      setPreTripSubmitting(true)
                      try {
                        const res = await apiFetch('/api/pre-trip', {
                          method:'POST',
                          headers:{ 'Content-Type':'application/json' },
                          body: JSON.stringify({
                            items: preTripItems.map(i => ({ id:i.id, item:i.item, status:i.status })),
                            driver_name: profile?.full_name || firstName,
                          }),
                        })
                        const data = await res.json()
                        if (data.dispatch_ok !== false) {
                          setShiftActive(true)
                          localStorage.setItem('q_shift_active', 'true')
                          setShowPreTrip(false)
                          haptic('success')
                        } else {
                          haptic('error')
                          alert(`CRITICAL DEFECT — DO NOT DISPATCH\n\n${data.message}`)
                        }
                      } catch {
                        setShiftActive(true)
                        localStorage.setItem('q_shift_active', 'true')
                        setShowPreTrip(false)
                      }
                      setPreTripSubmitting(false)
                    }}
                    style={{
                      width:'100%', padding:'14px 0', borderRadius:12, border:'none', cursor: completed < total ? 'default' : 'pointer',
                      background: completed < total ? 'var(--surface2)' : criticalDefects.length > 0 ? 'var(--danger)' : 'var(--success)',
                      color: completed < total ? 'var(--muted)' : '#fff',
                      fontSize:15, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2,
                    }}>
                    {preTripSubmitting ? 'Submitting...' : completed < total ? `${total - completed} ITEMS REMAINING` : criticalDefects.length > 0 ? `SUBMIT — ${criticalDefects.length} CRITICAL DEFECT${criticalDefects.length > 1 ? 'S' : ''}` : 'SUBMIT — ALL CLEAR'}
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Q INSIGHT CARD ── */}
      <QInsightCard
        title={qInsight.title}
        insight={qInsight.text}
        subtext={qInsight.sub}
        accent={qInsight.accent}
      />

      {/* ── ACTIVATE Q CTA ── */}
      <button onClick={() => onOpenQ?.(null, qGreeting, true)}
        style={{
          width: '100%', padding: '14px 16px',
          background: 'linear-gradient(135deg, var(--accent) 0%, #e6960a 100%)',
          border: 'none', borderRadius: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 4px 24px rgba(240,165,0,0.3)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          animation: 'fadeInUp 0.4s ease 0.05s both',
        }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          animation: 'qBreath 3s ease-in-out infinite',
        }}>
          <Ic icon={Zap} size={20} color="#000" />
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#000', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5 }}>ACTIVATE Q</div>
          <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.6)', fontWeight: 500 }}>Voice control · Live intelligence</div>
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ width: 3, borderRadius: 2, background: 'rgba(0,0,0,0.25)', animation: `voiceWave 0.6s ease-in-out ${i * 0.12}s infinite alternate` }} />
          ))}
        </div>
      </button>

      {/* ── COMMAND Q INPUT ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 28, padding: '6px 6px 6px 16px',
      }}>
        <input
          value={qInput}
          onChange={e => setQInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleQSubmit()}
          placeholder="Command Q..."
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif",
          }}
        />
        {qInput.trim() && (
          <button onClick={handleQSubmit}
            style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={Send} size={14} color="#000" />
          </button>
        )}
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{ display: 'flex', gap: 8, animation: 'fadeInUp 0.4s ease 0.1s both' }}>
        {getSmartActions().map((action, i) => (
          <button key={i} onClick={() => { haptic(); action.action() }}
            style={{
              flex: 1, padding: '10px 8px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s ease',
            }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${action.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={action.icon} size={14} color={action.color} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>{action.label}</span>
          </button>
        ))}
      </div>

      {/* ── METRICS ── */}
      <div style={{ animation: 'fadeInUp 0.4s ease 0.15s both' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <QMetricCard icon={DollarSign} label="Q Revenue" value={fmt$(totalRevenue)} color="var(--accent)" />
          <QMetricCard
            icon={TrendingUp} label="Q Profit" value={fmt$(netProfit)}
            color={netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}
            sub={`${profitMargin.toFixed(0)}% margin`}
            target={`Target: ${marginTarget}%`}
            targetReached={marginReached}
          />
          <QMetricCard icon={Package} label="Active Loads" value={activeLoads.length} color="var(--accent2)" onClick={() => onNavigate?.('loads')} />
          <QMetricCard
            icon={FileText} label="Unpaid" value={unpaidInvoices.length}
            color={unpaidInvoices.length > 0 ? 'var(--danger)' : 'var(--success)'}
            sub={unpaidInvoices.length > 0 ? fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)) : 'All clear'}
            onClick={() => onNavigate?.('money')}
          />
        </div>
      </div>

      {/* ── ACTIVE LOADS — Q TRACKED ── */}
      {activeLoads.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.4s ease 0.2s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'qStatusPulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2 }}>Q TRACKED LOADS</span>
          </div>
          {activeLoads.slice(0, 3).map((load, index) => {
            const isExpanded = expandedLoad === (load.id || load.load_id)
            return (
              <div key={load.id || load.load_id} style={{ marginBottom: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', animation: `qInsightSlide 0.4s ease ${0.2 + index * 0.06}s both` }}>
                <div
                  onClick={() => { haptic(); setExpandedLoad(isExpanded ? null : (load.id || load.load_id)) }}
                  style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic icon={Truck} size={14} color="var(--accent)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {load.origin || '?'} → {load.destination || load.dest || '?'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: statusColor(load.status), fontWeight: 700 }}>{load.status}</span>
                      <span>·</span>
                      <span>{fmt$(load.gross || load.rate)}</span>
                      {load.miles > 0 && <><span>·</span><span>{load.miles} mi</span></>}
                    </div>
                  </div>
                  <ChevronRight size={14} color="var(--muted)" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)', animation: 'fadeInUp 0.2s ease' }}>
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
                    <button onClick={(e) => { e.stopPropagation(); haptic(); onOpenQ?.(`Give me a status update on load ${load.load_id || load.id}`, qGreeting) }}
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

      {/* ── Q PROACTIVE ALERTS ── */}
      {unpaidInvoices.length > 0 && (
        <div onClick={() => onNavigate?.('money')} style={{
          padding: '12px 14px', background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          animation: 'fadeInUp 0.4s ease 0.25s both, qAlertGlow 3s ease-in-out infinite',
        }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: 'var(--danger)', fontWeight: 800, lineHeight: 1 }}>Q</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', letterSpacing: 1, marginBottom: 2 }}>Q ALERT</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length > 1 ? 's' : ''} — {fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0))} outstanding
            </div>
          </div>
          <ArrowUpRight size={14} color="var(--danger)" />
        </div>
      )}

      {/* ── Q AI DISPATCH FEED ── */}
      {aiDecisions.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.4s ease 0.25s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ic icon={Zap} size={10} color="#6366f1" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: 2 }}>Q AI DECISIONS</span>
            <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>Last {aiDecisions.length}</span>
          </div>
          {aiDecisions.slice(0, 4).map((d, i) => {
            const load = d.load_data || {}
            const isAutoBook = d.decision === 'auto_book'
            const isAccept = d.decision === 'accept'
            const isReject = d.decision === 'reject'
            const isNeg = d.decision === 'negotiate'
            const color = isAutoBook ? '#6366f1' : isAccept ? '#22c55e' : isReject ? '#ef4444' : '#f0a500'
            const label = isAutoBook ? 'AUTO-BOOKED' : isAccept ? 'ACCEPT' : isReject ? 'REJECT' : 'NEGOTIATE'
            return (
              <div key={d.id || i} style={{
                marginBottom: 6, padding: '10px 12px', background: 'var(--surface)',
                border: `1px solid ${color}20`, borderLeft: `3px solid ${color}`,
                borderRadius: '4px 10px 10px 4px',
                animation: `fadeInUp 0.3s ease ${0.25 + i * 0.05}s both`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color, background: `${color}15`, padding: '2px 6px', borderRadius: 4 }}>{label}</span>
                  <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>{d.confidence || 0}%</span>
                  {d.auto_booked && <span style={{ fontSize: 8, color: '#6366f1', fontWeight: 700 }}>BOOKED</span>}
                  <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>{new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {load.origin || '—'} → {load.dest || load.destination || '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                  <span style={{ fontWeight: 700, color }}>{fmt$(parseFloat(load.gross || 0))}</span>
                  {load.miles && <span>{load.miles} mi</span>}
                  {load.broker && <span>{load.broker}</span>}
                  {d.metrics?.estProfit && <span style={{ color: '#22c55e' }}>+{fmt$(d.metrics.estProfit)}</span>}
                </div>
                {(d.reasons || []).length > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                    {d.reasons[0]}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── RECENT ACTIVITY ── */}
      {recentLoads.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.4s ease 0.3s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ic icon={Activity} size={10} color="var(--accent)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2 }}>Q ACTIVITY LOG</span>
          </div>
          {recentLoads.map((load, index) => (
            <div key={load.id || load.load_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', animation: `fadeInUp 0.3s ease ${0.3 + index * 0.03}s both` }}>
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

// Q-driven metric card
function QMetricCard({ icon, label, value, color, sub, target, targetReached, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '12px', cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ic icon={icon} size={12} color={color} />
        <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      {target && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: targetReached ? 'var(--success)' : 'var(--danger)' }} />
          <span style={{ fontSize: 8, color: targetReached ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            {target} · {targetReached ? 'Reached' : 'Not reached'}
          </span>
        </div>
      )}
    </div>
  )
}
