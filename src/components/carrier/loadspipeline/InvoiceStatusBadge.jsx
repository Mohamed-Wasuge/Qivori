import React from 'react'

export function InvoiceStatusBadge({ status }) {
  const styles = {
    Unpaid:   { bg:'rgba(240,165,0,0.12)', color:'#f0a500', label:'Sent' },
    Sent:     { bg:'rgba(240,165,0,0.12)', color:'#f0a500', label:'Sent' },
    Viewed:   { bg:'rgba(59,130,246,0.12)', color:'#3b82f6', label:'Viewed' },
    Paid:     { bg:'rgba(34,197,94,0.12)', color:'#22c55e', label:'Paid' },
    Overdue:  { bg:'rgba(239,68,68,0.12)', color:'#ef4444', label:'Overdue' },
    Factored: { bg:'rgba(139,92,246,0.12)', color:'#8b5cf6', label:'Factored' },
    Disputed: { bg:'rgba(239,68,68,0.12)', color:'#ef4444', label:'Disputed' },
  }
  const st = styles[status] || styles.Unpaid
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8, background:st.bg, color:st.color, letterSpacing:0.5 }}>
      {st.label}
    </span>
  )
}
