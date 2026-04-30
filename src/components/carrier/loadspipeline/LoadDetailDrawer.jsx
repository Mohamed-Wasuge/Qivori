import React, { useState, useEffect, useCallback } from 'react'
import { Target, CheckCircle, DollarSign, Truck, Clock, Plus, Trash2, Upload, FileText, Image, Eye, MapPin, Star, Bell, Share2, Send } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { uploadFile } from '../../../lib/storage'
import { createDocument, fetchDocuments, deleteDocument } from '../../../lib/database'
import { checkBOLMismatches } from '../../../lib/bolValidator'
import { Ic } from '../shared'
import { qEvaluateLoad, Q_DECISION_COLORS, QDecisionBadge, RateBadge } from './helpers'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'

export function LoadDetailDrawer({ loadId, onClose }) {
  const { loads, invoices, checkCalls, updateLoadStatus, updateInvoiceStatus, removeLoad, drivers, fuelCostPerMile, company: carrierCompany, brokerStats, allLoads, advanceStop } = useCarrier()
  const { showToast, user } = useApp()
  const [invoiceSending, setInvoiceSending] = useState(false)
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false)
  const [showTONU, setShowTONU] = useState(false)
  const [showFactorPrompt, setShowFactorPrompt] = useState(false)
  const [tonuFee, setTonuFee] = useState('250')
  // Detention tracking
  const [detentionRunning, setDetentionRunning] = useState(false)
  const [detentionStart, setDetentionStart] = useState(null)
  const [detentionElapsed, setDetentionElapsed] = useState(0)
  // Accessorial line items
  const [lineItems, setLineItems] = useState([])
  const [showAddAccessorial, setShowAddAccessorial] = useState(false)
  const [newAccessorial, setNewAccessorial] = useState({ description: '', amount: '' })
  // Documents
  const [loadDocs, setLoadDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reminderSending, setReminderSending] = useState(false)
  const [bolMismatches, setBolMismatches] = useState([])
  const [pendingDelivery, setPendingDelivery] = useState(null)
  const [drawerDispatchDec, setDrawerDispatchDec] = useState(null)
  const load = loads.find(l => (l.loadId || l.id) === loadId)

  // Fetch backend dispatch decision for this load
  useEffect(() => {
    if (!load?.id || String(load.id).startsWith('local') || String(load.id).startsWith('mock')) return
    setDrawerDispatchDec(null)
    apiFetch(`/api/dispatch-evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        load_id: load.loadId || load.id,
        load: {
          gross: load.gross || load.gross_pay || 0,
          miles: load.miles,
          weight: load.weight,
          origin: load.origin,
          dest: load.dest || load.destination,
          equipment: load.equipment,
          broker: load.broker,
          pickup_date: load.pickup_date,
          delivery_date: load.delivery_date,
        },
        driver_type: 'owner_operator',
      }),
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.decision) setDrawerDispatchDec(data)
    }).catch(() => {})
  }, [load?.id])

  // Fetch documents for this load
  useEffect(() => {
    if (!load?.id || String(load.id).startsWith('local') || String(load.id).startsWith('mock')) return
    setDocsLoading(true)
    fetchDocuments(load.id).then(docs => setLoadDocs(docs)).catch(() => {}).finally(() => setDocsLoading(false))
  }, [load?.id])

  const triggerDelivery = useCallback(async () => {
    if (!load) return
    try {
      if (load.status !== 'Delivered') {
        updateLoadStatus(load.loadId || load.id, 'Delivered')
        showToast('', 'Load Delivered', `${load.loadId || load.load_number} marked as Delivered`)
      }
      const invRes = await apiFetch('/api/auto-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadId: load._dbId || load.id }),
      })
      const invData = await invRes.json()
      if (invData.success) {
        updateLoadStatus(load.loadId || load.id, 'Invoiced')
        const parts = [invData.invoiceNumber, `$${(load.rate || load.gross || 0).toLocaleString()}`]
        if (invData.emailSent) parts.push('emailed to broker')
        if (invData.factoringEmailed) parts.push(`factoring packet sent (${invData.docsAttached || 0} docs attached)`)
        showToast('', 'Invoice Auto-Created', parts.join(' — '))
      }
    } catch {
      // Invoice API unavailable — user can create manually
    }
  }, [load, showToast, updateLoadStatus])

  const handleDocUpload = useCallback(async (docType) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.heic'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const result = await uploadFile(file, 'loads/' + (load?.id || 'unknown'))
        const doc = await createDocument({
          name: docType + ' — ' + (load?.loadId || load?.load_number || 'Load'),
          file_url: result.url,
          file_path: result.path,
          doc_type: docType.toLowerCase().replace(/\s+/g, '_'),
          load_id: load?.id || null,
          metadata: { load_number: load?.loadId || load?.load_number, original_name: file.name, size: file.size },
        })
        if (doc) setLoadDocs(prev => [doc, ...prev])
        showToast('success', 'Uploaded', `${docType} attached to ${load?.loadId || 'load'}`)

        const isBOLOrPOD = ['bol', 'bill of lading', 'pod', 'proof of delivery'].includes(docType.toLowerCase())
        const canDeliver  = isBOLOrPOD && ['In Transit', 'Loaded', 'Delivered', 'En Route to Pickup'].includes(load?.status)
        const notInvoiced = load?.status !== 'Invoiced' && load?.status !== 'Paid'

        if (isBOLOrPOD && canDeliver && notInvoiced) {
          // Parse the document with Q and validate against rate con
          try {
            const reader = new FileReader()
            const b64 = await new Promise((res, rej) => {
              reader.onload = () => res(reader.result.split(',')[1])
              reader.onerror = rej
              reader.readAsDataURL(file)
            })
            const parseRes = await apiFetch('/api/parse-ratecon', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file: b64, mediaType: file.type }),
            })
            if (parseRes.ok) {
              const parsed = await parseRes.json()
              const issues = checkBOLMismatches(parsed, load)
              if (issues.length > 0) {
                setBolMismatches(issues)
                setPendingDelivery(() => triggerDelivery)
                setUploading(false)
                return // wait for user to confirm/dismiss mismatch modal
              }
            }
          } catch {
            // Parse failed — proceed without validation
          }
          await triggerDelivery()
        }
      } catch (err) {
        showToast('error', 'Upload Failed', err.message || 'Could not upload file')
      }
      setUploading(false)
    }
    input.click()
  }, [load, showToast, updateLoadStatus, triggerDelivery])

  const handleDocDelete = useCallback(async (docId) => {
    if (!window.confirm('Delete this document?')) return
    try {
      await deleteDocument(docId)
      setLoadDocs(prev => prev.filter(d => d.id !== docId))
      showToast('success', 'Deleted', 'Document removed')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to delete')
    }
  }, [showToast])

  // Initialize line items from load or linked invoice
  useEffect(() => {
    if (!load) return
    const existing = load.line_items || []
    if (existing.length > 0 && lineItems.length === 0) setLineItems(existing)
  }, [load?.loadId])

  // Initialize detention from load data
  useEffect(() => {
    if (!load) return
    if (load.detention_start && !detentionStart) {
      setDetentionStart(new Date(load.detention_start))
      if (load.detention_end) {
        setDetentionElapsed(Math.floor((new Date(load.detention_end) - new Date(load.detention_start)) / 1000))
      } else {
        setDetentionRunning(true)
      }
    }
  }, [load?.loadId])

  // Detention timer tick
  useEffect(() => {
    if (!detentionRunning || !detentionStart) return
    const interval = setInterval(() => {
      setDetentionElapsed(Math.floor((Date.now() - detentionStart.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [detentionRunning, detentionStart])

  if (!load) return (
    <div style={{ position:'fixed', top:0, right:0, width:480, height:'100vh', background:'var(--surface)', borderLeft:'1px solid var(--border)', zIndex:999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
      <div style={{ fontSize:14, fontWeight:700, color:'var(--muted)' }}>Load not found</div>
      <button onClick={onClose} className="btn btn-ghost" style={{ fontSize:12 }}>Close</button>
    </div>
  )

  const detentionHours = detentionElapsed / 3600
  const FREE_TIME_HOURS = 2
  const DETENTION_RATE = 75 // $/hr after free time
  const billableDetention = Math.max(0, detentionHours - FREE_TIME_HOURS)
  const detentionCharge = Math.round(billableDetention * DETENTION_RATE)

  const fmtTime = (secs) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
  }

  const startDetention = () => {
    const now = new Date()
    setDetentionStart(now)
    setDetentionRunning(true)
    setDetentionElapsed(0)
    // Save to load
    const dbId = load._dbId || load.id
    if (dbId && !String(dbId).startsWith('mock') && !String(dbId).startsWith('local')) {
      import('../../../lib/database.js').then(db => db.updateLoad(dbId, { detention_start: now.toISOString() })).catch(() => {})
    }
    showToast('', 'Detention Started', `Timer running for ${load.loadId}`)
  }

  const stopDetention = () => {
    const end = new Date()
    setDetentionRunning(false)
    // Save to load
    const dbId = load._dbId || load.id
    if (dbId && !String(dbId).startsWith('mock') && !String(dbId).startsWith('local')) {
      import('../../../lib/database.js').then(db => db.updateLoad(dbId, {
        detention_end: end.toISOString(),
        detention_hours: parseFloat(detentionHours.toFixed(2)),
      })).catch(() => {})
    }
    // Auto-add detention as line item if billable
    if (billableDetention > 0 && !lineItems.find(li => li.type === 'detention')) {
      const item = { type: 'detention', description: `Detention (${billableDetention.toFixed(1)}hrs @ $${DETENTION_RATE}/hr — ${FREE_TIME_HOURS}hr free time)`, amount: detentionCharge }
      setLineItems(prev => [...prev, item])
      showToast('', 'Detention Charge Added', `$${detentionCharge} added to accessorials (${billableDetention.toFixed(1)}hrs billable)`)
    } else {
      showToast('', 'Detention Stopped', `Total: ${fmtTime(detentionElapsed)} — within free time, no charge`)
    }
  }

  // Calculate total with accessorials
  const accessorialTotal = lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0)

  const origin = load.origin || '—'
  const dest = load.dest || load.destination || '—'
  const gross = load.gross || load.gross_pay || 0
  const rpm = load.rate || (load.miles > 0 ? (gross / load.miles).toFixed(2) : '—')
  const linkedInvoice = invoices.find(i => i.load_number === load.loadId || i.loadId === load.loadId)
  const loadCalls = checkCalls[load.loadId] || []

  const STATUS_FLOW = ['Rate Con Received','Assigned to Driver','En Route to Pickup','Loaded','In Transit','Delivered','Invoiced','Paid']
  const currentIdx = STATUS_FLOW.indexOf(load.status)
  const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null

  // Auto-invoice: generate and send invoice via API
  const handleAutoInvoice = async () => {
    setInvoiceSending(true)
    try {
      const res = await apiFetch('/api/auto-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadId: load._dbId || load.id, lineItems: lineItems.length > 0 ? lineItems : undefined }),
      })
      const data = await res.json()
      if (data.success) {
        updateLoadStatus(load.loadId || load.id, 'Invoiced')
        const totalWithAccessorials = gross + accessorialTotal
        showToast('', 'Invoice Sent!', `${data.invoiceNumber} — $${totalWithAccessorials.toLocaleString()}${accessorialTotal > 0 ? ` (incl. $${accessorialTotal} accessorials)` : ''} — ${data.emailSent ? 'Email sent to broker' : 'Invoice created (no broker email on file)'}`)
        setShowInvoicePrompt(false)
      } else {
        showToast('', 'Invoice Error', data.error || 'Could not generate invoice')
      }
    } catch (err) {
      // Fallback: still create local invoice via status update
      updateLoadStatus(load.loadId || load.id, 'Invoiced')
      showToast('', 'Invoice Created', `${load.loadId} — created locally (API unavailable)`)
      setShowInvoicePrompt(false)
    }
    setInvoiceSending(false)
  }

  // Generate and copy tracking link for brokers (uses signed token API)
  const [shareLoading, setShareLoading] = useState(false)
  const handleShareTracking = async () => {
    const dbId = load._dbId || load.id || ''
    if (!dbId || String(dbId).startsWith('mock') || String(dbId).startsWith('local')) {
      showToast('', 'Tracking Link', 'Save this load to the database first to generate a tracking link')
      return
    }
    setShareLoading(true)
    try {
      const res = await apiFetch('/api/tracking-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadId: dbId }),
      })
      const data = await res.json()
      if (data.url) {
        navigator.clipboard.writeText(data.url).then(() => {
          showToast('success', 'Link Copied!', `Tracking link for ${load.loadId || load.load_number} copied to clipboard. Share with your broker.`)
        }).catch(() => {
          window.prompt('Copy this tracking link:', data.url)
        })
      } else {
        showToast('', 'Error', data.error || 'Could not generate tracking link')
      }
    } catch {
      // Fallback: generate legacy link locally
      const ownerId = load.owner_id || user?.id || ''
      const token = btoa(`${ownerId}:${dbId}`)
      const originUrl = window.location.origin
      const trackingUrl = `${originUrl}/#/track?token=${encodeURIComponent(token)}`
      navigator.clipboard.writeText(trackingUrl).then(() => {
        showToast('success', 'Link Copied!', `Tracking link for ${load.loadId || load.load_number} copied to clipboard.`)
      }).catch(() => {
        window.prompt('Copy this tracking link:', trackingUrl)
      })
    }
    setShareLoading(false)
  }

  // Send invoice payment reminder email to broker
  const handleSendReminder = async () => {
    if (!linkedInvoice) { showToast('', 'No Invoice', 'Generate an invoice first'); return }
    if (!load.broker_email) { showToast('', 'No Email', 'Broker email not on file for this load'); return }
    setReminderSending(true)
    try {
      const res = await apiFetch('/api/invoice-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualTrigger: true, invoiceId: linkedInvoice.id || linkedInvoice._dbId }),
      })
      showToast('success', 'Reminder Sent', `Payment reminder emailed to ${load.broker_email}`)
    } catch {
      showToast('error', 'Failed', 'Could not send reminder — try again later')
    }
    setReminderSending(false)
  }

  // Show invoice prompt after advancing to Delivered
  const handleAdvanceToDelivered = () => {
    updateLoadStatus(load.loadId || load.id, 'Delivered')
    showToast('', 'Status Updated', `${load.loadId} → Delivered`)
    setShowInvoicePrompt(true)
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:900 }} />
      <div style={{ position:'fixed', top:48, right:0, bottom:0, width:480, maxWidth:'100%', background:'var(--bg)',
        borderLeft:'1px solid var(--border)', zIndex:901, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.3)', animation:'slideInRight 0.2s ease' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:'monospace', fontSize:14, fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
              {load.load_source === 'amazon_relay' && (
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(255,153,0,0.15)', color:'#ff9900' }}>AMAZON RELAY</span>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{load.status}</span>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>
          </div>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:1, marginBottom:4 }}>
            {origin.split(',')[0]} → {dest.split(',')[0]}
          </div>
          <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--muted)' }}>
            <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)' }}>${gross.toLocaleString()}</span>
            <span>${rpm}/mi</span>
            <span>{(load.miles || 0).toLocaleString()} mi</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:'auto', padding:20, paddingBottom:60, display:'flex', flexDirection:'column', gap:16 }}>
          {/* Progress bar */}
          <div style={{ display:'flex', gap:2 }}>
            {STATUS_FLOW.slice(0,7).map((s, i) => (
              <div key={s} style={{ flex:1, height:4, borderRadius:2, background: i <= currentIdx ? 'var(--accent)' : 'var(--surface2)', transition:'background 0.3s' }}
                title={s} />
            ))}
          </div>

          {/* Quick actions */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {nextStatus && nextStatus !== 'Delivered' && (
              <button className="btn btn-primary" style={{ fontSize:11, flex:1 }}
                onClick={() => { updateLoadStatus(load.loadId || load.id, nextStatus); showToast('','Status Updated', `${load.loadId} → ${nextStatus}`) }}>
                Advance → {nextStatus}
              </button>
            )}
            {load.status !== 'Cancelled' && load.status !== 'Paid' && (
              <button className="btn btn-ghost" style={{ fontSize:11, color:'var(--warning)', border:'1px solid rgba(240,165,0,0.25)', background:'rgba(240,165,0,0.06)' }}
                onClick={() => setShowTONU(true)}>
                Cancel Load
              </button>
            )}
            {nextStatus === 'Delivered' && (
              <button className="btn btn-primary" style={{ fontSize:11, flex:1 }}
                onClick={handleAdvanceToDelivered}>
                Advance → Delivered
              </button>
            )}
            {load.status === 'Delivered' && !linkedInvoice && (
              <button className="btn btn-ghost" style={{ fontSize:11, flex:1, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.25)', color:'var(--accent)' }}
                onClick={() => setShowInvoicePrompt(true)} disabled={invoiceSending}>
                {invoiceSending ? 'Sending...' : 'Generate & Send Invoice'}
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontSize:11, color:'var(--warning)', border:'1px solid rgba(240,165,0,0.25)', background:'rgba(240,165,0,0.06)' }}
              onClick={() => {
                updateLoadStatus(load.loadId || load.id, 'Cancelled')
                showToast('', 'Load Archived', `${load.loadId || load.id} cancelled`)
                onClose()
              }}>
              Archive
            </button>
            <button className="btn btn-ghost" style={{ fontSize:11, color:'var(--danger)', border:'1px solid rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.06)' }}
              onClick={() => {
                if (window.confirm(`Permanently delete load ${load.loadId || load.id}? This cannot be undone.`)) {
                  removeLoad(load.loadId || load.id)
                  showToast('', 'Load Deleted', `${load.loadId || load.id} removed`)
                  onClose()
                }
              }}>
              Delete
            </button>
            <button className="btn btn-ghost" style={{ fontSize:11, color:'#4d8ef0', border:'1px solid rgba(77,142,240,0.25)', background:'rgba(77,142,240,0.06)' }}
              onClick={handleShareTracking} disabled={shareLoading}>
              <Ic icon={Share2} size={11} /> {shareLoading ? 'Generating...' : 'Share Tracking'}
            </button>
            {linkedInvoice && (linkedInvoice.status === 'Unpaid' || linkedInvoice.status === 'Overdue') && (
              <button className="btn btn-ghost" style={{ fontSize:11, color:'#f97316', border:'1px solid rgba(249,115,22,0.25)', background:'rgba(249,115,22,0.06)' }}
                onClick={handleSendReminder} disabled={reminderSending}>
                <Ic icon={Send} size={11} /> {reminderSending ? 'Sending...' : 'Send Reminder'}
              </button>
            )}
          </div>

          {/* Auto-Invoice Prompt */}
          {showInvoicePrompt && !linkedInvoice && (
            <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.04))', border:'1px solid rgba(240,165,0,0.25)', borderRadius:12, padding:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <span style={{ fontSize:18 }}>&#9993;</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>Generate & Send Invoice?</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Auto-generate a professional invoice and email it to the broker</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:11, flex:1 }} onClick={handleAutoInvoice} disabled={invoiceSending}>
                  {invoiceSending ? 'Generating...' : 'Yes, Send Invoice'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setShowInvoicePrompt(false)}>
                  Not Now
                </button>
              </div>
            </div>
          )}

          {/* TONU — Truck Order Not Used */}
          {showTONU && (
            <div style={{ background:'linear-gradient(135deg,rgba(239,68,68,0.06),rgba(240,165,0,0.04))', border:'1px solid rgba(239,68,68,0.25)', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--danger)', marginBottom:4 }}>Cancel Load — {load.loadId}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>If the broker cancelled after dispatch, you can charge a TONU (Truck Order Not Used) fee.</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
                <label style={{ fontSize:11, color:'var(--muted)', fontWeight:600, flexShrink:0 }}>TONU Fee ($)</label>
                <input type="number" value={tonuFee} onChange={e => setTonuFee(e.target.value)} placeholder="250"
                  style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:11, flex:1, background:'var(--danger)' }}
                  onClick={async () => {
                    const fee = parseFloat(tonuFee) || 0
                    updateLoadStatus(load.loadId || load.id, 'Cancelled')
                    if (fee > 0) {
                      // Generate TONU invoice via API
                      try {
                        await apiFetch('/api/auto-invoice', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ loadId: load._dbId || load.id, tonuFee: fee, isTONU: true }),
                        })
                      } catch {}
                      showToast('', 'Load Cancelled + TONU', `${load.loadId} cancelled — $${fee} TONU fee invoiced to ${load.broker || 'broker'}`)
                    } else {
                      showToast('', 'Load Cancelled', `${load.loadId} marked as cancelled`)
                    }
                    setShowTONU(false)
                  }}>
                  Cancel + Invoice TONU ${tonuFee || '0'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:11 }}
                  onClick={() => {
                    updateLoadStatus(load.loadId || load.id, 'Cancelled')
                    showToast('', 'Load Cancelled', `${load.loadId} cancelled — no TONU fee`)
                    setShowTONU(false)
                  }}>
                  Cancel (No Fee)
                </button>
              </div>
              <button onClick={() => setShowTONU(false)} style={{ marginTop:8, fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Go Back
              </button>
            </div>
          )}

          {/* Rate Analysis Badge */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <RateBadge rpm={rpm} equipment={load.equipment} />
            <button className="btn btn-ghost" style={{ fontSize:11, padding:'6px 12px' }}
              onClick={() => { const url = new URL(window.location); url.searchParams.set('rateCheck', JSON.stringify({ origin: load.origin, dest: load.dest || load.destination, miles: load.miles, gross, equipment: load.equipment })); showToast('', 'Rate Check', 'Open Rate Check tab in Loads → Rate Check to analyze this rate') }}>
              <Ic icon={Target} size={12} /> Analyze Rate
            </button>
          </div>

          {/* ═══ Q DECISION PANEL ═══════════════════════════════════ */}
          {(() => {
            // Frontend eval + fetch backend decision from dispatch_decisions table
            const backendDec = drawerDispatchDec
            const frontendQr = qEvaluateLoad(load, { fuelCostPerMile, drivers, brokerStats, allLoads: allLoads || loads })
            const qr = backendDec ? {
              ...frontendQr,
              decision: (backendDec.decision || '').toUpperCase() === 'AUTO_BOOK' ? 'ACCEPT' : (backendDec.decision || '').toUpperCase(),
              confidence: backendDec.confidence || frontendQr.confidence,
              estProfit: backendDec.metrics?.estProfit ?? frontendQr.estProfit,
              profitPerMile: backendDec.metrics?.profitPerMile ?? frontendQr.profitPerMile,
              profitPerDay: backendDec.metrics?.profitPerDay ?? frontendQr.profitPerDay,
              fuelCost: backendDec.metrics?.fuelCost ?? frontendQr.fuelCost,
              driverPay: backendDec.metrics?.driverPay ?? frontendQr.driverPay,
              transitDays: backendDec.metrics?.transitDays ?? frontendQr.transitDays,
              summaryReason: (backendDec.reasons || []).join('. ') || frontendQr.summaryReason,
              targetRate: backendDec.negotiation ? Math.round((backendDec.negotiation.targetRate || 0) * (parseFloat(load.miles) || 1)) : frontendQr.targetRate,
              risks: frontendQr.risks,
              advantages: frontendQr.advantages,
              _backendPowered: true,
            } : frontendQr
            const dc = Q_DECISION_COLORS[qr.decision] || Q_DECISION_COLORS.ACCEPT
            return (
              <div style={{ background:`linear-gradient(135deg, ${dc.bg}, rgba(0,0,0,0.02))`, border:`1px solid ${dc.border}`, borderRadius:12, padding:16, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${dc.color}50, transparent)` }} />
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:dc.color, animation:'q-scan-pulse 2s ease-in-out infinite' }} />
                    <span style={{ fontSize:10, fontWeight:800, color:dc.color, letterSpacing:1.5 }}>Q DECISION{qr._backendPowered ? ' (AI)' : ''}</span>
                  </div>
                  <QDecisionBadge decision={qr.decision} />
                </div>
                {/* Metrics grid */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
                  {[
                    { label:'EST. PROFIT', value:`$${(qr.estProfit || 0).toLocaleString()}`, color: qr.estProfit > 0 ? 'var(--success)' : 'var(--danger)' },
                    { label:'PROFIT/MI', value:`$${qr.profitPerMile}`, color: parseFloat(qr.profitPerMile) >= 1.00 ? 'var(--success)' : 'var(--accent)' },
                    { label:'PROFIT/DAY', value:`$${(qr.profitPerDay || 0).toLocaleString()}`, color: qr.profitPerDay >= 500 ? 'var(--success)' : 'var(--accent)' },
                    { label:'FUEL COST', value:`$${(qr.fuelCost || 0).toLocaleString()}`, color:'var(--warning)' },
                    { label:'DRIVER PAY', value:`$${(qr.driverPay || 0).toLocaleString()}`, color:'var(--muted)' },
                    { label:'BROKER', value:`${qr.brokerScore} — ${qr.brokerReliability}`, color: qr.brokerScore === 'A' ? 'var(--success)' : qr.brokerScore === 'C' ? 'var(--danger)' : 'var(--accent)' },
                  ].map(m => (
                    <div key={m.label} style={{ background:'rgba(0,0,0,0.12)', borderRadius:6, padding:'6px 8px' }}>
                      <div style={{ fontSize:7, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:2 }}>{m.label}</div>
                      <div style={{ fontSize:11, fontWeight:700, color:m.color, fontFamily:"'JetBrains Mono',monospace" }}>{m.value}</div>
                    </div>
                  ))}
                </div>
                {/* Negotiation script from backend */}
                {backendDec?.negotiation && (
                  <div style={{ padding:'8px 10px', background:'rgba(240,165,0,0.06)', borderRadius:6, marginBottom:8, border:'1px solid rgba(240,165,0,0.15)' }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:1, marginBottom:4 }}>NEGOTIATION SCRIPT</div>
                    <div style={{ fontSize:10, color:'var(--text)', lineHeight:1.5 }}>{backendDec.negotiation.script}</div>
                    <div style={{ display:'flex', gap:12, marginTop:6 }}>
                      <span style={{ fontSize:9, color:'var(--muted)' }}>Current: <span style={{ fontWeight:700, color:'var(--text)', fontFamily:"'JetBrains Mono',monospace" }}>${backendDec.negotiation.currentRate}/mi</span></span>
                      <span style={{ fontSize:9, color:'var(--muted)' }}>Target: <span style={{ fontWeight:700, color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>${backendDec.negotiation.targetRate}/mi</span></span>
                      <span style={{ fontSize:9, color:'var(--muted)' }}>Min: <span style={{ fontWeight:700, color:'var(--warning)', fontFamily:"'JetBrains Mono',monospace" }}>${backendDec.negotiation.minAcceptRate}/mi</span></span>
                    </div>
                  </div>
                )}
                {/* Target counter rate (frontend fallback) */}
                {!backendDec?.negotiation && qr.targetRate && (
                  <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'rgba(240,165,0,0.08)', borderRadius:6, marginBottom:8, border:'1px solid rgba(240,165,0,0.15)' }}>
                    <Ic icon={Target} size={12} color="var(--accent)" />
                    <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>Target Counter:</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:800, color:'var(--accent)' }}>${qr.targetRate.toLocaleString()}</span>
                  </div>
                )}
                {/* Weight */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
                  <span style={{ fontSize:9, fontWeight:600, color: qr.isHeavy ? 'var(--warning)' : 'var(--muted)', background: qr.isHeavy ? 'rgba(240,165,0,0.08)' : 'var(--surface2)', padding:'2px 8px', borderRadius:4, border: qr.isHeavy ? '1px solid rgba(240,165,0,0.2)' : '1px solid var(--border)' }}>
                    {qr.weightNote}
                  </span>
                  {qr.laneHistory > 0 && (
                    <span style={{ fontSize:9, fontWeight:600, color:'var(--accent3)', background:'rgba(77,142,240,0.08)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(77,142,240,0.2)' }}>
                      Lane: {qr.laneHistory} prior load{qr.laneHistory > 1 ? 's' : ''} · Avg ${qr.laneAvgRPM}/mi
                    </span>
                  )}
                  {qr.isPowerOnly && <span style={{ fontSize:9, fontWeight:600, color:'var(--accent2)', background:'rgba(139,92,246,0.08)', padding:'2px 8px', borderRadius:4 }}>Power Only</span>}
                  {qr.isDropHook && <span style={{ fontSize:9, fontWeight:600, color:'var(--success)', background:'rgba(52,176,104,0.08)', padding:'2px 8px', borderRadius:4 }}>Drop & Hook</span>}
                  {qr.isBackhaul && <span style={{ fontSize:9, fontWeight:600, color:'var(--success)', background:'rgba(52,176,104,0.08)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(52,176,104,0.2)' }}>Backhaul</span>}
                  {qr.pickupUrgency === 'urgent' && <span style={{ fontSize:9, fontWeight:600, color:'var(--danger)', background:'rgba(239,68,68,0.08)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(239,68,68,0.2)' }}>Urgent Pickup</span>}
                  {qr.isDeadZone && <span style={{ fontSize:9, fontWeight:600, color:'var(--warning)', background:'rgba(240,165,0,0.08)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(240,165,0,0.2)' }}>Dead Zone</span>}
                  {qr.isHotMarket && <span style={{ fontSize:9, fontWeight:600, color:'var(--success)', background:'rgba(52,176,104,0.08)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(52,176,104,0.2)' }}>Hot Market</span>}
                  {qr.hasHighFuel && <span style={{ fontSize:9, fontWeight:600, color:'var(--warning)', background:'rgba(240,165,0,0.08)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(240,165,0,0.2)' }}>High Fuel +${qr.fuelSurcharge}</span>}
                  {qr.isQuickPay && <span style={{ fontSize:9, fontWeight:600, color:'var(--accent3)', background:'rgba(77,142,240,0.08)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(77,142,240,0.2)' }}>Quick Pay</span>}
                </div>
                {/* Risks & Advantages */}
                {(qr.risks.length > 0 || qr.advantages.length > 0) && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                    {qr.risks.length > 0 && (
                      <div>
                        <div style={{ fontSize:8, fontWeight:800, color:'var(--danger)', letterSpacing:1, marginBottom:4 }}>RISKS</div>
                        {qr.risks.map((r,i) => (
                          <div key={i} style={{ fontSize:9, color:'var(--muted)', lineHeight:1.4, display:'flex', gap:4, marginBottom:2 }}>
                            <span style={{ color:'var(--danger)', flexShrink:0 }}>•</span> {r}
                          </div>
                        ))}
                      </div>
                    )}
                    {qr.advantages.length > 0 && (
                      <div>
                        <div style={{ fontSize:8, fontWeight:800, color:'var(--success)', letterSpacing:1, marginBottom:4 }}>ADVANTAGES</div>
                        {qr.advantages.map((a,i) => (
                          <div key={i} style={{ fontSize:9, color:'var(--muted)', lineHeight:1.4, display:'flex', gap:4, marginBottom:2 }}>
                            <span style={{ color:'var(--success)', flexShrink:0 }}>•</span> {a}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Summary */}
                <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4, fontStyle:'italic', borderTop:'1px solid var(--border)', paddingTop:8 }}>
                  {qr.summaryReason}
                </div>
              </div>
            )
          })()}

          {/* Details grid */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Load Details</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { label:'Broker', value: load.broker || '—', highlight: load.load_source === 'amazon_relay' ? '#ff9900' : null },
                { label:'Driver', value: load.driver || 'Unassigned' },
                { label:'Ref #', value: load.amazon_block_id || load.refNum || load.ref_number || '—' },
                { label:'Equipment', value: load.equipment || '—' },
                { label:'Weight', value: load.weight ? `${load.weight} lbs` : '—' },
                { label:'Commodity', value: load.commodity || '—' },
                { label:'Pickup', value: load.pickup || '—' },
                { label:'Delivery', value: load.delivery || '—' },
                ...(load.load_source === 'amazon_relay' ? [
                  { label:'Source', value: 'Amazon Relay', highlight: '#ff9900' },
                  { label:'Payment Terms', value: 'Biweekly', highlight: '#ff9900' },
                ] : []),
              ].map(d => (
                <div key={d.label}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{d.label}</div>
                  <div style={{ fontSize:12, fontWeight:600, color: d.highlight || 'inherit' }}>{d.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ BROKER CONTACT ═══════════════════════════════════ */}
          {(load.broker || load.broker_name || load.broker_phone || load.broker_email) && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:12, textTransform:'uppercase', letterSpacing:1 }}>Broker Contact</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {(load.broker || load.broker_name) && (
                  <div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>Company</div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{load.broker || load.broker_name}</div>
                  </div>
                )}
                {load.broker_contact && (
                  <div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>Contact</div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{load.broker_contact}</div>
                  </div>
                )}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {load.broker_phone && (
                    <a href={`tel:${load.broker_phone}`}
                      style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'var(--accent)', background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:8, padding:'6px 12px', textDecoration:'none' }}>
                      📞 {load.broker_phone}
                    </a>
                  )}
                  {load.broker_email && (
                    <a href={`mailto:${load.broker_email}`}
                      style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'var(--accent3)', background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:8, padding:'6px 12px', textDecoration:'none' }}>
                      ✉ {load.broker_email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ STOPS TIMELINE ═══════════════════════════════════ */}
          {(() => {
            const stops = load.stops || load.load_stops
            if (!stops?.length) return null
            const currentIdx = stops.findIndex(s => s.status === 'current')
            const hasNext = currentIdx >= 0 && currentIdx < stops.length - 1
            return (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:6 }}>
                    <Ic icon={MapPin} size={13} /> Stops ({stops.length})
                  </div>
                  {hasNext && (
                    <button className="btn btn-primary" style={{ fontSize:10, padding:'4px 12px' }}
                      onClick={() => { advanceStop(load.loadId || load.id); showToast('','Stop Advanced', `${load.loadId} → ${stops[currentIdx + 1]?.city || 'Next stop'}`) }}>
                      Advance to Next Stop →
                    </button>
                  )}
                </div>
                {stops.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((stop, i) => {
                  const isComplete = stop.status === 'complete'
                  const isCurrent = stop.status === 'current'
                  const color = isComplete ? 'var(--success)' : isCurrent ? 'var(--accent)' : 'var(--muted)'
                  return (
                    <div key={stop.id || i} style={{ display:'flex', gap:10, position:'relative', paddingBottom: i < stops.length - 1 ? 16 : 0 }}>
                      {/* Timeline line */}
                      {i < stops.length - 1 && (
                        <div style={{ position:'absolute', left:7, top:16, bottom:0, width:2, background: isComplete ? 'var(--success)' : 'var(--border)' }} />
                      )}
                      {/* Dot */}
                      <div style={{ width:16, height:16, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                        background: isComplete ? 'var(--success)' : isCurrent ? 'var(--accent)' : 'var(--surface2)',
                        border: `2px solid ${color}` }}>
                        {isComplete && <span style={{ fontSize:8, color:'#fff' }}>✓</span>}
                        {isCurrent && <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)' }} />}
                      </div>
                      {/* Content */}
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={{ fontSize:11, fontWeight:700, color }}>
                            <span style={{ fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:4, background: stop.type === 'pickup' ? 'rgba(0,212,170,0.1)' : 'rgba(240,165,0,0.1)', color: stop.type === 'pickup' ? 'var(--success)' : 'var(--accent)', marginRight:6 }}>
                              {(stop.type || 'stop').toUpperCase()}
                            </span>
                            {stop.city}{stop.state ? `, ${stop.state}` : ''}
                          </div>
                          <span style={{ fontSize:9, color:'var(--muted)' }}>
                            {isComplete ? 'Complete' : isCurrent ? 'Current' : 'Pending'}
                          </span>
                        </div>
                        {stop.address && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{stop.address}</div>}
                        <div style={{ display:'flex', gap:12, marginTop:3, fontSize:10, color:'var(--muted)' }}>
                          {stop.scheduled_date && <span>📅 {new Date(stop.scheduled_date).toLocaleDateString()}</span>}
                          {stop.contact_name && <span>👤 {stop.contact_name}</span>}
                          {stop.contact_phone && <span>📞 {stop.contact_phone}</span>}
                        </div>
                        {stop.actual_arrival && <div style={{ fontSize:9, color:'var(--success)', marginTop:2 }}>Arrived: {new Date(stop.actual_arrival).toLocaleString()}</div>}
                        {stop.actual_departure && <div style={{ fontSize:9, color:'var(--success)' }}>Departed: {new Date(stop.actual_departure).toLocaleString()}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* ═══ DETENTION TIMER ═══════════════════════════════════ */}
          {['En Route to Pickup','Loaded','In Transit','Delivered'].includes(load.status) && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:6 }}>
                  <Ic icon={Clock} size={13} /> Detention Timer
                </div>
                {detentionStart && !detentionRunning && detentionCharge > 0 && (
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(239,68,68,0.1)', color:'var(--danger)' }}>
                    +${detentionCharge} billable
                  </span>
                )}
              </div>

              {!detentionStart ? (
                <div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, lineHeight:1.5 }}>
                    Start the timer when driver arrives at shipper/receiver. Industry standard: {FREE_TIME_HOURS}hr free time, then ${DETENTION_RATE}/hr.
                  </div>
                  <button className="btn btn-primary" style={{ fontSize:11, width:'100%' }} onClick={startDetention}>
                    <Ic icon={Clock} size={12} /> Start Detention Timer
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ textAlign:'center', marginBottom:10 }}>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:28, fontWeight:800, color: detentionRunning ? (billableDetention > 0 ? 'var(--danger)' : 'var(--accent)') : 'var(--text)', letterSpacing:1 }}>
                      {fmtTime(detentionElapsed)}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                      Started {detentionStart.toLocaleTimeString()} · Free time: {FREE_TIME_HOURS}hr
                      {billableDetention > 0 && <span style={{ color:'var(--danger)', fontWeight:700 }}> · Billable: {billableDetention.toFixed(1)}hr = ${detentionCharge}</span>}
                    </div>
                  </div>
                  {/* Progress bar showing free time vs billable */}
                  <div style={{ height:6, borderRadius:3, background:'var(--surface2)', overflow:'hidden', marginBottom:10 }}>
                    <div style={{
                      height:'100%', borderRadius:3, transition:'width 1s linear',
                      width: `${Math.min(100, (detentionHours / (FREE_TIME_HOURS * 2)) * 100)}%`,
                      background: billableDetention > 0 ? 'linear-gradient(90deg, var(--accent), var(--danger))' : 'var(--accent)',
                    }} />
                  </div>
                  {detentionRunning ? (
                    <button className="btn btn-ghost" style={{ fontSize:11, width:'100%', color:'var(--danger)', border:'1px solid rgba(239,68,68,0.3)' }} onClick={stopDetention}>
                      Stop Timer
                    </button>
                  ) : (
                    <div style={{ fontSize:10, color:'var(--muted)', textAlign:'center' }}>
                      Timer stopped · {billableDetention > 0 ? `$${detentionCharge} detention charge added to accessorials` : 'Within free time — no charge'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ ACCESSORIAL CHARGES / LINE ITEMS ═══════════════════ */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>
                Charges & Accessorials
              </div>
              <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 10px', display:'flex', alignItems:'center', gap:4 }}
                onClick={() => setShowAddAccessorial(true)}>
                <Ic icon={Plus} size={11} /> Add
              </button>
            </div>

            {/* Freight (always shown) */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600 }}>Freight — {origin.split(',')[0]} → {dest.split(',')[0]}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{(load.miles || 0).toLocaleString()} mi · ${rpm}/mi</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>${gross.toLocaleString()}</div>
            </div>

            {/* Line items */}
            {lineItems.map((li, idx) => (
              <div key={idx} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600 }}>{li.description}</div>
                    {li.type && <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5 }}>{li.type}</div>}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--success)' }}>+${parseFloat(li.amount || 0).toLocaleString()}</span>
                  {!linkedInvoice && (
                    <button onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:2 }}>
                      <Ic icon={Trash2} size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Add accessorial form */}
            {showAddAccessorial && (
              <div style={{ padding:'10px 0', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
                <select value={newAccessorial.description}
                  onChange={e => {
                    const val = e.target.value
                    const presets = { 'Detention': detentionCharge || 150, 'Lumper Fee': 0, 'Fuel Surcharge': 0, 'Layover': 250, 'TONU': 250, 'Re-delivery': 150, 'Scale Ticket': 15, 'Toll Charges': 0, 'Other': 0 }
                    setNewAccessorial({ description: val, amount: presets[val] || '' })
                  }}
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
                  <option value="">Select charge type...</option>
                  {['Detention','Lumper Fee','Fuel Surcharge','Layover','TONU','Re-delivery','Scale Ticket','Toll Charges','Other'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div style={{ display:'flex', gap:8 }}>
                  <input type="number" placeholder="Amount ($)" value={newAccessorial.amount}
                    onChange={e => setNewAccessorial(prev => ({ ...prev, amount: e.target.value }))}
                    style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }} />
                  <button className="btn btn-primary" style={{ fontSize:11, padding:'7px 16px' }}
                    disabled={!newAccessorial.description || !newAccessorial.amount}
                    onClick={() => {
                      setLineItems(prev => [...prev, { type: newAccessorial.description.toLowerCase().replace(/\s+/g, '_'), description: newAccessorial.description, amount: parseFloat(newAccessorial.amount) || 0 }])
                      setNewAccessorial({ description: '', amount: '' })
                      setShowAddAccessorial(false)
                    }}>
                    Add
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { setShowAddAccessorial(false); setNewAccessorial({ description: '', amount: '' }) }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Total */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', marginTop:4 }}>
              <span style={{ fontSize:12, fontWeight:700 }}>TOTAL</span>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)' }}>
                ${(gross + accessorialTotal).toLocaleString()}
              </span>
            </div>
            {accessorialTotal > 0 && (
              <div style={{ fontSize:10, color:'var(--muted)', textAlign:'right' }}>
                Freight: ${gross.toLocaleString()} + Accessorials: ${accessorialTotal.toLocaleString()}
              </div>
            )}
          </div>

          {/* ═══ LOAD DOCUMENTS ═══════════════════════════════════ */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>
                Documents ({loadDocs.length})
              </div>
              {uploading && <span style={{ fontSize:10, color:'var(--accent)' }}>Uploading...</span>}
            </div>

            {/* Quick upload buttons */}
            <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
              {[
                { type:'Rate Con', icon: FileText, color:'var(--accent)' },
                { type:'BOL', icon: FileText, color:'var(--accent2)' },
                { type:'POD', icon: CheckCircle, color:'var(--success)' },
                { type:'Lumper Receipt', icon: DollarSign, color:'var(--warning)' },
                { type:'Scale Ticket', icon: FileText, color:'var(--muted)' },
                { type:'Other', icon: Upload, color:'var(--muted)' },
              ].map(d => {
                const hasDoc = loadDocs.some(doc => (doc.doc_type || '').includes(d.type.toLowerCase().replace(/\s+/g, '_')))
                return (
                  <button key={d.type} onClick={() => handleDocUpload(d.type)} disabled={uploading}
                    style={{ padding:'6px 12px', fontSize:10, fontWeight:700, borderRadius:7, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                      border: hasDoc ? `1px solid ${d.color}40` : '1px solid var(--border)',
                      background: hasDoc ? `${d.color}10` : 'var(--surface2)',
                      color: hasDoc ? d.color : 'var(--muted)', display:'flex', alignItems:'center', gap:5 }}>
                    {hasDoc ? <CheckCircle size={11} /> : <Upload size={11} />} {d.type}
                  </button>
                )
              })}
            </div>

            {/* Document list */}
            {docsLoading ? (
              <div style={{ fontSize:11, color:'var(--muted)', padding:'8px 0' }}>Loading documents...</div>
            ) : loadDocs.length === 0 ? (
              <div style={{ fontSize:11, color:'var(--muted)', padding:'8px 0' }}>No documents attached yet. Upload Rate Con, BOL, or POD above.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {loadDocs.map(doc => {
                  const isImage = /\.(jpg|jpeg|png|webp|heic)$/i.test(doc.file_url || doc.file_path || '')
                  return (
                    <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--surface2)', borderRadius:8 }}>
                      <div style={{ width:28, height:28, borderRadius:6, background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {isImage ? <Image size={14} color="var(--accent)" /> : <FileText size={14} color="var(--accent)" />}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name || doc.doc_type || 'Document'}</div>
                        <div style={{ fontSize:9, color:'var(--muted)' }}>{doc.doc_type?.replace(/_/g, ' ')} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : ''}</div>
                      </div>
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        {doc.file_url && <button onClick={() => window.open(doc.file_url, '_blank')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', padding:4 }}><Eye size={14} /></button>}
                        <button onClick={() => handleDocDelete(doc.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ═══ BROKER NOTIFICATIONS ═════════════════════════════ */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:6 }}>
              <Bell size={12} /> Broker Notifications
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[
                { status:'Assigned to Driver', label:'Driver Assigned', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('Assigned to Driver') },
                { status:'En Route to Pickup', label:'En Route to Pickup', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('En Route to Pickup') },
                { status:'Loaded', label:'Loaded at Shipper', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('Loaded') },
                { status:'In Transit', label:'In Transit', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('In Transit') },
                { status:'Delivered', label:'Delivered — POD Sent', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('Delivered') },
                { status:'Invoiced', label:'Invoice Sent', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('Invoiced') },
              ].map(n => (
                <div key={n.status} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0' }}>
                  <div style={{ width:20, height:20, borderRadius:'50%', border: n.sent ? '2px solid var(--success)' : '2px solid var(--border)',
                    background: n.sent ? 'rgba(34,197,94,0.1)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {n.sent && <CheckCircle size={12} color="var(--success)" />}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight: n.sent ? 600 : 400, color: n.sent ? 'var(--text)' : 'var(--muted)' }}>{n.label}</div>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, color: n.sent ? 'var(--success)' : 'var(--muted)' }}>
                    {n.sent ? 'SENT' : 'PENDING'}
                  </span>
                </div>
              ))}
            </div>
            {load.broker_phone && (
              <div style={{ marginTop:8, padding:'8px 10px', background:'var(--surface2)', borderRadius:8, fontSize:10, color:'var(--muted)' }}>
                Notifications sent to: <strong>{load.broker || load.broker_name}</strong> · {load.broker_phone}{load.broker_email ? ` · ${load.broker_email}` : ''}
              </div>
            )}
          </div>

          {/* Invoice */}
          {linkedInvoice && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Invoice</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{linkedInvoice.invoice_number}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>${Number(linkedInvoice.amount || 0).toLocaleString()} {linkedInvoice.dueDate ? `· Due ${linkedInvoice.dueDate}` : ''}</div>
                </div>
                <InvoiceStatusBadge status={linkedInvoice.status} />
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 12px' }}
                  onClick={() => { window.open(`/api/invoice-pdf?invoiceId=${encodeURIComponent(linkedInvoice._dbId || linkedInvoice.id)}`, '_blank') }}>
                  View Invoice
                </button>
                <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 12px' }}
                  onClick={() => handleAutoInvoice()}>
                  Resend to Broker
                </button>
                {linkedInvoice.status === 'Unpaid' && (
                  <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 12px', color:'var(--accent2)', borderColor:'rgba(139,92,246,0.3)' }}
                    onClick={() => setShowFactorPrompt(true)}>
                    Factor This Invoice
                  </button>
                )}
              </div>

              {/* Factor Invoice Prompt */}
              {showFactorPrompt && linkedInvoice.status === 'Unpaid' && (() => {
                const factorCompany = carrierCompany?.factoring_company || ''
                const factorRate = parseFloat(carrierCompany?.factoring_rate) || 2.5
                const invAmount = Number(linkedInvoice.amount || 0)
                const fee = Math.round(invAmount * (factorRate / 100) * 100) / 100
                const net = invAmount - fee
                return (
                  <div style={{ marginTop:12, background:'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(240,165,0,0.04))', border:'1px solid rgba(139,92,246,0.25)', borderRadius:12, padding:14 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--accent2)', marginBottom:10 }}>Submit to Factoring</div>
                    {!factorCompany ? (
                      <div style={{ fontSize:11, color:'var(--muted)' }}>
                        No factoring company set up. Go to <b>Financials → Factoring → Settings</b> to select your factor.
                      </div>
                    ) : (
                      <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                          {[
                            { label:'Factor', value: factorCompany },
                            { label:'Rate', value: factorRate + '%' },
                            { label:'Invoice Amount', value: '$' + invAmount.toLocaleString() },
                            { label:'Fee', value: '−$' + fee.toLocaleString() },
                          ].map(item => (
                            <div key={item.label} style={{ padding:'6px 10px', background:'var(--surface2)', borderRadius:8 }}>
                              <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>{item.label}</div>
                              <div style={{ fontSize:12, fontWeight:700 }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background:'rgba(139,92,246,0.1)', borderRadius:8, marginBottom:10 }}>
                          <span style={{ fontSize:11, fontWeight:600 }}>You Receive (24hr deposit)</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent2)' }}>${net.toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:10 }}>
                          Documents included: Invoice + Rate Con + BOL + POD (if uploaded)
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button className="btn btn-primary" style={{ flex:1, fontSize:11, padding:'8px 0', background:'var(--accent2)' }}
                            onClick={async () => {
                              try {
                                const res = await apiFetch('/api/factor-invoice', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    invoiceId: linkedInvoice._dbId || linkedInvoice.id,
                                    factoringCompany: factorCompany,
                                    factoringRate: factorRate,
                                  }),
                                })
                                const data = await res.json()
                                if (data.success) {
                                  updateInvoiceStatus(linkedInvoice.id || linkedInvoice.invoice_number, 'Factored')
                                  showToast('', 'Invoice Factored!', `${data.invoiceNumber} → ${data.sentTo} · $${data.net.toLocaleString()} depositing in 24hrs`)
                                } else {
                                  updateInvoiceStatus(linkedInvoice.id || linkedInvoice.invoice_number, 'Factored')
                                  showToast('', 'Invoice Factored', `${linkedInvoice.invoice_number} marked as factored (email not sent: ${data.error || 'API unavailable'})`)
                                }
                              } catch {
                                updateInvoiceStatus(linkedInvoice.id || linkedInvoice.invoice_number, 'Factored')
                                showToast('', 'Invoice Factored', `${linkedInvoice.invoice_number} → ${factorCompany} · marked locally`)
                              }
                              setShowFactorPrompt(false)
                            }}>
                            Submit to {factorCompany}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize:11, padding:'8px 12px' }}
                            onClick={() => setShowFactorPrompt(false)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Check calls */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Check Calls ({loadCalls.length})</div>
            {loadCalls.length === 0
              ? <div style={{ fontSize:12, color:'var(--muted)' }}>No check calls logged yet</div>
              : loadCalls.slice(-5).reverse().map((c, i) => (
                <div key={i} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                  <div style={{ fontWeight:600 }}>{c.note || c.message}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{c.time || c.timestamp}</div>
                </div>
              ))
            }
          </div>

          {/* Financial summary */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Financial Summary</div>
            {(() => {
              const driverRec = (drivers || []).find(d => (d.full_name || d.name) === load.driver)
              const payModel = driverRec?.pay_model || 'percent'
              const payRate = parseFloat(driverRec?.pay_rate) || 50
              const miles = load.miles || 0
              const driverPay = payModel === 'permile' ? Math.round(miles * payRate) : payModel === 'flat' ? Math.round(payRate) : Math.round(gross * (payRate / 100))
              const payLabel = payModel === 'permile' ? `$${payRate}/mi` : payModel === 'flat' ? `$${payRate}/load` : `${payRate}%`
              const fuelRate = fuelCostPerMile
              const fuelCost = Math.round(miles * fuelRate)
              const estNet = gross - driverPay - fuelCost
              return [
                { label:'Gross Revenue', value:`$${gross.toLocaleString()}`, color:'var(--accent)' },
                { label:`Est. Driver Pay (${payLabel})`, value:`-$${driverPay.toLocaleString()}`, color:'var(--danger)' },
                { label:`Est. Fuel ($${fuelRate.toFixed(2)}/mi)`, value:`-$${fuelCost.toLocaleString()}`, color:'var(--danger)' },
                { label:'Est. Net', value:`$${estNet.toLocaleString()}`, color:'var(--success)', bold:true },
              ]
            })().map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:12, color:'var(--muted)' }}>{r.label}</span>
                <span style={{ fontSize: r.bold ? 16 : 13, fontWeight: r.bold ? 800 : 600, color:r.color, fontFamily: r.bold ? "'Bebas Neue',sans-serif" : 'inherit' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Q BOL Mismatch Modal ──────────────────────────────────────────── */}
      {bolMismatches.length > 0 && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#0e0e0e', border:'1px solid #3a1010', borderRadius:20, padding:28, width:'100%', maxWidth:480, boxShadow:'0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:'rgba(217,85,85,0.15)', border:'1px solid rgba(217,85,85,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ color:'#d95555', fontSize:18, fontWeight:900 }}>Q</span>
              </div>
              <div>
                <div style={{ color:'#d95555', fontWeight:800, fontSize:15 }}>Q Found Issues With This BOL</div>
                <div style={{ color:'#8b92a8', fontSize:12, marginTop:2 }}>Doesn't match the rate con — review before submitting</div>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10, margin:'18px 0' }}>
              {bolMismatches.map((issue, i) => (
                <div key={i} style={{
                  borderRadius:12, padding:'12px 14px',
                  background: issue.severity === 'critical' ? 'rgba(217,85,85,0.08)' : 'rgba(240,165,0,0.08)',
                  border: `1px solid ${issue.severity === 'critical' ? 'rgba(217,85,85,0.3)' : 'rgba(240,165,0,0.3)'}`,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:14 }}>{issue.severity === 'critical' ? '🔴' : '⚠️'}</span>
                    <span style={{ fontWeight:800, fontSize:12, color: issue.severity === 'critical' ? '#d95555' : '#f0a500', letterSpacing:.5 }}>{issue.field}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#8b92a8', marginBottom:3 }}>BOL says:</div>
                  <div style={{ fontSize:13, color:'#c8d0dc', fontWeight:600, marginBottom:8 }}>{issue.bolValue}</div>
                  <div style={{ fontSize:12, color:'#8b92a8', marginBottom:3 }}>Rate con says:</div>
                  <div style={{ fontSize:13, color:'#2cb896', fontWeight:600 }}>{issue.expected}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => { setBolMismatches([]); setPendingDelivery(null) }}
                style={{ flex:1, padding:'12px 0', borderRadius:12, background:'#1a1a1a', border:'1px solid #262d40', color:'#c8d0dc', fontWeight:700, cursor:'pointer', fontSize:14 }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setBolMismatches([])
                  if (pendingDelivery) await pendingDelivery()
                  setPendingDelivery(null)
                }}
                style={{ flex:1, padding:'12px 0', borderRadius:12, background:'rgba(217,85,85,0.12)', border:'1px solid rgba(217,85,85,0.4)', color:'#d95555', fontWeight:800, cursor:'pointer', fontSize:14 }}
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
