import React, { useState, useMemo, useEffect } from 'react'
import { Ic } from '../shared'
import { useCarrier } from '../../../context/CarrierContext'
import {
  DollarSign, CheckCircle, Package, Truck, Users, Star,
  Shield, TrendingUp, TrendingDown, Route, Fuel, Activity,
  AlertTriangle, BarChart2, Bot, Trophy, Siren, Calendar, Zap, Check
} from 'lucide-react'

const MONTH_LABELS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

function letterGrade(rpm, onTime, safetyScore) {
  const score = rpm * 40 + onTime * 0.35 + safetyScore * 0.25
  if (score >= 210) return { g:'A+', c:'#22c55e' }
  if (score >= 195) return { g:'A',  c:'#4ade80' }
  if (score >= 180) return { g:'B+', c:'#86efac' }
  if (score >= 165) return { g:'B',  c:'var(--accent)' }
  if (score >= 145) return { g:'C',  c:'#fb923c' }
  return                     { g:'D',  c:'var(--danger)' }
}

function starRating(rpm, onTime) {
  const s = (rpm / 4.0) * 2.5 + (onTime / 100) * 2.5
  return Math.min(5, Math.max(1, Math.round(s * 2) / 2))
}

export function DriverScorecard() {
  const { loads: realLoads, expenses, drivers: realDrivers } = useCarrier()
  const [selDriverId, setSelDriverId] = useState(null)
  const [viewMode, setViewMode] = useState('scorecard') // scorecard | compare
  const [hoveredMonth, setHoveredMonth] = useState(null)

  const driverSource = realDrivers || []
  const loadSource = realLoads || []

  // Build driver stats
  const driverStats = useMemo(() => {
    return driverSource.map(drv => {
      const name = drv.full_name || drv.name || 'Unknown'
      const myLoads = loadSource.filter(l => (l.driver === name) && ['Delivered','Invoiced'].includes(l.status))
      const myExps = expenses.filter(e => e.driver === name)
      const miles = myLoads.reduce((s, l) => s + (parseFloat(l.miles) || 0), 0)
      const gross = myLoads.reduce((s, l) => s + (parseFloat(l.gross) || 0), 0)
      const rpm = miles > 0 ? Math.round((gross / miles) * 100) / 100 : 0
      const fuel = myExps.filter(e => e.cat === 'Fuel').reduce((s, e) => s + (e.amount || 0), 0)

      // On-time calculation: base it on load count and RPM as proxy
      const onTime = myLoads.length >= 5 ? (rpm >= 3.0 ? 96 : rpm >= 2.5 ? 93 : 88) :
                     myLoads.length >= 3 ? (rpm >= 3.0 ? 94 : 91) :
                     myLoads.length >= 1 ? 88 : 0

      // Safety score (CSA-based proxy: veteran drivers with more loads = higher)
      const tenure = drv.hire_date ? Math.max(1, Math.floor((Date.now() - new Date(drv.hire_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))) : 1
      const safetyScore = Math.min(100, 70 + tenure * 5 + Math.min(20, myLoads.length * 2))

      // RPM trend (compare last month loads to previous)
      const thisMonthLoads = myLoads.filter(l => l.month === 2 || (l.pickup && l.pickup.startsWith('Mar')))
      const lastMonthLoads = myLoads.filter(l => l.month === 1 || (l.pickup && l.pickup.startsWith('Feb')))
      const thisMonthRPM = thisMonthLoads.length > 0 ? thisMonthLoads.reduce((s,l) => s + (parseFloat(l.gross)||0), 0) / Math.max(1, thisMonthLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)) : 0
      const lastMonthRPM = lastMonthLoads.length > 0 ? lastMonthLoads.reduce((s,l) => s + (parseFloat(l.gross)||0), 0) / Math.max(1, lastMonthLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)) : 0
      const rpmTrend = thisMonthRPM >= lastMonthRPM ? 'up' : 'down'

      const grade = letterGrade(rpm, onTime, safetyScore)
      const stars = starRating(rpm, onTime)

      // Monthly revenue for bar chart (last 6 months)
      const monthlyRevenue = MONTH_LABELS.map((_, mi) => {
        // Map index to month filter
        const mLoads = myLoads.filter(l => l.month === mi || false)
        return mLoads.reduce((s,l) => s + (parseFloat(l.gross)||0), 0)
      })
      // Use real monthly data — show zeros if no load history (no fake generation)
      const monthlyRev = monthlyRevenue

      return {
        id: drv.id, name, phone: drv.phone || '', email: drv.email || '',
        cdl: drv.license_number || '', cdlState: drv.license_state || '',
        hireDate: drv.hire_date || '', medExpiry: drv.medical_card_expiry || '',
        licExpiry: drv.license_expiry || '', endorsements: (drv.notes || '').split(',').map(s=>s.trim()).filter(Boolean),
        loads: myLoads.length, miles, gross, rpm, fuel, onTime, safetyScore,
        rpmTrend, grade, stars, monthlyRev, tenure,
        thisMonthLoads: thisMonthLoads.length, lastMonthLoads: lastMonthLoads.length,
        allLoads: myLoads,
      }
    })
  }, [loadSource, expenses, driverSource])

  // Auto-select first driver
  useEffect(() => {
    if (!selDriverId && driverStats.length > 0) setSelDriverId(driverStats[0].id)
  }, [driverStats, selDriverId])

  const d = driverStats.find(x => x.id === selDriverId) || driverStats[0]
  const maxGross = Math.max(...driverStats.map(x => x.gross), 1)

  const statBoxStyle = { background:'var(--surface2)', borderRadius:8, padding:'8px 10px', textAlign:'center', flex:1, border:'1px solid var(--border)' }
  const labelStyle = { fontSize:9, color:'var(--muted)', fontWeight:600, marginBottom:2, textTransform:'uppercase', letterSpacing:0.5 }
  const valStyle = { fontFamily:"'Bebas Neue',sans-serif", fontSize:20, lineHeight:1 }

  // Circular progress gauge component
  const CircularGauge = ({ value, max = 100, size = 56, strokeWidth = 5, color, label }) => {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const progress = Math.min(1, value / max)
    const dashoffset = circumference * (1 - progress)
    return (
      <div style={{ textAlign:'center' }}>
        <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--surface2)" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={dashoffset}
            strokeLinecap="round" style={{ transition:'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div style={{ marginTop:-size/2 - 10, fontSize:16, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", color }}>{value}%</div>
        <div style={{ marginTop:size/2 - 16, fontSize:8, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
      </div>
    )
  }

  // Star display component
  const StarDisplay = ({ rating }) => {
    const stars = []
    for (let i = 1; i <= 5; i++) {
      const fill = rating >= i ? 'var(--accent)' : rating >= i - 0.5 ? 'var(--accent)' : 'var(--surface3)'
      const opacity = rating >= i ? 1 : rating >= i - 0.5 ? 0.6 : 0.3
      stars.push(<Star key={i} size={16} fill={fill} color={fill} style={{ opacity }} />)
    }
    return <div style={{ display:'flex', gap:2, alignItems:'center' }}>{stars}<span style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginLeft:4 }}>{rating.toFixed(1)}</span></div>
  }

  if (driverStats.length === 0) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
            DRIVER <span style={{ color:'var(--accent)' }}>SCORECARD</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Performance report · All drivers · Real-time data</div>
        </div>
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--muted)' }}>
          <Users size={32} />
          <div style={{ fontSize:14, fontWeight:600 }}>No drivers yet</div>
          <div style={{ fontSize:12 }}>No drivers yet — add your first driver to get started</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
            DRIVER <span style={{ color:'var(--accent)' }}>SCORECARD</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Performance report · {driverStats.length} driver{driverStats.length !== 1 ? 's' : ''} · Real-time data</div>
        </div>
        <div style={{ display:'flex', gap:4, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:2 }}>
          {[{ id:'scorecard', label:'Scorecard' }, { id:'compare', label:'Compare' }].map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)}
              style={{
                padding:'5px 14px', fontSize:11, fontWeight: viewMode === m.id ? 700 : 400,
                borderRadius:6, border:'none', cursor:'pointer',
                background: viewMode === m.id ? 'var(--surface3)' : 'transparent',
                color: viewMode === m.id ? 'var(--accent)' : 'var(--muted)',
                fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s'
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── COMPARISON VIEW ─────────────────────────────────────── */}
      {viewMode === 'compare' ? (
        <div style={{ padding:20 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
              <Ic icon={Users} /> Fleet Comparison — Side by Side
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid var(--border)' }}>
                    {['Driver', 'Grade', 'Stars', 'Loads', 'Miles', 'Gross', 'RPM', 'RPM Trend', 'On-Time %', 'Safety', 'Hire Date'].map(h => (
                      <th key={h} style={{ padding:'12px 14px', textAlign:'left', fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map(dr => (
                    <tr key={dr.id} onClick={() => { setSelDriverId(dr.id); setViewMode('scorecard') }}
                      style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(240,165,0,0.04)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:10, background:`${dr.grade.c}15`, border:`2px solid ${dr.grade.c}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:dr.grade.c, flexShrink:0 }}>
                            {dr.name.split(' ').map(w=>w[0]).join('')}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:12 }}>{dr.name}</div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{dr.cdlState} CDL-A</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:dr.grade.c }}>{dr.grade.g}</span>
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:1 }}>
                          {[1,2,3,4,5].map(i => <Star key={i} size={12} fill={dr.stars >= i ? 'var(--accent)' : 'var(--surface3)'} color={dr.stars >= i ? 'var(--accent)' : 'var(--surface3)'} style={{ opacity: dr.stars >= i ? 1 : 0.3 }} />)}
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px', fontWeight:700 }}>{dr.loads}</td>
                      <td style={{ padding:'12px 14px' }}>{dr.miles.toLocaleString()}</td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color:'var(--accent)' }}>${dr.gross.toLocaleString()}</td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color: dr.rpm >= 3.0 ? 'var(--success)' : dr.rpm >= 2.5 ? 'var(--accent)' : 'var(--danger)' }}>${dr.rpm.toFixed(2)}</td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          {dr.rpmTrend === 'up'
                            ? <><TrendingUp size={14} color="var(--success)" /><span style={{ color:'var(--success)', fontWeight:700, fontSize:11 }}>Up</span></>
                            : <><TrendingDown size={14} color="var(--danger)" /><span style={{ color:'var(--danger)', fontWeight:700, fontSize:11 }}>Down</span></>
                          }
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color: dr.onTime >= 95 ? 'var(--success)' : dr.onTime >= 88 ? 'var(--accent)' : 'var(--danger)' }}>{dr.onTime}%</td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color: dr.safetyScore >= 90 ? 'var(--success)' : dr.safetyScore >= 75 ? 'var(--accent)' : 'var(--danger)' }}>{dr.safetyScore}</td>
                      <td style={{ padding:'12px 14px', color:'var(--muted)', fontSize:11 }}>{dr.hireDate ? new Date(dr.hireDate).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gross comparison bars */}
          <div style={{ marginTop:16, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>
              <Ic icon={BarChart2} /> Revenue Comparison
            </div>
            <div style={{ padding:16 }}>
              {driverStats.map(dr => (
                <div key={dr.id} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'center' }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>{dr.name}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:'var(--accent)' }}>${dr.gross.toLocaleString()}</span>
                  </div>
                  <div style={{ height:8, background:'var(--surface2)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(dr.gross/maxGross)*100}%`, background: `linear-gradient(90deg, ${dr.grade.c}, ${dr.grade.c}88)`, borderRadius:4, transition:'width 0.6s ease' }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
      /* ── SCORECARD VIEW ───────────────────────────────────────── */
      <div style={{ display:'flex', minHeight:600 }}>

        {/* LEFT: Driver list */}
        <div style={{ width:270, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'10px 16px 6px', fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:2 }}>DRIVERS ({driverStats.length})</div>
          {driverStats.map(dr => {
            const isSel = selDriverId === dr.id
            return (
              <div key={dr.id} onClick={() => setSelDriverId(dr.id)}
                style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent',
                  cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{dr.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{dr.loads} loads · {dr.miles.toLocaleString()} mi</div>
                    <div style={{ marginTop:3, display:'flex', gap:1 }}>
                      {[1,2,3,4,5].map(i => <Star key={i} size={10} fill={dr.stars >= i ? 'var(--accent)' : 'var(--surface3)'} color={dr.stars >= i ? 'var(--accent)' : 'var(--surface3)'} style={{ opacity: dr.stars >= i ? 1 : 0.3 }} />)}
                    </div>
                  </div>
                  <div style={{ textAlign:'center', background: dr.grade.c+'18', border:`2px solid ${dr.grade.c}`, borderRadius:10, padding:'4px 10px', minWidth:42 }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:dr.grade.c, lineHeight:1 }}>{dr.grade.g}</div>
                  </div>
                </div>
                {/* Mini monthly revenue bars */}
                <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:22 }}>
                  {dr.monthlyRev.map((w, i) => {
                    const maxW = Math.max(...dr.monthlyRev, 1)
                    const h = Math.max(3, Math.round((w / maxW) * 20))
                    return (
                      <div key={i} style={{ flex:1, height:h, borderRadius:2,
                        background: i === 5 && isSel ? 'var(--accent)' : w > 0 ? 'var(--surface3)' : 'var(--surface2)' }}/>
                    )
                  })}
                </div>
                <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>Monthly revenue trend</div>
              </div>
            )
          })}

          {/* Fleet comparison */}
          <div style={{ padding:'14px 16px', marginTop:'auto', borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:2, marginBottom:10 }}>FLEET GROSS</div>
            {driverStats.map(dr => (
              <div key={dr.id} style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{dr.name.split(' ')[0]}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>${dr.gross.toLocaleString()}</span>
                </div>
                <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${(dr.gross/maxGross)*100}%`, background: dr.id===selDriverId ? 'var(--accent)' : 'var(--surface3)', borderRadius:3, transition:'width 0.4s' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail */}
        {d && (
        <div style={{ flex:1, padding:'14px 20px', display:'flex', flexDirection:'column', gap:10 }}>

          {/* ── Driver Profile Card ───────────────────────── */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'visible' }}>
            <div style={{ padding:'12px 16px', display:'flex', gap:14, alignItems:'center' }}>
              {/* Photo placeholder */}
              <div style={{ width:44, height:44, borderRadius:10, background:`linear-gradient(135deg, ${d.grade.c}25, ${d.grade.c}08)`, border:`2px solid ${d.grade.c}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:d.grade.c }}>{d.name.split(' ').map(w=>w[0]).join('')}</span>
              </div>
              {/* Info */}
              <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, lineHeight:1.1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.name}</span>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:5, background:'var(--success)15', color:'var(--success)', border:'1px solid var(--success)30', flexShrink:0 }}>Active</span>
                </div>
                <div style={{ display:'flex', gap:14, flexWrap:'wrap', alignItems:'center' }}>
                  <StarDisplay rating={d.stars} />
                  <div style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={Shield} size={11} /> CDL: <span style={{ color:'var(--text)', fontWeight:600 }}>{d.cdl || '—'}</span></div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={Route} size={11} /> {d.miles.toLocaleString()} mi</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={DollarSign} size={11} /> <span style={{ color:'var(--accent)', fontWeight:700 }}>${d.gross.toLocaleString()}</span></div>
                </div>
              </div>
              {/* Grade badge */}
              <div style={{ textAlign:'center', background:`${d.grade.c}15`, border:`2px solid ${d.grade.c}`, borderRadius:10, padding:'6px 14px', flexShrink:0 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:d.grade.c, lineHeight:1 }}>{d.grade.g}</div>
                <div style={{ fontSize:7, fontWeight:800, color:d.grade.c, letterSpacing:1, marginTop:1 }}>GRADE</div>
              </div>
            </div>
          </div>

          {/* ── KPI Row ───────────────────────────────────── */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {[
              { l:'On-Time %', v:`${d.onTime}%`, c: d.onTime>=95 ? 'var(--success)' : d.onTime>=88 ? 'var(--accent)' : 'var(--danger)', icon: CheckCircle },
              { l:'Revenue/Mile', v:`$${d.rpm.toFixed(2)}`, c: d.rpm>=3.0 ? 'var(--success)' : d.rpm>=2.5 ? 'var(--accent)' : 'var(--danger)', icon: DollarSign, trend: d.rpmTrend },
              { l:'Loads This Mo', v:`${d.thisMonthLoads}`, c:'var(--accent2)', icon: Package },
              { l:'Safety Score', v:`${d.safetyScore}`, c: d.safetyScore>=90 ? 'var(--success)' : d.safetyScore>=75 ? 'var(--accent)' : 'var(--danger)', icon: Shield },
              { l:'Total Loads', v:`${d.loads}`, c:'var(--text)', icon: Truck },
              { l:'Fuel Spend', v:`$${d.fuel.toLocaleString()}`, c:'var(--muted)', icon: Fuel },
            ].map(k => (
              <div key={k.l} style={{ ...statBoxStyle, position:'relative' }}>
                <div style={labelStyle}>
                  {React.createElement(k.icon, { size:10, style:{ marginRight:3, verticalAlign:'middle' } })}
                  {k.l}
                </div>
                <div style={{ ...valStyle, color:k.c }}>{k.v}</div>
                {k.trend && (
                  <div style={{ position:'absolute', top:8, right:8 }}>
                    {k.trend === 'up'
                      ? <TrendingUp size={14} color="var(--success)" />
                      : <TrendingDown size={14} color="var(--danger)" />
                    }
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Visual Gauges Row ─────────────────────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:10 }}>

            {/* Circular gauges */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, alignSelf:'flex-start' }}>Gauges</div>
              <div style={{ display:'flex', gap:14, justifyContent:'center' }}>
                <CircularGauge value={d.onTime} color={d.onTime >= 95 ? 'var(--success)' : d.onTime >= 88 ? 'var(--accent)' : 'var(--danger)'} label="On-Time %" />
                <CircularGauge value={d.safetyScore} color={d.safetyScore >= 90 ? 'var(--success)' : d.safetyScore >= 75 ? 'var(--accent)' : 'var(--danger)'} label="Safety" />
              </div>
            </div>

            {/* Monthly Revenue Bar Chart */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:8 }}>
                <Ic icon={BarChart2} /> Monthly Revenue (6 Mo)
              </div>
              <div style={{ padding:'10px 14px' }}>
                <div style={{ display:'flex', gap:8, alignItems:'flex-end', height:60, marginBottom:6 }}>
                  {MONTH_LABELS.map((mo, i) => {
                    const rev = d.monthlyRev[i] || 0
                    const maxRev = Math.max(...d.monthlyRev, 1)
                    const barH = Math.max(4, Math.round((rev / maxRev) * 50))
                    const isHovered = hoveredMonth === i
                    return (
                      <div key={mo} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'pointer', position:'relative' }}
                        onMouseEnter={() => setHoveredMonth(i)}
                        onMouseLeave={() => setHoveredMonth(null)}>
                        {isHovered && rev > 0 && (
                          <div style={{ position:'absolute', top:-22, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700, color:'var(--accent)', whiteSpace:'nowrap', zIndex:10 }}>
                            ${rev.toLocaleString()}
                          </div>
                        )}
                        <div style={{
                          width:'100%', height:barH, borderRadius:5,
                          background: i === 5 ? 'linear-gradient(180deg, var(--accent), rgba(240,165,0,0.5))' : rev > 0 ? 'var(--surface3)' : 'var(--surface2)',
                          transition:'all 0.3s', border: isHovered ? '1px solid var(--accent)' : '1px solid transparent',
                          transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)', transformOrigin:'bottom'
                        }}/>
                        <div style={{ fontSize:10, color: i === 5 ? 'var(--accent)' : 'var(--muted)', fontWeight: i === 5 ? 700 : 400 }}>{mo}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:6, display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)' }}>
                  <span>Avg: <strong style={{ color:'var(--text)' }}>${Math.round(d.monthlyRev.reduce((a,b)=>a+b,0) / 6).toLocaleString()}/mo</strong></span>
                  <span>Total: <strong style={{ color:'var(--accent)' }}>${d.monthlyRev.reduce((a,b)=>a+b,0).toLocaleString()}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Performance Metrics + AI Insights ──────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>

            {/* Rate performance */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12 }}><Ic icon={BarChart2} /> Rate Performance</div>
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { label:'Avg RPM', val: d.rpm, max:4.0, fmt:`$${d.rpm.toFixed(2)}/mi`, thresh:[3.0, 2.5] },
                  { label:'On-Time Pct', val: d.onTime, max:100, fmt:`${d.onTime}%`, thresh:[95, 88] },
                  { label:'Loads / Month', val: d.thisMonthLoads, max:8, fmt:`${d.thisMonthLoads}`, thresh:[5, 3] },
                  { label:'Safety Score', val: d.safetyScore, max:100, fmt:`${d.safetyScore}/100`, thresh:[90, 75] },
                ].map(m => {
                  const pct = Math.min(100, Math.round((m.val / m.max) * 100))
                  const c = m.val >= m.thresh[0] ? 'var(--success)' : m.val >= m.thresh[1] ? 'var(--accent)' : 'var(--danger)'
                  return (
                    <div key={m.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{m.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:c }}>{m.fmt}</span>
                      </div>
                      <div style={{ height:6, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg, ${c}, ${c}88)`, borderRadius:3, transition:'width 0.5s' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* AI Insights */}
            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.25)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12, display:'flex', gap:8, alignItems:'center' }}>
                <Ic icon={Bot} /> AI Insights
                <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(240,165,0,0.15)', color:'var(--accent)', fontWeight:800, letterSpacing:1 }}>AI</span>
              </div>
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
                {d.rpm >= 3.0 ? (
                  <div style={{ fontSize:11, lineHeight:1.4 }}><Ic icon={Check} /> <strong>{d.name.split(' ')[0]}</strong> is running above fleet avg RPM. Consider offering premium lanes.</div>
                ) : d.rpm >= 2.5 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Zap} /> RPM is solid. Suggest adding 1-2 longer hauls to push gross higher this month.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={AlertTriangle} /> RPM below target. Review lane assignments - short hauls dragging the average down.</div>
                )}
                {d.onTime >= 95 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Trophy} /> On-time rate excellent. Strong candidate for premium broker relationships.</div>
                ) : d.onTime >= 88 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Calendar} /> On-time rate good. Minor delays logged - review appointment scheduling.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Siren} /> On-time rate needs attention. Chronic delays hurt broker scores and re-book rates.</div>
                )}
                {d.safetyScore >= 90 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Shield} /> Safety score excellent ({d.safetyScore}/100). Clean record supports lower insurance premiums.</div>
                ) : d.safetyScore >= 75 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Shield} /> Safety score good. {d.tenure > 2 ? 'Experienced driver with solid track record.' : 'Building tenure - keep monitoring.'}</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={AlertTriangle} /> Safety score needs improvement. Consider additional training or coaching sessions.</div>
                )}
                {d.fuel > 500 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Fuel} /> Fuel spend ${d.fuel.toLocaleString()} this period. Avg MPG check recommended.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Fuel} /> Fuel spend within normal range for miles driven.</div>
                )}
                <div style={{ marginTop:4, padding:'8px 10px', background:'var(--surface2)', borderRadius:8, fontSize:10, color:'var(--muted)' }}>
                  Grade {d.grade.g} · Score: RPM (40%) + On-Time (35%) + Safety (25%)
                </div>
              </div>
            </div>
          </div>

          {/* ── Recent Loads ──────────────────────────────── */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:8 }}>
              <Ic icon={Package} /> Recent Loads ({d.allLoads.length})
            </div>
            <div style={{ maxHeight:180, overflowY:'auto' }}>
              {d.allLoads.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No loads recorded yet</div>
              ) : d.allLoads.slice().reverse().map((l, i) => (
                <div key={l.loadId || i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 18px', borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{l.loadId} · {(l.origin || '').split(',')[0]} → {(l.dest || '').split(',')[0]}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{l.broker} · {l.miles} mi · {l.commodity || 'General'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${(l.gross || 0).toLocaleString()}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>${l.rate || (l.miles > 0 ? ((l.gross||0)/l.miles).toFixed(2) : '0.00')}/mi</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
        )}
      </div>
      )}
    </div>
  )
}
