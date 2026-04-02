import React, { useState, useMemo } from 'react'
import {
  DollarSign, Package, Truck, BarChart2, MapPin, Scale, User, Building2,
  Bot, AlertTriangle, TrendingUp, TrendingDown, Fuel, Zap, Target, Shield, Clock,
  ChevronUp, ChevronDown, Calendar
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
  AreaChart, Area,
  ScatterChart, Scatter, CartesianGrid, ZAxis, Cell
} from 'recharts'
import { useCarrier } from '../../context/CarrierContext'
import { Ic } from './shared'

// ── Custom dark tooltip for all Recharts ────────────────────────────────────
const DarkTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#1a1a1a', border:'1px solid #333', borderRadius:8, padding:'10px 14px', fontFamily:"'DM Sans',sans-serif", fontSize:12, color:'#fff', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' }}>
      {label && <div style={{ fontSize:11, color:'#888', marginBottom:6, fontWeight:600 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'2px 0' }}>
          <div style={{ width:8, height:8, borderRadius:2, background:p.color || p.fill }} />
          <span style={{ color:'#aaa' }}>{p.name}:</span>
          <span style={{ fontWeight:700, color:'#fff' }}>{formatter ? formatter(p.value) : (typeof p.value === 'number' ? '$' + p.value.toLocaleString() : p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Q PROFIT ENGINE ──────────────────────────────────────────────────────────
export const PIQ_TABS = ['Q Engine', 'Overview', 'Per Load', 'By Driver', 'By Broker']

// Helpers: date filters
const isToday = (dateStr) => {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d)) return false
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}
const isThisWeek = (dateStr) => {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d)) return false
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0,0,0,0)
  return d >= startOfWeek && d <= now
}
const getLoadDate = (l) => l.delivery_date || l.pickup_date || l.pickupDate || l.created_at

// Estimate transit days from miles
const estTransitDays = (miles) => Math.max(1, Math.ceil((parseFloat(miles) || 0) / 500))

export function ProfitIQTab() {
  const { loads, invoices, expenses, totalRevenue, totalExpenses, drivers: ctxDrivers, vehicles, fuelCostPerMile } = useCarrier()
  const [tab, setTab] = useState('Q Engine')
  const [marginTarget, setMarginTarget] = useState(30)

  const fuelRate = fuelCostPerMile || 0.22

  // Helper: get per-driver pay
  const calcDriverPay = (driverName, gross, miles) => {
    const driverRec = (ctxDrivers || []).find(d => (d.full_name || d.name) === driverName)
    const model = driverRec?.pay_model || 'percent'
    const rate = parseFloat(driverRec?.pay_rate) || 50
    if (model === 'permile') return Math.round(miles * rate)
    if (model === 'flat') return Math.round(rate)
    return Math.round(gross * (rate / 100))
  }

  // ── computed base data ──────────────────────────────────────────────────────
  const completedLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const activeLoads    = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))

  // Per-load profit: gross minus per-driver pay and real fuel cost
  const loadProfit = completedLoads.map(l => {
    const gross      = l.gross || l.rate || 0
    const miles      = parseFloat(l.miles) || 0
    const driverPay  = calcDriverPay(l.driver, gross, miles)
    const fuelCost   = Math.round(miles * fuelRate)
    const net        = gross - driverPay - fuelCost
    const margin     = gross > 0 ? ((net / gross) * 100).toFixed(1) : '0.0'
    const rpm        = parseFloat(l.rate) || (miles > 0 ? gross / miles : 0)
    const profitPerMile = miles > 0 ? (net / miles) : 0
    const days       = estTransitDays(miles)
    const profitPerDay = net / days
    return { ...l, driverPay, fuelCost, net, margin: parseFloat(margin), rpm, profitPerMile, profitPerDay, days }
  }).sort((a,b) => b.net - a.net)

  // Time-filtered profit: today + this week
  const todayProfit = useMemo(() => {
    return loadProfit.filter(l => isToday(getLoadDate(l))).reduce((s,l) => s + l.net, 0)
  }, [loadProfit])
  const weekProfit = useMemo(() => {
    return loadProfit.filter(l => isThisWeek(getLoadDate(l))).reduce((s,l) => s + l.net, 0)
  }, [loadProfit])
  const todayRevenue = useMemo(() => {
    return loadProfit.filter(l => isToday(getLoadDate(l))).reduce((s,l) => s + l.gross, 0)
  }, [loadProfit])
  const weekRevenue = useMemo(() => {
    return loadProfit.filter(l => isThisWeek(getLoadDate(l))).reduce((s,l) => s + l.gross, 0)
  }, [loadProfit])

  // Expense breakdown from real context
  const expCats = ['Fuel','Driver Pay','Insurance','Maintenance','Tolls','Lumper','Permits','Other']
  const catColors = { Fuel:'var(--warning)', 'Driver Pay':'var(--accent)', Insurance:'var(--accent2)', Maintenance:'var(--danger)', Tolls:'var(--accent3)', Lumper:'var(--success)', Permits:'var(--muted)', Other:'var(--muted)' }
  const realFuel = expenses.filter(e => e.cat === 'Fuel').reduce((s,e) => s + e.amount, 0)
  const estimatedDriverPay = completedLoads.reduce((s,l) => s + calcDriverPay(l.driver, l.gross||0, parseFloat(l.miles)||0), 0)
  const otherExpenses = expenses.filter(e => e.cat !== 'Fuel')
  const otherTotal = otherExpenses.reduce((s,e) => s + e.amount, 0)
  const totalForBreakdown = realFuel + estimatedDriverPay + otherTotal || 1
  const expBreakdown = [
    { label:'Driver Pay',  amount: estimatedDriverPay, color:'var(--accent)' },
    { label:'Fuel',        amount: realFuel, color:'var(--warning)' },
    ...['Maintenance','Insurance','Tolls','Lumper','Permits'].map(cat => ({
      label: cat,
      amount: expenses.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0),
      color: catColors[cat] || 'var(--muted)',
    })).filter(x => x.amount > 0),
  ].map(x => ({ ...x, pct: Math.round((x.amount/totalForBreakdown)*100) }))

  // Per driver
  const drivers = [...new Set(completedLoads.map(l => l.driver).filter(Boolean))]
  const driverStats = drivers.map(name => {
    const dLoads  = loadProfit.filter(l => l.driver === name)
    const gross   = dLoads.reduce((s,l) => s + l.gross, 0)
    const net     = dLoads.reduce((s,l) => s + l.net, 0)
    const miles   = dLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
    const avgRPM  = miles > 0 ? (gross/miles).toFixed(2) : '—'
    const margin  = gross > 0 ? ((net/gross)*100).toFixed(1) : '0.0'
    return { name, loads: dLoads.length, gross, net, miles, avgRPM, margin: parseFloat(margin) }
  }).sort((a,b) => b.net - a.net)

  // Per broker
  const brokers = [...new Set(completedLoads.map(l => l.broker).filter(Boolean))]
  const brokerStats = brokers.map(name => {
    const bLoads   = loadProfit.filter(l => l.broker === name)
    const gross    = bLoads.reduce((s,l) => s + l.gross, 0)
    const net      = bLoads.reduce((s,l) => s + l.net, 0)
    const miles    = bLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
    const avgRPM   = miles > 0 ? (gross/miles).toFixed(2) : '—'
    const avgLoad  = bLoads.length > 0 ? Math.round(gross/bLoads.length) : 0
    return { name, loads: bLoads.length, gross, net, avgRPM, avgLoad, margin: gross>0?((net/gross)*100).toFixed(1):'0.0' }
  }).sort((a,b) => b.gross - a.gross)

  // Historical months for chart (generate from current month going back 6)
  const histMonths  = (() => {
    const m = []; const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      m.push(d.toLocaleDateString('en-US', { month:'short' }))
    }
    return m
  })()
  const histRev     = histMonths.map((_, i) => i < 5 ? 0 : totalRevenue)
  const histExp     = histMonths.map((_, i) => i < 5 ? 0 : totalExpenses)
  // Fill earlier months from loads data
  ;(() => {
    const now = new Date()
    loads.forEach(l => {
      const dateStr = l.pickup_date || l.pickupDate || l.delivery_date || l.created_at
      if (!dateStr) return
      const d = new Date(dateStr)
      if (isNaN(d)) return
      const diffMonths = (now.getFullYear()-d.getFullYear())*12 + now.getMonth()-d.getMonth()
      const idx = 5 - diffMonths
      if (idx >= 0 && idx < 5) histRev[idx] += Number(l.gross || l.rate || l.gross_pay || 0)
    })
    expenses.forEach(e => {
      const d = new Date(e.date)
      if (isNaN(d)) return
      const diffMonths = (now.getFullYear()-d.getFullYear())*12 + now.getMonth()-d.getMonth()
      const idx = 5 - diffMonths
      if (idx >= 0 && idx < 5) histExp[idx] += Number(e.amount || 0)
    })
  })()
  const histNet     = histRev.map((r,i) => r - histExp[i])
  const maxBar      = Math.max(...histRev, 1)

  // ── Recharts data: P&L bar chart ─────────────────────────────────────────
  const plBarData = histMonths.map((m, i) => ({
    month: m, Revenue: histRev[i], Expenses: histExp[i], 'Net Profit': histNet[i]
  }))

  // ── Recharts data: 8-week revenue trend ──────────────────────────────────
  const weeklyRevData = useMemo(() => {
    const weeks = []
    const now = new Date()
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - (w * 7) - now.getDay())
      weekStart.setHours(0,0,0,0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23,59,59,999)
      const weekLabel = weekStart.toLocaleDateString('en-US', { month:'short', day:'numeric' })
      const rev = loads.reduce((s, l) => {
        const d = new Date(getLoadDate(l))
        if (isNaN(d)) return s
        return (d >= weekStart && d <= weekEnd) ? s + Number(l.gross || l.rate || l.gross_pay || 0) : s
      }, 0)
      weeks.push({ week: weekLabel, Revenue: Math.round(rev) })
    }
    return weeks
  }, [loads])

  // ── Recharts data: load profitability scatter ────────────────────────────
  const scatterData = useMemo(() => {
    return loadProfit.map(l => ({
      miles: parseFloat(l.miles) || 0,
      profitPerMile: parseFloat(l.profitPerMile.toFixed(2)),
      loadId: l.loadId,
      origin: l.origin ? l.origin.split(',')[0] : '?',
      dest: l.dest ? l.dest.split(',')[0] : '?',
      rpm: parseFloat(l.rpm || 0).toFixed(2),
      net: l.net,
      tier: l.profitPerMile >= 0.80 ? 'good' : l.profitPerMile >= 0.40 ? 'fair' : 'bad'
    }))
  }, [loadProfit])

  const netProfit   = totalRevenue - totalExpenses
  const margin      = totalRevenue > 0 ? ((netProfit/totalRevenue)*100).toFixed(1) : '0.0'
  const totalMiles  = completedLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
  const cpm         = totalMiles > 0 ? (totalExpenses/totalMiles).toFixed(2) : '—'
  const truckCt     = Math.max((ctxDrivers || []).length || 1, 1)
  const revPerTruck = Math.round(totalRevenue / truckCt)
  const breakEven   = Math.round(totalExpenses * 0.8) || 10000

  const statBg  = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', textAlign:'center' }
  const valStyle= (color, size=26) => ({ fontFamily:"'Bebas Neue',sans-serif", fontSize:size, color, lineHeight:1.1 })

  // ── Q PROFIT ENGINE COMPUTATIONS ────────────────────────────────────────────
  const MARGIN_TARGET = marginTarget
  const qData = useMemo(() => {
    const truckCount = Math.max((ctxDrivers || []).length, 1)
    const vehicleCount = Math.max((vehicles || []).length, truckCount)
    const fuelRate = fuelCostPerMile || 0.22
    const totalMi = completedLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)

    // Per-truck profit tracking
    const truckMap = {}
    completedLoads.forEach(l => {
      const truck = l.vehicle || l.truck || l.driver || 'Unassigned'
      if (!truckMap[truck]) truckMap[truck] = { name:truck, gross:0, net:0, miles:0, loads:0, fuelCost:0, driverPay:0 }
      const gross = l.gross || l.rate || 0
      const miles = parseFloat(l.miles) || 0
      const driverPay = calcDriverPay(l.driver, gross, miles)
      const fuel = Math.round(miles * fuelRate)
      truckMap[truck].gross += gross
      truckMap[truck].net += (gross - driverPay - fuel)
      truckMap[truck].miles += miles
      truckMap[truck].loads++
      truckMap[truck].fuelCost += fuel
      truckMap[truck].driverPay += driverPay
    })
    // Per-truck daily/weekly breakdown
    const truckTodayMap = {}
    const truckWeekMap = {}
    completedLoads.forEach(l => {
      const truck = l.vehicle || l.truck || l.driver || 'Unassigned'
      const lDate = getLoadDate(l)
      const gross = l.gross || l.rate || 0
      const miles = parseFloat(l.miles) || 0
      const driverPay = calcDriverPay(l.driver, gross, miles)
      const fuel = Math.round(miles * fuelRate)
      const net = gross - driverPay - fuel
      if (isToday(lDate)) {
        if (!truckTodayMap[truck]) truckTodayMap[truck] = 0
        truckTodayMap[truck] += net
      }
      if (isThisWeek(lDate)) {
        if (!truckWeekMap[truck]) truckWeekMap[truck] = 0
        truckWeekMap[truck] += net
      }
    })
    // Idle time: drivers with no active loads
    const idleDrivers = (ctxDrivers || []).filter(d => {
      const name = d.full_name || d.name
      return !activeLoads.some(l => l.driver === name)
    })

    const truckStats = Object.values(truckMap).sort((a,b) => b.net - a.net).map(t => ({
      ...t,
      margin: t.gross > 0 ? ((t.net / t.gross) * 100) : 0,
      rpm: t.miles > 0 ? (t.gross / t.miles) : 0,
      costPerMile: t.miles > 0 ? ((t.fuelCost + t.driverPay) / t.miles) : 0,
      profitToday: truckTodayMap[t.name] || 0,
      profitWeek: truckWeekMap[t.name] || 0,
      avgProfitPerLoad: t.loads > 0 ? Math.round(t.net / t.loads) : 0,
      isIdle: idleDrivers.some(d => (d.full_name || d.name) === t.name),
    }))

    // Fuel intelligence
    const totalFuelCost = completedLoads.reduce((s,l) => s + Math.round((parseFloat(l.miles)||0) * fuelRate), 0)
    const avgFuelPerLoad = completedLoads.length > 0 ? Math.round(totalFuelCost / completedLoads.length) : 0
    const fuelAsPercent = totalRevenue > 0 ? ((totalFuelCost / totalRevenue) * 100) : 0
    const estMPG = 6.5 // avg semi-truck
    const gallonsUsed = totalMi / estMPG
    const dieselPricePerGal = fuelRate * estMPG // derive from per-mile rate
    const fuelSavings7pct = Math.round(totalFuelCost * 0.07) // 7% fuel savings potential

    // Invoice/factoring intelligence
    const unpaidInvoices = (invoices || []).filter(i => i.status === 'Unpaid')
    const unpaidTotal = unpaidInvoices.reduce((s,i) => s + (i.amount || 0), 0)
    const paidInvoices = (invoices || []).filter(i => i.status === 'Paid')
    const overdueInvoices = unpaidInvoices.filter(i => {
      if (!i.dueDate) return false
      return new Date(i.dueDate) < new Date()
    })
    const avgDaysToPayment = paidInvoices.length > 0 ? Math.round(paidInvoices.reduce((s,i) => {
      const created = new Date(i.created_at || i.date)
      const paid = new Date(i.paid_at || i.updated_at || i.date)
      return s + Math.max(0, (paid - created) / 86400000)
    }, 0) / paidInvoices.length) : 30
    const factoringCost = Math.round(unpaidTotal * 0.025) // 2.5% factor fee
    const factoringNet = unpaidTotal - factoringCost

    // Profit alerts
    const alerts = []
    if (margin < 20) alerts.push({ severity:'critical', icon: AlertTriangle, color:'var(--danger)', text:`Margin at ${margin}% — below 20% threshold. Review expenses and rate acceptance criteria.` })
    else if (margin < MARGIN_TARGET) alerts.push({ severity:'warning', icon: Target, color:'var(--warning)', text:`Margin at ${margin}% — ${(MARGIN_TARGET - parseFloat(margin)).toFixed(1)}% below ${MARGIN_TARGET}% target. Tighten rate acceptance.` })
    if (unpaidTotal > totalRevenue * 0.4) alerts.push({ severity:'warning', icon: Clock, color:'var(--accent)', text:`$${unpaidTotal.toLocaleString()} in unpaid invoices (${(unpaidTotal/Math.max(totalRevenue,1)*100).toFixed(0)}% of revenue). Cash flow risk.` })
    if (overdueInvoices.length > 0) alerts.push({ severity:'critical', icon: AlertTriangle, color:'var(--danger)', text:`${overdueInvoices.length} overdue invoice${overdueInvoices.length!==1?'s':''} — $${overdueInvoices.reduce((s,i)=>s+(i.amount||0),0).toLocaleString()} past due. Chase immediately.` })
    if (fuelAsPercent > 35) alerts.push({ severity:'warning', icon: Fuel, color:'var(--warning)', text:`Fuel is ${fuelAsPercent.toFixed(1)}% of revenue — above 35% threshold. Route optimization needed.` })
    const worstTruck = truckStats[truckStats.length - 1]
    if (worstTruck && worstTruck.margin < 15 && worstTruck.loads >= 2) alerts.push({ severity:'warning', icon: Truck, color:'var(--warning)', text:`${worstTruck.name} running at ${worstTruck.margin.toFixed(1)}% margin — underperforming. Review lane assignments.` })
    // Positive signals
    const bestTruck = truckStats[0]
    if (bestTruck && bestTruck.margin >= 35) alerts.push({ severity:'positive', icon: TrendingUp, color:'var(--success)', text:`${bestTruck.name} leading at ${bestTruck.margin.toFixed(1)}% margin — $${bestTruck.net.toLocaleString()} net profit.` })
    if (margin >= MARGIN_TARGET) alerts.push({ severity:'positive', icon: Shield, color:'var(--success)', text:`Margin at ${margin}% — above ${MARGIN_TARGET}% target. Profit engine performing.` })

    // Q Insight (most actionable)
    let qInsight = ''
    if (margin < 20) qInsight = `Profit below threshold. ${unpaidTotal > 3000 ? `Factor $${unpaidTotal.toLocaleString()} in invoices for immediate cash.` : 'Cut non-essential expenses and negotiate higher rates.'}`
    else if (margin < MARGIN_TARGET) qInsight = `Operating within range but below target. ${fuelAsPercent > 30 ? `Fuel optimization could save ~$${fuelSavings7pct.toLocaleString()}/mo.` : `Focus on higher-RPM lanes to close the gap.`}`
    else qInsight = `Profit engine online. ${bestTruck ? `Replicate ${bestTruck.name}'s lane strategy across fleet.` : 'Maintain current rate discipline.'} ${unpaidTotal > 0 ? `$${unpaidTotal.toLocaleString()} in receivables outstanding.` : ''}`

    // Cash flow projection (next 30 days)
    const projectedIncoming = unpaidTotal + activeLoads.reduce((s,l) => s + (l.gross || l.rate || 0), 0)
    const monthlyBurn = totalExpenses || (completedLoads.length > 0 ? completedLoads.reduce((s,l) => s + calcDriverPay(l.driver, l.gross||0, parseFloat(l.miles)||0) + Math.round((parseFloat(l.miles)||0) * fuelRate), 0) : 5000)
    const cashRunway = monthlyBurn > 0 ? Math.round((projectedIncoming / monthlyBurn) * 30) : 999

    return {
      truckCount, truckStats, totalFuelCost, avgFuelPerLoad, fuelAsPercent, fuelSavings7pct,
      gallonsUsed, dieselPricePerGal, unpaidInvoices, unpaidTotal, paidInvoices, overdueInvoices,
      avgDaysToPayment, factoringCost, factoringNet, alerts, qInsight, margin: parseFloat(margin),
      projectedIncoming, monthlyBurn, cashRunway, totalMi, fuelRate, idleDrivers
    }
  }, [loads, invoices, expenses, ctxDrivers, vehicles, fuelCostPerMile, totalRevenue, totalExpenses, completedLoads, activeLoads, margin, marginTarget])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'auto' }}>

      {/* Sub-tab bar */}
      <div style={{ flexShrink:0, background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 20px', display:'flex', alignItems:'center', gap:2 }}>
        {PIQ_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'11px 18px', border:'none', borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: tab===t ? 'var(--accent)' : 'var(--muted)', fontSize:13, fontWeight: tab===t ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1, display:'flex', alignItems:'center', gap:5 }}>
            {t === 'Q Engine' && <Bot size={13} />}
            {t}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ fontSize:11, color:'var(--muted)', padding:'0 8px' }}>
            {completedLoads.length} completed · ${totalRevenue.toLocaleString()} MTD
          </div>
          <div style={{ padding:'3px 8px', borderRadius:6, fontSize:10, fontWeight:800, background: qData.margin >= MARGIN_TARGET ? 'rgba(34,197,94,0.12)' : qData.margin >= 20 ? 'rgba(240,165,0,0.12)' : 'rgba(239,68,68,0.12)', color: qData.margin >= MARGIN_TARGET ? 'var(--success)' : qData.margin >= 20 ? 'var(--warning)' : 'var(--danger)' }}>
            {qData.margin.toFixed(1)}% MARGIN
          </div>
        </div>
      </div>

      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

        {/* ── Q ENGINE ── */}
        {tab === 'Q Engine' && (<>
          {/* Q Financial Insight Card */}
          <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(34,197,94,0.04))', border:'1px solid rgba(240,165,0,0.2)', borderRadius:14, padding:'18px 22px', display:'flex', gap:16, alignItems:'flex-start' }}>
            <div style={{ width:40, height:40, borderRadius:10, background:'rgba(240,165,0,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Bot size={22} color="var(--accent)" />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, letterSpacing:2 }}>Q <span style={{ color:'var(--accent)' }}>PROFIT ANALYSIS</span></span>
                <span style={{ fontSize:9, padding:'2px 7px', background:'rgba(34,197,94,0.12)', color:'var(--success)', borderRadius:6, fontWeight:800 }}>LIVE</span>
              </div>
              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7 }}>{qData.qInsight}</div>
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2 }}>NET PROFIT MTD</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)', lineHeight:1 }}>${netProfit.toLocaleString()}</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{qData.margin.toFixed(1)}% margin · target {MARGIN_TARGET}%</div>
            </div>
          </div>

          {/* Q Profit Alerts */}
          {qData.alerts.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {qData.alerts.map((a, i) => (
                <div key={i} style={{ padding:'10px 16px', background: a.color + '08', border:`1px solid ${a.color}25`, borderRadius:10, display:'flex', alignItems:'center', gap:10 }}>
                  <a.icon size={16} color={a.color} style={{ flexShrink:0 }} />
                  <span style={{ fontSize:12, color:'var(--text)', flex:1 }}>{a.text}</span>
                  <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:5, background: a.color + '15', color: a.color, flexShrink:0 }}>
                    {a.severity === 'critical' ? 'CRITICAL' : a.severity === 'positive' ? 'STRONG' : 'WATCH'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Q Profit Timeline — Today / Week / MTD */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {[
              { label:'Q PROFIT TODAY', value:'$'+todayProfit.toLocaleString(), rev:'$'+todayRevenue.toLocaleString()+' rev', color: todayProfit>=0?'var(--success)':'var(--danger)', icon: Calendar },
              { label:'Q PROFIT THIS WEEK', value:'$'+weekProfit.toLocaleString(), rev:'$'+weekRevenue.toLocaleString()+' rev', color: weekProfit>=0?'var(--success)':'var(--danger)', icon: Calendar },
              { label:'Q PROFIT MTD', value:'$'+netProfit.toLocaleString(), rev:'$'+totalRevenue.toLocaleString()+' rev', color: netProfit>=0?'var(--success)':'var(--danger)', icon: BarChart2, big:true },
            ].map(s => (
              <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 18px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:38, height:38, borderRadius:10, background: s.color+'12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <s.icon size={18} color={s.color} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:1, fontWeight:600, marginBottom:3 }}>{s.label}</div>
                  <div style={valStyle(s.color, s.big?30:26)}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{s.rev}</div>
                </div>
              </div>
            ))}
          </div>

          {/* KPI Grid — 6 cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12 }}>
            {[
              { label:'Q MARGIN %', value:qData.margin.toFixed(1)+'%', color: qData.margin>=MARGIN_TARGET?'var(--success)':qData.margin>=20?'var(--warning)':'var(--danger)', sub:`Target: ${MARGIN_TARGET}%` },
              { label:'REVENUE vs PROFIT', value: totalRevenue > 0 ? Math.round(netProfit/totalRevenue*100)+'%' : '—', color:'var(--accent)', sub:`$${totalRevenue.toLocaleString()} → $${netProfit.toLocaleString()}` },
              { label:'FUEL COST IMPACT', value:'$'+qData.totalFuelCost.toLocaleString(), color:'var(--warning)', sub:`${qData.fuelAsPercent.toFixed(1)}% of revenue` },
              { label:'PROFIT / TRUCK', value:'$'+Math.round(netProfit/qData.truckCount).toLocaleString(), color:'var(--accent2)', sub:`${qData.truckCount} truck${qData.truckCount!==1?'s':''}` },
              { label:'COST PER MILE', value: cpm==='—'?'—':'$'+cpm, color:'var(--accent3)', sub:`${totalMiles.toLocaleString()} total mi` },
              { label:'UNPAID AR', value:'$'+qData.unpaidTotal.toLocaleString(), color:'var(--accent)', sub:`${qData.unpaidInvoices.length} invoice${qData.unpaidInvoices.length!==1?'s':''}` },
            ].map(s => (
              <div key={s.label} style={statBg}>
                <div style={{ fontSize:9, color:'var(--muted)', marginBottom:4, letterSpacing:1, fontWeight:600 }}>{s.label}</div>
                <div style={valStyle(s.color, 24)}>{s.value}</div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Margin Target Tracker */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Target size={14} color="var(--accent)" />
                <span style={{ fontSize:13, fontWeight:700 }}>Margin Target Tracker</span>
                <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400 }}>
                  Gap: {qData.margin >= MARGIN_TARGET ? '+' : ''}{(qData.margin - MARGIN_TARGET).toFixed(1)}%
                </span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color: qData.margin>=MARGIN_TARGET?'var(--success)':qData.margin>=20?'var(--warning)':'var(--danger)' }}>
                  {qData.margin.toFixed(1)}%
                </span>
                <span style={{ fontSize:12, color:'var(--muted)' }}>/</span>
                {/* Adjustable target */}
                <div style={{ display:'flex', alignItems:'center', gap:2, background:'var(--surface2)', borderRadius:8, padding:'2px 6px', border:'1px solid var(--border)' }}>
                  <button onClick={() => setMarginTarget(t => Math.max(5, t - 5))}
                    style={{ border:'none', background:'transparent', cursor:'pointer', padding:'2px', display:'flex', color:'var(--muted)' }}>
                    <ChevronDown size={14} />
                  </button>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)', minWidth:28, textAlign:'center' }}>{MARGIN_TARGET}%</span>
                  <button onClick={() => setMarginTarget(t => Math.min(60, t + 5))}
                    style={{ border:'none', background:'transparent', cursor:'pointer', padding:'2px', display:'flex', color:'var(--muted)' }}>
                    <ChevronUp size={14} />
                  </button>
                </div>
                <span style={{ fontSize:10, color:'var(--muted)' }}>target</span>
              </div>
            </div>
            {/* Radial Margin Gauge */}
            {(() => {
              const gaugeVal = Math.min(qData.margin, 60)
              const gaugeColor = qData.margin >= MARGIN_TARGET ? '#22c55e' : qData.margin >= 20 ? '#f0a500' : '#ef4444'
              const radialData = [{ name: 'Margin', value: gaugeVal, fill: gaugeColor }]
              return (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                  <ResponsiveContainer width="100%" height={160}>
                    <RadialBarChart
                      cx="50%" cy="50%"
                      innerRadius="70%" outerRadius="90%"
                      startAngle={210} endAngle={-30}
                      data={radialData}
                      barSize={12}
                    >
                      <PolarAngleAxis type="number" domain={[0, 60]} tick={false} angleAxisId={0} />
                      <RadialBar
                        angleAxisId={0}
                        dataKey="value"
                        cornerRadius={6}
                        background={{ fill: '#333' }}
                        animationDuration={800}
                      />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center' }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color: gaugeColor, lineHeight:1 }}>{qData.margin.toFixed(1)}%</div>
                    <div style={{ fontSize:9, color:'#888', marginTop:2 }}>of {MARGIN_TARGET}% target</div>
                  </div>
                </div>
              )
            })()}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* Profit Per Truck */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
                <Truck size={14} color="var(--accent2)" />
                <span style={{ fontSize:13, fontWeight:700 }}>Profit Per Truck</span>
                <span style={{ marginLeft:'auto', fontSize:10, color:'var(--muted)' }}>{qData.truckStats.length} unit{qData.truckStats.length!==1?'s':''}</span>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
                {qData.truckStats.length === 0
                  ? <div style={{ textAlign:'center', padding:20, color:'var(--muted)', fontSize:12 }}>No completed loads yet</div>
                  : qData.truckStats.map((t, i) => {
                    const mc = t.margin >= 35 ? 'var(--success)' : t.margin >= 25 ? 'var(--accent)' : t.margin >= 15 ? 'var(--warning)' : 'var(--danger)'
                    return (
                      <div key={t.name} style={{ padding:'12px 14px', background: i===0 ? 'rgba(34,197,94,0.04)' : 'transparent', border:`1px solid ${i===0 ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`, borderRadius:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            {i === 0 && <span style={{ fontSize:8, fontWeight:800, color:'var(--success)', letterSpacing:1 }}>TOP</span>}
                            <span style={{ fontSize:12, fontWeight:700 }}>{t.name}</span>
                            {t.isIdle && <span style={{ fontSize:8, fontWeight:800, padding:'1px 5px', borderRadius:4, background:'rgba(239,68,68,0.12)', color:'var(--danger)' }}>IDLE</span>}
                          </div>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--success)' }}>${t.net.toLocaleString()}</span>
                        </div>
                        {/* Daily / Weekly / Avg per Load */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:6 }}>
                          <div style={{ background:'var(--surface2)', borderRadius:6, padding:'5px 8px', textAlign:'center' }}>
                            <div style={{ fontSize:7, color:'var(--muted)', letterSpacing:0.5 }}>TODAY</div>
                            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color: t.profitToday > 0 ? 'var(--success)' : 'var(--muted)' }}>${t.profitToday.toLocaleString()}</div>
                          </div>
                          <div style={{ background:'var(--surface2)', borderRadius:6, padding:'5px 8px', textAlign:'center' }}>
                            <div style={{ fontSize:7, color:'var(--muted)', letterSpacing:0.5 }}>THIS WEEK</div>
                            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color: t.profitWeek > 0 ? 'var(--success)' : 'var(--muted)' }}>${t.profitWeek.toLocaleString()}</div>
                          </div>
                          <div style={{ background:'var(--surface2)', borderRadius:6, padding:'5px 8px', textAlign:'center' }}>
                            <div style={{ fontSize:7, color:'var(--muted)', letterSpacing:0.5 }}>AVG/LOAD</div>
                            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color:'var(--accent)' }}>${t.avgProfitPerLoad.toLocaleString()}</div>
                          </div>
                          <div style={{ background:'var(--surface2)', borderRadius:6, padding:'5px 8px', textAlign:'center' }}>
                            <div style={{ fontSize:7, color:'var(--muted)', letterSpacing:0.5 }}>MARGIN</div>
                            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color: mc }}>{t.margin.toFixed(1)}%</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:12, fontSize:10 }}>
                          <span style={{ color:'var(--muted)' }}>{t.loads} loads · {t.miles.toLocaleString()} mi</span>
                          <span style={{ color:'var(--muted)' }}>RPM: <span style={{ fontWeight:700 }}>${t.rpm.toFixed(2)}</span></span>
                          <span style={{ color:'var(--muted)' }}>CPM: <span style={{ fontWeight:700 }}>${t.costPerMile.toFixed(2)}</span></span>
                        </div>
                        {/* Q Insight per truck */}
                        {t.isIdle && (
                          <div style={{ marginTop:6, fontSize:10, color:'var(--warning)', fontStyle:'italic' }}>
                            Q: Truck idle — needs better load selection. Idle time eroding daily profit.
                          </div>
                        )}
                        {!t.isIdle && t.margin < 15 && t.loads >= 2 && (
                          <div style={{ marginTop:6, fontSize:10, color:'var(--danger)', fontStyle:'italic' }}>
                            Q: Underperforming at {t.margin.toFixed(1)}% margin. Review lane assignments.
                          </div>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            </div>

            {/* Fuel Intelligence */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
                <Fuel size={14} color="var(--warning)" />
                <span style={{ fontSize:13, fontWeight:700 }}>Fuel Intelligence</span>
                <span style={{ marginLeft:'auto', fontSize:10, padding:'2px 6px', background:'rgba(240,165,0,0.1)', color:'var(--accent)', borderRadius:5, fontWeight:700 }}>${(fuelCostPerMile||0.22).toFixed(2)}/mi</span>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                  {[
                    { label:'TOTAL FUEL COST', value:'$'+qData.totalFuelCost.toLocaleString(), color:'var(--warning)' },
                    { label:'AVG PER LOAD', value:'$'+qData.avgFuelPerLoad.toLocaleString(), color:'var(--accent)' },
                    { label:'% OF REVENUE', value:qData.fuelAsPercent.toFixed(1)+'%', color: qData.fuelAsPercent > 35 ? 'var(--danger)' : 'var(--accent2)' },
                    { label:'EST GALLONS', value:Math.round(qData.gallonsUsed).toLocaleString(), color:'var(--muted)' },
                  ].map(s => (
                    <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                      <div style={{ fontSize:8, color:'var(--muted)', letterSpacing:1, marginBottom:3 }}>{s.label}</div>
                      <div style={valStyle(s.color, 18)}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {/* Fuel savings potential */}
                <div style={{ padding:'10px 14px', background:'rgba(34,197,94,0.04)', border:'1px solid rgba(34,197,94,0.15)', borderRadius:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    <Zap size={12} color="var(--success)" />
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--success)' }}>SAVINGS POTENTIAL</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.5 }}>
                    Route optimization could save ~<strong>${qData.fuelSavings7pct.toLocaleString()}/mo</strong> (7% reduction).
                    {qData.totalMi > 0 && ` Running $${(qData.fuelRate).toFixed(2)}/mi across ${qData.totalMi.toLocaleString()} miles.`}
                  </div>
                </div>
                {/* Fuel % bar */}
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:4 }}>
                    <span>Fuel as % of Revenue</span>
                    <span style={{ fontWeight:700, color: qData.fuelAsPercent > 35 ? 'var(--danger)' : qData.fuelAsPercent > 25 ? 'var(--warning)' : 'var(--success)' }}>{qData.fuelAsPercent.toFixed(1)}%</span>
                  </div>
                  <div style={{ height:6, background:'var(--border)', borderRadius:3, position:'relative' }}>
                    <div style={{ height:'100%', width:`${Math.min(qData.fuelAsPercent, 50)}%`, background: qData.fuelAsPercent > 35 ? 'var(--danger)' : qData.fuelAsPercent > 25 ? 'var(--warning)' : 'var(--success)', borderRadius:3, transition:'width 0.5s' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* Invoice / Factoring Intelligence */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
                <DollarSign size={14} color="var(--accent)" />
                <span style={{ fontSize:13, fontWeight:700 }}>Invoice Intelligence</span>
                {qData.overdueInvoices.length > 0 && (
                  <span style={{ marginLeft:'auto', fontSize:9, padding:'2px 6px', background:'rgba(239,68,68,0.12)', color:'var(--danger)', borderRadius:5, fontWeight:800 }}>{qData.overdueInvoices.length} OVERDUE</span>
                )}
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                  {[
                    { label:'UNPAID', value:'$'+qData.unpaidTotal.toLocaleString(), color:'var(--accent)' },
                    { label:'AVG DAYS TO PAY', value:qData.avgDaysToPayment+'d', color: qData.avgDaysToPayment > 35 ? 'var(--danger)' : 'var(--accent2)' },
                    { label:'FACTOR VALUE', value:'$'+qData.factoringNet.toLocaleString(), color:'var(--success)' },
                    { label:'FACTOR FEE', value:'$'+qData.factoringCost.toLocaleString(), color:'var(--warning)' },
                  ].map(s => (
                    <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                      <div style={{ fontSize:8, color:'var(--muted)', letterSpacing:1, marginBottom:3 }}>{s.label}</div>
                      <div style={valStyle(s.color, 18)}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {/* Unpaid invoice list */}
                {qData.unpaidInvoices.slice(0, 4).map((inv, i) => (
                  <div key={inv.id || i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background: qData.overdueInvoices.includes(inv) ? 'var(--danger)' : 'var(--accent)', flexShrink:0 }} />
                    <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{inv.id}</span>
                    <span style={{ fontSize:11, color:'var(--muted)', flex:1 }}>{inv.broker || inv.route || ''}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}>${(inv.amount||0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cash Flow Visibility */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}>
                <TrendingUp size={14} color="var(--success)" />
                <span style={{ fontSize:13, fontWeight:700 }}>Cash Flow Visibility</span>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                  {[
                    { label:'PROJECTED IN', value:'$'+qData.projectedIncoming.toLocaleString(), color:'var(--success)' },
                    { label:'MONTHLY BURN', value:'$'+qData.monthlyBurn.toLocaleString(), color:'var(--danger)' },
                    { label:'CASH RUNWAY', value:qData.cashRunway+'d', color: qData.cashRunway > 45 ? 'var(--success)' : qData.cashRunway > 20 ? 'var(--warning)' : 'var(--danger)' },
                    { label:'NET POSITION', value:'$'+(qData.projectedIncoming - qData.monthlyBurn).toLocaleString(), color: (qData.projectedIncoming - qData.monthlyBurn) >= 0 ? 'var(--success)' : 'var(--danger)' },
                  ].map(s => (
                    <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                      <div style={{ fontSize:8, color:'var(--muted)', letterSpacing:1, marginBottom:3 }}>{s.label}</div>
                      <div style={valStyle(s.color, 18)}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {/* Visual flow */}
                <div style={{ padding:'12px 14px', background:'var(--surface2)', borderRadius:10 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700 }}>30-Day Projection</span>
                    <span style={{ fontSize:10, color:'var(--muted)' }}>AR + Active Loads vs Burn Rate</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, height:20 }}>
                    <div style={{ flex: Math.max(qData.projectedIncoming, 1), height:'100%', background:'var(--success)', borderRadius:'4px 0 0 4px', opacity:0.7 }} />
                    <div style={{ flex: Math.max(qData.monthlyBurn, 1), height:'100%', background:'var(--danger)', borderRadius:'0 4px 4px 0', opacity:0.7 }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginTop:4 }}>
                    <span style={{ color:'var(--success)' }}>+${qData.projectedIncoming.toLocaleString()} incoming</span>
                    <span style={{ color:'var(--danger)' }}>-${qData.monthlyBurn.toLocaleString()} outgoing</span>
                  </div>
                </div>
                {/* Runway bar */}
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:4 }}>
                    <span>Cash Runway</span>
                    <span style={{ fontWeight:700, color: qData.cashRunway > 45 ? 'var(--success)' : qData.cashRunway > 20 ? 'var(--warning)' : 'var(--danger)' }}>{qData.cashRunway} days</span>
                  </div>
                  <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                    <div style={{ height:'100%', width:`${Math.min(qData.cashRunway / 90 * 100, 100)}%`, background: qData.cashRunway > 45 ? 'var(--success)' : qData.cashRunway > 20 ? 'var(--warning)' : 'var(--danger)', borderRadius:3, transition:'width 0.5s' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Decision Integration */}
          <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.05), rgba(0,0,0,0))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <Bot size={14} color="var(--accent)" />
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, letterSpacing:2 }}>Q <span style={{ color:'var(--accent)' }}>DECISION LOGIC</span></span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10 }}>
              {[
                { label:'MIN RATE TO ACCEPT', value: `$${Math.max(1.80, (qData.fuelRate + 0.50) * 1.3).toFixed(2)}/mi`, sub:'Based on cost + 30% margin', color:'var(--accent)' },
                { label:'BREAK-EVEN RPM', value: `$${(qData.totalMi > 0 ? (totalExpenses / qData.totalMi) : 1.50).toFixed(2)}/mi`, sub:'All costs / total miles', color:'var(--danger)' },
                { label:'TARGET NET/LOAD', value: `$${loadProfit.length > 0 ? Math.round(loadProfit.reduce((s,l)=>s+l.net,0)/loadProfit.length * 1.15).toLocaleString() : '500'}`, sub:'Avg net + 15% growth', color:'var(--success)' },
                { label:'MAX DEADHEAD', value: `${Math.round(qData.totalMi > 0 ? (qData.totalMi / Math.max(completedLoads.length,1)) * 0.15 : 75)} mi`, sub:'15% of avg haul length', color:'var(--warning)' },
              ].map(d => (
                <div key={d.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px' }}>
                  <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:1, marginBottom:4, fontWeight:600 }}>{d.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:d.color, lineHeight:1 }}>{d.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{d.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/* ── OVERVIEW ── */}
        {tab === 'Overview' && (<>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12 }}>
            {[
              { label:'Gross Revenue MTD', value:'$'+totalRevenue.toLocaleString(), color:'var(--accent)' },
              { label:'Total Expenses MTD', value:'$'+totalExpenses.toLocaleString(), color:'var(--danger)' },
              { label:'Net Profit MTD', value:'$'+netProfit.toLocaleString(), color:'var(--success)', big:true },
              { label:'Profit Margin', value:margin+'%', color: parseFloat(margin)>=30?'var(--success)':parseFloat(margin)>=20?'var(--warning)':'var(--danger)' },
              { label:'Cost Per Mile', value: cpm==='—'?'—':'$'+cpm, color:'var(--accent2)' },
            ].map(s => (
              <div key={s.label} style={statBg}>
                <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                <div style={valStyle(s.color, s.big?32:24)}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16 }}>
            {/* P&L Bar Chart — Recharts */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> 6-Month P&L</div>
              </div>
              <div style={{ padding:'12px 12px 4px' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={plBarData} barGap={2} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill:'#888', fontSize:11, fontFamily:"'DM Sans',sans-serif" }} axisLine={{ stroke:'#333' }} tickLine={false} />
                    <YAxis tick={{ fill:'#888', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} width={50} />
                    <Tooltip content={<DarkTooltip />} cursor={{ fill:'rgba(255,255,255,0.03)' }} />
                    <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize:11, fontFamily:"'DM Sans',sans-serif", color:'#888', paddingTop:4 }} />
                    <Bar dataKey="Revenue" fill="#f0a500" radius={[3,3,0,0]} animationDuration={800} />
                    <Bar dataKey="Expenses" fill="#ef4444" radius={[3,3,0,0]} animationDuration={800} />
                    <Bar dataKey="Net Profit" fill="#22c55e" radius={[3,3,0,0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Expense Mix — real from context */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={DollarSign} size={14} /> Expense Mix</div>
              <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
                {expBreakdown.length === 0
                  ? <div style={{ color:'var(--muted)', fontSize:12, padding:'8px 0' }}>No expenses logged yet</div>
                  : expBreakdown.map(e => (
                    <div key={e.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                        <span style={{ color:'var(--muted)' }}>{e.label}</span>
                        <span style={{ fontWeight:700 }}>${e.amount.toLocaleString()} <span style={{ color:'var(--muted)', fontWeight:400 }}>({e.pct}%)</span></span>
                      </div>
                      <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
                        <div style={{ height:'100%', width:`${e.pct}%`, background:e.color, borderRadius:3, transition:'width 0.5s' }}/>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Bottom stat row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
            {[
              { icon: Scale, label:'Break-Even Point', value:`$${breakEven.toLocaleString()}/mo`, sub:'Fixed cost floor', color:'var(--accent)' },
              { icon: Truck, label:'Revenue per Truck', value:`$${revPerTruck.toLocaleString()}`, sub:'3-truck fleet avg', color:'var(--accent2)' },
              { icon: Package, label:'Loads Completed', value:String(completedLoads.length), sub:`${activeLoads.length} active now`, color:'var(--success)' },
              { icon: MapPin, label:'Total Miles Run', value:totalMiles.toLocaleString(), sub:'Completed loads only', color:'var(--warning)' },
            ].map(s => (
              <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', display:'flex', gap:12, alignItems:'center' }}>
                <span><Ic icon={s.icon} size={22} color={s.color} /></span>
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{s.label}</div>
                  <div style={valStyle(s.color, 22)}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue Trend + Scatter Plot row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* Revenue Trend Area Chart */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={TrendingUp} size={14} /> 8-Week Revenue Trend</div>
              </div>
              <div style={{ padding:'12px 12px 4px' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={weeklyRevData}>
                    <defs>
                      <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f0a500" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#f0a500" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="week" tick={{ fill:'#888', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={{ stroke:'#333' }} tickLine={false} />
                    <YAxis tick={{ fill:'#888', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} width={50} />
                    <Tooltip content={<DarkTooltip />} />
                    <Area type="monotone" dataKey="Revenue" stroke="#f0a500" strokeWidth={2} fill="url(#goldGradient)" animationDuration={800} dot={{ fill:'#f0a500', r:3, strokeWidth:0 }} activeDot={{ r:5, fill:'#f0a500', stroke:'#fff', strokeWidth:2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Load Profitability Scatter Plot */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Target} size={14} /> Load Profitability Map</div>
                <div style={{ display:'flex', gap:10 }}>
                  {[{c:'#22c55e',l:'Good'},{c:'#f0a500',l:'Fair'},{c:'#ef4444',l:'Bad'}].map(x=>(
                    <div key={x.l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#888' }}>
                      <div style={{ width:7,height:7,borderRadius:'50%',background:x.c }}/>
                      {x.l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding:'12px 12px 4px' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" dataKey="miles" name="Miles" tick={{ fill:'#888', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={{ stroke:'#333' }} tickLine={false} label={{ value:'Miles', position:'insideBottom', offset:-2, style:{ fill:'#666', fontSize:10, fontFamily:"'DM Sans',sans-serif" } }} />
                    <YAxis type="number" dataKey="profitPerMile" name="$/Mile" tick={{ fill:'#888', fontSize:10, fontFamily:"'DM Sans',sans-serif" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(2)}`} width={50} label={{ value:'Profit/Mi', angle:-90, position:'insideLeft', offset:10, style:{ fill:'#666', fontSize:10, fontFamily:"'DM Sans',sans-serif" } }} />
                    <ZAxis range={[40, 120]} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ background:'#1a1a1a', border:'1px solid #333', borderRadius:8, padding:'10px 14px', fontFamily:"'DM Sans',sans-serif", fontSize:12, color:'#fff', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' }}>
                          <div style={{ fontWeight:700, color:'#f0a500', marginBottom:4 }}>{d.loadId}</div>
                          <div style={{ color:'#aaa', marginBottom:2 }}>{d.origin} → {d.dest}</div>
                          <div style={{ display:'flex', gap:12, marginTop:4 }}>
                            <span>RPM: <b style={{ color:'#fff' }}>${d.rpm}</b></span>
                            <span>Net: <b style={{ color: d.net >= 0 ? '#22c55e' : '#ef4444' }}>${d.net.toLocaleString()}</b></span>
                          </div>
                          <div style={{ marginTop:2 }}>{d.miles} mi · ${d.profitPerMile}/mi profit</div>
                        </div>
                      )
                    }} />
                    <Scatter data={scatterData} animationDuration={800}>
                      {scatterData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.tier === 'good' ? '#22c55e' : entry.tier === 'fair' ? '#f0a500' : '#ef4444'} fillOpacity={0.8} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>)}

        {/* ── PER LOAD ── */}
        {tab === 'Per Load' && (<>
          {/* Top summary with profit/mile and profit/day */}
          {loadProfit.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12 }}>
              {[
                { label:'Best Load', value:'$'+loadProfit[0].net.toLocaleString(), sub:loadProfit[0].loadId+' · '+loadProfit[0].broker, color:'var(--success)' },
                { label:'Avg Net Profit', value:'$'+Math.round(loadProfit.reduce((s,l)=>s+l.net,0)/loadProfit.length).toLocaleString(), sub:'per completed load', color:'var(--accent)' },
                { label:'Avg Profit/Mile', value:'$'+(loadProfit.reduce((s,l)=>s+l.profitPerMile,0)/loadProfit.length).toFixed(2), sub:'net per loaded mile', color:'var(--accent2)' },
                { label:'Avg Profit/Day', value:'$'+Math.round(loadProfit.reduce((s,l)=>s+l.profitPerDay,0)/loadProfit.length).toLocaleString(), sub:'based on transit time', color:'var(--accent3)' },
                { label:'Worst Load', value:'$'+loadProfit[loadProfit.length-1].net.toLocaleString(), sub:loadProfit[loadProfit.length-1].loadId, color:'var(--danger)' },
              ].map(s => (
                <div key={s.label} style={statBg}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                  <div style={valStyle(s.color, 22)}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Package} size={14} /> Load Profitability — Ranked by Net</div>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{loadProfit.length} completed loads</span>
            </div>
            {loadProfit.length === 0
              ? <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No completed loads yet — mark loads as Delivered to see profitability.</div>
              : <>
                  <div style={{ display:'grid', gridTemplateColumns:'70px 1fr 80px 70px 70px 70px 70px 65px 65px', padding:'8px 18px', borderBottom:'1px solid var(--border)', gap:6 }}>
                    {['Load ID','Route / Broker','Driver','Gross','Net','$/Mile','$/Day','Margin','Fuel'].map(h => (
                      <div key={h} style={{ fontSize:9, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>{h}</div>
                    ))}
                  </div>
                  {loadProfit.map((l, i) => {
                    const mc = l.margin >= 35 ? 'var(--success)' : l.margin >= 25 ? 'var(--accent)' : l.margin >= 15 ? 'var(--warning)' : 'var(--danger)'
                    const ppmColor = l.profitPerMile >= 0.80 ? 'var(--success)' : l.profitPerMile >= 0.40 ? 'var(--accent)' : 'var(--warning)'
                    const ppdColor = l.profitPerDay >= 500 ? 'var(--success)' : l.profitPerDay >= 250 ? 'var(--accent)' : 'var(--warning)'
                    const route = l.origin && l.dest ? l.origin.split(',')[0].substring(0,3).toUpperCase() + ' → ' + l.dest.split(',')[0].substring(0,3).toUpperCase() : l.loadId
                    return (
                      <div key={l.loadId} style={{ display:'grid', gridTemplateColumns:'70px 1fr 80px 70px 70px 70px 70px 65px 65px', padding:'12px 18px', borderBottom:'1px solid var(--border)', gap:6, alignItems:'center', background: i===0 ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                        <div style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'var(--accent)' }}>{l.loadId}</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{route}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{l.broker} · {l.miles}mi · ${parseFloat(l.rate||0).toFixed(2)}/mi</div>
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{l.driver || '—'}</div>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${l.gross.toLocaleString()}</div>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--success)' }}>${l.net.toLocaleString()}</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:ppmColor }}>${l.profitPerMile.toFixed(2)}</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:ppdColor }}>${Math.round(l.profitPerDay).toLocaleString()}<span style={{ fontSize:9, color:'var(--muted)', fontWeight:400 }}>/{l.days}d</span></div>
                        <div>
                          <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:8, background:mc+'18', color:mc }}>{l.margin}%</span>
                        </div>
                        <div style={{ fontSize:11, color:'var(--warning)' }}>−${l.fuelCost.toLocaleString()}</div>
                      </div>
                    )
                  })}
                </>
            }
          </div>
        </>)}

        {/* ── BY DRIVER ── */}
        {tab === 'By Driver' && (<>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.max(driverStats.length,1)},1fr)`, gap:12 }}>
            {driverStats.length === 0
              ? <div style={{ ...statBg, color:'var(--muted)', fontSize:13 }}>No completed loads yet</div>
              : driverStats.map((d,i) => (
                <div key={d.name} style={{ background:'var(--surface)', border:`1px solid ${i===0?'rgba(34,197,94,0.35)':'var(--border)'}`, borderRadius:12, padding:18 }}>
                  {i===0 && <div style={{ fontSize:9, fontWeight:800, color:'var(--success)', letterSpacing:2, marginBottom:6 }}>TOP PERFORMER</div>}
                  <div style={{ fontSize:15, fontWeight:800, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}><Ic icon={User} size={15} /> {d.name}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {[
                      { label:'Loads',        value: String(d.loads),          color:'var(--accent2)' },
                      { label:'Gross Rev',    value: '$'+d.gross.toLocaleString(), color:'var(--accent)' },
                      { label:'Net Profit',   value: '$'+d.net.toLocaleString(),   color:'var(--success)' },
                      { label:'Avg RPM',      value: '$'+d.avgRPM,             color:'var(--accent3)' },
                      { label:'Miles Run',    value: d.miles.toLocaleString(),  color:'var(--muted)' },
                      { label:'Margin',       value: d.margin+'%',              color: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' },
                    ].map(s => (
                      <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2, textTransform:'uppercase', letterSpacing:1 }}>{s.label}</div>
                        <div style={valStyle(s.color, 18)}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Margin bar */}
                  <div style={{ marginTop:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:4 }}>
                      <span>Profit Margin</span><span style={{ fontWeight:700, color: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' }}>{d.margin}%</span>
                    </div>
                    <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                      <div style={{ height:'100%', width:`${Math.min(d.margin,60)}%`, background: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)', borderRadius:3, transition:'width 0.5s' }}/>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>

          {/* Driver efficiency table */}
          {driverStats.length > 0 && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> Driver Comparison</div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Driver','Loads','Total Miles','Gross Revenue','Net Profit','Avg RPM','Margin'].map(h => (
                      <th key={h} style={{ padding:'10px 16px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map(d => (
                    <tr key={d.name} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700 }}>{d.name}</td>
                      <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{d.loads}</td>
                      <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{d.miles.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${d.gross.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${d.net.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontSize:12, fontWeight:700, color:'var(--accent2)' }}>${d.avgRPM}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:8, background:(d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)')+'18', color:d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' }}>{d.margin}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {/* ── BY BROKER ── */}
        {tab === 'By Broker' && (<>
          {brokerStats.length === 0
            ? <div style={{ ...statBg, color:'var(--muted)', fontSize:13, textAlign:'center', padding:40 }}>No completed loads yet</div>
            : <>
                {/* Broker cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
                  {brokerStats.map((b,i) => {
                    const mc = parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)'
                    return (
                      <div key={b.name} style={{ background:'var(--surface)', border:`1px solid ${i===0?'rgba(240,165,0,0.35)':'var(--border)'}`, borderRadius:12, padding:18 }}>
                        {i===0 && <div style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:6 }}>MOST VOLUME</div>}
                        <div style={{ fontSize:14, fontWeight:800, marginBottom:4, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Building2} size={14} /> {b.name}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>LOADS</div>
                            <div style={valStyle('var(--accent2)',20)}>{b.loads}</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>AVG RPM</div>
                            <div style={valStyle('var(--accent)',20)}>${b.avgRPM}</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>AVG LOAD</div>
                            <div style={valStyle('var(--accent3)',20)}>${b.avgLoad.toLocaleString()}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                          <span style={{ color:'var(--muted)' }}>Total Gross</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${b.gross.toLocaleString()}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:8 }}>
                          <span style={{ color:'var(--muted)' }}>Net Profit</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${b.net.toLocaleString()}</span>
                        </div>
                        <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                          <div style={{ height:'100%', width:`${Math.min(parseFloat(b.margin),60)}%`, background:mc, borderRadius:3 }}/>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginTop:4 }}>
                          <span>Net margin</span>
                          <span style={{ fontWeight:700, color:mc }}>{b.margin}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Broker table */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> Broker Ranking</div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['#','Broker','Loads','Total Gross','Net Profit','Avg RPM','Avg Load','Margin'].map(h => (
                          <th key={h} style={{ padding:'10px 16px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {brokerStats.map((b,i) => (
                        <tr key={b.name} style={{ borderBottom:'1px solid var(--border)', background: i===0?'rgba(240,165,0,0.02)':'transparent' }}>
                          <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>#{i+1}</td>
                          <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700 }}>{b.name}</td>
                          <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{b.loads}</td>
                          <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${b.gross.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${b.net.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px', fontSize:12, fontWeight:700, color:'var(--accent2)' }}>${b.avgRPM}</td>
                          <td style={{ padding:'12px 16px', fontSize:12, color:'var(--muted)' }}>${b.avgLoad.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px' }}>
                            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:8, background:(parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)')+'18', color:parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)' }}>{b.margin}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
          }
        </>)}

      </div>
    </div>
  )
}
