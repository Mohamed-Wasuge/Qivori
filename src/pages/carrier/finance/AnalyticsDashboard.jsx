import React, { useState, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { Ic, S, StatCard, AiBanner } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import {
  Brain, Fuel, TrendingDown, Route, DollarSign, Truck, TrendingUp, Star,
  CheckCircle, Sparkles, BarChart2, Receipt, Activity, Briefcase, Navigation
} from 'lucide-react'

// ─── AI ANALYTICS DASHBOARD ──────────────────────────────────────────────────
export function AnalyticsDashboard() {
  const { showToast } = useApp()
  const { loads, expenses, invoices, totalRevenue, totalExpenses, deliveredLoads, drivers, vehicles } = useCarrier()
  const [aiTab, setAiTab] = useState('insights')

  // ── Computed data ───────────────────────────────────────────
  const revenueByMonth = useMemo(() => {
    const months = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = d.toLocaleDateString('en-US', { month:'short' })
      months.push({ key, label, revenue:0, expenses:0, loads:0, miles:0 })
    }
    loads.forEach(l => {
      const dateStr = l.pickup_date || l.pickup || l.delivery_date || l.delivery || ''
      if (!dateStr) return
      const parsed = new Date(dateStr.replace(/·.*/,'').trim())
      if (isNaN(parsed)) return
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}`
      const m = months.find(mo => mo.key === key)
      if (m) { m.revenue += Number(l.gross || l.rate || l.gross_pay || 0); m.loads++; m.miles += Number(l.miles || 0) }
    })
    expenses.forEach(e => {
      const parsed = new Date(e.date)
      if (isNaN(parsed)) return
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}`
      const m = months.find(mo => mo.key === key)
      if (m) m.expenses += Number(e.amount || 0)
    })
    return months
  }, [loads, expenses])

  const topLanes = useMemo(() => {
    const laneMap = {}
    deliveredLoads.forEach(l => {
      const o = (l.origin || '').split(',')[0].trim()
      const d = (l.destination || l.dest || '').split(',')[0].trim()
      if (!o || !d) return
      const key = `${o} → ${d}`
      if (!laneMap[key]) laneMap[key] = { lane:key, revenue:0, loads:0, miles:0, rates:[] }
      laneMap[key].revenue += Number(l.gross || l.rate || l.gross_pay || 0)
      laneMap[key].loads++
      laneMap[key].miles += Number(l.miles || 0)
      if (l.rate) laneMap[key].rates.push(Number(l.rate))
    })
    return Object.values(laneMap).sort((a,b) => b.revenue - a.revenue).slice(0, 6)
  }, [deliveredLoads])

  const expByCategory = useMemo(() => {
    const catMap = {}
    expenses.forEach(e => {
      const cat = e.category || e.cat || 'Other'
      if (!catMap[cat]) catMap[cat] = 0
      catMap[cat] += Number(e.amount || 0)
    })
    return Object.entries(catMap).sort((a,b) => b[1] - a[1]).map(([cat, amount]) => ({ cat, amount }))
  }, [expenses])

  // ── AI-computed metrics ────────────────────────────────────
  const totalMiles = loads.reduce((s,l) => s + Number(l.miles||0), 0)
  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? Math.round((netProfit/totalRevenue)*100) : 0
  const avgRPM = totalMiles > 0 ? (totalRevenue / totalMiles).toFixed(2) : '0.00'
  const avgLoadSize = loads.length > 0 ? Math.round(totalRevenue / loads.length) : 0
  const totalExpAmt = expByCategory.reduce((s,e) => s+e.amount, 0) || 1
  const maxRev = Math.max(...revenueByMonth.map(m => m.revenue), 1)
  const fuelExp = expenses.filter(e => (e.category||e.cat||'').toLowerCase().includes('fuel')).reduce((s,e) => s+Number(e.amount||0), 0)
  const fuelPctOfRev = totalRevenue > 0 ? Math.round((fuelExp/totalRevenue)*100) : 0
  const unpaidTotal = invoices.filter(i => i.status !== 'Paid').reduce((s,i) => s+Number(i.amount||0), 0)
  const paidInvoices = invoices.filter(i => i.status === 'Paid')

  // Revenue trend (is it going up or down?)
  const recentMonths = revenueByMonth.slice(-3)
  const revTrend = recentMonths.length >= 2
    ? recentMonths[recentMonths.length-1].revenue - recentMonths[recentMonths.length-2].revenue
    : 0
  const revTrendPct = recentMonths.length >= 2 && recentMonths[recentMonths.length-2].revenue > 0
    ? Math.round((revTrend / recentMonths[recentMonths.length-2].revenue) * 100)
    : 0

  // Deadhead ratio
  const totalDeadhead = loads.reduce((s,l) => s + Number(l.deadhead||0), 0)
  const deadheadPct = totalMiles > 0 ? Math.round((totalDeadhead / (totalMiles+totalDeadhead)) * 100) : 0

  // Utilization — count trucks from vehicles, drivers, OR drivers assigned to active loads
  const activeInTransit = loads.filter(l => ['In Transit','Loaded','At Pickup','At Delivery'].includes(l.status))
  const uniqueActiveDrivers = new Set(activeInTransit.map(l => l.driver || l.driver_name).filter(Boolean))
  const vehicleTrucks = (vehicles || []).filter(v => v.type === 'truck').length
  const truckCount = Math.max(vehicleTrucks, (drivers || []).length, uniqueActiveDrivers.size, activeInTransit.length > 0 ? 1 : 0)
  const utilization = truckCount > 0 ? Math.min(100, Math.round((activeInTransit.length / truckCount) * 100)) : 0

  // Projected monthly revenue (based on current pace)
  const now = new Date()
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
  const currentMonthRev = revenueByMonth[revenueByMonth.length-1]?.revenue || 0
  const projectedRev = dayOfMonth > 0 ? Math.round((currentMonthRev / dayOfMonth) * daysInMonth) : 0

  // AI Health Score (0–100)
  const healthScore = useMemo(() => {
    let score = 50
    if (margin > 30) score += 15; else if (margin > 20) score += 8; else if (margin < 10) score -= 10
    if (Number(avgRPM) > 2.8) score += 10; else if (Number(avgRPM) < 2.0) score -= 10
    if (utilization > 80) score += 10; else if (utilization < 40) score -= 5
    if (deadheadPct < 10) score += 5; else if (deadheadPct > 20) score -= 5
    if (fuelPctOfRev < 30) score += 5; else if (fuelPctOfRev > 40) score -= 5
    if (unpaidTotal === 0) score += 5; else if (unpaidTotal > totalRevenue * 0.5) score -= 10
    return Math.max(0, Math.min(100, score))
  }, [margin, avgRPM, utilization, deadheadPct, fuelPctOfRev, unpaidTotal, totalRevenue])

  const scoreColor = healthScore >= 80 ? 'var(--success)' : healthScore >= 60 ? 'var(--accent)' : healthScore >= 40 ? 'var(--warning)' : 'var(--danger)'
  const scoreLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Needs Work' : 'At Risk'

  // AI Recommendations
  const aiRecs = useMemo(() => {
    const recs = []
    if (fuelPctOfRev > 35) recs.push({ icon:Fuel, color:'#f59e0b', title:'Fuel spend is high', detail:`Fuel is ${fuelPctOfRev}% of revenue (industry avg: 25–30%). Consider fuel card programs or optimizing routes to save $${Math.round(fuelExp * 0.08).toLocaleString()}/mo.`, impact:'High', action:'Optimize' })
    if (margin < 25 && totalRevenue > 0) recs.push({ icon:TrendingDown, color:'#ef4444', title:'Margins below target', detail:`Net margin is ${margin}% — below the 30% industry benchmark. Review expense categories or negotiate higher rates on your top lanes.`, impact:'High', action:'Review' })
    if (deadheadPct > 15 && totalMiles > 0) recs.push({ icon:Route, color:'#8b5cf6', title:'Reduce deadhead miles', detail:`${deadheadPct}% of your miles are empty. Look for backhaul loads on your top lanes to fill repositioning gaps.`, impact:'Medium', action:'Find Loads' })
    if (unpaidTotal > 5000) recs.push({ icon:DollarSign, color:'#ef4444', title:`$${unpaidTotal.toLocaleString()} in unpaid invoices`, detail:`${invoices.filter(i=>i.status!=='Paid').length} invoices are outstanding. Follow up with brokers or consider factoring for immediate cash flow.`, impact:'High', action:'Collect' })
    if (utilization < 60 && truckCount > 0 && loads.length > 0) recs.push({ icon:Truck, color:'#4d8ef0', title:'Fleet underutilized', detail:`Only ${utilization}% of trucks are running loads. Book more loads or consider reducing fleet size to improve profitability.`, impact:'Medium', action:'Book Loads' })
    if (Number(avgRPM) < 2.5 && loads.length > 0) recs.push({ icon:TrendingUp, color:'#f0a500', title:'Rate per mile is low', detail:`Avg $${avgRPM}/mi is below the $2.80 national average. Focus on higher-paying lanes and avoid low-RPM loads.`, impact:'Medium', action:'Analyze' })
    if (topLanes.length > 0 && topLanes[0].loads >= 3) recs.push({ icon:Star, color:'#22c55e', title:`Strong lane: ${topLanes[0].lane}`, detail:`${topLanes[0].loads} loads at $${topLanes[0].miles > 0 ? (topLanes[0].revenue/topLanes[0].miles).toFixed(2) : '0.00'}/mi. Consider negotiating a dedicated lane contract with your top broker for consistent volume.`, impact:'Opportunity', action:'Negotiate' })
    if (recs.length === 0) recs.push({ icon:CheckCircle, color:'#22c55e', title:'Operations look healthy', detail:'No critical issues detected. Keep monitoring your margins and lane performance.', impact:'Info', action:'Continue' })
    return recs
  }, [fuelPctOfRev, fuelExp, margin, deadheadPct, unpaidTotal, utilization, avgRPM, topLanes, invoices])

  const AD_CAT_COLORS = { Fuel:'#f59e0b', Maintenance:'#ef4444', Tolls:'#8b5cf6', Food:'#22c55e', Parking:'#3b82f6', Insurance:'#ec4899', Other:'#6b7280' }
  const PIE_COLORS = ['#f59e0b','#ef4444','#8b5cf6','#22c55e','#3b82f6','#ec4899','#6b7280']
  const IMPACT_COLORS = { High:'var(--danger)', Medium:'var(--accent)', Opportunity:'var(--success)', Info:'var(--accent2)' }

  // ── Recharts custom tooltip ────────────────────────────────
  const ChartTooltip = ({ active, payload, label, formatter }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background:'rgba(0,0,0,0.92)', border:'1px solid #333', borderRadius:10, padding:'10px 14px', fontFamily:"'DM Sans',sans-serif", boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>
        {label && <div style={{ fontSize:11, color:'#999', marginBottom:6, fontWeight:600 }}>{label}</div>}
        {payload.map((p, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, marginBottom:2 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:p.color || p.fill }} />
            <span style={{ color:'#ccc' }}>{p.name}:</span>
            <span style={{ color:'#fff', fontWeight:700 }}>{formatter ? formatter(p.value) : `$${Number(p.value).toLocaleString()}`}</span>
          </div>
        ))}
      </div>
    )
  }

  // ── P&L bar chart data (net profit per month) ──────────────
  const plBarData = useMemo(() =>
    revenueByMonth.map(m => ({ ...m, net: m.revenue - m.expenses })),
    [revenueByMonth]
  )

  // ── Pie chart data for cost structure ──────────────────────
  const pieData = useMemo(() =>
    expByCategory.slice(0, 6).map((e, i) => ({
      name: e.cat,
      value: e.amount,
      color: AD_CAT_COLORS[e.cat] || PIE_COLORS[i % PIE_COLORS.length],
      pct: totalExpAmt > 0 ? Math.round((e.amount / totalExpAmt) * 100) : 0
    })),
    [expByCategory, totalExpAmt]
  )

  // ── Cash flow projection (6 weeks) ────────────────────────
  const cashFlowData = useMemo(() => {
    const weeks = []
    const today = new Date()
    const weeklyRev = revenueByMonth.length > 0 ? revenueByMonth[revenueByMonth.length - 1].revenue / 4.33 : 0
    const weeklyExp = totalExpenses > 0 ? totalExpenses / (revenueByMonth.filter(m => m.expenses > 0).length || 1) / 4.33 : 0
    let balance = totalRevenue - totalExpenses - unpaidTotal
    for (let i = 0; i < 6; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i * 7)
      const incoming = Math.round(weeklyRev * (0.85 + Math.random() * 0.3))
      const outgoing = Math.round(weeklyExp * (0.9 + Math.random() * 0.2))
      balance += incoming - outgoing
      weeks.push({
        week: `Wk ${i + 1}`,
        incoming: Math.round(incoming),
        outgoing: Math.round(outgoing),
        balance: Math.round(balance)
      })
    }
    return weeks
  }, [revenueByMonth, totalExpenses, totalRevenue, unpaidTotal])

  // ── Top brokers by revenue ─────────────────────────────────
  const topBrokers = useMemo(() => {
    const brokerMap = {}
    deliveredLoads.forEach(l => {
      const broker = l.broker || l.broker_name || l.customer || 'Unknown'
      if (!brokerMap[broker]) brokerMap[broker] = { name: broker, revenue: 0, loads: 0 }
      brokerMap[broker].revenue += Number(l.gross || l.gross_pay || 0)
      brokerMap[broker].loads++
    })
    return Object.values(brokerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  }, [deliveredLoads])

  // ── Sparkline data (last 7 days from loads) ────────────────
  const sparkData = useMemo(() => {
    const days = []
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dayKey = d.toISOString().slice(0, 10)
      let rev = 0, exp = 0, ldCount = 0
      loads.forEach(l => {
        const dateStr = l.pickup_date || l.pickup || l.delivery_date || l.delivery || ''
        if (!dateStr) return
        const parsed = new Date(dateStr.replace(/·.*/, '').trim())
        if (isNaN(parsed)) return
        if (parsed.toISOString().slice(0, 10) === dayKey) {
          rev += Number(l.gross || l.gross_pay || 0)
          ldCount++
        }
      })
      expenses.forEach(e => {
        const parsed = new Date(e.date)
        if (isNaN(parsed)) return
        if (parsed.toISOString().slice(0, 10) === dayKey) exp += Number(e.amount || 0)
      })
      days.push({ day: dayKey, revenue: rev, expenses: exp, loads: ldCount })
    }
    return days
  }, [loads, expenses])

  const sparkRevTrend = sparkData.length >= 2 ? sparkData[sparkData.length - 1].revenue - sparkData[0].revenue : 0
  const sparkExpTrend = sparkData.length >= 2 ? sparkData[sparkData.length - 1].expenses - sparkData[0].expenses : 0
  const sparkLoadTrend = sparkData.length >= 2 ? sparkData[sparkData.length - 1].loads - sparkData[0].loads : 0

  // ── Sparkline mini component ───────────────────────────────
  const Sparkline = ({ data, dataKey, color }) => (
    <div style={{ width: 80, height: 30, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} animationDuration={800} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  // ── Custom pie label ───────────────────────────────────────
  const renderPieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background:'rgba(0,0,0,0.92)', border:'1px solid #333', borderRadius:10, padding:'10px 14px', fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#fff', marginBottom:4 }}>{d.name}</div>
        <div style={{ fontSize:12, color:'#ccc' }}>${d.value.toLocaleString()} ({d.pct}%)</div>
      </div>
    )
  }

  return (
    <div style={{ ...S.page, paddingBottom:60 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>AI ANALYTICS</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Powered by Qivori Intelligence Engine</div>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[
            { id:'insights', label:'AI Insights' },
            { id:'financial', label:'Financial' },
            { id:'operations', label:'Operations' },
          ].map(t => (
            <button key={t.id} onClick={() => setAiTab(t.id)} className="btn" style={{
              background: aiTab===t.id ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
              color: aiTab===t.id ? 'var(--accent)' : 'var(--muted)',
              border: `1px solid ${aiTab===t.id ? 'rgba(240,165,0,0.35)' : 'var(--border)'}`,
              fontSize:12,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── AI INSIGHTS TAB ───────────────────────────────────── */}
      {aiTab === 'insights' && (<>

        {/* AI Health Score + Key Metrics */}
        <div style={{ display:'grid', gridTemplateColumns:'minmax(200px,280px) 1fr', gap:16 }}>
          {/* Health Score Ring */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:24, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <div style={{ position:'relative', width:140, height:140, marginBottom:16 }}>
              <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform:'rotate(-90deg)' }}>
                <circle cx="70" cy="70" r="58" fill="none" stroke="var(--surface2)" strokeWidth="10" />
                <circle cx="70" cy="70" r="58" fill="none" stroke={scoreColor} strokeWidth="10"
                  strokeDasharray={`${(healthScore/100)*364} 364`}
                  strokeLinecap="round" style={{ transition:'stroke-dasharray 1s ease' }} />
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:42, color:scoreColor, lineHeight:1 }}>{healthScore}</div>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>/ 100</div>
              </div>
            </div>
            <div style={{ fontWeight:800, fontSize:14, color:scoreColor, marginBottom:4 }}>{scoreLabel}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>AI Business Health Score</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:8, lineHeight:1.5 }}>
              Based on margins, RPM, utilization, deadhead, fuel costs, and receivables
            </div>
          </div>

          {/* Score Breakdown Gauges */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
            {[
              { label:'Net Margin', value:`${margin}%`, target:'30%', pct:Math.min(100,Math.round((margin/40)*100)), color: margin>=30?'var(--success)':margin>=20?'var(--accent)':'var(--danger)', detail: margin>=30?'Above industry avg':'Below 30% target' },
              { label:'Rate/Mile', value:`$${avgRPM}`, target:'$2.80', pct:Math.min(100,Math.round((Number(avgRPM)/3.5)*100)), color: Number(avgRPM)>=2.8?'var(--success)':Number(avgRPM)>=2.3?'var(--accent)':'var(--danger)', detail: Number(avgRPM)>=2.8?'Strong rate':'Below national avg' },
              { label:'Fleet Util.', value:`${utilization}%`, target:'85%', pct:utilization, color: utilization>=80?'var(--success)':utilization>=50?'var(--accent)':'var(--danger)', detail:`${loads.filter(l=>['In Transit','Loaded'].includes(l.status)).length} of ${truckCount} trucks active` },
              { label:'Deadhead', value:`${deadheadPct}%`, target:'<10%', pct:Math.min(100,100-deadheadPct*3), color: deadheadPct<10?'var(--success)':deadheadPct<20?'var(--accent)':'var(--danger)', detail: deadheadPct<10?'Excellent efficiency':'Empty miles too high' },
              { label:'Fuel % of Rev', value:`${fuelPctOfRev}%`, target:'<30%', pct:Math.min(100,100-fuelPctOfRev*2), color: fuelPctOfRev<30?'var(--success)':fuelPctOfRev<38?'var(--accent)':'var(--danger)', detail:`$${fuelExp.toLocaleString()} spent on fuel` },
              { label:'Receivables', value:`$${(unpaidTotal/1000).toFixed(1)}K`, target:'$0', pct:Math.min(100,unpaidTotal===0?100:Math.max(10,100-Math.round((unpaidTotal/Math.max(totalRevenue,1))*200))), color: unpaidTotal===0?'var(--success)':unpaidTotal<5000?'var(--accent)':'var(--danger)', detail:`${invoices.filter(i=>i.status!=='Paid').length} invoices outstanding` },
            ].map(g => (
              <div key={g.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>{g.label}</span>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>Target: {g.target}</span>
                </div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:g.color, marginBottom:6 }}>{g.value}</div>
                <div style={{ height:5, background:'var(--surface2)', borderRadius:3, marginBottom:6 }}>
                  <div style={{ height:'100%', width:`${g.pct}%`, background:g.color, borderRadius:3, transition:'width 0.8s ease' }} />
                </div>
                <div style={{ fontSize:10, color:g.color }}>{g.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendations */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Brain size={15} color="var(--accent)" />
              </div>
              <div>
                <div style={S.panelTitle}>AI Recommendations</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>Auto-generated from your operational data</div>
              </div>
            </div>
            <span style={S.badge('var(--accent)')}>{aiRecs.length} insight{aiRecs.length!==1?'s':''}</span>
          </div>
          <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
            {aiRecs.map((r, i) => (
              <div key={i} style={{ display:'flex', gap:14, padding:'14px 16px', background:'var(--surface2)', borderRadius:10, alignItems:'flex-start', border:'1px solid var(--border)', flexWrap:'wrap' }}>
                <div style={{ width:38, height:38, borderRadius:10, background:`${r.color}15`, border:`1px solid ${r.color}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Ic icon={r.icon} size={18} color={r.color} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:700 }}>{r.title}</span>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:`${IMPACT_COLORS[r.impact]}15`, color:IMPACT_COLORS[r.impact] }}>{r.impact}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>{r.detail}</div>
                </div>
                <button className="btn btn-ghost" style={{ fontSize:11, flexShrink:0, whiteSpace:'nowrap' }} onClick={() => showToast('','AI Action',r.title)}>{r.action} →</button>
              </div>
            ))}
          </div>
        </div>

        {/* Projected Revenue */}
        <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.06), rgba(0,212,170,0.04))', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12, padding:'18px 22px', display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Sparkles size={22} color="var(--accent)" />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:2 }}>AI Revenue Forecast — {now.toLocaleDateString('en-US',{month:'long'})}</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:'var(--accent)' }}>${projectedRev.toLocaleString()}</span>
              <span style={{ fontSize:12, color:'var(--muted)' }}>projected</span>
              <span style={{ fontSize:12, color: revTrendPct >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>
                {revTrendPct >= 0 ? '↑' : '↓'} {Math.abs(revTrendPct)}% vs last month
              </span>
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Day {dayOfMonth} of {daysInMonth}</div>
            <div style={{ height:4, width:100, background:'var(--surface2)', borderRadius:2, marginTop:4 }}>
              <div style={{ height:'100%', width:`${Math.round((dayOfMonth/daysInMonth)*100)}%`, background:'var(--accent)', borderRadius:2 }} />
            </div>
          </div>
        </div>
      </>)}

      {/* ── FINANCIAL TAB ─────────────────────────────────────── */}
      {aiTab === 'financial' && (<>
        {/* KPI Row with Sparklines */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12 }}>
          {[
            { label:'Gross Revenue', value: totalRevenue >= 1000 ? `$${(totalRevenue/1000).toFixed(1)}K` : `$${totalRevenue}`, change: revTrendPct >= 0 ? `↑ ${revTrendPct}%` : `↓ ${Math.abs(revTrendPct)}%`, color:'var(--accent)', changeType: revTrendPct>=0?'up':'down', sparkKey:'revenue', sparkColor: sparkRevTrend >= 0 ? '#22c55e' : '#ef4444' },
            { label:'Net Profit', value: netProfit >= 1000 ? `$${(netProfit/1000).toFixed(1)}K` : `$${netProfit}`, change:`${margin}% margin`, color:'var(--success)', changeType: margin>=30?'up':'down', sparkKey:'revenue', sparkColor: '#22c55e' },
            { label:'Avg Load', value:`$${avgLoadSize.toLocaleString()}`, change:`${loads.length} total`, color:'var(--accent2)', changeType:'neutral', sparkKey:'loads', sparkColor: sparkLoadTrend >= 0 ? '#22c55e' : '#ef4444' },
            { label:'Expenses', value: totalExpenses >= 1000 ? `$${(totalExpenses/1000).toFixed(1)}K` : `$${totalExpenses}`, change:`${100-margin}% of rev`, color:'var(--danger)', changeType:'neutral', sparkKey:'expenses', sparkColor: sparkExpTrend <= 0 ? '#22c55e' : '#ef4444' },
            { label:'Unpaid', value:`$${(unpaidTotal/1000).toFixed(1)}K`, change:`${invoices.filter(i=>i.status!=='Paid').length} invoices`, color: unpaidTotal>0?'var(--danger)':'var(--success)', changeType:'neutral', sparkKey:'revenue', sparkColor: unpaidTotal > 0 ? '#ef4444' : '#22c55e' },
          ].map(kpi => (
            <div key={kpi.label} style={S.stat()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6, fontWeight:600 }}>{kpi.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:30, color:kpi.color, letterSpacing:1 }}>{kpi.value}</div>
                </div>
                <Sparkline data={sparkData} dataKey={kpi.sparkKey} color={kpi.sparkColor} />
              </div>
              {kpi.change && <div style={{ fontSize:11, color: kpi.changeType==='up'?'var(--success)':kpi.changeType==='down'?'var(--danger)':'var(--muted)', marginTop:4 }}>{kpi.change}</div>}
            </div>
          ))}
        </div>

        {/* ── Revenue vs Expenses AREA CHART ──────────────────── */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={BarChart2} /> Revenue vs Expenses · 6 Months</div>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Net: <strong style={{ color:'#22c55e' }}>${netProfit.toLocaleString()}</strong></span>
          </div>
          <div style={{ padding:'16px 12px 8px' }}>
            {revenueByMonth.some(m => m.revenue > 0 || m.expenses > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={revenueByMonth} margin={{ top:10, right:10, left:0, bottom:0 }}>
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f0a500" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#f0a500" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill:'#999', fontSize:11, fontFamily:"'DM Sans',sans-serif" }} axisLine={{ stroke:'#333' }} tickLine={false} />
                  <YAxis tick={{ fill:'#999', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} width={48} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#f0a500" strokeWidth={2.5} fill="url(#gradRevenue)" animationDuration={800} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#gradExpenses)" animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:250, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:13 }}>No revenue or expense data yet</div>
            )}
          </div>
        </div>

        {/* ── Monthly P&L BAR CHART + Cost Structure PIE ─────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16 }}>
          {/* P&L Grouped Bar Chart */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={BarChart2} /> Monthly P&L</div>
            </div>
            <div style={{ padding:'16px 12px 8px' }}>
              {plBarData.some(m => m.revenue > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={plBarData} margin={{ top:10, right:10, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill:'#999', fontSize:11, fontFamily:"'DM Sans',sans-serif" }} axisLine={{ stroke:'#333' }} tickLine={false} />
                    <YAxis tick={{ fill:'#999', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="revenue" name="Revenue" fill="#f0a500" radius={[4,4,0,0]} animationDuration={800} />
                    <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4,4,0,0]} animationDuration={800} />
                    <Bar dataKey="net" name="Net Profit" fill="#22c55e" radius={[4,4,0,0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height:250, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:13 }}>No financial data yet</div>
              )}
            </div>
          </div>

          {/* Cost Structure PIE CHART */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Receipt} /> Cost Structure</div>
            </div>
            <div style={{ padding:16 }}>
              {pieData.length > 0 ? (<>
                <div style={{ position:'relative' }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" nameKey="name" animationDuration={800} paddingAngle={2}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                      </Pie>
                      <Tooltip content={renderPieTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'#fff' }}>${totalExpAmt >= 1000 ? `${(totalExpAmt/1000).toFixed(1)}K` : totalExpAmt}</div>
                    <div style={{ fontSize:9, color:'#999' }}>Total</div>
                  </div>
                </div>
                {/* Legend */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 16px', marginTop:8, justifyContent:'center' }}>
                  {pieData.map(d => (
                    <div key={d.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#ccc' }}>
                      <div style={{ width:8, height:8, borderRadius:2, background:d.color, flexShrink:0 }} />
                      <span>{d.name}</span>
                      <span style={{ color:'#999', fontWeight:600 }}>{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </>) : (
                <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:13 }}>No expense data yet</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Cash Flow AREA + Top Brokers HORIZONTAL BAR ──── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16 }}>
          {/* Cash Flow Projection */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Activity} /> Cash Flow Projection · 6 Weeks</div>
            </div>
            <div style={{ padding:'16px 12px 8px' }}>
              {cashFlowData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={cashFlowData} margin={{ top:10, right:10, left:0, bottom:0 }}>
                    <defs>
                      <linearGradient id="gradCashPos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="week" tick={{ fill:'#999', fontSize:11, fontFamily:"'DM Sans',sans-serif" }} axisLine={{ stroke:'#333' }} tickLine={false} />
                    <YAxis tick={{ fill:'#999', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} width={52} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="balance" name="Balance" stroke="#22c55e" strokeWidth={2.5} fill="url(#gradCashPos)" animationDuration={800} />
                    <Area type="monotone" dataKey="incoming" name="Incoming" stroke="#f0a500" strokeWidth={1.5} fill="none" strokeDasharray="4 4" animationDuration={800} />
                    <Area type="monotone" dataKey="outgoing" name="Outgoing" stroke="#ef4444" strokeWidth={1.5} fill="none" strokeDasharray="4 4" animationDuration={800} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height:250, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:13 }}>Not enough data for projection</div>
              )}
            </div>
          </div>

          {/* Top Brokers HORIZONTAL BAR */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Briefcase} /> Top Brokers by Revenue</div>
              <span style={{ fontSize:10, color:'var(--muted)' }}>Top {topBrokers.length}</span>
            </div>
            <div style={{ padding:'16px 12px 8px' }}>
              {topBrokers.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(250, topBrokers.length * 36)}>
                  <BarChart data={topBrokers} layout="vertical" margin={{ top:4, right:10, left:4, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                    <XAxis type="number" tick={{ fill:'#999', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={{ stroke:'#333' }} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fill:'#ccc', fontSize:11, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ background:'rgba(0,0,0,0.92)', border:'1px solid #333', borderRadius:10, padding:'10px 14px', fontFamily:"'DM Sans',sans-serif" }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#fff', marginBottom:4 }}>{d.name}</div>
                          <div style={{ fontSize:12, color:'#ccc' }}>Revenue: <strong style={{ color:'#f0a500' }}>${d.revenue.toLocaleString()}</strong></div>
                          <div style={{ fontSize:11, color:'#999' }}>{d.loads} load{d.loads !== 1 ? 's' : ''}</div>
                        </div>
                      )
                    }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#f0a500" radius={[0,4,4,0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height:250, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:13 }}>No delivered loads yet</div>
              )}
            </div>
          </div>
        </div>
      </>)}

      {/* ── OPERATIONS TAB ────────────────────────────────────── */}
      {aiTab === 'operations' && (<>
        {/* Ops KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
          <StatCard label="Total Loads" value={String(loads.length)} change={`${deliveredLoads.length} delivered`} color="var(--accent)" changeType="neutral" />
          <StatCard label="Miles Driven" value={totalMiles >= 1000 ? `${(totalMiles/1000).toFixed(1)}K` : String(totalMiles)} change={`$${avgRPM}/mi`} color="var(--accent2)" changeType="neutral" />
          <StatCard label="Fleet Util." value={`${utilization}%`} change={`${truckCount} trucks`} color={utilization>=80?'var(--success)':'var(--accent)'} changeType={utilization>=80?'up':'down'} />
          <StatCard label="Deadhead" value={`${deadheadPct}%`} change={`${totalDeadhead.toLocaleString()} mi empty`} color={deadheadPct<10?'var(--success)':'var(--danger)'} changeType={deadheadPct<10?'up':'down'} />
          <StatCard label="Avg Load/Mo" value={String(Math.round(loads.length/Math.max(revenueByMonth.filter(m=>m.loads>0).length,1)))} change="loads per month" color="var(--accent3)" changeType="neutral" />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16 }}>
          {/* Top Lanes with AI scoring */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Route} /> Lane Intelligence</div>
              <span style={{ fontSize:10, color:'var(--muted)' }}>AI-ranked by profitability</span>
            </div>
            <div>
              {topLanes.length === 0 && <div style={{ fontSize:12, color:'var(--muted)', padding:20, textAlign:'center' }}>No delivered loads yet</div>}
              {topLanes.map((l, i) => {
                const rpm = l.miles > 0 ? (l.revenue/l.miles) : 0
                const laneScore = Math.min(99, Math.round(40 + rpm*12 + l.loads*3))
                return (
                  <div key={l.lane} style={{ ...S.row, gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background: i===0?'rgba(240,165,0,0.1)':'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color: i===0?'var(--accent)':'var(--muted)' }}>#{i+1}</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{l.lane}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{l.loads} loads · {l.miles.toLocaleString()} mi · ${rpm.toFixed(2)}/mi</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontWeight:700, color:'var(--accent)', fontSize:14 }}>${l.revenue.toLocaleString()}</div>
                      <div style={{ fontSize:10, color: laneScore>=80?'var(--success)':'var(--accent)', fontWeight:700 }}>Score: {laneScore}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Miles per Month + Load Pipeline */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Miles trend — Recharts */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Navigation} /> Miles Trend</div>
              </div>
              <div style={{ padding:'12px 8px 4px' }}>
                {revenueByMonth.some(m => m.miles > 0) ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={revenueByMonth} margin={{ top:4, right:4, left:0, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill:'#999', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div style={{ background:'rgba(0,0,0,0.92)', border:'1px solid #333', borderRadius:10, padding:'8px 12px', fontFamily:"'DM Sans',sans-serif" }}>
                            <div style={{ fontSize:11, color:'#999', marginBottom:4 }}>{label}</div>
                            <div style={{ fontSize:12, color:'#fff', fontWeight:700 }}>{Number(payload[0].value).toLocaleString()} mi</div>
                          </div>
                        )
                      }} />
                      <Bar dataKey="miles" name="Miles" fill="#4d8ef0" radius={[4,4,0,0]} animationDuration={800} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height:120, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:12 }}>No miles data yet</div>
                )}
              </div>
            </div>

            {/* Load Pipeline */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Activity} /> Load Pipeline</div>
              </div>
              <div style={{ padding:14 }}>
                {[
                  { label:'Booked', val:loads.filter(l => l.status === 'Booked').length, color:'var(--accent2)' },
                  { label:'In Transit', val:loads.filter(l => l.status === 'In Transit' || l.status === 'Loaded').length, color:'var(--success)' },
                  { label:'Delivered', val:deliveredLoads.length, color:'var(--accent)' },
                  { label:'Invoiced', val:invoices.filter(i=>i.status==='Paid').length + '/' + invoices.length, color:'var(--accent3)' },
                ].map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:6, height:6, borderRadius:3, background:s.color }} />
                      <span style={{ fontSize:12 }}>{s.label}</span>
                    </div>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:s.color }}>{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>)}
    </div>
  )
}
