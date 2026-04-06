import React, { useState, useMemo, useEffect } from 'react'
import { Ic } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import {
  Calendar, Check, CircleDot, FileText, Flag, MapPin,
  MessageCircle, Package, Phone, Square, Truck, Zap,
} from 'lucide-react'

// ─── STOP TIMELINE (internal helper) ────────────────────────────────────────

function StopTimeline({ load, onAdvance }) {
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

// ─── COMMAND CENTER ────────────────────────────────────────────────────────────

const CITY_XY = {
  'Atlanta, GA':[695,540],'Chicago, IL':[610,335],'Dallas, TX':[525,600],'Miami, FL':[718,666],
  'Memphis, TN':[625,510],'New York, NY':[790,295],'Denver, CO':[400,425],'Houston, TX':[538,648],
  'Phoenix, AZ':[305,558],'Los Angeles, CA':[208,510],'Minneapolis, MN':[558,278],
  'Nashville, TN':[645,500],'Columbus, OH':[680,380],'Indianapolis, IN':[640,390],
  'St. Louis, MO':[580,430],'Kansas City, MO':[520,420],'Detroit, MI':[665,330],
  'Charlotte, NC':[725,490],'Jacksonville, FL':[720,590],'Louisville, KY':[650,420],
  'Las Vegas, NV':[255,480],'Seattle, WA':[175,210],'Portland, OR':[175,255],
  'Sacramento, CA':[185,410],'San Francisco, CA':[165,430],'San Antonio, TX':[485,640],
  'Orlando, FL':[720,610],'Tampa, FL':[700,620],'Raleigh, NC':[740,470],
  'Pittsburgh, PA':[720,360],'Baltimore, MD':[755,370],'Boston, MA':[810,265],
  'Philadelphia, PA':[770,340],'Salt Lake City, UT':[320,390],'Albuquerque, NM':[365,530],
  'Omaha, NE':[500,370],'Oklahoma City, OK':[500,510],'Cincinnati, OH':[665,400],
  'Milwaukee, WI':[600,310],'Cleveland, OH':[685,350],'San Diego, CA':[225,545],
  'Tucson, AZ':[315,575],'El Paso, TX':[370,580],'Boise, ID':[265,320],
  'Little Rock, AR':[560,520],'Birmingham, AL':[650,540],'Savannah, GA':[720,560],
  'Norfolk, VA':[760,440],'Knoxville, TN':[670,480],'Laredo, TX':[470,670],
  'Fresno, CA':[195,460],'Austin, TX':[500,630],'New Orleans, LA':[600,610],
  'Richmond, VA':[745,430],'Harrisburg, PA':[750,350],'Buffalo, NY':[730,300],
}

function findCityXY(loc) {
  if (!loc) return null
  if (CITY_XY[loc]) return CITY_XY[loc]
  const city = loc.split(',')[0].trim().toLowerCase()
  for (const [key, xy] of Object.entries(CITY_XY)) {
    if (key.split(',')[0].trim().toLowerCase() === city) return xy
  }
  return null
}

function latlngToSVG(lat, lng) {
  if (!lat || !lng) return null
  const x = ((lng - (-125)) / ((-66) - (-125))) * 900 + 50
  const y = ((50 - lat) / (50 - 24)) * 650 + 50
  return [x, y]
}

const CC_PROG  = { 'Rate Con Received':0.05, 'Booked':0.1, 'Assigned to Driver':0.15, 'En Route to Pickup':0.30, 'Loaded':0.45, 'In Transit':0.65, 'Delivered':1.0 }
const CC_PALETTE = ['#f0a500','#4d8ef0','#22c55e','#ef4444','#a855f7','#ec4899','#06b6d4','#f97316','#14b8a6','#e879f9']

const GANTT_START = 7
const GANTT_HOURS = 17
const GANTT_HOURS_LABELS = ['7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM','12AM']

export function CommandCenter() {
  const { showToast } = useApp()
  const { loads, activeLoads, drivers: dbDrivers, vehicles } = useCarrier()
  const [selDriver, setSelDriver] = useState(null)
  const [filterStatus, setFilterStatus] = useState('All')
  const [smsModal, setSmsModal] = useState(null)
  const [smsText, setSmsText] = useState('')
  const [smsSending, setSmsSending] = useState(false)

  // Live clock for Gantt NOW line
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const nowHour = now.getHours() + now.getMinutes() / 60
  const nowPct = Math.max(0, Math.min(100, ((nowHour - GANTT_START) / GANTT_HOURS) * 100))

  const drivers = dbDrivers.length ? dbDrivers.map(d => d.full_name) : []

  // Dynamic color + unit maps
  const driverColorMap = useMemo(() => {
    const map = {}
    dbDrivers.forEach((d, i) => { map[d.full_name] = CC_PALETTE[i % CC_PALETTE.length] })
    return map
  }, [dbDrivers])

  const driverUnitMap = useMemo(() => {
    const map = {}
    dbDrivers.forEach((d, i) => {
      const veh = (vehicles || []).find(v => v.driver_id === d.id || v.assigned_driver === d.full_name)
      map[d.full_name] = veh?.unit_number || d.vehicle_unit || `Unit ${i + 1}`
    })
    return map
  }, [dbDrivers, vehicles])

  // HOS estimation from load data
  const driverHOS = useMemo(() => {
    const hos = {}
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    dbDrivers.forEach(d => {
      const name = d.full_name
      const recent = loads.filter(l => l.driver === name && l.pickup_date && new Date(l.pickup_date) >= weekAgo)
      let weekHrs = 0
      recent.forEach(l => { weekHrs += l.drive_time_minutes ? l.drive_time_minutes / 60 : (l.miles || 0) / 50 })
      weekHrs = Math.min(70, Math.round(weekHrs * 10) / 10)
      const todayLoads = loads.filter(l => l.driver === name && l.pickup_date && new Date(l.pickup_date) >= todayStart)
      let todayHrs = 0
      todayLoads.forEach(l => { todayHrs += l.drive_time_minutes ? l.drive_time_minutes / 60 : (l.miles || 0) / 50 })
      todayHrs = Math.min(11, Math.round(todayHrs * 10) / 10)
      const rem = Math.max(0, 70 - weekHrs)
      hos[name] = { weekUsed: weekHrs, weekRemaining: rem, weekPct: (weekHrs / 70) * 100, todayUsed: todayHrs, todayRemaining: Math.max(0, 11 - todayHrs) }
    })
    return hos
  }, [dbDrivers, loads])

  // Gantt blocks from real load data
  const ganttBlocks = useMemo(() => {
    const blocks = {}
    const todayStr = new Date().toISOString().split('T')[0]
    drivers.forEach(name => {
      const load = activeLoads.find(l => l.driver === name)
      if (!load) return
      let startH = 7, endH = 17
      if (load.pickup_date) {
        const pd = new Date(load.pickup_date)
        if (pd.toISOString().split('T')[0] === todayStr) startH = pd.getHours() + pd.getMinutes() / 60
      }
      if (load.delivery_date) {
        const dd = new Date(load.delivery_date)
        endH = dd.getHours() + dd.getMinutes() / 60
        if (endH <= startH) endH = startH + (load.drive_time_minutes ? load.drive_time_minutes / 60 : (load.miles || 300) / 50)
      } else {
        endH = startH + (load.drive_time_minutes ? load.drive_time_minutes / 60 : (load.miles || 300) / 50)
      }
      startH = Math.max(GANTT_START, Math.min(GANTT_START + GANTT_HOURS, startH))
      endH = Math.max(startH + 0.5, Math.min(GANTT_START + GANTT_HOURS, endH))
      blocks[name] = { start: startH, end: endH }
    })
    return blocks
  }, [drivers, activeLoads])

  // Build enriched truck data with smart city matching
  const trucks = drivers.map(driver => {
    const load  = activeLoads.find(l => l.driver === driver)
    const color = driverColorMap[driver] || 'var(--accent)'
    const unit  = driverUnitMap[driver] || 'Unit'
    if (!load) return { driver, color, unit, load: null, prog: 0, tx: null, ty: null, fromXY: null, toXY: null }
    const prog  = CC_PROG[load.status] || 0.5
    const fromXY = latlngToSVG(load.origin_lat, load.origin_lng) || findCityXY(load.origin)
    const toXY   = latlngToSVG(load.dest_lat, load.dest_lng) || findCityXY(load.dest)
    const tx = fromXY && toXY ? fromXY[0] + (toXY[0] - fromXY[0]) * prog : null
    const ty = fromXY && toXY ? fromXY[1] + (toXY[1] - fromXY[1]) * prog : null
    return { driver, color, unit, load, prog, tx, ty, fromXY, toXY }
  })

  const selected  = trucks.find(t => t.driver === selDriver) || trucks.find(t => t.load) || trucks[0]
  const queueLoad = filterStatus === 'All' ? activeLoads : activeLoads.filter(l => l.status === filterStatus)

  const handleSendSMS = async () => {
    if (!smsText.trim() || !smsModal) return
    setSmsSending(true)
    try {
      const res = await apiFetch('/api/send-sms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to: smsModal.phone, message: smsText }) })
      const data = await res.json()
      if (data.ok || data.success || data.sid) { showToast('','SMS Sent',`Message sent to ${smsModal.driverName}`); setSmsModal(null) }
      else showToast('','SMS Failed', data.error || 'Failed to send')
    } catch { showToast('','Error','Could not send SMS') }
    setSmsSending(false)
  }

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
              const color  = driverColorMap[load.driver] || 'var(--accent)'
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
                      {driverUnitMap[load.driver] || ''} · {load.driver}
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

        {/* CENTER: Google Maps */}
        {(() => {
          const mapsKey = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '') : ''
          const selTruck = selected?.load ? selected : null
          const activeTruck = trucks.find(t => t.load)
          let mapUrl = ''
          if (mapsKey) {
            if (selTruck?.load?.origin && selTruck?.load?.dest) {
              mapUrl = `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${encodeURIComponent(selTruck.load.origin)}&destination=${encodeURIComponent(selTruck.load.dest)}&mode=driving`
            } else if (activeTruck?.load?.origin && activeTruck?.load?.dest) {
              mapUrl = `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${encodeURIComponent(activeTruck.load.origin)}&destination=${encodeURIComponent(activeTruck.load.dest)}&mode=driving`
            } else {
              mapUrl = `https://www.google.com/maps/embed/v1/view?key=${mapsKey}&center=39.8283,-98.5795&zoom=4&maptype=roadmap`
            }
          }
          return (
            <div style={{ flex:1, position:'relative', overflow:'hidden', background:'var(--surface2)' }}>
              {mapsKey ? (
                <iframe width="100%" height="100%" style={{ border:0, display:'block' }} loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade" src={mapUrl} />
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:8 }}>
                  <div style={{ fontSize:13, color:'var(--muted)' }}>Google Maps API key not configured</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Add VITE_GOOGLE_MAPS_API_KEY to Vercel</div>
                </div>
              )}

              {/* Top label overlay */}
              <div style={{ position:'absolute', top:12, left:12, zIndex:10, pointerEvents:'none' }}>
                <div style={{ background:'rgba(0,0,0,0.75)', borderRadius:8, padding:'6px 12px', backdropFilter:'blur(8px)' }}>
                  <span style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>
                    ● LIVE FLEET — {trucks.filter(t=>t.load).length} on load
                  </span>
                </div>
              </div>

              {/* Truck legend (bottom right) */}
              <div style={{ position:'absolute', bottom:12, right:12, display:'flex', flexDirection:'column', gap:4, zIndex:10 }}>
                {trucks.filter(t => t.load).map(t => (
                  <div key={t.driver} onClick={() => setSelDriver(t.driver === selDriver ? null : t.driver)}
                    style={{ display:'flex', alignItems:'center', gap:6, background: selDriver===t.driver ? 'rgba(240,165,0,0.15)' : 'rgba(0,0,0,0.75)',
                      border:`1px solid ${selDriver===t.driver ? t.color : 'rgba(255,255,255,0.1)'}`, borderRadius:8, padding:'5px 10px', cursor:'pointer', backdropFilter:'blur(8px)' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }} />
                    <span style={{ fontSize:10, color:'#fff', fontWeight: selDriver===t.driver ? 700 : 400 }}>{t.driver.split(' ')[0]}</span>
                    <span style={{ fontSize:9, color:'#00d4aa' }}>● {t.load.status}</span>
                  </div>
                ))}
              </div>

              {/* Bottom info strip — selected truck */}
              {selected && selected.load && (
                <div style={{ position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
                  background:'rgba(0,0,0,0.85)', border:`1px solid ${selected.color}`,
                  borderRadius:10, padding:'10px 20px', display:'flex', gap:18, zIndex:20,
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
                    { l:'HOS',      v: driverHOS[selected.driver] ? `${driverHOS[selected.driver].weekRemaining.toFixed(1)}h` : '—' },
                  ].map(item => (
                    <div key={item.l} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:8, color:'rgba(255,255,255,0.35)', marginBottom:2, fontWeight:700, letterSpacing:1 }}>{item.l}</div>
                      <div style={{ fontSize:12, fontWeight:700, color: item.l==='PROGRESS' ? selected.color : '#fff', whiteSpace:'nowrap' }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

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
                    onClick={() => {
                      const drvRecord = dbDrivers.find(d => d.full_name === selected.driver)
                      const phone = drvRecord?.phone
                      if (phone) {
                        window.open('tel:' + phone)
                      } else {
                        showToast('','No Phone','No phone number on file for ' + selected.driver)
                      }
                    }}><Ic icon={Phone} /> Call</button>
                  <button className="btn btn-ghost" style={{ flex:1, fontSize:11, padding:'7px 4px' }}
                    onClick={() => {
                      const drvRecord = dbDrivers.find(d => d.full_name === selected.driver)
                      const phone = drvRecord?.phone
                      if (phone) { setSmsModal({ driverName: selected.driver, phone }); setSmsText('') }
                      else showToast('','No Phone','No phone number on file for ' + selected.driver)
                    }}><Ic icon={MessageCircle} /> Message</button>
                </div>
                {/* Inline SMS compose */}
                {smsModal && smsModal.driverName === selected.driver && (
                  <div style={{ padding:'10px 12px 12px', background:'var(--surface2)', borderRadius:8, margin:'8px 0 0' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--accent)', marginBottom:6 }}>SMS to {smsModal.driverName}</div>
                    <textarea value={smsText} onChange={e => setSmsText(e.target.value)} placeholder="Type message..."
                      style={{ width:'100%', height:60, background:'var(--bg)', color:'var(--text)', border:'1px solid var(--border)', borderRadius:6, padding:8, fontSize:11, fontFamily:"'DM Sans',sans-serif", resize:'none' }}/>
                    <div style={{ display:'flex', gap:6, marginTop:6 }}>
                      <button className="btn btn-primary" style={{ flex:1, fontSize:10, padding:'6px 8px' }} onClick={handleSendSMS} disabled={smsSending || !smsText.trim()}>
                        {smsSending ? 'Sending...' : 'Send SMS'}
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize:10, padding:'6px 8px' }} onClick={() => setSmsModal(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {/* HOS */}
              {(() => {
                const hos = driverHOS[selected.driver]
                const hosColor = hos ? (hos.weekRemaining > 20 ? 'var(--success)' : hos.weekRemaining > 5 ? 'var(--warning)' : 'var(--danger)') : 'var(--muted)'
                return (
                  <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:8 }}>HOURS OF SERVICE</div>
                    <div style={{ fontSize:22, fontFamily:"'Bebas Neue',sans-serif", color:hosColor, marginBottom:6 }}>
                      {hos ? `${hos.weekRemaining.toFixed(1)}h remaining` : '70.0h remaining'}
                    </div>
                    <div style={{ height:6, background:'var(--surface2)', borderRadius:3, overflow:'hidden', marginBottom:4 }}>
                      <div style={{ height:'100%', width:`${hos ? hos.weekPct : 0}%`, background:`linear-gradient(90deg,var(--success),${hosColor})`, borderRadius:3, transition:'width 0.3s' }}/>
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>
                      {hos ? `70-hr week: ${hos.weekUsed.toFixed(1)}h used · Today: ${hos.todayUsed.toFixed(1)}h / 11h` : 'No loads this week — full hours available'}
                    </div>
                  </div>
                )
              })()}

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
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('switchToDispatch'))
                      showToast('','Dispatch','Switching to Dispatch Board...')
                    }}><Ic icon={Zap} /> Find Load</button>
                </div>
              )}

              {/* MTD Performance */}
              <div style={{ padding:'14px 18px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:10 }}>PERFORMANCE · MTD</div>
                {(() => {
                  const drvLoads = loads.filter(l => {
                    if (l.driver !== selected.driver) return false
                    const d = l.pickup_date || l.created_at
                    if (!d) return false
                    const ld = new Date(d)
                    return ld.getMonth() === now.getMonth() && ld.getFullYear() === now.getFullYear()
                  })
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
            const color = driverColorMap[driver] || 'var(--accent)'
            const blk   = ganttBlocks[driver]
            const hasBlock = !!blk
            const left  = hasBlock ? ((blk.start - GANTT_START) / GANTT_HOURS) * 100 : 0
            const width = hasBlock ? ((blk.end - blk.start)    / GANTT_HOURS) * 100 : 0

            return (
              <div key={driver} style={{ display:'flex', alignItems:'center', marginBottom:6, height:30 }}>
                <div style={{ width:88, paddingLeft:16, flexShrink:0 }}>
                  <div style={{ fontSize:10, fontWeight:700, color }}>{driverUnitMap[driver] || ''}</div>
                  <div style={{ fontSize:9,  color:'var(--muted)' }}>{driver.split(' ')[0]}</div>
                </div>
                <div style={{ flex:1, position:'relative', height:22, background:'var(--surface2)', borderRadius:4, marginRight:16 }}>
                  {/* NOW line */}
                  <div style={{ position:'absolute', top:0, bottom:0, left:`${nowPct}%`, width:1.5,
                    background:'rgba(239,68,68,0.85)', zIndex:3 }}/>
                  {/* Load block */}
                  {t?.load && hasBlock && (
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
