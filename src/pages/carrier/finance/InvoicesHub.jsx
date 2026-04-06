import React, { useState, useMemo, useEffect } from 'react'
import {
  Clock, FileText, Zap, CheckCircle, AlertTriangle,
  Download, Send, Check, DollarSign, X, Upload,
  CheckSquare, Square
} from 'lucide-react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { generateInvoicePDF } from '../../../utils/generatePDF'
import { apiFetch } from '../../../lib/api'
import { acctParseDate, acctDaysAgo, acctDaysUntil } from './helpers'

// ── Payment Uploader (AI reads check stubs / ACH receipts) ────────────────
function PaymentUploader({ inv, onComplete }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)

  const handleUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png,.heic'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      setResult(null)
      try {
        // Upload to Supabase Storage
        const { uploadFile } = await import('../../../lib/storage')
        const uploaded = await uploadFile(file, `payments/${inv._dbId || inv.id}`)

        // Send to AI for processing
        const res = await apiFetch('/api/process-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: uploaded.url, invoice_id: inv._dbId || inv.id }),
        })
        if (res.ok) {
          const data = await res.json()
          setResult(data)
          if (onComplete) onComplete(data)
        } else {
          setResult({ error: 'Could not process payment' })
        }
      } catch (err) {
        setResult({ error: err.message || 'Upload failed' })
      }
      setUploading(false)
    }
    input.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button className="btn btn-ghost" disabled={uploading}
        style={{ fontSize: 12, padding: '8px 16px', color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.3)' }}
        onClick={handleUpload}>
        <Ic icon={Upload} size={13} /> {uploading ? 'AI Processing...' : 'Upload Payment Confirmation'}
      </button>
      {result && !result.error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, fontSize: 11,
          background: result.short_pay?.detected ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
          border: `1px solid ${result.short_pay?.detected ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
          color: result.short_pay?.detected ? 'var(--danger)' : 'var(--success)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>
            {result.short_pay?.detected ? 'SHORT PAY DETECTED' : 'PAYMENT CONFIRMED'}
          </div>
          <div style={{ color: 'var(--text)' }}>{result.message}</div>
          {result.short_pay?.detected && (
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
              Invoiced: ${result.short_pay.invoiced?.toLocaleString()} | Received: ${result.short_pay.received?.toLocaleString()} | Short: ${result.short_pay.short?.toLocaleString()}
              {result.short_pay.reason && ` | Reason: ${result.short_pay.reason}`}
            </div>
          )}
        </div>
      )}
      {result?.error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', padding: '6px 0' }}>{result.error}</div>
      )}
    </div>
  )
}

// ── Factor Panel (payment terms selector + auto-PDF) ──────────────────────
function FactorPanel({ inv, factorCompany, factorRate, net, onSubmit }) {
  const [payTerms, setPayTerms] = useState('same_day')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState('')

  const generateAndUploadPDF = async () => {
    try {
      setStatus('Generating invoice PDF...')
      // Generate PDF client-side
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt', format: 'letter' })
      const W = 612, P = 50
      const navy = [26, 54, 93], blk = [17, 24, 39], gry = [107, 114, 128], bdr = [229, 231, 235], wht = [255, 255, 255]

      // White background + accent bar
      doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, 792, 'F')
      doc.setFillColor(...navy); doc.rect(0, 0, W, 4, 'F')

      // Company name
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...blk)
      doc.text(inv.companyName || 'Qivori Transport', P, 40)
      doc.setFontSize(9); doc.setTextColor(...gry)
      doc.text([inv.companyMC || '', inv.companyDOT || ''].filter(Boolean).join('  |  '), P, 54)
      doc.text([inv.companyAddress || '', inv.companyPhone || '', inv.companyEmail || ''].filter(Boolean).join('  |  '), P, 66)

      // INVOICE title
      doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...navy)
      doc.text('INVOICE', W - P, 40, { align: 'right' })
      doc.setFontSize(10); doc.setTextColor(...gry)
      doc.text(inv.invoice_number || inv.id || '', W - P, 56, { align: 'right' })

      doc.setDrawColor(...bdr); doc.line(P, 80, W - P, 80)

      // Bill To
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gry); doc.text('BILL TO', P, 100)
      doc.setFontSize(14); doc.setTextColor(...blk); doc.text(inv.broker || '—', P, 118)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gry); doc.text('Freight Broker', P, 132)

      // Remit To (factoring)
      if (factorCompany) {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...gry); doc.text('REMIT PAYMENT TO', P, 152)
        doc.setFontSize(11); doc.setTextColor(...blk); doc.text(factorCompany, P, 166)
      }

      // Meta
      const meta = [['Invoice Date', inv.date || '—'], ['Due Date', inv.dueDate || '—'], ['Load', inv.loadId || inv.load_number || '—'], ['Route', (inv.route || '').replace(/→/g, 'to')], ['Driver', inv.driver || '—']]
      let mY = 100
      meta.forEach(([l, v]) => {
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gry); doc.text(l.toUpperCase(), W - P - 130, mY)
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...blk); doc.setFontSize(9); doc.text(String(v), W - P, mY, { align: 'right' }); mY += 16
      })

      // Line items header
      const tY = 200
      doc.setFillColor(248, 250, 252); doc.rect(P, tY, W - P * 2, 28, 'F')
      doc.setDrawColor(...bdr); doc.line(P, tY + 28, W - P, tY + 28)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gry)
      doc.text('DESCRIPTION', P + 12, tY + 18); doc.text('AMOUNT', W - P - 12, tY + 18, { align: 'right' })

      // Line item
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...blk)
      doc.text('Freight services — ' + ((inv.route || '').replace(/→/g, 'to')), P + 12, tY + 50)
      doc.setFontSize(9); doc.setTextColor(...gry)
      doc.text('Load ' + (inv.loadId || inv.load_number || '') + ' · ' + (inv.broker || ''), P + 12, tY + 64)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...navy)
      doc.text('$' + (inv.amount || 0).toLocaleString(), W - P - 12, tY + 55, { align: 'right' })
      doc.setDrawColor(...bdr); doc.line(P, tY + 76, W - P, tY + 76)

      // Factoring breakdown
      const fY = tY + 96
      doc.setFillColor(255, 250, 235); doc.roundedRect(P, fY, W - P * 2, 72, 4, 4, 'F')
      doc.setDrawColor(240, 165, 0); doc.roundedRect(P, fY, W - P * 2, 72, 4, 4, 'S')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gry)
      doc.text('Invoice Amount', P + 14, fY + 20)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...blk)
      doc.text('$' + (inv.amount || 0).toLocaleString(), W - P - 14, fY + 20, { align: 'right' })
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...gry)
      doc.text('Factoring Fee (' + factorRate + '%)', P + 14, fY + 38)
      doc.setTextColor(220, 38, 38)
      doc.text('-$' + Math.round((inv.amount || 0) * factorRate / 100).toLocaleString(), W - P - 14, fY + 38, { align: 'right' })
      doc.setDrawColor(240, 165, 0); doc.line(P + 14, fY + 48, W - P - 14, fY + 48)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(240, 165, 0)
      doc.text('ADVANCE AMOUNT', P + 14, fY + 65)
      doc.text('$' + net.toLocaleString(), W - P - 14, fY + 65, { align: 'right' })

      // Payment terms
      const pY = fY + 90
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy)
      doc.text('PAYMENT TERMS', P, pY)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...blk)
      const termsText = payTerms === 'same_day' ? 'SAME DAY PAY' : payTerms === 'next_day' ? 'NEXT BUSINESS DAY' : 'STANDARD (per agreement)'
      doc.text(termsText, P, pY + 16)

      // Footer
      doc.setDrawColor(...bdr); doc.line(P, 720, W - P, 720)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...gry)
      doc.text('Generated by Qivori AI TMS  |  qivori.com', W / 2, 740, { align: 'center' })

      // Convert to blob and upload
      setStatus('Uploading PDF...')
      const pdfBlob = doc.output('blob')
      const fileName = (inv.invoice_number || inv.id || 'invoice') + '-factoring.pdf'

      const { uploadFile } = await import('../../../lib/storage')
      const uploaded = await uploadFile(new File([pdfBlob], fileName, { type: 'application/pdf' }), 'invoices/' + (inv._dbId || inv.id))
      return uploaded.url
    } catch (err) {
      console.error('PDF generation failed:', err)
      return null
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'12px 0', borderTop:'1px solid var(--border)', marginTop:8 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#8b5cf6', textTransform:'uppercase', letterSpacing:0.5 }}>Factor this invoice</div>
      <div style={{ display:'flex', gap:6 }}>
        {[
          { id:'same_day', label:'Same Day Pay', desc:'Funds today' },
          { id:'next_day', label:'Next Day', desc:'Next business day' },
          { id:'standard', label:'Standard', desc:'Per agreement' },
        ].map(t => (
          <button key={t.id} onClick={() => setPayTerms(t.id)}
            style={{
              flex:1, padding:'8px 6px', borderRadius:8, cursor:'pointer', textAlign:'center',
              border: payTerms === t.id ? '2px solid #8b5cf6' : '1px solid var(--border)',
              background: payTerms === t.id ? 'rgba(139,92,246,0.1)' : 'var(--surface2)',
              color: payTerms === t.id ? '#8b5cf6' : 'var(--muted)',
              fontFamily: "'DM Sans',sans-serif",
            }}>
            <div style={{ fontSize:11, fontWeight:700 }}>{t.label}</div>
            <div style={{ fontSize:9, opacity:0.7 }}>{t.desc}</div>
          </button>
        ))}
      </div>
      <div style={{ fontSize:10, color:'var(--muted)' }}>
        Generates professional PDF invoice + attaches all docs (BOL, rate con, POD) and sends to {factorCompany}
      </div>
      {status && <div style={{ fontSize:10, color:'#8b5cf6' }}>{status}</div>}
      <button className="btn btn-ghost" disabled={submitting}
        style={{ fontSize:12, padding:'10px 16px', color:'#8b5cf6', borderColor:'rgba(139,92,246,0.3)', fontWeight:700 }}
        onClick={async () => {
          setSubmitting(true)
          const pdfUrl = await generateAndUploadPDF()
          setStatus(pdfUrl ? 'Sending to factoring company...' : 'Sending without PDF...')
          await onSubmit(payTerms, pdfUrl)
          setStatus('')
          setSubmitting(false)
        }}>
        <Ic icon={Zap} size={13} /> {submitting ? status || 'Processing...' : `Factor — $${net.toLocaleString()} (${factorRate}% fee)`}
      </button>
    </div>
  )
}

// ─── INVOICES HUB ─────────────────────────────────────────────────────────────
export function InvoicesHub() {
  const { showToast } = useApp()
  const { invoices, loads, updateInvoiceStatus, company: carrierCompany } = useCarrier()
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedInv, setSelectedInv] = useState(null)
  const [invDocs, setInvDocs] = useState([])
  const [selectedInvoices, setSelectedInvoices] = useState(new Set())
  const [batchBusy, setBatchBusy] = useState(false)

  // Send payment reminder email to broker (or fallback to mailto)
  const sendPaymentReminder = async (inv, e) => {
    if (e) e.stopPropagation()
    const brokerEmail = inv.broker_email || inv.linkedLoad?.broker_email || inv.linkedLoad?.brokerEmail || ''
    const carrierName = carrierCompany?.company_name || carrierCompany?.name || 'Our Company'
    const invoiceNum = inv.invoice_number || inv.id
    const amount = (inv.amount || 0).toLocaleString()
    const subject = `Payment Reminder — Invoice ${invoiceNum} — $${amount}`
    const body = `Dear ${inv.broker || 'Broker'},\n\nThis is a friendly reminder that Invoice ${invoiceNum} for $${amount} (${inv.route || 'N/A'}) is ${inv.isOverdue ? Math.abs(inv.daysUntilDue) + ' days overdue' : 'due ' + (inv.dueDate || 'soon')}.\n\nPlease remit payment at your earliest convenience. If payment has already been sent, kindly disregard this notice.\n\nThank you for your business.\n\nBest regards,\n${carrierName}`

    if (brokerEmail) {
      try {
        await apiFetch('/api/send-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: brokerEmail,
            carrierName,
            invoiceNumber: `${invoiceNum} — PAYMENT REMINDER`,
            loadNumber: inv.loadId || inv.load_number || '—',
            route: inv.route || '—',
            dueDate: inv.isOverdue ? `OVERDUE (${Math.abs(inv.daysUntilDue)}d)` : (inv.dueDate || 'Net 30'),
            amount: inv.amount || 0,
          }),
        })
        showToast('', 'Reminder Sent!', `Payment reminder emailed to ${brokerEmail}`)
      } catch {
        showToast('', 'Email Failed', 'Could not send — opening mailto instead')
        window.open(`mailto:${brokerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
      }
    } else {
      // No broker email — copy to clipboard and open blank mailto
      try { await navigator.clipboard.writeText(body) } catch {}
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
      showToast('', 'No Broker Email', 'Opened mailto — paste or type broker email. Reminder text copied to clipboard.')
    }
  }

  // ── Batch selection helpers ──
  const toggleSelect = (id) => {
    setSelectedInvoices(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelectedInvoices(prev => {
      const filteredIds = filtered.map(i => i.id)
      const allSelected = filteredIds.length > 0 && filteredIds.every(id => prev.has(id))
      if (allSelected) return new Set()
      return new Set(filteredIds)
    })
  }
  const clearSelection = () => setSelectedInvoices(new Set())

  // Clear selection when filter/search changes
  useEffect(() => { clearSelection() }, [filter, search])

  // ── Batch operations ──
  const batchMarkPaid = async () => {
    setBatchBusy(true)
    let count = 0
    for (const id of selectedInvoices) {
      const inv = enriched.find(i => i.id === id)
      if (inv && inv.status === 'Unpaid') {
        updateInvoiceStatus(inv.id || inv.invoice_number, 'Paid')
        count++
      }
    }
    clearSelection()
    setBatchBusy(false)
    showToast('', 'Batch Update', `${count} invoice${count !== 1 ? 's' : ''} marked as paid`)
  }

  const batchSendReminders = async () => {
    setBatchBusy(true)
    let sent = 0
    for (const id of selectedInvoices) {
      const inv = enriched.find(i => i.id === id)
      if (inv && (inv.status === 'Unpaid' || inv.isOverdue)) {
        await sendPaymentReminder(inv)
        sent++
      }
    }
    clearSelection()
    setBatchBusy(false)
    showToast('', 'Reminders Sent', `${sent} reminder${sent !== 1 ? 's' : ''} dispatched`)
  }

  const batchExportCSV = () => {
    const rows = [['Invoice #', 'Broker', 'Amount', 'Status', 'Due Date', 'Route', 'Driver', 'Date']]
    for (const id of selectedInvoices) {
      const inv = enriched.find(i => i.id === id)
      if (!inv) continue
      rows.push([
        inv.invoice_number || inv.id || '',
        inv.broker || '',
        (inv.amount || 0).toString(),
        inv.displayStatus || inv.status || '',
        inv.dueDate || '',
        inv.route || '',
        inv.driver || '',
        inv.date || '',
      ])
    }
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-export-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('', 'CSV Exported', `${selectedInvoices.size} invoice${selectedInvoices.size !== 1 ? 's' : ''} exported`)
    clearSelection()
  }

  // Fetch documents for selected invoice's load
  useEffect(() => {
    if (!selectedInv) { setInvDocs([]); return }
    const inv = invoices.find(i => i.id === selectedInv)
    if (!inv) return
    // Find the linked load to get its DB UUID (documents are stored by load UUID)
    const linkedLoad = loads.find(l => (l.loadId || l.load_number) === (inv.loadId || inv.load_number))
    const loadDbId = linkedLoad?._dbId || linkedLoad?.id || inv.load_id || inv._dbId
    if (!loadDbId) return
    import('../../../lib/database').then(db => {
      db.fetchDocuments(loadDbId).then(docs => setInvDocs(docs || []))
    }).catch(() => {})
  }, [selectedInv, invoices, loads])

  const statusColors = { Unpaid:'var(--warning)', Paid:'var(--success)', Factored:'#8b5cf6', Overdue:'var(--danger)' }
  const statusBg = { Unpaid:'rgba(240,165,0,0.1)', Paid:'rgba(34,197,94,0.1)', Factored:'rgba(139,92,246,0.1)', Overdue:'rgba(239,68,68,0.1)' }

  // Enrich invoices with computed fields
  const enriched = useMemo(() => invoices.map(inv => {
    const daysOut = acctDaysAgo(inv.date)
    const daysUntilDue = acctDaysUntil(inv.dueDate)
    const isOverdue = inv.status === 'Unpaid' && daysUntilDue < 0
    const linkedLoad = loads.find(l => (l.loadId || l.load_number) === (inv.loadId || inv.load_number))
    return { ...inv, daysOut, daysUntilDue, isOverdue, displayStatus: isOverdue ? 'Overdue' : inv.status, linkedLoad }
  }), [invoices, loads])

  const filtered = useMemo(() => {
    let list = enriched
    if (filter !== 'All') list = list.filter(i => i.displayStatus === filter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        (i.id || '').toLowerCase().includes(q) ||
        (i.invoice_number || '').toLowerCase().includes(q) ||
        (i.broker || '').toLowerCase().includes(q) ||
        (i.route || '').toLowerCase().includes(q) ||
        (i.driver || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let va, vb
      if (sortBy === 'date') { va = acctParseDate(a.date)?.getTime() || 0; vb = acctParseDate(b.date)?.getTime() || 0 }
      else if (sortBy === 'amount') { va = a.amount; vb = b.amount }
      else if (sortBy === 'broker') { va = a.broker || ''; vb = b.broker || '' }
      else if (sortBy === 'due') { va = a.daysUntilDue; vb = b.daysUntilDue }
      else { va = a.id; vb = b.id }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return list
  }, [enriched, filter, search, sortBy, sortDir])

  const totalUnpaid = enriched.filter(i => i.status === 'Unpaid').reduce((s, i) => s + i.amount, 0)
  const totalPaid = enriched.filter(i => i.status === 'Paid').reduce((s, i) => s + i.amount, 0)
  const totalFactored = enriched.filter(i => i.status === 'Factored').reduce((s, i) => s + i.amount, 0)
  const overdueCount = enriched.filter(i => i.isOverdue).length
  const overdueAmount = enriched.filter(i => i.isOverdue).reduce((s, i) => s + i.amount, 0)

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }
  const sortArrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const FILTERS = [
    { id:'All', label:'All', count: enriched.length },
    { id:'Unpaid', label:'Unpaid', count: enriched.filter(i => i.status === 'Unpaid' && !i.isOverdue).length, color:'var(--warning)' },
    { id:'Overdue', label:'Overdue', count: overdueCount, color:'var(--danger)' },
    { id:'Factored', label:'Factored', count: enriched.filter(i => i.status === 'Factored').length, color:'#8b5cf6' },
    { id:'Paid', label:'Paid', count: enriched.filter(i => i.status === 'Paid').length, color:'var(--success)' },
  ]

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>INVOICES</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>{enriched.length} total invoices · Manage, track, and collect</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={S.grid(4)}>
        {[
          { label:'OUTSTANDING', val:`$${totalUnpaid.toLocaleString()}`, color:'var(--warning)', sub:`${enriched.filter(i=>i.status==='Unpaid').length} unpaid`, icon: Clock },
          { label:'OVERDUE', val: overdueCount > 0 ? `$${overdueAmount.toLocaleString()}` : '$0', color:'var(--danger)', sub: overdueCount > 0 ? `${overdueCount} past due` : 'All current', icon: AlertTriangle },
          { label:'FACTORED', val:`$${totalFactored.toLocaleString()}`, color:'#8b5cf6', sub:`${enriched.filter(i=>i.status==='Factored').length} invoices`, icon: Zap },
          { label:'COLLECTED', val:`$${totalPaid.toLocaleString()}`, color:'var(--success)', sub:`${enriched.filter(i=>i.status==='Paid').length} paid`, icon: CheckCircle },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5 }}>{k.label}</div>
              <div style={{ width:28, height:28, borderRadius:8, background:k.color+'15', display:'flex', alignItems:'center', justifyContent:'center' }}><Ic icon={k.icon} size={14} color={k.color} /></div>
            </div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:k.color, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6 }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding:'6px 14px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer',
                border: filter === f.id ? `1.5px solid ${f.color || 'var(--accent)'}` : '1px solid var(--border)',
                background: filter === f.id ? (f.color || 'var(--accent)') + '15' : 'var(--surface)',
                color: filter === f.id ? (f.color || 'var(--accent)') : 'var(--muted)' }}>
              {f.label} <span style={{ opacity:0.7 }}>({f.count})</span>
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices..."
          style={{ width:220, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }} />
      </div>

      {/* Batch Action Bar */}
      {selectedInvoices.size > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', background:'rgba(240,165,0,0.12)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:10 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#f0a500', whiteSpace:'nowrap' }}>
            {selectedInvoices.size} selected
          </span>
          <button className="btn btn-primary" disabled={batchBusy} onClick={batchMarkPaid}
            style={{ fontSize:11, padding:'5px 14px', display:'flex', alignItems:'center', gap:5 }}>
            <Ic icon={Check} size={12} /> Mark as Paid
          </button>
          <button className="btn btn-ghost" disabled={batchBusy} onClick={batchSendReminders}
            style={{ fontSize:11, padding:'5px 14px', display:'flex', alignItems:'center', gap:5 }}>
            <Ic icon={Send} size={12} /> Send Reminders
          </button>
          <button className="btn btn-ghost" disabled={batchBusy} onClick={batchExportCSV}
            style={{ fontSize:11, padding:'5px 14px', display:'flex', alignItems:'center', gap:5 }}>
            <Ic icon={Download} size={12} /> Export CSV
          </button>
          <div style={{ flex:1 }} />
          <button onClick={clearSelection} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4, display:'flex', alignItems:'center' }} title="Clear selection">
            <Ic icon={X} size={14} />
          </button>
        </div>
      )}

      {/* Invoice Table */}
      <div style={S.panel}>
        {filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
            {enriched.length === 0 ? 'No invoices yet. Deliver a load to auto-generate your first invoice.' : 'No invoices match your filters.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width:36, textAlign:'center', cursor:'pointer' }} onClick={toggleSelectAll}>
                  <Ic icon={filtered.length > 0 && filtered.every(i => selectedInvoices.has(i.id)) ? CheckSquare : Square} size={14} color={filtered.length > 0 && filtered.every(i => selectedInvoices.has(i.id)) ? '#f0a500' : 'var(--muted)'} />
                </th>
                <th style={{ cursor:'pointer' }} onClick={() => toggleSort('id')}>Invoice{sortArrow('id')}</th>
                <th>Load</th>
                <th style={{ cursor:'pointer' }} onClick={() => toggleSort('broker')}>Broker{sortArrow('broker')}</th>
                <th>Route</th>
                <th>Driver</th>
                <th style={{ cursor:'pointer' }} onClick={() => toggleSort('date')}>Date{sortArrow('date')}</th>
                <th style={{ cursor:'pointer' }} onClick={() => toggleSort('due')}>Due{sortArrow('due')}</th>
                <th style={{ cursor:'pointer' }} onClick={() => toggleSort('amount')}>Amount{sortArrow('amount')}</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const st = inv.displayStatus
                const sc = statusColors[st] || 'var(--muted)'
                const bg = statusBg[st] || 'rgba(120,130,150,0.1)'
                return (
                  <tr key={inv.id + inv._dbId} style={{ cursor:'pointer' }} onClick={() => setSelectedInv(selectedInv === inv.id ? null : inv.id)}>
                    <td style={{ width:36, textAlign:'center' }} onClick={e => { e.stopPropagation(); toggleSelect(inv.id) }}>
                      <Ic icon={selectedInvoices.has(inv.id) ? CheckSquare : Square} size={14} color={selectedInvoices.has(inv.id) ? '#f0a500' : 'var(--muted)'} style={{ cursor:'pointer' }} />
                    </td>
                    <td><span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700 }}>{inv.invoice_number || inv.id}</span></td>
                    <td style={{ fontSize:11, color:'var(--muted)' }}>{inv.loadId || inv.load_number || '—'}</td>
                    <td style={{ fontSize:12 }}>{inv.broker || '—'}</td>
                    <td style={{ fontSize:12 }}>{inv.route || '—'}</td>
                    <td style={{ fontSize:12 }}>{inv.driver || '—'}</td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>{inv.date || '—'}</td>
                    <td style={{ fontSize:12, color: inv.isOverdue ? 'var(--danger)' : inv.daysUntilDue < 7 ? 'var(--warning)' : 'var(--muted)' }}>
                      {inv.isOverdue ? `${Math.abs(inv.daysUntilDue)}d overdue` : inv.dueDate || '—'}
                    </td>
                    <td><span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${(inv.amount || 0).toLocaleString()}</span></td>
                    <td><span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:10, background:bg, color:sc }}>{st}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button title="Download PDF" onClick={e => { e.stopPropagation(); generateInvoicePDF({ id: inv.invoice_number || inv.id, loadId: inv.loadId || inv.load_number, broker: inv.broker, route: inv.route, amount: inv.amount, date: inv.date, dueDate: inv.dueDate, driver: inv.driver, status: inv.status }) }}
                          style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', padding:'3px 8px', color:'var(--muted)', fontSize:11 }}>
                          <Ic icon={Download} size={11} />
                        </button>
                        {inv.status === 'Unpaid' && (
                          <button title="Mark as Paid" onClick={e => { e.stopPropagation(); updateInvoiceStatus(inv.id || inv.invoice_number, 'Paid'); showToast('', 'Invoice Paid', `${inv.invoice_number || inv.id} marked as paid`) }}
                            style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', padding:'3px 8px', color:'var(--success)', fontSize:11 }}>
                            <Ic icon={Check} size={11} />
                          </button>
                        )}
                        {inv.status === 'Unpaid' && (
                          <button title="Send Reminder" onClick={e => sendPaymentReminder(inv, e)}
                            style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', padding:'3px 8px', color:'var(--accent)', fontSize:11 }}>
                            <Ic icon={Send} size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Expanded Invoice Detail */}
      {selectedInv && (() => {
        const inv = enriched.find(i => i.id === selectedInv)
        if (!inv) return null
        const factorCompany = carrierCompany?.factoring_company || ''
        const factorRate = parseFloat(carrierCompany?.factoring_rate) || 2.5
        const fee = Math.round(inv.amount * (factorRate / 100) * 100) / 100
        const net = inv.amount - fee
        return (
          <div style={S.panel}>
            <div style={{ padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                <div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>{inv.invoice_number || inv.id}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{inv.broker} · {inv.route} · {inv.driver || 'No driver'}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:'var(--accent)' }}>${(inv.amount||0).toLocaleString()}</div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:10, background:statusBg[inv.displayStatus], color:statusColors[inv.displayStatus] }}>{inv.displayStatus}</span>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:16 }}>
                {[
                  { label:'Invoice Date', value: inv.date || '—' },
                  { label:'Due Date', value: inv.dueDate || '—' },
                  { label:'Days Outstanding', value: `${inv.daysOut}d` },
                  { label:'Load ID', value: inv.loadId || inv.load_number || '—' },
                  { label:'Equipment', value: inv.linkedLoad?.equipment || '—' },
                  { label:'Miles', value: inv.linkedLoad?.miles ? inv.linkedLoad.miles.toLocaleString() + ' mi' : '—' },
                ].map(d => (
                  <div key={d.label} style={{ padding:'10px 12px', background:'var(--surface2)', borderRadius:8 }}>
                    <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{d.label}</div>
                    <div style={{ fontSize:13, fontWeight:600, marginTop:2 }}>{d.value}</div>
                  </div>
                ))}
              </div>

              {/* Documents */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 }}>Documents</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {['Rate Con', 'BOL', 'POD', 'Lumper Receipt', 'Scale Ticket'].map(docType => {
                    const docTypeKey = docType.toLowerCase().replace(/ /g, '_')
                    const found = invDocs.find(d => (d.doc_type || d.type || '').toLowerCase().replace(/ /g, '_') === docTypeKey)
                    return (
                      <div key={docType} style={{ padding:'8px 14px', background: found ? 'rgba(34,197,94,0.08)' : 'var(--surface2)', border: found ? '1px solid rgba(34,197,94,0.25)' : '1px solid var(--border)', borderRadius:8, display:'flex', alignItems:'center', gap:6, minWidth:100 }}>
                        <Ic icon={found ? CheckCircle : FileText} size={12} color={found ? 'var(--success)' : 'var(--muted)'} />
                        <div>
                          <div style={{ fontSize:11, fontWeight:600, color: found ? 'var(--success)' : 'var(--muted)' }}>{docType}</div>
                          {found ? (
                            <a href={found.file_url || found.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:9, color:'var(--accent)' }} onClick={e => e.stopPropagation()}>View</a>
                          ) : (
                            <span style={{ fontSize:9, color:'var(--muted)' }}>Missing</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 16px' }}
                  onClick={() => generateInvoicePDF({ id: inv.invoice_number || inv.id, loadId: inv.loadId || inv.load_number, broker: inv.broker, route: inv.route, amount: inv.amount, date: inv.date, dueDate: inv.dueDate, driver: inv.driver, status: inv.status })}>
                  <Ic icon={Download} size={13} /> Download PDF
                </button>
                {(inv.status === 'Unpaid' || inv.status === 'Factored') && (
                  <PaymentUploader inv={inv} onComplete={(result) => {
                    if (result.short_pay?.detected) {
                      updateInvoiceStatus(inv.id || inv.invoice_number, 'Disputed')
                      showToast('', 'Short Pay Detected', `Received $${result.payment.amount.toLocaleString()} of $${inv.amount.toLocaleString()} — short $${result.short_pay.short.toLocaleString()}`)
                    } else if (result.invoice?.status === 'Paid') {
                      updateInvoiceStatus(inv.id || inv.invoice_number, 'Paid')
                      showToast('', 'Payment Confirmed', `$${result.payment.amount.toLocaleString()} from ${result.payment.payer}`)
                    }
                    setSelectedInv(null)
                  }} />
                )}
                {inv.status === 'Unpaid' && (
                  <button className="btn btn-ghost" style={{ fontSize:12, padding:'8px 16px', color:'var(--success)', borderColor:'rgba(34,197,94,0.3)' }}
                    onClick={() => { updateInvoiceStatus(inv.id || inv.invoice_number, 'Paid'); showToast('', 'Marked as Paid', inv.invoice_number || inv.id); setSelectedInv(null) }}>
                    <Ic icon={Check} size={13} /> Mark as Paid
                  </button>
                )}
                {inv.status === 'Unpaid' && (
                  <button className="btn btn-ghost" style={{ fontSize:12, padding:'8px 16px' }}
                    onClick={() => sendPaymentReminder(inv)}>
                    <Ic icon={Send} size={13} /> Send Reminder
                  </button>
                )}
                {inv.status === 'Unpaid' && factorCompany && factorCompany !== "I don't use factoring" && (
                  <FactorPanel inv={inv} factorCompany={factorCompany} factorRate={factorRate} net={net}
                    onSubmit={async (payTerms, pdfUrl) => {
                      try {
                        await apiFetch('/api/factor-invoice', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ invoiceId: inv._dbId || inv.id, factoringCompany: factorCompany, factoringRate: factorRate, paymentTerms: payTerms, invoicePdfUrl: pdfUrl }),
                        })
                        updateInvoiceStatus(inv.id || inv.invoice_number, 'Factored')
                        showToast('', 'Invoice Factored!', `${inv.invoice_number || inv.id} → ${factorCompany} · ${payTerms === 'same_day' ? 'Same day pay' : payTerms === 'next_day' ? 'Next day' : 'Standard'} · $${net.toLocaleString()}`)
                      } catch {
                        updateInvoiceStatus(inv.id || inv.invoice_number, 'Factored')
                        showToast('', 'Invoice Factored', `Marked locally — email may not have sent`)
                      }
                      setSelectedInv(null)
                    }} />
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Summary Bar */}
      {enriched.length > 0 && (
        <div style={{ display:'flex', gap:12, alignItems:'center', padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, fontSize:11, color:'var(--muted)' }}>
          <span>Total Revenue: <b style={{ color:'var(--accent)' }}>${(totalUnpaid + totalPaid + totalFactored).toLocaleString()}</b></span>
          <span>·</span>
          <span>Collection Rate: <b style={{ color: totalPaid > 0 ? 'var(--success)' : 'var(--muted)' }}>{enriched.length > 0 ? Math.round((enriched.filter(i=>i.status==='Paid').length / enriched.length) * 100) : 0}%</b></span>
          <span>·</span>
          <span>Avg Days to Pay: <b>{(() => { const p = enriched.filter(i => i.status === 'Paid'); return p.length ? Math.round(p.reduce((s,i) => s + i.daysOut, 0) / p.length) : '—' })()}d</b></span>
        </div>
      )}
    </div>
  )
}
