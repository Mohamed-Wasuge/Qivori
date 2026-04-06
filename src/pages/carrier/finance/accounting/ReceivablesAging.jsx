import React, { useState, useMemo } from 'react'
import {
  CheckCircle, AlertCircle, Zap, Check, Send, Bot
} from 'lucide-react'
import { Ic, S } from '../../shared'
import { useCarrier } from '../../../../context/CarrierContext'
import { acctDaysAgo, acctDaysUntil } from '../helpers'

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
