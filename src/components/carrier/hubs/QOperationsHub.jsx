import React, { useState, useEffect, Suspense } from 'react'
import {
  Truck, AlertTriangle, AlertCircle,
  CheckCircle, Clock, Zap, FlaskConical,
  Target, TrendingUp, Activity, Smartphone,
  Route, MapPin, Package,
} from 'lucide-react'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { Ic, HubTabBar } from '../shared'

// ── Q Operations Hub ──────────────────────────────────────────────────────────
export function QOperationsHub() {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [simResults, setSimResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [simLoading, setSimLoading] = useState(false)
  const [learningData, setLearningData] = useState(null)
  const [learningLoading, setLearningLoading] = useState(false)
  const [learningTestResults, setLearningTestResults] = useState(null)
  const [feedbackResult, setFeedbackResult] = useState(null)
  const { drivers, vehicles, activeLoads } = useCarrier()

  const TABS = [
    { id:'overview', label:'Live Ops' },
    { id:'decisions', label:'Decisions' },
    { id:'fleet-state', label:'Fleet State' },
    { id:'failures', label:'Failures' },
    { id:'negotiations', label:'Negotiations' },
    { id:'comms', label:'Driver Comms' },
    { id:'simulation', label:'Simulation' },
    { id:'learning', label:'Q Learning' },
    { id:'rules', label:'Rules' },
  ]

  // Load ops dashboard data
  useEffect(() => {
    setLoading(true)
    apiFetch('/api/q-orchestrator', { method:'POST', body: JSON.stringify({ action:'ops_dashboard' }) })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const runSimulation = () => {
    setSimLoading(true)
    apiFetch('/api/q-simulate', { method:'POST', body: JSON.stringify({ scenario:'all' }) })
      .then(d => { setSimResults(d); setSimLoading(false) })
      .catch(() => setSimLoading(false))
  }

  const fleetSummary = data?.fleet || {}
  const decisions = data?.recentDecisions || []
  const failures = data?.unresolvedFailures || []
  const negotiations = data?.activeNegotiations || []
  const pendingComms = data?.pendingDriverResponses || []

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={Activity} size={18} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Q Operations Center</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Autonomous dispatch brain — decisions, fleet state & failures</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            {[
              { label:'Fleet', val: loading ? '—' : String(fleetSummary.total || (vehicles||[]).length), color:'var(--accent)' },
              { label:'Available', val: loading ? '—' : String(fleetSummary.available || 0), color:'var(--success)' },
              { label:'Failures', val: loading ? '—' : String(failures.length), color: failures.length > 0 ? 'var(--danger)' : 'var(--muted)' },
              { label:'Pending', val: loading ? '—' : String(pendingComms.length), color: pendingComms.length > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:50 }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0, overflowY:'auto' }}>
        <Suspense fallback={<div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading...</div>}>

          {/* ── LIVE OPS OVERVIEW ── */}
          {tab === 'overview' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              {loading ? (
                <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading Q operations data...</div>
              ) : !data?.ok ? (
                <div style={{ padding:20, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, fontSize:12, color:'#fcd34d' }}>
                  <Ic icon={AlertCircle} size={14} /> Q brain connected — waiting for first dispatch data. Process a load to see live operations.
                </div>
              ) : (
                <>
                  {/* Status cards */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                    {[
                      { label:'Total Fleet', val:fleetSummary.total||0, icon:Truck, color:'var(--accent)' },
                      { label:'Available', val:fleetSummary.available||0, icon:CheckCircle, color:'var(--success)' },
                      { label:'In Transit', val:fleetSummary.inTransit||0, icon:Route, color:'var(--accent3,#3b82f6)' },
                      { label:'At Stop', val:fleetSummary.atStop||0, icon:MapPin, color:'var(--warning,#f59e0b)' },
                      { label:'Booked', val:fleetSummary.booked||0, icon:Package, color:'#a78bfa' },
                      { label:'Unavailable', val:fleetSummary.unavailable||0, icon:AlertTriangle, color:'var(--danger)' },
                    ].map(c => (
                      <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 14px', display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:`${c.color}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Ic icon={c.icon} size={16} color={c.color} />
                        </div>
                        <div>
                          <div style={{ fontSize:20, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                          <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.6 }}>{c.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Alerts */}
                  {failures.length > 0 && (
                    <div style={{ padding:'12px 16px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:12, color:'#fca5a5', display:'flex', alignItems:'center', gap:10 }}>
                      <Ic icon={AlertTriangle} size={15} />
                      <span style={{ fontWeight:600 }}>{failures.length} unresolved failure{failures.length !== 1 ? 's' : ''}</span> — check Failures tab
                    </div>
                  )}
                  {pendingComms.length > 0 && (
                    <div style={{ padding:'12px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:10, fontSize:12, color:'#fcd34d', display:'flex', alignItems:'center', gap:10 }}>
                      <Ic icon={Clock} size={15} />
                      <span style={{ fontWeight:600 }}>{pendingComms.length} driver response{pendingComms.length !== 1 ? 's' : ''} pending</span>
                    </div>
                  )}

                  {/* Recent decisions */}
                  {decisions.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                        <Ic icon={Zap} size={14} color="var(--accent)" /> Today's Decisions
                      </div>
                      {decisions.slice(0, 8).map((d, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < decisions.length - 1 ? '1px solid var(--border)' : 'none', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{
                              padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                              background: d.decision === 'auto_book' ? 'rgba(34,197,94,0.15)' : d.decision === 'negotiate' ? 'rgba(245,158,11,0.15)' : d.decision === 'reject' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                              color: d.decision === 'auto_book' ? '#86efac' : d.decision === 'negotiate' ? '#fcd34d' : d.decision === 'reject' ? '#fca5a5' : '#93c5fd',
                            }}>{d.decision?.replace('_', ' ')}</span>
                            <span style={{ color:'var(--text)' }}>{d.origin} → {d.dest}</span>
                          </div>
                          <div style={{ display:'flex', gap:12, color:'var(--muted)' }}>
                            <span>${d.gross || d.total_rate}</span>
                            <span>{d.confidence}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── DECISIONS TAB ── */}
          {tab === 'decisions' && (
            <div style={{ padding:20 }}>
              {decisions.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Zap} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>NO DECISIONS YET</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>Q will show every load decision here — auto-book, negotiate, or reject with full reasoning.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {decisions.map((d, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{d.origin} → {d.dest}</div>
                          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{d.broker} • {d.equipment || 'Dry Van'} • {d.miles} mi</div>
                        </div>
                        <span style={{
                          padding:'3px 10px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                          background: d.decision === 'auto_book' ? 'rgba(34,197,94,0.15)' : d.decision === 'negotiate' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                          color: d.decision === 'auto_book' ? '#86efac' : d.decision === 'negotiate' ? '#fcd34d' : '#fca5a5',
                        }}>{d.decision?.replace('_', ' ')}</span>
                      </div>
                      <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--muted)' }}>
                        <span>Gross: <b style={{ color:'var(--text)' }}>${d.gross || d.total_rate}</b></span>
                        <span>RPM: <b style={{ color:'var(--text)' }}>${d.rpm?.toFixed(2)}</b></span>
                        <span>Profit: <b style={{ color: d.total_profit > 0 ? 'var(--success)' : 'var(--danger)' }}>${d.total_profit}</b></span>
                        <span>Confidence: <b style={{ color:'var(--accent)' }}>{d.confidence}%</b></span>
                      </div>
                      {d.explanation && (
                        <div style={{ marginTop:8, padding:'8px 12px', background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.1)', borderRadius:8, fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
                          {d.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── FLEET STATE TAB ── */}
          {tab === 'fleet-state' && (
            <div style={{ padding:20 }}>
              {(vehicles || []).length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Truck} size={24} color="var(--accent3,#3b82f6)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>NO TRUCKS REGISTERED</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>Add vehicles in Fleet tab to see real-time truck state here.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {(data?.fleet?.trucks || []).map((t, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <Ic icon={Truck} size={16} color="var(--accent3,#3b82f6)" />
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{t.vehicle_id || `Truck ${i+1}`}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{t.current_city ? `${t.current_city}, ${t.current_state}` : 'Location unknown'} • {t.trailer_type || 'Dry Van'}</div>
                        </div>
                      </div>
                      <span style={{
                        padding:'3px 10px', borderRadius:6, fontSize:10, fontWeight:700,
                        background: ['READY_FOR_LOAD','EMPTY'].includes(t.status) ? 'rgba(34,197,94,0.15)' : ['IN_TRANSIT','LOADED','IN_TRANSIT_TO_PICKUP'].includes(t.status) ? 'rgba(59,130,246,0.15)' : t.status === 'UNAVAILABLE' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                        color: ['READY_FOR_LOAD','EMPTY'].includes(t.status) ? '#86efac' : ['IN_TRANSIT','LOADED','IN_TRANSIT_TO_PICKUP'].includes(t.status) ? '#93c5fd' : t.status === 'UNAVAILABLE' ? '#fca5a5' : '#fcd34d',
                      }}>{(t.status || 'UNKNOWN').replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                  {(!data?.fleet?.trucks || data.fleet.trucks.length === 0) && (
                    <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                      Fleet state not synced yet. Process a load or update truck status via API to see state here.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── FAILURES TAB ── */}
          {tab === 'failures' && (
            <div style={{ padding:20 }}>
              {failures.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={CheckCircle} size={24} color="var(--success)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--success)', marginBottom:8 }}>ALL CLEAR</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>No unresolved failures. Q logs every issue — driver no-response, broker changes, SMS failures, status conflicts — and shows them here for review.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {failures.map((f, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{
                            padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                            background: f.severity === 'critical' ? 'rgba(239,68,68,0.15)' : f.severity === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                            color: f.severity === 'critical' ? '#fca5a5' : f.severity === 'high' ? '#fcd34d' : '#93c5fd',
                          }}>{f.severity}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{(f.failure_type || '').replace(/_/g, ' ')}</span>
                        </div>
                        <span style={{ fontSize:10, color:'var(--muted)' }}>Retry {f.retry_count}/{f.max_retries}</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>{f.description}</div>
                      {f.load_id && <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Load: {f.load_id}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── NEGOTIATIONS TAB ── */}
          {tab === 'negotiations' && (
            <div style={{ padding:20 }}>
              {negotiations.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Target} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>NO ACTIVE NEGOTIATIONS</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>When Q decides to negotiate a load, the session appears here — initial offer, counter, target rate, and outcome.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {negotiations.map((n, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{n.lane || 'Unknown Lane'}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{n.broker_name} • Round {n.counter_rounds}/{n.max_rounds}</div>
                        </div>
                        <span style={{
                          padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                          background: n.status === 'ACCEPTED' ? 'rgba(34,197,94,0.15)' : n.status === 'LOST' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: n.status === 'ACCEPTED' ? '#86efac' : n.status === 'LOST' ? '#fca5a5' : '#fcd34d',
                        }}>{(n.status || '').replace(/_/g, ' ')}</span>
                      </div>
                      <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--muted)' }}>
                        {n.initial_offer && <span>Offered: <b style={{ color:'var(--text)' }}>${n.initial_offer}</b></span>}
                        {n.target_rate && <span>Target: <b style={{ color:'var(--accent)' }}>${n.target_rate}</b></span>}
                        {n.counter_offer && <span>Counter: <b style={{ color:'#fcd34d' }}>${n.counter_offer}</b></span>}
                        {n.final_rate && <span>Final: <b style={{ color:'var(--success)' }}>${n.final_rate}</b></span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── DRIVER COMMS TAB ── */}
          {tab === 'comms' && (
            <div style={{ padding:20 }}>
              {pendingComms.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={CheckCircle} size={24} color="var(--success)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--success)', marginBottom:8 }}>ALL RESPONSES RECEIVED</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>No pending driver responses. Morning checks, load offers, and status updates will show here when waiting for driver reply.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {pendingComms.map((c, i) => (
                    <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <Ic icon={Smartphone} size={14} color="var(--accent)" />
                          <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{c.message_type?.replace(/_/g, ' ')}</span>
                        </div>
                        <span style={{ fontSize:10, color:'var(--warning,#f59e0b)' }}>
                          {c.response_deadline ? `Due: ${new Date(c.response_deadline).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}` : 'Waiting...'}
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>{c.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SIMULATION TAB ── */}
          {tab === 'simulation' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>Decision Engine Test Suite</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Run 10 realistic scenarios against your carrier settings</div>
                </div>
                <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 20px' }} onClick={runSimulation} disabled={simLoading}>
                  {simLoading ? 'Running...' : 'Run All Scenarios'}
                </button>
              </div>

              {simResults?.results && (
                <>
                  {/* Summary */}
                  <div style={{ display:'flex', gap:12 }}>
                    <div style={{ flex:1, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ fontSize:24, fontWeight:800, color:'var(--success)', fontFamily:"'DM Sans',sans-serif" }}>{simResults.summary?.passed || 0}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Passed</div>
                    </div>
                    <div style={{ flex:1, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ fontSize:24, fontWeight:800, color:'var(--danger)', fontFamily:"'DM Sans',sans-serif" }}>{simResults.summary?.failed || 0}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Failed</div>
                    </div>
                  </div>

                  {/* Scenario results */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {simResults.results.map((r, i) => (
                      <div key={i} style={{ background:'var(--surface)', border:`1px solid ${r.passed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius:12, padding:14 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontSize:14 }}>{r.passed ? '✅' : '❌'}</span>
                              {r.name}
                            </div>
                            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{r.description}</div>
                          </div>
                          <span style={{
                            padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, textTransform:'uppercase',
                            background: r.decision === 'auto_book' ? 'rgba(34,197,94,0.15)' : r.decision === 'negotiate' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                            color: r.decision === 'auto_book' ? '#86efac' : r.decision === 'negotiate' ? '#fcd34d' : '#fca5a5',
                          }}>{r.decision?.replace('_', ' ')}</span>
                        </div>
                        <div style={{ display:'flex', gap:12, fontSize:10, color:'var(--muted)', flexWrap:'wrap' }}>
                          <span>{r.load?.origin} → {r.load?.dest}</span>
                          <span>Gross: ${r.load?.gross}</span>
                          <span>RPM: ${r.metrics?.rpm}</span>
                          <span>Profit: ${r.metrics?.totalProfit}</span>
                          <span>Confidence: {r.confidence}%</span>
                        </div>
                        {r.explanation?.summary && (
                          <div style={{ marginTop:6, padding:'6px 10px', background:'rgba(240,165,0,0.04)', borderRadius:6, fontSize:10, color:'var(--muted)', lineHeight:1.5 }}>
                            {r.explanation.summary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!simResults && !simLoading && (
                <div style={{ padding:'30px 20px', textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={FlaskConical} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>TEST YOUR Q BRAIN</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:360, margin:'0 auto', lineHeight:1.6 }}>Run 10 scenarios — profitable loads, trap loads, dead zones, negotiation candidates — and see how Q decides based on your rules.</div>
                </div>
              )}
            </div>
          )}

          {/* ── Q LEARNING TAB ── */}
          {tab === 'learning' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              {/* Controls */}
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 18px' }} disabled={learningLoading}
                  onClick={() => {
                    setLearningLoading(true)
                    apiFetch('/api/q-learning', { method:'POST', body: JSON.stringify({ action:'dashboard' }) })
                      .then(d => { setLearningData(d); setLearningLoading(false) })
                      .catch(() => setLearningLoading(false))
                  }}>
                  {learningLoading ? 'Loading...' : 'Load Learning Data'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'8px 18px' }} disabled={learningLoading}
                  onClick={() => {
                    setLearningLoading(true)
                    apiFetch('/api/q-learning', { method:'POST', body: JSON.stringify({ action:'run_feedback' }) })
                      .then(d => { setFeedbackResult(d); setLearningLoading(false) })
                      .catch(() => setLearningLoading(false))
                  }}>
                  Run Feedback Cycle
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'8px 18px' }} disabled={learningLoading}
                  onClick={() => {
                    setLearningLoading(true)
                    apiFetch('/api/q-learning', { method:'POST', body: JSON.stringify({ action:'daily_summary' }) })
                      .then(d => { setFeedbackResult(d); setLearningLoading(false) })
                      .catch(() => setLearningLoading(false))
                  }}>
                  Generate Daily Summary
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'8px 18px' }}
                  onClick={() => {
                    setLearningLoading(true)
                    apiFetch('/api/q-learning-test', { method:'POST', body: JSON.stringify({ scenario:'all' }) })
                      .then(d => { setLearningTestResults(d); setLearningLoading(false) })
                      .catch(() => setLearningLoading(false))
                  }}>
                  Run Learning Tests
                </button>
              </div>

              {/* Feedback cycle result */}
              {feedbackResult && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:8 }}>
                    {feedbackResult.skipped ? 'Feedback Cycle Skipped' : feedbackResult.q_health_score != null ? 'Daily Summary' : 'Feedback Cycle Complete'}
                  </div>
                  {feedbackResult.skipped ? (
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{feedbackResult.reason}</div>
                  ) : feedbackResult.q_health_score != null ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--muted)' }}>
                        <span>Health: <b style={{ color:'var(--accent)' }}>{feedbackResult.q_health_score}%</b></span>
                        <span>Accuracy: <b style={{ color:'var(--success)' }}>{feedbackResult.decision_accuracy_pct || '—'}%</b></span>
                        <span>Decisions: <b style={{ color:'var(--text)' }}>{feedbackResult.total_decisions}</b></span>
                        <span>Mistakes: <b style={{ color: feedbackResult.total_mistakes > 0 ? 'var(--danger)' : 'var(--muted)' }}>{feedbackResult.total_mistakes}</b></span>
                        <span>Profit Δ: <b style={{ color: feedbackResult.profit_delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>${feedbackResult.profit_delta}</b></span>
                      </div>
                      {feedbackResult.suggested_adjustments?.length > 0 && (
                        <div>
                          <div style={{ fontSize:11, fontWeight:600, color:'var(--accent)', marginBottom:4 }}>Suggested Adjustments:</div>
                          {feedbackResult.suggested_adjustments.map((a, i) => (
                            <div key={i} style={{ fontSize:11, color:'var(--muted)', padding:'4px 0' }}>
                              {a.parameter}: {a.current} → {a.suggested} — {a.reason}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--muted)' }}>
                      <span>Outcomes analyzed: <b style={{ color:'var(--text)' }}>{feedbackResult.outcomes_analyzed}</b></span>
                      <span>Mistakes processed: <b style={{ color:'var(--text)' }}>{feedbackResult.mistakes_processed}</b></span>
                      <span>Adjustments: <b style={{ color:'var(--accent)' }}>{feedbackResult.adjustments?.length || 0}</b></span>
                      <span>Auto-applied: <b style={{ color:'var(--text)' }}>{feedbackResult.auto_applied ? 'Yes' : 'No'}</b></span>
                    </div>
                  )}
                </div>
              )}

              {/* Learning test results */}
              {learningTestResults?.results && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>Learning Loop Test Results</div>
                    <div style={{ display:'flex', gap:12 }}>
                      <span style={{ fontSize:12, color:'var(--success)', fontWeight:700 }}>{learningTestResults.summary?.passed || 0} passed</span>
                      <span style={{ fontSize:12, color:'var(--danger)', fontWeight:700 }}>{learningTestResults.summary?.failed || 0} failed</span>
                    </div>
                  </div>
                  {learningTestResults.results.map((r, i) => (
                    <div key={i} style={{ padding:'12px 16px', borderBottom: i < learningTestResults.results.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:8 }}>
                          <span>{r.passed ? '✅' : '❌'}</span> {r.name}
                        </div>
                        <span style={{ fontSize:10, color: r.result === 'good' ? '#86efac' : r.result === 'bad' ? '#fca5a5' : r.result === 'missed_opportunity' ? '#fcd34d' : 'var(--muted)',
                          padding:'2px 8px', borderRadius:6, background: r.result === 'good' ? 'rgba(34,197,94,0.15)' : r.result === 'bad' ? 'rgba(239,68,68,0.15)' : r.result === 'missed_opportunity' ? 'rgba(245,158,11,0.15)' : 'rgba(128,128,128,0.15)',
                          fontWeight:700, textTransform:'uppercase' }}>{r.result}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{r.description}</div>
                      <div style={{ display:'flex', gap:12, fontSize:10, color:'var(--muted)' }}>
                        <span>{r.load?.lane}</span>
                        <span>Expected: ${r.load?.expectedProfit} → Actual: ${r.load?.actualProfit}</span>
                        <span>Δ${r.profitDelta}</span>
                        <span>Mistakes: {r.mistakesDetected}</span>
                      </div>
                      {r.mistakes?.length > 0 && (
                        <div style={{ marginTop:4, display:'flex', gap:6, flexWrap:'wrap' }}>
                          {r.mistakes.map((m, j) => (
                            <span key={j} style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(239,68,68,0.1)', color:'#fca5a5', fontWeight:600 }}>
                              {m.type.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Learning dashboard data */}
              {learningData?.ok && (
                <>
                  {/* Stats cards */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
                    {[
                      { label:'Total Outcomes', val: learningData.stats?.totalOutcomes || 0, color:'var(--accent)' },
                      { label:'Good Decisions', val: learningData.stats?.goodOutcomes || 0, color:'var(--success)' },
                      { label:'Bad Decisions', val: learningData.stats?.badOutcomes || 0, color:'var(--danger)' },
                      { label:'Accuracy', val: learningData.stats?.accuracy != null ? `${learningData.stats.accuracy}%` : '—', color:'var(--accent3,#3b82f6)' },
                    ].map(c => (
                      <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:20, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                        <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.6 }}>{c.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Recent mistakes */}
                  {learningData.recentMistakes?.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                        Recent Mistakes
                      </div>
                      {learningData.recentMistakes.slice(0, 8).map((m, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < 7 ? '1px solid var(--border)' : 'none', fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ padding:'2px 6px', borderRadius:4, fontSize:9, fontWeight:700, textTransform:'uppercase',
                              background: m.severity === 'critical' ? 'rgba(239,68,68,0.15)' : m.severity === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                              color: m.severity === 'critical' ? '#fca5a5' : m.severity === 'high' ? '#fcd34d' : '#93c5fd' }}>{m.severity}</span>
                            <span style={{ color:'var(--muted)' }}>{m.description?.substring(0, 80)}</span>
                          </div>
                          {m.impact_dollars != null && <span style={{ color:'var(--danger)', fontWeight:600 }}>${Math.round(m.impact_dollars)}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recent adjustments */}
                  {learningData.recentAdjustments?.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                        Recent Adjustments
                      </div>
                      {learningData.recentAdjustments.slice(0, 5).map((a, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', fontSize:12 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                            <span style={{ fontWeight:600, color:'var(--text)' }}>{a.parameter}</span>
                            <span style={{ color:'var(--accent)', fontWeight:700 }}>{a.old_value} → {a.new_value}</span>
                          </div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{a.reason}</div>
                          {a.guardrail_hit && <div style={{ fontSize:10, color:'var(--warning,#f59e0b)', marginTop:2 }}>Guardrail: {a.guardrail_hit}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top lanes */}
                  {learningData.topLanes?.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                        Lane Intelligence
                      </div>
                      {learningData.topLanes.slice(0, 8).map((l, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < 7 ? '1px solid var(--border)' : 'none', fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <span style={{ fontWeight:600, color:'var(--text)' }}>{l.lane}</span>
                            <span style={{ fontSize:10, color:'var(--muted)', marginLeft:8 }}>{l.total_loads} loads</span>
                          </div>
                          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                            <span style={{ fontSize:11, color:'var(--muted)' }}>RPM: ${l.avg_rpm}</span>
                            <span style={{ padding:'2px 8px', borderRadius:6, fontSize:9, fontWeight:700, textTransform:'uppercase',
                              background: l.quality === 'hot_market' ? 'rgba(34,197,94,0.15)' : l.quality === 'dead_zone' ? 'rgba(239,68,68,0.15)' : 'rgba(128,128,128,0.15)',
                              color: l.quality === 'hot_market' ? '#86efac' : l.quality === 'dead_zone' ? '#fca5a5' : 'var(--muted)' }}>{l.quality?.replace('_',' ')}</span>
                            <span style={{ fontSize:10, color:'var(--accent)' }}>{l.confidence_score}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top brokers */}
                  {learningData.topBrokers?.length > 0 && (
                    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--text)' }}>
                        Broker Reliability
                      </div>
                      {learningData.topBrokers.slice(0, 8).map((b, i) => (
                        <div key={i} style={{ padding:'10px 16px', borderBottom: i < 7 ? '1px solid var(--border)' : 'none', fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <span style={{ fontWeight:600, color:'var(--text)' }}>{b.broker_name}</span>
                            <span style={{ fontSize:10, color:'var(--muted)', marginLeft:8 }}>{b.total_loads} loads</span>
                          </div>
                          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                            <span style={{ padding:'2px 8px', borderRadius:6, fontSize:9, fontWeight:700, textTransform:'uppercase',
                              background: b.reliability_tier === 'excellent' ? 'rgba(34,197,94,0.15)' : b.reliability_tier === 'poor' || b.reliability_tier === 'blacklist' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                              color: b.reliability_tier === 'excellent' ? '#86efac' : b.reliability_tier === 'poor' || b.reliability_tier === 'blacklist' ? '#fca5a5' : '#fcd34d' }}>{b.reliability_tier}</span>
                            <span style={{ fontSize:10, color:'var(--accent)' }}>{b.reliability_score}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Empty state */}
              {!learningData && !learningTestResults && !feedbackResult && (
                <div style={{ padding:'30px 20px', textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={TrendingUp} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>Q LEARNS FROM EVERY LOAD</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:400, margin:'0 auto', lineHeight:1.6 }}>
                    Track outcomes, detect mistakes, adjust scoring weights, and build lane/broker intelligence — all with guardrails. Click "Load Learning Data" to see what Q has learned, or "Run Learning Tests" to validate the feedback loop.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RULES TAB ── */}
          {tab === 'rules' && (
            <div style={{ padding:20 }}>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Q Decision Rules</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>Current thresholds driving autonomous dispatch decisions</div>
                {data?.settings ? (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {[
                      { label:'Min Profit', val:`$${data.settings.minProfit || 0}`, desc:'Minimum total profit to consider' },
                      { label:'Auto-Accept Above', val:`$${data.settings.autoAcceptAbove || 0}`, desc:'Auto-book if profit exceeds this' },
                      { label:'Auto-Reject Below', val:`$${data.settings.autoRejectBelow || 0}`, desc:'Instant reject below this profit' },
                      { label:'Min RPM', val:`$${data.settings.minRpm || 0}`, desc:'Minimum revenue per mile' },
                      { label:'Fuel Cost/Mile', val:`$${data.settings.fuelCostPerMile || 0}`, desc:'Used for profit calculations' },
                    ].map((r, i) => (
                      <div key={i} style={{ padding:'12px 14px', background:'var(--bg)', borderRadius:10, border:'1px solid var(--border)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{r.label}</span>
                          <span style={{ fontSize:14, fontWeight:800, color:'var(--accent)', fontFamily:"'DM Sans',sans-serif" }}>{r.val}</span>
                        </div>
                        <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{r.desc}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:'var(--muted)' }}>Loading carrier settings...</div>
                )}
                <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.1)', borderRadius:8, fontSize:11, color:'var(--muted)' }}>
                  To update these rules, go to <b style={{ color:'var(--accent)' }}>Settings → Dispatch Preferences</b>. Changes take effect immediately on the next load evaluation.
                </div>
              </div>
            </div>
          )}

        </Suspense>
      </div>
    </div>
  )
}
