import { useState, useRef, useEffect, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, Truck, ChevronRight, ChevronDown, ScanLine, Camera, Plus,
  MapPin, Clock, DollarSign, CheckCircle, ArrowRight, Filter, X, FileText, Upload,
  Zap, Send, AlertCircle
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor } from './shared'
import { apiFetch } from '../../lib/api'
import { uploadFile } from '../../lib/storage'
import * as db from '../../lib/database'

// ── Detention Timer ───────────────────────────────────────────────────────
function DetentionTimer({ loadId, locationType }) {
  const [running, setRunning] = useState(() => !!localStorage.getItem(`detention_${loadId}`))
  const [elapsed, setElapsed] = useState(0)

  // Auto-start on mount
  useEffect(() => {
    if (!localStorage.getItem(`detention_${loadId}`)) {
      localStorage.setItem(`detention_${loadId}`, String(Date.now()))
      setRunning(true)
    }
  }, [loadId])

  // Tick every second
  useEffect(() => {
    const saved = localStorage.getItem(`detention_${loadId}`)
    if (!saved) return
    const start = parseInt(saved)
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [running, loadId])

  const hours = Math.floor(elapsed / 3600)
  const mins = Math.floor((elapsed % 3600) / 60)
  const secs = elapsed % 60
  const FREE_HOURS = 2
  const RATE = 75
  const totalHours = elapsed / 3600
  const billable = Math.max(0, totalHours - FREE_HOURS)
  const charge = Math.round(billable * RATE)

  const stopDetention = () => {
    // Persist detention to database before clearing localStorage
    const saved = localStorage.getItem(`detention_${loadId}`)
    if (saved && elapsed > 0) {
      const startTime = new Date(parseInt(saved)).toISOString()
      const endTime = new Date().toISOString()
      db.updateLoad(loadId, {
        [`detention_${locationType === 'shipper' ? 'pickup' : 'delivery'}_start`]: startTime,
        [`detention_${locationType === 'shipper' ? 'pickup' : 'delivery'}_end`]: endTime,
        [`detention_${locationType === 'shipper' ? 'pickup' : 'delivery'}_charge`]: charge,
      }).catch(() => {})
    }
    localStorage.removeItem(`detention_${loadId}`)
    setRunning(false)
  }

  return (
    <div style={{ margin: '0 14px 10px', padding: '12px 14px', borderRadius: 10, background: billable > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(240,165,0,0.06)', border: `1px solid ${billable > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(240,165,0,0.2)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={14} color={billable > 0 ? 'var(--danger)' : 'var(--accent)'} />
          <span style={{ fontSize: 11, fontWeight: 800, color: billable > 0 ? 'var(--danger)' : 'var(--accent)', letterSpacing: 0.5 }}>
            DETENTION — {locationType === 'shipper' ? 'SHIPPER' : 'RECEIVER'}
          </span>
        </div>
        {running && (
          <button onClick={stopDetention} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
            Stop
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: billable > 0 ? 'var(--danger)' : 'var(--text)', letterSpacing: 1 }}>
          {String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
        {billable > 0 && (
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--danger)' }}>
            ${charge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
        {billable > 0 ? `${FREE_HOURS}hr free time exceeded · $${RATE}/hr · ${billable.toFixed(1)}hr billable` : `${FREE_HOURS}hr free time · $${RATE}/hr after`}
      </div>
    </div>
  )
}

const STATUS_FILTERS = ['All', 'Booked', 'Dispatched', 'In Transit', 'Delivered', 'Invoiced', 'Paid']
const STATUS_FLOW = ['Rate Con Received', 'Booked', 'Dispatched', 'En Route to Pickup', 'At Pickup', 'Loaded', 'In Transit', 'At Delivery', 'Delivered', 'Invoiced', 'Paid']

export default function MobileLoadsTab() {
  const ctx = useCarrier() || {}
  const { showToast, user, isDriver } = useApp()
  const loads = ctx.loads || []
  const invoices = ctx.invoices || []
  const updateLoadStatus = ctx.updateLoadStatus || (() => {})
  const addLoad = ctx.addLoad || (() => {})
  const addInvoice = ctx.addInvoice || (() => {})
  const updateInvoiceStatus = ctx.updateInvoiceStatus || (() => {})
  const advanceStop = ctx.advanceStop || (() => {})
  const [filter, setFilter] = useState('All')
  const [expandedId, setExpandedId] = useState(null)
  const [scanning, setScanning] = useState(false)
  const rateConRef = useRef(null)
  const [showAddLoad, setShowAddLoad] = useState(false)
  const [newLoad, setNewLoad] = useState({ origin: '', destination: '', miles: '', rate: '', broker: '', equipment: 'Dry Van', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', shipper: '', consignee: '' })
  const [uploadingDoc, setUploadingDoc] = useState(null) // { loadId, docType }
  const docInputRef = useRef(null)
  const [loadDocs, setLoadDocs] = useState({}) // { loadId: [docs] }

  // Delivered loads needing action (no invoice yet)
  const deliveredNeedAction = loads.filter(l => {
    const s = (l.status || '').toLowerCase()
    return s === 'delivered' || s === 'at delivery'
  })

  // Check if load has invoice
  const loadHasInvoice = (load) => {
    const lid = load.id || load.load_id || load.loadId
    return invoices.some(inv => (inv.load_id || inv.loadId || inv.load_number) === lid)
  }

  // Generate invoice for a delivered load
  const generateInvoiceForLoad = async (load) => {
    const lid = load.id || load.load_id || load.loadId
    if (loadHasInvoice(load)) {
      showToast?.('info', 'Already Invoiced', 'Invoice exists for this load')
      return
    }
    try {
      await addInvoice({
        load_id: lid,
        load_number: load.load_id || load.loadId || lid,
        amount: load.gross || load.rate || 0,
        broker: load.broker_name || load.broker || '',
        broker_email: load.broker_email || '',
        route: `${load.origin || ''} → ${load.destination || load.dest || ''}`,
        status: 'Pending',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      })
      updateLoadStatus(lid, 'Invoiced')
      haptic('success')
      showToast?.('success', 'Invoice Created', `${fmt$(load.gross || load.rate)} — ready to send or factor`)
    } catch (err) {
      showToast?.('error', 'Error', err.message || 'Could not create invoice')
    }
  }

  // Quick factor — sends to factoring company
  const quickFactor = async (load) => {
    const lid = load.id || load.load_id || load.loadId
    const inv = invoices.find(i => (i.load_id || i.loadId || i.load_number) === lid)
    if (!inv) {
      showToast?.('error', 'No Invoice', 'Create an invoice first')
      return
    }
    const factoringRate = ctx.company?.factoring_rate || 2.5
    const fee = Math.round(inv.amount * factoringRate / 100)
    const net = inv.amount - fee
    const factoringEmail = ctx.company?.factoring_email || ''
    if (factoringEmail) {
      try {
        await apiFetch('/api/send-invoice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: factoringEmail, invoiceNumber: `${inv.invoice_number || inv.id} — FACTORING`,
            loadNumber: inv.load_number || '', route: inv.route || '',
            amount: inv.amount || 0, dueDate: 'Same-day / 24hr deposit',
            brokerName: inv.broker || '', carrierName: ctx.company?.company_name || 'Carrier',
          }),
        })
      } catch {}
    }
    updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Factored')
    haptic('success')
    showToast?.('success', 'Factored!', `$${net.toLocaleString()} net — 24hr deposit`)
  }

  const filtered = filter === 'All'
    ? loads
    : loads.filter(l => {
        const s = (l.status || '').toLowerCase()
        const f = filter.toLowerCase()
        return s.includes(f) || (f === 'in transit' && (s.includes('loaded') || s.includes('en route')))
      })

  // Advance load to next status
  const advanceStatus = (load) => {
    const currentIdx = STATUS_FLOW.findIndex(s => s.toLowerCase() === (load.status || '').toLowerCase())
    if (currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1) {
      const next = STATUS_FLOW[currentIdx + 1]
      haptic('success')
      updateLoadStatus(load.loadId || load.load_id || load.load_number || load.id, next)
      showToast?.('success', 'Status Updated', `→ ${next}`)
    }
  }

  // Handle rate con photo
  const handleRateConPhoto = async (file) => {
    if (!file) return
    setScanning(true)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await apiFetch('/api/parse-ratecon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64, mediaType: file.type || 'image/jpeg' }),
      })
      const parsed = await res.json()
      if (parsed.error) {
        showToast?.('error', 'Parse Failed', parsed.error)
        return
      }
      await addLoad({
        origin: parsed.origin || '',
        destination: parsed.destination || '',
        miles: parsed.miles || 0,
        rate: parsed.rate || 0,
        rate_per_mile: parsed.miles && parsed.rate ? (parsed.rate / parsed.miles).toFixed(2) : 0,
        equipment: parsed.equipment || 'Dry Van',
        broker_name: parsed.broker || '',
        weight: parsed.weight || '',
        commodity: parsed.commodity || '',
        pickup_date: parsed.pickup_date || '',
        delivery_date: parsed.delivery_date || '',
        reference_number: parsed.reference_number || parsed.load_number || '',
        status: 'Booked',
        load_type: parsed.load_type || 'FTL',
        shipper_name: parsed.shipper_name || '',
        consignee_name: parsed.consignee_name || '',
        notes: parsed.special_instructions || parsed.notes || '',
      })
      haptic('success')
      showToast?.('success', 'Load Booked!', `${parsed.origin} → ${parsed.destination} — ${fmt$(parsed.rate)}`)
    } catch (err) {
      showToast?.('error', 'Error', err.message || 'Could not process rate con')
    } finally {
      setScanning(false)
    }
  }

  const saveNewLoad = async () => {
    if (!newLoad.origin || !newLoad.destination) { showToast?.('error', 'Error', 'Origin and destination required'); return }
    const miles = parseInt(newLoad.miles) || 0
    const rate = parseFloat(newLoad.rate) || 0
    await addLoad({
      origin: newLoad.origin,
      destination: newLoad.destination,
      miles,
      rate,
      rate_per_mile: miles > 0 ? (rate / miles).toFixed(2) : 0,
      equipment: newLoad.equipment,
      broker_name: newLoad.broker,
      weight: newLoad.weight,
      commodity: newLoad.commodity,
      pickup_date: newLoad.pickup,
      delivery_date: newLoad.delivery,
      reference_number: newLoad.refNum,
      shipper_name: newLoad.shipper,
      consignee_name: newLoad.consignee,
      status: 'Booked',
      load_type: 'FTL',
    })
    haptic('success')
    showToast?.('success', 'Load Added', `${newLoad.origin} → ${newLoad.destination}`)
    setNewLoad({ origin: '', destination: '', miles: '', rate: '', broker: '', equipment: 'Dry Van', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', shipper: '', consignee: '' })
    setShowAddLoad(false)
  }

  const handleDocUpload = async (file, loadId, docType) => {
    if (!file) return
    setUploadingDoc({ loadId, docType })
    try {
      const result = await uploadFile(file, `loads/${loadId}`)
      await db.createDocument({
        load_id: loadId,
        doc_type: docType,
        file_name: file.name,
        file_url: result.url,
        file_path: result.path,
        file_size: file.size,
      })
      // Update local doc state
      setLoadDocs(prev => ({
        ...prev,
        [loadId]: [...(prev[loadId] || []), { doc_type: docType, file_url: result.url, file_name: file.name }],
      }))
      haptic('success')
      showToast?.('success', 'Uploaded', `${docType} uploaded`)
    } catch (err) {
      showToast?.('error', 'Upload Failed', err.message || 'Could not upload document')
    }
    setUploadingDoc(null)
  }

  // Fetch docs for expanded load
  const fetchLoadDocs = async (loadId) => {
    if (loadDocs[loadId]) return
    try {
      const docs = await db.fetchDocuments(loadId)
      setLoadDocs(prev => ({ ...prev, [loadId]: docs }))
    } catch {}
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{isDriver ? 'MY LOADS' : 'LOADS'}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{loads.length} total · {loads.filter(l => !['Delivered', 'Invoiced', 'Paid', 'Cancelled'].includes(l.status)).length} active</div>
        </div>
        {!isDriver && (
          <>
            <button onClick={() => { haptic(); setShowAddLoad(v => !v) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              <Ic icon={Plus} size={14} color="var(--accent)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Add Load</span>
            </button>
            <button onClick={() => rateConRef.current?.click()}
              disabled={scanning}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: scanning ? 'var(--surface2)' : 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              <Ic icon={scanning ? Clock : ScanLine} size={14} color="#000" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>{scanning ? 'Scanning...' : 'Snap Rate Con'}</span>
            </button>
          </>
        )}
        <input ref={rateConRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleRateConPhoto(f); e.target.value = '' }} />
      </div>

      {/* Status filter chips */}
      <div style={{ flexShrink: 0, padding: '0 16px 8px', display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {(isDriver ? STATUS_FILTERS.filter(s => s !== 'Invoiced' && s !== 'Paid') : STATUS_FILTERS).map(s => {
          const isActive = filter === s
          const count = s === 'All' ? loads.length : loads.filter(l => {
            const st = (l.status || '').toLowerCase()
            return st.includes(s.toLowerCase()) || (s === 'In Transit' && (st.includes('loaded') || st.includes('en route')))
          }).length
          return (
            <button key={s} onClick={() => { haptic(); setFilter(s) }}
              style={{ padding: '6px 12px', borderRadius: 20, background: isActive ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, color: isActive ? '#000' : 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif", flexShrink: 0, transition: 'all 0.15s ease' }}>
              {s} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {/* ── GET PAID Banner — Delivered loads needing action (owners only) ── */}
      {!isDriver && deliveredNeedAction.length > 0 && !showAddLoad && (
        <div style={{
          margin: '0 16px 8px', padding: '12px 14px',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(240,165,0,0.08))',
          border: '1px solid rgba(139,92,246,0.25)', borderRadius: 14,
          animation: 'fadeInUp 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={DollarSign} size={12} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#8b5cf6' }}>GET PAID</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {deliveredNeedAction.length} load{deliveredNeedAction.length > 1 ? 's' : ''} delivered — upload docs & invoice
              </div>
            </div>
          </div>
          {deliveredNeedAction.slice(0, 3).map(load => {
            const lid = load.id || load.load_id
            const hasInv = loadHasInvoice(load)
            const docs = loadDocs[load.id] || []
            const hasBOL = docs.some(d => d.doc_type === 'BOL' || d.doc_type === 'Signed BOL') || load.bol_url || load.signed_bol_url
            const hasPOD = docs.some(d => d.doc_type === 'POD') || load.pod_url
            return (
              <div key={lid} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                borderTop: '1px solid rgba(139,92,246,0.12)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {load.origin} → {load.destination || load.dest}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmt$(load.gross || load.rate)}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {!hasBOL && (
                    <button onClick={() => { setExpandedId(lid); if (load.id) fetchLoadDocs(load.id) }}
                      style={{ padding: '4px 8px', fontSize: 9, fontWeight: 700, background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                      BOL
                    </button>
                  )}
                  {!hasPOD && (
                    <button onClick={() => { setExpandedId(lid); if (load.id) fetchLoadDocs(load.id) }}
                      style={{ padding: '4px 8px', fontSize: 9, fontWeight: 700, background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                      POD
                    </button>
                  )}
                  {!hasInv ? (
                    <button onClick={() => generateInvoiceForLoad(load)}
                      style={{ padding: '4px 8px', fontSize: 9, fontWeight: 700, background: '#8b5cf6', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                      Invoice
                    </button>
                  ) : (
                    <button onClick={() => quickFactor(load)}
                      style={{ padding: '4px 8px', fontSize: 9, fontWeight: 700, background: 'var(--success)', border: 'none', borderRadius: 6, color: '#000', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                      Factor
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAddLoad && (
        <div style={{ margin: '0 16px 10px', background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 14, padding: '14px', animation: 'fadeInUp 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>New Load</span>
            <button onClick={() => setShowAddLoad(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <Ic icon={X} size={16} color="var(--muted)" />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input placeholder="Origin (e.g. Dallas, TX)" value={newLoad.origin} onChange={e => setNewLoad(x => ({ ...x, origin: e.target.value }))}
              style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input placeholder="Destination (e.g. Atlanta, GA)" value={newLoad.destination} onChange={e => setNewLoad(x => ({ ...x, destination: e.target.value }))}
              style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input type="number" placeholder="Miles" value={newLoad.miles} onChange={e => setNewLoad(x => ({ ...x, miles: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input type="number" placeholder="Rate ($)" value={newLoad.rate} onChange={e => setNewLoad(x => ({ ...x, rate: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input placeholder="Broker" value={newLoad.broker} onChange={e => setNewLoad(x => ({ ...x, broker: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <select value={newLoad.equipment} onChange={e => setNewLoad(x => ({ ...x, equipment: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
              {['Dry Van', 'Reefer', 'Flatbed', 'Stepdeck', 'Power Only'].map(eq => <option key={eq} value={eq}>{eq}</option>)}
            </select>
            <input type="date" placeholder="Pickup" value={newLoad.pickup} onChange={e => setNewLoad(x => ({ ...x, pickup: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input type="date" placeholder="Delivery" value={newLoad.delivery} onChange={e => setNewLoad(x => ({ ...x, delivery: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input placeholder="Weight (lbs)" value={newLoad.weight} onChange={e => setNewLoad(x => ({ ...x, weight: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input placeholder="Ref #" value={newLoad.refNum} onChange={e => setNewLoad(x => ({ ...x, refNum: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input placeholder="Commodity" value={newLoad.commodity} onChange={e => setNewLoad(x => ({ ...x, commodity: e.target.value }))}
              style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input placeholder="Shipper name" value={newLoad.shipper} onChange={e => setNewLoad(x => ({ ...x, shipper: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
            <input placeholder="Consignee name" value={newLoad.consignee} onChange={e => setNewLoad(x => ({ ...x, consignee: e.target.value }))}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
          </div>
          <button onClick={saveNewLoad}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif" }}>
            Book Load
          </button>
        </div>
      )}

      {/* Load cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', WebkitOverflowScrolling: 'touch' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, color: 'var(--accent)', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{isDriver ? 'No loads assigned yet' : 'No loads yet'}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>{isDriver ? 'Your dispatcher will assign loads here. Ask Q if you have questions.' : 'Snap a rate con or let Q find your next load.'}</div>
          </div>
        )}

        {filtered.map((load, index) => {
          const isExpanded = expandedId === (load.id || load.load_id)
          const currentIdx = STATUS_FLOW.findIndex(s => s.toLowerCase() === (load.status || '').toLowerCase())
          const canAdvance = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1
          const nextStatus = canAdvance ? STATUS_FLOW[currentIdx + 1] : null

          return (
            <div key={load.id || load.load_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 8, overflow: 'hidden', animation: `fadeInUp 0.25s ease ${index * 0.04}s both`, transition: 'transform 0.15s ease' }}>
              {/* Card header */}
              <div onClick={() => { haptic(); const newId = isExpanded ? null : (load.id || load.load_id); setExpandedId(newId); if (newId && load.id) fetchLoadDocs(load.id) }}
                style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(load.status), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{load.load_id || load.loadId || '—'}</span>
                    <span style={{ fontSize: 10, color: statusColor(load.status), fontWeight: 700, background: `${statusColor(load.status)}15`, padding: '1px 6px', borderRadius: 4 }}>{load.status}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                    {load.origin || '?'} → {load.destination || load.dest || '?'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt$(load.gross || load.rate)}</span>
                    {load.miles > 0 && <span>${((load.gross || load.rate || 0) / load.miles).toFixed(2)}/mi</span>}
                    {load.miles > 0 && <span>{load.miles} mi</span>}
                  </div>
                </div>
                <ChevronRight size={14} color="var(--muted)" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }} />
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', animation: 'slideUp 0.2s ease' }}>
                  {/* Status progress bar */}
                  <div style={{ padding: '10px 14px', overflowX: 'auto' }}>
                    <div style={{ display: 'flex', gap: 2, minWidth: 'max-content' }}>
                      {STATUS_FLOW.map((s, i) => {
                        const isCurrent = i === currentIdx
                        const isPast = i < currentIdx
                        return (
                          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <div style={{
                              width: isCurrent ? 10 : 8, height: isCurrent ? 10 : 8, borderRadius: '50%',
                              background: isPast ? 'var(--success)' : isCurrent ? 'var(--accent)' : 'var(--border)',
                              border: isCurrent ? '2px solid var(--accent)' : 'none',
                              transition: '0.2s'
                            }} />
                            {i < STATUS_FLOW.length - 1 && <div style={{ width: 12, height: 2, background: isPast ? 'var(--success)' : 'var(--border)' }} />}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
                      Step {currentIdx + 1} of {STATUS_FLOW.length}: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{load.status}</span>
                    </div>
                  </div>

                  {/* Details */}
                  <div style={{ padding: '0 14px 10px' }}>
                    {[
                      ['Broker', load.broker_name || load.broker || '—'],
                      ['Driver', load.driver_name || load.driver || '—'],
                      ...(load.co_driver_name ? [['Co-Driver', load.co_driver_name]] : []),
                      ['Equipment', load.equipment || load.equipment_type || '—'],
                      ['Weight', load.weight ? `${load.weight} lbs` : '—'],
                      ['Pickup', load.pickup_date || '—'],
                      ['Delivery', load.delivery_date || '—'],
                      ['Ref #', load.reference_number || load.refNum || '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                        <span style={{ color: 'var(--muted)' }}>{k}</span>
                        <span style={{ fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── STOPS TIMELINE ── */}
                  {(() => {
                    const stops = load.stops || load.load_stops
                    if (!stops?.length) return null
                    const currentStopIdx = stops.findIndex(s => s.status === 'current')
                    const hasNextStop = currentStopIdx >= 0 && currentStopIdx < stops.length - 1
                    return (
                      <div style={{ padding: '0 14px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Stops ({stops.length})</span>
                          {hasNextStop && (
                            <button onClick={(e) => {
                              e.stopPropagation()
                              advanceStop(load.loadId || load.load_number || load.id)
                              haptic?.()
                              showToast?.('', 'Stop Advanced', `→ ${stops[currentStopIdx + 1]?.city || 'Next stop'}`)
                            }} style={{
                              padding: '5px 12px', background: 'var(--accent)', border: 'none', borderRadius: 8,
                              fontSize: 10, fontWeight: 700, color: '#000', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif"
                            }}>
                              Next Stop →
                            </button>
                          )}
                        </div>
                        {stops.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((stop, si) => {
                          const isDone = stop.status === 'complete'
                          const isNow = stop.status === 'current'
                          const dotColor = isDone ? 'var(--success)' : isNow ? 'var(--accent)' : 'var(--surface2)'
                          const borderColor = isDone ? 'var(--success)' : isNow ? 'var(--accent)' : 'var(--border)'
                          return (
                            <div key={stop.id || si} style={{ display: 'flex', gap: 8, position: 'relative', paddingBottom: si < stops.length - 1 ? 12 : 0 }}>
                              {si < stops.length - 1 && (
                                <div style={{ position: 'absolute', left: 6, top: 14, bottom: 0, width: 2, background: isDone ? 'var(--success)' : 'var(--border)' }} />
                              )}
                              <div style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, background: dotColor, border: `2px solid ${borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isDone && <span style={{ fontSize: 7, color: '#fff' }}>✓</span>}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: isDone ? 'var(--success)' : isNow ? 'var(--accent)' : 'var(--muted)' }}>
                                  <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: stop.type === 'pickup' ? 'rgba(0,212,170,0.1)' : 'rgba(240,165,0,0.1)', color: stop.type === 'pickup' ? 'var(--success)' : 'var(--accent)', marginRight: 4 }}>
                                    {(stop.type || 'stop').toUpperCase()}
                                  </span>
                                  {stop.city}{stop.state ? `, ${stop.state}` : ''}
                                </div>
                                {stop.contact_name && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 1 }}>{stop.contact_name}{stop.contact_phone ? ` · ${stop.contact_phone}` : ''}</div>}
                                {stop.actual_arrival && <div style={{ fontSize: 9, color: 'var(--success)', marginTop: 1 }}>Arrived {new Date(stop.actual_arrival).toLocaleString()}</div>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* ── GET PAID Workflow — for Delivered/Invoiced loads ── */}
                  {(() => {
                    const st = (load.status || '').toLowerCase()
                    const isDelivered = st === 'delivered' || st === 'at delivery'
                    const isInvoiced = st === 'invoiced'
                    if (!isDelivered && !isInvoiced) return null
                    const lid = load.id || load.load_id || load.loadId
                    const hasInv = loadHasInvoice(load)
                    const docs = loadDocs[load.id] || []
                    const hasBOL = docs.some(d => d.doc_type === 'BOL' || d.doc_type === 'Signed BOL') || load.bol_url || load.signed_bol_url
                    const hasPOD = docs.some(d => d.doc_type === 'POD') || load.pod_url
                    const inv = invoices.find(i => (i.load_id || i.loadId || i.load_number) === lid)
                    const isFactored = inv && (inv.status || '').toLowerCase() === 'factored'
                    const steps = [
                      { label: 'BOL', done: !!hasBOL },
                      { label: 'POD', done: !!hasPOD },
                      { label: 'Invoice', done: !!hasInv },
                      { label: 'Get Paid', done: !!isFactored || (inv && (inv.status || '').toLowerCase() === 'paid') },
                    ]
                    return (
                      <div style={{
                        margin: '0 14px 10px', padding: '12px',
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(0,212,170,0.06))',
                        border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Ic icon={DollarSign} size={10} color="#fff" />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#8b5cf6', letterSpacing: 1 }}>GET PAID WORKFLOW</span>
                        </div>
                        {/* Progress steps */}
                        <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
                          {steps.map((s, i) => (
                            <div key={s.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <div style={{
                                width: '100%', height: 3, borderRadius: 2,
                                background: s.done ? 'var(--success)' : 'var(--border)',
                                transition: 'background 0.3s',
                              }} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                {s.done && <Ic icon={CheckCircle} size={8} color="var(--success)" />}
                                <span style={{ fontSize: 8, fontWeight: 700, color: s.done ? 'var(--success)' : 'var(--muted)' }}>{s.label}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {!hasBOL && (
                            <button onClick={() => {
                              const inp = document.createElement('input')
                              inp.type = 'file'; inp.accept = 'image/*,.pdf'; inp.capture = 'environment'
                              inp.onchange = (e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f, load.id, 'BOL') }
                              inp.click()
                            }} style={{
                              flex: 1, minWidth: 80, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 8,
                              cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif",
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                              <Ic icon={Upload} size={12} color="#000" /> Upload BOL
                            </button>
                          )}
                          {!hasPOD && (
                            <button onClick={() => {
                              const inp = document.createElement('input')
                              inp.type = 'file'; inp.accept = 'image/*,.pdf'; inp.capture = 'environment'
                              inp.onchange = (e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f, load.id, 'POD') }
                              inp.click()
                            }} style={{
                              flex: 1, minWidth: 80, padding: '10px', background: 'var(--surface)', border: '1px solid var(--accent)',
                              borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Sans',sans-serif",
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                              <Ic icon={Camera} size={12} color="var(--accent)" /> Upload POD
                            </button>
                          )}
                          {!isDriver && !hasInv && (
                            <button onClick={() => generateInvoiceForLoad(load)} style={{
                              flex: 1, minWidth: 100, padding: '10px', background: '#8b5cf6', border: 'none', borderRadius: 8,
                              cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: "'DM Sans',sans-serif",
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                              <Ic icon={FileText} size={12} color="#fff" /> Create Invoice
                            </button>
                          )}
                          {!isDriver && hasInv && !isFactored && (inv?.status || '').toLowerCase() !== 'paid' && (
                            <>
                              <button onClick={() => quickFactor(load)} style={{
                                flex: 1, minWidth: 80, padding: '10px', background: '#8b5cf6', border: 'none', borderRadius: 8,
                                cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: "'DM Sans',sans-serif",
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              }}>
                                <Ic icon={Zap} size={12} color="#fff" /> Factor Now
                              </button>
                              <button onClick={async () => {
                                const email = inv.broker_email || inv.email
                                if (!email) { showToast?.('error', 'No Email', 'No broker email on file'); return }
                                try {
                                  await apiFetch('/api/send-invoice', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ to: email, invoiceNumber: inv.invoice_number || inv.id, loadNumber: inv.load_number || '', route: inv.route || '', amount: inv.amount || 0, dueDate: inv.due_date || 'Net 30', brokerName: inv.broker || '' }),
                                  })
                                  haptic('success')
                                  showToast?.('success', 'Sent!', `Invoice sent to ${email}`)
                                } catch { showToast?.('error', 'Error', 'Could not send') }
                              }} style={{
                                flex: 1, minWidth: 80, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 8,
                                cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif",
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              }}>
                                <Ic icon={Send} size={12} color="#000" /> Send Invoice
                              </button>
                            </>
                          )}
                          {(isFactored || (inv?.status || '').toLowerCase() === 'paid') && (
                            <div style={{ width: '100%', textAlign: 'center', padding: '8px', fontSize: 11, fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Ic icon={CheckCircle} size={14} color="var(--success)" />
                              {isFactored ? 'Factored — 24hr deposit' : 'Payment received'}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Detention Timer */}
                  {(load.status === 'At Delivery' || load.status === 'At Pickup') && (
                    <DetentionTimer loadId={load.id} locationType={load.status === 'At Pickup' ? 'shipper' : 'receiver'} />
                  )}

                  {/* Documents */}
                  <div style={{ padding: '0 14px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 6 }}>DOCUMENTS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['Rate Con', 'BOL', 'Signed BOL', 'POD', 'Lumper Receipt', 'Scale Ticket', 'Detention Receipt', 'Fuel Receipt'].map(docType => {
                        const docKey = docType.toLowerCase().replace(/\s/g, '_')
                        const docs = loadDocs[load.id] || []
                        const hasDoc = docs.find(d => d.doc_type === docType) || load.documents?.[docKey] || load[docKey + '_url']
                        const isUploading = uploadingDoc?.loadId === load.id && uploadingDoc?.docType === docType
                        return (
                          <button key={docType} onClick={() => {
                            if (hasDoc) {
                              const doc = docs.find(d => d.doc_type === docType)
                              if (doc?.file_url) window.open(doc.file_url, '_blank')
                            } else {
                              const inp = document.createElement('input')
                              inp.type = 'file'
                              inp.accept = 'image/*,.pdf'
                              inp.capture = 'environment'
                              inp.onchange = (e) => {
                                const f = e.target.files?.[0]
                                if (f) handleDocUpload(f, load.id, docType)
                              }
                              inp.click()
                            }
                          }} style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
                            background: hasDoc ? 'rgba(0,212,170,0.08)' : 'var(--bg)',
                            border: `1px solid ${hasDoc ? 'rgba(0,212,170,0.2)' : 'var(--border)'}`,
                            borderRadius: 8, fontSize: 10, fontWeight: 600,
                            color: isUploading ? 'var(--accent)' : hasDoc ? 'var(--success)' : 'var(--muted)',
                            cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                          }}>
                            <Ic icon={isUploading ? Clock : hasDoc ? CheckCircle : Upload} size={10} />
                            {isUploading ? 'Uploading...' : docType}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {canAdvance && (
                    <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
                      <button onClick={(e) => { e.stopPropagation(); advanceStatus(load) }}
                        style={{ flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                        <Ic icon={ArrowRight} size={14} color="#000" />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>Move to {nextStatus}</span>
                      </button>
                    </div>
                  )}

                  {/* Navigate + Message buttons */}
                  {(() => {
                    const s = (load.status || '').toLowerCase()
                    const isActive = s !== 'delivered' && s !== 'invoiced' && s !== 'paid' && s !== 'cancelled'
                    if (!isActive) return null
                    // Determine navigation target
                    const navTarget = (s === 'en route to pickup' || s === 'dispatched' || s === 'rate con received' || s === 'assigned to driver')
                      ? (load.origin || '') : (load.destination || load.dest || '')
                    const encodedAddr = encodeURIComponent(navTarget)
                    // Detect iOS vs Android for maps deep link
                    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
                    const mapsUrl = isIOS
                      ? `maps://maps.apple.com/?daddr=${encodedAddr}`
                      : `https://www.google.com/maps/dir/?api=1&destination=${encodedAddr}`

                    return (
                      <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
                        {navTarget && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={() => haptic()}
                            style={{ flex: 1, padding: '10px', background: 'rgba(52,176,104,0.1)', border: '1px solid rgba(52,176,104,0.25)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif", textDecoration: 'none' }}>
                            <Ic icon={MapPin} size={14} color="var(--success)" />
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>Navigate</span>
                          </a>
                        )}
                        <button onClick={(e) => {
                          e.stopPropagation()
                          haptic()
                          const msg = `Load ${load.loadId || load.load_id}: ${load.status} at ${load.origin} → ${load.destination || load.dest}. ETA update needed.`
                          apiFetch('/api/admin-alert', {
                            method: 'POST',
                            body: JSON.stringify({
                              type: 'driver_message',
                              title: `Driver Update — ${load.loadId || load.load_id}`,
                              message: msg,
                              severity: 'info',
                              source: 'driver_mobile',
                            }),
                          }).catch(() => {})
                          showToast?.('', 'Sent', 'Dispatcher notified')
                        }}
                          style={{ flex: 1, padding: '10px', background: 'rgba(77,142,240,0.1)', border: '1px solid rgba(77,142,240,0.25)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                          <Ic icon={Send} size={14} color="#4d8ef0" />
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#4d8ef0' }}>Message Dispatch</span>
                        </button>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}
