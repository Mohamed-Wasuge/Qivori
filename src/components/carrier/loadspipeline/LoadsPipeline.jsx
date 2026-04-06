import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { Bot, TrendingUp, AlertTriangle, XCircle, MessageSquare } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { Ic, HubTabBar } from '../shared'
import { DispatchTab } from '../DispatchTab'
import { QDispatchAI } from '../QDispatchAI'
import { qEvaluateLoad, Q_DECISION_COLORS, QDecisionBadge } from './helpers'
import { KanbanCard, KANBAN_COLUMNS } from './KanbanCard'

// Lazy-load LoadBoard components to prevent pulling entire LoadBoard chunk into CarrierLayout
const lazyN = (fn, name) => lazy(() => fn().then(m => ({ default: m[name] })))
const SmartDispatch = lazyN(() => import('../../../pages/carrier/LoadBoard'), 'SmartDispatch')
const CommandCenter = lazyN(() => import('../../../pages/carrier/LoadBoard'), 'CommandCenter')
const CheckCallCenter = lazyN(() => import('../../../pages/carrier/LoadBoard'), 'CheckCallCenter')
const LaneIntel = lazyN(() => import('../../../pages/carrier/LoadBoard'), 'LaneIntel')
const RateNegotiation = lazyN(() => import('../../../pages/carrier/LoadBoard'), 'RateNegotiation')

// ── Q Scanning State Animation ───────────────────────────────────────────────
function QScanningState({ phase }) {
  const phases = ['Scanning the market', 'Analyzing available loads', 'Checking broker history', 'Calculating true profit', 'Selecting top opportunities']
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % phases.length), 1800)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:'rgba(240,165,0,0.04)', borderRadius:8, border:'1px solid rgba(240,165,0,0.1)' }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'q-scan-pulse 1.5s ease-in-out infinite' }} />
      <span style={{ fontSize:10, fontWeight:600, color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>{phases[idx]}</span>
    </div>
  )
}

// ── Q Alert Banner ───────────────────────────────────────────────────────────
function QAlertBanner({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {alerts.slice(0,3).map((a, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:a.bg || 'rgba(240,165,0,0.04)', borderRadius:8, border:`1px solid ${a.borderColor || 'rgba(240,165,0,0.15)'}`, animation:'q-alert-slide 0.3s ease' }}>
          <Ic icon={a.icon || AlertTriangle} size={12} color={a.color || 'var(--accent)'} />
          <span style={{ flex:1, fontSize:10, fontWeight:600, color:a.color || 'var(--accent)' }}>{a.text}</span>
          <button onClick={() => onDismiss(i)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:10, padding:2 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ── Q Top Recommendation Card ────────────────────────────────────────────────
function QRecommendationCard({ load, qResult, onOpen }) {
  if (!load || !qResult) return null
  const origin = (load.origin || '').split(',')[0] || '—'
  const dest = (load.dest || load.destination || '').split(',')[0] || '—'
  const gross = load.gross || load.gross_pay || 0
  const dc = Q_DECISION_COLORS[qResult.decision]
  return (
    <div onClick={() => onOpen?.(load.loadId || load.id)}
      style={{
        background:`linear-gradient(135deg, ${dc.bg}, rgba(240,165,0,0.03))`,
        border:`1px solid ${dc.border}`, borderRadius:12, padding:'14px 18px', cursor:'pointer',
        position:'relative', overflow:'hidden', transition:'all 0.2s'
      }}
      onMouseOver={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow=`0 4px 20px ${dc.color}15` }}
      onMouseOut={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
      {/* Top glow */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${dc.color}60, transparent)` }} />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'q-scan-pulse 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>Q RECOMMENDATION</span>
            <span style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>Top load detected</span>
          </div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:4, color:'var(--text)' }}>
            {origin} → {dest}
          </div>
          <div style={{ display:'flex', gap:12, fontSize:11, color:'var(--muted)', flexWrap:'wrap' }}>
            <span>Rate: <b style={{ color:'var(--accent)' }}>${gross.toLocaleString()}</b></span>
            <span>{(load.miles || 0).toLocaleString()} mi</span>
            {load.weight > 0 && <span>{Number(load.weight).toLocaleString()} lbs</span>}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <QDecisionBadge decision={qResult.decision} />
          <div style={{ marginTop:6, fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'var(--muted)' }}>
            {qResult.confidence}% confidence
          </div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:10 }}>
        {[
          { label:'EST. PROFIT', value:`$${qResult.estProfit.toLocaleString()}`, color: qResult.estProfit > 0 ? 'var(--success)' : 'var(--danger)' },
          { label:'PROFIT/MI', value:`$${qResult.profitPerMile}`, color: parseFloat(qResult.profitPerMile) >= 1.00 ? 'var(--success)' : 'var(--accent)' },
          { label:'BROKER', value: qResult.brokerScore, color: qResult.brokerScore === 'A' ? 'var(--success)' : qResult.brokerScore === 'C' ? 'var(--danger)' : 'var(--accent)' },
          { label:'PROFIT/DAY', value:`$${qResult.profitPerDay.toLocaleString()}`, color: qResult.profitPerDay >= 500 ? 'var(--success)' : 'var(--accent)' },
        ].map(m => (
          <div key={m.label} style={{ background:'rgba(0,0,0,0.15)', borderRadius:6, padding:'6px 8px', textAlign:'center' }}>
            <div style={{ fontSize:7, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:2 }}>{m.label}</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      {qResult.targetRate && (
        <div style={{ fontSize:10, fontWeight:700, color:'var(--accent)', marginBottom:6, fontFamily:"'JetBrains Mono',monospace" }}>
          Target Counter: ${qResult.targetRate.toLocaleString()}
        </div>
      )}
      <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4, fontStyle:'italic' }}>
        {qResult.summaryReason}
      </div>
    </div>
  )
}

export function LoadsPipeline({ onOpenDrawer }) {
  const { loads, updateLoadStatus } = useCarrier()
  const { showToast } = useApp()
  const { drivers, fuelCostPerMile, brokerStats, allLoads } = useCarrier()
  const [pipeTab, setPipeTab] = useState('pipeline')
  const [dragOver, setDragOver] = useState(null)
  const [qFilter, setQFilter] = useState('all') // all | approved | rejected | negotiate
  const [isScanning, setIsScanning] = useState(true)
  const [dismissedAlerts, setDismissedAlerts] = useState([])
  const [dispatchDecisions, setDispatchDecisions] = useState({})

  // Listen for custom event to switch to dispatch tab
  useEffect(() => {
    const handler = () => setPipeTab('dispatch')
    window.addEventListener('switchToDispatch', handler)
    return () => window.removeEventListener('switchToDispatch', handler)
  }, [])

  // Simulate Q scanning state on mount and when loads change
  useEffect(() => {
    setIsScanning(true)
    const t = setTimeout(() => setIsScanning(false), 3200)
    return () => clearTimeout(t)
  }, [loads.length])

  // Run Q evaluation on all loads (frontend fallback)
  const qContext = useMemo(() => ({ fuelCostPerMile, drivers, brokerStats, allLoads: allLoads || loads }), [fuelCostPerMile, drivers, brokerStats, allLoads, loads])
  const qResults = useMemo(() => {
    const map = {}
    loads.forEach(l => {
      map[l.loadId || l.id] = qEvaluateLoad(l, qContext)
    })
    return map
  }, [loads, qContext])

  // Batch evaluate loads via backend dispatch engine
  useEffect(() => {
    const evaluateLoads = async () => {
      const eligible = loads.filter(l =>
        !dispatchDecisions[l.loadId || l.id] &&
        ['Booked', 'Rate Con Received', 'Assigned to Driver'].includes(l.status)
      )
      for (const load of eligible) {
        try {
          const res = await apiFetch('/api/dispatch-evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              load_id: load.loadId || load.id,
              load: {
                gross: load.gross || load.gross_pay || load.rate_total || 0,
                miles: load.miles,
                weight: load.weight,
                origin: load.origin,
                dest: load.dest || load.destination,
                equipment: load.equipment,
                broker: load.broker,
                broker_phone: load.broker_phone,
                book_type: load.book_type,
                instant_book: load.instant_book,
                pickup_date: load.pickup_date,
                delivery_date: load.delivery_date,
              },
              driver_id: load.driver_id || null,
              driver_type: 'owner_operator',
            })
          })
          if (res.ok) {
            const data = await res.json()
            if (data.decision) {
              setDispatchDecisions(prev => ({ ...prev, [load.loadId || load.id]: data }))
            }
          }
        } catch {
          // Backend unavailable — frontend fallback handles it
        }
      }
    }
    if (loads.length > 0) evaluateLoads()
  }, [loads])

  // Q-filtered loads
  const filteredLoads = useMemo(() => {
    if (qFilter === 'all') return loads
    const decisionMap = { approved: 'ACCEPT', rejected: 'REJECT', negotiate: 'NEGOTIATE' }
    const target = decisionMap[qFilter]
    return loads.filter(l => qResults[l.loadId || l.id]?.decision === target)
  }, [loads, qFilter, qResults])

  // Top recommendation: best ACCEPT load by profit/mile
  const topRec = useMemo(() => {
    const accepts = loads
      .map(l => ({ load: l, q: qResults[l.loadId || l.id] }))
      .filter(x => x.q && x.q.decision === 'ACCEPT' && x.q.estProfit > 0)
      .sort((a, b) => parseFloat(b.q.profitPerMile) - parseFloat(a.q.profitPerMile))
    return accepts[0] || null
  }, [loads, qResults])

  // Q Alerts — dynamic real-time alerts
  const qAlerts = useMemo(() => {
    const alerts = []
    // High-profit load detected
    const highProfit = loads.find(l => {
      const q = qResults[l.loadId || l.id]
      return q && q.estProfit > 1500 && q.decision === 'ACCEPT' && ['Rate Con Received','Booked'].includes(l.status)
    })
    if (highProfit) {
      const q = qResults[highProfit.loadId || highProfit.id]
      alerts.push({ icon: TrendingUp, text: `High-profit load detected: ${highProfit.loadId} — $${q.estProfit.toLocaleString()} est. profit`, color: 'var(--success)', bg: 'rgba(52,176,104,0.04)', borderColor: 'rgba(52,176,104,0.15)' })
    }
    // Heavy loads
    const heavy = loads.filter(l => parseFloat(l.weight) > 40000 && ['Rate Con Received','Booked','Assigned to Driver'].includes(l.status))
    if (heavy.length > 0) {
      alerts.push({ icon: AlertTriangle, text: `Heavy load detected: ${heavy[0].loadId} — ${Number(heavy[0].weight).toLocaleString()} lbs. Increased fuel cost.`, color: 'var(--warning)', bg: 'rgba(240,165,0,0.04)', borderColor: 'rgba(240,165,0,0.15)' })
    }
    // Loads with low profit that should be negotiated
    const negotiate = loads.filter(l => qResults[l.loadId || l.id]?.decision === 'NEGOTIATE' && ['Rate Con Received','Booked'].includes(l.status))
    if (negotiate.length > 0) {
      alerts.push({ icon: MessageSquare, text: `${negotiate.length} load${negotiate.length > 1 ? 's' : ''} below target rate — counteroffer recommended`, color: 'var(--accent)', bg: 'rgba(240,165,0,0.04)', borderColor: 'rgba(240,165,0,0.15)' })
    }
    // Rejected loads still active
    const rejected = loads.filter(l => qResults[l.loadId || l.id]?.decision === 'REJECT' && ['Rate Con Received','Booked','Assigned to Driver'].includes(l.status))
    if (rejected.length > 0) {
      alerts.push({ icon: XCircle, text: `${rejected.length} active load${rejected.length > 1 ? 's' : ''} below profit threshold — review recommended`, color: 'var(--danger)', bg: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.15)' })
    }
    return alerts.filter((_, i) => !dismissedAlerts.includes(i))
  }, [loads, qResults, dismissedAlerts])

  // Q stats
  const qStats = useMemo(() => {
    const vals = Object.values(qResults)
    return {
      total: vals.length,
      accepted: vals.filter(q => q.decision === 'ACCEPT').length,
      rejected: vals.filter(q => q.decision === 'REJECT').length,
      negotiate: vals.filter(q => q.decision === 'NEGOTIATE').length,
      avgProfit: vals.length > 0 ? Math.round(vals.reduce((s,q) => s + q.estProfit, 0) / vals.length) : 0,
      totalProfit: vals.reduce((s,q) => s + Math.max(q.estProfit, 0), 0),
    }
  }, [qResults])

  const handleDrop = (e, col) => {
    e.preventDefault()
    setDragOver(null)
    const loadId = e.dataTransfer.getData('loadId')
    if (!loadId || !col.statuses[0]) return
    updateLoadStatus(loadId, col.statuses[0])
  }

  const PIPE_TABS = [{ id:'pipeline', label:'Pipeline' },{ id:'q-dispatch', label:'Q Dispatch' },{ id:'list', label:'List View' },{ id:'dispatch', label:'Dispatch Board' },{ id:'check-calls', label:'Check Calls' },{ id:'command', label:'Command Center' },{ id:'lane-intel', label:'Lane Intel' },{ id:'rate-check', label:'Rate Check' }]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, overflow:'hidden' }}>

      {/* ═══ Q HEADER ═══════════════════════════════════════════════ */}
      <div style={{ flexShrink:0, padding:'12px 20px 0', background:'var(--surface)', borderBottom:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--success)', boxShadow:'0 0 8px var(--success)', animation:'q-scan-pulse 2s ease-in-out infinite' }} />
            <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--text)' }}>
              Q <span style={{ color:'var(--accent)' }}>LOAD INTELLIGENCE</span>
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {isScanning ? <QScanningState /> : (
              <span style={{ fontSize:9, fontWeight:600, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>
                Evaluating {loads.length} load{loads.length !== 1 ? 's' : ''} in real time
              </span>
            )}
          </div>
        </div>

        {/* Q Stats Bar */}
        {loads.length > 0 && (
          <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
            {[
              { label:'ALL', value:qStats.total, filter:'all', color:'var(--text)' },
              { label:'APPROVED', value:qStats.accepted, filter:'approved', color:'var(--success)' },
              { label:'NEGOTIATE', value:qStats.negotiate, filter:'negotiate', color:'var(--accent)' },
              { label:'REJECTED', value:qStats.rejected, filter:'rejected', color:'var(--danger)' },
            ].map(f => (
              <button key={f.filter} onClick={() => setQFilter(f.filter)}
                style={{
                  padding:'4px 12px', borderRadius:6, border:`1px solid ${qFilter === f.filter ? f.color : 'var(--border)'}`,
                  background: qFilter === f.filter ? f.color + '12' : 'transparent',
                  color: qFilter === f.filter ? f.color : 'var(--muted)',
                  fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', gap:4, transition:'all 0.15s'
                }}>
                <span>{f.label}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:800 }}>{f.value}</span>
              </button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>Est. Portfolio Profit:</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color: qStats.totalProfit > 0 ? 'var(--success)' : 'var(--danger)' }}>
                ${qStats.totalProfit.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <HubTabBar tabs={PIPE_TABS} active={pipeTab} onChange={setPipeTab} />

      <div style={{ flex:1, minHeight:0, overflow:'auto', display:'flex', flexDirection:'column' }}>
        {pipeTab === 'pipeline' && (
          <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>

            {/* Q Alerts */}
            {qAlerts.length > 0 && (
              <div style={{ padding:'8px 10px 0' }}>
                <QAlertBanner alerts={qAlerts} onDismiss={i => setDismissedAlerts(d => [...d, i])} />
              </div>
            )}

            {/* Q Top Recommendation */}
            {topRec && !isScanning && (
              <div style={{ padding:'8px 10px' }}>
                <QRecommendationCard load={topRec.load} qResult={topRec.q} onOpen={onOpenDrawer} />
              </div>
            )}

            {/* Empty State */}
            {loads.length === 0 && !isScanning && (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
                <div style={{ textAlign:'center', maxWidth:360 }}>
                  <div style={{ width:48, height:48, borderRadius:12, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                    <Ic icon={Bot} size={22} color="var(--accent)" />
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6, color:'var(--text)' }}>Q has not evaluated any loads yet</div>
                  <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5, marginBottom:14 }}>
                    Activate Q by uploading a rate confirmation or adding loads from the dispatch board. Q will analyze each load and provide profit-based recommendations.
                  </div>
                  <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => setPipeTab('list')}>Add Load</button>
                </div>
              </div>
            )}

            {/* Kanban Board */}
            {(loads.length > 0 || isScanning) && (
              <div style={{ display:'flex', gap:6, padding:'8px 10px', flex:1, minHeight:0, overflow:'auto' }}>
                {KANBAN_COLUMNS.map(col => {
                  const colLoads = filteredLoads.filter(l => col.statuses.includes(l.status))
                  const colTotal = colLoads.reduce((s,l) => s + (l.gross || l.gross_pay || 0), 0)
                  const colProfit = colLoads.reduce((s,l) => s + Math.max(qResults[l.loadId || l.id]?.estProfit || 0, 0), 0)
                  return (
                    <div key={col.id}
                      onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={e => handleDrop(e, col)}
                      style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', minHeight:0,
                        background: dragOver === col.id ? 'rgba(240,165,0,0.04)' : 'transparent',
                        border: `1px solid ${dragOver === col.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius:12, transition:'all 0.15s' }}>
                      <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ width:8, height:8, borderRadius:'50%', background:col.color }} />
                            <span style={{ fontSize:12, fontWeight:700 }}>{col.label}</span>
                          </div>
                          <span style={{ fontSize:11, fontWeight:700, color:col.color, background:col.color+'15', padding:'2px 8px', borderRadius:8 }}>{colLoads.length}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--muted)' }}>
                          {colTotal > 0 && <span>${colTotal.toLocaleString()}</span>}
                          {colProfit > 0 && <span style={{ color:'var(--success)' }}>P: ${colProfit.toLocaleString()}</span>}
                        </div>
                      </div>
                      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:8 }}>
                        {colLoads.length === 0 && (
                          <div style={{ padding:20, textAlign:'center', fontSize:10, color:'var(--muted)', border:'1px dashed var(--border)', borderRadius:8 }}>
                            {qFilter !== 'all' ? 'No loads match Q filter' : 'Drop loads here'}
                          </div>
                        )}
                        {colLoads.map(load => (
                          <KanbanCard key={load.loadId || load.id} load={load} qResult={qResults[load.loadId || load.id]} onClick={() => onOpenDrawer?.(load.loadId || load.id)} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {pipeTab === 'q-dispatch' && <QDispatchAI />}
        {pipeTab === 'list' && <DispatchTab />}
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
          {pipeTab === 'dispatch' && <SmartDispatch />}
          {pipeTab === 'check-calls' && <CheckCallCenter />}
          {pipeTab === 'command' && <CommandCenter />}
          {pipeTab === 'lane-intel' && <LaneIntel />}
          {pipeTab === 'rate-check' && <RateNegotiation />}
        </Suspense>
      </div>

      {/* Q Animations */}
      <style>{`
        @keyframes q-scan-pulse {
          0%, 100% { opacity:1; box-shadow: 0 0 4px var(--success); }
          50% { opacity:0.4; box-shadow: 0 0 12px var(--success); }
        }
        @keyframes q-alert-slide {
          from { opacity:0; transform:translateY(-8px); }
          to { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  )
}
