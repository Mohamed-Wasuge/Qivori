import { useState, useCallback, useEffect } from 'react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { Truck, Container, AlertTriangle, Save, PencilIcon, Trash2, FileText, Shield, Route, Wrench, Layers, Check, Zap, MapPin, Paperclip, Plus, Upload, Printer, Clock, Eye, Bot, Snowflake } from 'lucide-react'
import { uploadFile } from '../../../lib/storage'
import { apiFetch } from '../../../lib/api'
import { fetchVehicleDocuments, createVehicleDocument, deleteVehicleDocument } from '../../../lib/database'

// ─── EQUIPMENT MANAGER CONSTANTS ──────────────────────────────────────────────
const EQ_FIELDS_TRUCK = [
  { key:'unit_number',         label:'Unit #',         ph:'Unit 04',           span:1 },
  { key:'year',                label:'Year',           ph:'2023',              span:1 },
  { key:'make',                label:'Make',           ph:'Kenworth',          span:1 },
  { key:'model',               label:'Model',          ph:'T680',              span:1 },
  { key:'vin',                 label:'VIN',            ph:'1XKYD49X5MJ000000', span:2 },
  { key:'license_plate',       label:'License Plate',  ph:'IL-TRK-5500',       span:1 },
  { key:'license_state',       label:'Plate State',    ph:'IL',                span:1 },
  { key:'current_miles',       label:'Odometer',       ph:'0',                 span:1 },
  { key:'next_service_miles',  label:'Next Service',   ph:'50000',             span:1 },
  { key:'registration_expiry', label:'Reg. Expiry',    ph:'Dec 31, 2026',      span:1 },
  { key:'insurance_expiry',    label:'Ins. Expiry',    ph:'Nov 15, 2026',      span:1 },
  { key:'notes',               label:'Notes',          ph:'Any notes...',      span:2 },
]
const EQ_FIELDS_TRAILER = [
  { key:'unit_number',         label:'Unit #',         ph:'TRL-03',            span:1 },
  { key:'trailer_type',        label:'Trailer Type',   ph:'Dry Van',           span:1, select: ['Dry Van','Reefer','Flatbed','Step Deck','Lowboy','Tanker','Hopper','Conestoga','Curtain Side','Other'] },
  { key:'year',                label:'Year',           ph:'2022',              span:1 },
  { key:'make',                label:'Make',           ph:'Wabash',            span:1 },
  { key:'model',               label:'Model',          ph:'DuraPlate HD',      span:1 },
  { key:'length',              label:'Length (ft)',     ph:'53',                span:1 },
  { key:'vin',                 label:'VIN',            ph:'1JJV532W5LF000000', span:2 },
  { key:'license_plate',       label:'License Plate',  ph:'IL-TRL-0056',       span:1 },
  { key:'license_state',       label:'Plate State',    ph:'IL',                span:1 },
  { key:'axles',               label:'Axles',          ph:'2',                 span:1 },
  { key:'next_service_miles',  label:'Next Service Mi',ph:'50000',             span:1 },
  { key:'registration_expiry', label:'Reg. Expiry',    ph:'Dec 31, 2026',      span:1 },
  { key:'insurance_expiry',    label:'Ins. Expiry',    ph:'Nov 15, 2026',      span:1 },
  { key:'notes',               label:'Notes',          ph:'53ft dry van...',   span:2 },
]

const TRAILER_TYPE_ICONS = {
  'Reefer': Snowflake,
  'Flatbed': Layers,
  'Step Deck': Layers,
  'Lowboy': Layers,
}
const trailerTypeColor = (t) => t === 'Reefer' ? '#38bdf8' : t === 'Flatbed' ? '#a78bfa' : t === 'Tanker' ? '#f472b6' : 'var(--muted)'

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

// ─── EQUIPMENT MANAGER (Trucks & Trailers) ───────────────────────────────────
export function EquipmentManager() {
  const { showToast } = useApp()
  const { vehicles, addVehicle, editVehicle, removeVehicle } = useCarrier()

  // Map Supabase vehicles to equipment display format
  const equipment = (vehicles || []).map(v => ({
    ...v,
    type: (v.type || 'Truck').toLowerCase(),
    unit: v.unit_number || '',
    plate: v.license_plate || '',
    state: v.license_state || '',
    odometer: v.current_miles || '',
    nextService: v.next_service_miles || '',
    regExpiry: v.registration_expiry || '',
    insExpiry: v.insurance_expiry || '',
    trailer_type: v.trailer_type || v.notes?.match(/^(Dry Van|Reefer|Flatbed|Step Deck|Lowboy|Tanker|Hopper|Conestoga|Curtain Side)/)?.[0] || '',
    length: v.length || '',
    axles: v.axles || '',
  }))

  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState('truck')
  const [form, setForm] = useState({})
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  // Vehicle documents state
  const [vehDocs, setVehDocs] = useState([])
  const [vehDocsLoading, setVehDocsLoading] = useState(false)
  const [showDocUpload, setShowDocUpload] = useState(false)
  const [newVehDoc, setNewVehDoc] = useState({ doc_type: 'registration', file_name: '', expiry_date: '', issued_date: '', notes: '', file: null })
  const [docSaving, setDocSaving] = useState(false)
  const [docValidation, setDocValidation] = useState(null) // { status: 'checking'|'match'|'mismatch'|'warning'|'error', message, detected, aiData }

  // AI document validation — runs after file is selected
  const validateDocument = useCallback(async (file, selectedDocType) => {
    if (!file || file.size > 5 * 1024 * 1024) return // skip files > 5MB
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)
    const isPdf = /\.pdf$/i.test(file.name)
    if (!isImage && !isPdf) return // skip doc/docx — can't parse those

    setDocValidation({ status: 'checking', message: 'AI is verifying this document...' })
    try {
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const mediaType = isPdf ? 'application/pdf' : file.type || 'image/jpeg'
      const res = await apiFetch('/api/parse-document', {
        method: 'POST',
        body: JSON.stringify({ file: base64, mediaType, documentType: 'vehicle_doc' }),
      })

      if (!res.success || !res.data) {
        setDocValidation({ status: 'warning', message: 'Could not verify document — upload at your own discretion' })
        return
      }

      const ai = res.data
      const detected = ai.detected_document_type || 'unknown'

      // Check if it's even a vehicle document
      if (ai.is_vehicle_document === false) {
        setDocValidation({
          status: 'mismatch',
          message: `This does not appear to be a vehicle document. AI detected: ${ai.key_details || 'non-vehicle document'}. Are you sure you want to upload this as ${VEH_DOC_TYPES.find(t => t.id === selectedDocType)?.label}?`,
          detected,
          aiData: ai,
        })
        return
      }

      // Check if detected type matches selected type
      if (detected !== 'unknown' && detected !== 'other' && detected !== selectedDocType) {
        const detectedLabel = VEH_DOC_TYPES.find(t => t.id === detected)?.label || detected
        const selectedLabel = VEH_DOC_TYPES.find(t => t.id === selectedDocType)?.label || selectedDocType
        setDocValidation({
          status: 'mismatch',
          message: `AI detected this as "${detectedLabel}" but you selected "${selectedLabel}". Please verify the document type is correct.`,
          detected,
          aiData: ai,
          suggestedType: detected,
        })
        return
      }

      // Auto-fill expiry date if AI found one
      const expiryFromAI = ai.dates?.expiration_date
      const issuedFromAI = ai.dates?.issued_date
      setDocValidation({
        status: 'match',
        message: `AI verified: this is a ${VEH_DOC_TYPES.find(t => t.id === selectedDocType)?.label || selectedDocType}`,
        detected,
        aiData: ai,
        autoExpiry: expiryFromAI || null,
        autoIssued: issuedFromAI || null,
      })

      // Auto-fill dates if empty
      if (expiryFromAI) setNewVehDoc(p => ({ ...p, expiry_date: p.expiry_date || expiryFromAI }))
      if (issuedFromAI) setNewVehDoc(p => ({ ...p, issued_date: p.issued_date || issuedFromAI }))
    } catch {
      setDocValidation({ status: 'warning', message: 'Could not verify document — upload at your own discretion' })
    }
  }, [])

  const selId = equipment.find(e => e.id === selected)?.id || equipment[0]?.id
  useEffect(() => {
    if (!selId) return
    setVehDocsLoading(true)
    fetchVehicleDocuments(selId).then(docs => { setVehDocs(docs); setVehDocsLoading(false) }).catch(() => setVehDocsLoading(false))
  }, [selId])

  const filtered = tab === 'all' ? equipment : equipment.filter(e => e.type === tab)
  const sel = equipment.find(e => e.id === selected) || filtered[0]
  const truckCount = equipment.filter(e => e.type === 'truck').length
  const trailerCount = equipment.filter(e => e.type === 'trailer').length
  const activeCount = equipment.filter(e => e.status === 'Active').length
  const shopCount = equipment.filter(e => e.status === 'Shop').length

  const statusColor = s => s === 'Active' ? 'var(--success)' : s === 'Shop' ? 'var(--warning)' : 'var(--muted)'
  const typeColor = t => t === 'truck' ? '#f0a500' : '#38bdf8'
  const TypeIcon = ({ type, trailerType, size = 16 }) => {
    if (type === 'trailer') {
      const TIcon = TRAILER_TYPE_ICONS[trailerType] || Container
      return <TIcon size={size} />
    }
    return <Truck size={size} />
  }

  const addEquipment = async () => {
    if (!form.unit_number) return
    try {
      await addVehicle({
        unit_number: form.unit_number,
        type: addType === 'truck' ? 'Truck' : 'Trailer',
        year: form.year ? parseInt(form.year) : null,
        make: form.make || null,
        model: form.model || null,
        vin: form.vin || null,
        license_plate: form.license_plate || null,
        license_state: form.license_state || null,
        current_miles: form.current_miles ? parseInt(form.current_miles) : null,
        next_service_miles: form.next_service_miles ? parseInt(form.next_service_miles) : null,
        registration_expiry: form.registration_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
        notes: addType === 'trailer' ? [form.trailer_type, form.length ? form.length + 'ft' : '', form.axles ? form.axles + ' axle' : '', form.notes].filter(Boolean).join(' · ') : (form.notes || null),
        status: 'Active',
      })
      setShowAdd(false)
      setForm({})
      showToast('success', addType === 'truck' ? 'Truck Added' : 'Trailer Added', form.unit_number)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to add equipment')
    }
  }

  const saveEdit = async () => {
    if (!sel) return
    try {
      const updates = {
        unit_number: editForm.unit_number,
        year: editForm.year ? parseInt(editForm.year) : null,
        make: editForm.make || null,
        model: editForm.model || null,
        vin: editForm.vin || null,
        license_plate: editForm.license_plate || null,
        license_state: editForm.license_state || null,
        current_miles: editForm.current_miles ? parseInt(editForm.current_miles) : null,
        next_service_miles: editForm.next_service_miles ? parseInt(editForm.next_service_miles) : null,
        registration_expiry: editForm.registration_expiry || null,
        insurance_expiry: editForm.insurance_expiry || null,
        status: editForm.status || 'Active',
      }
      if (sel.type === 'trailer') {
        updates.notes = [editForm.trailer_type, editForm.length ? editForm.length + 'ft' : '', editForm.axles ? editForm.axles + ' axle' : '', editForm.notes].filter(Boolean).join(' · ')
      } else {
        updates.notes = editForm.notes || null
      }
      await editVehicle(sel.id, updates)
      setEditing(false)
      showToast('success', 'Saved', editForm.unit_number || sel.unit)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to save')
    }
  }

  const handleDelete = async (id) => {
    const eq = equipment.find(e => e.id === id)
    if (!eq) return
    if (!window.confirm(`Delete ${eq.unit || 'this equipment'}? This cannot be undone.`)) return
    try {
      await removeVehicle(id)
      if (selected === id) setSelected(null)
      showToast('success', 'Deleted', eq.unit || 'Equipment removed')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to delete')
    }
  }

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }
  const sel_ = { ...inp, appearance:'none', WebkitAppearance:'none', cursor:'pointer' }

  const fields = addType === 'truck' ? EQ_FIELDS_TRUCK : EQ_FIELDS_TRAILER

  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false
    const str = String(dateStr)
    const d = new Date(str)
    if (isNaN(d.getTime())) return false
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff < 45
  }

  // Empty state
  if (!equipment.length && !showAdd) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', padding:40 }}>
        <div style={{ textAlign:'center', maxWidth:360 }}>
          <div style={{ width:64, height:64, borderRadius:16, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <Truck size={28} color="var(--accent)" />
          </div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>Add your first vehicle</div>
          <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:24 }}>
            Add trucks and trailers to manage your fleet, track maintenance, and stay on top of compliance.
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button className="btn btn-primary" onClick={() => { setShowAdd(true); setAddType('truck') }}><Truck size={14} /> Add Truck</button>
            <button className="btn btn-ghost" onClick={() => { setShowAdd(true); setAddType('trailer') }}><Container size={14} /> Add Trailer</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:16, width:520, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>ADD {addType.toUpperCase()}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Fill in the details for your new {addType}</div>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {[['truck', Truck, 'Truck'], ['trailer', Container, 'Trailer']].map(([t, Icon, label]) => (
                <button key={t} onClick={() => { setAddType(t); setForm({}) }}
                  style={{ flex:1, padding:'10px 0', fontSize:12, fontWeight:700, borderRadius:10, border: addType === t ? '2px solid var(--accent)' : '1px solid var(--border)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                    background: addType === t ? 'rgba(240,165,0,0.08)' : 'var(--surface2)', color: addType === t ? 'var(--accent)' : 'var(--muted)', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {fields.map(f => (
                <div key={f.key} style={{ gridColumn: f.span === 2 ? 'span 2' : undefined }}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4, fontWeight:600 }}>{f.label}</label>
                  {f.select
                    ? <select value={form[f.key] || ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={sel_}>
                        <option value="">Select {f.label}...</option>
                        {f.select.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    : <input value={form[f.key] || ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph} style={inp} />
                  }
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={addEquipment} disabled={!form.unit_number}>
                {addType === 'truck' ? <Truck size={14} /> : <Container size={14} />} Add {addType === 'truck' ? 'Truck' : 'Trailer'}
              </button>
              <button className="btn btn-ghost" style={{ padding:'12px 24px' }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT PANEL */}
      <div style={{ width:260, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column' }}>
        {/* Summary stats */}
        <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:12 }}>
            {[
              { v: truckCount, l:'Trucks', c:'#f0a500' },
              { v: trailerCount, l:'Trailers', c:'#38bdf8' },
              { v: activeCount, l:'Active', c:'var(--success)' },
              { v: shopCount, l:'Shop', c:'var(--warning)' },
            ].map(s => (
              <div key={s.l} style={{ textAlign:'center', padding:'6px 0' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:s.c, lineHeight:1 }}>{s.v}</div>
                <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600, letterSpacing:0.5 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {[['all','All (' + equipment.length + ')'], ['truck','Trucks'], ['trailer','Trailers']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ flex:1, padding:'6px 0', fontSize:10, fontWeight:700, borderRadius:6, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  background: tab === id ? (id === 'trailer' ? 'rgba(56,189,248,0.15)' : id === 'truck' ? 'rgba(240,165,0,0.15)' : 'var(--surface2)') : 'transparent',
                  color: tab === id ? (id === 'trailer' ? '#38bdf8' : id === 'truck' ? '#f0a500' : 'var(--text)') : 'var(--muted)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Equipment list */}
        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {filtered.map(eq => {
            const isSel = sel?.id === eq.id
            const expiring = isExpiringSoon(eq.regExpiry) || isExpiringSoon(eq.insExpiry)
            const color = typeColor(eq.type)
            return (
              <div key={eq.id} onClick={() => { setSelected(eq.id); setEditing(false) }}
                style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                  borderLeft:`3px solid ${isSel ? color : 'transparent'}`,
                  background: isSel ? `${color}08` : 'transparent', transition:'all 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:9, background:`${color}12`, border:`1px solid ${color}30`,
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color }}>
                    <TypeIcon type={eq.type} trailerType={eq.trailer_type} size={16} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      <span style={{ fontSize:13, fontWeight:700, color: isSel ? color : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{eq.unit}</span>
                      {expiring && <AlertTriangle size={12} color="var(--warning)" />}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>
                      {eq.type === 'trailer' && eq.trailer_type ? <span style={{ color: trailerTypeColor(eq.trailer_type), fontWeight:600 }}>{eq.trailer_type}</span> : null}
                      {eq.type === 'trailer' && eq.trailer_type ? ' · ' : ''}{eq.year} {eq.make} {eq.model}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:`${statusColor(eq.status)}15`, color:statusColor(eq.status), marginBottom:2 }}>{eq.status}</div>
                    <div style={{ fontSize:9, color:'var(--muted)', fontFamily:'monospace' }}>{eq.plate}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add buttons */}
        <div style={{ padding:10, borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', gap:6 }}>
          <button className="btn btn-primary" style={{ flex:1, fontSize:11, padding:'9px 0' }} onClick={() => { setShowAdd(true); setAddType('truck') }}>
            <Truck size={12} /> Truck
          </button>
          <button style={{ flex:1, fontSize:11, padding:'9px 0', fontWeight:700, borderRadius:8, border:'1px solid rgba(56,189,248,0.3)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", background:'rgba(56,189,248,0.08)', color:'#38bdf8', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
            onClick={() => { setShowAdd(true); setAddType('trailer') }}>
            <Container size={12} /> Trailer
          </button>
        </div>
      </div>

      {/* RIGHT DETAIL */}
      {sel ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Header */}
          <div style={{ flexShrink:0, padding:'16px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:`${typeColor(sel.type)}10`, border:`2px solid ${typeColor(sel.type)}30`,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:typeColor(sel.type) }}>
              <TypeIcon type={sel.type} trailerType={sel.trailer_type} size={22} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:3, flexWrap:'wrap' }}>
                <span style={{ fontSize:17, fontWeight:800 }}>{sel.unit}</span>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:6, background:`${statusColor(sel.status)}12`, color:statusColor(sel.status), border:`1px solid ${statusColor(sel.status)}30` }}>{sel.status}</span>
                {sel.type === 'trailer' && sel.trailer_type && (
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:6, background:`${trailerTypeColor(sel.trailer_type)}12`, color:trailerTypeColor(sel.trailer_type), border:`1px solid ${trailerTypeColor(sel.trailer_type)}25` }}>
                    {sel.trailer_type}{sel.length ? ` · ${sel.length}ft` : ''}
                  </span>
                )}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>
                {sel.year} {sel.make} {sel.model}{sel.plate ? ` · ${sel.plate}` : ''}{sel.vin ? <> · VIN: <span style={{ fontFamily:'monospace', fontSize:11 }}>{sel.vin}</span></> : ''}
              </div>
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              {editing
                ? <>
                    <button className="btn btn-primary" style={{ fontSize:11 }} onClick={saveEdit}><Ic icon={Save} /> Save</button>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setEditing(false)}>Cancel</button>
                  </>
                : <>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => {
                      setEditing(true)
                      setEditForm({
                        unit_number: sel.unit_number || sel.unit || '', year: sel.year || '', make: sel.make || '', model: sel.model || '',
                        vin: sel.vin || '', license_plate: sel.license_plate || sel.plate || '', license_state: sel.license_state || sel.state || '',
                        current_miles: sel.current_miles || sel.odometer || '', next_service_miles: sel.next_service_miles || sel.nextService || '',
                        registration_expiry: sel.registration_expiry || sel.regExpiry || '', insurance_expiry: sel.insurance_expiry || sel.insExpiry || '',
                        notes: sel.notes || '', status: sel.status || 'Active',
                        trailer_type: sel.trailer_type || '', length: sel.length || '', axles: sel.axles || '',
                      })
                    }}><Ic icon={PencilIcon} /> Edit</button>
                    <button className="btn btn-ghost" style={{ fontSize:11, color:'var(--error, #ef4444)' }} onClick={() => handleDelete(sel.id)}><Ic icon={Trash2} /></button>
                  </>
              }
            </div>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:20, display:'flex', flexDirection:'column', gap:14 }}>

            {/* Alerts */}
            {(isExpiringSoon(sel.regExpiry) || isExpiringSoon(sel.insExpiry)) && (
              <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:10, padding:'10px 14px', display:'flex', gap:10, alignItems:'center' }}>
                <AlertTriangle size={16} color="var(--warning)" />
                <div style={{ flex:1 }}>
                  {isExpiringSoon(sel.regExpiry) && <div style={{ fontSize:12, color:'var(--warning)', fontWeight:600 }}>Registration expires {sel.regExpiry}</div>}
                  {isExpiringSoon(sel.insExpiry) && <div style={{ fontSize:12, color:'var(--warning)', fontWeight:600 }}>Insurance expires {sel.insExpiry}</div>}
                </div>
              </div>
            )}

            {/* Key stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
              {[
                sel.type === 'truck' && { label:'Odometer', value: sel.odometer ? Number(sel.odometer).toLocaleString() + ' mi' : '—', icon: Route, c:'var(--accent)' },
                { label:'Next Service', value: sel.nextService ? Number(sel.nextService).toLocaleString() + ' mi' : '—', icon: Wrench, c:'var(--accent2)', warn: isExpiringSoon(sel.nextService) },
                { label:'Reg. Expiry', value: sel.regExpiry || '—', icon: FileText, c:'var(--text)', warn: isExpiringSoon(sel.regExpiry) },
                { label:'Ins. Expiry', value: sel.insExpiry || '—', icon: Shield, c:'var(--text)', warn: isExpiringSoon(sel.insExpiry) },
                sel.type === 'trailer' && sel.trailer_type && { label:'Type', value: sel.trailer_type + (sel.length ? ' · ' + sel.length + 'ft' : ''), icon: Container, c:'#38bdf8' },
                sel.type === 'trailer' && sel.axles && { label:'Axles', value: sel.axles, icon: Layers, c:'var(--muted)' },
              ].filter(Boolean).map(s => (
                <div key={s.label} style={{ background:'var(--surface)', border:`1px solid ${s.warn ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`, borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    <s.icon size={12} color="var(--muted)" />
                    <span style={{ fontSize:10, color:'var(--muted)', fontWeight:600 }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize:15, fontWeight:700, color: s.warn ? 'var(--warning)' : s.c }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Details grid */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
                <TypeIcon type={sel.type} trailerType={sel.trailer_type} size={14} />
                <span style={{ fontSize:13, fontWeight:700 }}>{editing ? 'Edit ' : ''}{sel.type === 'truck' ? 'Truck' : 'Trailer'} Details</span>
              </div>
              <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {(sel.type === 'truck' ? EQ_FIELDS_TRUCK : EQ_FIELDS_TRAILER).map(f => (
                  <div key={f.key} style={{ gridColumn: f.span === 2 ? 'span 2' : undefined }}>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>{f.label}</div>
                    {editing
                      ? (f.select
                          ? <select value={editForm[f.key] || ''} onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={sel_}>
                              <option value="">Select...</option>
                              {f.select.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          : <input value={editForm[f.key] || ''} onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph}
                              style={{ ...inp, padding:'7px 10px', fontSize:12 }} />
                        )
                      : <div style={{ fontSize:13, fontWeight:600, color: sel[f.key] ? 'var(--text)' : 'var(--muted)', fontFamily: f.key === 'vin' ? 'monospace' : undefined }}>
                          {sel[f.key] || '—'}
                        </div>
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            {!editing && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700 }}><Ic icon={Zap} /> Quick Actions</div>
                <div style={{ padding:'12px 16px', display:'flex', gap:8, flexWrap:'wrap' }}>
                  {['Active','Shop','Inactive'].map(s => (
                    <button key={s} onClick={async () => { try { await editVehicle(sel.id, { status: s }); showToast('success','Status Updated', (sel.unit || sel.unit_number) + ' → ' + s) } catch(err) { showToast('error','Error', err.message || 'Failed') } }}
                      style={{ padding:'7px 16px', fontSize:11, fontWeight:700, borderRadius:7, border:`1px solid ${statusColor(s)}35`, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                        background: sel.status === s ? `${statusColor(s)}15` : 'var(--surface2)', color: sel.status === s ? statusColor(s) : 'var(--muted)', display:'flex', alignItems:'center', gap:5 }}>
                      {s === 'Active' ? <Check size={12} /> : s === 'Shop' ? <Wrench size={12} /> : null} {s}
                    </button>
                  ))}
                  <div style={{ width:1, height:28, background:'var(--border)', alignSelf:'center' }} />
                  <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={async () => { const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7); const dateStr = nextWeek.toISOString().split('T')[0]; try { await editVehicle(sel.id, { notes: (sel.notes ? sel.notes + ' | ' : '') + 'Service scheduled ' + dateStr }); showToast('success', 'Service Scheduled', dateStr) } catch (err) { showToast('error', 'Error', err.message) } }}><Ic icon={Wrench} /> Schedule Service</button>
                  {sel.type === 'truck' && <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { const lat = sel.lat || sel.latitude; const lng = sel.lng || sel.longitude; if (lat && lng) { window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank') } else { showToast('', 'No GPS', 'Connect ELD for live tracking') } }}><Ic icon={MapPin} /> GPS</button>}
                  <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { const fields = sel.type === 'truck' ? EQ_FIELDS_TRUCK : EQ_FIELDS_TRAILER; const header = fields.map(f => f.label).join(','); const row = fields.map(f => '"' + String(sel[f.key] || '').replace(/"/g, '""') + '"').join(','); const csv = header + '\n' + row; const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = (sel.unit || 'equipment') + '.csv'; a.click(); URL.revokeObjectURL(url); showToast('success', 'Exported', sel.unit) }}><Ic icon={FileText} /> Export</button>
                </div>
              </div>
            )}

            {/* ── Vehicle Documents ── */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <Paperclip size={14} color="var(--accent)" />
                  <span style={{ fontSize:13, fontWeight:700 }}>Documents</span>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{vehDocs.length}</span>
                </div>
                <button className="btn btn-primary" style={{ fontSize:11, padding:'5px 12px' }} onClick={() => setShowDocUpload(true)}><Plus size={12} /> Add Document</button>
              </div>

              {(() => {
                const requiredTypes = VEH_DOC_TYPES.filter(t => t.required)
                const uploadedTypes = new Set(vehDocs.map(f => f.doc_type))
                const missingRequired = requiredTypes.filter(t => !uploadedTypes.has(t.id))
                const expiredDocs = vehDocs.filter(f => getVehExpiryStatus(f.expiry_date) === 'expired')
                const expiringDocs = vehDocs.filter(f => getVehExpiryStatus(f.expiry_date) === 'expiring_soon')

                return (
                  <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
                    {/* Completion bar */}
                    {missingRequired.length > 0 && (
                      <div>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ fontSize:10, color:'var(--muted)', fontWeight:600 }}>Required Docs</span>
                          <span style={{ fontSize:10, fontWeight:700, color: missingRequired.length === 0 ? 'var(--success)' : 'var(--accent)' }}>{requiredTypes.length - missingRequired.length}/{requiredTypes.length}</span>
                        </div>
                        <div style={{ height:4, background:'var(--surface2)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${((requiredTypes.length - missingRequired.length) / requiredTypes.length) * 100}%`, background: missingRequired.length === 0 ? 'var(--success)' : 'var(--accent)', borderRadius:2, transition:'width 0.3s' }} />
                        </div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
                          {missingRequired.map(t => (
                            <span key={t.id} onClick={() => { setNewVehDoc(p => ({ ...p, doc_type: t.id })); setShowDocUpload(true) }}
                              style={{ fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:5, background:'rgba(239,68,68,0.08)', color:'var(--danger)', border:'1px solid rgba(239,68,68,0.15)', cursor:'pointer' }}>
                              Missing: {t.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Alerts for expiring/expired */}
                    {(expiredDocs.length > 0 || expiringDocs.length > 0) && (
                      <div style={{ display:'flex', gap:8 }}>
                        {expiredDocs.length > 0 && (
                          <div style={{ flex:1, padding:'6px 10px', borderRadius:8, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)', display:'flex', alignItems:'center', gap:6 }}>
                            <AlertTriangle size={12} color="var(--danger)" />
                            <span style={{ fontSize:10, fontWeight:700, color:'var(--danger)' }}>{expiredDocs.length} expired</span>
                          </div>
                        )}
                        {expiringDocs.length > 0 && (
                          <div style={{ flex:1, padding:'6px 10px', borderRadius:8, background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)', display:'flex', alignItems:'center', gap:6 }}>
                            <Clock size={12} color="var(--warning)" />
                            <span style={{ fontSize:10, fontWeight:700, color:'var(--warning)' }}>{expiringDocs.length} expiring soon</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Document list */}
                    {vehDocsLoading ? (
                      <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>Loading documents...</div>
                    ) : vehDocs.length === 0 ? (
                      <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>
                        <FileText size={20} style={{ marginBottom:6, opacity:0.5 }} />
                        <div style={{ fontSize:12, fontWeight:600 }}>No documents uploaded</div>
                        <div style={{ fontSize:10, marginTop:2 }}>Add registration, insurance, inspection, and more</div>
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {vehDocs.map(doc => {
                          const docType = VEH_DOC_TYPES.find(t => t.id === doc.doc_type)
                          const status = VEH_DOC_STATUS_COLORS[getVehExpiryStatus(doc.expiry_date)] || VEH_DOC_STATUS_COLORS[doc.status] || VEH_DOC_STATUS_COLORS.valid
                          return (
                            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'var(--surface2)', borderRadius:8, border: getVehExpiryStatus(doc.expiry_date) === 'expired' ? '1px solid rgba(239,68,68,0.2)' : getVehExpiryStatus(doc.expiry_date) === 'expiring_soon' ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent' }}>
                              <FileText size={14} color={status.color} style={{ flexShrink:0 }} />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{docType?.label || doc.doc_type}</div>
                                <div style={{ fontSize:10, color:'var(--muted)', display:'flex', alignItems:'center', gap:6 }}>
                                  <span>{doc.file_name}</span>
                                  {doc.expiry_date && <span>· Exp: {new Date(doc.expiry_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
                                </div>
                              </div>
                              <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:5, background:status.bg, color:status.color, flexShrink:0 }}>{status.label}</span>
                              {doc.file_url && (
                                <>
                                  <button onClick={() => window.open(doc.file_url, '_blank')} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', padding:3 }} title="View"><Eye size={13} /></button>
                                  <button onClick={() => {
                                    const w = window.open('', '_blank')
                                    if (w) {
                                      const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(doc.file_url)
                                      w.document.write(`<html><head><title>${doc.file_name}</title><style>@media print{body{margin:0}img{max-width:100%;height:auto}}</style></head><body style="margin:20px;font-family:sans-serif">`)
                                      w.document.write(`<h2>${docType?.label || doc.doc_type}</h2>`)
                                      w.document.write(`<p><strong>Vehicle:</strong> ${sel.unit || sel.unit_number || '—'} | <strong>File:</strong> ${doc.file_name}</p>`)
                                      if (doc.issued_date) w.document.write(`<p><strong>Issued:</strong> ${new Date(doc.issued_date).toLocaleDateString()}</p>`)
                                      if (doc.expiry_date) w.document.write(`<p><strong>Expires:</strong> ${new Date(doc.expiry_date).toLocaleDateString()}</p>`)
                                      if (isImg) { w.document.write(`<img src="${doc.file_url}" style="max-width:100%;margin-top:16px" />`) }
                                      else { w.document.write(`<iframe src="${doc.file_url}" style="width:100%;height:80vh;border:1px solid #ccc;margin-top:16px"></iframe>`) }
                                      w.document.write('</body></html>')
                                      w.document.close()
                                      setTimeout(() => w.print(), 500)
                                    }
                                  }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:3 }} title="Print"><Printer size={13} /></button>
                                </>
                              )}
                              <button onClick={async () => {
                                try { await deleteVehicleDocument(doc.id); setVehDocs(prev => prev.filter(d => d.id !== doc.id)); showToast('success', 'Deleted', doc.file_name + ' removed') } catch (err) { showToast('error', 'Error', err.message) }
                              }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:3 }} title="Delete"><Trash2 size={13} /></button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Upload Document Modal */}
            {showDocUpload && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
                onClick={e => { if (e.target === e.currentTarget) setShowDocUpload(false) }}>
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:480, padding:24 }} onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Add Vehicle Document</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Upload document for {sel?.unit || sel?.unit_number || 'vehicle'}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <div>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Document Type *</label>
                      <select value={newVehDoc.doc_type} onChange={e => { setNewVehDoc(p => ({ ...p, doc_type: e.target.value })); if (newVehDoc.file) { setDocValidation(null); validateDocument(newVehDoc.file, e.target.value) } }} style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }}>
                        {VEH_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}{t.required ? ' *' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>File Name / Description *</label>
                      <input value={newVehDoc.file_name} onChange={e => setNewVehDoc(p => ({ ...p, file_name: e.target.value }))} placeholder="e.g. 2025 Registration Card" style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <div>
                        <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Issued Date</label>
                        <input type="date" value={newVehDoc.issued_date} onChange={e => setNewVehDoc(p => ({ ...p, issued_date: e.target.value }))} style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Expiry Date</label>
                        <input type="date" value={newVehDoc.expiry_date} onChange={e => setNewVehDoc(p => ({ ...p, expiry_date: e.target.value }))} style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Notes</label>
                      <textarea value={newVehDoc.notes} onChange={e => setNewVehDoc(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." rows={2} style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', resize:'vertical' }} />
                    </div>
                    <div>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Upload File</label>
                      {newVehDoc.file ? (
                        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:8 }}>
                          <Check size={14} style={{ color:'var(--success)', flexShrink:0 }} />
                          <span style={{ fontSize:12, color:'var(--text)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{newVehDoc.file.name}</span>
                          <span style={{ fontSize:10, color:'var(--muted)' }}>{(newVehDoc.file.size / 1024).toFixed(0)} KB</span>
                          <button onClick={() => setNewVehDoc(p => ({ ...p, file: null }))} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>Remove</button>
                        </div>
                      ) : (
                        <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'14px 16px', borderRadius:8, border:'1px dashed var(--border)', background:'var(--surface2)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          <Upload size={14} /> Choose File (image or PDF)
                          <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) {
                              setNewVehDoc(p => ({ ...p, file: f, file_name: p.file_name || f.name }))
                              setDocValidation(null)
                              validateDocument(f, newVehDoc.doc_type)
                            }
                          }} style={{ display:'none' }} />
                        </label>
                      )}
                    </div>
                  </div>
                  {/* AI Validation Result */}
                  {docValidation && (
                    <div style={{
                      marginTop: 10, padding: '10px 14px', borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
                      background: docValidation.status === 'match' ? 'rgba(34,197,94,0.08)' : docValidation.status === 'mismatch' ? 'rgba(239,68,68,0.08)' : docValidation.status === 'checking' ? 'rgba(77,142,240,0.08)' : 'rgba(240,165,0,0.08)',
                      border: `1px solid ${docValidation.status === 'match' ? 'rgba(34,197,94,0.25)' : docValidation.status === 'mismatch' ? 'rgba(239,68,68,0.25)' : docValidation.status === 'checking' ? 'rgba(77,142,240,0.25)' : 'rgba(240,165,0,0.25)'}`,
                    }}>
                      {docValidation.status === 'checking' && <Bot size={14} style={{ color:'var(--accent3)', flexShrink:0, marginTop:1, animation:'spin 1s linear infinite' }} />}
                      {docValidation.status === 'match' && <Check size={14} style={{ color:'var(--success)', flexShrink:0, marginTop:1 }} />}
                      {docValidation.status === 'mismatch' && <AlertTriangle size={14} style={{ color:'var(--danger)', flexShrink:0, marginTop:1 }} />}
                      {docValidation.status === 'warning' && <AlertTriangle size={14} style={{ color:'var(--accent)', flexShrink:0, marginTop:1 }} />}
                      <div style={{ flex:1 }}>
                        <div style={{ color: docValidation.status === 'match' ? 'var(--success)' : docValidation.status === 'mismatch' ? 'var(--danger)' : docValidation.status === 'checking' ? 'var(--accent3)' : 'var(--accent)', fontWeight:600 }}>
                          {docValidation.message}
                        </div>
                        {docValidation.suggestedType && (
                          <button onClick={() => { setNewVehDoc(p => ({ ...p, doc_type: docValidation.suggestedType })); setDocValidation(prev => ({ ...prev, status:'match', message:`Document type updated to ${VEH_DOC_TYPES.find(t => t.id === docValidation.suggestedType)?.label}`, suggestedType:null })) }}
                            style={{ marginTop:6, fontSize:11, padding:'4px 10px', borderRadius:6, background:'var(--accent)', color:'#000', border:'none', cursor:'pointer', fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>
                            Use Suggested Type
                          </button>
                        )}
                        {docValidation.aiData?.vehicle_info?.vin && (
                          <div style={{ marginTop:4, fontSize:10, color:'var(--muted)' }}>VIN: {docValidation.aiData.vehicle_info.vin}</div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ display:'flex', gap:10, marginTop:18 }}>
                    <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} disabled={docSaving || !newVehDoc.file_name} onClick={async () => {
                      if (!newVehDoc.doc_type || !newVehDoc.file_name) { showToast('error', 'Error', 'Document type and name are required'); return }
                      setDocSaving(true)
                      try {
                        let fileUrl = null, fileSize = null
                        if (newVehDoc.file) {
                          const result = await uploadFile(newVehDoc.file, `vehicles/${sel.id}`)
                          fileUrl = result.url
                          fileSize = result.size
                        }
                        const doc = await createVehicleDocument({
                          vehicle_id: sel.id,
                          doc_type: newVehDoc.doc_type,
                          file_name: newVehDoc.file_name,
                          file_url: fileUrl,
                          file_size: fileSize,
                          expiry_date: newVehDoc.expiry_date || null,
                          issued_date: newVehDoc.issued_date || null,
                          notes: newVehDoc.notes || null,
                          status: newVehDoc.expiry_date ? getVehExpiryStatus(newVehDoc.expiry_date) : 'valid',
                        })
                        setVehDocs(prev => [doc, ...prev])
                        showToast('success', 'Document Added', `${VEH_DOC_TYPES.find(t => t.id === newVehDoc.doc_type)?.label} uploaded`)
                        setNewVehDoc({ doc_type: 'registration', file_name: '', expiry_date: '', issued_date: '', notes: '', file: null })
                        setDocValidation(null)
                        setShowDocUpload(false)
                      } catch (err) {
                        showToast('error', 'Error', err.message || 'Failed to save document')
                      }
                      setDocSaving(false)
                    }}>
                      {docSaving ? 'Saving...' : 'Add Document'}
                    </button>
                    <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowDocUpload(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:13 }}>
          Select equipment from the left panel
        </div>
      )}
    </div>
  )
}
