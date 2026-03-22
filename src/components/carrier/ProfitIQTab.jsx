import React, { useState } from 'react'
import {
  DollarSign, Package, Truck, BarChart2, MapPin, Scale, User, Building2
} from 'lucide-react'
import { useCarrier } from '../../context/CarrierContext'
import { Ic } from './shared'

// ── PROFIT IQ ─────────────────────────────────────────────────────────────────
export const PIQ_TABS = ['Overview', 'Per Load', 'By Driver', 'By Broker']

export function ProfitIQTab() {
  const { loads, expenses, totalRevenue, totalExpenses, drivers: ctxDrivers, fuelCostPerMile } = useCarrier()
  const [tab, setTab] = useState('Overview')

  const fuelRate = fuelCostPerMile || 0.22

  // Helper: get per-driver pay
  const calcDriverPay = (driverName, gross, miles) => {
    const driverRec = (ctxDrivers || []).find(d => (d.full_name || d.name) === driverName)
    const model = driverRec?.pay_model || 'percent'
    const rate = parseFloat(driverRec?.pay_rate) || 28
    if (model === 'permile') return Math.round(miles * rate)
    if (model === 'flat') return Math.round(rate)
    return Math.round(gross * (rate / 100))
  }

  // ── computed base data ──────────────────────────────────────────────────────
  const completedLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const activeLoads    = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))

  // Per-load profit: gross minus per-driver pay and real fuel cost
  const loadProfit = completedLoads.map(l => {
    const gross      = l.gross || 0
    const miles      = parseFloat(l.miles) || 0
    const driverPay  = calcDriverPay(l.driver, gross, miles)
    const fuelCost   = Math.round(miles * fuelRate)
    const net        = gross - driverPay - fuelCost
    const margin     = gross > 0 ? ((net / gross) * 100).toFixed(1) : '0.0'
    const rpm        = parseFloat(l.rate) || (miles > 0 ? gross / miles : 0)
    return { ...l, driverPay, fuelCost, net, margin: parseFloat(margin), rpm }
  }).sort((a,b) => b.net - a.net)

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
      if (idx >= 0 && idx < 5) histRev[idx] += Number(l.gross || l.gross_pay || 0)
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

  const netProfit   = totalRevenue - totalExpenses
  const margin      = totalRevenue > 0 ? ((netProfit/totalRevenue)*100).toFixed(1) : '0.0'
  const totalMiles  = completedLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
  const cpm         = totalMiles > 0 ? (totalExpenses/totalMiles).toFixed(2) : '—'
  const truckCt     = Math.max((ctxDrivers || []).length || 1, 1)
  const revPerTruck = Math.round(totalRevenue / truckCt)
  const breakEven   = Math.round(totalExpenses * 0.8) || 10000

  const statBg  = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', textAlign:'center' }
  const valStyle= (color, size=26) => ({ fontFamily:"'Bebas Neue',sans-serif", fontSize:size, color, lineHeight:1.1 })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'auto' }}>

      {/* Sub-tab bar */}
      <div style={{ flexShrink:0, background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 20px', display:'flex', alignItems:'center', gap:2 }}>
        {PIQ_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'11px 18px', border:'none', borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: tab===t ? 'var(--accent)' : 'var(--muted)', fontSize:13, fontWeight: tab===t ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1 }}>
            {t}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ fontSize:11, color:'var(--muted)', padding:'0 8px' }}>
          {completedLoads.length} completed loads · ${totalRevenue.toLocaleString()} MTD
        </div>
      </div>

      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

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
            {/* P&L Bar Chart */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> 6-Month P&L</div>
                <div style={{ display:'flex', gap:14 }}>
                  {[{c:'var(--accent)',l:'Revenue'},{c:'var(--danger)',l:'Expenses'},{c:'var(--success)',l:'Net'}].map(x=>(
                    <div key={x.l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--muted)' }}>
                      <div style={{ width:8,height:8,borderRadius:2,background:x.c }}/>
                      {x.l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding:'16px 20px 8px' }}>
                <div style={{ display:'flex', alignItems:'flex-end', gap:10, height:140 }}>
                  {histMonths.map((m,i) => {
                    const isCurrent = i === histMonths.length - 1
                    return (
                      <div key={m} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                        <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:120, justifyContent:'center' }}>
                          <div style={{ width:'30%', height:`${(histRev[i]/maxBar)*120}px`, background:'var(--accent)', borderRadius:'3px 3px 0 0', opacity: isCurrent?1:0.55 }} title={`$${histRev[i].toLocaleString()}`}/>
                          <div style={{ width:'30%', height:`${(histExp[i]/maxBar)*120}px`, background:'var(--danger)', borderRadius:'3px 3px 0 0', opacity: isCurrent?1:0.55 }} title={`$${histExp[i].toLocaleString()}`}/>
                          <div style={{ width:'30%', height:`${(Math.max(histNet[i],0)/maxBar)*120}px`, background:'var(--success)', borderRadius:'3px 3px 0 0' }} title={`$${histNet[i].toLocaleString()}`}/>
                        </div>
                        <div style={{ fontSize:10, color: isCurrent?'var(--accent)':'var(--muted)', fontWeight: isCurrent?700:400 }}>{m}</div>
                        {isCurrent && <div style={{ fontSize:9, color:'var(--accent)', fontWeight:700 }}>LIVE</div>}
                      </div>
                    )
                  })}
                </div>
                {/* Value labels */}
                <div style={{ display:'flex', gap:10, paddingTop:8, borderTop:'1px solid var(--border)', marginTop:4 }}>
                  {histMonths.map((m,i) => (
                    <div key={m} style={{ flex:1, textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'var(--success)', fontWeight:700 }}>${(histNet[i]/1000).toFixed(1)}K</div>
                    </div>
                  ))}
                </div>
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
        </>)}

        {/* ── PER LOAD ── */}
        {tab === 'Per Load' && (<>
          {/* Top 3 summary */}
          {loadProfit.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
              {[
                { label:'Best Load', load: loadProfit[0], color:'var(--success)' },
                { label:'Avg Net Profit', load: null, avg: loadProfit.length ? Math.round(loadProfit.reduce((s,l)=>s+l.net,0)/loadProfit.length) : 0, color:'var(--accent)' },
                { label:'Worst Load', load: loadProfit[loadProfit.length-1], color:'var(--danger)' },
              ].map(s => (
                <div key={s.label} style={statBg}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                  {s.load
                    ? <>
                        <div style={valStyle(s.color, 22)}>${s.load.net.toLocaleString()}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{s.load.loadId} · {s.load.broker}</div>
                      </>
                    : <div style={valStyle(s.color, 22)}>${s.avg.toLocaleString()}</div>
                  }
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
                  <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 90px 80px 80px 80px 80px 80px', padding:'8px 18px', borderBottom:'1px solid var(--border)', gap:8 }}>
                    {['Load ID','Route / Broker','Driver','Gross','Driver Pay','Fuel Est','Net','Margin'].map(h => (
                      <div key={h} style={{ fontSize:9, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>{h}</div>
                    ))}
                  </div>
                  {loadProfit.map((l, i) => {
                    const mc = l.margin >= 35 ? 'var(--success)' : l.margin >= 25 ? 'var(--accent)' : l.margin >= 15 ? 'var(--warning)' : 'var(--danger)'
                    const route = l.origin && l.dest ? l.origin.split(',')[0].substring(0,3).toUpperCase() + ' → ' + l.dest.split(',')[0].substring(0,3).toUpperCase() : l.loadId
                    return (
                      <div key={l.loadId} style={{ display:'grid', gridTemplateColumns:'80px 1fr 90px 80px 80px 80px 80px 80px', padding:'12px 18px', borderBottom:'1px solid var(--border)', gap:8, alignItems:'center', background: i===0 ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                        <div style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'var(--accent)' }}>{l.loadId}</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{route}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{l.broker} · {l.miles}mi · ${parseFloat(l.rate||0).toFixed(2)}/mi</div>
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{l.driver || '—'}</div>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${l.gross.toLocaleString()}</div>
                        <div style={{ fontSize:12, color:'var(--danger)' }}>−${l.driverPay.toLocaleString()}</div>
                        <div style={{ fontSize:12, color:'var(--warning)' }}>−${l.fuelCost.toLocaleString()}</div>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${l.net.toLocaleString()}</div>
                        <div>
                          <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:8, background:mc+'18', color:mc }}>{l.margin}%</span>
                        </div>
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
