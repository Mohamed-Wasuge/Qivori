import React, { useState, useMemo, useEffect } from 'react'
import {
  MapPin, Package, Flag, Check, CircleDot, Square,
  Calendar, FileText, Star, Flame, TrendingUp, TrendingDown,
  AlertTriangle, ArrowRight, DollarSign, Briefcase, Truck, Zap
} from 'lucide-react'
import { Ic } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'

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

const LANES_SEED = [
  { id:'l1', from:'ATL', to:'CHI', fromFull:'Atlanta, GA', toFull:'Chicago, IL', miles:674, loads:0, avgRpm:2.94, topRpm:3.20, avgGross:0, trend:0, rating:'steady', ratingLabel:'EXAMPLE', color:'var(--muted)', brokers:['Echo Global'], backhaul:50, deadhead:0, equipment:'Dry Van' },
]

// Build lanes from actual load history
function buildLanesFromHistory(loads) {
  const laneMap = {}
  ;(loads || []).forEach(ld => {
    const o = ld.origin || ''
    const d = ld.dest || ld.destination || ''
    if (!o || !d) return
    const key = o + '→' + d
    if (!laneMap[key]) {
      const fromShort = o.split(',')[0].substring(0, 3).toUpperCase()
      const destShort = d.split(',')[0].substring(0, 3).toUpperCase()
      laneMap[key] = { id: 'lane-' + fromShort + destShort, from: fromShort, to: destShort, fromFull: o, toFull: d, miles: 0, loads: 0, avgRpm: 0, topRpm: 0, avgGross: 0, trend: 0, rating: 'steady', ratingLabel: 'YOUR LANE', color: 'var(--accent)', brokers: [], backhaul: 50, deadhead: 0, equipment: ld.equipment || 'Dry Van', _myLoads: [] }
    }
    laneMap[key]._myLoads.push(ld)
    laneMap[key].loads++
    if (ld.broker && !laneMap[key].brokers.includes(ld.broker)) laneMap[key].brokers.push(ld.broker)
  })
  return Object.values(laneMap).map(l => {
    const grosses = l._myLoads.map(ld => ld.gross || 0)
    const rpms = l._myLoads.map(ld => ld.rate || 0).filter(r => r > 0)
    const miles = l._myLoads.map(ld => ld.miles || 0).filter(m => m > 0)
    l.avgGross = grosses.length ? Math.round(grosses.reduce((a, b) => a + b, 0) / grosses.length) : 0
    l.avgRpm = rpms.length ? parseFloat((rpms.reduce((a, b) => a + b, 0) / rpms.length).toFixed(2)) : 0
    l.topRpm = rpms.length ? parseFloat(Math.max(...rpms).toFixed(2)) : 0
    l.miles = miles.length ? Math.round(miles.reduce((a, b) => a + b, 0) / miles.length) : 0
    if (l.loads >= 3) { l.rating = 'recurring'; l.ratingLabel = 'RECURRING'; l.color = 'var(--success)' }
    else if (l.loads >= 2) { l.ratingLabel = 'ACTIVE'; l.color = 'var(--accent2)' }
    return l
  }).sort((a, b) => b.loads - a.loads)
}

export function LaneIntel() {
  const { showToast } = useApp()
  const { loads, drivers: laneDrivers } = useCarrier()
  const laneAvgPayPct = useMemo(() => {
    const pctDrivers = laneDrivers.filter(d => d.pay_model === 'percent' && d.pay_rate)
    if (pctDrivers.length > 0) return pctDrivers.reduce((s, d) => s + Number(d.pay_rate), 0) / pctDrivers.length / 100
    return 0 // fallback — per-driver rate preferred
  }, [laneDrivers])
  const [selected, setSelected] = useState(null)
  const [sortBy, setSortBy] = useState('loads')
  const [savedLanes, setSavedLanes] = useState(() => JSON.parse(localStorage.getItem('qivori_saved_lanes') || '[]'))

  // Auto-build lanes from load history + merge seed
  const enrichedLanes = useMemo(() => {
    const fromHistory = buildLanesFromHistory(loads)
    // Add seed lanes that aren't already covered
    const existing = new Set(fromHistory.map(l => l.fromFull + '→' + l.toFull))
    const seeds = LANES_SEED.filter(l => !existing.has(l.fromFull + '→' + l.toFull))
    return [...fromHistory, ...seeds]
  }, [loads])

  // Auto-select first lane
  useEffect(() => {
    if (!selected && enrichedLanes.length) setSelected(enrichedLanes[0].id)
  }, [enrichedLanes.length])

  const toggleSaveLane = (lane) => {
    const key = lane.fromFull + '→' + lane.toFull
    setSavedLanes(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem('qivori_saved_lanes', JSON.stringify(next))
      showToast('success', prev.includes(key) ? 'Removed' : 'Lane Saved', key + (prev.includes(key) ? ' removed from saved lanes' : ' — you\'ll get alerts when matching loads appear'))
      return next
    })
  }

  const lane = enrichedLanes.find(l => l.id === selected) || enrichedLanes[0]
  const sorted = [...enrichedLanes].sort((a, b) => sortBy === 'rpm' ? b.avgRpm - a.avgRpm : sortBy === 'trend' ? b.trend - a.trend : b.loads - a.loads)
  const savedLaneList = enrichedLanes.filter(l => savedLanes.includes(l.fromFull + '→' + l.toFull))
  if (!lane && enrichedLanes.length === 0) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--muted)', fontSize:14 }}>No lane data yet. Book loads to build your lane history.</div>
  }
  const laneHistory = lane?._myLoads || []

  const estFuel = lane ? Math.round(lane.miles / 6.9 * 3.85) : 0
  const estDriverPay = lane ? Math.round(lane.avgGross * laneAvgPayPct) : 0
  const estNet = lane ? lane.avgGross - estFuel - estDriverPay : 0

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* Lane list sidebar */}
      <div style={{ width:240, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:6 }}>LANE INTEL ({enrichedLanes.length})</div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', color:'var(--text)', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>
            <option value="loads">Sort: Load Count ↓</option>
            <option value="rpm">Sort: Rate/Mile ↓</option>
            <option value="trend">Sort: Trend ↓</option>
          </select>
        </div>

        {/* Saved / Recurring lanes */}
        {savedLaneList.length > 0 && (
          <div style={{ borderBottom:'1px solid var(--border)' }}>
            <div style={{ padding:'8px 16px 4px', fontSize:9, fontWeight:800, color:'var(--success)', letterSpacing:1.5 }}>SAVED LANES ({savedLaneList.length})</div>
            {savedLaneList.map(l => {
              const isSel = selected === l.id
              return (
                <div key={'saved-' + l.id} onClick={() => setSelected(l.id)}
                  style={{ padding:'8px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? 'var(--success)' : 'transparent'}`, background: isSel ? 'rgba(34,197,94,0.05)' : 'transparent' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:12, fontWeight:700, color: isSel ? 'var(--success)' : 'var(--text)' }}><Star size={10} color="var(--success)" /> {l.from} → {l.to}</div>
                    <span style={{ fontSize:9, fontWeight:800, color:'var(--success)' }}>{l.loads} loads</span>
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{l.miles} mi · ${l.avgRpm}/mi</div>
                </div>
              )
            })}
          </div>
        )}

        {/* All lanes */}
        <div style={{ padding:'8px 16px 4px', fontSize:9, fontWeight:800, color:'var(--muted)', letterSpacing:1.5 }}>ALL LANES</div>
        {sorted.map(l => {
          const isSel = selected === l.id
          const isSaved = savedLanes.includes(l.fromFull + '→' + l.toFull)
          return (
            <div key={l.id} onClick={() => setSelected(l.id)}
              style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:3 }}>
                <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)', display:'flex', alignItems:'center', gap:5 }}>
                  {isSaved && <Star size={10} color="var(--success)" />} {l.from} → {l.to}
                </div>
                <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:6, background:l.color+'18', color:l.color }}>{l.ratingLabel}</span>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{l.miles} mi · {l.loads} load{l.loads !== 1 ? 's' : ''}</div>
              <div style={{ fontSize:12, fontWeight:700, color:l.color }}>${l.avgRpm}/mi avg</div>
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
                {(() => {
                  const isSaved = savedLanes.includes(lane.fromFull + '→' + lane.toFull)
                  return (
                    <button className={isSaved ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize:11 }}
                      onClick={() => toggleSaveLane(lane)}>
                      <Ic icon={Star} /> {isSaved ? 'Saved' : 'Save Lane'}
                    </button>
                  )
                })()}
                <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => {
                  window.dispatchEvent(new CustomEvent('switchToDispatch', { detail: { origin: lane.fromFull, dest: lane.toFull } }))
                  showToast('','Dispatch','Switching to Dispatch Board for ' + lane.from + '→' + lane.to)
                }}><Ic icon={Zap} /> Find Load</button>
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
                      { label:`Driver Pay (${Math.round(laneAvgPayPct * 100)}%)`,value:'−$' + estDriverPay.toLocaleString(),                       color:'var(--danger)' },
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
                          <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => {
                            navigator.clipboard.writeText(b).then(() => {
                              showToast('','Copied', b + ' copied to clipboard')
                            }).catch(() => {
                              showToast('','Broker', b + ' — no phone number on file')
                            })
                          }}>Contact</button>
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
