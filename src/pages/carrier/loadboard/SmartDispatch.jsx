import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { useTranslation } from '../../../lib/i18n'

import {
  Bookmark, Bot, Check, CheckCircle, Clock, DollarSign,
  Navigation, Plus, Route, Truck, Upload, Zap,
} from 'lucide-react'

import { useAIActions } from '../../../hooks/useAIActions'

// ─── AI DISPATCH COPILOT ───────────────────────────────────────────────────────
// Fallback sample data — used when no load board API keys are configured
const SAMPLE_MARKET_LOADS = []

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
  const { loads: ctxLoads, addLoad, addLoadWithStops, totalRevenue, expenses, drivers: dbDrivers, fuelCostPerMile } = useCarrier()
  const { processReply } = useAIActions()
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
  const [quickRoute, setQuickRoute]     = useState(null) // { miles, durationText, drivingDays }
  const [quickRouteLoading, setQuickRouteLoading] = useState(false)
  const [showMap, setShowMap]           = useState(false)

  // Compute average driver pay rate from actual driver profiles (0 if none configured)
  const avgDriverPayPct = useMemo(() => {
    const pctDrivers = dbDrivers.filter(d => d.pay_model === 'percent' && d.pay_rate)
    if (pctDrivers.length > 0) return pctDrivers.reduce((s, d) => s + Number(d.pay_rate), 0) / pctDrivers.length / 100
    return 0
  }, [dbDrivers])

  // Quick mileage lookup when both origin + destination search fields are filled
  useEffect(() => {
    if (!searchOrigin || !searchDest) { setQuickRoute(null); return }
    const o = searchOrigin.trim(), d = searchDest.trim()
    if (o.length < 2 || d.length < 2) return
    setQuickRouteLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/calculate-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: o, destination: d }),
        })
        const data = await res.json()
        if (data.ok && data.miles > 0) {
          setQuickRoute({
            miles: data.miles, durationText: data.durationText, drivingDays: data.drivingDays,
            origin: o, destination: d,
            fuelCost: data.fuel?.cost || 0, fuelGallons: data.fuel?.gallons || 0, dieselPrice: data.fuel?.dieselPrice || 0,
            hasTolls: data.tolls?.hasTolls || false, tollEstimate: data.tolls?.estimate || 0,
            totalTripCost: data.totalTripCost || 0,
          })
        } else { setQuickRoute(null) }
      } catch { setQuickRoute(null) }
      setQuickRouteLoading(false)
    }, 800)
    return () => { clearTimeout(t); setQuickRouteLoading(false) }
  }, [searchOrigin, searchDest])

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
  const [addCalcMiles, setAddCalcMiles] = useState(false)
  const addFileRef = useRef(null)

  // Auto-calculate miles when origin + destination are filled
  useEffect(() => {
    if (!addForm.origin || !addForm.dest || addForm.miles) return
    const o = addForm.origin.trim(), d = addForm.dest.trim()
    if (o.length < 3 || d.length < 3) return
    setAddCalcMiles(true)
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/calculate-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin: o, destination: d }),
        })
        const data = await res.json()
        if (data.ok && data.miles > 0) {
          setAddForm(fm => ({ ...fm, miles: String(data.miles) }))
        }
      } catch {}
      setAddCalcMiles(false)
    }, 800)
    return () => { clearTimeout(t); setAddCalcMiles(false) }
  }, [addForm.origin, addForm.dest])

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
    const f = l.miles/6.8*(fuelCostPerMile ? fuelCostPerMile * 6.8 : 3.89); const d = l.gross*avgDriverPayPct; return l.gross-f-d
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
    if (!bookModal) return
    const l = bookModal
    const driverName = bookDriver || 'Owner/Operator'
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
      driver:    driverName,
      refNum:    l.id,
    })
    setLoads(ls => ls.filter(x => x.id !== l.id))
    setSelected(null)
    setBookModal(null)
    setBookDriver('')
    showToast('', 'Load Booked!', `${l.fromFull} → ${l.toFull} · $${l.gross.toLocaleString()} · ${driverName}`)
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
      const { displayText, actions, results } = await processReply(rawReply)
      const actionSummary = results.length > 0 ? '\n\n' + results.map(r => '✓ ' + r).join('\n') : ''
      setAiMessages(m => ({ ...m, [sel.id]: [...next, { role:'assistant', content: displayText + actionSummary, hasActions: actions.length > 0 }] }))
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
          <button onClick={() => { setSearchOrigin(''); setSearchDest(''); setQuickRoute(null) }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14, padding:'0 4px' }}>✕</button>
          <button onClick={() => setAddModal(true)} className="btn btn-primary" style={{ padding:'5px 12px', fontSize:11, fontWeight:700, whiteSpace:'nowrap', borderRadius:6 }}>
            <Plus size={12} /> Add Load
          </button>
        </div>

        {/* Quick mileage result */}
        {(quickRoute || quickRouteLoading) && (
          <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', background:'rgba(0,212,170,0.04)' }}>
            {quickRouteLoading ? (
              <span style={{ fontSize:11, color:'var(--muted)' }}>Calculating route...</span>
            ) : quickRoute && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>
                    <Route size={12} style={{ verticalAlign:'middle', marginRight:4 }} />
                    <b style={{ color:'var(--accent)', fontSize:14, fontFamily:"'Bebas Neue',sans-serif" }}>{quickRoute.miles.toLocaleString()}</b> miles
                  </span>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>
                    <Clock size={12} style={{ verticalAlign:'middle', marginRight:4 }} />
                    <b style={{ color:'var(--text)' }}>{quickRoute.durationText}</b> drive
                  </span>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>
                    <Truck size={12} style={{ verticalAlign:'middle', marginRight:4 }} />
                    <b style={{ color:'var(--text)' }}>{quickRoute.drivingDays}</b> {quickRoute.drivingDays === 1 ? 'day' : 'days'} (HOS)
                  </span>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>
                    ⛽ <b style={{ color:'var(--danger)' }}>${quickRoute.fuelCost.toLocaleString()}</b> fuel
                    <span style={{ fontSize:9, color:'var(--muted)', marginLeft:4 }}>({quickRoute.fuelGallons}gal @ ${quickRoute.dieselPrice}/gal)</span>
                  </span>
                  {quickRoute.hasTolls && (
                    <span style={{ fontSize:11, color:'var(--muted)' }}>
                      🛣️ <b style={{ color:'var(--accent2)' }}>~${quickRoute.tollEstimate.toLocaleString()}</b> tolls
                    </span>
                  )}
                  <span style={{ fontSize:11, fontWeight:800, color:'var(--text)', background:'rgba(240,165,0,0.1)', padding:'2px 8px', borderRadius:6 }}>
                    Total: <b style={{ color:'var(--accent)', fontFamily:"'Bebas Neue',sans-serif", fontSize:14 }}>${quickRoute.totalTripCost.toLocaleString()}</b>
                  </span>
                  <button onClick={() => setShowMap(m => !m)} style={{ marginLeft:'auto', background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'3px 10px', color: showMap ? 'var(--accent)' : 'var(--muted)', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    <Navigation size={10} style={{ verticalAlign:'middle', marginRight:4 }} />{showMap ? 'Hide Map' : 'Show Map'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Google Map route embed */}
        {quickRoute && showMap && (
          <div style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
            <iframe
              width="100%"
              height="220"
              style={{ border:0, display:'block' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps/embed/v1/directions?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}&origin=${encodeURIComponent(quickRoute.origin)}&destination=${encodeURIComponent(quickRoute.destination)}&mode=driving`}
            />
          </div>
        )}

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
                onClick={() => {
                  const wl = JSON.parse(localStorage.getItem('qivori_watchlist_loads') || '[]')
                  if (wl.includes(sel.id)) {
                    localStorage.setItem('qivori_watchlist_loads', JSON.stringify(wl.filter(id => id !== sel.id)))
                    showToast('', 'Removed', sel.id + ' removed from watchlist')
                  } else {
                    localStorage.setItem('qivori_watchlist_loads', JSON.stringify([...wl, sel.id]))
                    showToast('', 'Saved', sel.id + ' added to watchlist')
                  }
                }}>
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
                <div style={{ maxWidth:'88%', padding:'9px 12px', borderRadius: m.role==='user'?'12px 12px 4px 12px':'12px 12px 12px 4px', background: m.role==='user'?'var(--accent)':'var(--surface2)', color: m.role==='user'?'#000':'var(--text)', fontSize:12, lineHeight:1.6, whiteSpace:'pre-wrap', border: m.hasActions?'1px solid rgba(34,197,94,0.3)':'none' }}>
                  {m.content}
                </div>
                {m.hasActions && (
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2, padding:'0 4px' }}>
                    <CheckCircle size={9} color="var(--success)" />
                    <span style={{ fontSize:9, color:'var(--success)', fontWeight:600 }}>Action executed</span>
                  </div>
                )}
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
                { key:'miles', label: addCalcMiles ? 'Calculating...' : 'Miles', ph: addCalcMiles ? '...' : '350', type:'number' },
                { key:'pickup', label:'Pickup Date/Time', ph:'', type:'date' },
                { key:'delivery', label:'Delivery Date/Time', ph:'', type:'date' },
              ] : [
                { key:'broker', label:'Broker', ph:'e.g. TQL, CH Robinson' },
                { key:'equipment', label:'Equipment', ph:'Dry Van' },
                { key:'origin', label:'Origin *', ph:'City, ST' },
                { key:'dest', label:'Destination *', ph:'City, ST' },
                { key:'gross', label:'Rate ($) *', ph:'3500', type:'number' },
                { key:'miles', label: addCalcMiles ? 'Calculating...' : 'Miles', ph: addCalcMiles ? '...' : '1200', type:'number' },
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
              {/* Owner/Operator default option */}
              <label style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, border:`1px solid ${!bookDriver || bookDriver==='Owner/Operator'?'var(--accent)':'var(--border)'}`, background: !bookDriver || bookDriver==='Owner/Operator'?'rgba(240,165,0,0.06)':'var(--surface2)', cursor:'pointer' }}>
                <input type="radio" name="driver" value="" checked={!bookDriver || bookDriver==='Owner/Operator'} onChange={() => setBookDriver('')} style={{ accentColor:'var(--accent)' }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>Owner/Operator <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400 }}>· Me</span></div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>I'm driving this load</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(34,197,94,0.1)', color:'var(--success)' }}>Available</span>
              </label>
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
            {(
              <div style={{ background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:12 }}>
                <div style={{ color:'var(--accent)', fontWeight:700, marginBottom:6 }}><Ic icon={Check} /> Booking Summary</div>
                <div style={{ color:'var(--muted)', lineHeight:1.7 }}>
                  <b style={{ color:'var(--text)' }}>{bookDriver || 'Owner/Operator'}</b> → {bookModal.fromFull} to {bookModal.toFull}<br/>
                  Pickup: {bookModal.pickup} · Gross: <b style={{ color:'var(--accent)' }}>${bookModal.gross.toLocaleString()}</b><br/>
                  Est. net: <b style={{ color:'var(--success)' }}>${calcNet.toLocaleString()}</b> ({calcMargin}% margin)
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setBookModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2, padding:'11px 0', fontSize:13 }}
                onClick={confirmBook}>
                <Zap size={13} /> Confirm & Add to Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
