import React, { useState, useMemo } from 'react'
import {
  BarChart2, DollarSign, Download, Flame, Clock, Bot
} from 'lucide-react'
import { Ic, S } from '../../shared'
import { useCarrier } from '../../../../context/CarrierContext'

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
