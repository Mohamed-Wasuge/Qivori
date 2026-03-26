import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Truck, ChevronRight, CheckCircle, MapPin,
  Camera, ScanLine, Zap, XCircle,
  ToggleLeft, ToggleRight, Navigation, ArrowRight
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor, getQSystemState } from './shared'
import { apiFetch } from '../../lib/api'

export default function MobileHomeTab({ onNavigate, onOpenQ }) {
  const ctx = useCarrier() || {}
  const { user, profile } = useApp()
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const drivers = ctx.drivers || []
  const totalRevenue = ctx.totalRevenue || 0

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

  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]
  const qState = getQSystemState(ctx)
  const firstDriver = drivers[0]

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
    // Instant refresh when app regains focus
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
    // Sort by confidence + estimated profit descending
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
        // Refresh decisions
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

  // Q greeting — audio only, no text clutter
  const buildGreetingContext = useCallback(() => {
    const active = loads.filter(l => !['Delivered', 'Invoiced', 'Paid'].includes(l.status))
    return [
      `DRIVER: ${profile?.full_name || user?.user_metadata?.full_name || 'Driver'}`,
      `Revenue MTD: $${totalRevenue.toLocaleString()}`,
      `Active loads: ${active.length}`,
    ].join('\n')
  }, [loads, totalRevenue, profile, user])

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
            messages: [{ role: 'user', content: `[SYSTEM: You are Q. Brief operational status. ${timeGreeting}. Under 15 words. Spoken aloud.]` }],
            context: buildGreetingContext(),
          }),
        })
        if (!res.ok) return
        const data = await res.json()
        const reply = (data.reply || '').replace(/```action[\s\S]*?```/g, '').replace(/\*\*/g, '').trim()
        if (!reply) return
        const ttsRes = await apiFetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: reply }) })
        if (ttsRes.ok && ttsRes.status !== 204) {
          const blob = await ttsRes.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audio.onended = () => URL.revokeObjectURL(url)
          audio.onerror = () => URL.revokeObjectURL(url)
          try { await audio.play() } catch {
            pendingAudioRef.current = { url, audio }
            const playOnTap = () => { pendingAudioRef.current?.audio?.play().catch(() => {}); pendingAudioRef.current = null; document.removeEventListener('touchstart', playOnTap); document.removeEventListener('click', playOnTap) }
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

  // Quick actions based on current state
  const getSmartActions = () => {
    const actions = []
    if (activeTrip) {
      const s = (activeTrip.status || '').toLowerCase()
      if (s.includes('transit') || s.includes('loaded')) {
        actions.push({ icon: CheckCircle, label: 'Mark Delivered', color: 'var(--success)', action: () => onOpenQ?.('Mark my current load as delivered', null, false) })
        actions.push({ icon: MapPin, label: 'Check Call', color: 'var(--accent2)', action: () => onOpenQ?.('Submit a check call for my current load', null, false) })
      } else {
        actions.push({ icon: Truck, label: 'Start Trip', color: 'var(--accent)', action: () => onOpenQ?.('Update my load to In Transit', null, false) })
      }
    }
    actions.push({ icon: ScanLine, label: 'Scan Rate Con', color: 'var(--accent2)', action: () => onNavigate?.('loads') })
    actions.push({ icon: Camera, label: 'Upload Receipt', color: '#8b5cf6', action: () => onNavigate?.('money', 'expenses') })
    return actions.slice(0, 3)
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
            {firstDriver?.equipment_experience && <span style={{ whiteSpace: 'nowrap' }}>{firstDriver.equipment_experience.split(',')[0]}</span>}
            {firstDriver?.license_class && <><span style={{ color: 'var(--border)' }}>·</span><span>{firstDriver.license_class}</span></>}
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

      {/* ── 3. Q RECOMMENDS — HERO CARD (dominant) ── */}
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
            background: 'linear-gradient(145deg, rgba(34,197,94,0.08) 0%, rgba(240,165,0,0.04) 100%)',
            border: '1px solid rgba(34,197,94,0.3)', borderRadius: 14,
            overflow: 'hidden', animation: 'fadeInUp 0.4s ease 0.1s both',
            boxShadow: '0 4px 24px rgba(34,197,94,0.1), 0 1px 3px rgba(0,0,0,0.2)',
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

      {/* ── 4. ACTIVE TRIP (secondary — quieter) ── */}
      {activeTrip && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          overflow: 'hidden', animation: 'fadeInUp 0.3s ease 0.15s both', opacity: 0.85,
        }}>
          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7, background: 'rgba(240,165,0,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Ic icon={Truck} size={14} color="var(--muted)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)' }}>ACTIVE TRIP</span>
                <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: `${statusColor(activeTrip.status)}10`, color: statusColor(activeTrip.status), fontWeight: 600 }}>{activeTrip.status}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                {activeTrip.origin || '?'} → {activeTrip.destination || activeTrip.dest || '?'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--muted)', display: 'flex', gap: 6, marginTop: 1 }}>
                <span style={{ fontWeight: 600 }}>{fmt$(activeTrip.gross || activeTrip.rate)}</span>
                {activeTrip.miles > 0 && <span>{activeTrip.miles} mi</span>}
                <span>{activeTrip.broker_name || activeTrip.broker || ''}</span>
              </div>
            </div>
            <ChevronRight size={12} color="var(--muted)" onClick={() => onNavigate?.('loads')} style={{ cursor: 'pointer', opacity: 0.5 }} />
          </div>
        </div>
      )}

      {/* ── 5. QUICK ACTIONS (secondary — subtle pills) ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', opacity: 0.7 }}>
        {getSmartActions().map((action, i) => (
          <button key={i} onClick={() => { haptic(); action.action() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 16,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s ease',
            }}>
            <Ic icon={action.icon} size={12} color="var(--muted)" />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>{action.label}</span>
          </button>
        ))}
      </div>

      <div style={{ height: 60 }} />
    </div>
  )
}
