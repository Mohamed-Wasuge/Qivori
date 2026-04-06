import { useState, useMemo, useEffect, useRef } from 'react'
import {
  AlertCircle, Brain, Check, MessageCircle, MailOpen,
  MapPin, Calendar, Flag, Bookmark, Route, Bot,
  DollarSign, Briefcase, Building2, Zap, CheckCircle, FileText,
} from 'lucide-react'
import { Ic } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { RateBadge, StopTimeline } from '../LoadBoard'

// ─── AI LOAD BOARD ────────────────────────────────────────────────────────────
// Broker risk reference — grows from API data over time
const LB_BROKER = {}

// Lane market rates — populated by load board API data
const LB_LANE = {}

// Fallback sample load — shown when no API keys configured
const SAMPLE_BOARD_LOADS = []

function calcAiScore(load) {
  const lane    = LB_LANE[load.laneKey] || { avgRpm:2.70, trend:0, backhaul:50 }
  const broker  = LB_BROKER[load.broker] || { score:70, risk:'UNKNOWN' }
  // A: RPM premium (0-25)
  const premium = (load.rate - lane.avgRpm) / lane.avgRpm
  const scoreA  = Math.min(25, Math.max(0, 12 + premium * 40))
  // B: Broker safety (0-25)
  const scoreB  = broker.score / 100 * 25
  // C: Deadhead efficiency (0-20)
  const ratio   = load.deadhead / load.miles
  const scoreC  = Math.min(20, Math.max(0, 20 - ratio * 35))
  // D: Lane trend (0-20)
  const scoreD  = lane.trend > 8 ? 20 : lane.trend > 3 ? 16 : lane.trend > 0 ? 12 : lane.trend > -5 ? 7 : 3
  // E: Backhaul bonus (0-10)
  const scoreE  = lane.backhaul > 70 ? 10 : lane.backhaul > 50 ? 6 : 3
  return Math.min(99, Math.max(30, Math.round(scoreA + scoreB + scoreC + scoreD + scoreE)))
}

const EQUIPMENT_LABEL = { 'Dry Van':'Dry Van', 'Reefer':'Reefer', 'Flatbed':'Flatbed' }

// ─── AI RATE NEGOTIATOR ───────────────────────────────────────────────────────
function AIRateNegotiator({ load, lane, bkr }) {
  const { showToast } = useApp()
  const ln = lane  || { avgRpm:2.70, trend:0, backhaul:50 }
  const bk = bkr   || { score:70, risk:'MEDIUM', pay:'< 5 days' }

  // Derive AI suggested counter
  const marketPremium   = ln.trend > 5 ? 0.18 : ln.trend > 0 ? 0.10 : 0.04
  const brokerPenalty   = bk.risk === 'HIGH' ? 0.12 : bk.risk === 'LOW' ? 0 : 0.06
  const suggestedRpm    = Math.round((ln.avgRpm + marketPremium + brokerPenalty) * 100) / 100
  const suggestedGross  = Math.round(suggestedRpm * load.miles)
  const diffVsPosted    = Math.round(suggestedGross - load.gross)
  const isAbove         = diffVsPosted > 0

  const [mode, setMode]       = useState('idle')   // idle | counter | passed
  const [counter, setCounter] = useState(String(suggestedGross))
  const [sent, setSent]       = useState(false)

  const rationale = [
    ln.trend > 3  ? `Lane trending +${ln.trend}% — market is hot, push higher`
    : ln.trend < -3 ? `Lane trending ${ln.trend}% — accept near market or pass`
    : `Lane rate stable — modest counter likely to stick`,
    bk.risk === 'HIGH'
      ? `${load.broker} rated HIGH risk — demand 10-15% premium or pass`
      : bk.risk === 'LOW'
      ? `${load.broker} is low risk, fast pay — accept near posted is safe`
      : `${load.broker} mid-tier — counter to ${suggestedRpm.toFixed(2)}/mi standard`,
    ln.backhaul > 70
      ? `Strong backhaul lane (${ln.backhaul}%) — you have leverage, hold firm`
      : `Weak backhaul — factor in potential deadhead on return`,
  ]

  const handleSend = () => {
    const amt = parseFloat(counter)
    if (!amt || amt < load.gross) { showToast('','Invalid amount','Counter must be ≥ posted rate'); return }
    setSent(true)
    showToast('','Counter Sent', `$${amt.toLocaleString()} counter submitted to ${load.broker}`)
  }

  if (mode === 'passed') {
    return (
      <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:16, textAlign:'center' }}>
        <div style={{ fontSize:22, marginBottom:4 }}><AlertCircle size={22} /></div>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--danger)' }}>Passed on this load</div>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>AI agreed — rate vs. risk doesn't pencil. Move to the next one.</div>
        <button onClick={() => setMode('idle')} style={{ marginTop:10, fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Undo</button>
      </div>
    )
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:12, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', background:'rgba(240,165,0,0.04)', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:16 }}><Brain size={16} /></span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:13 }}>AI Rate Negotiation</div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>Powered by lane data, broker history &amp; market conditions</div>
        </div>
        <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6, background:'rgba(240,165,0,0.15)', color:'var(--accent)', letterSpacing:1 }}>LIVE</span>
      </div>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>

        {/* Suggested counter card */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
          {[
            { label:'Posted Rate', val:`$${load.gross.toLocaleString()}`, sub:`$${load.rate}/mi`, color:'var(--muted)' },
            { label:'Lane Avg',    val:`$${Math.round(ln.avgRpm*load.miles).toLocaleString()}`, sub:`$${ln.avgRpm.toFixed(2)}/mi avg`, color:'var(--text)' },
            { label:'AI Counter',  val:`$${suggestedGross.toLocaleString()}`, sub:`$${suggestedRpm.toFixed(2)}/mi · ${isAbove ? '+' : ''}${diffVsPosted >= 0 ? '+' : ''}$${Math.abs(diffVsPosted)} vs posted`, color: isAbove ? 'var(--success)' : 'var(--accent)' },
          ].map(c => (
            <div key={c.label} style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600 }}>{c.label}</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:c.color, lineHeight:1 }}>{c.val}</div>
              <div style={{ fontSize:9, color:'var(--muted)', marginTop:3 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* AI Rationale */}
        <div style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
          {rationale.map((r,i) => (
            <div key={i} style={{ fontSize:11, color:'var(--text)', lineHeight:1.5 }}>{r}</div>
          ))}
        </div>

        {/* Action row */}
        {mode === 'idle' && !sent && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { showToast('','Rate Accepted',`Accepted posted rate of $${load.gross.toLocaleString()} — assign a driver to book`); setMode('idle') }}
              style={{ flex:1, padding:'9px', fontSize:12, fontWeight:700, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:8, color:'var(--success)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              <Check size={13} /> Accept As-Is
            </button>
            <button onClick={() => setMode('counter')}
              style={{ flex:1, padding:'9px', fontSize:12, fontWeight:700, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:8, color:'var(--accent)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              <MessageCircle size={13} /> Counter Offer
            </button>
            <button onClick={() => setMode('passed')}
              style={{ flex:1, padding:'9px', fontSize:12, fontWeight:700, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, color:'var(--danger)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              <AlertCircle size={13} /> Pass
            </button>
          </div>
        )}

        {/* Counter input */}
        {mode === 'counter' && !sent && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Enter your counter amount — AI suggests <strong style={{ color:'var(--accent)' }}>${suggestedGross.toLocaleString()}</strong></div>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ position:'relative', flex:1 }}>
                <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)', fontSize:13, fontWeight:700 }}>$</span>
                <input type="number" value={counter} onChange={e => setCounter(e.target.value)}
                  style={{ width:'100%', boxSizing:'border-box', paddingLeft:24, paddingRight:12, paddingTop:10, paddingBottom:10, background:'var(--surface2)', border:'1px solid rgba(240,165,0,0.4)', borderRadius:8, color:'var(--text)', fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
              <button onClick={handleSend}
                style={{ padding:'10px 20px', fontSize:12, fontWeight:700, background:'var(--accent)', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
                Send Counter →
              </button>
              <button onClick={() => setMode('idle')}
                style={{ padding:'10px 14px', fontSize:12, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
            </div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>
              That's ${(parseFloat(counter||0)/load.miles).toFixed(2)}/mi · ${Math.round((parseFloat(counter||0)/load.miles - ln.avgRpm)*100)/100 >= 0 ? '+' : ''}{Math.round((parseFloat(counter||0)/load.miles - ln.avgRpm)*100)/100} vs lane avg
            </div>
          </div>
        )}

        {sent && (
          <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}><MailOpen size={20} /></span>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}>Counter Submitted — ${parseFloat(counter).toLocaleString()}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Waiting on broker response · You can still book at posted rate below</div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}


export function AILoadBoard() {
  const { showToast } = useApp()
  const { addLoad, drivers: dbDrivers, fuelCostPerMile: boardFuelCpm } = useCarrier()
  const boardPayPct = useMemo(() => {
    const pctDrivers = dbDrivers.filter(d => d.pay_model === 'percent' && d.pay_rate)
    if (pctDrivers.length > 0) return pctDrivers.reduce((s, d) => s + Number(d.pay_rate), 0) / pctDrivers.length / 100
    return 0.28 // fallback — per-driver rate preferred
  }, [dbDrivers])
  const [filters, setFilters] = useState({ equip:'All', minRpm:'', sortBy:'score' })
  const [boardLoads, setBoardLoads] = useState(SAMPLE_BOARD_LOADS)
  const [selected, setSelected] = useState(SAMPLE_BOARD_LOADS[0]?.id || null)
  const [booked, setBooked]     = useState({})
  const [assignDriver, setAssignDriver] = useState('')
  const [rateConFile, setRateConFile] = useState(null)
  const [parsingRC, setParsingRC] = useState(false)
  const [lbSource, setLbSource] = useState('')
  const [lbLoading, setLbLoading] = useState(false)
  const rcFileRef = useRef(null)

  // Fetch live loads from API
  useEffect(() => {
    let cancelled = false
    async function fetchLiveLoads() {
      setLbLoading(true)
      try {
        const params = new URLSearchParams()
        if (filters.equip !== 'All') params.set('equipment', filters.equip)
        const res = await apiFetch(`/api/load-board?${params}`)
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        if (!cancelled && data.loads?.length > 0) {
          const mapped = data.loads.map(l => ({
            id: l.id,
            broker: l.broker || 'Unknown',
            origin: l.origin || `${l.originCity}, ${l.originState}`,
            dest: l.dest || `${l.destCity}, ${l.destState}`,
            miles: l.miles || 0,
            rate: l.rate || 0,
            gross: l.gross || 0,
            weight: l.weight || '',
            commodity: l.commodity || '',
            equipment: l.equipment || 'Dry Van',
            pickup: l.pickup || '',
            delivery: l.delivery || '',
            deadhead: l.deadhead || 0,
            refNum: l.refNum || '',
            laneKey: l.laneKey || '',
            source: l.source || 'api',
          }))
          setBoardLoads(mapped)
          setLbSource(data.source || '')
          if (!selected || !mapped.find(l => l.id === selected)) {
            setSelected(mapped[0]?.id || null)
          }
        }
      } catch {
        /* API fetch failed — using cached data */
      } finally {
        if (!cancelled) setLbLoading(false)
      }
    }
    fetchLiveLoads()
    const interval = setInterval(fetchLiveLoads, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [filters.equip])

  const compressImage = (file) => new Promise((resolve) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const reader = new FileReader()
      reader.onload = () => resolve({ base64: reader.result.split(',')[1], mediaType: 'application/pdf' })
      reader.readAsDataURL(file)
      return
    }
    const img = new Image()
    img.onload = () => {
      const maxW = 1200
      let w = img.width, h = img.height
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
    }
    img.onerror = () => {
      const reader = new FileReader()
      reader.onload = () => resolve({ base64: reader.result.split(',')[1], mediaType: file.type || 'image/jpeg' })
      reader.readAsDataURL(file)
    }
    img.src = URL.createObjectURL(file)
  })

  const parseCarrierRC = async (f) => {
    if (!f) return
    const validExt = /\.(pdf|png|jpg|jpeg|heic)$/i
    if (!validExt.test(f.name) && !f.type?.match(/image|pdf/)) {
      showToast('','Invalid File',`"${f.name}" — need PDF, PNG, or JPG`)
      return
    }
    setRateConFile(f)
    setParsingRC(true)
    showToast('','Reading Rate Con',`Compressing ${f.name} (${(f.size/1024).toFixed(0)} KB)...`)
    try {
      const { base64, mediaType } = await compressImage(f)
      if (!base64 || base64.length < 50) {
        showToast('','Compression Failed','File could not be read — try a different format')
        setParsingRC(false)
        return
      }
      showToast('','Sending to AI',`${(base64.length/1024).toFixed(0)} KB compressed — analyzing...`)
      const res = await apiFetch('/api/parse-ratecon', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ file: base64, mediaType })
      })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = null }
      if (data && !data.error) {
        showToast('','Rate Con Parsed', `${data.origin || ''} → ${data.destination || ''} · $${data.rate || '—'}`)
      } else {
        const errMsg = data?.error || 'Could not parse'
        showToast('','Parse Error', errMsg)
      }
    } catch(err) {
      showToast('','Error', err?.message || 'Failed to parse rate con')
    }
    setParsingRC(false)
  }

  const sf = (k, v) => setFilters(p => ({ ...p, [k]: v }))

  const scored = useMemo(() =>
    boardLoads.map(l => ({ ...l, aiScore: calcAiScore(l) }))
  , [boardLoads])

  const filtered = useMemo(() => {
    let r = scored
    if (filters.equip !== 'All') r = r.filter(l => l.equipment === filters.equip)
    if (filters.minRpm) r = r.filter(l => l.rate >= parseFloat(filters.minRpm))
    return [...r].sort((a, b) =>
      filters.sortBy === 'score' ? b.aiScore - a.aiScore :
      filters.sortBy === 'rate'  ? b.rate - a.rate :
      filters.sortBy === 'gross' ? b.gross - a.gross :
      a.deadhead - b.deadhead
    )
  }, [scored, filters])

  const load  = scored.find(l => l.id === selected)
  const lane  = load ? (LB_LANE[load.laneKey] || { avgRpm:2.70, trend:0, backhaul:50 }) : null
  const bkr   = load ? (LB_BROKER[load.broker] || { score:70, risk:'MEDIUM', pay:'< 5 days', color:'var(--warning)' }) : null
  const scoreC = load ? Math.min(99, Math.max(30, Math.round(calcAiScore(load)))) : 0
  const scoreColor = load ? (load.aiScore >= 75 ? 'var(--success)' : load.aiScore >= 55 ? 'var(--accent)' : 'var(--danger)') : 'var(--muted)'

  const handleBook = () => {
    if (!load || booked[load.id]) return
    if (!assignDriver) { showToast('','Assign Driver','Select a driver before booking'); return }
    addLoad({
      origin: load.origin, dest: load.dest, miles: load.miles,
      rate: load.rate, gross: load.gross, weight: load.weight,
      commodity: load.commodity, pickup: load.pickup, delivery: load.delivery,
      broker: load.broker, driver: assignDriver, refNum: load.refNum,
    })
    setBooked(p => ({ ...p, [load.id]: true }))
    showToast('','Load Booked', `${load.id} assigned to ${assignDriver} · added to dispatch queue`)
    setSelected(filtered.find(l => !booked[l.id] && l.id !== load.id)?.id || null)
    setAssignDriver('')
  }

  const estFuel   = load ? Math.round(load.miles / 6.9 * 3.85) : 0
  const estDriver = load ? Math.round(load.gross * boardPayPct) : 0
  const estNet    = load ? load.gross - estFuel - estDriver : 0

  const inputStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none' }
  const selectStyle = { ...inputStyle, cursor:'pointer' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'auto' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
            AI LOAD <span style={{ color:'var(--accent)' }}>BOARD</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{filtered.length} loads · Updated just now</div>
        </div>
        <div style={{ display:'flex', gap:8, marginLeft:'auto', alignItems:'center' }}>
          <select value={filters.equip} onChange={e => sf('equip', e.target.value)} style={selectStyle}>
            <option value="All">All Equipment</option>
            <option value="Dry Van">Dry Van</option>
            <option value="Reefer">Reefer</option>
            <option value="Flatbed">Flatbed</option>
          </select>
          <input type="number" placeholder="Min $/mi" value={filters.minRpm} onChange={e => sf('minRpm', e.target.value)}
            style={{ ...inputStyle, width:90 }}/>
          <select value={filters.sortBy} onChange={e => sf('sortBy', e.target.value)} style={selectStyle}>
            <option value="score">Sort: AI Score ↓</option>
            <option value="rate">Sort: Rate/mi ↓</option>
            <option value="gross">Sort: Gross ↓</option>
            <option value="deadhead">Sort: Deadhead ↑</option>
          </select>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'auto' }}>

        {/* LEFT: Load list */}
        <div style={{ width:380, flexShrink:0, borderRight:'1px solid var(--border)', overflowY:'auto' }}>
          {filtered.map(l => {
            const isSel = selected === l.id
            const b     = LB_BROKER[l.broker] || { color:'var(--muted)', score:70 }
            const sc    = l.aiScore
            const scC   = sc >= 75 ? 'var(--success)' : sc >= 55 ? 'var(--accent)' : 'var(--danger)'
            const isB   = booked[l.id]
            return (
              <div key={l.id} onClick={() => !isB && setSelected(l.id)}
                style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isB ? 'rgba(255,255,255,0.02)' : isSel ? 'rgba(240,165,0,0.05)' : 'transparent',
                  cursor: isB ? 'default' : 'pointer', opacity: isB ? 0.5 : 1, transition:'all 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                  <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>
                    {l.origin.split(',')[0]} → {l.dest.split(',')[0]}
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {isB && <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6, background:'rgba(34,197,94,0.15)', color:'var(--success)' }}>BOOKED</span>}
                    <span style={{ fontSize:11, fontWeight:800, padding:'2px 8px', borderRadius:6, background:scC+'15', color:scC }}>{sc}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:16, marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>${l.rate}/mi</span>
                  <span style={{ fontSize:12, fontWeight:700 }}>${l.gross.toLocaleString()}</span>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{l.miles} mi</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{l.broker} · {l.equipment}</span>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    {l.stops?.length > 0 && (
                      <span style={{ fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:5, background:'rgba(77,142,240,0.15)', color:'var(--accent2)' }}>
                        <MapPin size={11} />{l.stops.length}
                      </span>
                    )}
                    <span style={{ fontSize:11, fontWeight:600, padding:'1px 6px', borderRadius:5, background:b.color+'15', color:b.color }}>{b.risk}</span>
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
                  <span style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={Calendar} /> {l.pickup} · {l.deadhead} mi deadhead</span>
                  <RateBadge rpm={l.rate} equipment={l.equipment} compact />
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT: Detail panel */}
        {load ? (
          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', flexDirection:'column' }}>

            {/* Detail header */}
            <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:1, lineHeight:1.1, marginBottom:4 }}>
                    {load.origin} → {load.dest}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    {load.miles} mi · {EQUIPMENT_LABEL[load.equipment]} · {load.weight} lbs · {load.commodity}
                    {load.stops?.length > 0 && (
                      <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6, background:'rgba(77,142,240,0.15)', color:'var(--accent2)' }}>
                        <MapPin size={13} /> {load.stops.length} STOPS · ALL-IN PRICE
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign:'center', background:scoreColor+'12', border:`2px solid ${scoreColor}`, borderRadius:14, padding:'8px 18px' }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:scoreColor, lineHeight:1 }}>{load.aiScore}</div>
                  <div style={{ fontSize:9, fontWeight:800, color:scoreColor, letterSpacing:1 }}>AI SCORE</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}><Ic icon={Calendar} /> {load.pickup}</span>
                <span style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}><Ic icon={Flag} /> {load.delivery}</span>
                <span style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}><Ic icon={Bookmark} /> {load.refNum}</span>
                <span style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}><Ic icon={Route} /> {load.deadhead} mi deadhead</span>
              </div>
            </div>

            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16, flex:1 }}>

              {/* AI Score breakdown */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Bot} /> AI Score Breakdown</div>
                <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
                  {(() => {
                    const ln = lane || { avgRpm:2.70, trend:0, backhaul:50 }
                    const bk = bkr  || { score:70 }
                    const premium = (load.rate - ln.avgRpm) / ln.avgRpm
                    const bars = [
                      { label:'Rate vs Market',     val: Math.min(100, Math.max(0, Math.round(50 + premium * 160))), desc: load.rate > ln.avgRpm ? `+${((load.rate-ln.avgRpm)).toFixed(2)}/mi above lane avg` : `${((load.rate-ln.avgRpm)).toFixed(2)}/mi below lane avg` },
                      { label:'Broker Safety',       val: bk.score, desc: `${load.broker} · ${bk.risk} risk · pays ${bk.pay}` },
                      { label:'Deadhead Efficiency', val: Math.min(100, Math.max(0, Math.round(100 - (load.deadhead/load.miles)*150))), desc: `${load.deadhead} mi to pickup` },
                      { label:'Lane Trend',          val: ln.trend > 8 ? 92 : ln.trend > 3 ? 75 : ln.trend > 0 ? 60 : ln.trend > -5 ? 38 : 20, desc: `${ln.trend > 0 ? '+' : ''}${ln.trend}% rate trend this week` },
                      { label:'Backhaul Avail',      val: ln.backhaul, desc: `${ln.backhaul}% return load availability` },
                    ]
                    return bars.map(b => {
                      const c = b.val >= 75 ? 'var(--success)' : b.val >= 50 ? 'var(--accent)' : 'var(--danger)'
                      return (
                        <div key={b.label}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                            <span style={{ fontSize:12, fontWeight:600 }}>{b.label}</span>
                            <span style={{ fontSize:12, fontWeight:700, color:c }}>{b.val}</span>
                          </div>
                          <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden', marginBottom:2 }}>
                            <div style={{ height:'100%', width:`${b.val}%`, background:c, borderRadius:3, transition:'width 0.5s' }}/>
                          </div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{b.desc}</div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Stop timeline — shown for multi-stop loads */}
              {load.stops?.length > 0 && <StopTimeline load={load} />}

              {/* Economics + Broker side by side */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

                {/* Load Economics */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={DollarSign} /> Load Economics</div>
                  <div style={{ padding:14 }}>
                    {[
                      { l:'Gross Revenue',   v:`$${load.gross.toLocaleString()}`,  c:'var(--accent)'  },
                      { l:'Est. Fuel',       v:`−$${estFuel.toLocaleString()}`,     c:'var(--danger)'  },
                      { l:'Driver Pay 28%',  v:`−$${estDriver.toLocaleString()}`,   c:'var(--danger)'  },
                      { l:'Net Profit',      v:`$${estNet.toLocaleString()}`,       c:'var(--success)', bold:true },
                      { l:'Net / Mile',      v:`$${(estNet/load.miles).toFixed(2)}/mi`, c:'var(--success)' },
                    ].map(row => (
                      <div key={row.l} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{row.l}</span>
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: row.bold ? 20 : 16, color:row.c }}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Broker info */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Briefcase} /> Broker Intel</div>
                  <div style={{ padding:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                      <div style={{ width:36, height:36, borderRadius:8, background: bkr?.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}><Building2 size={20} /></div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700 }}>{load.broker}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>Pays {bkr?.pay}</div>
                      </div>
                      <span style={{ marginLeft:'auto', fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:8, background:bkr?.color+'15', color:bkr?.color }}>{bkr?.risk} RISK</span>
                    </div>
                    {[
                      { l:'Pay Score',   v: bkr?.score + '/100' },
                      { l:'Pay Speed',   v: bkr?.pay },
                      { l:'Risk Level',  v: bkr?.risk },
                    ].map(row => (
                      <div key={row.l} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{row.l}</span>
                        <span style={{ fontSize:11, fontWeight:700, color: row.l==='Risk Level' ? bkr?.color : 'var(--text)' }}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Rate Negotiation */}
              {!booked[load.id] && <AIRateNegotiator load={load} lane={lane} bkr={bkr} onAccept={() => {}} />}

              {/* Book load */}
              {!booked[load.id] ? (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}><Ic icon={Zap} /> Book This Load</div>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <select value={assignDriver} onChange={e => setAssignDriver(e.target.value)}
                      style={{ ...selectStyle, flex:1, padding:'10px 12px', fontSize:13 }}>
                      <option value="">Assign Driver…</option>
                      {(dbDrivers || []).map(d => (
                        <option key={d.id} value={d.full_name}>{d.full_name}{d.truck_number ? ` (Unit ${d.truck_number})` : ''}</option>
                      ))}
                    </select>
                    <button className="btn btn-primary" onClick={handleBook}
                      style={{ padding:'10px 28px', fontSize:13, whiteSpace:'nowrap', opacity: assignDriver ? 1 : 0.5 }}>
                      Book Load →
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>
                    Booking adds to dispatch queue with status "Rate Con Received". Upload a rate confirmation PDF to auto-fill all fields.
                  </div>
                </div>
              ) : (
                <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:12, padding:20 }}>
                  <div style={{ textAlign:'center', marginBottom:16 }}>
                    <div style={{ marginBottom:6 }}><Check size={28} /></div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--success)', marginBottom:4 }}>Load Booked</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>Added to your dispatch queue</div>
                  </div>
                  {/* Rate Con Upload */}
                  <input ref={rcFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display:'none' }}
                    onChange={e => { if (e.target.files?.[0]) parseCarrierRC(e.target.files[0]) }} />
                  {rateConFile ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10 }}>
                      {parsingRC ? (
                        <span style={{ fontSize:12, color:'var(--accent)', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:12, height:12, border:'2px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />
                          Reading {rateConFile.name}...
                        </span>
                      ) : (
                        <>
                          <CheckCircle size={14} style={{ color:'var(--success)' }} />
                          <span style={{ fontSize:12, fontWeight:600 }}>{rateConFile.name}</span>
                          <span style={{ fontSize:10, color:'var(--muted)' }}>({(rateConFile.size/1024).toFixed(0)} KB)</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div onClick={() => rcFileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--accent)' }}
                      onDragLeave={e => { e.currentTarget.style.borderColor='var(--border)' }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--border)'; parseCarrierRC(e.dataTransfer.files[0]) }}
                      style={{ padding:'12px 16px', border:'1px dashed var(--border)', borderRadius:10, textAlign:'center', cursor:'pointer', transition:'border-color 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
                      onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
                      <FileText size={18} style={{ color:'var(--muted)', marginBottom:4 }} />
                      <div style={{ fontSize:12, fontWeight:600 }}>Drop rate con here or click to upload</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>PDF, PNG, or JPG</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)' }}>
            <div><FileText size={40} /></div>
            <div style={{ fontSize:13 }}>Select a load to see AI analysis</div>
          </div>
        )}
      </div>
    </div>
  )
}
