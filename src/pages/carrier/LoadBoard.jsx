import {
  React, useState, useMemo, useEffect, useRef, useCallback,
  Ic, S, StatCard, AiBanner,
  useApp, useCarrier, apiFetch, useTranslation,
} from './shared'

import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, BarChart2, Bell, BellOff,
  Bookmark, Bot, Brain, Briefcase, Building2, Calendar, Check, CheckCircle,
  CircleDot, Clock, DollarSign, FileText, Flag, Flame, MapPin, MailOpen,
  MessageCircle, Navigation, Package, Phone, Plus, Radio, Route, Save,
  Search, Square, Star, Target, TrendingDown, TrendingUp, Truck, Upload, Zap,
} from 'lucide-react'

// ─── AI DISPATCH COPILOT ───────────────────────────────────────────────────────
// Fallback sample data — used when no load board API keys are configured
const SAMPLE_MARKET_LOADS = [
  { id:'DAT-8821', from:'ATL', fromFull:'Atlanta, GA', to:'CHI', toFull:'Chicago, IL', miles:674, gross:3840, rpm:2.94, weight:'42,000', commodity:'Auto Parts', broker:'Echo Global', brokerScore:98, brokerPay:'< 24hr', pickup:'Today 2PM', delivery:'Mar 9 · 10AM', equipment:'Dry Van', deadhead:22, aiScore:96, mktLow:2.55, mktAvg:2.80, mktHigh:3.10, tags:['AI TOP PICK','FAST PAY'], source:'sample' },
]

const DISPATCH_DRIVERS = []

const COPILOT_SUGGESTIONS = (load) => [
  `Should I take this ${load.from}→${load.to} load at $${load.rpm.toFixed(2)}/mi?`,
  `What's the market rate for ${load.from}→${load.to} right now?`,
  `Is ${load.broker} a reliable broker to work with?`,
  `What's the backhaul opportunity from ${load.to}?`,
  `How does this compare to my best loads this month?`,
]

export function SmartDispatch() {
  const { showToast } = useApp()
  const { language: currentLang } = useTranslation()
  const { loads: ctxLoads, addLoad, addLoadWithStops, totalRevenue, expenses, drivers: dbDrivers } = useCarrier()
  const dispatchDrivers = dbDrivers.length ? dbDrivers.map(d => ({
    name: d.full_name, status: d.status === 'Active' ? 'Available' : d.status || 'Available',
    location: d.location || '', hos: d.hos_remaining || '—', unit: d.unit_number || '',
  })) : DISPATCH_DRIVERS

  const [loads, setLoads] = useState(SAMPLE_MARKET_LOADS)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('All')
  const [searchOrigin, setSearchOrigin] = useState('')
  const [searchDest, setSearchDest]     = useState('')
  const [equipment, setEquipment]       = useState('All')
  const [bookModal, setBookModal]       = useState(null)   // load being booked
  const [bookDriver, setBookDriver]     = useState('')
  const [aiMessages, setAiMessages]     = useState({})     // keyed by load.id
  const [aiInput, setAiInput]           = useState('')
  const [aiLoading, setAiLoading]       = useState(false)
  const [lbSource, setLbSource]         = useState('')
  const [lbLoading, setLbLoading]       = useState(false)

  // Fetch live loads from API
  useEffect(() => {
    let cancelled = false
    async function fetchLiveLoads() {
      setLbLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchOrigin) params.set('origin', searchOrigin)
        if (searchDest) params.set('destination', searchDest)
        if (equipment !== 'All') params.set('equipment', equipment)
        const res = await apiFetch(`/api/load-board?${params}`)
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        if (!cancelled && data.loads?.length > 0) {
          // Normalize API loads to SmartDispatch shape
          const mapped = data.loads.map(l => ({
            id: l.id,
            from: (l.originCity || l.origin || '').split(',')[0]?.trim().slice(0, 3).toUpperCase() || l.origin?.slice(0, 3)?.toUpperCase() || '',
            fromFull: l.origin || `${l.originCity}, ${l.originState}`,
            to: (l.destCity || l.dest || '').split(',')[0]?.trim().slice(0, 3).toUpperCase() || l.dest?.slice(0, 3)?.toUpperCase() || '',
            toFull: l.dest || `${l.destCity}, ${l.destState}`,
            miles: l.miles || 0,
            gross: l.gross || 0,
            rpm: l.rate || 0,
            weight: l.weight || '',
            commodity: l.commodity || '',
            broker: l.broker || 'Unknown',
            brokerScore: 70,
            brokerPay: '< 5 days',
            pickup: l.pickup || '',
            delivery: l.delivery || '',
            equipment: l.equipment || 'Dry Van',
            deadhead: l.deadhead || 0,
            aiScore: l.aiScore || 50,
            mktLow: (l.rate || 2.50) - 0.30,
            mktAvg: l.rate || 2.70,
            mktHigh: (l.rate || 2.90) + 0.25,
            tags: l.aiScore >= 80 ? ['AI TOP PICK'] : [],
            source: l.source || 'api',
            refNum: l.refNum || '',
          }))
          setLoads(mapped)
          setLbSource(data.source || '')
          if (!selected && mapped.length > 0) setSelected(mapped[0].id)
        }
      } catch {
        // Keep sample data as fallback
      } finally {
        if (!cancelled) setLbLoading(false)
      }
    }
    fetchLiveLoads()
    // Refresh every 15 min
    const interval = setInterval(fetchLiveLoads, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [searchOrigin, searchDest, equipment])
  // editable calc inputs per load
  const [calcInputs, setCalcInputs]     = useState({})
  // Add Load modal
  const [addModal, setAddModal]         = useState(false)
  const [addSource, setAddSource]       = useState('broker') // 'broker' | 'amazon_relay'
  const [addForm, setAddForm]           = useState({ broker:'', origin:'', dest:'', miles:'', gross:'', rate:'', weight:'', commodity:'', pickup:'', delivery:'', equipment:'Dry Van', driver:'', notes:'', amazon_block_id:'' })
  const [relayStops, setRelayStops]     = useState([]) // extra Amazon Relay delivery stops
  const [addParsing, setAddParsing]     = useState(false)
  const addFileRef = useRef(null)

  const sel = selected ? loads.find(l => l.id === selected) : null

  // calc inputs with defaults
  const ci = sel ? (calcInputs[sel.id] || { mpg: 6.8, fuelPrice: 3.89, driverPct: 28, otherCosts: 0 }) : {}
  const setCI = (field, val) => setCalcInputs(prev => ({ ...prev, [sel.id]: { ...ci, [field]: val } }))

  // live profit calc
  const calcFuel      = sel ? Math.round((sel.miles / ci.mpg) * ci.fuelPrice) : 0
  const calcDriverPay = sel ? Math.round(sel.gross * (ci.driverPct / 100)) : 0
  const calcOther     = sel ? (parseFloat(ci.otherCosts) || 0) : 0
  const calcNet       = sel ? sel.gross - calcFuel - calcDriverPay - calcOther : 0
  const calcNetPerMile = sel && sel.miles > 0 ? (calcNet / sel.miles).toFixed(2) : '0.00'
  const calcMargin     = sel && sel.gross > 0 ? ((calcNet / sel.gross) * 100).toFixed(1) : '0.0'

  const EQUIP_TYPES = ['All', 'Dry Van', 'Reefer', 'Flatbed', 'Tanker']
  const FILTER_TABS = ['All', 'AI Top Picks', 'Fast Pay', 'Best Rate']

  const filtered = loads.filter(l => {
    const matchEq    = equipment === 'All' || l.equipment === equipment
    const matchOrig  = !searchOrigin || l.fromFull.toLowerCase().includes(searchOrigin.toLowerCase()) || l.from.toLowerCase().includes(searchOrigin.toLowerCase())
    const matchDest  = !searchDest   || l.toFull.toLowerCase().includes(searchDest.toLowerCase())   || l.to.toLowerCase().includes(searchDest.toLowerCase())
    const matchFilter = filter === 'All' ? true
      : filter === 'AI Top Picks' ? l.aiScore >= 88
      : filter === 'Fast Pay'        ? l.tags.includes('FAST PAY')
      : filter === 'Best Rate'       ? l.rpm >= l.mktAvg
      : true
    return matchEq && matchOrig && matchDest && matchFilter
  })

  const avgScore = filtered.length ? Math.round(filtered.reduce((s,l)=>s+l.aiScore,0)/filtered.length) : 0
  const bestNet  = filtered.length ? Math.max(...filtered.map(l => {
    const f = l.miles/6.8*3.89; const d = l.gross*0.28; return l.gross-f-d
  })) : 0

  // AI score breakdown computed from load fields
  const scoreBreakdown = sel ? [
    { label:'Rate vs Market',    score: sel.rpm >= sel.mktHigh ? 25 : sel.rpm >= sel.mktAvg ? 20 : sel.rpm >= sel.mktLow ? 14 : 8,  max:25, color:'var(--accent)' },
    { label:'Broker Reliability',score: Math.round(sel.brokerScore * 0.20), max:20, color:'var(--accent2)' },
    { label:'Deadhead Penalty',  score: sel.deadhead < 15 ? 20 : sel.deadhead < 30 ? 15 : sel.deadhead < 50 ? 8 : 3, max:20, color:'var(--warning)' },
    { label:'Lane Familiarity',  score: ctxLoads.some(l => l.origin?.includes(sel.from) || l.dest?.includes(sel.to)) ? 18 : 10, max:18, color:'var(--accent3)' },
    { label:'Equipment Match',   score: sel.equipment === 'Dry Van' ? 12 : sel.equipment === 'Reefer' ? 11 : 10, max:12, color:'var(--success)' },
    { label:'Fleet Availability',score: dispatchDrivers.some(d=>d.status==='Available') ? 5 : 2, max:5, color:'var(--muted)' },
  ] : []

  const computedScore = scoreBreakdown.reduce((s,x) => s+x.score, 0)

  // Book a load → addLoad() into context
  const confirmBook = () => {
    if (!bookModal || !bookDriver) return
    const l = bookModal
    addLoad({
      broker:    l.broker,
      origin:    l.fromFull,
      dest:      l.toFull,
      miles:     l.miles,
      rate:      l.rpm,
      gross:     l.gross,
      weight:    l.weight,
      commodity: l.commodity,
      pickup:    l.pickup,
      delivery:  l.delivery,
      driver:    bookDriver,
      refNum:    l.id,
    })
    setLoads(ls => ls.filter(x => x.id !== l.id))
    setSelected(null)
    setBookModal(null)
    setBookDriver('')
    showToast('', 'Load Booked!', `${l.fromFull} → ${l.toFull} · $${l.gross.toLocaleString()} · ${bookDriver}`)
  }

  // ── Add Load: compress + AI parse rate con ──
  const compressAddImg = (file) => new Promise((resolve) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const reader = new FileReader()
      reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: 'application/pdf' })
      reader.readAsDataURL(file)
      return
    }
    const img = new Image()
    img.onload = () => {
      const maxW = 1200; let w = img.width, h = img.height
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
      const c = document.createElement('canvas'); c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve({ b64: c.toDataURL('image/jpeg', 0.85).split(',')[1], mt: 'image/jpeg' })
    }
    img.onerror = () => {
      const reader = new FileReader()
      reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: file.type || 'image/jpeg' })
      reader.readAsDataURL(file)
    }
    img.src = URL.createObjectURL(file)
  })

  const parseAddRC = async (file) => {
    if (!file) return
    setAddParsing(true)
    showToast('','Reading Rate Con','Compressing and sending to AI...')
    try {
      const { b64, mt } = await compressAddImg(file)
      if (!b64 || b64.length < 50) { showToast('','Error','Could not read file'); setAddParsing(false); return }
      const res = await apiFetch('/api/parse-ratecon', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ file: b64, mediaType: mt })
      })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = null }
      if (data && !data.error) {
        setAddForm(f => ({
          ...f,
          origin: data.origin || f.origin,
          dest: data.destination || f.dest,
          gross: data.rate ? String(data.rate) : f.gross,
          weight: data.weight ? String(data.weight) : f.weight,
          equipment: data.equipment || f.equipment,
          pickup: data.pickup_date || f.pickup,
          delivery: data.delivery_date || f.delivery,
          commodity: data.commodity || f.commodity,
          notes: data.notes || f.notes,
        }))
        showToast('','Rate Con Parsed',`${data.origin || ''} → ${data.destination || ''} · $${data.rate || '—'}`)
      } else {
        showToast('','Parse Error', data?.error || 'Could not read rate con')
      }
    } catch(err) { showToast('','Error', err?.message || 'Failed') }
    setAddParsing(false)
  }

  const submitAddLoad = () => {
    if (!addForm.origin || !addForm.dest || !addForm.gross) {
      showToast('','Missing Fields','Origin, destination, and rate are required')
      return
    }
    const isRelay = addSource === 'amazon_relay'
    const lastDest = relayStops.length > 0 ? relayStops[relayStops.length - 1].facility : addForm.dest
    const loadData = {
      broker: isRelay ? 'Amazon Relay' : (addForm.broker || 'Direct'),
      origin: addForm.origin,
      dest: isRelay && relayStops.length > 0 ? lastDest : addForm.dest,
      miles: parseInt(addForm.miles) || 0,
      rate: addForm.miles ? (parseFloat(addForm.gross) / parseInt(addForm.miles)).toFixed(2) : 0,
      gross: parseFloat(addForm.gross) || 0,
      weight: parseInt(addForm.weight) || 0,
      commodity: addForm.commodity,
      pickup: addForm.pickup || new Date().toISOString().split('T')[0],
      delivery: addForm.delivery,
      driver: addForm.driver || '',
      notes: isRelay ? `Amazon Block: ${addForm.amazon_block_id || 'N/A'}${relayStops.length > 0 ? ` | ${relayStops.length + 1} stops` : ''}${addForm.notes ? ' | ' + addForm.notes : ''}` : addForm.notes,
      equipment: isRelay ? 'Dry Van' : addForm.equipment,
      load_source: isRelay ? 'amazon_relay' : 'broker',
      amazon_block_id: isRelay ? addForm.amazon_block_id : null,
      payment_terms: isRelay ? 'biweekly' : null,
    }

    // Multi-stop: use addLoadWithStops for any load with extra stops
    if (relayStops.length > 0 && addLoadWithStops) {
      const stops = [
        { type: 'pickup', facility_name: addForm.origin, city: addForm.origin, scheduled_date: addForm.pickup || null, sequence: 1 },
        { type: 'delivery', facility_name: addForm.dest, city: addForm.dest, scheduled_date: addForm.delivery || null, sequence: 2 },
        ...relayStops.map((s, i) => ({
          type: s.type || 'delivery', facility_name: s.facility, city: s.facility, scheduled_date: null, sequence: i + 3,
        })),
      ]
      addLoadWithStops(loadData, stops)
    } else {
      addLoad(loadData)
    }

    const stopLabel = relayStops.length > 0 ? ` (${relayStops.length + 1} stops)` : ''
    const label = isRelay ? 'Amazon Relay Load Added' : 'Load Added'
    showToast('', label, `${addForm.origin} → ${lastDest}${stopLabel} · $${parseFloat(addForm.gross).toLocaleString()}`)
    setAddForm({ broker:'', origin:'', dest:'', miles:'', gross:'', rate:'', weight:'', commodity:'', pickup:'', delivery:'', equipment:'Dry Van', driver:'', notes:'', amazon_block_id:'' })
    setRelayStops([])
    setAddSource('broker')
    setAddModal(false)
  }

  // AI Copilot send message for selected load
  const sendCopilot = async (text) => {
    if (!sel) return
    const userText = text || aiInput.trim()
    if (!userText) return
    setAiInput('')
    const prev = aiMessages[sel.id] || []
    const next = [...prev, { role:'user', content: userText }]
    setAiMessages(m => ({ ...m, [sel.id]: next }))
    setAiLoading(true)
    // Build context: this load + carrier snapshot
    const ctxCompleted = ctxLoads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
    const avgRPM = ctxCompleted.length ? (ctxCompleted.reduce((s,l)=>s+(l.rate||0),0)/ctxCompleted.length).toFixed(2) : 'N/A'
    const sameLane = ctxCompleted.filter(l => l.origin?.includes(sel.from) || l.dest?.includes(sel.to))
    const context = [
      `LOAD BEING EVALUATED:`,
      `Route: ${sel.fromFull} → ${sel.toFull} (${sel.miles} miles)`,
      `Gross: $${sel.gross} | RPM: $${sel.rpm.toFixed(2)} | Equipment: ${sel.equipment}`,
      `Broker: ${sel.broker} (score ${sel.brokerScore}) | Pay speed: ${sel.brokerPay}`,
      `Deadhead: ${sel.deadhead} miles | Commodity: ${sel.commodity}`,
      `Market rate range: $${sel.mktLow}–$${sel.mktHigh}/mi | Posted at: $${sel.rpm.toFixed(2)}/mi`,
      `Est. fuel cost: $${calcFuel} | Est. driver pay: $${calcDriverPay} | Est. net: $${calcNet}`,
      ``,
      `CARRIER SNAPSHOT:`,
      `Revenue MTD: $${totalRevenue.toLocaleString()} | Completed loads: ${ctxCompleted.length}`,
      `Fleet avg RPM: $${avgRPM} | Same-lane history: ${sameLane.length} loads`,
      `Available drivers: ${dispatchDrivers.filter(d=>d.status==='Available').map(d=>d.name+' ('+d.hos+' HOS, '+d.location+')').join(', ')}`,
    ].join('\n')
    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context, language: currentLang }),
      })
      const data = await res.json()
      const rawReply = data.reply || data.error || ''
      const cleanReply = rawReply.replace(/```action\s*\n?[\s\S]*?```/g, '').trim()
      setAiMessages(m => ({ ...m, [sel.id]: [...next, { role:'assistant', content: cleanReply }] }))
    } catch {
      setAiMessages(m => ({ ...m, [sel.id]: [...next, { role:'assistant', content:'AI assistant unavailable — please try again later.' }] }))
    } finally {
      setAiLoading(false)
    }
  }

  const msgs = sel ? (aiMessages[sel.id] || []) : []
  const tagColor = t => t.includes('URGENT')||t.includes('DEAD')||t.includes('SLOW') ? 'var(--danger)' : t==='AI TOP PICK' ? 'var(--accent)' : t==='FAST PAY' ? 'var(--success)' : 'var(--accent2)'

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto', background:'var(--bg)' }}>

      {/* ── PANEL 1: LOAD LIST ── */}
      <div style={{ width: sel ? 360 : '100%', minWidth: 340, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)', height:'100%', overflowY:'auto', overflowX:'hidden', flexShrink:0 }}>

        {/* Search bar + Add Load */}
        <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', gap:6 }}>
          <input value={searchOrigin} onChange={e=>setSearchOrigin(e.target.value)} placeholder="Origin city…"
            style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:11, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
          <span style={{ color:'var(--muted)', alignSelf:'center', fontSize:12 }}>→</span>
          <input value={searchDest} onChange={e=>setSearchDest(e.target.value)} placeholder="Destination…"
            style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:11, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
          <button onClick={() => { setSearchOrigin(''); setSearchDest('') }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14, padding:'0 4px' }}>✕</button>
          <button onClick={() => setAddModal(true)} className="btn btn-primary" style={{ padding:'5px 12px', fontSize:11, fontWeight:700, whiteSpace:'nowrap', borderRadius:6 }}>
            <Plus size={12} /> Add Load
          </button>
        </div>

        {/* Equipment + filter tabs */}
        <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', gap:4 }}>
            {EQUIP_TYPES.map(eq => (
              <button key={eq} onClick={()=>setEquipment(eq)}
                style={{ padding:'3px 9px', borderRadius:12, border:'1px solid var(--border)', background: equipment===eq ? 'var(--surface3)' : 'transparent', color: equipment===eq ? 'var(--text)' : 'var(--muted)', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                {eq}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {FILTER_TABS.map(f => (
              <button key={f} onClick={()=>setFilter(f)}
                style={{ padding:'3px 9px', borderRadius:12, border:'1px solid var(--border)', background: filter===f ? 'var(--accent)' : 'transparent', color: filter===f ? '#000' : 'var(--muted)', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', borderBottom:'1px solid var(--border)' }}>
          {[
            { label:'Loads', value: filtered.length },
            { label:'Avg Score', value: avgScore },
            { label:'Best Net', value: '$'+Math.round(bestNet).toLocaleString() },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center', padding:'8px 0', borderRight:'1px solid var(--border)' }}>
              <div style={{ fontSize:16, fontFamily:"'Bebas Neue',sans-serif", color:'var(--accent)' }}>{s.value}</div>
              <div style={{ fontSize:9, color:'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Load rows */}
        <div style={{ overflowY:'auto', flex:1, minHeight:0 }}>
          {filtered.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No loads match your search.</div>
          )}
          {filtered.map(load => {
            const isActive = selected === load.id
            const sc = load.aiScore >= 88 ? 'var(--success)' : load.aiScore >= 70 ? 'var(--warning)' : 'var(--danger)'
            const aboveMarket = load.rpm >= load.mktAvg
            return (
              <div key={load.id} onClick={() => setSelected(isActive ? null : load.id)}
                style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer', background: isActive ? 'rgba(240,165,0,0.05)' : 'transparent', borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`, transition:'all 0.12s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:5 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, marginBottom:2 }}>
                      {load.from} <span style={{ color:'var(--muted)' }}>→</span> {load.to}
                      <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400, marginLeft:5 }}>{(load.miles||0).toLocaleString()}mi</span>
                    </div>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {load.tags.map(t => <span key={t} style={{ ...S.tag(tagColor(t)), fontSize:8 }}>{t}</span>)}
                      {aboveMarket && <span style={{ ...S.tag('var(--success)'), fontSize:8 }}>ABOVE MARKET</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:6, flexShrink:0, marginLeft:8 }}>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--accent)', lineHeight:1 }}>${(load.gross||0).toLocaleString()}</div>
                      <div style={{ fontSize:10, color: aboveMarket ? 'var(--success)' : 'var(--muted)', fontWeight: aboveMarket ? 700 : 400 }}>${(load.rpm||0).toFixed(2)}/mi</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setLoads(prev => prev.filter(x => x.id !== load.id)); if (selected === load.id) setSelected(null) }}
                      title="Dismiss load"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:14, padding:'0 2px', lineHeight:1, opacity:0.5 }}
                      onMouseEnter={e => e.target.style.opacity=1} onMouseLeave={e => e.target.style.opacity=0.5}>✕</button>
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{load.equipment} · {load.commodity} · {load.pickup}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:sc }}>AI {load.aiScore}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* DAT source badge */}
        <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, background:'var(--surface)' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--success)' }}/>
          <span style={{ fontSize:10, color:'var(--muted)' }}>No live data — connect DAT API in Settings</span>
        </div>
      </div>

      {/* ── PANEL 2: LOAD DETAIL + PROFIT CALC ── */}
      {sel && (
        <div style={{ width:400, flexShrink:0, overflowY:'auto', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
          <div style={{ flex:1, padding:16, display:'flex', flexDirection:'column', gap:12 }}>

            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:0.5, lineHeight:1.1 }}>
                  {sel.fromFull} <span style={{ color:'var(--accent)' }}>→</span> {sel.toFull}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sel.id} · {(sel.miles||0).toLocaleString()} mi · {sel.equipment} · {sel.commodity}</div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize:16, flexShrink:0 }} onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Market rate bar */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:8 }}>RATE vs MARKET (DAT RATEVIEW)</div>
              <div style={{ position:'relative', height:20, background:'var(--surface2)', borderRadius:10, marginBottom:6 }}>
                {/* market range bar */}
                {(() => {
                  const min = sel.mktLow - 0.3, max = sel.mktHigh + 0.3, range = max - min
                  const lowPct  = ((sel.mktLow  - min) / range) * 100
                  const highPct = ((sel.mktHigh - min) / range) * 100
                  const rpmPct  = Math.max(0, Math.min(100, ((sel.rpm - min) / range) * 100))
                  return (<>
                    <div style={{ position:'absolute', left:`${lowPct}%`, width:`${highPct-lowPct}%`, height:'100%', background:'rgba(240,165,0,0.15)', borderRadius:10 }}/>
                    <div style={{ position:'absolute', left:`${rpmPct}%`, top:0, width:3, height:'100%', background: sel.rpm >= sel.mktAvg ? 'var(--success)' : 'var(--warning)', borderRadius:2, transform:'translateX(-50%)' }}/>
                  </>)
                })()}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)' }}>
                <span>Low ${sel.mktLow.toFixed(2)}</span>
                <span style={{ color: sel.rpm >= sel.mktAvg ? 'var(--success)' : 'var(--warning)', fontWeight:700 }}>
                  Posted ${sel.rpm.toFixed(2)}/mi {sel.rpm >= sel.mktAvg ? '↑ above avg' : '↓ below avg'}
                </span>
                <span>High ${sel.mktHigh.toFixed(2)}</span>
              </div>
            </div>

            {/* AI Score breakdown */}
            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.25)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:700 }}><Ic icon={Bot} /> AI Match Score</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color: computedScore>=80?'var(--success)':computedScore>=60?'var(--warning)':'var(--danger)', lineHeight:1 }}>{computedScore}/100</div>
              </div>
              {scoreBreakdown.map(s => (
                <div key={s.label} style={{ marginBottom:7 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:2 }}>
                    <span style={{ color:'var(--muted)' }}>{s.label}</span>
                    <span style={{ color:s.color, fontWeight:700 }}>{s.score}/{s.max}</span>
                  </div>
                  <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                    <div style={{ height:'100%', width:`${(s.score/s.max)*100}%`, background:s.color, borderRadius:2, transition:'width 0.5s' }}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Editable profit calculator */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:12, fontWeight:700 }}><Ic icon={DollarSign} /> Profit Calculator</div>
                <span style={{ fontSize:10, color:'var(--muted)' }}>Edit any field</span>
              </div>
              {/* Editable inputs */}
              <div style={{ padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, borderBottom:'1px solid var(--border)' }}>
                {[
                  { label:'Fuel Price ($/gal)', field:'fuelPrice', step:'0.01', min:'2', max:'8' },
                  { label:'MPG', field:'mpg', step:'0.1', min:'3', max:'12' },
                  { label:'Driver Pay (%)', field:'driverPct', step:'1', min:'0', max:'50' },
                  { label:'Other Costs ($)', field:'otherCosts', step:'10', min:'0', max:'5000' },
                ].map(inp => (
                  <div key={inp.field}>
                    <div style={{ fontSize:9, color:'var(--muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:1 }}>{inp.label}</div>
                    <input type="number" step={inp.step} min={inp.min} max={inp.max}
                      value={ci[inp.field] ?? (inp.field==='fuelPrice'?3.89:inp.field==='mpg'?6.8:inp.field==='driverPct'?28:0)}
                      onChange={e => setCI(inp.field, parseFloat(e.target.value) || 0)}
                      style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', color:'var(--text)', fontSize:12, fontFamily:"'Bebas Neue',sans-serif", outline:'none', boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>
              {/* Results */}
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  { label:'Gross Revenue', value:'$'+(sel.gross||0).toLocaleString(), color:'var(--accent)', big:true },
                  { label:`Fuel (${sel.miles}mi ÷ ${ci.mpg||6.8}mpg × $${ci.fuelPrice||3.89})`, value:'−$'+calcFuel.toLocaleString(), color:'var(--danger)' },
                  { label:`Driver Pay (${ci.driverPct||28}%)`, value:'−$'+calcDriverPay.toLocaleString(), color:'var(--danger)' },
                  { label:'Other Costs', value:`−$${calcOther}`, color:'var(--muted)' },
                ].map(row => (
                  <div key={row.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontSize:11, color:'var(--muted)' }}>{row.label}</span>
                    <span style={{ fontFamily: row.big?"'Bebas Neue',sans-serif":"'DM Sans',sans-serif", fontSize: row.big?20:12, color:row.color }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0' }}>
                  <span style={{ fontSize:12, fontWeight:700 }}>Est. Net Profit</span>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color: calcNet > 0 ? 'var(--success)' : 'var(--danger)' }}>${calcNet.toLocaleString()}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div style={{ background:'var(--surface2)', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>NET PER MILE</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent2)' }}>${calcNetPerMile}</div>
                  </div>
                  <div style={{ background:'var(--surface2)', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>MARGIN</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: parseFloat(calcMargin)>=30?'var(--success)':parseFloat(calcMargin)>=20?'var(--warning)':'var(--danger)' }}>{calcMargin}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Broker + Deadhead */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:6 }}>BROKER</div>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>{sel.broker}</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color: sel.brokerScore>=90?'var(--success)':sel.brokerScore>=75?'var(--warning)':'var(--danger)', lineHeight:1, marginBottom:2 }}>{sel.brokerScore}</div>
                <div style={{ fontSize:9, color:'var(--muted)', marginBottom:6 }}>Risk Score</div>
                <div style={{ fontSize:11, color:'var(--accent2)' }}>Pays {sel.brokerPay}</div>
              </div>
              <div style={{ background:'var(--surface)', border:`1px solid ${sel.deadhead>40?'rgba(239,68,68,0.3)':'var(--border)'}`, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:6 }}>DEADHEAD</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color: sel.deadhead<20?'var(--success)':sel.deadhead<40?'var(--warning)':'var(--danger)', lineHeight:1, marginBottom:2 }}>{sel.deadhead} mi</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                  {sel.deadhead<20 ? 'Excellent' : sel.deadhead<40 ? 'Moderate' : 'High — $'+Math.round(sel.deadhead*0.55)+' cost'}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0', fontSize:13 }}
                onClick={() => { setBookModal(sel); setBookDriver('') }}>
                <Zap size={13} /> Book Load — ${sel.rpm.toFixed(2)}/mi
              </button>
              <button className="btn btn-ghost" style={{ padding:'11px 14px', fontSize:13 }}
                onClick={() => showToast('', 'Saved', sel.id + ' added to watchlist')}>
                <Ic icon={Bookmark} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PANEL 3: AI COPILOT CHAT ── */}
      {sel && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:300, borderLeft:'1px solid var(--border)' }}>
          {/* Header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'linear-gradient(135deg,rgba(240,165,0,0.07),rgba(0,212,170,0.04))', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(240,165,0,0.15)', border:'1px solid rgba(240,165,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}><Bot size={20} /></div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>AI Dispatch Copilot</div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>Analyzing {sel.from}→{sel.to} · ${sel.rpm.toFixed(2)}/mi</div>
            </div>
            <div style={{ marginLeft:'auto', width:8, height:8, borderRadius:'50%', background:'var(--success)' }}/>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
            {msgs.length === 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', fontSize:12, lineHeight:1.6 }}>
                  <div style={{ fontWeight:700, color:'var(--accent)', marginBottom:6 }}><Ic icon={Bot} /> Ready to analyze this load</div>
                  <div style={{ color:'var(--muted)' }}>
                    I see a <b style={{ color:'var(--text)' }}>{sel.equipment}</b> load from <b style={{ color:'var(--text)' }}>{sel.fromFull}</b> to <b style={{ color:'var(--text)' }}>{sel.toFull}</b> at <b style={{ color: sel.rpm>=sel.mktAvg?'var(--success)':'var(--warning)' }}>${sel.rpm.toFixed(2)}/mi</b> ({sel.rpm>=sel.mktAvg?'above':'below'} market avg of ${sel.mktAvg.toFixed(2)}).
                    {' '}Est. net: <b style={{ color:'var(--success)' }}>${calcNet.toLocaleString()}</b>. Ask me anything.
                  </div>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', padding:'4px 0' }}>Try asking:</div>
                {COPILOT_SUGGESTIONS(sel).map(q => (
                  <button key={q} onClick={() => sendCopilot(q)}
                    style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:11, color:'var(--text)', cursor:'pointer', textAlign:'left', fontFamily:"'DM Sans',sans-serif", lineHeight:1.4, transition:'border-color 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
                    onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m,i) => (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.role==='user'?'flex-end':'flex-start' }}>
                <div style={{ maxWidth:'88%', padding:'9px 12px', borderRadius: m.role==='user'?'12px 12px 4px 12px':'12px 12px 12px 4px', background: m.role==='user'?'var(--accent)':'var(--surface2)', color: m.role==='user'?'#000':'var(--text)', fontSize:12, lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                  {m.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ display:'flex', gap:4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:`pulse 1s ease-in-out ${i*0.2}s infinite` }}/>)}
                </div>
                <span style={{ fontSize:10, color:'var(--muted)' }}>Analyzing…</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8, flexShrink:0 }}>
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)}
              onKeyDown={e => e.key==='Enter' && !e.shiftKey && sendCopilot()}
              placeholder="Ask about this load…"
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
            <button onClick={() => sendCopilot()} disabled={aiLoading || !aiInput.trim()}
              style={{ background:'var(--accent)', border:'none', borderRadius:8, padding:'8px 14px', color:'#000', fontWeight:700, cursor:'pointer', fontSize:12, opacity: aiLoading||!aiInput.trim()?0.5:1 }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* ── ADD LOAD MODAL ── */}
      {addModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setAddModal(false)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, width:520, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:4 }}>Add Load</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>Drop a rate con to auto-fill or enter manually</div>

            {/* Source Toggle */}
            <div style={{ display:'flex', gap:0, marginBottom:16, background:'var(--surface2)', borderRadius:10, padding:3, border:'1px solid var(--border)' }}>
              {[
                { id:'broker', label:'Broker Load', icon:'📋' },
                { id:'amazon_relay', label:'Amazon Relay', icon:'📦' },
              ].map(s => (
                <button key={s.id} onClick={() => setAddSource(s.id)}
                  style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer',
                    background: addSource===s.id ? (s.id==='amazon_relay' ? 'rgba(255,153,0,0.15)' : 'var(--accent)15') : 'transparent',
                    color: addSource===s.id ? (s.id==='amazon_relay' ? '#ff9900' : 'var(--accent)') : 'var(--muted)',
                    fontWeight: addSource===s.id ? 700 : 500, fontSize:12, fontFamily:"'DM Sans',sans-serif",
                    transition:'all 0.15s' }}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>

            {/* Rate Con Upload — only for broker loads */}
            {addSource === 'broker' && (<>
            {/* Amazon Relay info banner — hidden, this is the broker branch */}
            </>)}
            {addSource === 'amazon_relay' && (
              <div style={{ padding:'10px 14px', background:'rgba(255,153,0,0.08)', border:'1px solid rgba(255,153,0,0.2)', borderRadius:10, marginBottom:16, fontSize:12, color:'#ff9900' }}>
                <div style={{ fontWeight:700, marginBottom:4 }}>Amazon Relay Load</div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>Quick-add your Relay block. Payment tracked as biweekly. Equipment defaults to Dry Van.</div>
              </div>
            )}

            {/* Rate Con Upload */}
            <input ref={addFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display:'none' }}
              onChange={e => { if (e.target.files?.[0]) parseAddRC(e.target.files[0]) }} />
            <div onClick={() => addFileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--accent)' }}
              onDragLeave={e => { e.currentTarget.style.borderColor='var(--border)' }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--border)'; parseAddRC(e.dataTransfer.files[0]) }}
              style={{ padding:'14px 16px', border:'1px dashed var(--border)', borderRadius:10, textAlign:'center', cursor:'pointer', marginBottom:16, transition:'border-color 0.2s', background: addParsing ? 'rgba(240,165,0,0.04)' : 'transparent' }}
              onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
              onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
              {addParsing ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span style={{ width:14, height:14, border:'2px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--accent)' }}>AI reading rate con...</span>
                </div>
              ) : (
                <>
                  <Upload size={20} style={{ color:'var(--accent)', marginBottom:4 }} />
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>Drop Rate Con Here</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>PDF, PNG, or JPG — AI will auto-fill all fields</div>
                </>
              )}
            </div>

            {/* Form fields */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              {(addSource === 'amazon_relay' ? [
                { key:'amazon_block_id', label:'Amazon Block ID', ph:'e.g. BLK-1234567' },
                { key:'origin', label:'Pickup Facility *', ph:'e.g. DFW7, ONT2' },
                { key:'dest', label:'Delivery Facility *', ph:'e.g. SBD1, LAX9' },
                { key:'gross', label:'Rate ($) *', ph:'850', type:'number' },
                { key:'miles', label:'Miles', ph:'350', type:'number' },
                { key:'pickup', label:'Pickup Date/Time', ph:'', type:'date' },
                { key:'delivery', label:'Delivery Date/Time', ph:'', type:'date' },
              ] : [
                { key:'broker', label:'Broker', ph:'e.g. TQL, CH Robinson' },
                { key:'equipment', label:'Equipment', ph:'Dry Van' },
                { key:'origin', label:'Origin *', ph:'City, ST' },
                { key:'dest', label:'Destination *', ph:'City, ST' },
                { key:'gross', label:'Rate ($) *', ph:'3500', type:'number' },
                { key:'miles', label:'Miles', ph:'1200', type:'number' },
                { key:'weight', label:'Weight (lbs)', ph:'42000', type:'number' },
                { key:'commodity', label:'Commodity', ph:'Electronics' },
                { key:'pickup', label:'Pickup Date', ph:'', type:'date' },
                { key:'delivery', label:'Delivery Date', ph:'', type:'date' },
              ]).map(f => (
                <div key={f.key}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, letterSpacing:0.5 }}>{f.label}</div>
                  {f.key === 'equipment' ? (
                    <select value={addForm.equipment} onChange={e => setAddForm(p => ({ ...p, equipment: e.target.value }))}
                      style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
                      {['Dry Van','Reefer','Flatbed','Step Deck','Power Only','Conestoga','Hotshot'].map(eq => <option key={eq}>{eq}</option>)}
                    </select>
                  ) : (
                    <input type={f.type||'text'} placeholder={f.ph} value={addForm[f.key]}
                      onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }} />
                  )}
                </div>
              ))}
            </div>

            {/* Multi-Stop */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:6, letterSpacing:0.5 }}>
                {relayStops.length > 0 ? `ADDITIONAL STOPS (${relayStops.length})` : 'MULTI-STOP'}
              </div>
              {relayStops.map((stop, i) => (
                <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                  <select value={stop.type || 'delivery'} onChange={e => setRelayStops(s => s.map((st, idx) => idx === i ? { ...st, type: e.target.value } : st))}
                    style={{ width:80, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 6px', color:'var(--text)', fontSize:11, fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Drop</option>
                  </select>
                  <input placeholder={addSource === 'amazon_relay' ? 'e.g. LAX9, ONT2' : 'City, ST'} value={stop.facility}
                    onChange={e => setRelayStops(s => s.map((st, idx) => idx === i ? { ...st, facility: e.target.value } : st))}
                    style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }} />
                  <button onClick={() => setRelayStops(s => s.filter((_, idx) => idx !== i))}
                    style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:14, padding:'4px' }}>✕</button>
                </div>
              ))}
              <button onClick={() => setRelayStops(s => [...s, { facility:'', type:'delivery' }])}
                style={{ fontSize:11, fontWeight:600, color: addSource === 'amazon_relay' ? '#ff9900' : 'var(--accent)', background: addSource === 'amazon_relay' ? 'rgba(255,153,0,0.08)' : 'rgba(240,165,0,0.08)', border: `1px solid ${addSource === 'amazon_relay' ? 'rgba(255,153,0,0.2)' : 'rgba(240,165,0,0.2)'}`, borderRadius:6, padding:'6px 12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                + Add Stop
              </button>
            </div>

            {/* Driver */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, letterSpacing:0.5 }}>ASSIGN DRIVER</div>
              <select value={addForm.driver} onChange={e => setAddForm(p => ({ ...p, driver: e.target.value }))}
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
                <option value="">Unassigned</option>
                {dispatchDrivers.map(d => <option key={d.name} value={d.name}>{d.name} — {d.status} ({d.hos} HOS)</option>)}
              </select>
            </div>

            {/* Notes */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, letterSpacing:0.5 }}>NOTES</div>
              <textarea value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Special instructions..."
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none', resize:'vertical', boxSizing:'border-box' }} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2, padding:'11px 0', fontSize:13 }} onClick={submitAddLoad}>
                <Plus size={13} /> Add to Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOOK MODAL ── */}
      {bookModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setBookModal(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, width:420, boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:4 }}>
              Book Load
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>
              {bookModal.fromFull} → {bookModal.toFull} · {bookModal.miles.toLocaleString()}mi · ${bookModal.gross.toLocaleString()}
            </div>

            {/* Driver selection */}
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', letterSpacing:1, marginBottom:10 }}>SELECT DRIVER</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {dispatchDrivers.map(d => (
                <label key={d.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, border:`1px solid ${bookDriver===d.name?'var(--accent)':'var(--border)'}`, background: bookDriver===d.name?'rgba(240,165,0,0.06)':'var(--surface2)', cursor: d.status==='On Load'?'not-allowed':'pointer', opacity: d.status==='On Load'?0.5:1 }}>
                  <input type="radio" name="driver" value={d.name} disabled={d.status==='On Load'}
                    checked={bookDriver===d.name} onChange={() => setBookDriver(d.name)}
                    style={{ accentColor:'var(--accent)' }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{d.name} <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400 }}>· {d.unit}</span></div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{d.location} · {d.hos} HOS remaining</div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background: d.status==='Available'?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)', color: d.status==='Available'?'var(--success)':'var(--danger)' }}>{d.status}</span>
                </label>
              ))}
            </div>

            {/* Confirm summary */}
            {bookDriver && (
              <div style={{ background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:12 }}>
                <div style={{ color:'var(--accent)', fontWeight:700, marginBottom:6 }}><Ic icon={Check} /> Booking Summary</div>
                <div style={{ color:'var(--muted)', lineHeight:1.7 }}>
                  <b style={{ color:'var(--text)' }}>{bookDriver}</b> → {bookModal.fromFull} to {bookModal.toFull}<br/>
                  Pickup: {bookModal.pickup} · Gross: <b style={{ color:'var(--accent)' }}>${bookModal.gross.toLocaleString()}</b><br/>
                  Est. net: <b style={{ color:'var(--success)' }}>${calcNet.toLocaleString()}</b> ({calcMargin}% margin)
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setBookModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2, padding:'11px 0', fontSize:13 }}
                disabled={!bookDriver} onClick={confirmBook}>
                <Zap size={13} /> Confirm & Add to Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const CITIES = {
  'Atlanta, GA':   { x: 62, y: 66 }, 'Chicago, IL':   { x: 57, y: 42 },
  'Dallas, TX':    { x: 46, y: 72 }, 'Miami, FL':     { x: 68, y: 82 },
  'Denver, CO':    { x: 32, y: 50 }, 'Houston, TX':   { x: 47, y: 78 },
  'Memphis, TN':   { x: 57, y: 64 }, 'New York, NY':  { x: 77, y: 38 },
  'Phoenix, AZ':   { x: 20, y: 66 }, 'Los Angeles, CA':{ x: 10, y: 62 },
  'Omaha, NE':     { x: 46, y: 46 }, 'Minneapolis, MN':{ x: 50, y: 32 },
}
const STATUS_PROGRESS = { 'Rate Con Received':0.05, 'Assigned to Driver':0.10, 'En Route to Pickup':0.20, 'Loaded':0.45, 'In Transit':0.65, 'Delivered':1, 'Invoiced':1 }
const STATUS_LABEL = { 'Rate Con Received':'Ready', 'Assigned to Driver':'Assigned', 'En Route to Pickup':'En Route', 'Loaded':'Loaded', 'In Transit':'En Route', 'Delivered':'Delivered', 'Invoiced':'Delivered' }

// ─── STOP TIMELINE ─────────────────────────────────────────────────────────────
export function StopTimeline({ load, onAdvance }) {
  const { advanceStop } = useCarrier()
  const { showToast } = useApp()
  if (!load?.stops?.length) return null

  const stopTypeIcon  = { pickup: Package, dropoff: Flag }
  const stopTypeColor = { pickup:'var(--accent2)', dropoff:'var(--success)' }
  const statusColor   = { complete:'var(--success)', current:'var(--accent)', pending:'var(--muted)' }
  const statusIcon    = { complete: Check, current: CircleDot, pending: Square }
  const canAdvance    = load.status === 'In Transit' || load.status === 'Loaded' || load.status === 'Assigned to Driver' || load.status === 'En Route to Pickup'

  const handleAdvance = () => {
    advanceStop(load.loadId)
    const next = load.stops[load.currentStop + 1]
    showToast('', 'Stop Updated', next ? `En route to Stop ${next.seq}: ${next.city}` : 'Final delivery confirmed')
    if (onAdvance) onAdvance()
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontWeight:700, fontSize:13 }}><Ic icon={MapPin} /> Route · {load.stops.length} Stops</span>
        <span style={{ fontSize:10, padding:'2px 8px', background:'rgba(240,165,0,0.12)', color:'var(--accent)', borderRadius:6, fontWeight:800 }}>
          ALL-IN · ${load.gross?.toLocaleString()}
        </span>
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>
          Stop {(load.currentStop || 0) + 1} of {load.stops.length}
        </span>
      </div>

      <div style={{ padding:'14px 18px' }}>
        {load.stops.map((stop, idx) => {
          const isLast   = idx === load.stops.length - 1
          const sc       = stop.status || (idx < (load.currentStop||0) ? 'complete' : idx === (load.currentStop||0) ? 'current' : 'pending')
          const isCurrent = sc === 'current'

          return (
            <div key={stop.seq} style={{ display:'flex', gap:14, position:'relative' }}>
              {/* Vertical line */}
              {!isLast && (
                <div style={{ position:'absolute', left:9, top:22, bottom:-8, width:2,
                  background: sc === 'complete' ? 'var(--success)' : 'var(--border)' }}/>
              )}

              {/* Dot */}
              <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2,
                background: isCurrent ? 'var(--accent)' : sc === 'complete' ? 'var(--success)' : 'var(--surface2)',
                border: `2px solid ${statusColor[sc]}`,
                boxShadow: isCurrent ? '0 0 8px var(--accent)' : 'none',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, zIndex:1 }}>
                {sc === 'complete' ? '✓' : sc === 'current' ? '●' : stop.seq}
              </div>

              {/* Stop info */}
              <div style={{ flex:1, paddingBottom: isLast ? 0 : 18 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                  <span style={{ fontSize:10, fontWeight:800, padding:'1px 6px', borderRadius:5,
                    background: stopTypeColor[stop.type]+'18', color: stopTypeColor[stop.type],
                    textTransform:'uppercase', letterSpacing:0.5 }}>
                    {React.createElement(stopTypeIcon[stop.type], {size:10})} {stop.type}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize:9, fontWeight:800, color:'var(--accent)', background:'rgba(240,165,0,0.1)', padding:'1px 6px', borderRadius:5 }}>
                      ● CURRENT
                    </span>
                  )}
                </div>
                <div style={{ fontSize:13, fontWeight:700, color: isCurrent ? 'var(--text)' : sc === 'complete' ? 'var(--muted)' : 'var(--text)', marginBottom:2 }}>
                  {stop.city}
                </div>
                {stop.addr && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>{stop.addr}</div>}
                <div style={{ fontSize:11, color: isCurrent ? 'var(--accent)' : 'var(--muted)' }}><Ic icon={Calendar} /> {stop.time}</div>
                {stop.notes && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, fontStyle:'italic' }}><Ic icon={FileText} /> {stop.notes}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Advance stop button */}
      {canAdvance && (load.currentStop || 0) < load.stops.length - 1 && (
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, fontSize:11, color:'var(--muted)' }}>
            Next: <span style={{ color:'var(--text)', fontWeight:600 }}>{load.stops[(load.currentStop||0)+1]?.city}</span>
            {' · '}{load.stops[(load.currentStop||0)+1]?.time}
          </div>
          <button className="btn btn-primary" style={{ fontSize:11, padding:'6px 16px' }} onClick={handleAdvance}>
            <Check size={13} /> Confirm Stop & Advance
          </button>
        </div>
      )}
    </div>
  )
}

const LANES = [
  { id:'l1', from:'ATL', to:'CHI', fromFull:'Atlanta, GA', toFull:'Chicago, IL', miles:674, loads:0, avgRpm:2.94, topRpm:3.20, avgGross:0, trend:0, rating:'steady', ratingLabel:'EXAMPLE', color:'var(--muted)', brokers:['Echo Global'], backhaul:50, deadhead:0, equipment:'Dry Van' },
]

export function LaneIntel() {
  const { showToast } = useApp()
  const { loads } = useCarrier()
  const [selected, setSelected] = useState('l1')
  const [sortBy, setSortBy] = useState('rpm')

  // Compute real lane data from context loads
  const enrichedLanes = LANES.map(l => {
    const myLoads = loads.filter(ld =>
      ld.origin === l.fromFull && ld.dest === l.toFull
    )
    if (myLoads.length === 0) return l
    const realGrossAvg = Math.round(myLoads.reduce((s, ld) => s + ld.gross, 0) / myLoads.length)
    const realRpm = myLoads[0].miles > 0
      ? parseFloat((myLoads.reduce((s, ld) => s + ld.rate, 0) / myLoads.length).toFixed(2))
      : l.avgRpm
    return { ...l, loads: myLoads.length, avgRpm: realRpm, avgGross: realGrossAvg, _myLoads: myLoads }
  })

  const lane = enrichedLanes.find(l => l.id === selected) || enrichedLanes[0]
  const sorted = [...enrichedLanes].sort((a, b) => sortBy === 'rpm' ? b.avgRpm - a.avgRpm : sortBy === 'trend' ? b.trend - a.trend : b.loads - a.loads)
  if (!lane) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--muted)', fontSize:14 }}>No lane data available</div>
  }
  const laneHistory = lane._myLoads || []

  const estFuel = Math.round(lane.miles / 6.9 * 3.85)
  const estDriverPay = Math.round(lane.avgGross * 0.28)
  const estNet = lane.avgGross - estFuel - estDriverPay

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* Lane list sidebar */}
      <div style={{ width:220, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:4 }}>LANE INTEL ({enrichedLanes.length})</div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', color:'var(--text)', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>
            <option value="rpm">Sort: Rate/Mile ↓</option>
            <option value="trend">Sort: Trend ↓</option>
            <option value="loads">Sort: Load Count ↓</option>
          </select>
        </div>
        {sorted.map(l => {
          const isSel = selected === l.id
          return (
            <div key={l.id} onClick={() => setSelected(l.id)}
              style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{l.from} → {l.to}</div>
                <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:6, background:l.color+'18', color:l.color }}>{l.ratingLabel}</span>
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:3 }}>{l.miles} mi · {l.loads} loads</div>
              <div style={{ fontSize:13, fontWeight:700, color:l.color }}>${l.avgRpm}/mi avg</div>
              <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
                <span style={{ fontSize:10, color: l.trend > 0 ? 'var(--success)' : 'var(--danger)' }}>{l.trend > 0 ? '↑' : '↓'} {Math.abs(l.trend)}% rate trend</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail panel */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>
        {lane && (
          <>
            {/* Header */}
            <div style={{ flexShrink:0, padding:'14px 22px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:3 }}>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>{lane.fromFull} → {lane.toFull}</span>
                  <span style={{ fontSize:14 }}>{lane.rating === 'hot' ? <Flame size={14} /> : lane.rating === 'up' ? <TrendingUp size={14} /> : lane.rating === 'down' ? <TrendingDown size={14} /> : lane.rating === 'soft' ? <AlertTriangle size={14} /> : <ArrowRight size={14} />}</span>
                  <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:8, background:lane.color+'15', color:lane.color }}>{lane.ratingLabel}</span>
                </div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>{lane.miles} miles · {lane.equipment} · {lane.loads} loads in last 30 days</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','Saved','Lane ' + lane.from + '→' + lane.to + ' saved to watchlist')}><Ic icon={Star} /> Watch Lane</button>
                <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => showToast('','Dispatch','Opening AI Dispatch Copilot for ' + lane.from + '→' + lane.to)}><Ic icon={Zap} /> Find Load</button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'20px 20px 40px', display:'flex', flexDirection:'column', gap:16 }}>

              {/* Trend banner */}
              <div style={{ padding:'12px 18px', background: lane.trend > 0 ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)', border:`1px solid ${lane.trend > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:22 }}>{lane.trend > 8 ? <Flame size={22} /> : lane.trend > 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color: lane.trend > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    Rates {lane.trend > 0 ? 'up' : 'down'} {Math.abs(lane.trend)}% on {lane.from}→{lane.to} this week
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>
                    {lane.trend > 5 ? 'Book now — market window closing. Top RPM available: $' + lane.topRpm + '/mi' :
                     lane.trend < 0 ? 'Soft market — consider backhaul or alternate routing' :
                     'Stable market — good steady lane for consistent loads'}
                  </div>
                </div>
              </div>

              {/* KPIs */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12 }}>
                {[
                  { label:'Avg RPM',       value:'$' + lane.avgRpm + '/mi', color:'var(--accent)',  sub:'30-day avg' },
                  { label:'Top RPM',       value:'$' + lane.topRpm + '/mi', color:'var(--success)', sub:'Best spot rate' },
                  { label:'Avg Gross',     value:'$' + lane.avgGross.toLocaleString(), color:'var(--accent2)', sub:'Per load' },
                  { label:'Backhaul %',    value: lane.backhaul + '%',       color: lane.backhaul > 70 ? 'var(--success)' : 'var(--warning)', sub:'Return load avail' },
                  { label:'Deadhead',      value: lane.deadhead + ' mi',     color: lane.deadhead > 50 ? 'var(--danger)' : 'var(--success)', sub:'Avg empty miles' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.color, lineHeight:1 }}>{s.value}</div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Load economics + Brokers */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

                {/* Per-load economics */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={DollarSign} /> Load Economics · Avg Load</div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:0 }}>
                    {[
                      { label:'Gross Revenue',  value:'$' + lane.avgGross.toLocaleString(),                       color:'var(--accent)' },
                      { label:'Est. Fuel Cost', value:'−$' + estFuel.toLocaleString(),                             color:'var(--danger)' },
                      { label:'Driver Pay (28%)',value:'−$' + estDriverPay.toLocaleString(),                       color:'var(--danger)' },
                      { label:'Net Profit',      value:'$' + estNet.toLocaleString(),                              color:'var(--success)', bold:true },
                      { label:'Net / Mile',      value:'$' + (estNet / lane.miles).toFixed(2) + '/mi',             color:'var(--success)' },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: item.bold ? 22 : 18, color: item.color }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top brokers on this lane */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Briefcase} /> Brokers Active on This Lane</div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
                    {lane.brokers.map((b,i) => {
                      const scores = { 'Echo Global':98, 'Coyote Logistics':92, 'CH Robinson':87, 'Transplace':74, 'Worldwide Express':81, 'XPO':89 }
                      const pays   = { 'Echo Global':'< 24hr', 'Coyote Logistics':'< 48hr', 'CH Robinson':'< 3 days', 'Transplace':'< 7 days', 'Worldwide Express':'< 3 days', 'XPO':'< 48hr' }
                      const score = scores[b] || 80
                      const scoreC = score > 90 ? 'var(--success)' : score > 80 ? 'var(--accent2)' : 'var(--warning)'
                      return (
                        <div key={b} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--surface2)', borderRadius:8 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:i===0?'var(--success)':'var(--accent2)', flexShrink:0 }}/>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:700 }}>{b}</div>
                            <div style={{ fontSize:11, color:'var(--muted)' }}>Pays {pays[b] || '< 3 days'}</div>
                          </div>
                          <span style={{ fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:8, background:scoreC+'15', color:scoreC }}>Score {score}</span>
                          <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => showToast('','Contact',b + ' — opening broker details')}>Call</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Your load history on this lane */}
              {laneHistory.length > 0 && (
                <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
                    <Truck size={13} /> Your History on This Lane
                    <span style={{ fontSize:10, padding:'2px 8px', background:'rgba(240,165,0,0.12)', color:'var(--accent)', borderRadius:6, fontWeight:800 }}>{laneHistory.length} LOADS</span>
                  </div>
                  <div style={{ padding:'0 0 8px' }}>
                    {laneHistory.map(ld => {
                      const statusC = ld.status === 'Delivered' || ld.status === 'Invoiced' ? 'var(--success)' : ld.status === 'In Transit' ? 'var(--accent2)' : 'var(--muted)'
                      return (
                        <div key={ld.loadId} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 18px', borderBottom:'1px solid var(--border)' }}>
                          <div style={{ width:6, height:6, borderRadius:'50%', background:statusC, flexShrink:0 }}/>
                          <div style={{ width:80, fontSize:12, fontWeight:700, color:'var(--accent)' }}>{ld.loadId}</div>
                          <div style={{ flex:1, fontSize:11, color:'var(--muted)' }}>{ld.driver} · {ld.pickup?.split(' · ')[0]}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:'var(--accent2)' }}>${ld.rate}/mi</div>
                          <div style={{ fontSize:12, fontWeight:700 }}>${ld.gross.toLocaleString()}</div>
                          <span style={{ fontSize:10, padding:'2px 7px', borderRadius:6, background:statusC+'15', color:statusC, fontWeight:700 }}>{ld.status}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 6-week RPM trend chart */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={TrendingUp} /> Rate Trend — {lane.from}→{lane.to} · Last 6 Weeks</div>
                <div style={{ padding:'16px 20px 20px' }}>
                  {(() => {
                    const base = lane.avgRpm
                    const trendFactor = lane.trend / 100
                    const weekly = [
                      base * (1 - trendFactor * 2.5),
                      base * (1 - trendFactor * 2),
                      base * (1 - trendFactor * 1.2),
                      base * (1 - trendFactor * 0.5),
                      base * (1 + trendFactor * 0.3),
                      base * (1 + trendFactor),
                    ]
                    const maxR = Math.max(...weekly)
                    const minR = Math.min(...weekly)
                    const BAR_MAX = 80
                    return (
                      <div style={{ display:'flex', alignItems:'flex-end', gap:10 }}>
                        {weekly.map((v, i) => {
                          const h = Math.max(8, ((v - minR) / (maxR - minR + 0.01)) * BAR_MAX)
                          const isLast = i === weekly.length - 1
                          return (
                            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                              <div style={{ fontSize:10, fontWeight: isLast ? 700 : 400, color: isLast ? 'var(--accent)' : 'var(--muted)' }}>${v.toFixed(2)}</div>
                              <div style={{ width:'70%', height:`${h}px`, background: isLast ? 'var(--accent)' : 'var(--surface2)', border:`1px solid ${isLast ? 'var(--accent)' : 'var(--border)'}`, borderRadius:'3px 3px 0 0' }}/>
                              <div style={{ fontSize:10, color:'var(--muted)' }}>W{i+1}</div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── COMMAND CENTER ────────────────────────────────────────────────────────────

const CITY_XY = {
  'Atlanta, GA':      [695, 540],
  'Chicago, IL':      [610, 335],
  'Dallas, TX':       [525, 600],
  'Miami, FL':        [718, 666],
  'Memphis, TN':      [625, 510],
  'New York, NY':     [790, 295],
  'Denver, CO':       [400, 425],
  'Houston, TX':      [538, 648],
  'Phoenix, AZ':      [305, 558],
  'Los Angeles, CA':  [208, 510],
  'Minneapolis, MN':  [558, 278],
}

const CC_COLOR = {}
const CC_UNIT  = {}
const CC_HOS   = {}
const CC_PROG  = { 'Rate Con Received':0.05, 'Assigned to Driver':0.15, 'En Route to Pickup':0.30, 'Loaded':0.45, 'In Transit':0.65, 'Delivered':1.0 }

// Gantt: 7 AM – midnight (17 hrs). Simulated "now" = 10:30 AM
const GANTT_START = 7
const GANTT_HOURS = 17
const NOW_HOUR    = 10.5
const NOW_PCT     = ((NOW_HOUR - GANTT_START) / GANTT_HOURS) * 100
const GANTT_HOURS_LABELS = ['7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM','12AM']

// Per-driver Gantt block positions (start hour, end hour)
const GANTT_BLOCKS = {}

export function CommandCenter() {
  const { showToast } = useApp()
  const { loads, activeLoads, drivers: dbDrivers } = useCarrier()
  const [selDriver, setSelDriver] = useState(null)
  const [filterStatus, setFilterStatus] = useState('All')

  const drivers = dbDrivers.length ? dbDrivers.map(d => d.full_name) : []

  // Build enriched truck data
  const trucks = drivers.map(driver => {
    const load  = activeLoads.find(l => l.driver === driver)
    const color = CC_COLOR[driver]
    const unit  = CC_UNIT[driver]
    if (!load) return { driver, color, unit, load: null, prog: 0, tx: null, ty: null, fromXY: null, toXY: null }
    const prog  = CC_PROG[load.status] || 0.5
    const fromXY = CITY_XY[load.origin] || null
    const toXY   = CITY_XY[load.dest]   || null
    const tx = fromXY && toXY ? fromXY[0] + (toXY[0] - fromXY[0]) * prog : null
    const ty = fromXY && toXY ? fromXY[1] + (toXY[1] - fromXY[1]) * prog : null
    return { driver, color, unit, load, prog, tx, ty, fromXY, toXY }
  })

  const selected  = trucks.find(t => t.driver === selDriver) || trucks.find(t => t.load) || trucks[0]
  const queueLoad = filterStatus === 'All' ? activeLoads : activeLoads.filter(l => l.status === filterStatus)

  return (
    <div className="cc-root" style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'auto', background:'var(--bg)' }}>

      {/* ── TOP 3-PANEL ROW ─────────────────────────────────────────── */}
      <div className="cc-panels" style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* LEFT: Dispatch Queue */}
        <div className="cc-left" style={{ width:260, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--surface)' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:8 }}>DISPATCH QUEUE</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {['All','In Transit','Loaded','Assigned to Driver'].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  style={{ padding:'3px 8px', fontSize:10, fontWeight:700, borderRadius:6, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                    background: filterStatus===s ? 'var(--accent)' : 'var(--surface2)',
                    color:      filterStatus===s ? '#000' : 'var(--muted)',
                    border:     '1px solid ' + (filterStatus===s ? 'var(--accent)' : 'var(--border)') }}>
                  {s === 'Assigned to Driver' ? 'Assigned' : s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', flexDirection:'column' }}>
            {/* Queue Summary — prominent KPIs */}
            {activeLoads.length > 0 && (
              <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    { l:'Active Loads',  v: String(activeLoads.length), c:'var(--accent2)' },
                    { l:'Total Miles',   v: activeLoads.reduce((s,l)=>s+(parseFloat(l.miles)||0),0).toLocaleString(), c:'var(--muted)' },
                    { l:'Total Gross',   v: '$' + activeLoads.reduce((s,l)=>s+(l.gross||0),0).toLocaleString(), c:'var(--accent)' },
                    { l:'Avg RPM',       v: activeLoads.length ? '$' + (activeLoads.reduce((s,l)=>s+(l.rate||0),0)/activeLoads.length).toFixed(2) : '—', c:'var(--success)' },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign:'center', background:'var(--surface2)', borderRadius:8, padding:'8px 6px', border:'1px solid var(--border)' }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:s.c, lineHeight:1 }}>{s.v}</div>
                      <div style={{ fontSize:8, color:'var(--muted)', marginTop:3, fontWeight:700, letterSpacing:0.5 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {queueLoad.length === 0 && (
              <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--muted)' }}>No loads in this status</div>
            )}
            {queueLoad.map(load => {
              const prog   = CC_PROG[load.status] || 0.3
              const color  = CC_COLOR[load.driver] || 'var(--accent)'
              const isSel  = selDriver === load.driver
              const statusC = load.status === 'In Transit' ? 'var(--success)' : load.status === 'Loaded' ? 'var(--accent2)' : 'var(--accent)'
              return (
                <div key={load.loadId}
                  onClick={() => setSelDriver(load.driver === selDriver ? null : load.driver)}
                  style={{ padding:'16px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                    borderLeft:`3px solid ${isSel ? color : 'transparent'}`,
                    background: isSel ? color+'10' : 'transparent', transition:'all 0.15s' }}
                  onMouseOver={e => { if (!isSel) e.currentTarget.style.background='rgba(255,255,255,0.02)' }}
                  onMouseOut={e => { if (!isSel) e.currentTarget.style.background='transparent' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:800, color: isSel ? color : 'var(--accent)', fontFamily:'monospace' }}>{load.loadId}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:statusC+'15', color:statusC }}>{load.status}</span>
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>
                    {load.origin?.split(',')[0]} → {load.dest?.split(',')[0]}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:6 }}>
                      {CC_UNIT[load.driver]} · {load.driver}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, color:'var(--muted)' }}>{load.miles} mi</span>
                      {load.stops?.length > 0 && (
                        <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:5, background:'rgba(77,142,240,0.15)', color:'var(--accent2)' }}>
                          {load.stops.length} STOPS
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${prog*100}%`, background:color, borderRadius:3, transition:'width 0.3s' }}/>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                    <span style={{ fontSize:10, color:'var(--muted)' }}>{Math.round(prog*100)}% complete</span>
                    <span style={{ fontSize:11, fontWeight:800, color:'var(--accent)' }}>${load.rate}/mi</span>
                  </div>
                </div>
              )
            })}

            <div style={{ flex:1 }} />
          </div>

          {/* Fleet status footer */}
          <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', flexDirection:'column', gap:5 }}>
            <div style={{ fontSize:9, fontWeight:800, color:'var(--muted)', letterSpacing:1.5, marginBottom:2 }}>FLEET STATUS</div>
            {trucks.map(t => (
              <div key={t.driver}
                onClick={() => setSelDriver(t.driver === selDriver ? null : t.driver)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:8, cursor:'pointer',
                  background: selDriver===t.driver ? t.color+'10' : 'var(--surface2)',
                  border:`1px solid ${selDriver===t.driver ? t.color+'40' : 'transparent'}`,
                  transition:'all 0.12s' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: t.load ? t.color : 'var(--muted)',
                  boxShadow: t.load ? `0 0 6px ${t.color}` : 'none', flexShrink:0 }}/>
                <span style={{ fontSize:11, fontWeight:700, color: selDriver===t.driver ? t.color : 'var(--text)' }}>{t.unit}</span>
                <span style={{ fontSize:10, color:'var(--muted)', flex:1 }}>{t.driver.split(' ')[0]}</span>
                <span style={{ fontSize:10, fontWeight:600, color: t.load ? t.color : 'var(--muted)' }}>
                  {t.load ? t.load.status : 'Available'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER: Live Map */}
        <div style={{ flex:1, position:'relative', overflow:'hidden', background:'#070d1a' }}>
          {/* Grid */}
          <svg width="100%" height="100%" style={{ position:'absolute', inset:0, opacity:0.07, pointerEvents:'none' }}>
            <defs>
              <pattern id="ccgrid" width="44" height="44" patternUnits="userSpaceOnUse">
                <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#4d8ef0" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#ccgrid)"/>
          </svg>

          {/* Map label */}
          <div style={{ position:'absolute', top:12, left:16, zIndex:10, pointerEvents:'none' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:2 }}>● LIVE FLEET MAP</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{trucks.filter(t=>t.load).length} trucks on load · Real-time</div>
          </div>

          {/* SVG Map */}
          <svg viewBox="0 0 1000 750" width="100%" height="100%" style={{ position:'absolute', inset:0 }} preserveAspectRatio="xMidYMid meet">
            <defs>
              {trucks.filter(t=>t.load && t.fromXY && t.toXY).map(t => (
                <marker key={t.driver} id={`cc-arr-${t.driver.replace(' ','-')}`} markerWidth="7" markerHeight="7" refX="3" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill={t.color}/>
                </marker>
              ))}
            </defs>

            {/* Route lines */}
            {trucks.filter(t=>t.load && t.fromXY && t.toXY).map(t => (
              <g key={t.driver}>
                <line x1={t.fromXY[0]} y1={t.fromXY[1]} x2={t.toXY[0]} y2={t.toXY[1]}
                  stroke={t.color} strokeWidth="1.5" strokeOpacity="0.18" strokeDasharray="8 5"/>
                <line x1={t.fromXY[0]} y1={t.fromXY[1]}
                  x2={t.fromXY[0] + (t.toXY[0]-t.fromXY[0])*t.prog}
                  y2={t.fromXY[1] + (t.toXY[1]-t.fromXY[1])*t.prog}
                  stroke={t.color} strokeWidth="2.5" strokeOpacity="0.85"
                  markerEnd={`url(#cc-arr-${t.driver.replace(' ','-')})`}/>
              </g>
            ))}

            {/* City dots */}
            {Object.entries(CITY_XY).map(([city, [cx, cy]]) => {
              const abbr     = city.split(',')[0].slice(0,3).toUpperCase()
              const isActive = trucks.some(t => t.load && (t.load.origin===city || t.load.dest===city))
              return (
                <g key={city}>
                  <circle cx={cx} cy={cy} r={isActive ? 5 : 3}
                    fill={isActive ? '#fff' : 'rgba(255,255,255,0.22)'}
                    stroke={isActive ? 'rgba(255,255,255,0.45)' : 'none'} strokeWidth="1.5"/>
                  <text x={cx+8} y={cy+4} fontSize="11" fill={isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)'}
                    fontFamily="'DM Sans',sans-serif" fontWeight={isActive ? '700' : '400'}>{abbr}</text>
                </g>
              )
            })}

            {/* Truck pins */}
            {trucks.filter(t=>t.load && t.tx && t.ty).map(t => (
              <g key={t.driver} onClick={() => setSelDriver(t.driver === selDriver ? null : t.driver)} style={{ cursor:'pointer' }}>
                <circle cx={t.tx} cy={t.ty} r="18" fill={t.color} opacity="0.12">
                  <animate attributeName="r" values="14;22;14" dur="2.2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.18;0;0.18" dur="2.2s" repeatCount="indefinite"/>
                </circle>
                <circle cx={t.tx} cy={t.ty} r="11" fill={t.color} stroke="#07090e" strokeWidth="2.5"/>
                <text x={t.tx} y={t.ty+4} textAnchor="middle" fontSize="9" fill="#000"
                  fontWeight="900" fontFamily="'DM Sans',sans-serif">{t.unit.replace('Unit ','U')}</text>
                <rect x={t.tx+15} y={t.ty-16} width="72" height="32" rx="5"
                  fill="rgba(7,9,14,0.92)" stroke={t.color} strokeWidth="1.2"/>
                <text x={t.tx+51} y={t.ty-2} textAnchor="middle" fontSize="9.5" fill={t.color}
                  fontWeight="700" fontFamily="'DM Sans',sans-serif">{t.driver.split(' ')[0]}</text>
                <text x={t.tx+51} y={t.ty+11} textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.45)"
                  fontFamily="'DM Sans',sans-serif">{t.load?.loadId}</text>
              </g>
            ))}
          </svg>

          {/* Bottom info strip — selected truck */}
          {selected && selected.load && (
            <div style={{ position:'absolute', bottom:14, left:'50%', transform:'translateX(-50%)',
              background:'rgba(7,9,14,0.96)', border:`1px solid ${selected.color}`,
              borderRadius:10, padding:'11px 22px', display:'flex', gap:22, zIndex:20,
              backdropFilter:'blur(12px)', boxShadow:`0 0 24px ${selected.color}20` }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:selected.color,
                boxShadow:`0 0 8px ${selected.color}`, alignSelf:'center', flexShrink:0 }}/>
              {[
                { l:'UNIT',     v: selected.unit },
                { l:'DRIVER',   v: selected.driver.split(' ')[0] },
                { l:'LOAD',     v: selected.load.loadId },
                { l:'ROUTE',    v: `${selected.load.origin?.split(',')[0]} → ${selected.load.dest?.split(',')[0]}` },
                { l:'PROGRESS', v: Math.round(selected.prog*100) + '%' },
                { l:'ETA',      v: selected.load.delivery?.split(' · ')[0] || 'TBD' },
                { l:'HOS',      v: CC_HOS[selected.driver] },
              ].map(item => (
                <div key={item.l} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:8, color:'rgba(255,255,255,0.35)', marginBottom:2, fontWeight:700, letterSpacing:1 }}>{item.l}</div>
                  <div style={{ fontSize:12, fontWeight:700, color: item.l==='PROGRESS' ? selected.color : 'var(--text)', whiteSpace:'nowrap' }}>{item.v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Truck Detail */}
        <div style={{ width:320, flexShrink:0, borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--surface)', overflowY:'auto' }}>
          {selected ? (
            <>
              {/* Driver header */}
              <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)', background:selected.color+'08', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ width:42, height:42, borderRadius:'50%', background:selected.color+'22',
                    border:`2px solid ${selected.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    <Truck size={18} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{selected.driver}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{selected.unit} · CDL-A</div>
                  </div>
                  <div style={{ width:10, height:10, borderRadius:'50%',
                    background: selected.load ? selected.color : 'var(--muted)',
                    boxShadow: selected.load ? `0 0 8px ${selected.color}` : 'none' }}/>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-ghost" style={{ flex:1, fontSize:11, padding:'7px 4px' }}
                    onClick={() => showToast('','Call',`Calling ${selected.driver}...`)}><Ic icon={Phone} /> Call</button>
                  <button className="btn btn-ghost" style={{ flex:1, fontSize:11, padding:'7px 4px' }}
                    onClick={() => showToast('','Message',`Chat with ${selected.driver} opened`)}><Ic icon={MessageCircle} /> Message</button>
                </div>
              </div>

              {/* HOS */}
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:8 }}>HOURS OF SERVICE</div>
                <div style={{ fontSize:22, fontFamily:"'Bebas Neue',sans-serif", color:'var(--success)', marginBottom:6 }}>
                  {CC_HOS[selected.driver] || '—'}
                </div>
                <div style={{ height:6, background:'var(--surface2)', borderRadius:3, overflow:'hidden', marginBottom:4 }}>
                  <div style={{ height:'100%', width: CC_HOS[selected.driver] ? '72%' : '0%', background:'linear-gradient(90deg,var(--success),var(--accent2))', borderRadius:3 }}/>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{CC_HOS[selected.driver] ? '70-hr week: 38h used · 32h remaining' : 'No HOS data available'}</div>
              </div>

              {/* Active load */}
              {selected.load ? (
                <div style={{ borderBottom:'1px solid var(--border)' }}>
                  <div style={{ padding:'14px 18px 8px' }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:10 }}>ACTIVE LOAD</div>
                    {[
                      { l:'Load ID',   v: selected.load.loadId },
                      { l:'Broker',    v: selected.load.broker },
                      { l:'Miles',     v: `${selected.load.miles} mi` },
                      { l:'Rate',      v: `$${selected.load.rate}/mi` },
                      { l:'Gross Pay', v: `$${selected.load.gross?.toLocaleString()}` },
                      { l:'Commodity', v: selected.load.commodity },
                      { l:'Weight',    v: `${selected.load.weight} lbs` },
                    ].map(item => (
                      <div key={item.l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{item.l}</span>
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--text)', maxWidth:180, textAlign:'right' }}>{item.v}</span>
                      </div>
                    ))}
                  </div>
                  {/* Stop timeline if multi-stop */}
                  {selected.load.stops?.length > 0
                    ? <div style={{ padding:'0 18px 14px' }}><StopTimeline load={selected.load} /></div>
                    : <div style={{ padding:'0 18px 14px', fontSize:11, color:'var(--muted)' }}>
                        <MapPin size={13} /> {selected.load.origin} → {selected.load.dest}
                      </div>
                  }
                </div>
              ) : (
                <div style={{ padding:'24px 18px', textAlign:'center' }}>
                  <div style={{ marginBottom:8 }}><Check size={28} /></div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--success)', marginBottom:4 }}>Available</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>No active load — ready to dispatch</div>
                  <button className="btn btn-primary" style={{ fontSize:11 }}
                    onClick={() => showToast('','Dispatch','Opening AI Dispatch Copilot...')}><Ic icon={Zap} /> Find Load</button>
                </div>
              )}

              {/* MTD Performance */}
              <div style={{ padding:'14px 18px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:10 }}>PERFORMANCE · MTD</div>
                {(() => {
                  const drvLoads = loads.filter(l => l.driver === selected.driver)
                  const totalMi  = drvLoads.reduce((s,l)=>s+l.miles,0)
                  const totalGr  = drvLoads.reduce((s,l)=>s+l.gross,0)
                  const avgRpm   = drvLoads.length ? (drvLoads.reduce((s,l)=>s+(l.rate||0),0)/drvLoads.length).toFixed(2) : '0.00'
                  return (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[
                        { l:'Loads Run', v: drvLoads.length },
                        { l:'Miles',     v: totalMi.toLocaleString() },
                        { l:'Gross Pay', v: '$'+totalGr.toLocaleString() },
                        { l:'Avg RPM',   v: '$'+avgRpm },
                      ].map(s => (
                        <div key={s.l} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                          <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>{s.l}</div>
                          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:selected.color }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)' }}>
              <div style={{ fontSize:36 }}><Truck size={20} /></div>
              <div style={{ fontSize:12 }}>Click a truck or load card to view details</div>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM: FREIGHT SCHEDULE GANTT ──────────────────────────── */}
      <div style={{ height:168, flexShrink:0, borderTop:'1px solid var(--border)', background:'var(--surface)' }}>
        <div style={{ padding:'8px 16px 6px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>FREIGHT SCHEDULE</div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>{'Today · ' + new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</div>
          <div style={{ marginLeft:'auto', display:'flex', gap:12, fontSize:10, color:'var(--muted)' }}>
            <span style={{ color:'var(--danger)', fontWeight:700 }}>{'● NOW · ' + new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}</span>
            <span>Current shift</span>
          </div>
        </div>

        <div style={{ padding:'8px 0 0', overflow:'hidden' }}>
          {/* Hour header */}
          <div style={{ display:'flex', marginLeft:88, marginRight:16, marginBottom:4 }}>
            {GANTT_HOURS_LABELS.map(h => (
              <div key={h} style={{ flex:1, fontSize:9, color:'var(--muted)', textAlign:'center', minWidth:0 }}>{h}</div>
            ))}
          </div>

          {/* Driver rows */}
          {drivers.map(driver => {
            const t     = trucks.find(tk => tk.driver === driver)
            const color = CC_COLOR[driver]
            const blk   = GANTT_BLOCKS[driver]
            if (!blk) return null
            const left  = ((blk.start - GANTT_START) / GANTT_HOURS) * 100
            const width = ((blk.end - blk.start)    / GANTT_HOURS) * 100

            return (
              <div key={driver} style={{ display:'flex', alignItems:'center', marginBottom:6, height:30 }}>
                <div style={{ width:88, paddingLeft:16, flexShrink:0 }}>
                  <div style={{ fontSize:10, fontWeight:700, color }}>{CC_UNIT[driver]}</div>
                  <div style={{ fontSize:9,  color:'var(--muted)' }}>{driver.split(' ')[0]}</div>
                </div>
                <div style={{ flex:1, position:'relative', height:22, background:'var(--surface2)', borderRadius:4, marginRight:16 }}>
                  {/* NOW line */}
                  <div style={{ position:'absolute', top:0, bottom:0, left:`${NOW_PCT}%`, width:1.5,
                    background:'rgba(239,68,68,0.85)', zIndex:3 }}/>
                  {/* Load block */}
                  {t?.load && (
                    <div style={{ position:'absolute', top:2, height:18, left:`${left}%`, width:`${width}%`,
                      background:color+'22', border:`1px solid ${color}55`, borderRadius:3,
                      display:'flex', alignItems:'center', paddingLeft:6, overflow:'hidden', zIndex:1 }}>
                      <span style={{ fontSize:9, fontWeight:700, color, whiteSpace:'nowrap' }}>
                        {t.load.loadId} · {t.load.origin?.split(',')[0]}→{t.load.dest?.split(',')[0]}
                      </span>
                    </div>
                  )}
                  {!t?.load && (
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', paddingLeft:8 }}>
                      <span style={{ fontSize:9, color:'var(--muted)' }}>Available</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

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
  const { addLoad, drivers: dbDrivers } = useCarrier()
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
  const estDriver = load ? Math.round(load.gross * 0.28) : 0
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
                    Booking adds to dispatch queue with status "Rate Con Received". Upload rate con PDF to auto-fill all fields.
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

const CC_STATUS_OPTS = ['On Time','Running Late','At Stop','Delay — Weather','Delay — Traffic','Issues — Call Me']
const CC_STATUS_COLOR = {
  'On Time':           'var(--success)',
  'Running Late':      'var(--warning)',
  'At Stop':           'var(--accent2)',
  'Delay — Weather':   'var(--warning)',
  'Delay — Traffic':   'var(--warning)',
  'Issues — Call Me':  'var(--danger)',
}

function fmtTs(ts) {
  const d    = new Date(ts)
  const mon  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  const time = d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })
  return `${mon} ${d.getDate()} · ${time}`
}

function hoursAgo(ts) {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : (ts || 0)
  const h = (Date.now() - t) / 3600000
  if (h < 1)  return `${Math.round(h * 60)}m ago`
  if (h < 24) return `${h.toFixed(1).replace('.0','')}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function callStatus(calls) {
  if (!calls?.length) return 'none'
  const raw = calls[0].ts || calls[0].called_at
  const t = typeof raw === 'string' ? new Date(raw).getTime() : (raw || 0)
  const h = (Date.now() - t) / 3600000
  if (h > 4)  return 'overdue'
  if (h > 2)  return 'due'
  return 'recent'
}

function generateMsg(load, call) {
  const lines = [
    `Check Call — ${load.loadId} (${load.broker})`,
    `Location: ${call.location}`,
    `Time: ${fmtTs(Date.now())}`,
    `Status: ${call.status}`,
    `Driver: ${load.driver} · ${load.loadId}`,
    call.eta    ? `Delivery ETA: ${call.eta}` : `Delivery: ${load.delivery}`,
    call.notes  ? `Notes: ${call.notes}` : '',
    `Ref: ${load.refNum}`,
    `— Sent via Qivori AI`,
  ]
  return lines.filter(Boolean).join('\n')
}

function buildRouteSuggestions(load, lastCall) {
  const pts = []
  if (load?.origin) pts.push(load.origin.split(',')[0].trim())
  if (load?.dest || load?.destination) pts.push((load.dest || load.destination).split(',')[0].trim())
  if (lastCall?.location) pts.push(lastCall.location)
  // Add origin/dest full
  if (load?.origin) pts.push(load.origin)
  if (load?.dest || load?.destination) pts.push(load.dest || load.destination)
  return [...new Set(pts)].slice(0, 5)
}


export function CheckCallCenter() {
  const { showToast } = useApp()
  const { activeLoads, checkCalls, logCheckCall } = useCarrier()
  const [selLoad,    setSelLoad]    = useState(activeLoads[0]?.loadId || null)
  const [location,   setLocation]   = useState('')
  const [status,     setStatus]     = useState('On Time')
  const [eta,        setEta]        = useState('')
  const [notes,      setNotes]      = useState('')
  const [showMsg,    setShowMsg]    = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [filterOver, setFilterOver] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [brokerPhones, setBrokerPhones] = useState({}) // loadId → phone number

  const getPhoneLocation = () => {
    if (!navigator.geolocation) { showToast('','GPS Unavailable','Your browser does not support geolocation'); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
          })
          const data = await res.json()
          const addr = data.address || {}
          const city = addr.city || addr.town || addr.village || addr.county || ''
          const state = addr.state || ''
          const loc = [city, state].filter(Boolean).join(', ')
          setLocation(loc || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
          showToast('','Location Found', loc || 'GPS coordinates set')
        } catch {
          setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
          showToast('','GPS Location Set','Could not get city name, using coordinates')
        }
        setGpsLoading(false)
      },
      (err) => {
        setGpsLoading(false)
        const msgs = { 1:'Location permission denied — enable it in your browser settings', 2:'Could not determine location — try again', 3:'Location request timed out — try again' }
        showToast('','Location Error', msgs[err.code] || 'Failed to get location')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const load       = activeLoads.find(l => l.loadId === selLoad)
  const loadCalls  = load ? (checkCalls[load.loadId] || []) : []
  const generatedMsg = load ? generateMsg(load, { location, status, eta, notes }) : ''
  const lastCall   = loadCalls[0] || null
  const suggestions = load ? buildRouteSuggestions(load, lastCall) : []

  // Auto-fill location, ETA & broker phone when selecting a load
  useEffect(() => {
    if (!load) return
    const calls = checkCalls[load.loadId] || []
    if (calls.length > 0) {
      setLocation(calls[0].location || '')
    } else {
      setLocation(load.origin || '')
    }
    setEta(load.delivery || '')
    setStatus('On Time')
    setNotes('')
    setShowMsg(false)
    setCopied(false)
    // Pre-fill broker phone from rate con data if available
    if (load.brokerPhone && !brokerPhones[load.loadId]) {
      setBrokerPhones(p => ({ ...p, [load.loadId]: load.brokerPhone }))
    }
  }, [selLoad]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentBrokerPhone = brokerPhones[load?.loadId] || load?.brokerPhone || ''

  const handleLog = () => {
    if (!load || !location.trim()) { showToast('','Missing Info','Enter a current location before logging'); return }
    logCheckCall(load.loadId, { location: location.trim(), status, eta, notes: notes.trim() })
    showToast('','Check Call Logged', `${load.loadId} · ${location} · ${status}`)
    setLocation('')
    setNotes('')
    setShowMsg(false)
    setCopied(false)
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(generatedMsg).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('','Copied','Broker update message copied to clipboard')
  }

  const visibleLoads = filterOver
    ? activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'overdue')
    : activeLoads

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* LEFT: Load list */}
      <div style={{ width:260, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--surface)' }}>

        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:8 }}>CHECK CALLS</div>
          <button onClick={() => setFilterOver(f => !f)}
            style={{ width:'100%', padding:'6px 10px', fontSize:11, fontWeight:700, borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              background: filterOver ? 'rgba(239,68,68,0.12)' : 'var(--surface2)',
              color: filterOver ? 'var(--danger)' : 'var(--muted)',
              border: `1px solid ${filterOver ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
            {filterOver ? <><AlertTriangle size={13} /> Showing Overdue Only</> : 'Show All Active Loads'}
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {visibleLoads.map(l => {
            const calls  = checkCalls[l.loadId] || []
            const cs     = callStatus(calls)
            const isSel  = selLoad === l.loadId
            const csColor = cs === 'overdue' ? 'var(--danger)' : cs === 'due' ? 'var(--warning)' : cs === 'recent' ? 'var(--success)' : 'var(--muted)'
            const csLabel = cs === 'overdue' ? 'OVERDUE' : cs === 'due' ? 'DUE' : cs === 'recent' ? 'RECENT' : '— NO CALLS'

            return (
              <div key={l.loadId} onClick={() => setSelLoad(l.loadId)}
                style={{ padding:'13px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.12s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{l.loadId}</span>
                  <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:5, background:csColor+'15', color:csColor }}>{csLabel}</span>
                </div>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:3 }}>
                  {l.origin?.split(',')[0]} → {l.dest?.split(',')[0]}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>
                  {l.driver} · {l.broker}
                </div>
                {calls.length > 0
                  ? <div style={{ fontSize:10, color:'var(--muted)' }}>Last call {hoursAgo(calls[0].ts || calls[0].called_at)} · {calls[0].location}</div>
                  : <div style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic' }}>No check calls logged yet</div>
                }
              </div>
            )
          })}
          {visibleLoads.length === 0 && (
            <div style={{ padding:24, textAlign:'center', fontSize:12, color:'var(--muted)' }}>
              {filterOver ? 'No overdue check calls' : 'No active loads'}
            </div>
          )}
        </div>

        {/* Summary footer */}
        <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          {[
            { label:'Overdue',   count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'overdue').length, color:'var(--danger)'  },
            { label:'Due Soon',  count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'due').length,     color:'var(--warning)' },
            { label:'Up to Date',count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'recent').length,  color:'var(--success)' },
          ].map(s => (
            <div key={s.label} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{s.label}</span>
              <span style={{ fontSize:11, fontWeight:700, color:s.color }}>{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Detail + log form */}
      {load ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>

          {/* Header */}
          <div style={{ padding:'14px 22px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0, display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:2 }}>
                {load.loadId} · {load.origin?.split(',')[0]} → {load.dest?.split(',')[0]}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>
                {load.driver} · {load.broker} · {load.miles} mi · Delivery: {load.delivery}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>Last check call</div>
              <div style={{ fontSize:13, fontWeight:700, color: loadCalls.length ? 'var(--text)' : 'var(--muted)' }}>
                {loadCalls.length ? hoursAgo(loadCalls[0].ts || loadCalls[0].called_at) : 'Never'}
              </div>
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', gap:0 }}>

            {/* Log form */}
            <div style={{ width:340, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:20, display:'flex', flexDirection:'column', gap:14 }}>

                {/* Overdue alert */}
                {callStatus(loadCalls) === 'overdue' && (
                  <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, fontSize:12, color:'var(--danger)', display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:18 }}><AlertTriangle size={18} /></span>
                    <span>Check call overdue — last update {hoursAgo(loadCalls[0]?.ts || loadCalls[0]?.called_at)}. Broker may be expecting an update.</span>
                  </div>
                )}

                <div style={{ fontSize:12, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>LOG CHECK CALL</div>

                {/* Location */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Current Location *</label>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      placeholder="e.g. New Orleans, LA" style={{ ...inp, flex:1 }}/>
                    <button onClick={getPhoneLocation} disabled={gpsLoading}
                      style={{ flexShrink:0, padding:'8px 12px', background: gpsLoading ? 'rgba(240,165,0,0.15)' : 'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, cursor: gpsLoading ? 'wait' : 'pointer', color: gpsLoading ? 'var(--accent)' : 'var(--accent2)', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:5 }}>
                      <Navigation size={13} style={ gpsLoading ? { animation:'spin 1s linear infinite' } : {} } />
                      {gpsLoading ? 'Finding...' : 'GPS'}
                    </button>
                  </div>
                  {suggestions.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                      {suggestions.map(s => (
                        <button key={s} onClick={() => setLocation(s)}
                          style={{ fontSize:10, padding:'3px 8px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', color:'var(--muted)', fontFamily:"'DM Sans',sans-serif" }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Status</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {CC_STATUS_OPTS.map(s => (
                      <button key={s} onClick={() => setStatus(s)}
                        style={{ padding:'5px 10px', fontSize:11, fontWeight:600, borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                          background: status === s ? CC_STATUS_COLOR[s]+'20' : 'var(--surface2)',
                          color:      status === s ? CC_STATUS_COLOR[s] : 'var(--muted)',
                          border:     `1px solid ${status === s ? CC_STATUS_COLOR[s]+'50' : 'var(--border)'}` }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ETA override */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>ETA (if changed)</label>
                  <input value={eta} onChange={e => setEta(e.target.value)}
                    placeholder={load.delivery || 'e.g. Mar 13 · 6:00 PM'} style={inp}/>
                </div>

                {/* Broker Phone */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>
                    Broker Phone {currentBrokerPhone ? <span style={{ color:'var(--success)', fontSize:10 }}> — from rate con</span> : <span style={{ color:'var(--warning)', fontSize:10 }}> — enter to enable text/call</span>}
                  </label>
                  <input value={currentBrokerPhone}
                    onChange={e => setBrokerPhones(p => ({ ...p, [load.loadId]: e.target.value }))}
                    placeholder="(555) 123-4567"
                    style={inp}/>
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Any issues, delays, or comments for broker…"
                    style={{ ...inp, resize:'vertical', lineHeight:1.5 }}/>
                </div>

                {/* Message preview toggle */}
                <button onClick={() => setShowMsg(m => !m)}
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' }}>
                  {showMsg ? '▾ Hide' : '▸ Preview'} broker update message
                </button>

                {showMsg && (
                  <div style={{ background:'rgba(0,0,0,0.2)', border:'1px solid var(--border)', borderRadius:8, padding:12 }}>
                    <pre style={{ fontSize:11, color:'var(--text)', fontFamily:"'DM Sans',sans-serif", whiteSpace:'pre-wrap', margin:0, lineHeight:1.6 }}>
                      {generatedMsg}
                    </pre>
                    <button onClick={handleCopy}
                      style={{ marginTop:8, width:'100%', padding:'6px', background: copied ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, color: copied ? 'var(--success)' : 'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
                      {copied ? <><Check size={13} /> Copied!</> : <><FileText size={13} /> Copy to Clipboard</>}
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ padding:16, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
                <button className="btn btn-primary" style={{ width:'100%', fontSize:12, justifyContent:'center', padding:'11px 0' }} onClick={handleLog}>
                  <Phone size={13} /> Log Check Call
                </button>
                <div style={{ display:'flex', gap:6 }}>
                  {(() => {
                    const brokerNum = (currentBrokerPhone || '').replace(/[^0-9+]/g, '')
                    const smsHref = brokerNum
                      ? `sms:${brokerNum}${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(generatedMsg)}`
                      : `sms:${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(generatedMsg)}`
                    const telHref = brokerNum ? `tel:${brokerNum}` : '#'
                    return <>
                      <a href={smsHref}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 0', fontSize:11, fontWeight:700, borderRadius:8, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', color:'var(--success)', textDecoration:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
                        onClick={() => { handleLog(); showToast('','SMS Opened','Check call logged + SMS ready to send') }}>
                        <MessageCircle size={13} /> Text Broker
                      </a>
                      <a href={telHref}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 0', fontSize:11, fontWeight:700, borderRadius:8, background:'rgba(77,142,240,0.08)', border:'1px solid rgba(77,142,240,0.25)', color: brokerNum ? 'var(--accent3)' : 'var(--muted)', textDecoration:'none', cursor: brokerNum ? 'pointer' : 'default', fontFamily:"'DM Sans',sans-serif", opacity: brokerNum ? 1 : 0.5 }}
                        onClick={(e) => {
                          if (!brokerNum) { e.preventDefault(); showToast('','No Phone Number','Add broker phone to the load to enable calling'); return }
                          handleLog(); showToast('','Calling Broker','Check call logged + dialing ' + load.broker)
                        }}>
                        <Phone size={13} /> Call Broker
                      </a>
                    </>
                  })()}
                </div>
                <button className="btn btn-ghost" style={{ width:'100%', fontSize:11, padding:'7px 0' }} onClick={() => setShowMsg(m => !m)}>
                  <FileText size={13} /> {showMsg ? 'Hide' : 'Preview'} Message
                </button>
              </div>
            </div>

            {/* Call history */}
            <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:20, display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:14 }}>
                CALL HISTORY · {loadCalls.length} LOGGED
              </div>

              {loadCalls.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--muted)', fontSize:12 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}><Phone size={32} /></div>
                  No check calls logged yet for this load.<br/>Log the first one to start tracking.
                </div>
              )}

              {loadCalls.map((call, idx) => {
                const sc = CC_STATUS_COLOR[call.status] || 'var(--muted)'
                return (
                  <div key={call.id} style={{ display:'flex', gap:14, position:'relative', paddingBottom:20 }}>
                    {idx < loadCalls.length - 1 && (
                      <div style={{ position:'absolute', left:9, top:22, bottom:0, width:2, background:'var(--border)' }}/>
                    )}
                    <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2,
                      background: idx === 0 ? sc : 'var(--surface2)',
                      border:`2px solid ${idx === 0 ? sc : 'var(--border)'}`,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, zIndex:1,
                      color: idx === 0 ? '#000' : 'var(--muted)', fontWeight:800 }}>
                      {idx === 0 ? '●' : loadCalls.length - idx}
                    </div>
                    <div style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div>
                          <span style={{ fontSize:12, fontWeight:700, color: idx === 0 ? 'var(--text)' : 'var(--muted)' }}><Ic icon={MapPin} /> {call.location}</span>
                          {idx === 0 && <span style={{ marginLeft:8, fontSize:10, color:'var(--accent)', fontWeight:700 }}>LATEST</span>}
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:sc+'15', color:sc }}>{call.status}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom: call.notes ? 6 : 0 }}>
                        <Clock size={11} /> {fmtTs(call.ts || call.called_at)}
                        {call.eta && <span style={{ marginLeft:12 }}><Ic icon={Calendar} /> ETA: {call.eta}</span>}
                      </div>
                      {call.notes && (
                        <div style={{ fontSize:11, color:'var(--text)', marginTop:4, padding:'6px 10px', background:'rgba(255,255,255,0.03)', borderRadius:6, fontStyle:'italic' }}>
                          "{call.notes}"
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)' }}>
          <div><Phone size={40} /></div>
          <div style={{ fontSize:13 }}>Select a load to log check calls</div>
        </div>
      )}
    </div>
  )
}


const DAT_API = import.meta.env.VITE_DAT_API_URL || ''

const DAT_EQUIP_OPTS = ['All', 'Dry Van', 'Reefer', 'Flatbed']

function scoreColor(s) {
  return s >= 80 ? 'var(--success)' : s >= 65 ? 'var(--accent)' : 'var(--danger)'
}

function ageLabel(postedAgo) {
  if (postedAgo < 1)  return 'Just posted'
  if (postedAgo < 60) return `${postedAgo}m ago`
  return `${Math.round(postedAgo/60)}h ago`
}

function urgencyStyle(score, postedAgo) {
  if (score >= 88 && postedAgo < 10) return { label:'BOOK NOW', bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.35)', text:'var(--danger)' }
  if (score >= 78)                   return { label:'ACT FAST', bg:'rgba(240,165,0,0.10)', border:'rgba(240,165,0,0.30)', text:'var(--accent)' }
  return                                    { label:'GOOD LOAD', bg:'rgba(34,197,94,0.08)', border:'rgba(34,197,94,0.25)', text:'var(--success)' }
}


export function DATAlertBot() {
  const { addLoad, loads: carrierLoads } = useCarrier()
  const { showToast } = useApp()

  const [connected, setConnected]   = useState(false)
  const [datEnabled, setDatEnabled] = useState(false)
  const [alerts, setAlerts]         = useState([])
  const [dismissed, setDismissed]   = useState(new Set())
  const [booked, setBooked]         = useState(new Set())
  const [minScore, setMinScore]     = useState(72)
  const [equip, setEquip]           = useState('All')
  const [selAlert, setSelAlert]     = useState(null)
  const [sound, setSound]           = useState(true)
  const [searchNow, setSearchNow]   = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)

  // SSE connection
  useEffect(() => {
    if (!DAT_API) return
    const es = new EventSource(`${DAT_API}/api/dat/alerts/stream`)

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'connected') {
          setConnected(true)
          setDatEnabled(msg.datEnabled)
        }
        if (msg.type === 'alerts' && Array.isArray(msg.alerts)) {
          setAlerts(prev => {
            // Prepend new, dedupe by id, cap at 40
            const ids = new Set(prev.map(a => a.id))
            const fresh = msg.alerts.filter(a => !ids.has(a.id))
            if (fresh.length > 0 && sound) {
              // Visual flash indicator — no actual audio API needed
              document.title = `${fresh.length} Hot Load${fresh.length > 1 ? 's' : ''}! — Qivori`
              setTimeout(() => { document.title = 'Qivori AI' }, 4000)
            }
            return [...fresh, ...prev].slice(0, 40)
          })
          // Auto-select first new alert
          setSelAlert(a => a || msg.alerts[0]?.id || null)
        }
      } catch { /* SSE parse error — skip frame */ }
    }

    es.onerror = () => setConnected(false)

    return () => es.close()
  }, [sound])

  // Manual search
  const handleSearch = async () => {
    if (!DAT_API) {
      showToast('', 'DAT API', 'DAT API not connected — connect in Settings to see live loads')
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    try {
      const resp = await fetch(`${DAT_API}/api/dat/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment: equip === 'All' ? undefined : equip }),
      })
      const data = await resp.json()
      if (data.loads) {
        const fresh = data.loads.map(l => ({ ...l, id: `manual-${l.refNum}-${Date.now()}`, ts: Date.now(), msg: '' }))
        setAlerts(prev => {
          const ids = new Set(prev.map(a => a.id))
          return [...fresh.filter(f => !ids.has(f.id)), ...prev].slice(0, 40)
        })
        if (fresh.length > 0) setSelAlert(fresh[0].id)
        showToast('', 'DAT Search', `${fresh.length} loads pulled · top scores shown first`)
      }
    } catch (err) {
      showToast('', 'Search Failed', 'Search unavailable — please try again later')
    }
    setSearchLoading(false)
  }

  const handleBook = (alert) => {
    addLoad({
      origin: alert.origin, dest: alert.dest, miles: alert.miles,
      rate: alert.rate, gross: alert.gross, weight: alert.weight,
      commodity: alert.commodity, pickup: alert.pickup, delivery: alert.delivery,
      broker: alert.broker, refNum: alert.refNum, driver: '',
    })
    setBooked(s => new Set([...s, alert.id]))
    showToast('', 'Load Booked from DAT', `${alert.origin?.split(',')[0]} → ${alert.dest?.split(',')[0]} · $${alert.gross?.toLocaleString()} · added to dispatch queue`)
  }

  const visibleAlerts = alerts.filter(a =>
    !dismissed.has(a.id) &&
    a.score >= minScore &&
    (equip === 'All' || a.equipment === equip)
  )

  const selLoad = visibleAlerts.find(a => a.id === selAlert) || visibleAlerts[0] || null
  const hotCount = visibleAlerts.filter(a => a.score >= 80).length

  const pill = { fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6, letterSpacing:0.5 }
  const inputStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'auto' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
              DAT <span style={{ color:'var(--accent)' }}>ALERT</span> BOT
            </div>
            {/* Live indicator */}
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background: connected ? 'var(--success)' : 'var(--danger)',
                boxShadow: connected ? '0 0 6px var(--success)' : 'none',
                animation: connected ? 'pulse 2s infinite' : 'none' }}/>
              <span style={{ fontSize:10, color: connected ? 'var(--success)' : 'var(--muted)', fontWeight:700 }}>
                {connected ? (datEnabled ? 'DAT LIVE' : 'DEMO MODE') : 'CONNECTING…'}
              </span>
            </div>
            {hotCount > 0 && (
              <span style={{ ...pill, background:'rgba(239,68,68,0.15)', color:'var(--danger)', border:'1px solid rgba(239,68,68,0.3)' }}>
                <Flame size={13} /> {hotCount} HOT
              </span>
            )}
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
            {datEnabled ? 'Connected to DAT Keystone API · Scanning every 90 sec' : 'Demo mode — add DAT_CLIENT_ID + DAT_CLIENT_SECRET to .env to go live'}
          </div>
        </div>
        {/* Controls */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={equip} onChange={e => setEquip(e.target.value)} style={inputStyle}>
            {DAT_EQUIP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Min score</span>
            <input type="range" min={50} max={90} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))}
              style={{ width:70, accentColor:'var(--accent)', cursor:'pointer' }}/>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)', minWidth:20 }}>{minScore}</span>
          </div>
          <button onClick={() => setSound(s => !s)}
            style={{ padding:'6px 10px', fontSize:13, background:'var(--surface2)', border:`1px solid ${sound ? 'var(--accent)' : 'var(--border)'}`, borderRadius:8, cursor:'pointer', color: sound ? 'var(--accent)' : 'var(--muted)' }}>
            {sound ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          <button onClick={handleSearch} disabled={searchLoading}
            style={{ padding:'7px 16px', fontSize:12, fontWeight:700, background:'var(--accent)', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity: searchLoading ? 0.7 : 1 }}>
            {searchLoading ? 'Scanning…' : <><Ic icon={Search} size={13} /> Scan DAT Now</>}
          </button>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'auto' }}>

        {/* LEFT: Alert feed */}
        <div style={{ width:380, flexShrink:0, borderRight:'1px solid var(--border)', overflowY:'auto', display:'flex', flexDirection:'column' }}>

          {/* Bot status banner */}
          <div style={{ padding:'10px 16px', background:'rgba(240,165,0,0.05)', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ fontSize:20, flexShrink:0 }}><Bot size={20} /></div>
            <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.6 }}>
              {visibleAlerts.length === 0
                ? connected
                  ? 'Watching DAT… first batch arrives in ~3 seconds. I\'ll flag every load scoring ' + minScore + '+ and explain why.'
                  : 'Connecting to server… make sure Qivori backend is running on port 4000.'
                : `Tracking ${visibleAlerts.length} load${visibleAlerts.length !== 1 ? 's' : ''} · ${hotCount} score 80+ · auto-refreshing every 90 sec`
              }
            </div>
          </div>

          {visibleAlerts.length === 0 && connected && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)', padding:20 }}>
              <div><Radio size={36} /></div>
              <div style={{ fontSize:12, textAlign:'center' }}>Scanning DAT for loads above score {minScore}…<br/>Hit "Scan DAT Now" for an instant pull.</div>
            </div>
          )}

          {visibleAlerts.map(alert => {
            const urg  = urgencyStyle(alert.score, alert.postedAgo)
            const isSel = selAlert === alert.id
            const isB  = booked.has(alert.id)
            const sc   = scoreColor(alert.score)
            return (
              <div key={alert.id} onClick={() => setSelAlert(alert.id)}
                style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : urg.text}`,
                  background: isB ? 'rgba(255,255,255,0.02)' : isSel ? 'rgba(240,165,0,0.05)' : 'transparent',
                  cursor:'pointer', opacity: isB ? 0.5 : 1, transition:'all 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:5 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color: isSel ? 'var(--accent)' : 'var(--text)' }}>
                      {alert.origin?.split(',')[0]} → {alert.dest?.split(',')[0]}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{alert.broker} · {alert.equipment} · {alert.miles} mi</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                    <span style={{ ...pill, background:sc+'18', color:sc, border:`1px solid ${sc}30` }}>{alert.score}</span>
                    {isB && <span style={{ ...pill, background:'rgba(34,197,94,0.15)', color:'var(--success)' }}>BOOKED</span>}
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <span style={{ fontSize:12, fontWeight:800, color:'var(--accent)' }}>${alert.rate?.toFixed(2)}/mi</span>
                    <span style={{ fontSize:12, fontWeight:700 }}>${alert.gross?.toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ ...pill, background:urg.bg, color:urg.text, border:`1px solid ${urg.border}` }}>{urg.label}</span>
                  </div>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                  <Clock size={11} /> {ageLabel(alert.postedAgo)} · {alert.deadhead} mi deadhead
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT: Detail + bot message */}
        {selLoad ? (
          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', flexDirection:'column' }}>

            {/* Load header */}
            <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:1, lineHeight:1, marginBottom:4 }}>
                    {selLoad.origin?.split(',')[0]} → {selLoad.dest?.split(',')[0]}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span>{selLoad.miles} mi</span>
                    <span>·</span>
                    <span>{selLoad.equipment}</span>
                    <span>·</span>
                    <span>{selLoad.weight} lbs</span>
                    <span>·</span>
                    <span>{selLoad.commodity}</span>
                  </div>
                </div>
                <div style={{ textAlign:'center', background:scoreColor(selLoad.score)+'15', border:`2px solid ${scoreColor(selLoad.score)}`, borderRadius:14, padding:'8px 18px' }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:34, color:scoreColor(selLoad.score), lineHeight:1 }}>{selLoad.score}</div>
                  <div style={{ fontSize:9, fontWeight:800, color:scoreColor(selLoad.score), letterSpacing:1 }}>AI SCORE</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[
                  `${selLoad.pickup}`,
                  `${selLoad.delivery}`,
                  `${selLoad.refNum}`,
                  `${selLoad.deadhead} mi deadhead`,
                  `Posted ${ageLabel(selLoad.postedAgo)}`,
                ].map(tag => (
                  <span key={tag} style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}>{tag}</span>
                ))}
              </div>
            </div>

            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>

              {/* AI Bot Message */}
              {selLoad.msg && (
                <div style={{ background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.25)', borderRadius:12, padding:16 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ width:32, height:32, borderRadius:10, background:'rgba(240,165,0,0.15)', border:'1px solid rgba(240,165,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}><Bot size={20} /></div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1, marginBottom:6 }}>QIVORI AI · LOAD ANALYSIS</div>
                      {selLoad.msg.split('\n').map((line, i) => (
                        <div key={i} style={{ fontSize:12, lineHeight:1.7, color: i === 0 ? 'var(--text)' : 'var(--muted)', fontWeight: i === 0 ? 700 : 400 }}>{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick economics */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10 }}>
                {[
                  { l:'Gross',    v:`$${selLoad.gross?.toLocaleString()}`,     c:'var(--accent)'  },
                  { l:'Rate/mi',  v:`$${selLoad.rate?.toFixed(2)}`,            c:'var(--text)'    },
                  { l:'Est. Fuel',v:`−$${Math.round(selLoad.miles/6.9*3.85).toLocaleString()}`, c:'var(--danger)' },
                  { l:'Est. Net', v:`$${Math.round(selLoad.gross - selLoad.miles/6.9*3.85 - selLoad.gross*0.28).toLocaleString()}`, c:'var(--success)' },
                ].map(k => (
                  <div key={k.l} style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:3 }}>{k.l}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:k.c }}>{k.v}</div>
                  </div>
                ))}
              </div>

              {/* Urgency + book */}
              {!booked.has(selLoad.id) ? (() => {
                const urg = urgencyStyle(selLoad.score, selLoad.postedAgo)
                return (
                  <div style={{ background:urg.bg, border:`1px solid ${urg.border}`, borderRadius:12, padding:18 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:800, color:urg.text }}>{urg.label}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                          {selLoad.score >= 88
                            ? 'Top-tier load — high-score loads on this lane disappear in minutes'
                            : selLoad.score >= 78
                            ? 'Strong load — good rate and trusted broker. Move quickly.'
                            : 'Solid option — consider countering for an extra $0.05–0.10/mi before booking'}
                        </div>
                      </div>
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:40, color:urg.text, lineHeight:1 }}>{selLoad.score}</span>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={() => handleBook(selLoad)} className="btn btn-primary"
                        style={{ flex:1, justifyContent:'center', padding:'12px', fontSize:14 }}>
                        <Zap size={13} /> Book This Load →
                      </button>
                      <button onClick={() => setDismissed(s => new Set([...s, selLoad.id]))}
                        style={{ padding:'12px 16px', fontSize:13, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        Pass
                      </button>
                    </div>
                  </div>
                )
              })() : (
                <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:12, padding:20, textAlign:'center' }}>
                  <div style={{ marginBottom:6 }}><Check size={28} /></div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--success)' }}>Load Booked</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Added to dispatch queue · Assign a driver to complete booking</div>
                </div>
              )}

              {/* All alerts summary */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={BarChart2} /> This Session</div>
                <div style={{ padding:'10px 18px', display:'flex', gap:24 }}>
                  {[
                    { l:'Loads Scanned',  v: alerts.length },
                    { l:'Above Score',    v: visibleAlerts.length },
                    { l:'Hot (80+)',   v: hotCount },
                    { l:'Booked',         v: booked.size },
                    { l:'Dismissed',      v: dismissed.size },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign:'center' }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:'var(--accent)' }}>{s.v}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--muted)' }}>
            <div><Bot size={48} /></div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>DAT Alert Bot</div>
            <div style={{ fontSize:12, textAlign:'center', maxWidth:320 }}>
              I scan DAT every 90 seconds and flag every load scoring {minScore}+.<br/>
              Hit "Scan DAT Now" for an instant pull or wait for the first auto-alert.
            </div>
            <button onClick={handleSearch} disabled={searchLoading}
              style={{ marginTop:10, padding:'10px 24px', fontSize:13, fontWeight:700, background:'var(--accent)', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {searchLoading ? 'Scanning…' : <><Ic icon={Search} size={13} /> Scan DAT Now</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


export function RateNegotiation() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const [form, setForm] = useState({ origin: '', destination: '', miles: '', rate: '', equipment_type: 'Dry Van', weight: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('qivori_rate_history') || '[]') } catch { return [] } })
  const [showHistory, setShowHistory] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)
  const autoFill = (load) => { const gross = load.gross || load.gross_pay || load.rate || 0; setForm({ origin: load.origin || '', destination: load.dest || load.destination || '', miles: String(load.miles || ''), rate: String(gross || ''), equipment_type: load.equipment || 'Dry Van', weight: String(load.weight || '').replace(/[^0-9]/g, '') }); setResult(null) }
  const analyze = async () => {
    if (!form.origin || !form.destination || !form.miles || !form.rate) { showToast('error', 'Missing Info', 'Fill in origin, destination, miles, and rate'); return }
    setLoading(true); setResult(null)
    try {
      const res = await apiFetch('/api/rate-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: form.origin, destination: form.destination, miles: Number(form.miles), rate: Number(form.rate), equipment_type: form.equipment_type, weight: form.weight }) })
      const data = await res.json()
      if (data.error) { showToast('error', 'Analysis Failed', data.error) }
      else { setResult(data); const entry = { ...data, origin: form.origin, destination: form.destination, miles: form.miles, rate: form.rate, equipment: form.equipment_type, timestamp: Date.now() }; const nh = [entry, ...history].slice(0, 20); setHistory(nh); try { localStorage.setItem('qivori_rate_history', JSON.stringify(nh)) } catch {} }
    } catch { showToast('error', 'Error', 'Could not analyze rate. Try again.') }
    setLoading(false)
  }
  const copyScript = () => { if (!result?.negotiation_script) return; navigator.clipboard?.writeText(result.negotiation_script); setCopiedScript(true); showToast('success', 'Copied!', 'Counter-offer script copied to clipboard'); setTimeout(() => setCopiedScript(false), 2000) }
  const VC = { below_market: { label: 'BELOW MARKET', color: 'var(--danger)', emoji: '\u{1F534}', bg: 'rgba(239,68,68,0.08)' }, fair: { label: 'FAIR RATE', color: 'var(--accent)', emoji: '\u{1F7E1}', bg: 'rgba(240,165,0,0.08)' }, good: { label: 'GOOD DEAL', color: 'var(--success)', emoji: '\u{1F7E2}', bg: 'rgba(34,197,94,0.08)' }, excellent: { label: 'EXCELLENT', color: 'var(--success)', emoji: '\u{2B50}', bg: 'rgba(34,197,94,0.12)' } }
  const inpS = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', width: '100%' }
  return (
    <div style={S.page}>
      <div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>RATE <span style={{ color: 'var(--accent)' }}>NEGOTIATION AI</span></div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Know if a rate is fair and get counter-offer scripts</div>
      </div>
      {(activeLoads?.length > 0 || loads?.length > 0) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Quick fill:</span>
        {[...(activeLoads || []), ...(loads || [])].slice(0, 5).map(l => <button key={l.id} onClick={() => autoFill(l)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>{(l.origin || '').split(',')[0]} &rarr; {(l.dest || l.destination || '').split(',')[0]}</button>)}
      </div>}
      <div style={S.panel}>
        <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Target} /> Rate Check</div>
          <button onClick={() => setShowHistory(!showHistory)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: showHistory ? 'rgba(240,165,0,0.12)' : 'var(--surface2)', border: '1px solid var(--border)', color: showHistory ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}><Ic icon={Clock} size={11} /> History ({history.length})</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Origin</label><input value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} placeholder="Chicago, IL" style={inpS} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Destination</label><input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="Atlanta, GA" style={inpS} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Miles</label><input type="number" value={form.miles} onChange={e => setForm(f => ({ ...f, miles: e.target.value }))} placeholder="716" style={inpS} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Rate (Gross $)</label><input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="1850" style={inpS} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Equipment</label><select value={form.equipment_type} onChange={e => setForm(f => ({ ...f, equipment_type: e.target.value }))} style={{ ...inpS, cursor: 'pointer' }}><option value="Dry Van">Dry Van</option><option value="Reefer">Reefer</option><option value="Flatbed">Flatbed</option><option value="Step Deck">Step Deck</option><option value="Power Only">Power Only</option></select></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Weight (lbs)</label><input type="number" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="42000" style={inpS} /></div>
          </div>
          <button onClick={analyze} disabled={loading} style={{ marginTop: 16, width: '100%', padding: '12px 20px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: loading ? 'wait' : 'pointer', fontFamily: "'DM Sans',sans-serif", background: loading ? 'var(--surface2)' : 'var(--accent)', color: loading ? 'var(--muted)' : '#000', transition: 'all 0.2s' }}>{loading ? 'Analyzing Rate...' : 'Analyze Rate'}</button>
        </div>
      </div>
      {result && (() => { const vc = VC[result.verdict] || VC.fair; return (<>
        <div style={{ ...S.panel, background: vc.bg, borderColor: vc.color + '30' }}><div style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{vc.emoji}</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: vc.color }}>{vc.label}</div>
          <div style={{ position: 'relative', width: 200, height: 110, margin: '16px auto 0' }}>
            <svg viewBox="0 0 200 110" width="200" height="110"><path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--surface2)" strokeWidth="12" strokeLinecap="round" /><path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={result.score >= 70 ? 'var(--success)' : result.score >= 45 ? 'var(--accent)' : 'var(--danger)'} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(result.score / 100) * 251.2} 251.2`} style={{ transition: 'stroke-dasharray 1s ease' }} /></svg>
            <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, lineHeight: 1, color: result.score >= 70 ? 'var(--success)' : result.score >= 45 ? 'var(--accent)' : 'var(--danger)' }}>{result.score}</div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1 }}>SCORE</div></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
            <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Your Rate</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: vc.color }}>${result.offered_rpm}/mi</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Market Avg</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--accent2)' }}>${result.market_rpm.avg}/mi</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Suggested</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--success)' }}>${result.suggested_counter}/mi</div></div>
          </div>
        </div></div>
        <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={BarChart2} /> Market Comparison</div></div><div style={{ padding: 16 }}><div style={{ position: 'relative', height: 40, background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}><div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(result.market_rpm.low / (result.market_rpm.high * 1.3)) * 100}%`, right: `${(1 - result.market_rpm.high / (result.market_rpm.high * 1.3)) * 100}%`, background: 'rgba(77,142,240,0.12)', borderRadius: 4 }} /><div style={{ position: 'absolute', top: 4, bottom: 4, left: `${Math.min(95, Math.max(5, (result.offered_rpm / (result.market_rpm.high * 1.3)) * 100))}%`, width: 4, borderRadius: 2, background: vc.color, transform: 'translateX(-50%)' }} /><div style={{ position: 'absolute', top: 4, bottom: 4, left: `${(result.market_rpm.avg / (result.market_rpm.high * 1.3)) * 100}%`, width: 2, borderRadius: 1, background: 'var(--accent2)', opacity: 0.6, transform: 'translateX(-50%)' }} /></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}><span>Low ${result.market_rpm.low}/mi</span><span>Avg ${result.market_rpm.avg}/mi</span><span>High ${result.market_rpm.high}/mi</span></div></div></div>
        <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Brain} /> AI Analysis</div></div><div style={{ padding: 16, fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>{result.reasoning}</div></div>
        {result.factors && result.factors.length > 0 && <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Activity} /> Rate Factors</div></div><div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>{result.factors.map((f, i) => { const ic = f.impact === 'positive' ? 'var(--success)' : f.impact === 'negative' ? 'var(--danger)' : 'var(--accent)'; const Imp = f.impact === 'positive' ? TrendingUp : f.impact === 'negative' ? TrendingDown : Activity; return (<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: ic + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic icon={Imp} size={14} color={ic} /></div><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700 }}>{f.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.detail}</div></div><span style={S.badge(ic)}>{f.impact.toUpperCase()}</span></div>) })}</div></div>}
        <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={DollarSign} /> Profit Breakdown</div></div><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 20, alignItems: 'center' }}><div style={{ width: 120, height: 120, flexShrink: 0, borderRadius: '50%', position: 'relative', background: (() => { const p = result.profit_estimate; const t = p.gross || 1; let o = 0; const s = []; const a = (v, c) => { const pc = (v / t) * 100; s.push(`${c} ${o}% ${o + pc}%`); o += pc }; a(p.fuel, '#ef4444'); a(p.insurance, '#f59e0b'); a(p.maintenance, '#8b5cf6'); a(p.tires || 0, '#ec4899'); a(p.truck_payment || 0, '#6366f1'); a(p.driver_pay || 0, '#f97316'); a(Math.max(0, p.net), '#22c55e'); return `conic-gradient(${s.join(', ')})` })() }}><div style={{ position: 'absolute', inset: 20, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: result.profit_estimate.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>${result.profit_estimate.net.toLocaleString()}</div><div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>NET</div></div></div><div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>{[{ l: 'Fuel', v: result.profit_estimate.fuel, c: '#ef4444' }, { l: 'Insurance', v: result.profit_estimate.insurance, c: '#f59e0b' }, { l: 'Maintenance', v: result.profit_estimate.maintenance, c: '#8b5cf6' }, { l: 'Tires', v: result.profit_estimate.tires || 0, c: '#ec4899' }, { l: 'Truck Pmt', v: result.profit_estimate.truck_payment || 0, c: '#6366f1' }, { l: 'Driver Pay', v: result.profit_estimate.driver_pay || 0, c: '#f97316' }, { l: 'Net Profit', v: result.profit_estimate.net, c: '#22c55e' }].map(it => <div key={it.l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: it.c, flexShrink: 0 }} /><span style={{ flex: 1, color: 'var(--muted)' }}>{it.l}</span><span style={{ fontWeight: 700, fontFamily: 'monospace' }}>${it.v.toLocaleString()}</span></div>)}</div></div></div></div>
        <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={MessageCircle} /> Counter-Offer Script</div><button onClick={copyScript} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: copiedScript ? 'rgba(34,197,94,0.12)' : 'var(--accent)', border: 'none', color: copiedScript ? 'var(--success)' : '#000', cursor: 'pointer', fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>{copiedScript ? 'Copied!' : 'Copy Script'}</button></div><div style={{ padding: 16 }}><div style={{ fontSize: 13, lineHeight: 1.8, padding: 14, background: 'var(--surface2)', borderRadius: 8, borderLeft: '3px solid var(--accent)', fontStyle: 'italic', color: 'var(--text)' }}>&ldquo;{result.negotiation_script}&rdquo;</div><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button onClick={copyScript} className="btn btn-primary" style={{ flex: 1, fontSize: 12 }}><Ic icon={Save} size={12} /> Copy Counter Script</button><button onClick={() => showToast('', 'Suggested Counter', '$' + (result.suggested_gross || 0).toLocaleString() + ' ($' + result.suggested_counter + '/mi)')} className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }}><Ic icon={Phone} size={12} /> Call Broker</button></div></div></div>
      </>) })()}
      {showHistory && history.length > 0 && <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Clock} /> Analysis History</div><button onClick={() => { setHistory([]); localStorage.removeItem('qivori_rate_history') }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Clear</button></div><div style={{ maxHeight: 300, overflowY: 'auto' }}>{history.map((h, i) => { const hvc = VC[h.verdict] || VC.fair; return (<div key={i} onClick={() => { setForm({ origin: h.origin || '', destination: h.destination || '', miles: String(h.miles || ''), rate: String(h.rate || ''), equipment_type: h.equipment || 'Dry Van', weight: '' }); setResult(h); setShowHistory(false) }} style={{ ...S.row, gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: hvc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{hvc.emoji}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(h.origin || '').split(',')[0]} &rarr; {(h.destination || '').split(',')[0]}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>${Number(h.rate || 0).toLocaleString()} &middot; ${h.offered_rpm}/mi &middot; Score: {h.score}</div></div><span style={S.badge(hvc.color)}>{hvc.label}</span></div>) })}</div></div>}
    </div>
  )
}


export function RateBadge({ rpm, equipment, onClick, compact }) {
  const mktAvg = { 'Dry Van': 2.50, 'Reefer': 2.90, 'Flatbed': 3.10, 'Step Deck': 3.30, 'Power Only': 2.10, 'Tanker': 3.30 }
  const avg = mktAvg[equipment] || 2.50
  const rpmNum = Number(rpm) || 0
  if (rpmNum <= 0) return null
  let color, label, emoji
  if (rpmNum >= avg * 1.1) { color = 'var(--success)'; label = 'Good'; emoji = '\u{1F7E2}' }
  else if (rpmNum >= avg * 0.92) { color = 'var(--accent)'; label = 'Fair'; emoji = '\u{1F7E1}' }
  else { color = 'var(--danger)'; label = 'Below'; emoji = '\u{1F534}' }
  if (compact) return <span onClick={onClick} title={label + ' rate'} style={{ fontSize: 10, cursor: onClick ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 2 }}>{emoji}</span>
  return (<div onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: color + '12', border: '1px solid ' + color + '25', cursor: onClick ? 'pointer' : 'default', fontSize: 10, fontWeight: 700, color }}>{emoji} {label} &middot; ${rpmNum.toFixed(2)}/mi{onClick && <span style={{ fontSize: 9, opacity: 0.7 }}> Analyze</span>}</div>)
}

