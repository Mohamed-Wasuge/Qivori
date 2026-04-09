import React, { useState, useEffect } from 'react'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { Zap, Clock, FileText, Check } from 'lucide-react'

// ─── INVOICING SETTINGS ─────────────────────────────────────────────────────
// Persists to companies.auto_invoice + companies.invoice_terms (added 2026-04-09).
// CarrierContext.jsx:556 reads company.auto_invoice to gate the on-Delivery
// auto-invoice flow. Changing the toggle here actually changes that behavior.
export function InvoicingSettings() {
  const { showToast } = useApp()
  const { company, updateCompany } = useCarrier()
  const [autoInvoice, setAutoInvoice] = useState(false)
  const [defaultTerms, setDefaultTerms] = useState('Net 30')

  // Sync local state from CarrierContext on mount + when company refetches.
  useEffect(() => {
    if (company) {
      setAutoInvoice(!!company.auto_invoice)
      setDefaultTerms(company.invoice_terms || 'Net 30')
    }
  }, [company?.auto_invoice, company?.invoice_terms])

  const toggleAutoInvoice = async () => {
    const next = !autoInvoice
    setAutoInvoice(next) // optimistic
    try {
      await updateCompany({ auto_invoice: next })
      showToast('', 'Auto-Invoice', next ? 'Enabled — invoices will be generated on delivery' : 'Disabled')
    } catch (err) {
      setAutoInvoice(!next) // rollback
      showToast('error', 'Save Failed', err.message || 'Could not update auto-invoice setting')
    }
  }

  const saveTerms = async () => {
    try {
      await updateCompany({ invoice_terms: defaultTerms })
      showToast('', 'Saved', `Default terms set to ${defaultTerms}`)
    } catch (err) {
      showToast('error', 'Save Failed', err.message || 'Could not save invoice terms')
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>INVOICING</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Configure automatic invoicing when loads are delivered</div>
      </div>

      {/* Auto-Invoice Toggle */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <Zap size={14} style={{ color:'var(--accent)' }} /> Auto-Invoice on Delivery
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>Automatically generate & send invoices</div>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
                When a load is marked as "Delivered", Qivori will automatically generate a professional invoice and email it to the broker. The load status will be updated to "Invoiced".
              </div>
            </div>
            <div onClick={toggleAutoInvoice}
              style={{ width:44, height:24, borderRadius:12, background: autoInvoice ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s', flexShrink:0, marginLeft:16 }}>
              <div style={{ position:'absolute', top:3, left: autoInvoice ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
            </div>
          </div>

          {autoInvoice && (
            <div style={{ background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:8, padding:12, fontSize:11, color:'var(--accent)', lineHeight:1.6 }}>
              Auto-invoicing is active. Invoices will be emailed to the broker's email address on file. Make sure your broker email addresses are up to date on each load.
            </div>
          )}
        </div>
      </div>

      {/* Payment Terms */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <Clock size={14} style={{ color:'var(--accent)' }} /> Default Payment Terms
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', gap:8 }}>
            {['Net 15', 'Net 30', 'Net 45', 'Net 60'].map(term => (
              <button key={term} onClick={() => setDefaultTerms(term)}
                style={{ padding:'8px 16px', borderRadius:8, border: defaultTerms === term ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: defaultTerms === term ? 'rgba(240,165,0,0.1)' : 'var(--surface2)',
                  color: defaultTerms === term ? 'var(--accent)' : 'var(--text)',
                  fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                {term}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={saveTerms}>Save Settings</button>
        </div>
      </div>

      {/* Invoice Status Legend */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <FileText size={14} style={{ color:'var(--accent)' }} /> Invoice Status Guide
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:10 }}>
          {[
            { status:'Sent',     color:'#f0a500', bg:'rgba(240,165,0,0.12)',  desc:'Invoice has been generated and emailed to the broker' },
            { status:'Viewed',   color:'#3b82f6', bg:'rgba(59,130,246,0.12)', desc:'Broker has opened the invoice email' },
            { status:'Paid',     color:'#22c55e', bg:'rgba(34,197,94,0.12)',  desc:'Payment received — load fully settled' },
            { status:'Overdue',  color:'#ef4444', bg:'rgba(239,68,68,0.12)',  desc:'Payment is past due date — follow up recommended' },
            { status:'Factored', color:'#8b5cf6', bg:'rgba(139,92,246,0.12)', desc:'Invoice has been factored for early payment' },
          ].map(s => (
            <div key={s.status} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8, background:s.bg, color:s.color, minWidth:70, textAlign:'center' }}>{s.status}</span>
              <span style={{ fontSize:12, color:'var(--muted)' }}>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:14 }}>
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          Invoices are emailed from your carrier identity (company name + email on Settings → Company Profile). Broker replies go to your company email. Rate limited to 10 invoices per minute. You can view, print, or resend any invoice from the load detail drawer.
        </div>
      </div>
    </div>
  )
}
