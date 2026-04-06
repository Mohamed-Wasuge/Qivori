import React, { useState, useMemo } from 'react'
import {
  BarChart2, Zap, AlertTriangle, Bot, Calendar,
  TrendingUp, Lightbulb, Truck
} from 'lucide-react'
import { Ic } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { ACCT_MONTHS } from './helpers'

// ─── CASH FLOW FORECASTER ─────────────────────────────────────────────────────
// Generate 6 weeks dynamically starting from current week
function buildCFWeeks() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - dayOfWeek)
  startOfWeek.setHours(0, 0, 0, 0)
  const weeks = []
  const dueMap = {}
  for (let w = 0; w < 6; w++) {
    const wStart = new Date(startOfWeek)
    wStart.setDate(startOfWeek.getDate() + w * 7)
    const wEnd = new Date(wStart)
    wEnd.setDate(wStart.getDate() + 6)
    const sMonth = ACCT_MONTHS[wStart.getMonth()]
    const eMonth = ACCT_MONTHS[wEnd.getMonth()]
    const label = `${sMonth} ${wStart.getDate()}`
    const range = sMonth === eMonth
      ? `${sMonth} ${wStart.getDate()}–${wEnd.getDate()}`
      : `${sMonth} ${wStart.getDate()}–${eMonth} ${wEnd.getDate()}`
    weeks.push({ label, range, start: wStart, end: wEnd })
    for (let d = 0; d < 7; d++) {
      const day = new Date(wStart)
      day.setDate(wStart.getDate() + d)
      dueMap[`${ACCT_MONTHS[day.getMonth()]} ${day.getDate()}`] = w
    }
  }
  return { weeks, dueMap }
}
const { weeks: CF_WEEKS, dueMap: CF_DUE_WEEK } = buildCFWeeks()

const CF_START_BALANCE = 0

export function CashFlowForecaster() {
  const { loads, invoices, expenses, drivers: ctxDrivers, fuelCostPerMile, company: cfCompany, updateInvoiceStatus: cfUpdateInvStatus } = useCarrier()
  const { showToast } = useApp()
  const [selWeek, setSelWeek] = useState(0)
  const [factorId, setFactorId] = useState(null)

  const forecast = useMemo(() => {
    const incoming = [0, 0, 0, 0, 0, 0]
    const items    = [[], [], [], [], [], []]

    // 1. Unpaid invoices → their due week
    invoices.filter(i => i.status === 'Unpaid').forEach(inv => {
      const wk = CF_DUE_WEEK[inv.dueDate] ?? 4
      incoming[wk] += inv.amount
      items[wk].push({ type:'invoice', id:inv.id, label:`${inv.id} · ${inv.route}`, amount:inv.amount, broker:inv.broker, detail:`Due ${inv.dueDate}`, factorAmt: Math.round(inv.amount * 0.975) })
    })

    // 2. Active loads → delivery week + payment terms (biweekly for Amazon, ~30d for brokers)
    loads.filter(l => !['Delivered','Invoiced'].includes(l.status)).forEach(load => {
      const delDate = load.delivery?.split(' · ')[0] || ''
      const delWk   = CF_DUE_WEEK[delDate] ?? 1
      const isRelay = load.load_source === 'amazon_relay' || load.payment_terms === 'biweekly'
      const payWk   = Math.min(5, delWk + (isRelay ? 2 : 4)) // Amazon pays ~2 weeks, brokers ~30 days
      const loadGross = load.gross || load.rate || 0
      incoming[payWk] += loadGross
      const payNote = isRelay ? 'pays biweekly (Amazon Relay)' : 'pays ~30 days later'
      items[payWk].push({ type:'load', id:load.loadId, label:`${load.loadId} · ${load.origin?.split(',')[0]}→${load.dest?.split(',')[0]}`, amount:loadGross, broker:load.broker, detail:`Delivers ${delDate || 'TBD'} · ${payNote}`, projected:true })
    })

    // 3. Weekly outgoing (deterministic, no Math.random)
    // Use avg driver pay rate from driver records
    const avgPayRate = (() => {
      const pctDrivers = (ctxDrivers || []).filter(d => (d.pay_model || 'percent') === 'percent')
      if (pctDrivers.length === 0) return 0.50
      return pctDrivers.reduce((s, d) => s + (parseFloat(d.pay_rate) || 50), 0) / pctDrivers.length / 100
    })()
    const totalExpAmt = expenses.reduce((s,e) => s + e.amount, 0)
    const weeklyBase  = Math.round(totalExpAmt / 4) // spread over 4 weeks of history
    const outgoing = CF_WEEKS.map((_, i) => {
      const driverPay = Math.round(incoming[i] * avgPayRate)
      const fuel      = Math.round((totalExpAmt || 0) / 4)
      const ops       = i === 0 ? Math.round(weeklyBase * 0.6) : Math.round(weeklyBase * 0.35)
      return driverPay + fuel + ops
    })

    // Cumulative balance
    let bal = CF_START_BALANCE
    const balance = CF_WEEKS.map((_, i) => {
      bal += incoming[i] - outgoing[i]
      return bal
    })

    return { incoming, outgoing, balance, items, avgPayRate, totalExpAmt }
  }, [loads, invoices, expenses, ctxDrivers])

  const { incoming, outgoing, balance, items, avgPayRate, totalExpAmt } = forecast

  const totalIn  = incoming.reduce((s,v) => s + v, 0)
  const totalOut = outgoing.reduce((s,v) => s + v, 0)
  const projBal  = CF_START_BALANCE + totalIn - totalOut
  const maxBar   = Math.max(...incoming, ...outgoing, 1)

  const selNet = incoming[selWeek] - outgoing[selWeek]

  // AI insights (deterministic)
  const unpaidTotal  = invoices.filter(i => i.status === 'Unpaid').reduce((s,i) => s + i.amount, 0)
  const thinWeekIdx  = balance.findIndex(b => b < 8000)
  const peakWeekIdx  = incoming.indexOf(Math.max(...incoming))
  const insights = [
    unpaidTotal > 3000 && { icon: Lightbulb, color:'var(--accent)',  text:`$${unpaidTotal.toLocaleString()} in unpaid invoices sitting out there. Factor the largest one now for same-day cash at 2.5% fee.` },
    thinWeekIdx >= 0   && { icon: AlertTriangle, color:'var(--warning)', text:`Week of ${CF_WEEKS[thinWeekIdx].label} projects low — $${balance[thinWeekIdx].toLocaleString()} balance. Either factor an invoice or hold a non-urgent expense.` },
    peakWeekIdx >= 0 && incoming[peakWeekIdx] > 0 && { icon: TrendingUp, color:'var(--success)', text:`Strongest week: ${CF_WEEKS[peakWeekIdx].label} — $${incoming[peakWeekIdx].toLocaleString()} expected from ${items[peakWeekIdx].length} source${items[peakWeekIdx].length !== 1 ? 's' : ''}.` },
    { icon: Truck, color:'var(--accent2)', text:`Reserve ~$${Math.round(totalIn * avgPayRate).toLocaleString()} for driver pay over 6 weeks (${Math.round(avgPayRate * 100)}% avg of projected revenue).` },
  ].filter(Boolean)

  const kpis = [
    { l:'Current Balance',   v:`$${CF_START_BALANCE.toLocaleString()}`,   c:'var(--text)',    s:'Est. starting position' },
    { l:'Incoming · 6 wks',  v:`$${totalIn.toLocaleString()}`,            c:'var(--success)', s:'Invoices + loads' },
    { l:'Outgoing · 6 wks',  v:`$${totalOut.toLocaleString()}`,           c:'var(--danger)',  s:'Pay + fuel + ops' },
    { l:'Projected Balance', v:`$${projBal.toLocaleString()}`,            c: projBal >= CF_START_BALANCE ? 'var(--success)' : 'var(--danger)', s:'6-week end position' },
  ]

  return (
    <div style={{ padding:20, overflowY:'auto', height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column', gap:16 }}>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
        {kpis.map(k => (
          <div key={k.l} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600, letterSpacing:0.5 }}>{k.l.toUpperCase()}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:k.c, lineHeight:1, marginBottom:4 }}>{k.v}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontWeight:700, fontSize:13 }}><Ic icon={BarChart2} /> 6-Week Cash Flow</span>
          <div style={{ display:'flex', gap:16, marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:10, height:10, borderRadius:2, background:'rgba(34,197,94,0.6)' }}/> Incoming</span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:10, height:10, borderRadius:2, background:'rgba(239,68,68,0.5)' }}/> Outgoing</span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)' }}/> Running Balance</span>
          </div>
        </div>

        <div style={{ padding:'20px 24px 12px' }}>
          {/* Bars */}
          <div style={{ display:'flex', gap:10, alignItems:'flex-end', height:160, marginBottom:4 }}>
            {CF_WEEKS.map((wk, i) => {
              const inH  = Math.max(4, (incoming[i] / maxBar) * 148)
              const outH = Math.max(4, (outgoing[i] / maxBar) * 148)
              const isSel = selWeek === i
              const net   = incoming[i] - outgoing[i]
              return (
                <div key={i} onClick={() => setSelWeek(i)}
                  style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer' }}>
                  <div style={{ fontSize:9, fontWeight:700, color: net >= 0 ? 'var(--success)' : 'var(--danger)', marginBottom:4 }}>
                    {net >= 0 ? '+' : ''}{(net/1000).toFixed(1)}k
                  </div>
                  <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end' }}>
                    <div style={{ flex:1, height:`${inH}px`, borderRadius:'3px 3px 0 0', transition:'all 0.2s',
                      background: isSel ? 'var(--success)' : 'rgba(34,197,94,0.45)',
                      border:`1px solid ${isSel ? 'var(--success)' : 'transparent'}` }}/>
                    <div style={{ flex:1, height:`${outH}px`, borderRadius:'3px 3px 0 0', transition:'all 0.2s',
                      background: isSel ? 'var(--danger)' : 'rgba(239,68,68,0.38)',
                      border:`1px solid ${isSel ? 'var(--danger)' : 'transparent'}` }}/>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Balance line labels + week labels */}
          <div style={{ display:'flex', gap:10 }}>
            {CF_WEEKS.map((wk, i) => {
              const isSel = selWeek === i
              return (
                <div key={i} onClick={() => setSelWeek(i)}
                  style={{ flex:1, textAlign:'center', cursor:'pointer', paddingTop:6, borderTop:`2px solid ${isSel ? 'var(--accent)' : 'transparent'}` }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--accent)', marginBottom:2 }}>
                    ${(balance[i]/1000).toFixed(1)}k
                  </div>
                  <div style={{ fontSize:10, fontWeight: isSel ? 700 : 400, color: isSel ? 'var(--accent)' : 'var(--muted)' }}>
                    {wk.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom: Week detail + AI insights */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Selected week breakdown */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontWeight:700, fontSize:13 }}><Ic icon={Calendar} /> {CF_WEEKS[selWeek].range}</span>
            <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
              {selWeek > 0 && <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setSelWeek(w => w - 1)}>‹</button>}
              {selWeek < 5 && <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setSelWeek(w => w + 1)}>›</button>}
            </div>
          </div>

          <div style={{ padding:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:14 }}>
              {[
                { l:'Incoming', v:`$${incoming[selWeek].toLocaleString()}`,  c:'var(--success)' },
                { l:'Outgoing', v:`$${outgoing[selWeek].toLocaleString()}`,  c:'var(--danger)'  },
                { l:'Net',      v:`${selNet>=0?'+':''}$${selNet.toLocaleString()}`, c: selNet >= 0 ? 'var(--success)' : 'var(--danger)' },
                { l:'Balance',  v:`$${balance[selWeek].toLocaleString()}`,   c:'var(--accent)'  },
              ].map(s => (
                <div key={s.l} style={{ background:'var(--surface2)', borderRadius:8, padding:'9px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>{s.l}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:s.c }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Expense line items */}
            <div style={{ marginBottom:8, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              {[
                { label:`Driver Pay (${Math.round(avgPayRate * 100)}%)`, amount: Math.round(incoming[selWeek] * avgPayRate), out:true },
                { label:`Fuel est.${fuelCostPerMile ? ` ($${fuelCostPerMile.toFixed(2)}/mi)` : ''}`, amount: Math.round((totalExpAmt || 0) / 4), out:true },
                { label:'Ops / Maintenance',    amount: Math.max(0, outgoing[selWeek] - Math.round(incoming[selWeek] * avgPayRate) - Math.round((totalExpAmt || 0) / 4)), out:true },
              ].filter(e => e.amount > 0).map(e => (
                <div key={e.label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0' }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{e.label}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--danger)' }}>−${e.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Income line items */}
            {items[selWeek].length === 0
              ? <div style={{ textAlign:'center', padding:'16px 0', color:'var(--muted)', fontSize:12 }}>No invoices or loads due this week</div>
              : items[selWeek].map((item, idx) => (
                <div key={idx} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
                    background: item.projected ? 'var(--accent2)' : 'var(--success)' }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{item.broker} · {item.detail}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--success)' }}>+${item.amount.toLocaleString()}</div>
                    {item.factorAmt && !item.projected && carrierCompany?.factoring_company && (
                      <div style={{ fontSize:10, color:'var(--accent)', cursor:'pointer' }}
                        onClick={async () => {
                          try {
                            const res = await apiFetch('/api/factor-invoice', {
                              method:'POST', headers:{'Content-Type':'application/json'},
                              body: JSON.stringify({ invoiceId: item._dbId || item.id, factoringCompany: carrierCompany.factoring_company, factoringRate: carrierCompany.factoring_rate || 2.5 })
                            })
                            const data = await res.json()
                            if (data.success) {
                              updateInvoiceStatus(item.id, 'Factored')
                              showToast('','Factored',`${data.invoiceNumber} — $${data.net?.toLocaleString()} depositing · sent to ${data.sentTo}`)
                            } else { showToast('','Error', data.error || 'Could not factor') }
                          } catch { showToast('','Error','Factoring API unavailable') }
                        }}>
                        Factor Now
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:5, flexShrink:0,
                    background: item.projected ? 'rgba(0,212,170,0.12)' : 'rgba(34,197,94,0.12)',
                    color: item.projected ? 'var(--accent2)' : 'var(--success)' }}>
                    {item.projected ? 'EST' : 'DUE'}
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        {/* AI Insights */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:700, fontSize:13 }}><Ic icon={Bot} /> AI Cash Flow Insights</span>
            <span style={{ fontSize:10, padding:'2px 7px', background:'rgba(240,165,0,0.12)', color:'var(--accent)', borderRadius:6, fontWeight:800 }}>LIVE</span>
          </div>
          <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10, flex:1 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ padding:'12px 14px', background:ins.color+'08', border:`1px solid ${ins.color}28`, borderRadius:10, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:18, flexShrink:0, lineHeight:1.4 }}>{typeof ins.icon === "string" ? ins.icon : <ins.icon size={18} />}</span>
                <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.55 }}>{ins.text}</div>
              </div>
            ))}

            {/* Quick action: factor largest unpaid */}
            {invoices.filter(i => i.status === 'Unpaid').length > 0 && (
              <div style={{ marginTop:'auto', padding:'12px 14px', background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10 }}>
                <div style={{ fontSize:11, fontWeight:700, marginBottom:8 }}><Ic icon={Zap} /> Quick Actions</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {invoices.filter(i => i.status === 'Unpaid').slice(0,2).map(inv => (
                    <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, flex:1, color:'var(--muted)' }}>{inv.id} · ${inv.amount.toLocaleString()}</span>
                      <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 10px', color:'var(--accent)', borderColor:'rgba(240,165,0,0.3)' }}
                        onClick={async () => {
                          if (!cfCompany?.factoring_company) { showToast('','Setup Required','Set up your factoring company in Financials → Factoring first'); return }
                          try {
                            const res = await apiFetch('/api/factor-invoice', {
                              method:'POST', headers:{'Content-Type':'application/json'},
                              body: JSON.stringify({ invoiceId: inv._dbId || inv.id, factoringCompany: cfCompany.factoring_company, factoringRate: cfCompany.factoring_rate || 2.5 })
                            })
                            const data = await res.json()
                            if (data.success) {
                              cfUpdateInvStatus?.(inv.id, 'Factored')
                              showToast('','Factored',`${data.invoiceNumber} — $${data.net?.toLocaleString()} depositing · sent to ${data.sentTo}`)
                            } else { showToast('','Error', data.error || 'Could not factor') }
                          } catch { showToast('','Error','Factoring API unavailable') }
                        }}>
                        Factor Now
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
