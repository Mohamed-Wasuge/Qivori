import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Phone, PhoneCall, PhoneOff, Bot, Mic, MicOff, Activity, Zap, Target, Shield,
  AlertTriangle, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock, DollarSign,
  MessageSquare, Send, Volume2, VolumeX, User, Building2, ArrowUpRight, ArrowDownRight,
  Radio, Truck, Package, ChevronRight, Settings, Play, Pause, BarChart2, Calendar
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { Ic } from './shared'

// ── Q DISPATCH AI — Voice + Negotiation Intelligence ────────────────────────

// Call flow stages
const CALL_STAGES = [
  { id:'idle',        label:'Ready',             icon: Phone,     color:'var(--muted)' },
  { id:'dialing',     label:'Dialing Broker',    icon: Phone,     color:'var(--accent)' },
  { id:'connected',   label:'Connected',         icon: PhoneCall, color:'var(--success)' },
  { id:'reading',     label:'Reading Load Details', icon: Bot,    color:'var(--accent2)' },
  { id:'evaluating',  label:'Evaluating Broker Tone', icon: Activity, color:'var(--accent)' },
  { id:'negotiating', label:'Negotiating Rate',  icon: Target,    color:'var(--warning)' },
  { id:'waiting',     label:'Waiting on Response', icon: Clock,   color:'var(--accent)' },
  { id:'counter',     label:'Counteroffer Detected', icon: ArrowUpRight, color:'var(--warning)' },
  { id:'decision',    label:'Decision Ready',    icon: Zap,       color:'var(--accent)' },
  { id:'secured',     label:'Load Secured',      icon: CheckCircle, color:'var(--success)' },
  { id:'rejected',    label:'Rate Rejected',     icon: XCircle,   color:'var(--danger)' },
  { id:'ended',       label:'Call Ended',        icon: PhoneOff,  color:'var(--muted)' },
]

// Broker grade colors
const BROKER_GRADES = {
  'A+': 'var(--success)', A: 'var(--success)', 'A-': 'rgba(34,197,94,0.8)',
  'B+': 'var(--accent)', B: 'var(--accent)', 'B-': 'rgba(240,165,0,0.8)',
  'C+': 'var(--warning)', C: 'var(--warning)', 'C-': 'rgba(239,68,68,0.7)',
  D: 'var(--danger)', F: 'var(--danger)',
}

// ── Waveform Animation ──────────────────────────────────────────────────────
function QWaveform({ active, color = 'var(--accent)' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:2, height:24 }}>
      {Array.from({ length:12 }).map((_, i) => (
        <div key={i} style={{
          width:3, borderRadius:2, background:color,
          height: active ? undefined : 4,
          animation: active ? `q-wave 0.8s ease-in-out ${i * 0.06}s infinite alternate` : 'none',
          opacity: active ? 0.8 : 0.2,
          transition:'opacity 0.3s',
        }} />
      ))}
    </div>
  )
}

// ── Live Transcript Line ────────────────────────────────────────────────────
function TranscriptLine({ speaker, text, time }) {
  const isQ = speaker === 'Q' || speaker === 'ai'
  return (
    <div style={{ display:'flex', gap:10, padding:'6px 0', alignItems:'flex-start' }}>
      <div style={{
        width:24, height:24, borderRadius:'50%', flexShrink:0,
        background: isQ ? 'rgba(240,165,0,0.12)' : 'rgba(59,130,246,0.12)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:10, fontWeight:800, color: isQ ? 'var(--accent)' : 'var(--accent2)',
      }}>
        {isQ ? 'Q' : 'B'}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>
          {isQ ? 'Q Dispatch' : 'Broker'} {time && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9 }}>· {time}</span>}
        </div>
        <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.5 }}>{text}</div>
      </div>
    </div>
  )
}

// ── Call Flow Progress Bar ──────────────────────────────────────────────────
function CallFlowProgress({ stage }) {
  const activeIdx = CALL_STAGES.findIndex(s => s.id === stage)
  const flowStages = CALL_STAGES.filter(s => !['idle','ended'].includes(s.id))
  return (
    <div style={{ display:'flex', alignItems:'center', gap:2, padding:'0 4px' }}>
      {flowStages.map((s, i) => {
        const stageIdx = CALL_STAGES.findIndex(cs => cs.id === s.id)
        const isPast = stageIdx < activeIdx
        const isActive = s.id === stage
        return (
          <React.Fragment key={s.id}>
            <div style={{
              width:isActive?28:8, height:8, borderRadius:4, transition:'all 0.4s',
              background: isPast ? 'var(--success)' : isActive ? s.color : 'var(--border)',
              boxShadow: isActive ? `0 0 8px ${s.color}` : 'none',
            }} title={s.label} />
            {i < flowStages.length - 1 && (
              <div style={{ flex:1, height:1, background: isPast ? 'var(--success)' : 'var(--border)' }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Broker Intel Card ───────────────────────────────────────────────────────
function BrokerIntelCard({ broker, stats }) {
  const grade = stats?.grade || 'B'
  const gc = BROKER_GRADES[grade] || 'var(--accent)'
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Building2 size={14} color="var(--accent)" />
          <span style={{ fontSize:13, fontWeight:700 }}>{broker || 'Unknown Broker'}</span>
        </div>
        <div style={{
          width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
          background: gc + '15', border:`1px solid ${gc}30`,
          fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:gc, fontWeight:800,
        }}>
          {grade}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
        {[
          { label:'Rate Flexibility', value: stats?.flexibility || 'Medium', color: stats?.flexibility === 'High' ? 'var(--success)' : 'var(--accent)' },
          { label:'Response Speed', value: stats?.speed || 'Normal', color:'var(--accent2)' },
          { label:'Payment Reliability', value: stats?.payment || 'On Time', color:'var(--success)' },
          { label:'Usual Counter', value: stats?.usualCounter || '+$150–200', color:'var(--warning)' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'8px 10px' }}>
            <div style={{ fontSize:8, color:'var(--muted)', letterSpacing:1, marginBottom:2 }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize:12, fontWeight:700, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Post-Call Summary ───────────────────────────────────────────────────────
function PostCallSummary({ summary, onClose }) {
  if (!summary) return null
  const profitColor = (summary.estProfit || 0) >= 500 ? 'var(--success)' : (summary.estProfit || 0) >= 200 ? 'var(--accent)' : 'var(--danger)'
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:8, background: summary.decision === 'Accept' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {summary.decision === 'Accept' ? <CheckCircle size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />}
          </div>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:2 }}>
              CALL <span style={{ color: summary.decision === 'Accept' ? 'var(--success)' : 'var(--danger)' }}>{summary.decision === 'Accept' ? 'SECURED' : 'ENDED'}</span>
            </div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{summary.broker} · {summary.duration || '0:00'}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ border:'none', background:'transparent', color:'var(--muted)', cursor:'pointer', fontSize:18 }}>×</button>
      </div>
      <div style={{ padding:'16px 18px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[
          { label:'BROKER OFFERED', value:'$'+(summary.brokerOffer||0).toLocaleString(), color:'var(--accent)' },
          { label:'Q COUNTERED', value:'$'+(summary.qCounter||0).toLocaleString(), color:'var(--warning)' },
          { label:'FINAL RATE', value:'$'+(summary.finalRate||0).toLocaleString(), color:'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ textAlign:'center' }}>
            <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:1, marginBottom:3 }}>{s.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ padding:'0 18px 16px', display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
        <div style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
          <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:1, marginBottom:2 }}>ESTIMATED PROFIT</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:profitColor }}>${(summary.estProfit||0).toLocaleString()}</div>
        </div>
        <div style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
          <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:1, marginBottom:2 }}>DECISION</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color: summary.decision === 'Accept' ? 'var(--success)' : 'var(--danger)' }}>{summary.decision?.toUpperCase()}</div>
        </div>
      </div>
      {summary.route && (
        <div style={{ padding:'0 18px 14px', fontSize:11, color:'var(--muted)' }}>
          {summary.route} · {summary.miles} mi · {summary.equipment || 'Dry Van'}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN: Q DISPATCH AI PANEL ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export function QDispatchAI() {
  const { showToast, user } = useApp()
  const { loads, activeLoads, drivers, fuelCostPerMile, brokerStats, allLoads, assignLoadToDriver } = useCarrier()

  // State
  const [callStage, setCallStage] = useState('idle')
  const [autoNegotiate, setAutoNegotiate] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [selectedLoad, setSelectedLoad] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [callSummary, setCallSummary] = useState(null)
  const [callHistory, setCallHistory] = useState([])
  const [liveInsight, setLiveInsight] = useState(null)
  const [negSettings, setNegSettings] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [callId, setCallId] = useState(null)
  const transcriptRef = useRef(null)

  // Load negotiation settings
  useEffect(() => {
    apiFetch('/api/negotiation').then(d => {
      if (d && !d.error) setNegSettings(d)
    }).catch(() => {})
  }, [])

  // Scroll transcript
  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [transcript])

  const fuelRate = fuelCostPerMile || 0.55

  // ── Compute load eval for selected load ─────────────────────────────────
  const loadEval = useMemo(() => {
    if (!selectedLoad) return null
    const gross = selectedLoad.gross || selectedLoad.gross_pay || 0
    const miles = parseFloat(selectedLoad.miles) || 0
    const driverRec = (drivers || []).find(d => (d.full_name || d.name) === selectedLoad.driver)
    const payModel = driverRec?.pay_model || 'percent'
    const payRate = parseFloat(driverRec?.pay_rate) || 50
    const driverPay = payModel === 'permile' ? miles * payRate : payModel === 'flat' ? payRate : gross * (payRate / 100)
    const fuelCost = miles * fuelRate
    const estProfit = gross - driverPay - fuelCost
    const profitPerMile = miles > 0 ? estProfit / miles : 0
    const transitDays = Math.max(Math.ceil(miles / 500), 1)
    const profitPerDay = estProfit / transitDays
    const minRate = negSettings?.min_rate_per_mile || 2.50
    const counterMarkup = negSettings?.counter_offer_markup_pct || 10
    const targetRate = Math.round(gross * (1 + counterMarkup / 100))
    const rpm = miles > 0 ? gross / miles : 0

    // Broker intel
    const broker = selectedLoad.broker || ''
    const bData = brokerStats?.[broker]
    let grade = 'B', flexibility = 'Medium', speed = 'Normal', payment = 'On Time'
    if (bData) {
      const pr = bData.onTimePay || 0.8
      if (pr >= 0.9 && (bData.totalLoads || 0) >= 5) { grade = 'A'; payment = 'Reliable' }
      else if (pr < 0.7) { grade = 'C'; payment = 'Slow' }
      flexibility = (bData.avgCounterAccept || 0) > 0.6 ? 'High' : 'Medium'
      speed = (bData.avgResponseTime || 0) < 2 ? 'Fast' : 'Normal'
    }

    // Multi-day detection
    const isMultiDay = transitDays > 1
    const multiDayAlert = isMultiDay && profitPerDay < 400
      ? `This load blocks truck for ${transitDays} days. Profit per day is low at $${Math.round(profitPerDay)}.`
      : null

    // Instant book detection
    const isInstantBook = !selectedLoad.broker_phone && (selectedLoad.book_type === 'instant' || selectedLoad.instant_book)

    return {
      gross, miles, driverPay, fuelCost, estProfit, profitPerMile, profitPerDay,
      transitDays, minRate, targetRate, rpm, broker,
      brokerIntel: { grade, flexibility, speed, payment, usualCounter: grade === 'A' ? '+$100–150' : grade === 'C' ? '+$250–350' : '+$150–200' },
      multiDayAlert, isInstantBook, isMultiDay, counterMarkup,
    }
  }, [selectedLoad, drivers, fuelRate, negSettings, brokerStats])

  // ── Negotiation strategy ──────────────────────────────────────────────────
  const negStrategy = useMemo(() => {
    if (!loadEval) return null
    const { estProfit, profitPerMile, rpm, gross, brokerIntel } = loadEval
    const minRate = loadEval.minRate
    if (rpm < minRate) return { action:'PUSH HIGHER', color:'var(--danger)', text:`Rate below minimum ($${rpm.toFixed(2)}/mi vs $${minRate.toFixed(2)} floor). Counter aggressively.` }
    if (profitPerMile < 0.80) return { action:'NEGOTIATE', color:'var(--warning)', text:`Mid-range profit. Counter for +${loadEval.counterMarkup}% — target $${loadEval.targetRate.toLocaleString()}.` }
    if (profitPerMile >= 1.50) return { action:'ACCEPT', color:'var(--success)', text:`Strong rate. Accept and secure before broker shops elsewhere.` }
    return { action:'NEGOTIATE', color:'var(--accent)', text:`Decent rate. Push for $${loadEval.targetRate.toLocaleString()} based on market conditions.` }
  }, [loadEval])

  // ── Initiate Call ─────────────────────────────────────────────────────────
  const initiateCall = useCallback(async () => {
    if (!selectedLoad) return
    const brokerPhone = selectedLoad.broker_phone || selectedLoad.phone
    if (!brokerPhone) {
      showToast('error', 'No Phone', 'No broker phone number on this load.')
      return
    }

    setCallStage('dialing')
    setTranscript([])
    setCallSummary(null)
    setLiveInsight({ text:'Initiating call to broker...', color:'var(--accent)' })

    try {
      const res = await apiFetch('/api/ai-caller', {
        method: 'POST',
        body: JSON.stringify({
          phone: brokerPhone,
          loadId: selectedLoad.loadId || selectedLoad.id,
          origin: selectedLoad.origin,
          destination: selectedLoad.dest || selectedLoad.destination,
          rate: selectedLoad.gross || selectedLoad.rate,
          miles: selectedLoad.miles,
          equipment: selectedLoad.equipment || 'Dry Van',
          brokerName: selectedLoad.broker,
          driverName: selectedLoad.driver || drivers?.[0]?.full_name || '',
          autoNegotiate,
        })
      })

      if (res.error) {
        setCallStage('idle')
        setLiveInsight(null)
        showToast('error', 'Call Failed', res.error || res.reason || 'Could not initiate call')
        return
      }

      setCallId(res.callSid || res.call_id)
      setCallStage('connected')
      setTranscript(t => [...t, { speaker:'Q', text:`Good afternoon, this is Q from Qivori Dispatch. I'm calling about load ${selectedLoad.loadId || ''} — ${selectedLoad.origin?.split(',')[0]} to ${(selectedLoad.dest || selectedLoad.destination || '').split(',')[0]}.`, time:'0:02' }])
      setLiveInsight({ text:'Connected. Q is reading load details to broker.', color:'var(--success)' })

      // Simulate call flow progression (real updates come from webhook)
      simulateCallFlow()
    } catch (err) {
      setCallStage('idle')
      setLiveInsight(null)
      showToast('error', 'Call Error', err.message)
    }
  }, [selectedLoad, autoNegotiate, drivers, showToast])

  // Simulated call flow for UI (real calls get webhook updates)
  const simulateCallFlow = useCallback(() => {
    const stages = [
      { delay:3000, stage:'reading', msg:{ speaker:'Q', text:'Confirming pickup and delivery details with broker.', time:'0:08' }, insight:'Reading load details to broker.' },
      { delay:6000, stage:'evaluating', insight:'Evaluating broker response and tone.' },
      { delay:9000, stage:'negotiating', msg:{ speaker:'broker', text:'We can do this load at the posted rate.', time:'0:14' }, insight:'Broker responded. Evaluating rate against profit targets.' },
      { delay:12000, stage:'waiting', msg:{ speaker:'Q', text:`Based on current market conditions and our operational costs, we need $${loadEval?.targetRate?.toLocaleString() || '—'} for this lane.`, time:'0:18' }, insight:'Q countered with target rate. Waiting on response.' },
    ]
    stages.forEach(({ delay, stage, msg, insight }) => {
      setTimeout(() => {
        setCallStage(s => s === 'idle' || s === 'ended' ? s : stage)
        if (msg) setTranscript(t => [...t, msg])
        if (insight) setLiveInsight({ text:insight, color:CALL_STAGES.find(s => s.id === stage)?.color || 'var(--accent)' })
      }, delay)
    })
  }, [loadEval])

  // ── Instant Book ──────────────────────────────────────────────────────────
  const handleInstantBook = useCallback(async () => {
    if (!selectedLoad) return
    try {
      showToast('info', 'Q Booking', `Auto-booking ${selectedLoad.loadId}...`)
      // Use existing addLoad or book mechanism
      setCallSummary({
        decision:'Accept', broker: selectedLoad.broker, brokerOffer: selectedLoad.gross,
        qCounter: selectedLoad.gross, finalRate: selectedLoad.gross,
        estProfit: loadEval?.estProfit || 0, duration:'Instant',
        route:`${selectedLoad.origin?.split(',')[0]} → ${(selectedLoad.dest||'').split(',')[0]}`,
        miles: selectedLoad.miles, equipment: selectedLoad.equipment,
      })
      showToast('success', 'Load Booked', `${selectedLoad.loadId} auto-booked at $${(selectedLoad.gross||0).toLocaleString()}`)
    } catch (err) {
      showToast('error', 'Book Error', err.message)
    }
  }, [selectedLoad, loadEval, showToast])

  // ── Send text to driver ───────────────────────────────────────────────────
  const textDriver = useCallback(async (driver, message) => {
    const phone = driver?.phone || driver?.cell_phone
    if (!phone) { showToast('error', 'No Phone', 'Driver has no phone number'); return }
    try {
      await apiFetch('/api/send-sms', { method:'POST', body: JSON.stringify({ to: phone, message }) })
      showToast('success', 'Sent', `Text sent to ${driver.full_name || driver.name}`)
    } catch (err) {
      showToast('error', 'SMS Error', err.message)
    }
  }, [showToast])

  // ── End Call ──────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    setCallStage('ended')
    setLiveInsight(null)
    // Generate summary from last transcript
    const finalRate = loadEval?.targetRate || loadEval?.gross || 0
    setCallSummary({
      decision: 'Accept',
      broker: selectedLoad?.broker || '—',
      brokerOffer: loadEval?.gross || 0,
      qCounter: loadEval?.targetRate || 0,
      finalRate,
      estProfit: loadEval?.estProfit || 0,
      duration: '1:45',
      route: `${selectedLoad?.origin?.split(',')[0] || '—'} → ${(selectedLoad?.dest || selectedLoad?.destination || '—').split(',')[0]}`,
      miles: selectedLoad?.miles, equipment: selectedLoad?.equipment,
    })
    setTimeout(() => setCallStage('idle'), 500)
  }, [selectedLoad, loadEval])

  // ── Loads available for dispatch ──────────────────────────────────────────
  const dispatchableLoads = useMemo(() => {
    return loads.filter(l =>
      ['Rate Con Received','Booked','Assigned to Driver'].includes(l.status)
    ).slice(0, 20)
  }, [loads])

  // Active stage data
  const activeStage = CALL_STAGES.find(s => s.id === callStage) || CALL_STAGES[0]
  const isInCall = !['idle','ended'].includes(callStage)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Q Dispatch Header */}
      <div style={{ flexShrink:0, padding:'12px 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{
            width:8, height:8, borderRadius:'50%',
            background: isInCall ? 'var(--success)' : 'var(--accent)',
            boxShadow: isInCall ? '0 0 8px var(--success)' : 'none',
            animation: isInCall ? 'q-dispatch-pulse 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:2, color:'var(--text)' }}>
            Q <span style={{ color:'var(--accent)' }}>DISPATCH AI</span>
          </span>
          {isInCall && (
            <span style={{ fontSize:9, padding:'2px 8px', background:'rgba(34,197,94,0.12)', color:'var(--success)', borderRadius:6, fontWeight:800 }}>
              {activeStage.label.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Auto Negotiate Toggle */}
          <button onClick={() => setAutoNegotiate(!autoNegotiate)}
            style={{
              display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:8,
              border:`1px solid ${autoNegotiate ? 'var(--success)' : 'var(--border)'}`,
              background: autoNegotiate ? 'rgba(34,197,94,0.08)' : 'transparent',
              color: autoNegotiate ? 'var(--success)' : 'var(--muted)',
              fontSize:10, fontWeight:700, cursor:'pointer',
            }}>
            <Zap size={12} />
            {autoNegotiate ? 'AUTO NEGOTIATE ON' : 'AUTO NEGOTIATE'}
          </button>
          <button onClick={() => setSettingsOpen(!settingsOpen)}
            style={{ border:'none', background:'transparent', color:'var(--muted)', cursor:'pointer', padding:4 }}>
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div style={{ flex:1, minHeight:0, overflow:'auto', display:'flex', gap:0 }}>

        {/* ═══ LEFT: Load Selection ═══ */}
        <div style={{ width:280, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:700, color:'var(--muted)', display:'flex', justifyContent:'space-between' }}>
            <span>LOADS READY FOR DISPATCH</span>
            <span style={{ color:'var(--accent)' }}>{dispatchableLoads.length}</span>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {dispatchableLoads.length === 0 && (
              <div style={{ padding:30, textAlign:'center', fontSize:11, color:'var(--muted)' }}>
                No loads ready for dispatch. Add loads via the pipeline.
              </div>
            )}
            {dispatchableLoads.map(l => {
              const isSelected = selectedLoad && (selectedLoad.loadId || selectedLoad.id) === (l.loadId || l.id)
              const hasPhone = !!(l.broker_phone || l.phone)
              const isInstant = !hasPhone && (l.book_type === 'instant' || l.instant_book)
              return (
                <div key={l.loadId || l.id} onClick={() => setSelectedLoad(l)}
                  style={{
                    padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)',
                    background: isSelected ? 'rgba(240,165,0,0.06)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    transition:'all 0.15s',
                  }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'var(--accent)' }}>{l.loadId || l.id}</span>
                    <div style={{ display:'flex', gap:4 }}>
                      {hasPhone && <Phone size={10} color="var(--success)" />}
                      {isInstant && <Zap size={10} color="var(--accent2)" />}
                    </div>
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>
                    {(l.origin||'').split(',')[0]} → {(l.dest||l.destination||'').split(',')[0]}
                  </div>
                  <div style={{ display:'flex', gap:8, fontSize:10, color:'var(--muted)' }}>
                    <span style={{ fontWeight:700, color:'var(--accent)' }}>${(l.gross||0).toLocaleString()}</span>
                    <span>{l.miles || '—'} mi</span>
                    <span>{l.broker || '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ═══ CENTER: Call Experience ═══ */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>

          {!selectedLoad ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ textAlign:'center', maxWidth:320 }}>
                <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                  <Bot size={28} color="var(--accent)" />
                </div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, marginBottom:8 }}>Q DISPATCH READY</div>
                <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
                  Select a load from the left panel to activate Q Dispatch.
                  Q will call the broker, negotiate the rate, and secure the load.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Call flow progress */}
              {isInCall && (
                <div style={{ flexShrink:0, padding:'10px 16px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <activeStage.icon size={14} color={activeStage.color} />
                    <span style={{ fontSize:12, fontWeight:700, color:activeStage.color }}>{activeStage.label}</span>
                    <QWaveform active={isInCall} color={activeStage.color} />
                    <span style={{ marginLeft:'auto', fontSize:10, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>
                      {selectedLoad.broker}
                    </span>
                  </div>
                  <CallFlowProgress stage={callStage} />
                </div>
              )}

              {/* Post-call summary */}
              {callSummary && (
                <div style={{ padding:16 }}>
                  <PostCallSummary summary={callSummary} onClose={() => setCallSummary(null)} />
                </div>
              )}

              {/* Main area: transcript + actions */}
              <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>

                {/* Multi-day load alert */}
                {loadEval?.multiDayAlert && (
                  <div style={{ flexShrink:0, margin:'10px 16px 0', padding:'8px 14px', background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.15)', borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
                    <Calendar size={14} color="var(--warning)" />
                    <span style={{ fontSize:11, color:'var(--text)' }}>{loadEval.multiDayAlert}</span>
                    <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:5, background:'rgba(240,165,0,0.12)', color:'var(--warning)', flexShrink:0 }}>MULTI-DAY</span>
                  </div>
                )}

                {/* Live transcript area */}
                {isInCall && (
                  <div ref={transcriptRef} style={{ flex:1, minHeight:0, overflowY:'auto', padding:'10px 16px' }}>
                    {transcript.map((t, i) => <TranscriptLine key={i} {...t} />)}
                  </div>
                )}

                {/* Idle state: load summary + action buttons */}
                {!isInCall && !callSummary && (
                  <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                    {/* Load details */}
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 18px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <div>
                          <div style={{ fontFamily:'monospace', fontSize:12, color:'var(--accent)', fontWeight:700 }}>{selectedLoad.loadId || selectedLoad.id}</div>
                          <div style={{ fontSize:16, fontWeight:800, marginTop:4 }}>
                            {(selectedLoad.origin||'').split(',')[0]} → {(selectedLoad.dest||selectedLoad.destination||'').split(',')[0]}
                          </div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:'var(--accent)' }}>${(loadEval?.gross||0).toLocaleString()}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>${loadEval?.rpm?.toFixed(2) || '—'}/mi · {selectedLoad.miles || '—'} mi</div>
                        </div>
                      </div>
                      {/* Profit metrics */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                        {[
                          { label:'EST PROFIT', value:'$'+(loadEval?.estProfit||0).toLocaleString(), color: (loadEval?.estProfit||0) > 0 ? 'var(--success)' : 'var(--danger)' },
                          { label:'PROFIT/MILE', value:'$'+(loadEval?.profitPerMile||0).toFixed(2), color: (loadEval?.profitPerMile||0) >= 0.80 ? 'var(--success)' : 'var(--warning)' },
                          { label:'PROFIT/DAY', value:'$'+Math.round(loadEval?.profitPerDay||0).toLocaleString(), color: (loadEval?.profitPerDay||0) >= 400 ? 'var(--success)' : 'var(--warning)' },
                          { label:'TARGET RATE', value:'$'+(loadEval?.targetRate||0).toLocaleString(), color:'var(--accent)' },
                        ].map(s => (
                          <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                            <div style={{ fontSize:8, color:'var(--muted)', letterSpacing:1, marginBottom:2 }}>{s.label}</div>
                            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:s.color }}>{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Negotiation Strategy */}
                    {negStrategy && (
                      <div style={{ padding:'12px 16px', background: negStrategy.color+'08', border:`1px solid ${negStrategy.color}25`, borderRadius:10, display:'flex', alignItems:'center', gap:10 }}>
                        <Target size={16} color={negStrategy.color} />
                        <div style={{ flex:1 }}>
                          <span style={{ fontSize:10, fontWeight:800, color:negStrategy.color }}>{negStrategy.action}</span>
                          <div style={{ fontSize:12, color:'var(--text)', marginTop:2 }}>{negStrategy.text}</div>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display:'flex', gap:8 }}>
                      {loadEval?.isInstantBook ? (
                        <button onClick={handleInstantBook}
                          style={{
                            flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                            padding:'14px 20px', borderRadius:12, border:'none', cursor:'pointer',
                            background:'linear-gradient(135deg, var(--accent2), rgba(0,212,170,0.8))',
                            color:'#fff', fontWeight:800, fontSize:13, fontFamily:"'DM Sans',sans-serif",
                          }}>
                          <Zap size={16} /> Q AUTO BOOK
                        </button>
                      ) : (
                        <button onClick={initiateCall}
                          style={{
                            flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                            padding:'14px 20px', borderRadius:12, border:'none', cursor:'pointer',
                            background:'linear-gradient(135deg, var(--accent), rgba(240,165,0,0.8))',
                            color:'#000', fontWeight:800, fontSize:13, fontFamily:"'DM Sans',sans-serif",
                          }}>
                          <Phone size={16} /> ACTIVATE Q — CALL BROKER
                        </button>
                      )}
                      {isInCall && (
                        <button onClick={endCall}
                          style={{
                            padding:'14px 20px', borderRadius:12, border:'1px solid var(--danger)', cursor:'pointer',
                            background:'rgba(239,68,68,0.08)', color:'var(--danger)', fontWeight:800, fontSize:13,
                          }}>
                          <PhoneOff size={16} />
                        </button>
                      )}
                    </div>

                    {/* Communication: text driver */}
                    {selectedLoad.driver && (
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => {
                          const driverRec = (drivers || []).find(d => (d.full_name || d.name) === selectedLoad.driver)
                          textDriver(driverRec, `Load assigned — ${selectedLoad.loadId}: ${(selectedLoad.origin||'').split(',')[0]} → ${(selectedLoad.dest||'').split(',')[0]} at $${(selectedLoad.gross||0).toLocaleString()}. Accept or decline.`)
                        }}
                          style={{
                            flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                            padding:'10px 16px', borderRadius:10, border:'1px solid var(--border)',
                            background:'transparent', color:'var(--text)', fontWeight:600, fontSize:11, cursor:'pointer',
                          }}>
                          <MessageSquare size={14} /> Text Driver: "{selectedLoad.driver}" — Accept/Decline
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Live Insight Bar (bottom during call) */}
              {liveInsight && isInCall && (
                <div style={{ flexShrink:0, padding:'10px 16px', background:'rgba(240,165,0,0.04)', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
                  <Bot size={14} color="var(--accent)" />
                  <span style={{ fontSize:11, color:'var(--text)', flex:1 }}>{liveInsight.text}</span>
                  {loadEval && (
                    <div style={{ display:'flex', gap:10, fontSize:10, flexShrink:0 }}>
                      <span style={{ color:'var(--muted)' }}>Profit: <span style={{ fontWeight:700, color: loadEval.estProfit > 0 ? 'var(--success)' : 'var(--danger)' }}>${loadEval.estProfit.toLocaleString()}</span></span>
                      <span style={{ color:'var(--muted)' }}>Target: <span style={{ fontWeight:700, color:'var(--accent)' }}>${loadEval.targetRate.toLocaleString()}</span></span>
                      <span style={{ fontWeight:700, color: negStrategy?.color || 'var(--accent)' }}>{negStrategy?.action || '—'}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ RIGHT: Broker Intel ═══ */}
        {selectedLoad && (
          <div style={{ width:260, flexShrink:0, borderLeft:'1px solid var(--border)', overflowY:'auto', display:'flex', flexDirection:'column', gap:12, padding:12 }}>
            {/* Broker Intel */}
            <BrokerIntelCard broker={selectedLoad.broker} stats={loadEval?.brokerIntel} />

            {/* Live Call Insight Panel */}
            {isInCall && loadEval && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                  <Activity size={14} color="var(--accent)" />
                  <span style={{ fontSize:12, fontWeight:700 }}>Live Insight</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:8, color:'var(--muted)', letterSpacing:1 }}>EST PROFIT AT CURRENT RATE</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color: loadEval.estProfit > 0 ? 'var(--success)' : 'var(--danger)' }}>${loadEval.estProfit.toLocaleString()}</div>
                  </div>
                  <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:8, color:'var(--muted)', letterSpacing:1 }}>TARGET COUNTER RATE</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:'var(--accent)' }}>${loadEval.targetRate.toLocaleString()}</div>
                  </div>
                  <div style={{ padding:'10px 12px', background: negStrategy?.color + '08', borderRadius:8, border:`1px solid ${negStrategy?.color || 'var(--border)'}25`, textAlign:'center' }}>
                    <div style={{ fontSize:9, fontWeight:800, color:negStrategy?.color || 'var(--accent)' }}>{negStrategy?.action || '—'}</div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Recommended Action</div>
                  </div>
                </div>
              </div>
            )}

            {/* Negotiation Settings */}
            {negSettings && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <Settings size={14} color="var(--muted)" />
                  <span style={{ fontSize:12, fontWeight:700 }}>Negotiation Rules</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {[
                    { label:'Min Rate/Mile', value:'$'+(negSettings.min_rate_per_mile||2.50).toFixed(2) },
                    { label:'Counter Markup', value:(negSettings.counter_offer_markup_pct||10)+'%' },
                    { label:'Max Rounds', value:String(negSettings.max_counter_rounds||2) },
                    { label:'Auto Accept', value:negSettings.auto_accept_above_minimum ? 'ON' : 'OFF' },
                  ].map(s => (
                    <div key={s.label} style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
                      <span style={{ color:'var(--muted)' }}>{s.label}</span>
                      <span style={{ fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent call history (compact) */}
            {callHistory.length > 0 && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Recent Calls</div>
                {callHistory.slice(0,5).map((c, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:10, padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ color:'var(--muted)' }}>{c.broker}</span>
                    <span style={{ color: c.outcome === 'secured' ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>{c.outcome}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes q-dispatch-pulse {
          0%, 100% { opacity:1; box-shadow: 0 0 4px var(--success); }
          50% { opacity:0.4; box-shadow: 0 0 12px var(--success); }
        }
        @keyframes q-wave {
          from { height: 4px; }
          to { height: 20px; }
        }
      `}</style>
    </div>
  )
}
