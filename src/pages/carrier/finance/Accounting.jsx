import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart2, DollarSign, AlertTriangle, CheckCircle, Clock,
  FileText, Truck, Receipt, Zap, Bot, Check, Send,
  Calendar, TrendingUp, TrendingDown, Flame, AlertCircle,
  Download, Paperclip, Package, Layers, Eye
} from 'lucide-react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { ACCT_MONTHS, acctParseDate, acctDaysAgo, acctDaysUntil } from './helpers'

// ─── 1. P&L Dashboard ────────────────────────────────────────────────────────
export function PLDashboard() {
  const { loads, expenses, drivers, fuelCostPerMile } = useCarrier()
  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [period, setPeriod] = useState('month') // month | quarter | ytd | all
  const [breakdown, setBreakdown] = useState('driver')
  const [showPicker, setShowPicker] = useState(false)

  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Build year range from earliest load/expense to current year
  const yearRange = useMemo(() => {
    let min = currentYear
    loads.forEach(l => {
      const d = acctParseDate(l.pickup?.split(' · ')[0]) || new Date(l.pickup_date || l.created_at)
      if (d && d.getFullYear() < min) min = d.getFullYear()
    })
    expenses.forEach(e => {
      const d = acctParseDate(e.date) || new Date(e.date)
      if (d && d.getFullYear() < min) min = d.getFullYear()
    })
    const years = []
    for (let y = currentYear; y >= min; y--) years.push(y)
    return years
  }, [loads, expenses, currentYear])

  // Quarter helpers
  const getQuarter = (m) => Math.floor(m / 3) + 1
  const quarterStartMonth = (q) => (q - 1) * 3

  const periodLoads = useMemo(() => {
    return loads.filter(l => {
      const d = acctParseDate(l.pickup?.split(' · ')[0]) || new Date(l.pickup_date || l.created_at)
      if (!d || isNaN(d)) return false
      if (period === 'all') return true
      if (period === 'month') return d.getMonth() === selMonth && d.getFullYear() === selYear
      if (period === 'quarter') {
        const q = getQuarter(selMonth)
        const qStart = quarterStartMonth(q)
        return d.getFullYear() === selYear && d.getMonth() >= qStart && d.getMonth() < qStart + 3
      }
      if (period === 'ytd') return d.getFullYear() === selYear && d.getMonth() <= selMonth
      return true
    })
  }, [loads, period, selMonth, selYear])

  const periodExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = acctParseDate(e.date) || new Date(e.date)
      if (!d || isNaN(d)) return false
      if (period === 'all') return true
      if (period === 'month') return d.getMonth() === selMonth && d.getFullYear() === selYear
      if (period === 'quarter') {
        const q = getQuarter(selMonth)
        const qStart = quarterStartMonth(q)
        return d.getFullYear() === selYear && d.getMonth() >= qStart && d.getMonth() < qStart + 3
      }
      if (period === 'ytd') return d.getFullYear() === selYear && d.getMonth() <= selMonth
      return true
    })
  }, [expenses, period, selMonth, selYear])

  const goMonth = (dir) => {
    let m = selMonth + dir, y = selYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    if (y > currentYear || (y === currentYear && m > currentMonth)) return
    setSelMonth(m); setSelYear(y); setPeriod('month')
  }

  const pickerRef = useRef(null)
  useEffect(() => {
    if (!showPicker) return
    const handler = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const revenue = useMemo(() => periodLoads.reduce((s, l) => s + (l.gross || l.rate || 0), 0), [periodLoads])
  const loggedExp = useMemo(() => periodExpenses.reduce((s, e) => s + (e.amount || 0), 0), [periodExpenses])

  // Auto-estimate costs from loads when no expenses are logged
  const estimatedCosts = useMemo(() => {
    const fuelRate = fuelCostPerMile || 0.55
    let estFuel = 0, estDriverPay = 0, estOther = 0
    periodLoads.forEach(l => {
      const miles = Number(l.miles) || 0
      const gross = l.gross || l.rate || 0
      // Fuel: miles × fuel cost per mile
      estFuel += miles * fuelRate
      // Driver pay: check driver's pay model
      const drv = drivers.find(d => d.full_name === l.driver || d.id === l.driver_id)
      if (drv && drv.pay_rate) {
        if (drv.pay_model === 'percent') estDriverPay += gross * (Number(drv.pay_rate) / 100)
        else if (drv.pay_model === 'permile') estDriverPay += miles * Number(drv.pay_rate)
        else if (drv.pay_model === 'flat') estDriverPay += Number(drv.pay_rate)
      } else {
        // Default estimate: 28% of gross for driver pay
        estDriverPay += gross * 0.28
      }
      // Other operating costs estimate: ~5% of gross (insurance, maintenance, etc.)
      estOther += gross * 0.05
    })
    return { fuel: Math.round(estFuel), driverPay: Math.round(estDriverPay), other: Math.round(estOther), total: Math.round(estFuel + estDriverPay + estOther) }
  }, [periodLoads, drivers, fuelCostPerMile])

  const hasLoggedExpenses = loggedExp > 0
  const totalExp = hasLoggedExpenses ? loggedExp : estimatedCosts.total
  const net = revenue - totalExp
  const margin = revenue > 0 ? ((net / revenue) * 100).toFixed(1) : '0.0'

  const breakdownData = useMemo(() => {
    const key = breakdown === 'lane'
      ? (l) => `${(l.origin||'').split(',')[0]} → ${(l.dest||'').split(',')[0]}`
      : breakdown === 'broker' ? (l) => l.broker : (l) => l.driver
    const map = {}
    periodLoads.forEach(l => {
      const k = key(l)
      if (!k) return
      if (!map[k]) map[k] = { label:k, rev:0, loads:0 }
      map[k].rev += l.gross || l.rate || 0
      map[k].loads++
    })
    return Object.values(map).sort((a,b) => b.rev - a.rev)
  }, [periodLoads, breakdown])

  const expCats = useMemo(() => {
    if (hasLoggedExpenses) {
      const map = {}
      periodExpenses.forEach(e => {
        if (!map[e.cat]) map[e.cat] = 0
        map[e.cat] += e.amount
      })
      return Object.entries(map).sort((a,b) => b[1] - a[1])
    }
    // Show estimated cost breakdown when no logged expenses
    const cats = []
    if (estimatedCosts.fuel > 0) cats.push(['Fuel (est.)', estimatedCosts.fuel])
    if (estimatedCosts.driverPay > 0) cats.push(['Driver Pay (est.)', estimatedCosts.driverPay])
    if (estimatedCosts.other > 0) cats.push(['Operating (est.)', estimatedCosts.other])
    return cats.sort((a,b) => b[1] - a[1])
  }, [periodExpenses, hasLoggedExpenses, estimatedCosts])

  const maxRev = breakdownData.length ? Math.max(...breakdownData.map(d => d.rev)) : 1

  const periodLabel = period === 'month' ? `${ACCT_MONTHS[selMonth]} ${selYear}`
    : period === 'quarter' ? `Q${getQuarter(selMonth)} ${selYear}`
    : period === 'ytd' ? `YTD ${selYear}`
    : 'All Time'

  const isCurrentMonth = selMonth === currentMonth && selYear === currentYear
  const canGoNext = !(selYear === currentYear && selMonth >= currentMonth)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>P&L DASHBOARD</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Profit & Loss — real-time from your loads and expenses</div>
        </div>
        <div ref={pickerRef} style={{ display:'flex', alignItems:'center', gap:6, position:'relative' }}>
          {/* Month navigation arrows */}
          <button onClick={() => goMonth(-1)}
            style={{ width:30, height:30, borderRadius:8, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
            ‹
          </button>
          <button onClick={() => setShowPicker(!showPicker)}
            style={{ padding:'6px 14px', fontSize:12, fontWeight:700, borderRadius:8, border:'1px solid var(--accent)', background:'rgba(240,165,0,0.1)', color:'var(--accent)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", minWidth:120, textAlign:'center' }}>
            <Calendar size={12} style={{ marginRight:4, verticalAlign:-1 }} />{periodLabel}
          </button>
          <button onClick={() => goMonth(1)} disabled={!canGoNext}
            style={{ width:30, height:30, borderRadius:8, border:'1px solid var(--border)', background:'var(--surface2)', color: canGoNext ? 'var(--text)' : 'var(--muted)', cursor: canGoNext ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, opacity: canGoNext ? 1 : 0.4 }}>
            ›
          </button>
          {/* Quick period buttons */}
          {['month','quarter','ytd','all'].map(p => (
            <button key={p} onClick={() => { setPeriod(p); if (p !== 'all') { setSelMonth(currentMonth); setSelYear(currentYear) }; setShowPicker(false) }}
              style={{ padding:'5px 10px', fontSize:11, fontWeight:600, borderRadius:6, border:'1px solid var(--border)',
                background: period===p ? 'var(--accent)' : 'var(--surface2)',
                color: period===p ? '#000' : 'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textTransform:'uppercase' }}>
              {p === 'month' ? 'MTD' : p === 'quarter' ? 'QTR' : p === 'all' ? 'ALL' : 'YTD'}
            </button>
          ))}

          {/* Month/Year picker dropdown */}
          {showPicker && (
            <div style={{ position:'absolute', top:'100%', right:0, marginTop:6, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16, zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.4)', minWidth:280 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>Select Period</div>
                <button onClick={() => setShowPicker(false)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16 }}>×</button>
              </div>
              {/* Year selector */}
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', marginBottom:6, letterSpacing:0.5 }}>Year</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {yearRange.map(y => (
                    <button key={y} onClick={() => { setSelYear(y); if (y === currentYear && selMonth > currentMonth) setSelMonth(currentMonth) }}
                      style={{ padding:'4px 12px', fontSize:11, fontWeight:600, borderRadius:6, border:'1px solid var(--border)',
                        background: selYear===y ? 'var(--accent)' : 'var(--surface2)',
                        color: selYear===y ? '#000' : 'var(--text)', cursor:'pointer' }}>
                      {y}
                    </button>
                  ))}
                </div>
              </div>
              {/* Month grid */}
              <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', marginBottom:6, letterSpacing:0.5 }}>Month</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4 }}>
                {ACCT_MONTHS.map((m, i) => {
                  const disabled = selYear === currentYear && i > currentMonth
                  return (
                    <button key={m} onClick={() => { if (!disabled) { setSelMonth(i); setPeriod('month'); setShowPicker(false) } }}
                      disabled={disabled}
                      style={{ padding:'6px 4px', fontSize:11, fontWeight:600, borderRadius:6, border:'1px solid var(--border)',
                        background: selMonth===i && period==='month' ? 'var(--accent)' : 'var(--surface2)',
                        color: disabled ? 'var(--muted)' : selMonth===i && period==='month' ? '#000' : 'var(--text)',
                        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1 }}>
                      {m}
                    </button>
                  )
                })}
              </div>
              {/* Quick jump */}
              <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)', display:'flex', gap:6 }}>
                <button onClick={() => { setSelMonth(currentMonth); setSelYear(currentYear); setPeriod('month'); setShowPicker(false) }}
                  style={{ flex:1, padding:'6px 10px', fontSize:11, fontWeight:600, borderRadius:6, border:'1px solid var(--accent)', background:'rgba(240,165,0,0.1)', color:'var(--accent)', cursor:'pointer' }}>
                  This Month
                </button>
                <button onClick={() => { const pm = currentMonth === 0 ? 11 : currentMonth - 1; const py = currentMonth === 0 ? currentYear - 1 : currentYear; setSelMonth(pm); setSelYear(py); setPeriod('month'); setShowPicker(false) }}
                  style={{ flex:1, padding:'6px 10px', fontSize:11, fontWeight:600, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', cursor:'pointer' }}>
                  Last Month
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={S.grid(4)}>
        {[
          { label:'WHAT YOU EARNED', val:`$${revenue.toLocaleString()}`, color:'var(--accent)', icon: DollarSign },
          { label: hasLoggedExpenses ? 'WHAT IT COST' : 'EST. COSTS', val:`$${totalExp.toLocaleString()}`, color:'var(--danger)', icon: TrendingDown },
          { label:'WHAT YOU KEPT', val:`$${net.toLocaleString()}`, color: net>=0 ? 'var(--success)' : 'var(--danger)', icon: BarChart2 },
          { label:'NET MARGIN', val:`${margin}%`, color: parseFloat(margin)>=20 ? 'var(--success)' : 'var(--warning)', icon: TrendingUp },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{typeof k.icon === "string" ? k.icon : <k.icon size={11} />} {k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:34, color:k.color, lineHeight:1 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {revenue === 0 && (
        <div style={{ textAlign:'center', fontSize:12, color:'var(--muted)', padding:'4px 0 8px', lineHeight:1.5 }}>
          Qivori tracks every dollar automatically — no spreadsheets needed.
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}>Revenue Breakdown</div>
            <div style={{ display:'flex', gap:6 }}>
              {['driver','broker','lane'].map(b => (
                <button key={b} onClick={() => setBreakdown(b)}
                  style={{ padding:'4px 12px', fontSize:11, fontWeight:700, borderRadius:6, border:'1px solid var(--border)',
                    background: breakdown===b ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
                    color: breakdown===b ? 'var(--accent)' : 'var(--muted)', cursor:'pointer', textTransform:'capitalize', fontFamily:"'DM Sans',sans-serif" }}>
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:12 }}>
            {breakdownData.length === 0 && <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:13 }}>No data for this period</div>}
            {breakdownData.map((row, i) => (
              <div key={i}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{row.label}</div>
                  <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'var(--muted)' }}>{row.loads} load{row.loads!==1?'s':''}</span>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${row.rev.toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ height:6, borderRadius:3, background:'var(--surface2)' }}>
                  <div style={{ height:6, borderRadius:3, background:'var(--accent)', width:`${(row.rev/maxRev)*100}%`, transition:'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.panel}>
          <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={TrendingDown} /> Expenses by Category</div></div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            {expCats.map(([cat, amt]) => {
              const pct = totalExp > 0 ? ((amt/totalExp)*100).toFixed(0) : 0
              return (
                <div key={cat} style={{ flex:1 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>{cat}</span>
                    <span style={{ fontSize:12, color:'var(--danger)' }}>-${amt.toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ flex:1, height:5, borderRadius:3, background:'var(--surface2)' }}>
                      <div style={{ height:5, borderRadius:3, background:'var(--danger)', width:`${pct}%`, opacity:0.7 }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', width:28, textAlign:'right' }}>{pct}%</div>
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop:8, paddingTop:10, borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>Total Expenses</span>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--danger)' }}>-${totalExp.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Q Profit Engine Insight */}
      <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(34,197,94,0.04))', border:'1px solid rgba(240,165,0,0.2)', borderRadius:14, padding:'16px 20px', display:'flex', gap:14, alignItems:'flex-start' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:'rgba(240,165,0,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Bot size={20} color="var(--accent)" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, letterSpacing:2 }}>Q <span style={{ color:'var(--accent)' }}>P&L ANALYSIS</span></span>
            <span style={{ fontSize:9, padding:'2px 7px', background:'rgba(34,197,94,0.12)', color:'var(--success)', borderRadius:6, fontWeight:800 }}>LIVE</span>
          </div>
          <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.7 }}>
            {parseFloat(margin) >= 30
              ? `Strong ${margin}% margin — above 30% target. ${breakdownData[0]?.label || 'Top performer'} generating $${(breakdownData[0]?.rev||0).toLocaleString()} this period. Profit engine performing.`
              : parseFloat(margin) >= 20
              ? `Margin at ${margin}% — within range but below 30% target. ${breakdownData[0]?.label || 'Best lane'} is your highest earner at $${(breakdownData[0]?.rev||0).toLocaleString()}. Fuel at ${totalExp>0?((expCats.find(c=>c[0]==='Fuel')?.[1]||0)/totalExp*100).toFixed(0):0}% of expenses — route optimization could recover ~$180/wk.`
              : `Margin at ${margin}% — below 20% threshold. Immediate action: review rate acceptance, cut non-essential expenses. Top earner: ${breakdownData[0]?.label||'N/A'} at $${(breakdownData[0]?.rev||0).toLocaleString()}.`}
          </div>
        </div>
        {/* Margin badge */}
        <div style={{ textAlign:'center', flexShrink:0, padding:'6px 14px', borderRadius:10, background: parseFloat(margin)>=30 ? 'rgba(34,197,94,0.08)' : parseFloat(margin)>=20 ? 'rgba(240,165,0,0.08)' : 'rgba(239,68,68,0.08)', border:`1px solid ${parseFloat(margin)>=30 ? 'rgba(34,197,94,0.2)' : parseFloat(margin)>=20 ? 'rgba(240,165,0,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2 }}>MARGIN</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color: parseFloat(margin)>=30?'var(--success)':parseFloat(margin)>=20?'var(--warning)':'var(--danger)', lineHeight:1 }}>{margin}%</div>
          <div style={{ fontSize:9, fontWeight:700, marginTop:2, color: parseFloat(margin)>=30?'var(--success)':parseFloat(margin)>=20?'var(--warning)':'var(--danger)' }}>{parseFloat(margin)>=30?'HEALTHY':parseFloat(margin)>=20?'WATCH':'BELOW'}</div>
        </div>
      </div>
    </div>
  )
}

// ─── 2. Receivables Aging ────────────────────────────────────────────────────
export function ReceivablesAging() {
  const { invoices } = useCarrier()
  const [reminded, setReminded] = useState({})

  const aging = useMemo(() => invoices.map(inv => {
    const days = acctDaysAgo(inv.date)
    const daysUntilDue = acctDaysUntil(inv.dueDate)
    let bucket = '0–30'
    if (days > 60) bucket = '60+'
    else if (days > 30) bucket = '31–60'
    const risk = days > 60 ? 'high' : days > 30 ? 'medium' : 'low'
    return { ...inv, days, daysUntilDue, bucket, risk }
  }), [invoices])

  const buckets = useMemo(() => {
    const b = { '0–30':[], '31–60':[], '60+':[] }
    aging.forEach(inv => { if (b[inv.bucket]) b[inv.bucket].push(inv) })
    return b
  }, [aging])

  const totalUnpaid = aging.filter(i => i.status==='Unpaid').reduce((s,i) => s+i.amount, 0)
  const pastDue = aging.filter(i => i.status==='Unpaid' && i.daysUntilDue < 0).reduce((s,i) => s+i.amount, 0)
  const avgDays = (() => {
    const u = aging.filter(i => i.status==='Unpaid')
    return u.length ? Math.round(u.reduce((s,i) => s+i.days, 0) / u.length) : 0
  })()

  const riskColor = { low:'var(--success)', medium:'var(--warning)', high:'var(--danger)' }
  const riskBg = { low:'rgba(34,197,94,0.1)', medium:'rgba(245,158,11,0.1)', high:'rgba(239,68,68,0.1)' }
  const bucketColor = { '0–30':'var(--success)', '31–60':'var(--warning)', '60+':'var(--danger)' }
  const bucketBg = { '0–30':'rgba(34,197,94,0.1)', '31–60':'rgba(245,158,11,0.1)', '60+':'rgba(239,68,68,0.1)' }

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>RECEIVABLES AGING</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Track outstanding invoices and collection risk</div>
      </div>

      <div style={S.grid(3)}>
        {[
          { label:'TOTAL OUTSTANDING', val:`$${totalUnpaid.toLocaleString()}`, color:'var(--accent)', sub:`${aging.filter(i=>i.status==='Unpaid').length} open invoices` },
          { label:'PAST DUE', val:`$${pastDue.toLocaleString()}`, color:'var(--danger)', sub:'Requires immediate action' },
          { label:'AVG DAYS OUT', val:`${avgDays}d`, color: avgDays > 30 ? 'var(--warning)' : 'var(--success)', sub:'Industry avg: 35 days' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:k.color, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {Object.entries(buckets).map(([bucket, invs]) => (
        <div key={bucket} style={S.panel}>
          <div style={S.panelHead}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={S.panelTitle}>{bucket === '0–30' ? <CheckCircle size={13} /> : bucket === '31–60' ? <AlertCircle size={13} /> : <AlertCircle size={13} color='var(--danger)' />} {bucket} Days</div>
              <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:bucketBg[bucket], color:bucketColor[bucket] }}>
                {invs.length} invoice{invs.length!==1?'s':''} · ${invs.reduce((s,i)=>s+i.amount,0).toLocaleString()}
              </span>
            </div>
          </div>
          {invs.length === 0
            ? <div style={{ padding:'16px 18px', color:'var(--muted)', fontSize:12 }}>No invoices in this bucket.</div>
            : (
              <table>
                <thead><tr>{['Invoice','Broker','Route','Amount','Status','Age','Due','Action'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {invs.map(inv => (
                    <tr key={inv.id}>
                      <td><span style={{ fontFamily:'monospace', fontSize:12 }}>{inv.id}</span></td>
                      <td style={{ fontSize:12 }}>{inv.broker}</td>
                      <td style={{ fontSize:12 }}>{inv.route}</td>
                      <td><span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${inv.amount.toLocaleString()}</span></td>
                      <td><span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:riskBg[inv.risk], color:riskColor[inv.risk] }}>{inv.status}</span></td>
                      <td style={{ fontSize:12, color: inv.days > 45 ? 'var(--danger)' : 'var(--muted)' }}>{inv.days}d</td>
                      <td style={{ fontSize:12, color: inv.daysUntilDue < 0 ? 'var(--danger)' : inv.daysUntilDue < 7 ? 'var(--warning)' : 'var(--muted)' }}>
                        {inv.daysUntilDue < 0 ? `${Math.abs(inv.daysUntilDue)}d overdue` : `${inv.daysUntilDue}d`}
                      </td>
                      <td>
                        {inv.status === 'Unpaid' && (
                          <button onClick={() => setReminded(prev => ({ ...prev, [inv.id]: true }))}
                            style={{ padding:'4px 10px', fontSize:11, fontWeight:700, borderRadius:6, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                              background: reminded[inv.id] ? 'rgba(34,197,94,0.15)' : 'rgba(240,165,0,0.15)',
                              color: reminded[inv.id] ? 'var(--success)' : 'var(--accent)' }}>
                            {reminded[inv.id] ? <><Check size={11} /> Sent</> : <><Send size={13} /> Remind</>}
                          </button>
                        )}
                        {inv.status === 'Paid' && <span style={{ fontSize:11, color:'var(--success)' }}><Check size={11} /> Collected</span>}
                        {inv.status === 'Factored' && <span style={{ fontSize:11, color:'var(--accent3)' }}><Ic icon={Zap} /> Factored</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      ))}

      <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(77,142,240,0.04))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
        <div style={{ fontSize:22 }}><Bot size={20} /></div>
        <div>
          <div style={{ fontWeight:700, marginBottom:4 }}>Collection Intelligence</div>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
            {pastDue > 0
              ? `$${pastDue.toLocaleString()} is past due — send reminders now to avoid write-offs. Average collection time is ${avgDays} days. Consider factoring your oldest outstanding invoice for same-day cash at 2-3% fee.`
              : `All invoices are within terms. Average collection time is ${avgDays} days — below industry average of 35 days. You're in great shape.`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ACCOUNTS PAYABLE ────────────────────────────────────────────────────────
export function AccountsPayable() {
  const { loads, expenses, drivers: ctxDrivers, fuelCostPerMile } = useCarrier()
  const { showToast } = useApp()
  const [payroll, setPayroll] = useState([])
  const [markingPaid, setMarkingPaid] = useState({})

  useEffect(() => {
    import('../../../lib/database').then(db => {
      db.fetchPayroll().then(d => setPayroll(d || [])).catch(() => {})
    })
  }, [])

  // Driver payables — approved payroll not yet marked paid
  const driverPayables = useMemo(() => {
    const driverMap = {}
    ;(ctxDrivers || []).forEach(d => { driverMap[d.id] = d.name || d.full_name || 'Unknown Driver' })
    return payroll
      .filter(p => p.status === 'approved' || p.status === 'pending')
      .map(p => ({
        ...p,
        driverName: driverMap[p.driver_id] || 'Unknown Driver',
        category: 'Driver Pay',
        dueLabel: p.period_end ? new Date(p.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
        amount: Number(p.net_pay || 0),
      }))
  }, [payroll, ctxDrivers])

  // Expense payables — recurring/unpaid expenses
  const expensePayables = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
    return (expenses || [])
      .filter(e => {
        const d = new Date(e.date || e.created_at)
        return d >= thirtyDaysAgo && (e.status === 'pending' || e.status === 'unpaid' || !e.status)
      })
      .map(e => ({
        id: e.id,
        category: e.category || 'Operating Expense',
        vendor: e.vendor || e.description || 'Unknown',
        amount: Number(e.amount || 0),
        date: e.date || e.created_at,
        dueLabel: e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
        status: e.status || 'pending',
      }))
  }, [expenses])

  // Summary numbers
  const totalDriverOwed = driverPayables.reduce((s, p) => s + p.amount, 0)
  const totalExpenseOwed = expensePayables.reduce((s, e) => s + e.amount, 0)
  const totalPayable = totalDriverOwed + totalExpenseOwed

  // Estimated fuel liability from active loads
  const fuelLiability = useMemo(() => {
    const active = (loads || []).filter(l => l.status === 'In Transit' || l.status === 'Dispatched')
    const totalMiles = active.reduce((s, l) => s + (Number(l.miles) || 0), 0)
    const fCost = fuelCostPerMile || 0.65
    return Math.round(totalMiles * fCost)
  }, [loads, fuelCostPerMile])

  const markPayrollPaid = async (id) => {
    setMarkingPaid(prev => ({ ...prev, [id]: true }))
    try {
      const db = await import('../../../lib/database')
      await db.updatePayroll(id, { status: 'paid' })
      setPayroll(prev => prev.map(p => p.id === id ? { ...p, status: 'paid' } : p))
      showToast('', 'Marked Paid', 'Payroll record updated')
    } catch {
      showToast('', 'Error', 'Failed to update payroll status')
    }
    setMarkingPaid(prev => ({ ...prev, [id]: false }))
  }

  const riskColor = (amount) => amount > 5000 ? 'var(--danger)' : amount > 2000 ? 'var(--warning,#f59e0b)' : 'var(--success)'

  return (
    <div style={{ ...S.page, paddingBottom: 40 }}>
      <div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>ACCOUNTS PAYABLE</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Track what you owe — driver pay, expenses & obligations</div>
      </div>

      <div style={S.grid(4)}>
        {[
          { label: 'TOTAL PAYABLE', val: `$${totalPayable.toLocaleString()}`, color: 'var(--danger)', sub: 'All outstanding obligations' },
          { label: 'DRIVER PAY OWED', val: `$${totalDriverOwed.toLocaleString()}`, color: 'var(--accent)', sub: `${driverPayables.length} settlement${driverPayables.length !== 1 ? 's' : ''} pending` },
          { label: 'EXPENSE OBLIGATIONS', val: `$${totalExpenseOwed.toLocaleString()}`, color: 'var(--warning,#f59e0b)', sub: `${expensePayables.length} item${expensePayables.length !== 1 ? 's' : ''}` },
          { label: 'FUEL LIABILITY', val: `$${fuelLiability.toLocaleString()}`, color: 'var(--accent3)', sub: 'Active loads est. fuel cost' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: k.color, lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Driver Payables */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Truck} /> Driver Settlements Owed</div>
        </div>
        {driverPayables.length === 0
          ? <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: 12 }}>No outstanding driver settlements. Run payroll in the Drivers hub to generate settlements.</div>
          : (
            <table>
              <thead><tr>{['Driver', 'Period', 'Loads', 'Miles', 'Gross', 'Deductions', 'Net Owed', 'Status', 'Action'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {driverPayables.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{p.driverName}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{p.period_start?.slice(5)} → {p.period_end?.slice(5)}</td>
                    <td style={{ fontSize: 12 }}>{p.loads_completed || 0}</td>
                    <td style={{ fontSize: 12 }}>{(p.miles_driven || 0).toLocaleString()}</td>
                    <td style={{ fontSize: 12, color: 'var(--accent)' }}>${Number(p.gross_pay || 0).toLocaleString()}</td>
                    <td style={{ fontSize: 12, color: 'var(--danger)' }}>-${Number(p.deductions || 0).toLocaleString()}</td>
                    <td><span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: riskColor(p.amount) }}>${p.amount.toLocaleString()}</span></td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: p.status === 'approved' ? 'rgba(240,165,0,0.1)' : 'rgba(245,158,11,0.1)', color: p.status === 'approved' ? 'var(--accent)' : 'var(--warning)' }}>{p.status}</span></td>
                    <td>
                      <button onClick={() => markPayrollPaid(p.id)} disabled={markingPaid[p.id]}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>
                        {markingPaid[p.id] ? 'Saving...' : <><Check size={11} /> Mark Paid</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {/* Expense Payables */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Receipt} /> Expense Obligations</div>
        </div>
        {expensePayables.length === 0
          ? <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: 12 }}>No pending expense obligations in the last 30 days.</div>
          : (
            <table>
              <thead><tr>{['Category', 'Vendor / Description', 'Amount', 'Date', 'Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {expensePayables.map(e => (
                  <tr key={e.id}>
                    <td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--surface2)' }}>{e.category}</span></td>
                    <td style={{ fontSize: 12 }}>{e.vendor}</td>
                    <td><span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--warning,#f59e0b)' }}>${e.amount.toLocaleString()}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{e.dueLabel}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)' }}>{e.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <div style={{ background: 'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(77,142,240,0.04))', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 22 }}><Bot size={20} /></div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Payables Intelligence</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            {totalPayable > 0
              ? `You owe $${totalPayable.toLocaleString()} total — $${totalDriverOwed.toLocaleString()} to drivers and $${totalExpenseOwed.toLocaleString()} in expenses. ${fuelLiability > 0 ? `Active loads have ~$${fuelLiability.toLocaleString()} in estimated fuel costs.` : ''} Pay driver settlements promptly to maintain retention.`
              : 'All obligations are current — no outstanding payables. Great cash management.'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 4. Cash Runway ────────────────────────────────────────────────────────────
export function CashRunway() {
  const { invoices, expenses } = useCarrier()
  const [cashBalance, setCashBalance] = useState(0)

  const weeklyExpenses = useMemo(() => {
    const total = expenses.reduce((s,e) => s+(e.amount||0), 0)
    return Math.round(total / 4)
  }, [expenses])

  const incomingRevenue = useMemo(() =>
    invoices.filter(i => i.status==='Unpaid').reduce((s,i) => s+(i.amount||0), 0)
  , [invoices])

  const weeks = useMemo(() => {
    let bal = cashBalance
    const weeklyIncoming = [incomingRevenue * 0.4, incomingRevenue * 0.3, incomingRevenue * 0.2, incomingRevenue * 0.1, 0, 0]
    return Array.from({ length:6 }, (_, i) => {
      const incoming = weeklyIncoming[i] || 0
      const outgoing = weeklyExpenses
      bal = bal + incoming - outgoing
      return { week:`Wk ${i+1}`, bal: Math.round(bal), incoming: Math.round(incoming), outgoing: Math.round(outgoing) }
    })
  }, [cashBalance, weeklyExpenses, incomingRevenue])

  const runway = weeks.filter(w => w.bal > 0).length
  const maxBal = Math.max(cashBalance, ...weeks.map(w => w.bal))

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>CASH RUNWAY</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>6-week cash flow projection and liquidity gauge</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 16px' }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>Current Cash $</span>
          <input type="number" value={cashBalance} onChange={e => setCashBalance(Number(e.target.value))}
            style={{ width:100, background:'transparent', border:'none', outline:'none', color:'var(--accent)', fontFamily:"'Bebas Neue',sans-serif", fontSize:22, textAlign:'right' }} />
        </div>
      </div>

      <div style={S.grid(4)}>
        {[
          { label:'CURRENT CASH', val:`$${cashBalance.toLocaleString()}`, color:'var(--accent)', icon: DollarSign },
          { label:'INCOMING A/R', val:`$${incomingRevenue.toLocaleString()}`, color:'var(--success)', icon: Download },
          { label:'WEEKLY BURN', val:`$${weeklyExpenses.toLocaleString()}`, color:'var(--danger)', icon: Flame },
          { label:'RUNWAY', val:`${runway} weeks`, color: runway >= 4 ? 'var(--success)' : runway >= 2 ? 'var(--warning)' : 'var(--danger)', icon: Clock },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{typeof k.icon === "string" ? k.icon : <k.icon size={11} />} {k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:30, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={BarChart2} /> 6-Week Cash Flow Projection</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Includes incoming A/R and projected expenses</div>
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-end', height:180 }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flex:1 }}>
              <div style={{ fontSize:11, color:'var(--accent)', fontWeight:700 }}>${cashBalance.toLocaleString()}</div>
              <div style={{ width:'100%', borderRadius:'4px 4px 0 0', background:'var(--accent)', height:`${Math.max(4, (cashBalance/maxBal)*160)}px` }} />
              <div style={{ fontSize:10, color:'var(--muted)' }}>Now</div>
            </div>
            {weeks.map((w, i) => {
              const h = maxBal > 0 ? Math.max(4, (Math.abs(w.bal)/maxBal)*160) : 4
              const isNeg = w.bal < 0
              const barColor = isNeg ? 'var(--danger)' : w.bal < cashBalance*0.3 ? 'var(--warning)' : 'var(--success)'
              return (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flex:1 }}>
                  <div style={{ fontSize:11, color:barColor, fontWeight:700 }}>{isNeg?'-':''}${Math.abs(w.bal).toLocaleString()}</div>
                  <div style={{ width:'100%', borderRadius:'4px 4px 0 0', background:barColor, height:`${h}px`, opacity:isNeg?0.7:1 }} />
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{w.week}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}><div style={S.panelTitle}>Weekly Cash Flow Detail</div></div>
        <table>
          <thead><tr>{['Week','Incoming A/R','Operating Costs','Net Change','Projected Balance'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {weeks.map((w,i) => {
              const net = w.incoming - w.outgoing
              return (
                <tr key={i}>
                  <td style={{ fontWeight:700 }}>{w.week}</td>
                  <td style={{ color:'var(--success)' }}>+${w.incoming.toLocaleString()}</td>
                  <td style={{ color:'var(--danger)' }}>-${w.outgoing.toLocaleString()}</td>
                  <td style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>{net >= 0?'+':''}{net.toLocaleString()}</td>
                  <td><span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: w.bal<0?'var(--danger)':w.bal<cashBalance*0.3?'var(--warning)':'var(--accent)' }}>${w.bal.toLocaleString()}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(77,142,240,0.04))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
        <div style={{ fontSize:22 }}><Bot size={20} /></div>
        <div>
          <div style={{ fontWeight:700, marginBottom:4 }}>Cash Flow Intelligence</div>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
            {runway >= 4
              ? `${runway}-week runway is healthy. You have $${incomingRevenue.toLocaleString()} in outstanding A/R — collect by end of month to maintain positive trajectory. Consider factoring your oldest invoice for same-day liquidity at 2.5% fee.`
              : `Cash runway is only ${runway} weeks. Collect outstanding A/R immediately — send reminders from Receivables Aging. Consider factoring to close the gap.`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 5. QuickBooks Export ─────────────────────────────────────────────────────
export function QuickBooksExport() {
  const { loads, invoices, expenses, user } = useCarrier()
  const [connected, setConnected] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [exported, setExported] = useState({})

  // Check QB connection status on mount
  useEffect(() => {
    if (!user?.id) return
    fetch('/api/quickbooks-auth', {
      headers: { 'Authorization': `Bearer ${user.access_token || ''}` }
    }).then(r => r.json()).then(data => {
      if (data.connected) {
        setConnected(true)
        setCompanyName(data.company_name || '')
      }
    }).catch(() => {})
  }, [user?.id])

  const handleConnect = async () => {
    if (connected) {
      setLoading(true)
      try {
        await fetch('/api/quickbooks-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.access_token || ''}` },
          body: JSON.stringify({ action: 'disconnect' })
        })
        setConnected(false)
        setCompanyName('')
      } catch {}
      setLoading(false)
    } else {
      setLoading(true)
      try {
        const res = await fetch(`/api/quickbooks-auth?action=authorize&user_id=${user.id}`)
        const data = await res.json()
        if (data.url) window.location.href = data.url
      } catch {}
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setLoading(true)
    try {
      await fetch('/api/quickbooks-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.access_token || ''}` },
        body: JSON.stringify({ user_id: user.id })
      })
    } catch {}
    setLoading(false)
  }

  const QB_MAPPING = [
    { qivori:'Gross Revenue',  qb:'Income:Freight Revenue',           type:'Income'  },
    { qivori:'Fuel',           qb:'Expenses:Fuel & Mileage',          type:'Expense' },
    { qivori:'Maintenance',    qb:'Expenses:Repairs & Maintenance',   type:'Expense' },
    { qivori:'Tolls',          qb:'Expenses:Travel:Tolls',            type:'Expense' },
    { qivori:'Lumper',         qb:'Expenses:Lumper Fees',             type:'Expense' },
    { qivori:'Permits',        qb:'Expenses:Permits & Licenses',      type:'Expense' },
    { qivori:'Driver Pay',     qb:'Expenses:Contract Labor',          type:'Expense' },
    { qivori:'Factoring Fees', qb:'Expenses:Factoring Fees',          type:'Expense' },
  ]

  const csvRows = useMemo(() => {
    const rows = []
    invoices.forEach(inv => {
      rows.push({ date:inv.date, type:'Invoice', account:'Income:Freight Revenue',
        description:`${inv.id} - ${inv.broker} - ${inv.route}`, amount:inv.amount, cls:inv.driver||'', status:inv.status })
    })
    expenses.forEach(exp => {
      const acct = QB_MAPPING.find(m => exp.cat.includes(m.qivori))?.qb || 'Expenses:Miscellaneous'
      rows.push({ date:exp.date, type:'Expense', account:acct,
        description:`${exp.cat} - ${exp.merchant}`, amount:-exp.amount, cls:exp.driver||'', status:'Posted' })
    })
    return rows.sort((a,b) => (acctParseDate(b.date)||0) - (acctParseDate(a.date)||0))
  }, [invoices, expenses])

  const downloadCSV = (subset, name) => {
    const headers = ['Date','Type','Account','Description','Amount','Class/Driver','Status']
    const lines = [headers.join(','), ...subset.map(r =>
      [r.date, r.type, `"${r.account}"`, `"${r.description}"`, r.amount, `"${r.cls}"`, r.status].join(',')
    )]
    const blob = new Blob([lines.join('\n')], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href=url; a.download=`qivori-${name}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExported(prev => ({ ...prev, [name]: true }))
  }

  const totalRevenue = invoices.reduce((s,i) => s+i.amount, 0)
  const totalExpAmt = expenses.reduce((s,e) => s+e.amount, 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>QUICKBOOKS EXPORT</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Export freight accounting data with proper QB account mapping</div>
      </div>

      {/* QB Connection Banner */}
      <div style={{ background: connected ? 'rgba(34,197,94,0.08)' : 'rgba(77,142,240,0.08)',
        border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : 'rgba(77,142,240,0.3)'}`, borderRadius:12, padding:'16px 20px',
        display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ fontSize:32 }}><CheckCircle size={32} /></div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>{connected ? `QuickBooks Online Connected${companyName ? ` — ${companyName}` : ''}` : 'QuickBooks Online Integration'}</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>
            {connected
              ? 'Auto-sync enabled — transactions push to QuickBooks automatically every night at 2 AM.'
              : 'Connect QuickBooks Online to sync invoices and expenses automatically, or use CSV export below.'}
          </div>
        </div>
        {connected && (
          <button onClick={handleSync} disabled={loading}
            style={{ padding:'10px 16px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              background:'rgba(34,197,94,0.15)', color:'var(--success)', opacity: loading ? 0.5 : 1 }}>
            Sync Now
          </button>
        )}
        <button onClick={handleConnect} disabled={loading}
          style={{ padding:'10px 20px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            background: connected ? 'rgba(239,68,68,0.15)' : 'var(--accent3)', color: connected ? 'var(--danger)' : '#fff', opacity: loading ? 0.5 : 1 }}>
          {loading ? '...' : connected ? 'Disconnect' : <><Paperclip size={13} /> Connect QuickBooks</>}
        </button>
      </div>

      {/* Export Cards */}
      <div style={S.grid(3)}>
        {[
          { name:'invoices', icon: FileText, title:'Invoices & Revenue', desc:`${invoices.length} transactions · $${totalRevenue.toLocaleString()} total`, rows:csvRows.filter(r=>r.type==='Invoice') },
          { name:'expenses', icon: TrendingDown, title:'Expenses & Costs',   desc:`${expenses.length} transactions · $${totalExpAmt.toLocaleString()} total`,  rows:csvRows.filter(r=>r.type==='Expense') },
          { name:'all',      icon: Package, title:'Full P&L Export',    desc:`${csvRows.length} total transactions`,                                        rows:csvRows },
        ].map(card => (
          <div key={card.name} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:28, marginBottom:10 }}>{typeof card.icon === "string" ? card.icon : <card.icon size={28} />}</div>
            <div style={{ fontWeight:700, marginBottom:4 }}>{card.title}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>{card.desc}</div>
            <button onClick={() => downloadCSV(card.rows, card.name)}
              style={{ width:'100%', padding:'10px 0', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                background: exported[card.name] ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
                color: exported[card.name] ? 'var(--success)' : '#000' }}>
              {exported[card.name] ? <><Check size={11} /> Downloaded</> : <><Download size={13} /> Download CSV</>}
            </button>
          </div>
        ))}
      </div>

      {/* Account Mapping */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Layers} /> Account Mapping</div>
          <span style={{ fontSize:11, color:'var(--muted)' }}>Qivori category → QuickBooks account</span>
        </div>
        <table>
          <thead><tr>{['Qivori Category','QuickBooks Account','Type'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {QB_MAPPING.map(m => (
              <tr key={m.qivori}>
                <td style={{ fontWeight:600 }}>{m.qivori}</td>
                <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--accent3)' }}>{m.qb}</td>
                <td>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                    background: m.type==='Income' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: m.type==='Income' ? 'var(--success)' : 'var(--danger)' }}>{m.type}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Eye} /> Export Preview</div>
          <span style={{ fontSize:11, color:'var(--muted)' }}>Last {Math.min(csvRows.length,8)} rows</span>
        </div>
        <table>
          <thead><tr>{['Date','Type','Account','Description','Amount','Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {csvRows.slice(0,8).map((r,i) => (
              <tr key={i}>
                <td style={{ fontSize:12 }}>{r.date}</td>
                <td><span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                  background: r.type==='Invoice'?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',
                  color: r.type==='Invoice'?'var(--success)':'var(--danger)' }}>{r.type}</span></td>
                <td style={{ fontSize:11, color:'var(--accent3)', fontFamily:'monospace' }}>{r.account}</td>
                <td style={{ fontSize:12 }}>{r.description}</td>
                <td style={{ fontWeight:700, color: r.amount>=0?'var(--success)':'var(--danger)' }}>
                  {r.amount>=0?'+':''}${Math.abs(r.amount).toLocaleString()}
                </td>
                <td><span style={{ fontSize:11, color: r.status==='Paid'?'var(--success)':r.status==='Unpaid'?'var(--warning)':'var(--muted)' }}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
