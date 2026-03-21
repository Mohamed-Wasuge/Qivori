import React, { useState, useCallback, useRef } from 'react'
import {
  FileText, ClipboardList, CheckCircle, Receipt, Scale, Zap, AlertTriangle
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { generateInvoicePDF } from '../../utils/generatePDF'
import { Ic } from './shared'

// ── Dispatch tab ───────────────────────────────────────────────────────────────
export const DRIVERS = [] // populated from context
export const STATUS_FLOW = ['Rate Con Received', 'Assigned to Driver', 'En Route to Pickup', 'Loaded', 'In Transit', 'Delivered', 'Invoiced']
export const STATUS_COLORS = {
  'Rate Con Received': 'var(--accent)',
  'Assigned to Driver': 'var(--accent3)',
  'En Route to Pickup': 'var(--accent2)',
  'Loaded': 'var(--accent2)',
  'In Transit': 'var(--success)',
  'Delivered': 'var(--muted)',
  'Invoiced': 'var(--success)',
}

// ── Rate Con parser — calls Claude API via backend ────────────────────────────
export async function parseRateConWithAI(file) {
  // Compress image before sending
  let b64, mt
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Compression timed out')), 15000)
      if ((file.type || '').includes('pdf') || file.name.endsWith('.pdf')) {
        const reader = new FileReader()
        reader.onload = () => { clearTimeout(timeout); resolve({ b64: reader.result.split(',')[1], mt: 'application/pdf' }) }
        reader.onerror = () => { clearTimeout(timeout); reject(new Error('Could not read PDF')) }
        reader.readAsDataURL(file)
        return
      }
      const img = new Image()
      img.onload = () => {
        clearTimeout(timeout)
        const maxW = 800; let w = img.width, h = img.height
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve({ b64: c.toDataURL('image/jpeg', 0.6).split(',')[1], mt: 'image/jpeg' })
      }
      img.onerror = () => {
        clearTimeout(timeout)
        const reader = new FileReader()
        reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: file.type || 'image/jpeg' })
        reader.onerror = () => reject(new Error('Could not read file'))
        reader.readAsDataURL(file)
      }
      img.src = URL.createObjectURL(file)
    })
    b64 = result.b64
    mt = result.mt
  } catch (compErr) {
    throw compErr
  }

  const res = await apiFetch('/api/parse-ratecon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: b64, mediaType: mt })
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { throw new Error('Invalid response: ' + text.slice(0, 100)) }
  if (data.error) throw new Error(data.error)
  return {
    loadId: data.load_number || '',
    broker: data.broker || '',
    brokerPhone: data.broker_phone || '',
    brokerEmail: data.broker_email || '',
    driver: '',
    refNum: data.reference_number || data.po_number || '',
    origin: data.origin || '',
    originAddress: data.origin_address || '',
    originZip: data.origin_zip || '',
    shipperName: data.shipper_name || '',
    shipperPhone: data.shipper_phone || '',
    dest: data.destination || '',
    destAddress: data.destination_address || '',
    destZip: data.destination_zip || '',
    consigneeName: data.consignee_name || '',
    consigneePhone: data.consignee_phone || '',
    rate: data.rate ? String(data.rate) : '',
    miles: data.miles ? String(data.miles) : '',
    weight: data.weight ? String(data.weight) : '',
    commodity: data.commodity || '',
    pickup: data.pickup_date || '',
    pickupTime: data.pickup_time || '',
    delivery: data.delivery_date || '',
    deliveryTime: data.delivery_time || '',
    equipment: data.equipment || '',
    notes: data.notes || '',
    specialInstructions: data.special_instructions || '',
    gross: data.rate ? parseFloat(data.rate) : 0,
  }
}

export const DOC_TYPES = ['Rate Con', 'BOL', 'POD', 'Lumper Receipt', 'Scale Ticket', 'Other']
export const DOC_ICONS = { 'Rate Con': FileText, 'BOL': ClipboardList, 'POD': CheckCircle, 'Lumper Receipt': Receipt, 'Scale Ticket': Scale, 'Other': FileText }
export const DOC_COLORS = { 'Rate Con': 'var(--accent)', 'BOL': 'var(--accent2)', 'POD': 'var(--success)', 'Lumper Receipt': 'var(--accent3)', 'Scale Ticket': 'var(--warning)', 'Other': 'var(--muted)' }

export function BookedLoads() {
  const { showToast } = useApp()
  const { loads: bookedLoads, addLoad: ctxAddLoad, updateLoadStatus: ctxUpdateStatus, removeLoad, company, drivers: ctxDrivers } = useCarrier()
  const driverNames = (ctxDrivers || []).map(d => d.name || d.full_name || d.driver_name).filter(Boolean)
  const [loadDocs, setLoadDocs] = useState({
    1: [{ id: 1, name: 'EC-88421-ratecon.pdf', type: 'Rate Con', size: '124 KB', uploadedAt: 'Mar 8', dataUrl: null }],
    2: [{ id: 2, name: 'CL-22910-ratecon.pdf', type: 'Rate Con', size: '98 KB',  uploadedAt: 'Mar 8', dataUrl: null }],
  })
  const [docsOpenId, setDocsOpenId] = useState(null)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [docType, setDocType] = useState('BOL')
  const [showForm, setShowForm] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [signatureModal, setSignatureModal] = useState(null) // { loadId, docId }
  const sigCanvasRef = useRef(null)
  const sigDrawing = useRef(false)
  const [form, setForm] = useState({ loadId: '', broker: '', origin: '', dest: '', miles: '', rate: '', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', driver: '', gross: 0 })

  const handleDocUpload = useCallback(async (loadId, file, type) => {
    if (!file) return
    const sizeLabel = file.size > 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB'

    // Upload to Supabase Storage + save to documents table
    try {
      const { uploadFile } = await import('../../lib/storage')
      const { createDocument } = await import('../../lib/database')
      const uploaded = await uploadFile(file, `loads/${loadId}`)
      const dbDoc = await createDocument({
        load_id: loadId,
        name: file.name,
        type,
        file_url: uploaded.url,
        file_size: file.size,
      })
      const doc = {
        id: dbDoc?.id || Date.now(),
        name: file.name,
        type,
        size: sizeLabel,
        uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fileUrl: uploaded.url,
      }
      setLoadDocs(d => ({ ...d, [loadId]: [...(d[loadId] || []), doc] }))
      showToast('success', type + ' Uploaded', file.name)
    } catch (err) {
      /* Storage upload failed — fallback to local dataUrl */
      const reader = new FileReader()
      reader.onload = e => {
        const doc = { id: Date.now(), name: file.name, type, size: sizeLabel, uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), dataUrl: e.target.result }
        setLoadDocs(d => ({ ...d, [loadId]: [...(d[loadId] || []), doc] }))
        showToast('', type + ' Uploaded (local)', file.name)
      }
      reader.readAsDataURL(file)
    }
    setUploadingFor(null)
  }, [showToast])

  const removeDoc = async (loadId, docId) => {
    setLoadDocs(d => ({ ...d, [loadId]: d[loadId].filter(doc => doc.id !== docId) }))
    try {
      const { deleteDocument } = await import('../../lib/database')
      await deleteDocument(docId)
    } catch (err) { /* non-critical: DB delete failed */ }
    showToast('', 'Document Removed', '')
  }

  const [invoiceLoad, setInvoiceLoad] = useState(null)

  const viewDoc = (doc) => {
    if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank')
      return
    }
    if (doc.dataUrl) {
      const w = window.open()
      w.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:none"></iframe>`)
    } else {
      showToast('', doc.name, 'No preview available')
    }
  }

  const signDoc = (loadId, docId) => setSignatureModal({ loadId, docId })

  const initSigCanvas = useCallback((canvas) => {
    if (!canvas) return
    sigCanvasRef.current = canvas
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const clearSigCanvas = useCallback(() => {
    const canvas = sigCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getSigPos = useCallback((e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  const onSigDown = useCallback((e) => {
    e.preventDefault()
    const canvas = sigCanvasRef.current
    if (!canvas) return
    sigDrawing.current = true
    const ctx = canvas.getContext('2d')
    const pos = getSigPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getSigPos])

  const onSigMove = useCallback((e) => {
    e.preventDefault()
    if (!sigDrawing.current) return
    const canvas = sigCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pos = getSigPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [getSigPos])

  const onSigUp = useCallback((e) => {
    e.preventDefault()
    sigDrawing.current = false
  }, [])

  const saveSignature = useCallback(() => {
    if (!signatureModal || !sigCanvasRef.current) return
    const dataUrl = sigCanvasRef.current.toDataURL('image/png')
    const { loadId, docId } = signatureModal
    setLoadDocs(prev => ({
      ...prev,
      [loadId]: (prev[loadId] || []).map(doc =>
        doc.id === docId ? { ...doc, signed: true, signatureData: dataUrl } : doc
      )
    }))
    setSignatureModal(null)
    showToast('', 'Signature Saved', 'Document signed successfully')
  }, [signatureModal, showToast])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isPDF   = file.type === 'application/pdf'
    const validExt = /\.(pdf|png|jpg|jpeg)$/i
    if (!isPDF && !isImage && !validExt.test(file.name)) { showToast('', 'Unsupported File', 'Drop a PDF or image (photo, scan) of the rate confirmation'); return }
    setParsing(true)
    setShowForm(true)
    showToast('', 'Reading Rate Con', `Compressing ${file.name} (${(file.size/1024).toFixed(0)} KB)...`)
    try {
      const parsed = await parseRateConWithAI(file)
      setForm(parsed)
      const filled = Object.values(parsed).filter(v => v && v !== 0 && v !== '').length
      showToast('', 'Rate Con Parsed', `${filled} fields auto-filled — review and confirm`)
    } catch (e) {
      showToast('', 'Parse Failed', e.message || 'Check your API key and try again')
      setShowForm(false)
    } finally {
      setParsing(false)
    }
  }, [showToast])

  const updateStatus = (loadId, newStatus) => {
    ctxUpdateStatus(loadId, newStatus)
    if (newStatus === 'Delivered') showToast('', 'Invoice Created', 'Load ' + loadId + ' — invoice auto-generated')
    else showToast('', 'Status Updated', newStatus)
  }

  const assignDriver = (loadId, driver) => {
    ctxUpdateStatus(loadId, 'Assigned to Driver')
    showToast('', 'Driver Assigned', driver)
  }

  const addLoad = () => {
    if (!form.origin || !form.dest) { showToast('', 'Missing Fields', 'Origin and destination required'); return }
    const gross = parseFloat(form.rate) || form.gross || 0
    const miles = parseFloat(form.miles) || 0
    const autoId = form.loadId || ('RC-' + Date.now().toString(36).toUpperCase())
    // Map form fields to DB schema
    ctxAddLoad({
      load_id: autoId,
      origin: form.origin,
      destination: form.dest,
      rate: gross,
      broker_name: form.broker || 'Direct',
      carrier_name: form.driver || null,
      equipment: form.equipment || 'Dry Van',
      weight: form.weight || null,
      notes: form.commodity || null,
      pickup_date: form.pickup || null,
      delivery_date: form.delivery || null,
      status: 'Rate Con Received',
      // Keep extra fields for local display
      miles, refNum: form.refNum, rateCon: true,
    })
    setForm({ loadId: '', broker: '', origin: '', dest: '', miles: '', rate: '', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', driver: '', gross: 0 })
    setShowForm(false)
    showToast('', 'Load Added', autoId + ' · ' + form.origin + ' → ' + form.dest)
  }

  return (
    <div style={{ padding: 20, paddingBottom: 60, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1 }}>BOOKED LOADS</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loads confirmed via rate confirmation — assign drivers and track to invoice</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? '✕ Cancel' : '+ Add Rate Con'}
        </button>
      </div>

      {/* Drop Zone */}
      {!showForm && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('ratecon-input').click()}
          style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(240,165,0,0.04)' : 'transparent', transition: 'all 0.2s' }}>
          <input id="ratecon-input" type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          <div style={{ marginBottom: 10, display:'flex', justifyContent:'center' }}><Ic icon={FileText} size={36} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Drop Rate Confirmation Here</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>PDF or image · AI will auto-fill all fields</div>
        </div>
      )}

      {/* Parsing spinner */}
      {parsing && (
        <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Ic icon={Zap} size={14} color="var(--accent)" /> Parsing rate confirmation...</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Extracting load details, rates, and dates</div>
        </div>
      )}

      {/* Auto-filled form */}
      {showForm && !parsing && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', display:'flex', alignItems:'center', gap:6 }}><Ic icon={FileText} size={14} /> Rate Confirmation — Review & Confirm</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { document.getElementById('ratecon-input2').click() }}>
                Re-upload
              </button>
              <input id="ratecon-input2" type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { setShowForm(false); setForm({ loadId:'',broker:'',origin:'',dest:'',miles:'',rate:'',pickup:'',delivery:'',weight:'',commodity:'',refNum:'',driver:'',gross:0 }) }}>
                ✕ Cancel
              </button>
            </div>
          </div>
          {/* Broker / Load Info */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>LOAD INFO</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'loadId',    label: 'Load / Order #',  ph: 'Auto-generated if empty' },
              { key: 'refNum',    label: 'Reference / PO #', ph: 'Broker ref' },
              { key: 'broker',    label: 'Broker',           ph: 'TQL, Echo, CH Robinson...' },
              { key: 'brokerPhone', label: 'Broker Phone',   ph: '(555) 123-4567' },
              { key: 'brokerEmail', label: 'Broker Email',   ph: 'dispatch@broker.com' },
              { key: 'equipment', label: 'Equipment',        ph: 'Dry Van' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Shipper / Origin */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--success)', letterSpacing: 1.5, marginBottom: 8 }}>PICKUP / SHIPPER</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'shipperName',   label: 'Shipper Name',    ph: 'Company name' },
              { key: 'shipperPhone',  label: 'Shipper Phone',   ph: '(555) 123-4567' },
              { key: 'origin',        label: 'Origin City, ST', ph: 'Atlanta, GA' },
              { key: 'originAddress', label: 'Street Address',  ph: '123 Warehouse Dr' },
              { key: 'originZip',     label: 'ZIP',             ph: '30301' },
              { key: 'pickup',        label: 'Pickup Date',     ph: '2024-03-10' },
              { key: 'pickupTime',    label: 'Pickup Time',     ph: '08:00 AM' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Consignee / Destination */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--danger)', letterSpacing: 1.5, marginBottom: 8 }}>DELIVERY / CONSIGNEE</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'consigneeName',  label: 'Consignee Name',    ph: 'Company name' },
              { key: 'consigneePhone', label: 'Consignee Phone',   ph: '(555) 123-4567' },
              { key: 'dest',           label: 'Dest City, ST',     ph: 'Dallas, TX' },
              { key: 'destAddress',    label: 'Street Address',    ph: '456 Distribution Blvd' },
              { key: 'destZip',        label: 'ZIP',               ph: '75201' },
              { key: 'delivery',       label: 'Delivery Date',     ph: '2024-03-12' },
              { key: 'deliveryTime',   label: 'Delivery Time',     ph: '06:00 PM' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Rate / Weight / Commodity */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>RATE & CARGO</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { key: 'rate',      label: 'Total Rate ($)', ph: '3500' },
              { key: 'miles',     label: 'Miles',          ph: '674' },
              { key: 'weight',    label: 'Weight (lbs)',   ph: '42000' },
              { key: 'commodity', label: 'Commodity',      ph: 'Auto Parts' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
            {/* Notes */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 10, color: form.notes || form.specialInstructions ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                {form.notes || form.specialInstructions ? '+ ' : ''}Notes / Special Instructions
              </label>
              <input value={form.notes || form.specialInstructions || ''} onChange={e => setForm(fm => ({ ...fm, notes: e.target.value }))}
                placeholder="Temperature requirements, appointment notes, etc."
                style={{ width: '100%', background: (form.notes || form.specialInstructions) ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${(form.notes || form.specialInstructions) ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Driver */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Assign Driver</label>
            <select value={form.driver} onChange={e => setForm(fm => ({ ...fm, driver: e.target.value }))}
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: form.driver ? 'var(--text)' : 'var(--muted)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
              <option value="">— Assign later —</option>
              {driverNames.length === 0 && <option disabled>No drivers added yet</option>}
              {driverNames.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          {form.rate && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, fontSize: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <span>Gross: <b style={{ color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18 }}>${parseFloat(form.rate||0).toLocaleString(undefined,{maximumFractionDigits:0})}</b></span>
              {form.miles && <span>RPM: <b style={{ color: 'var(--accent2)' }}>${(parseFloat(form.rate||0) / parseFloat(form.miles||1)).toFixed(2)}</b>/mi</span>}
              {form.miles && <span>Est. Fuel: <b style={{ color: 'var(--danger)' }}>${Math.round(parseFloat(form.miles||0)/6.8*3.89).toLocaleString()}</b></span>}
              {form.miles && <span>Est. Net: <b style={{ color: 'var(--success)' }}>${Math.round(parseFloat(form.rate||0) - parseFloat(form.miles||0)/6.8*3.89 - parseFloat(form.rate||0)*0.28).toLocaleString()}</b></span>}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: 14 }} onClick={addLoad}>
            Confirm & Add Load
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { label: 'Total Booked',   value: bookedLoads.length,                                      color: 'var(--accent)' },
          { label: 'In Transit',     value: bookedLoads.filter(l => l.status === 'In Transit').length, color: 'var(--success)' },
          { label: 'Needs Driver',   value: bookedLoads.filter(l => !l.driver).length,                color: 'var(--warning)' },
          { label: 'Gross Revenue',  value: '$' + bookedLoads.reduce((s, l) => s + l.gross, 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Invoice Modal */}
      {invoiceLoad && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setInvoiceLoad(null) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, color:'var(--accent)' }}>INVOICE</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>INV-{String(invoiceLoad.id).slice(-4).padStart(4,'0')} · {new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
              </div>
              <button onClick={() => setInvoiceLoad(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:8, letterSpacing:1 }}>FROM</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{company?.name || 'Your Company'}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{company?.mc || ''} · {company?.dot || ''}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{company?.email || 'ops@swiftcarriers.com'}</div>
              </div>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:8, letterSpacing:1 }}>BILL TO</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{invoiceLoad.broker}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Ref: {invoiceLoad.refNum || '—'}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Load ID: {invoiceLoad.loadId}</div>
              </div>
            </div>

            <div style={{ background:'var(--surface2)', borderRadius:10, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:10, letterSpacing:1 }}>LOAD DETAILS</div>
              {[
                { label:'Route',      value: invoiceLoad.origin + ' → ' + invoiceLoad.dest },
                { label:'Pickup',     value: invoiceLoad.pickup },
                { label:'Delivery',   value: invoiceLoad.delivery },
                { label:'Miles',      value: invoiceLoad.miles.toLocaleString() + ' mi' },
                { label:'Commodity',  value: invoiceLoad.commodity },
                { label:'Weight',     value: invoiceLoad.weight + ' lbs' },
                { label:'Driver',     value: invoiceLoad.driver || '—' },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontSize:12, fontWeight:600 }}>{item.value}</span>
                </div>
              ))}
            </div>

            <div style={{ background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, padding:16, marginBottom:16 }}>
              {[
                { label:'Freight Charge', value: '$' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0}), main:false },
                { label:'Fuel Surcharge', value: '$0.00', main:false },
                { label:'TOTAL DUE', value: '$' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0}), main:true },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding: item.main ? '10px 0 0' : '6px 0', borderTop: item.main ? '2px solid var(--border)' : 'none', marginTop: item.main ? 6 : 0 }}>
                  <span style={{ fontSize: item.main ? 14 : 12, fontWeight: item.main ? 800 : 400, color: item.main ? 'var(--text)' : 'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: item.main ? 26 : 18, color: item.main ? 'var(--accent)' : 'var(--text)' }}>{item.value}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16, padding:'10px 14px', background:'var(--surface2)', borderRadius:8 }}>
              Payment Terms: Net 30 · Please reference invoice number {`INV-${String(invoiceLoad.id).slice(-4).padStart(4,'0')}`} on payment.
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={() => { showToast('','Invoice Sent', invoiceLoad.broker + ' · $' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0})); setInvoiceLoad(null) }}><Ic icon={FileText} size={14} /> Send to Broker</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => {
                const invId = 'INV-' + String(invoiceLoad.id).slice(-4).padStart(4,'0')
                const route = invoiceLoad.origin?.split(',')[0]?.substring(0,3)?.toUpperCase() + ' → ' + invoiceLoad.dest?.split(',')[0]?.substring(0,3)?.toUpperCase()
                generateInvoicePDF({ id: invId, loadId: invoiceLoad.loadId, broker: invoiceLoad.broker, route, amount: invoiceLoad.gross, date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}), dueDate: 'Net 30', driver: invoiceLoad.driver, status: 'Unpaid' })
                showToast('','PDF Downloaded', invId + '.pdf')
                setInvoiceLoad(null)
              }}>Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Load cards */}
      {bookedLoads.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          No booked loads yet. Click <b>+ Add Rate Con</b> to log your first confirmed load.
        </div>
      )}
      {bookedLoads.map(load => {
        const isExpanded = expandedId === load.id
        const statusColor = STATUS_COLORS[load.status] || 'var(--muted)'
        const stepIdx = STATUS_FLOW.indexOf(load.status)
        return (
          <div key={load.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--border)' : 'none' }}
              onClick={() => setExpandedId(isExpanded ? null : load.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{load.origin} <span style={{ color: 'var(--accent)' }}>→</span> {load.dest}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: statusColor + '15', color: statusColor, border: '1px solid ' + statusColor + '30' }}>{load.status}</span>
                  {load.rateCon && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' }}>Rate Con</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {load.loadId} · {load.broker} · {load.miles.toLocaleString()} mi · {load.commodity}
                  {load.driver ? <span> · <b style={{ color: 'var(--accent2)' }}>{load.driver}</b></span> : <span style={{ color: 'var(--warning)' }}> · No driver assigned</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: 'var(--accent)', lineHeight: 1 }}>${load.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>${load.rate}/mi</div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Progress bar */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Load Progress</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {STATUS_FLOW.map((s, i) => (
                      <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ height: 4, borderRadius: 2, background: i <= stepIdx ? STATUS_COLORS[s] || 'var(--accent)' : 'var(--border)', marginBottom: 4 }} />
                        <div style={{ fontSize: 9, color: i === stepIdx ? STATUS_COLORS[s] : 'var(--muted)', fontWeight: i === stepIdx ? 700 : 400, lineHeight: 1.2 }}>{s}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
                  {[
                    { label: 'Ref #',        value: load.refNum || '—' },
                    { label: 'Pickup',        value: load.pickup },
                    { label: 'Delivery',      value: load.delivery },
                    { label: 'Weight',        value: load.weight + ' lbs' },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Assign driver */}
                {!load.driver && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:4 }}><Ic icon={AlertTriangle} size={12} color="var(--warning)" /> Assign a driver to dispatch this load:</span>
                    {driverNames.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>No drivers added yet</span>}
                    {driverNames.map(d => (
                      <button key={d} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => assignDriver(load.loadId, d)}>{d}</button>
                    ))}
                  </div>
                )}

                {/* Status actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Update status:</span>
                  {STATUS_FLOW.filter((_, i) => i > stepIdx).slice(0, 3).map(s => (
                    <button key={s} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => updateStatus(load.loadId, s)}>{s} →</button>
                  ))}
                  {load.status === 'Delivered' && (
                    <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { updateStatus(load.loadId, 'Invoiced'); setInvoiceLoad(load) }}>
                      Generate Invoice
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 'auto', color: docsOpenId === load.id ? 'var(--accent)' : undefined }}
                    onClick={() => setDocsOpenId(docsOpenId === load.id ? null : load.id)}>
                    Documents {loadDocs[load.id]?.length ? `(${loadDocs[load.id].length})` : ''}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--danger)' }}
                    onClick={() => { if (window.confirm(`Delete load ${load.loadId}? This cannot be undone.`)) removeLoad(load.loadId) }}>
                    Delete Load
                  </button>
                </div>

                {/* Documents panel */}
                {docsOpenId === load.id && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={FileText} size={12} /> Load Documents</div>
                      <button className="btn btn-primary" style={{ fontSize: 11 }}
                        onClick={() => setUploadingFor(uploadingFor === load.id ? null : load.id)}>
                        {uploadingFor === load.id ? '✕ Cancel' : '+ Upload Doc'}
                      </button>
                    </div>

                    {/* Upload form */}
                    {uploadingFor === load.id && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8 }}>
                        <select value={docType} onChange={e => setDocType(e.target.value)}
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                          {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                        <label style={{ flex: 1, cursor: 'pointer' }}>
                          <input type="file" accept=".pdf,image/*" style={{ display: 'none' }}
                            onChange={e => { if (e.target.files[0]) handleDocUpload(load.id, e.target.files[0], docType) }} />
                          <div style={{ border: '1px dashed var(--border)', borderRadius: 6, padding: '6px 14px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                            Click to choose file (PDF or image)
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Doc list */}
                    {(loadDocs[load.id] || []).length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>No documents yet — upload a BOL or POD</div>
                    )}
                    {(loadDocs[load.id] || []).map(doc => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span><Ic icon={DOC_ICONS[doc.type] || FileText} size={18} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{doc.size} · {doc.uploadedAt}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: (DOC_COLORS[doc.type] || 'var(--muted)') + '15', color: DOC_COLORS[doc.type] || 'var(--muted)', border: '1px solid ' + (DOC_COLORS[doc.type] || 'var(--muted)') + '30', whiteSpace: 'nowrap' }}>{doc.type}</span>
                        {doc.signed && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--success, #22c55e)' + '20', color: 'var(--success, #22c55e)', border: '1px solid var(--success, #22c55e)' + '40', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}><Ic icon={CheckCircle} size={11} /> Signed</span>}
                        {doc.type === 'Rate Con' && !doc.signed && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--accent)' }} onClick={() => signDoc(load.id, doc.id)}>Sign</button>}
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => viewDoc(doc)}>View</button>
                        <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: '0 4px' }} onClick={() => removeDoc(load.id, doc.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* E-Signature Modal */}
      {signatureModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }} onClick={() => setSignatureModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, width: 460, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Sign Document</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }} onClick={() => setSignatureModal(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Draw your signature below using mouse or touch</div>
            <canvas
              ref={initSigCanvas}
              width={410}
              height={180}
              style={{ width: '100%', height: 180, borderRadius: 10, border: '1px solid var(--border)', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={onSigDown}
              onMouseMove={onSigMove}
              onMouseUp={onSigUp}
              onMouseLeave={onSigUp}
              onTouchStart={onSigDown}
              onTouchMove={onSigMove}
              onTouchEnd={onSigUp}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '8px 18px' }} onClick={clearSigCanvas}>Clear</button>
              <button className="btn" style={{ fontSize: 12, padding: '8px 22px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }} onClick={saveSignature}>Save Signature</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DispatchTab() {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <BookedLoads />
    </div>
  )
}
