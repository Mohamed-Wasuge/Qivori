import React from 'react'
import { Q_DECISION_COLORS, QDecisionBadge, RateBadge } from './helpers'

export const KANBAN_COLUMNS = [
  { id:'booked',     label:'Booked',     statuses:['Rate Con Received','Booked'], color:'var(--accent)' },
  { id:'dispatched', label:'Dispatched',  statuses:['Assigned to Driver','En Route to Pickup'], color:'var(--accent3)' },
  { id:'in-transit', label:'In Transit',  statuses:['Loaded','In Transit','At Pickup','At Delivery'], color:'var(--success)' },
  { id:'delivered',  label:'Delivered',   statuses:['Delivered'], color:'var(--accent2)' },
  { id:'invoiced',   label:'Invoiced',    statuses:['Invoiced'], color:'var(--accent3)' },
  { id:'paid',       label:'Paid',        statuses:['Paid'], color:'var(--success)' },
]

export function KanbanCard({ load, onClick, onDragStart, qResult }) {
  const origin = (load.origin || '').split(',')[0] || '—'
  const dest = (load.dest || load.destination || '').split(',')[0] || '—'
  const gross = load.gross || load.gross_pay || 0
  const rpm = load.rate || (load.miles > 0 ? (gross / load.miles).toFixed(2) : '—')
  const dc = qResult ? Q_DECISION_COLORS[qResult.decision] : null
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('loadId', load.loadId || load.id); onDragStart?.() }}
      onClick={() => onClick?.(load)}
      style={{ background:'var(--surface2)', border:`1px solid ${dc ? dc.border : 'var(--border)'}`, borderRadius:10, padding:'12px 14px',
        cursor:'pointer', transition:'all 0.12s', marginBottom:8, position:'relative', overflow:'hidden' }}
      onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-1px)' }}
      onMouseOut={e => { e.currentTarget.style.borderColor = dc ? dc.border : 'var(--border)'; e.currentTarget.style.transform='none' }}>
      {/* Q decision glow line */}
      {dc && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${dc.color}60, transparent)` }} />}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
          {load.load_source === 'amazon_relay' && (
            <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:4, background:'rgba(255,153,0,0.15)', color:'#ff9900', letterSpacing:0.3 }}>RELAY</span>
          )}
        </div>
        {qResult ? <QDecisionBadge decision={qResult.decision} compact /> : (
          <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:6, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{load.status}</span>
        )}
      </div>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>{origin} → {dest}</div>
      <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--muted)', marginBottom:4 }}>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${gross.toLocaleString()}</span>
        <span>${rpm}/mi</span>
        <span>{(load.miles || 0).toLocaleString()} mi</span>
      </div>
      {/* Q profit + broker score row */}
      {qResult && (
        <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:4, flexWrap:'wrap' }}>
          <span style={{ fontSize:9, fontWeight:700, color: qResult.estProfit > 0 ? 'var(--success)' : 'var(--danger)', fontFamily:"'JetBrains Mono',monospace" }}>
            P: ${qResult.estProfit.toLocaleString()}
          </span>
          <span style={{ fontSize:9, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>${qResult.profitPerMile}/mi</span>
          {qResult.brokerScore && (
            <span style={{ fontSize:8, fontWeight:700, padding:'1px 4px', borderRadius:3,
              background: qResult.brokerScore === 'A' ? 'rgba(52,176,104,0.12)' : qResult.brokerScore === 'C' ? 'rgba(239,68,68,0.12)' : 'rgba(240,165,0,0.12)',
              color: qResult.brokerScore === 'A' ? 'var(--success)' : qResult.brokerScore === 'C' ? 'var(--danger)' : 'var(--accent)' }}>
              {qResult.brokerScore}
            </span>
          )}
          {load.weight > 0 && <span style={{ fontSize:8, color: qResult.isHeavy ? 'var(--warning)' : 'var(--muted)' }}>{(load.weight/1000).toFixed(0)}K lbs</span>}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:10, color:'var(--muted)' }}>
        <span>{load.driver || 'Unassigned'}</span>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <RateBadge rpm={rpm} equipment={load.equipment} compact />
          <span style={load.load_source === 'amazon_relay' ? { color:'#ff9900', fontWeight:600 } : undefined}>{load.broker || ''}</span>
        </div>
      </div>
      {/* Q one-line reason */}
      {qResult && qResult.summaryReason && (
        <div style={{ marginTop:4, fontSize:9, color:'var(--muted)', fontStyle:'italic', lineHeight:1.3, borderTop:'1px solid var(--border)', paddingTop:4 }}>
          {qResult.summaryReason.length > 80 ? qResult.summaryReason.substring(0, 80) + '...' : qResult.summaryReason}
        </div>
      )}
    </div>
  )
}
