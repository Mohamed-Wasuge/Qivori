import React, { useState, useEffect } from 'react'
import { Activity, AlertTriangle, CloudSun } from 'lucide-react'
import { useCarrier } from '../../../context/CarrierContext'
import { Ic } from '../shared'

// ── Safety Intelligence Dashboard (AI Crash Risk + Weather + Geofencing) ──
export function SafetyIntelligenceDashboard({ drivers, vehicles, compData }) {
  const { loads } = useCarrier()
  const [fleetRisk, setFleetRisk] = useState(null)
  const [weather, setWeather] = useState(null)
  const [routeZones, setRouteZones] = useState([])
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    import('../../../lib/crashRiskEngine').then(engine => {
      if (cancelled) return
      const allCompChecks = []
      if (compData.validateFleet) {
        const result = compData.validateFleet(drivers || [], vehicles || [], {
          clearinghouseOrders: compData.chOrders, hosLogs: compData.hosLogs, dvirHistory: compData.dvirs, settings: compData.settings,
        })
        allCompChecks.push(...(result.failures || []), ...(result.warnings || []), ...(result.passing || []))
      }
      const risk = engine.calculateFleetRisk(drivers || [], {
        vehicles: vehicles || [],
        loads: loads || [],
        hosLogs: compData.hosLogs,
        incidents: compData.incidents,
        complianceChecks: allCompChecks,
      })
      if (!cancelled) {
        setFleetRisk(risk)
        setRouteZones(engine.getHighRiskZones())
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [drivers, vehicles, loads, compData])

  // Fetch weather for Vegas (default) — carriers can change location later
  useEffect(() => {
    fetch('/api/weather-safety?lat=36.17&lng=-115.14')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setWeather(d) })
      .catch(() => {})
  }, [])

  const riskColor = (score) => score >= 75 ? '#ef4444' : score >= 50 ? '#f97316' : score >= 30 ? '#f59e0b' : '#22c55e'
  const riskBg = (score) => score >= 75 ? 'rgba(239,68,68,0.08)' : score >= 50 ? 'rgba(249,115,22,0.08)' : score >= 30 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)'
  const riskBorder = (score) => score >= 75 ? 'rgba(239,68,68,0.2)' : score >= 50 ? 'rgba(249,115,22,0.2)' : score >= 30 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'
  const riskLabel = (score) => score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 30 ? 'MODERATE' : 'LOW'

  if (loading || !fleetRisk) {
    return <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Analyzing fleet safety data...</div>
  }

  const driverDetail = selectedDriver ? fleetRisk.driverRisks.find(r => r.driverName === selectedDriver) : null

  return (
    <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Ic icon={Activity} size={20} color="#3b82f6" />
        </div>
        <div>
          <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>AI Safety Intelligence</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Predictive crash risk scoring, weather alerts & route hazards</div>
        </div>
      </div>

      {/* Fleet Risk Summary Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:12 }}>
        {[
          { label:'Fleet Risk Score', val: fleetRisk.averageScore, color: riskColor(fleetRisk.averageScore), suffix:'/100' },
          { label:'Critical Risk', val: fleetRisk.riskDistribution.critical, color:'#ef4444', suffix:' drivers' },
          { label:'High Risk', val: fleetRisk.riskDistribution.high, color:'#f97316', suffix:' drivers' },
          { label:'Moderate Risk', val: fleetRisk.riskDistribution.moderate, color:'#f59e0b', suffix:' drivers' },
          { label:'Low Risk', val: fleetRisk.riskDistribution.low + fleetRisk.riskDistribution.minimal, color:'#22c55e', suffix:' drivers' },
        ].map(c => (
          <div key={c.label} style={{ padding:'16px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, textAlign:'center' }}>
            <div style={{ fontSize:24, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}<span style={{ fontSize:11, fontWeight:500, color:'var(--muted)' }}>{c.suffix}</span></div>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8, marginTop:4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Two column: Driver Risk Table + Weather/Geofence */}
      <div style={{ display:'grid', gridTemplateColumns: drivers?.length > 0 ? '1fr 320px' : '1fr', gap:16 }}>
        {/* Driver Risk Table */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)' }}>Driver Risk Assessment</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{(fleetRisk.driverRisks || []).length} drivers analyzed</div>
          </div>
          {(fleetRisk.driverRisks || []).length === 0 ? (
            <div style={{ padding:30, textAlign:'center', color:'var(--muted)', fontSize:12 }}>Add drivers to see crash risk scores</div>
          ) : (
            <div style={{ maxHeight:400, overflow:'auto' }}>
              {[...fleetRisk.driverRisks].sort((a, b) => b.score - a.score).map((dr, i) => (
                <div key={i} onClick={() => setSelectedDriver(selectedDriver === dr.driverName ? null : dr.driverName)}
                  style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', background: selectedDriver === dr.driverName ? 'rgba(59,130,246,0.06)' : 'transparent', transition:'background 0.15s' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:riskBg(dr.score), border:`1px solid ${riskBorder(dr.score)}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:riskColor(dr.score) }}>
                        {dr.score}
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{dr.driverName}</div>
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{dr.summary}</div>
                      </div>
                    </div>
                    <div style={{ padding:'3px 8px', borderRadius:6, fontSize:10, fontWeight:700, letterSpacing:0.5, background:riskBg(dr.score), color:riskColor(dr.score), border:`1px solid ${riskBorder(dr.score)}` }}>
                      {dr.level}
                    </div>
                  </div>
                  {/* Expanded detail */}
                  {selectedDriver === dr.driverName && (
                    <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                      {/* Factor breakdown */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                        {dr.factors.map((f, fi) => (
                          <div key={fi} style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ flex:1, fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>{f.label}</div>
                            <div style={{ width:60, height:6, borderRadius:3, background:'var(--border)', overflow:'hidden' }}>
                              <div style={{ width:`${f.score}%`, height:'100%', borderRadius:3, background:riskColor(f.score), transition:'width 0.3s' }} />
                            </div>
                            <div style={{ fontSize:10, fontWeight:700, color:riskColor(f.score), width:24, textAlign:'right' }}>{f.score}</div>
                          </div>
                        ))}
                      </div>
                      {/* Risk details */}
                      {dr.factors.filter(f => f.details.length > 0).map((f, fi) => (
                        <div key={fi} style={{ marginBottom:6 }}>
                          {f.details.map((d, di) => (
                            <div key={di} style={{ fontSize:11, color: f.score >= 30 ? riskColor(f.score) : 'var(--muted)', paddingLeft:8, borderLeft:`2px solid ${riskColor(f.score)}`, marginBottom:3, lineHeight:1.4 }}>
                              {d}
                            </div>
                          ))}
                        </div>
                      ))}
                      {/* Recommendations */}
                      {dr.recommendations.length > 0 && (
                        <div style={{ marginTop:8 }}>
                          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--muted)', letterSpacing:0.8, marginBottom:6 }}>Recommendations</div>
                          {dr.recommendations.map((rec, ri) => (
                            <div key={ri} style={{ fontSize:11, padding:'6px 10px', borderRadius:6, marginBottom:4, background: rec.priority === 'critical' ? 'rgba(239,68,68,0.08)' : rec.priority === 'high' ? 'rgba(249,115,22,0.08)' : 'rgba(59,130,246,0.08)', color: rec.priority === 'critical' ? '#fca5a5' : rec.priority === 'high' ? '#fdba74' : '#93c5fd', border:`1px solid ${rec.priority === 'critical' ? 'rgba(239,68,68,0.15)' : rec.priority === 'high' ? 'rgba(249,115,22,0.15)' : 'rgba(59,130,246,0.15)'}` }}>
                              {rec.action}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Weather + Route Hazards */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Weather Card */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={CloudSun} size={14} /> Weather Safety
            </div>
            {weather ? (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{weather.location || 'Current Location'}</div>
                  <div style={{ padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:riskBg(weather.riskScore || 0), color:riskColor(weather.riskScore || 0), border:`1px solid ${riskBorder(weather.riskScore || 0)}` }}>
                    {weather.riskLevel || 'CLEAR'}
                  </div>
                </div>
                {weather.forecast && (
                  <div style={{ fontSize:12, color:'var(--text)', marginBottom:6 }}>
                    {weather.forecast.shortForecast} — {weather.forecast.temperature}°{weather.forecast.temperatureUnit}
                  </div>
                )}
                {weather.forecast?.windSpeed && (
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Wind: {weather.forecast.windSpeed} {weather.forecast.windDirection}</div>
                )}
                {(weather.alerts || []).length > 0 && (
                  <div style={{ marginTop:8 }}>
                    {weather.alerts.map((a, i) => (
                      <div key={i} style={{ padding:'6px 10px', borderRadius:6, marginBottom:4, fontSize:11, fontWeight:600, background:'rgba(239,68,68,0.08)', color:'#fca5a5', border:'1px solid rgba(239,68,68,0.15)' }}>
                        {a.event}: {a.headline?.slice(0, 80)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize:11, color:'var(--muted)' }}>Loading weather data...</div>
            )}
          </div>

          {/* Route Hazard Zones */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={AlertTriangle} size={14} /> Known Hazard Zones
            </div>
            <div style={{ maxHeight:250, overflow:'auto' }}>
              {routeZones.map((zone, i) => (
                <div key={i} style={{ padding:'8px 0', borderBottom: i < routeZones.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{zone.name}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4 }}>{zone.detail}</div>
                  <div style={{ display:'inline-block', marginTop:4, padding:'1px 6px', borderRadius:4, fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5,
                    background: zone.risk === 'winter' ? 'rgba(59,130,246,0.1)' : zone.risk === 'grade' ? 'rgba(245,158,11,0.1)' : 'rgba(168,85,247,0.1)',
                    color: zone.risk === 'winter' ? '#60a5fa' : zone.risk === 'grade' ? '#fbbf24' : '#c084fc',
                    border: `1px solid ${zone.risk === 'winter' ? 'rgba(59,130,246,0.2)' : zone.risk === 'grade' ? 'rgba(245,158,11,0.2)' : 'rgba(168,85,247,0.2)'}`,
                  }}>{zone.risk}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Safety Score Legend */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:10 }}>Risk Score Legend</div>
            {[
              { range:'75-100', label:'Critical — Do not dispatch', color:'#ef4444' },
              { range:'50-74', label:'High — Review before dispatch', color:'#f97316' },
              { range:'30-49', label:'Moderate — Proceed with caution', color:'#f59e0b' },
              { range:'0-29', label:'Low — Clear to dispatch', color:'#22c55e' },
            ].map(l => (
              <div key={l.range} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <div style={{ width:10, height:10, borderRadius:3, background:l.color, flexShrink:0 }} />
                <div style={{ fontSize:11, color:'var(--muted)' }}><span style={{ fontWeight:700, color:l.color }}>{l.range}</span> — {l.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
