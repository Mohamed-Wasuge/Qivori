import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart2, DollarSign, CheckCircle,
  Calendar, TrendingUp, TrendingDown, Bot, AlertCircle
} from 'lucide-react'
import { Ic, S, StatCard } from '../../shared'
import { useCarrier } from '../../../../context/CarrierContext'
import { ACCT_MONTHS, acctParseDate } from '../helpers'

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
        // No driver-level pay info configured, return 0
        estDriverPay += 0
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
