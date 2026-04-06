import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { Truck, User, MapPin, Package, Radio, MessageCircle, AlertTriangle, Fuel, BarChart2, Bot, Check, PencilIcon, Wrench, Trash2, Siren, FileText, Paperclip, DollarSign, TrendingUp, TrendingDown, Zap, Save, Route, Shield, Scale, Eye, EyeOff, Container, Snowflake, Layers, Plus, Upload, Printer, Download, Calendar, Clock } from 'lucide-react'
import { uploadFile } from '../../../lib/storage'
import { apiFetch } from '../../../lib/api'
import { createDocument, fetchVehicleDocuments, createVehicleDocument, deleteVehicleDocument } from '../../../lib/database'
// FleetMapGoogle is exported directly from FleetMapGoogle.jsx
// Do NOT re-export it here to avoid circular chunk initialization issues

// ── Export Service History to PDF ──────────────────────────────────────────
async function exportServicePDF(truck, logs, totalCost, period) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = 612, P = 40
  const navy = [26, 54, 93], blk = [17, 24, 39], gry = [107, 114, 128], bdr = [229, 231, 235]

  // Header
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, 792, 'F')
  doc.setFillColor(...navy); doc.rect(0, 0, W, 4, 'F')

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...navy)
  doc.text('VEHICLE MAINTENANCE REPORT', P, 36)
  doc.setFontSize(10); doc.setTextColor(...gry)
  doc.text(`Generated ${new Date().toLocaleDateString()} · Qivori AI TMS`, P, 50)

  doc.setDrawColor(...bdr); doc.line(P, 60, W - P, 60)

  // Vehicle info
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy)
  doc.text('VEHICLE', P, 80)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...blk)
  const vInfo = `Unit #${truck.unit || '—'} · ${truck.year || ''} ${truck.make || ''} ${truck.model || ''} · VIN: ${truck.vin || '—'} · Plate: ${truck.plate || '—'} ${truck.plateState || ''}`
  doc.text(vInfo, P, 94)

  // Summary stats
  const periodLabel = period === 'all' ? 'All Time' : period === '30d' ? 'Last 30 Days' : period === '90d' ? 'Last 90 Days' : period === '6mo' ? 'Last 6 Months' : period === '1yr' ? 'Last Year' : 'Custom Range'
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...navy)
  doc.text('SUMMARY', P, 118)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...blk)
  doc.text(`Period: ${periodLabel} · Total Services: ${logs.length} · Total Cost: $${totalCost.toLocaleString()}`, P, 132)

  doc.setDrawColor(...bdr); doc.line(P, 145, W - P, 145)

  // Table header
  const cols = [P, P + 70, P + 140, P + 240, P + 310, P + 400, P + 470]
  const headers = ['DATE', 'MILEAGE', 'SERVICE TYPE', 'COST', 'SHOP', 'NEXT DUE', 'NOTES']
  let y = 160

  doc.setFillColor(248, 250, 252); doc.rect(P, y - 4, W - P * 2, 18, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...gry)
  headers.forEach((h, i) => doc.text(h, cols[i], y + 8))
  y += 22

  // Table rows
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  for (const log of logs) {
    if (y > 740) {
      doc.addPage()
      y = 40
      doc.setFillColor(248, 250, 252); doc.rect(P, y - 4, W - P * 2, 18, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...gry)
      headers.forEach((h, i) => doc.text(h, cols[i], y + 8))
      y += 22
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    }

    doc.setTextColor(...blk)
    doc.text(String(log.date || '—'), cols[0], y)
    doc.text(String((log.mileage || 0).toLocaleString()), cols[1], y)
    doc.setFont('helvetica', 'bold')
    doc.text(String(log.type || '—'), cols[2], y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(220, 38, 38)
    doc.text('$' + (log.cost || 0).toLocaleString(), cols[3], y)
    doc.setTextColor(...gry)
    doc.text(String(log.shop || '—').slice(0, 18), cols[4], y)
    doc.text(String(log.nextDue || '—').slice(0, 14), cols[5], y)
    doc.text(String(log.notes || '—').slice(0, 16), cols[6], y)

    doc.setDrawColor(240, 240, 240); doc.line(P, y + 6, W - P, y + 6)
    y += 18
  }

  if (logs.length === 0) {
    doc.setTextColor(...gry); doc.setFontSize(11)
    doc.text('No service records found for this period.', W / 2, y + 20, { align: 'center' })
  }

  // Footer on last page
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(...bdr); doc.line(P, 760, W - P, 760)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...gry)
    doc.text(`${truck.unit || 'Vehicle'} Maintenance Report · Page ${i} of ${pageCount} · Qivori AI TMS`, W / 2, 775, { align: 'center' })
  }

  doc.save(`${truck.unit || 'vehicle'}-maintenance-${periodLabel.replace(/\s/g, '-').toLowerCase()}.pdf`)
}

// ── Service History with date filters ─────────────────────────────────────
function ServiceHistory({ truck, truckLogs, showAddService, setShowAddService }) {
  const [dateFilter, setDateFilter] = useState('all') // all, 30d, 90d, 6mo, 1yr, custom
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const filteredLogs = useMemo(() => {
    let logs = [...truckLogs]
    const now = new Date()

    // Date filter
    if (dateFilter !== 'all' && dateFilter !== 'custom') {
      const days = { '30d': 30, '90d': 90, '6mo': 180, '1yr': 365 }[dateFilter] || 0
      if (days > 0) {
        const cutoff = new Date(now.getTime() - days * 86400000)
        logs = logs.filter(l => {
          const d = new Date(l.date || l.created_at)
          return d >= cutoff
        })
      }
    } else if (dateFilter === 'custom' && customFrom) {
      const from = new Date(customFrom)
      const to = customTo ? new Date(customTo) : now
      logs = logs.filter(l => {
        const d = new Date(l.date || l.created_at)
        return d >= from && d <= to
      })
    }

    // Type filter
    if (typeFilter !== 'all') {
      logs = logs.filter(l => l.type === typeFilter)
    }

    return logs
  }, [truckLogs, dateFilter, customFrom, customTo, typeFilter])

  const totalFilteredCost = filteredLogs.reduce((s, l) => s + (parseFloat(l.cost) || 0), 0)
  const serviceTypes = [...new Set(truckLogs.map(l => l.type).filter(Boolean))]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}><Ic icon={Wrench} /> Service History — {truck.unit}</div>
        <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setShowAddService(s => !s)}>
          {showAddService ? 'Cancel' : '+ Log Service'}
        </button>
      </div>

      {/* Date + Type Filters */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Ic icon={Calendar} size={12} color="var(--muted)" />
        {[
          { id: 'all', label: 'All Time' },
          { id: '30d', label: '30 Days' },
          { id: '90d', label: '90 Days' },
          { id: '6mo', label: '6 Months' },
          { id: '1yr', label: '1 Year' },
          { id: 'custom', label: 'Custom' },
        ].map(f => (
          <button key={f.id} onClick={() => setDateFilter(f.id)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
              border: dateFilter === f.id ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: dateFilter === f.id ? 'rgba(240,165,0,0.1)' : 'transparent',
              color: dateFilter === f.id ? 'var(--accent)' : 'var(--muted)',
              fontFamily: "'DM Sans',sans-serif",
            }}>
            {f.label}
          </button>
        ))}

        {dateFilter === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 11 }} />
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 11 }} />
          </>
        )}

        <div style={{ flex: 1 }} />

        {serviceTypes.length > 0 && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 11, fontFamily: "'DM Sans',sans-serif" }}>
            <option value="all">All Types</option>
            {serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
          {filteredLogs.length} records · <span style={{ color: 'var(--danger)', fontWeight: 700 }}>${totalFilteredCost.toLocaleString()}</span> total
        </div>

        <button onClick={() => exportServicePDF(truck, filteredLogs, totalFilteredCost, dateFilter)}
          style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--accent)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'DM Sans',sans-serif" }}>
          <Ic icon={Printer} size={11} /> Export PDF
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
            {['Date', 'Mileage', 'Service Type', 'Cost', 'Shop', 'Next Due', 'Notes'].map(h => (
              <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filteredLogs.map((log, i) => (
              <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{log.date}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, fontFamily: 'monospace' }}>{(log.mileage || 0).toLocaleString()}</td>
                <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>{log.type}</td>
                <td style={{ padding: '11px 14px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--danger)' }}>${(log.cost || 0).toLocaleString()}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{log.shop}</td>
                <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--accent2)', fontWeight: 600 }}>{log.nextDue}</td>
                <td style={{ padding: '11px 14px', fontSize: 11, color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.notes}</td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                {truckLogs.length === 0 ? 'No service records yet — log the first service above' : 'No records match this date range'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── FLEET MAP CONSTANTS ──────────────────────────────────────────────────────
const CITIES = {
  'Atlanta, GA':   { x: 62, y: 66 }, 'Chicago, IL':   { x: 57, y: 42 },
  'Dallas, TX':    { x: 46, y: 72 }, 'Miami, FL':     { x: 68, y: 82 },
  'Denver, CO':    { x: 32, y: 50 }, 'Houston, TX':   { x: 47, y: 78 },
  'Memphis, TN':   { x: 57, y: 64 }, 'New York, NY':  { x: 77, y: 38 },
  'Phoenix, AZ':   { x: 20, y: 66 }, 'Los Angeles, CA':{ x: 10, y: 62 },
  'Omaha, NE':     { x: 46, y: 46 }, 'Minneapolis, MN':{ x: 50, y: 32 },
}
const STATUS_PROGRESS = { 'Rate Con Received':0.05, 'Assigned to Driver':0.10, 'En Route to Pickup':0.20, 'Loaded':0.45, 'In Transit':0.65, 'Delivered':1, 'Invoiced':1 }
const STATUS_LABEL = { 'Rate Con Received':'Ready', 'Assigned to Driver':'Assigned', 'En Route to Pickup':'En Route', 'Loaded':'Loaded', 'In Transit':'En Route', 'Delivered':'Delivered', 'Invoiced':'Delivered' }

// ─── FLEET MANAGER CONSTANTS ──────────────────────────────────────────────────
const FLEET_TRUCKS = []

const MAINT_LOGS = {}

const SERVICE_TYPES = ['Oil Change','Tire Rotation','Tire Replacement','Brake Service','DOT Inspection','Coolant Flush','DPF Cleaning','Transmission Service','AC Service','Other']
const WEEKS = ['W1','W2','W3','W4','W5','W6']

function expiryColor(dateStr) {
  const months = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24 * 30)
  return months < 2 ? 'var(--danger)' : months < 5 ? 'var(--warning)' : 'var(--success)'
}
function expiryLabel(dateStr) {
  const months = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24 * 30)
  if (months < 0)  return 'EXPIRED'
  if (months < 2)  return '< 2 months'
  if (months < 5)  return '< 5 months'
  return 'OK'
}

const BLANK_TRUCK = { vin:'', year:'', make:'', model:'', color:'', plate:'', gvw:'', fuel:'Diesel', odometer:'', driver:'', regExpiry:'', insExpiry:'', dotInspection:'', unit_cost:'' }

// ─── VEHICLE DOCUMENT TYPES ────────────────────────────────────────────
const VEH_DOC_TYPES = [
  { id: 'registration',         label: 'Registration',             required: true,  hasExpiry: true },
  { id: 'insurance_certificate', label: 'Insurance Certificate',   required: true,  hasExpiry: true },
  { id: 'dot_inspection',       label: 'DOT Inspection',           required: true,  hasExpiry: true },
  { id: 'ifta_permit',          label: 'IFTA Permit / Decal',      required: false, hasExpiry: true },
  { id: 'irp_cab_card',         label: 'IRP Cab Card',             required: false, hasExpiry: true },
  { id: 'title',                label: 'Title',                    required: false, hasExpiry: false },
  { id: 'lease_agreement',      label: 'Lease Agreement',          required: false, hasExpiry: true },
  { id: 'fuel_permit',          label: 'Fuel Permit',              required: false, hasExpiry: true },
  { id: 'oversize_permit',      label: 'Oversize/Overweight Permit', required: false, hasExpiry: true },
  { id: 'hazmat_permit',        label: 'Hazmat Permit',            required: false, hasExpiry: true },
  { id: 'eld_certificate',      label: 'ELD Certificate',          required: false, hasExpiry: false },
  { id: 'apportioned_plate',    label: 'Apportioned Plate',        required: false, hasExpiry: true },
  { id: 'emission_test',        label: 'Emission Test',            required: false, hasExpiry: true },
  { id: 'safety_inspection',    label: 'Safety Inspection',        required: false, hasExpiry: true },
  { id: 'warranty',             label: 'Warranty',                 required: false, hasExpiry: true },
  { id: 'purchase_receipt',     label: 'Purchase Receipt',         required: false, hasExpiry: false },
  { id: 'photos',               label: 'Vehicle Photos',           required: false, hasExpiry: false },
  { id: 'other',                label: 'Other Document',           required: false, hasExpiry: false },
]

const VEH_DOC_STATUS_COLORS = {
  valid:         { bg: 'rgba(34,197,94,0.1)',  color: 'var(--success)', label: 'Valid' },
  expiring_soon: { bg: 'rgba(240,165,0,0.1)',  color: 'var(--accent)',  label: 'Expiring' },
  expired:       { bg: 'rgba(239,68,68,0.1)',  color: 'var(--danger)',  label: 'Expired' },
  pending:       { bg: 'rgba(77,142,240,0.1)', color: 'var(--accent3)', label: 'Pending' },
}

function getVehExpiryStatus(expiryDate) {
  if (!expiryDate) return 'valid'
  const days = Math.floor((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring_soon'
  return 'valid'
}

// ─── FLEET MANAGER DOCUMENTS (reusable inline component) ─────────
function FleetManagerDocs({ vehicleId, vehicleName, showToast }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vehicleId) return
    setLoading(true)
    fetchVehicleDocuments(vehicleId).then(d => { setDocs(d); setLoading(false) }).catch(() => setLoading(false))
  }, [vehicleId])

  const handleUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        showToast('', 'Uploading', file.name + '...')
        const result = await uploadFile(file, 'vehicles/' + vehicleId)
        const doc = await createVehicleDocument({
          vehicle_id: vehicleId,
          doc_type: 'other',
          file_name: file.name,
          file_url: result.url,
          file_size: result.size,
          status: 'valid',
        })
        setDocs(prev => [doc, ...prev])
        showToast('success', 'Uploaded', file.name + ' attached')
      } catch (err) {
        showToast('error', 'Upload Failed', err.message || 'Could not upload file')
      }
    }
    input.click()
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontWeight:700, fontSize:13 }}><Paperclip size={14} style={{ verticalAlign:'middle', marginRight:6 }} />Documents</div>
        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={handleUpload}>+ Upload</button>
      </div>
      <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
        {loading ? (
          <div style={{ padding:12, textAlign:'center', color:'var(--muted)', fontSize:11 }}>Loading...</div>
        ) : docs.length === 0 ? (
          <div style={{ padding:16, textAlign:'center', color:'var(--muted)' }}>
            <div style={{ fontSize:12, fontWeight:600 }}>No documents</div>
            <div style={{ fontSize:10, marginTop:2 }}>Click Upload to add registration, insurance, inspection docs</div>
          </div>
        ) : docs.map(doc => {
          const docType = VEH_DOC_TYPES.find(t => t.id === doc.doc_type)
          const status = VEH_DOC_STATUS_COLORS[getVehExpiryStatus(doc.expiry_date)] || VEH_DOC_STATUS_COLORS.valid
          return (
            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--surface2)', borderRadius:8 }}>
              <FileText size={14} color={status.color} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{docType?.label || doc.doc_type}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{doc.file_name}{doc.expiry_date ? ` · Exp: ${new Date(doc.expiry_date).toLocaleDateString('en-US',{month:'short',year:'numeric'})}` : ''}</div>
              </div>
              {doc.expiry_date && <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:4, background:status.bg, color:status.color }}>{status.label}</span>}
              {doc.file_url ? (
                <button className="btn btn-ghost" style={{ fontSize:11, padding:'4px 8px' }} onClick={() => window.open(doc.file_url, '_blank')}>View</button>
              ) : (
                <span style={{ fontSize:10, color:'var(--muted)' }}>No file</span>
              )}
              <button onClick={async () => {
                try { await deleteVehicleDocument(doc.id); setDocs(prev => prev.filter(d => d.id !== doc.id)); showToast('success','Deleted',doc.file_name) } catch(err) { showToast('error','Error',err.message) }
              }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:2 }}><Trash2 size={11} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── FLEET MAP (legacy SVG — replaced by FleetMapGoogle) ─────────────────────
function FleetMapLegacy() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const drivers = ctx.drivers || []
  const vehicles = ctx.vehicles || []
  const loads = ctx.activeLoads || (ctx.loads || []).filter(l => !['Delivered','Invoiced'].includes(l.status))

  const UNIT_COLORS = ['#f0a500','#00d4aa','#6b7280','#e74c3c','#3498db','#9b59b6','#1abc9c','#e67e22']

  // Build real truck data from context
  const trucksData = drivers.map((d, i) => {
    const driverName = d.name || d.full_name || `Driver ${i+1}`
    const vehicle = vehicles[i]
    const unit = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : `Unit ${String(i+1).padStart(2,'0')}`
    const color = UNIT_COLORS[i % UNIT_COLORS.length]
    const load = loads.find(l => (l.driver_name || l.driver) === driverName)
    const homecity = d.city || d.home_city || 'Unknown'
    if (load) {
      const from = load.origin || homecity
      const to   = load.dest   || homecity
      return { unit, driver: driverName, from, to, progress: STATUS_PROGRESS[load.status] || 0.5, status: STATUS_LABEL[load.status] || load.status, color, load: load.loadId, eta: load.delivery?.split(' · ')[0] || 'TBD' }
    }
    return { unit, driver: driverName, from: homecity, to: homecity, progress: 1, status: 'Available', color, load: '—', eta: 'Ready' }
  })

  const [selectedTruck, setSelectedTruck] = useState(trucksData[0]?.unit || 'Unit 01')

  const truckPos = (t) => {
    const from = CITIES[t.from] || { x:50, y:50 }
    const to   = CITIES[t.to]   || { x:50, y:50 }
    return { x: from.x + (to.x - from.x) * t.progress, y: from.y + (to.y - from.y) * t.progress }
  }

  if (!drivers.length) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background:'#0a0e1a' }}>
        <div style={{ textAlign:'center', padding:'40px 32px' }}>
          <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <Truck size={26} color="var(--accent)" />
          </div>
          <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:8 }}>No drivers added yet</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.6, maxWidth:280 }}>
            Add your first driver to see fleet map.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>
      {/* Map area */}
      <div style={{ flex:1, position:'relative', background:'#0a0e1a', overflow:'hidden' }}>
        {/* Grid lines */}
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.06 }}>
          {[10,20,30,40,50,60,70,80,90].map(x => <line key={x} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" stroke="#6b7280" strokeWidth="1"/>)}
          {[10,20,30,40,50,60,70,80,90].map(y => <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="#6b7280" strokeWidth="1"/>)}
        </svg>
        {/* US outline suggestion */}
        <div style={{ position:'absolute', left:'8%', top:'28%', right:'5%', bottom:'12%', border:'1px solid rgba(255,255,255,0.04)', borderRadius:'4% 8% 6% 12%' }} />

        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
          {/* Route lines */}
          {trucksData.filter(t => t.from !== t.to).map(t => {
            const from = CITIES[t.from], to = CITIES[t.to]
            if (!from || !to) return null
            return (
              <g key={t.unit}>
                <line x1={`${from.x}%`} y1={`${from.y}%`} x2={`${to.x}%`} y2={`${to.y}%`}
                  stroke={t.color} strokeWidth="1.5" strokeDasharray="6,4" opacity="0.3" />
                <line x1={`${from.x}%`} y1={`${from.y}%`}
                  x2={`${from.x + (to.x-from.x)*t.progress}%`} y2={`${from.y + (to.y-from.y)*t.progress}%`}
                  stroke={t.color} strokeWidth="2" opacity="0.8" />
              </g>
            )
          })}
          {/* City dots */}
          {Object.entries(CITIES).map(([name, pos]) => (
            <g key={name}>
              <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r="4" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
              <text x={`${pos.x}%`} y={`${pos.y - 1.5}%`} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="DM Sans,sans-serif">{name.split(',')[0]}</text>
            </g>
          ))}
          {/* Truck icons */}
          {trucksData.map(t => {
            const pos = truckPos(t)
            const isSel = selectedTruck === t.unit
            return (
              <g key={t.unit} style={{ cursor:'pointer' }} onClick={() => setSelectedTruck(t.unit)}>
                <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r={isSel ? 14 : 10} fill={t.color} opacity={isSel ? 1 : 0.7} />
                {isSel && <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r="18" fill="none" stroke={t.color} strokeWidth="1.5" opacity="0.4"/>}
                <text x={`${pos.x}%`} y={`${pos.y}%`} textAnchor="middle" dominantBaseline="middle" fill="#000" fontSize="9" fontWeight="800" fontFamily="DM Sans,sans-serif"><Truck size={20} /></text>
              </g>
            )
          })}
        </svg>

        {/* Legend */}
        <div style={{ position:'absolute', bottom:16, left:16, display:'flex', gap:12 }}>
          {trucksData.map(t => (
            <div key={t.unit} onClick={() => setSelectedTruck(t.unit)}
              style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(0,0,0,0.6)', border:`1px solid ${selectedTruck===t.unit ? t.color : 'rgba(255,255,255,0.1)'}`, borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }} />
              <span style={{ fontSize:11, color:'#fff', fontFamily:'DM Sans,sans-serif' }}>{t.unit}</span>
            </div>
          ))}
        </div>

        {/* Top label */}
        <div style={{ position:'absolute', top:16, left:16, background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 12px' }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontFamily:'DM Sans,sans-serif', letterSpacing:2 }}>● LIVE FLEET — {trucksData.filter(t=>t.load!=='—').length} on load</span>
        </div>

        {/* Empty state overlay when no trucks on load */}
        {trucksData.filter(t=>t.load!=='—').length === 0 && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:5, pointerEvents:'none' }}>
            <div style={{ textAlign:'center', background:'rgba(0,0,0,0.6)', borderRadius:16, padding:'32px 40px', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(8px)' }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Truck size={22} color="var(--accent)" />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:6 }}>All trucks available</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.5, maxWidth:240 }}>
                No active loads dispatched. Book a load from the AI Load Board to see trucks on the map.
              </div>
              <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'center' }}>
                {trucksData.map(t => (
                  <div key={t.unit} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', background:'rgba(255,255,255,0.05)', borderRadius:6 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:t.color }}/>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{t.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <div style={{ width:280, flexShrink:0, background:'var(--surface)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:2 }}>FLEET STATUS</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:8, marginTop:10 }}>
            {[
              { v: String(trucksData.filter(t=>t.status==='En Route'||t.status==='Loaded'||t.status==='Assigned').length), l:'On Load',   c:'var(--success)' },
              { v: String(trucksData.filter(t=>t.status==='Available').length), l:'Available', c:'var(--accent2)' },
              { v: String(trucksData.length), l:'Total', c:'var(--muted)' },
            ].map(s => (
              <div key={s.l} style={{ textAlign:'center', background:'var(--surface2)', borderRadius:8, padding:'8px 4px' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:9, color:'var(--muted)' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {trucksData.map(t => {
          const isSel = selectedTruck === t.unit
          const statusColor = ['En Route','Loaded','Assigned'].includes(t.status) ? 'var(--success)' : t.status==='Available' ? 'var(--accent2)' : 'var(--muted)'
          return (
            <div key={t.unit} onClick={() => setSelectedTruck(t.unit)}
              style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? t.color : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.04)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }} />
                    <span style={{ fontSize:13, fontWeight:700 }}>{t.unit}</span>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:8, background:statusColor+'15', color:statusColor }}>{t.status}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}><Ic icon={User} /> {t.driver}</div>
                {t.from !== t.to && <div style={{ fontSize:11, marginBottom:4 }}><Ic icon={MapPin} /> {t.from.split(',')[0]} <span style={{ color:'var(--accent)' }}>→</span> {t.to.split(',')[0]}</div>}
                {t.from === t.to && <div style={{ fontSize:11, marginBottom:4 }}><Ic icon={MapPin} /> {t.from.split(',')[0]}</div>}
                {t.load !== '—' && (
                  <>
                    <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}><Ic icon={Package} /> {t.load} · ETA {t.eta}</div>
                    <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${t.progress*100}%`, background:t.color, borderRadius:2 }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{Math.round(t.progress*100)}% complete</div>
                  </>
                )}
                {isSel && (
                  <div style={{ display:'flex', gap:6, marginTop:10 }}>
                    <button className="btn btn-ghost" style={{ fontSize:10, flex:1 }} onClick={async e => { e.stopPropagation(); showToast('', t.unit, 'Pinging ELD for location update...'); try { const res = await fetch('/api/eld-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicle: t.unit }) }); if (res.ok) { showToast('success', 'ELD Synced', t.unit + ' location updated') } else { showToast('error', 'ELD Sync Failed', 'Could not reach ELD — check connection') } } catch { showToast('error', 'ELD Sync Failed', 'Network error — try again') } }}><Ic icon={Radio} /> Ping</button>
                    <button className="btn btn-ghost" style={{ fontSize:10, flex:1 }} onClick={e => { e.stopPropagation(); const driverObj = drivers.find(d => (d.name || d.full_name) === t.driver); const phone = driverObj?.phone || driverObj?.phone_number; if (phone) { window.open('sms:' + phone, '_self') } else { showToast('', 'No Phone', 'No phone number on file for ' + t.driver) } }}><Ic icon={MessageCircle} /> Message</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── FLEET MANAGER ────────────────────────────────────────────────────────────
export function FleetManager() {
  const { showToast } = useApp()
  const { vehicles: dbVehicles, addVehicle, editVehicle, removeVehicle } = useCarrier()
  const initialTrucks = dbVehicles.length ? dbVehicles.map((v, i) => ({
    id: v.id, unit: v.unit_number || `Unit ${String(i+1).padStart(2,'0')}`,
    status: v.status === 'Active' ? 'Available' : v.status || 'Available',
    statusColor: v.status === 'Active' ? 'var(--accent2)' : 'var(--muted)',
    year: v.year || '', make: v.make || '', model: v.model || '',
    vin: v.vin || '', plate: v.license_plate || '', color: '',
    gvw: '80,000 lbs', fuel: 'Diesel',
    regExpiry: v.registration_expiry || '', insExpiry: v.insurance_expiry || '',
    dotInspection: '', odometer: v.current_miles || 0,
    driver: '', unit_cost: 0,
    mpg:[7.0,7.0,7.0,7.0,7.0,7.0], miles:[0,0,0,0,0,0],
    revenue:[0,0,0,0,0,0], opCost:[0,0,0,0,0,0],
  })) : FLEET_TRUCKS
  const [trucks, setTrucks] = useState(initialTrucks)
  const [selectedTruck, setSelectedTruck] = useState(initialTrucks[0]?.id || 'unit01')
  const [subTab, setSubTab] = useState('profile')
  const [logs, setLogs] = useState(MAINT_LOGS)
  const [showAddService, setShowAddService] = useState(false)
  const [newService, setNewService] = useState({ date:'', mileage:'', type:'Oil Change', cost:'', shop:'', notes:'', nextDue:'' })

  // Add Truck modal
  const [showAddTruck, setShowAddTruck] = useState(false)
  const [newTruck, setNewTruck] = useState(BLANK_TRUCK)
  const [vinLoading, setVinLoading] = useState(false)
  const [vinResult, setVinResult] = useState(null)
  // Edit Truck modal
  const [showEditTruck, setShowEditTruck] = useState(false)
  const [editTruckData, setEditTruckData] = useState(BLANK_TRUCK)
  // Delete confirmation
  const [confirmDeleteTruck, setConfirmDeleteTruck] = useState(null)

  const openEditTruck = () => {
    if (!truck) return
    setEditTruckData({ vin: truck.vin || '', year: truck.year || '', make: truck.make || '', model: truck.model || '', color: truck.color || '', plate: truck.plate || '', gvw: truck.gvw || '', fuel: truck.fuel || 'Diesel', odometer: String(truck.odometer || ''), driver: truck.driver || '', regExpiry: truck.regExpiry || '', insExpiry: truck.insExpiry || '', dotInspection: truck.dotInspection || '', unit_cost: String(truck.unit_cost || '') })
    setShowEditTruck(true)
  }

  const saveEditTruck = async () => {
    try {
      await editVehicle(selectedTruck, {
        vin: editTruckData.vin, year: parseInt(editTruckData.year) || null,
        make: editTruckData.make, model: editTruckData.model,
        license_plate: editTruckData.plate, current_miles: parseInt(editTruckData.odometer) || 0,
        insurance_expiry: editTruckData.insExpiry || null, registration_expiry: editTruckData.regExpiry || null,
      })
      setTrucks(t => t.map(tr => tr.id === selectedTruck ? { ...tr, ...editTruckData, odometer: parseInt(editTruckData.odometer) || 0 } : tr))
      showToast('success', 'Truck Updated', `${editTruckData.year} ${editTruckData.make} ${editTruckData.model} updated`)
      setShowEditTruck(false)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to update truck')
    }
  }

  const handleDeleteTruck = async (id) => {
    try {
      await removeVehicle(id)
      setTrucks(t => t.filter(tr => tr.id !== id))
      setConfirmDeleteTruck(null)
      if (selectedTruck === id) setSelectedTruck(trucks.find(t => t.id !== id)?.id || null)
      showToast('success', 'Truck Removed', 'Vehicle has been removed')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to remove truck')
    }
  }

  const decodeVIN = async (vin) => {
    if (vin.length !== 17) return
    setVinLoading(true)
    setVinResult(null)
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`)
      const json = await res.json()
      const get = (var_) => json.Results?.find(r => r.Variable === var_)?.Value || ''
      const year  = get('Model Year')
      const make  = get('Make')
      const model = get('Model')
      const gvw   = get('Gross Vehicle Weight Rating From')
      const fuel  = get('Fuel Type - Primary') || 'Diesel'
      const body  = get('Body Class')
      if (!year || year === 'Not Applicable') {
        setVinResult({ error: 'VIN not found — check the number and try again' })
      } else {
        const decoded = { year, make, model, gvw: gvw || '80,000 lbs', fuel: fuel.includes('Diesel') ? 'Diesel' : fuel, body }
        setVinResult(decoded)
        setNewTruck(t => ({ ...t, year, make, model, gvw: decoded.gvw, fuel: decoded.fuel }))
        showToast('', 'VIN Decoded', `${year} ${make} ${model}`)
      }
    } catch {
      setVinResult({ error: 'Could not reach VIN database — check your connection' })
    } finally {
      setVinLoading(false)
    }
  }

  const saveTruck = async () => {
    if (!newTruck.vin || !newTruck.make) return
    const unitNum = 'Unit ' + String(trucks.length + 1).padStart(2, '0')
    const dbPayload = {
      unit_number: unitNum, vin: newTruck.vin, year: parseInt(newTruck.year) || null,
      make: newTruck.make, model: newTruck.model, license_plate: newTruck.plate,
      license_state: '', status: 'Active', current_miles: parseInt(newTruck.odometer) || 0,
      insurance_expiry: newTruck.insExpiry || null, registration_expiry: newTruck.regExpiry || null,
      notes: `${newTruck.color || ''}, ${newTruck.gvw || ''}, ${newTruck.fuel || 'Diesel'}`.trim(),
    }
    const saved = await addVehicle(dbPayload)
    const id = saved?.id || ('local-veh-' + Date.now())
    setTrucks(t => [...t, {
      ...newTruck, id, unit: unitNum, status: 'Available', statusColor: 'var(--accent2)',
      odometer: parseInt(newTruck.odometer) || 0,
      unit_cost: parseFloat(newTruck.unit_cost) || 0,
      mpg:[7.0,7.0,7.0,7.0,7.0,7.0],
      miles:[0,0,0,0,0,0], revenue:[0,0,0,0,0,0], opCost:[0,0,0,0,0,0],
    }])
    setSelectedTruck(id)
    setShowAddTruck(false)
    setNewTruck(BLANK_TRUCK)
    setVinResult(null)
    showToast('', 'Truck Added', `${newTruck.year} ${newTruck.make} ${newTruck.model} — ${unitNum}`)
  }

  const truck = trucks.find(t => t.id === selectedTruck)
  const truckLogs = logs[selectedTruck] || []
  const totalMaintCost = truckLogs.reduce((s, l) => s + l.cost, 0)
  const avgMpg = truck ? (truck.mpg.reduce((s,v) => s+v, 0) / truck.mpg.length).toFixed(1) : '0.0'
  const totalMiles = truck ? truck.miles.reduce((s,v) => s+v, 0) : 0
  const totalRev = truck ? truck.revenue.reduce((s,v) => s+v, 0) : 0
  const totalCost = truck ? truck.opCost.reduce((s,v) => s+v, 0) : 0
  const netProfit = totalRev - totalCost
  const maxRev = truck ? Math.max(...truck.revenue) : 0

  const addService = () => {
    if (!newService.date || !newService.type) return
    const entry = { ...newService, id: Date.now(), cost: parseFloat(newService.cost) || 0, mileage: parseInt(newService.mileage) || truck.odometer }
    setLogs(l => ({ ...l, [selectedTruck]: [entry, ...(l[selectedTruck] || [])] }))
    setNewService({ date:'', mileage:'', type:'Oil Change', cost:'', shop:'', notes:'', nextDue:'' })
    setShowAddService(false)
    showToast('', 'Service Logged', `${entry.type} · Unit ${truck.unit} · $${entry.cost}`)
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* ── Add Truck Modal ── */}
      {showAddTruck && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddTruck(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:'100%', maxWidth:580, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>ADD NEW TRUCK</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Enter the VIN to auto-fill truck details</div>
              </div>
              <button onClick={() => { setShowAddTruck(false); setVinResult(null); setNewTruck(BLANK_TRUCK) }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            {/* VIN input with decode */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:6 }}>VIN Number <span style={{ color:'var(--accent)' }}>— 17 characters, auto-decodes</span></label>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  value={newTruck.vin}
                  onChange={e => {
                    const v = e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17)
                    setNewTruck(t => ({ ...t, vin: v }))
                    setVinResult(null)
                    if (v.length === 17) decodeVIN(v)
                  }}
                  placeholder="1FUJGLDR5MLKJ2841"
                  maxLength={17}
                  style={{ flex:1, background:'var(--surface2)', border:`2px solid ${newTruck.vin.length === 17 ? (vinResult?.error ? 'var(--danger)' : 'var(--success)') : 'var(--border)'}`, borderRadius:8, padding:'10px 14px', color:'var(--text)', fontSize:15, fontFamily:'monospace', letterSpacing:2, outline:'none' }}
                />
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:44, fontSize:20 }}>
                  {vinLoading ? '...' : newTruck.vin.length === 17 && !vinResult?.error ? <Check size={14} /> : ''}
                </div>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{newTruck.vin.length}/17 characters</div>
            </div>

            {/* VIN result banner */}
            {vinResult && !vinResult.error && (
              <div style={{ padding:'12px 14px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:10, marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
                <span style={{ fontSize:22 }}><Truck size={20} /></span>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'var(--success)' }}>{vinResult.year} {vinResult.make} {vinResult.model}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>VIN decoded · {vinResult.body} · {vinResult.fuel} · Fields auto-filled below</div>
                </div>
              </div>
            )}
            {vinResult?.error && (
              <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, marginBottom:16, fontSize:12, color:'var(--danger)' }}>
                <AlertTriangle size={13} /> {vinResult.error}
              </div>
            )}

            {/* Form fields */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { key:'year',         label:'Year',              ph:'2021',         note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'make',         label:'Make',              ph:'Freightliner', note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'model',        label:'Model',             ph:'Cascadia',     note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'color',        label:'Color',             ph:'White' },
                { key:'plate',        label:'License Plate',     ph:'MN-94821' },
                { key:'gvw',          label:'GVW',               ph:'80,000 lbs',   note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'odometer',     label:'Current Odometer',  ph:'125000' },
                { key:'driver',       label:'Assigned Driver',   ph:'Driver name' },
                { key:'regExpiry',    label:'Registration Expiry',ph:'Dec 2026' },
                { key:'insExpiry',    label:'Insurance Expiry',   ph:'Jun 2026' },
                { key:'dotInspection',label:'DOT Inspection',     ph:'Dec 2025' },
                { key:'unit_cost',    label:'Purchase Cost ($)',  ph:'128000' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color: f.note ? 'var(--success)' : 'var(--muted)', display:'block', marginBottom:4 }}>{f.label} {f.note && <span style={{ fontSize:10 }}>{f.note}</span>}</label>
                  <input value={newTruck[f.key]} onChange={e => setNewTruck(t => ({ ...t, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width:'100%', background: f.note ? 'rgba(34,197,94,0.05)' : 'var(--surface2)', border:`1px solid ${f.note ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0', fontSize:14 }} onClick={saveTruck}
                disabled={!newTruck.vin || !newTruck.make}>
                <Truck size={13} /> Add Truck to Fleet
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => { setShowAddTruck(false); setVinResult(null); setNewTruck(BLANK_TRUCK) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Truck Modal ── */}
      {showEditTruck && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target===e.currentTarget) setShowEditTruck(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:440, padding:24 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Edit Truck</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Update vehicle details</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { key:'make', label:'Make', ph:'Freightliner' },
                { key:'model', label:'Model', ph:'Cascadia' },
                { key:'year', label:'Year', ph:'2023' },
                { key:'plate', label:'License Plate', ph:'ABC-1234' },
                { key:'odometer', label:'Odometer', ph:'120000' },
                { key:'regExpiry', label:'Registration Expiry', ph:'', type:'date' },
                { key:'insExpiry', label:'Insurance Expiry', ph:'', type:'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'text'} value={editTruckData[f.key]} onChange={e => setEditTruckData(t => ({ ...t, [f.key]: e.target.value }))} placeholder={f.ph}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={saveEditTruck}>Save Changes</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowEditTruck(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Truck Confirmation ── */}
      {confirmDeleteTruck && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setConfirmDeleteTruck(null) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:360, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:8, color:'var(--danger)' }}>Remove Vehicle?</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>This will permanently remove <b>{confirmDeleteTruck.unit}</b>. This cannot be undone.</div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-danger" style={{ flex:1, padding:'11px 0' }} onClick={() => handleDeleteTruck(confirmDeleteTruck.id)}>Remove</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setConfirmDeleteTruck(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Truck sidebar ── */}
      <div style={{ width:200, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>FLEET ({trucks.length})</div>
        </div>
        {trucks.map(t => {
          const isSel = selectedTruck === t.id
          const hasAlert = t.regExpiry && expiryColor(t.regExpiry) !== 'var(--success)' || t.insExpiry && expiryColor(t.insExpiry) !== 'var(--success)'
          return (
            <div key={t.id} onClick={() => setSelectedTruck(t.id)}
              style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}><Ic icon={Truck} /> {t.unit}</div>
                {hasAlert && <span style={{ fontSize:11 }}><AlertTriangle size={18} /></span>}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{t.year} {t.make}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:t.statusColor }} />
                <span style={{ fontSize:10, color:t.statusColor, fontWeight:700 }}>{t.status}</span>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{t.odometer.toLocaleString()} mi</div>
            </div>
          )
        })}
        <div style={{ padding:12, marginTop:'auto', borderTop:'1px solid var(--border)' }}>
          <button className="btn btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => setShowAddTruck(true)}>+ Add Truck</button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>

        {!truck ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:14 }}>No trucks added yet. Click "+ Add Truck" to get started.</div>
        ) : (<>
        {/* Truck header */}
        <div style={{ flexShrink:0, padding:'14px 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}><Truck size={20} /></div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:2 }}>
              <span style={{ fontSize:16, fontWeight:800 }}>{truck.unit} — {truck.year} {truck.make} {truck.model}</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:truck.statusColor+'15', color:truck.statusColor }}>{truck.status}</span>
            </div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>
              {truck.plate} · VIN {truck.vin.slice(-6)} · {truck.driver} · {truck.odometer.toLocaleString()} mi
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={openEditTruck}><Ic icon={PencilIcon} /> Edit</button>
            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { setSubTab('maintenance'); setShowAddService(true) }}><Ic icon={Wrench} /> Log Service</button>
            <button className="btn btn-danger" style={{ fontSize:11 }} onClick={() => setConfirmDeleteTruck(truck)}><Ic icon={Trash2} /> Remove</button>
          </div>
        </div>

        {/* Sub-nav */}
        <div style={{ flexShrink:0, display:'flex', gap:2, padding:'0 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
          {[
            { id:'profile',     label:'Profile' },
            { id:'maintenance', label:'Maintenance' },
            { id:'analytics',   label:'Analytics' },
          ].map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              style={{ padding:'10px 16px', border:'none', borderBottom: subTab===t.id ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: subTab===t.id ? 'var(--accent)' : 'var(--muted)', fontSize:12, fontWeight: subTab===t.id ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

          {/* ── PROFILE TAB ── */}
          {subTab === 'profile' && (
            <>
              {/* Expiry alerts */}
              {[
                { label:'Registration', expiry: truck.regExpiry },
                { label:'Insurance',    expiry: truck.insExpiry },
                { label:'DOT Inspection', expiry: truck.dotInspection },
              ].filter(item => expiryColor(item.expiry) !== 'var(--success)').map(item => (
                <div key={item.label} style={{ padding:'12px 16px', background: expiryColor(item.expiry)==='var(--danger)' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border:`1px solid ${expiryColor(item.expiry)}30`, borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:18 }}>{expiryColor(item.expiry)==='var(--danger)' ? <Siren size={18} /> : <AlertTriangle size={18} />}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: expiryColor(item.expiry) }}>{item.label} {expiryColor(item.expiry)==='var(--danger)' ? 'EXPIRED' : 'expiring soon'} — {item.expiry}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>Update before dispatching this truck</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { if (item.label === 'Registration') { window.open('https://www.fmcsa.dot.gov/registration', '_blank') } else if (item.label === 'Insurance') { showToast('', 'Insurance Renewal', 'Contact your insurance agent to renew. Policy expires ' + item.expiry) } else if (item.label === 'DOT Inspection') { window.open('https://ai.fmcsa.dot.gov/RegistrationUpdate/UI/', '_blank') } else { window.open('https://www.fmcsa.dot.gov/', '_blank') } }}>Renew Now</button>
                </div>
              ))}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Truck details */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Truck} /> Unit Details</div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:0 }}>
                    {[
                      { label:'Year / Make / Model', value:`${truck.year} ${truck.make} ${truck.model}` },
                      { label:'VIN',                 value: truck.vin, mono: true },
                      { label:'License Plate',       value: truck.plate },
                      { label:'Color',               value: truck.color },
                      { label:'GVW Rating',          value: truck.gvw },
                      { label:'Fuel Type',           value: truck.fuel },
                      { label:'Odometer',            value: truck.odometer.toLocaleString() + ' mi' },
                      { label:'Assigned Driver',     value: truck.driver, color:'var(--accent2)' },
                      { label:'Purchase Cost',       value: '$' + truck.unit_cost.toLocaleString(), color:'var(--accent)' },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color: item.color || 'var(--text)', fontFamily: item.mono ? 'monospace' : 'inherit' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compliance & documents */}
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={FileText} /> Compliance Dates</div>
                    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:0 }}>
                      {[
                        { label:'Registration Expiry', value: truck.regExpiry,       expiry: truck.regExpiry },
                        { label:'Insurance Expiry',    value: truck.insExpiry,       expiry: truck.insExpiry },
                        { label:'DOT Inspection',      value: truck.dotInspection,   expiry: truck.dotInspection },
                      ].map(item => (
                        <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                          <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:12, fontWeight:700 }}>{item.value}</span>
                            <span style={{ fontSize:10, color: expiryColor(item.expiry) }}>{expiryLabel(item.expiry)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <FleetManagerDocs vehicleId={truck.id} vehicleName={truck.unit} showToast={showToast} />
                </div>
              </div>
            </>
          )}

          {/* ── MAINTENANCE TAB ── */}
          {subTab === 'maintenance' && (
            <>
              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                {[
                  { label:'Services Logged',  value: truckLogs.length,                         color:'var(--accent)' },
                  { label:'Total Maint Cost', value:'$' + totalMaintCost.toLocaleString(),      color:'var(--danger)' },
                  { label:'Last Service',     value: truckLogs[0]?.date || '—',                color:'var(--accent2)' },
                  { label:'Next Due',         value: truckLogs[0]?.nextDue || '—',             color: truckLogs[0]?.nextDue?.includes('warning') ? 'var(--warning)' : 'var(--success)' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'13px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Add service form */}
              {showAddService && (
                <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:12, padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)', marginBottom:14 }}><Ic icon={Wrench} /> Log New Service — {truck.unit}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:12 }}>
                    {[
                      { key:'date',    label:'Date',         type:'text',   ph:'Mar 8' },
                      { key:'mileage', label:'Mileage',      type:'number', ph: truck.odometer.toString() },
                      { key:'cost',    label:'Cost ($)',      type:'number', ph:'250' },
                      { key:'shop',    label:'Shop / Location', type:'text', ph:'Speedco Chicago' },
                      { key:'nextDue', label:'Next Due',     type:'text',   ph:'295,000 mi or Jun 2025' },
                      { key:'notes',   label:'Notes',        type:'text',   ph:'What was done...' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                        <input type={f.type} placeholder={f.ph} value={newService[f.key]}
                          onChange={e => setNewService(s => ({ ...s, [f.key]: e.target.value }))}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Service Type</label>
                      <select value={newService.type} onChange={e => setNewService(s => ({ ...s, type:e.target.value }))}
                        style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                        {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={addService}><Ic icon={Check} /> Log Service</button>
                    <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowAddService(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Service history with date filters */}
              <ServiceHistory truck={truck} truckLogs={truckLogs} showAddService={showAddService} setShowAddService={setShowAddService} />
            </>
          )}

          {/* ── ANALYTICS TAB ── */}
          {subTab === 'analytics' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                {[
                  { label:'6-Week Revenue',  value:'$' + totalRev.toLocaleString(),    color:'var(--accent)' },
                  { label:'Operating Cost',  value:'$' + totalCost.toLocaleString(),   color:'var(--danger)' },
                  { label:'Net Profit',      value:'$' + netProfit.toLocaleString(),   color:'var(--success)', large:true },
                  { label:'Avg MPG',         value: avgMpg,                            color: parseFloat(avgMpg) < 6.8 ? 'var(--warning)' : 'var(--success)' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'13px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: s.large ? 28 : 22, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Revenue vs Cost chart */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                    <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={DollarSign} /> Revenue vs Cost — {truck.unit}</div>
                    <div style={{ display:'flex', gap:10 }}>
                      {[{c:'var(--accent)',label:'Revenue'},{c:'var(--danger)',label:'Cost'},{c:'var(--success)',label:'Net'}].map(x=>(
                        <div key={x.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'var(--muted)' }}>
                          <div style={{ width:7,height:7,borderRadius:2,background:x.c }}/>
                          {x.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:16 }}>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:130 }}>
                      {WEEKS.map((w,i) => {
                        const net = truck.revenue[i] - truck.opCost[i]
                        return (
                          <div key={w} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                            <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:110, justifyContent:'center' }}>
                              <div style={{ width:'30%', height:`${(truck.revenue[i]/maxRev)*108}px`, background:'var(--accent)', borderRadius:'3px 3px 0 0', opacity:0.8 }}/>
                              <div style={{ width:'30%', height:`${(truck.opCost[i]/maxRev)*108}px`, background:'var(--danger)', borderRadius:'3px 3px 0 0', opacity:0.8 }}/>
                              <div style={{ width:'30%', height:`${(net/maxRev)*108}px`, background:'var(--success)', borderRadius:'3px 3px 0 0' }}/>
                            </div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{w}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* MPG trend */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Fuel} /> MPG Trend — {truck.unit}</div>
                  <div style={{ padding:16 }}>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:130 }}>
                      {truck.mpg.map((v,i) => {
                        const pct = ((v - 5.5) / 3) * 100
                        const color = v < 6.5 ? 'var(--warning)' : v < 7.0 ? 'var(--accent2)' : 'var(--success)'
                        return (
                          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                            <div style={{ fontSize:10, fontWeight:700, color }}>{v}</div>
                            <div style={{ width:'60%', height:`${pct}px`, background:color, borderRadius:'3px 3px 0 0', maxHeight:90 }}/>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{WEEKS[i]}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop:10, padding:'8px 12px', background:'var(--surface2)', borderRadius:8, fontSize:12, color:'var(--muted)' }}>
                      {parseFloat(avgMpg) < 6.8
                        ? `Avg ${avgMpg} MPG is below fleet target (6.8). Check tire pressure and consider DPF cleaning.`
                        : `Avg ${avgMpg} MPG — performing at or above fleet target.`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Miles per week */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={MapPin} /> Miles per Week — {truck.unit}</div>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--accent2)' }}>{totalMiles.toLocaleString()} total</span>
                </div>
                <div style={{ padding:'16px 20px', display:'flex', alignItems:'flex-end', gap:8, height:90 }}>
                  {truck.miles.map((m,i) => (
                    <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{ fontSize:10, color:'var(--accent2)', fontWeight:700 }}>{m.toLocaleString()}</div>
                      <div style={{ width:'70%', height:`${(m / Math.max(...truck.miles)) * 55}px`, background:'var(--accent2)', borderRadius:'3px 3px 0 0', opacity:0.7 }}/>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{WEEKS[i]}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Utilization breakdown */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
                {[
                  { label:'Revenue per Mile', value:'$' + (totalRev / totalMiles).toFixed(2) + '/mi', icon: DollarSign, color:'var(--accent)', note:'6-week avg across all loads' },
                  { label:'Cost per Mile',    value:'$' + (totalCost / totalMiles).toFixed(2) + '/mi', icon: DollarSign, color:'var(--danger)', note:'Fuel + maintenance + insurance' },
                  { label:'Net per Mile',     value:'$' + ((totalRev - totalCost) / totalMiles).toFixed(2) + '/mi', icon: TrendingUp, color:'var(--success)', note:'What this truck actually earns' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 18px', display:'flex', gap:12, alignItems:'center' }}>
                    <span style={{ fontSize:24 }}>{typeof s.icon === "string" ? s.icon : <s.icon size={24} />}</span>
                    <div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{s.label}</div>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{s.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </>)}
      </div>
    </div>
  )
}
