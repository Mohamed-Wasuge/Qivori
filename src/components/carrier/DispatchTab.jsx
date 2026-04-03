import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import {
  FileText, ClipboardList, CheckCircle, Receipt, Scale, Zap, AlertTriangle,
  Plus, Trash2, ChevronUp, ChevronDown, MapPin, Clock, Package, Layers
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { generateInvoicePDF } from '../../utils/generatePDF'
import { Ic } from './shared'

// ── LTL / Partial constants ───────────────────────────────────────────────────
const FREIGHT_CLASSES = ['50','55','60','65','70','77.5','85','92.5','100','110','125','150','175','200','250','300','400','500']
const HANDLING_UNITS = ['pallet','crate','drum','box','roll','bundle','loose']
const MAX_TRAILER_WEIGHT = 44000
const MAX_TRAILER_PALLETS = 26

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
    parsedStops: Array.isArray(data.stops) ? data.stops : [],
    // LTL fields
    loadType: data.load_type || 'FTL',
    freightClass: data.freight_class || '',
    palletCount: data.pallet_count ? String(data.pallet_count) : '',
    lengthInches: data.length_inches ? String(data.length_inches) : '',
    widthInches: data.width_inches ? String(data.width_inches) : '',
    heightInches: data.height_inches ? String(data.height_inches) : '',
    handlingUnit: data.handling_unit || 'pallet',
    stackable: data.stackable || false,
  }
}

export const DOC_TYPES = ['Rate Con', 'BOL', 'POD', 'Lumper Receipt', 'Scale Ticket', 'Other']
export const DOC_ICONS = { 'Rate Con': FileText, 'BOL': ClipboardList, 'POD': CheckCircle, 'Lumper Receipt': Receipt, 'Scale Ticket': Scale, 'Other': FileText }
export const DOC_COLORS = { 'Rate Con': 'var(--accent)', 'BOL': 'var(--accent2)', 'POD': 'var(--success)', 'Lumper Receipt': 'var(--accent3)', 'Scale Ticket': 'var(--warning)', 'Other': 'var(--muted)' }

// ── StopBuilder — multi-stop editor for load creation ────────────────────────
function StopBuilder({ stops, setStops }) {
  const addStop = () => {
    const maxSeq = stops.length > 0 ? Math.max(...stops.map(s => s.sequence)) : 0
    setStops([...stops, {
      _key: Date.now(),
      sequence: maxSeq + 1,
      type: 'pickup',
      city: '',
      state: '',
      address: '',
      scheduled_date: '',
      contact_name: '',
      contact_phone: '',
      reference_number: '',
    }])
  }

  const removeStop = (idx) => {
    if (stops.length <= 2) return
    const updated = stops.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sequence: i + 1 }))
    setStops(updated)
  }

  const updateStop = (idx, field, value) => {
    const updated = [...stops]
    updated[idx] = { ...updated[idx], [field]: value }
    setStops(updated)
  }

  const moveStop = (idx, dir) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= stops.length) return
    const updated = [...stops]
    const tmp = updated[idx]
    updated[idx] = updated[newIdx]
    updated[newIdx] = tmp
    setStops(updated.map((s, i) => ({ ...s, sequence: i + 1 })))
  }

  const inputStyle = (val) => ({
    width: '100%', background: val ? 'rgba(0,212,170,0.05)' : 'var(--surface2)',
    border: `1px solid ${val ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`,
    borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12,
    fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box',
  })

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5 }}>
          STOPS ({stops.length})
        </div>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} onClick={addStop}>
          <Ic icon={Plus} size={12} /> Add Stop
        </button>
      </div>

      {stops.map((stop, idx) => (
        <div key={stop._key || idx} style={{
          background: 'var(--surface2)', border: `1px solid ${stop.type === 'pickup' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: 10, padding: 14, marginBottom: 10, position: 'relative',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 800, width: 22, height: 22, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: stop.type === 'pickup' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: stop.type === 'pickup' ? 'var(--success)' : 'var(--danger)',
              }}>{idx + 1}</span>
              <select value={stop.type} onChange={e => updateStop(idx, 'type', e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                <option value="pickup">Pickup</option>
                <option value="dropoff">Delivery</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" onClick={() => moveStop(idx, -1)} disabled={idx === 0}
                style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--border)' : 'var(--muted)', padding: 2 }}>
                <Ic icon={ChevronUp} size={14} />
              </button>
              <button type="button" onClick={() => moveStop(idx, 1)} disabled={idx === stops.length - 1}
                style={{ background: 'none', border: 'none', cursor: idx === stops.length - 1 ? 'default' : 'pointer', color: idx === stops.length - 1 ? 'var(--border)' : 'var(--muted)', padding: 2 }}>
                <Ic icon={ChevronDown} size={14} />
              </button>
              {stops.length > 2 && (
                <button type="button" onClick={() => removeStop(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2 }}>
                  <Ic icon={Trash2} size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>City</label>
              <input value={stop.city} onChange={e => updateStop(idx, 'city', e.target.value)}
                placeholder="Dallas" style={inputStyle(stop.city)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>State</label>
              <input value={stop.state || ''} onChange={e => updateStop(idx, 'state', e.target.value)}
                placeholder="TX" maxLength={2} style={inputStyle(stop.state)} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Address</label>
              <input value={stop.address || ''} onChange={e => updateStop(idx, 'address', e.target.value)}
                placeholder="123 Warehouse Dr" style={inputStyle(stop.address)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Date</label>
              <input type="date" value={stop.scheduled_date || ''} onChange={e => updateStop(idx, 'scheduled_date', e.target.value)}
                style={inputStyle(stop.scheduled_date)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Contact</label>
              <input value={stop.contact_name || ''} onChange={e => updateStop(idx, 'contact_name', e.target.value)}
                placeholder="John Doe" style={inputStyle(stop.contact_name)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Phone</label>
              <input value={stop.contact_phone || ''} onChange={e => updateStop(idx, 'contact_phone', e.target.value)}
                placeholder="(555) 123-4567" style={inputStyle(stop.contact_phone)} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Ref #</label>
              <input value={stop.reference_number || ''} onChange={e => updateStop(idx, 'reference_number', e.target.value)}
                placeholder="PO-12345" style={inputStyle(stop.reference_number)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Stop Timeline — shows multi-stop progress on load detail ─────────────────
function StopTimeline({ stops }) {
  if (!stops || stops.length === 0) return null
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Stop Timeline</div>
      {stops.map((stop, idx) => {
        const isPickup = stop.type === 'pickup'
        const statusColor = stop.status === 'complete' ? 'var(--success)' : stop.status === 'current' ? 'var(--accent)' : 'var(--muted)'
        const dotBg = stop.status === 'complete' ? 'var(--success)' : stop.status === 'current' ? 'var(--accent)' : 'var(--border)'
        return (
          <div key={stop.id || idx} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: idx < stops.length - 1 ? 16 : 0 }}>
            {/* Vertical line + dot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%', background: dotBg, border: `2px solid ${statusColor}`,
                flexShrink: 0, zIndex: 1,
              }} />
              {idx < stops.length - 1 && (
                <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 2 }} />
              )}
            </div>
            {/* Stop info */}
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                  background: isPickup ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: isPickup ? 'var(--success)' : 'var(--danger)',
                  border: `1px solid ${isPickup ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                }}>{isPickup ? 'PICKUP' : 'DELIVERY'}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{stop.city}{stop.state ? ', ' + stop.state : ''}</span>
                {stop.status === 'complete' && <Ic icon={CheckCircle} size={12} color="var(--success)" />}
              </div>
              {stop.address && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{stop.address}</div>}
              <div style={{ display: 'flex', gap: 12, marginTop: 2, flexWrap: 'wrap' }}>
                {stop.scheduled_date && <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Ic icon={Clock} size={10} /> {stop.scheduled_date}</span>}
                {stop.contact_name && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{stop.contact_name}{stop.contact_phone ? ' · ' + stop.contact_phone : ''}</span>}
                {stop.reference_number && <span style={{ fontSize: 10, color: 'var(--muted)' }}>Ref: {stop.reference_number}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Consolidation Panel — group LTL/Partial loads onto one truck ──────────────
function ConsolidationPanel({ loads, consolidations, addConsolidation, editConsolidation, updateLoadStatus, showToast }) {
  const [showPanel, setShowPanel] = useState(false)
  const [selected, setSelected] = useState([])

  // Eligible loads: LTL or Partial, Booked/Rate Con Received status, not yet consolidated
  const eligibleLoads = useMemo(() =>
    (loads || []).filter(l =>
      (l.load_type === 'LTL' || l.load_type === 'Partial') &&
      !l.consolidation_id &&
      ['Rate Con Received', 'Assigned to Driver', 'Booked'].includes(l.status)
    ), [loads])

  if (eligibleLoads.length === 0 && (!consolidations || consolidations.length === 0)) return null

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const selectedLoads = eligibleLoads.filter(l => selected.includes(l.id))
  const totalWeight = selectedLoads.reduce((s, l) => s + (parseFloat(l.weight) || 0), 0)
  const totalPallets = selectedLoads.reduce((s, l) => s + (parseInt(l.pallet_count) || 0), 0)
  const weightPct = Math.min(100, (totalWeight / MAX_TRAILER_WEIGHT) * 100)
  const palletPct = Math.min(100, (totalPallets / MAX_TRAILER_PALLETS) * 100)
  const capacityPct = Math.max(weightPct, palletPct)

  const handleCreateConsolidation = async () => {
    if (selected.length < 2) { showToast?.('', 'Select Loads', 'Select at least 2 LTL/Partial loads to consolidate'); return }
    try {
      const con = await addConsolidation({
        status: 'planning',
        total_weight: totalWeight,
        total_pallets: totalPallets,
        capacity_used_pct: Math.round(capacityPct * 100) / 100,
        notes: `${selected.length} loads consolidated`,
      })
      if (con) {
        // Update each selected load's consolidation_id
        const { updateLoad } = await import('../../lib/database')
        for (const loadId of selected) {
          try { await updateLoad(loadId, { consolidation_id: con.id }) } catch {}
        }
        showToast?.('', 'Consolidation Created', `${selected.length} loads grouped — ${Math.round(capacityPct)}% capacity`)
        setSelected([])
      }
    } catch (e) {
      showToast?.('', 'Error', e.message || 'Failed to create consolidation')
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setShowPanel(!showPanel)}
        style={{
          width: '100%', padding: '12px 18px', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: 'var(--text)', fontFamily: "'DM Sans',sans-serif",
        }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
          <Ic icon={Layers} size={16} color="var(--accent)" /> Consolidate LTL / Partial Loads
          {eligibleLoads.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' }}>
              {eligibleLoads.length} eligible
            </span>
          )}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{showPanel ? '\u25B2' : '\u25BC'}</span>
      </button>

      {showPanel && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 16 }}>
          {eligibleLoads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 12 }}>
              No unconsolidated LTL/Partial loads in Booked status. Add LTL loads to consolidate them onto one truck.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>Select loads to group onto one truck:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {eligibleLoads.map(load => {
                  const isSelected = selected.includes(load.id)
                  return (
                    <div key={load.id}
                      onClick={() => toggleSelect(load.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        background: isSelected ? 'rgba(59,130,246,0.06)' : 'var(--surface2)',
                        border: `1px solid ${isSelected ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
                        transition: 'all 0.15s',
                      }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 4, border: `2px solid ${isSelected ? '#3b82f6' : 'var(--border)'}`,
                        background: isSelected ? '#3b82f6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'all 0.15s',
                      }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>&#10003;</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{load.origin} → {load.dest}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {load.loadId} · {load.load_type} · {load.pallet_count || '?'} pallets · {load.weight || '?'} lbs
                          {load.freight_class && ` · Class ${load.freight_class}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--accent)' }}>${(load.gross || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Capacity Meter */}
              {selected.length > 0 && (
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>Capacity Estimate — {selected.length} loads selected</div>
                  {/* Weight bar */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
                      <span>Weight</span>
                      <span>{totalWeight.toLocaleString()} / {MAX_TRAILER_WEIGHT.toLocaleString()} lbs</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${weightPct}%`, background: weightPct > 90 ? 'var(--danger)' : weightPct > 70 ? 'var(--warning)' : 'var(--success)', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  {/* Pallet bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
                      <span>Pallets</span>
                      <span>{totalPallets} / {MAX_TRAILER_PALLETS} (53' trailer)</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${palletPct}%`, background: palletPct > 90 ? 'var(--danger)' : palletPct > 70 ? 'var(--warning)' : 'var(--success)', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  {capacityPct > 100 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Ic icon={AlertTriangle} size={12} color="var(--danger)" /> Over capacity — remove loads or split consolidation
                    </div>
                  )}
                </div>
              )}

              <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: 13 }}
                disabled={selected.length < 2}
                onClick={handleCreateConsolidation}>
                <Ic icon={Layers} size={14} /> Create Consolidation ({selected.length} loads)
              </button>
            </>
          )}

          {/* Existing consolidations */}
          {consolidations && consolidations.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>ACTIVE CONSOLIDATIONS</div>
              {consolidations.map(con => {
                const conLoads = (loads || []).filter(l => l.consolidation_id === con.id)
                return (
                  <div key={con.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        <Ic icon={Layers} size={12} color="var(--accent)" /> {conLoads.length} loads
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, marginLeft: 8, background: con.status === 'in_transit' ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', color: con.status === 'in_transit' ? 'var(--success)' : 'var(--accent)', border: `1px solid ${con.status === 'in_transit' ? 'rgba(34,197,94,0.25)' : 'rgba(240,165,0,0.25)'}` }}>
                          {con.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{Math.round(con.capacity_used_pct || 0)}% capacity</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {conLoads.map(l => (
                        <span key={l.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          {l.origin?.split(',')[0]} → {l.dest?.split(',')[0]} · ${(l.gross || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function BookedLoads() {
  const { showToast } = useApp()
  const { loads: bookedLoads, addLoad: ctxAddLoad, addLoadWithStops: ctxAddLoadWithStops, updateLoadStatus: ctxUpdateStatus, assignLoadToDriver: ctxAssignDriver, removeLoad, company, drivers: ctxDrivers, consolidations, addConsolidation, editConsolidation } = useCarrier()
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
  const [form, setForm] = useState({ loadId: '', broker: '', origin: '', dest: '', miles: '', rate: '', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', driver: '', gross: 0, loadType: 'FTL', freightClass: '', palletCount: '', lengthInches: '', widthInches: '', heightInches: '', handlingUnit: 'pallet', stackable: false })
  const [formStops, setFormStops] = useState([
    { _key: 1, sequence: 1, type: 'pickup', city: '', state: '', address: '', scheduled_date: '', contact_name: '', contact_phone: '', reference_number: '' },
    { _key: 2, sequence: 2, type: 'dropoff', city: '', state: '', address: '', scheduled_date: '', contact_name: '', contact_phone: '', reference_number: '' },
  ])
  const [showStopBuilder, setShowStopBuilder] = useState(false)
  const [calcMiles, setCalcMiles] = useState(false)
  const [routeData, setRouteData] = useState(null)

  // Auto-calculate miles + route data when origin + destination are both filled
  useEffect(() => {
    if (!form.origin || !form.dest || form.miles) return
    const origin = form.origin.trim()
    const dest = form.dest.trim()
    if (origin.length < 3 || dest.length < 3) return
    setCalcMiles(true)
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/calculate-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin, destination: dest }),
        })
        const data = await res.json()
        if (data.ok && data.miles > 0) {
          setForm(fm => ({ ...fm, miles: String(data.miles) }))
          setRouteData({
            fuel_estimate: data.fuel?.cost || null,
            toll_estimate: data.tolls?.estimate || null,
            origin_lat: data.origin?.lat || null,
            origin_lng: data.origin?.lng || null,
            dest_lat: data.destination?.lat || null,
            dest_lng: data.destination?.lng || null,
            drive_time_minutes: data.durationMinutes || null,
            diesel_price_at_booking: data.fuel?.dieselPrice || null,
          })
        }
      } catch {}
      setCalcMiles(false)
    }, 800)
    return () => { clearTimeout(t); setCalcMiles(false) }
  }, [form.origin, form.dest])

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
  const [invoicePayTerms, setInvoicePayTerms] = useState('Net 30')

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
      // If multi-stop data was parsed, populate the stop builder
      if (parsed.parsedStops && parsed.parsedStops.length > 0) {
        const mappedStops = parsed.parsedStops.map((s, i) => ({
          _key: Date.now() + i,
          sequence: i + 1,
          type: s.type || 'pickup',
          city: s.city || '',
          state: s.state || '',
          address: s.address || '',
          scheduled_date: s.scheduled_date || '',
          contact_name: s.contact_name || '',
          contact_phone: s.contact_phone || '',
          reference_number: s.reference_number || '',
        }))
        setFormStops(mappedStops)
        setShowStopBuilder(true)
      }
      const filled = Object.values(parsed).filter(v => v && v !== 0 && v !== '').length
      showToast('', 'Rate Con Parsed', `${filled} fields auto-filled${parsed.parsedStops?.length > 0 ? ` · ${parsed.parsedStops.length} stops detected` : ''} — review and confirm`)
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

  const assignDriver = (loadId, driver, coDriver) => {
    if (ctxAssignDriver) {
      ctxAssignDriver(loadId, driver, coDriver || undefined)
    } else {
      ctxUpdateStatus(loadId, 'Assigned to Driver')
    }
    const teamLabel = coDriver ? ` + ${coDriver} (team)` : ''
    showToast('', 'Driver Assigned', driver + teamLabel)
  }

  const addLoad = () => {
    // Auto-fill origin/dest from stops if using stop builder
    let origin = form.origin
    let dest = form.dest
    if (showStopBuilder && formStops.length >= 2) {
      const pickups = formStops.filter(s => s.type === 'pickup')
      const deliveries = formStops.filter(s => s.type === 'dropoff')
      if (pickups.length > 0 && pickups[0].city) origin = origin || (pickups[0].city + (pickups[0].state ? ', ' + pickups[0].state : ''))
      if (deliveries.length > 0 && deliveries[deliveries.length - 1].city) dest = dest || (deliveries[deliveries.length - 1].city + (deliveries[deliveries.length - 1].state ? ', ' + deliveries[deliveries.length - 1].state : ''))
    }
    if (!origin || !dest) { showToast('', 'Missing Fields', 'Origin and destination required'); return }
    const gross = parseFloat(form.rate) || form.gross || 0
    const miles = parseFloat(form.miles) || 0
    const autoId = form.loadId || ('RC-' + Date.now().toString(36).toUpperCase())
    const loadData = {
      load_id: autoId,
      origin,
      destination: dest,
      rate: gross,
      broker_name: form.broker || 'Direct',
      carrier_name: form.driver || null,
      equipment: form.equipment || 'Dry Van',
      weight: form.weight || null,
      notes: form.commodity || null,
      pickup_date: form.pickup || null,
      delivery_date: form.delivery || null,
      status: 'Rate Con Received',
      load_type: form.loadType || 'FTL',
      // LTL / Partial fields
      freight_class: (form.loadType !== 'FTL' && form.freightClass) ? form.freightClass : null,
      pallet_count: (form.loadType !== 'FTL' && form.palletCount) ? parseInt(form.palletCount) : null,
      stackable: form.loadType !== 'FTL' ? form.stackable : false,
      length_inches: (form.loadType !== 'FTL' && form.lengthInches) ? parseFloat(form.lengthInches) : null,
      width_inches: (form.loadType !== 'FTL' && form.widthInches) ? parseFloat(form.widthInches) : null,
      height_inches: (form.loadType !== 'FTL' && form.heightInches) ? parseFloat(form.heightInches) : null,
      handling_unit: (form.loadType !== 'FTL' && form.handlingUnit) ? form.handlingUnit : null,
      miles, refNum: form.refNum, rateCon: true,
      // Route data from Google Maps
      ...(routeData || {}),
    }
    // Use multi-stop creation if stops have meaningful data
    const hasStopData = showStopBuilder && formStops.some(s => s.city)
    if (hasStopData && ctxAddLoadWithStops) {
      const stopsData = formStops.map((s, i) => ({
        sequence: i + 1,
        type: s.type,
        city: s.city + (s.state ? ', ' + s.state : ''),
        address: s.address || null,
        state: s.state || null,
        zip_code: s.zip_code || null,
        scheduled_date: s.scheduled_date || null,
        contact_name: s.contact_name || null,
        contact_phone: s.contact_phone || null,
        reference_number: s.reference_number || null,
        status: i === 0 ? 'current' : 'pending',
      }))
      ctxAddLoadWithStops(loadData, stopsData)
    } else {
      ctxAddLoad(loadData)
    }
    setForm({ loadId: '', broker: '', origin: '', dest: '', miles: '', rate: '', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', driver: '', gross: 0, loadType: 'FTL', freightClass: '', palletCount: '', lengthInches: '', widthInches: '', heightInches: '', handlingUnit: 'pallet', stackable: false })
    setRouteData(null)
    setFormStops([
      { _key: Date.now(), sequence: 1, type: 'pickup', city: '', state: '', address: '', scheduled_date: '', contact_name: '', contact_phone: '', reference_number: '' },
      { _key: Date.now() + 1, sequence: 2, type: 'dropoff', city: '', state: '', address: '', scheduled_date: '', contact_name: '', contact_phone: '', reference_number: '' },
    ])
    setShowStopBuilder(false)
    setShowForm(false)
    showToast('', 'Load Added', autoId + ' · ' + origin + ' → ' + dest)
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
          {showForm ? '✕ Cancel' : '+ Add Load'}
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
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>A rate con (rate confirmation) is the contract from your broker with load details and agreed pay</div>
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
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', display:'flex', alignItems:'center', gap:6 }}><Ic icon={FileText} size={14} /> Rate Confirmation — Review & Confirm</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Rate con is the contract from the broker confirming load details and pay</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { document.getElementById('ratecon-input2').click() }}>
                Re-upload
              </button>
              <input id="ratecon-input2" type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { setShowForm(false); setForm({ loadId:'',broker:'',origin:'',dest:'',miles:'',rate:'',pickup:'',delivery:'',weight:'',commodity:'',refNum:'',driver:'',gross:0,loadType:'FTL',freightClass:'',palletCount:'',lengthInches:'',widthInches:'',heightInches:'',handlingUnit:'pallet',stackable:false }) }}>
                ✕ Cancel
              </button>
            </div>
          </div>
          {/* Load Type Selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>LOAD TYPE</div>
            <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {['FTL', 'LTL', 'Partial'].map(t => (
                <button key={t} onClick={() => setForm(fm => ({ ...fm, loadType: t }))}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                    fontFamily: "'DM Sans',sans-serif",
                    background: form.loadType === t
                      ? (t === 'FTL' ? 'var(--accent)' : t === 'LTL' ? '#3b82f6' : '#a855f7')
                      : 'var(--surface2)',
                    color: form.loadType === t ? '#fff' : 'var(--muted)',
                    transition: 'all 0.15s',
                  }}>
                  {t === 'FTL' ? 'Full Truckload' : t === 'LTL' ? 'Less Than Truckload' : 'Partial'}
                </button>
              ))}
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
              { key: 'equipment', label: 'Equipment',        ph: 'Dry Van', hint: 'Trailer type needed (dry van, reefer, flatbed, etc.)' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                {f.hint && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: -2, marginBottom: 4 }}>{f.hint}</div>}
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
              { key: 'rate',      label: 'Total Rate ($)', ph: '3500', hint: 'Total gross amount you\'ll receive for this load' },
              { key: 'miles',     label: calcMiles ? 'Calculating...' : 'Miles', ph: calcMiles ? '...' : '674' },
              { key: 'weight',    label: 'Weight (lbs)',   ph: '42000' },
              { key: 'commodity', label: 'Commodity',      ph: 'Auto Parts' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                {f.hint && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: -2, marginBottom: 4 }}>{f.hint}</div>}
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

          {/* LTL / Partial Fields — only shown when load type is not FTL */}
          {(form.loadType === 'LTL' || form.loadType === 'Partial') && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: form.loadType === 'LTL' ? '#3b82f6' : '#a855f7', letterSpacing: 1.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ic icon={Package} size={12} color={form.loadType === 'LTL' ? '#3b82f6' : '#a855f7'} /> {form.loadType} DETAILS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
                {/* Freight Class */}
                <div>
                  <label style={{ fontSize: 10, color: form.freightClass ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                    {form.freightClass ? '+ ' : ''}Freight Class
                  </label>
                  <select value={form.freightClass} onChange={e => setForm(fm => ({ ...fm, freightClass: e.target.value }))}
                    style={{ width: '100%', background: form.freightClass ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form.freightClass ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: form.freightClass ? 'var(--text)' : 'var(--muted)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }}>
                    <option value="">— Select —</option>
                    {FREIGHT_CLASSES.map(fc => <option key={fc} value={fc}>Class {fc}</option>)}
                  </select>
                </div>
                {/* Pallet Count */}
                <div>
                  <label style={{ fontSize: 10, color: form.palletCount ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                    {form.palletCount ? '+ ' : ''}Pallet Count
                  </label>
                  <input type="number" min="1" value={form.palletCount} onChange={e => setForm(fm => ({ ...fm, palletCount: e.target.value }))}
                    placeholder="6"
                    style={{ width: '100%', background: form.palletCount ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form.palletCount ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
                </div>
                {/* Handling Unit */}
                <div>
                  <label style={{ fontSize: 10, color: form.handlingUnit !== 'pallet' ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                    Handling Unit
                  </label>
                  <select value={form.handlingUnit} onChange={e => setForm(fm => ({ ...fm, handlingUnit: e.target.value }))}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box', textTransform: 'capitalize' }}>
                    {HANDLING_UNITS.map(hu => <option key={hu} value={hu} style={{ textTransform: 'capitalize' }}>{hu.charAt(0).toUpperCase() + hu.slice(1)}</option>)}
                  </select>
                </div>
                {/* Dimensions */}
                <div>
                  <label style={{ fontSize: 10, color: form.lengthInches ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                    {form.lengthInches ? '+ ' : ''}Length (in)
                  </label>
                  <input type="number" value={form.lengthInches} onChange={e => setForm(fm => ({ ...fm, lengthInches: e.target.value }))}
                    placeholder="48"
                    style={{ width: '100%', background: form.lengthInches ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form.lengthInches ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: form.widthInches ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                    {form.widthInches ? '+ ' : ''}Width (in)
                  </label>
                  <input type="number" value={form.widthInches} onChange={e => setForm(fm => ({ ...fm, widthInches: e.target.value }))}
                    placeholder="40"
                    style={{ width: '100%', background: form.widthInches ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form.widthInches ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: form.heightInches ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                    {form.heightInches ? '+ ' : ''}Height (in)
                  </label>
                  <input type="number" value={form.heightInches} onChange={e => setForm(fm => ({ ...fm, heightInches: e.target.value }))}
                    placeholder="48"
                    style={{ width: '100%', background: form.heightInches ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form.heightInches ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
                </div>
                {/* Stackable toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                  <label style={{ fontSize: 10, color: 'var(--muted)' }}>Stackable</label>
                  <button type="button" onClick={() => setForm(fm => ({ ...fm, stackable: !fm.stackable }))}
                    style={{
                      width: 42, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                      background: form.stackable ? 'var(--success)' : 'var(--border)', transition: 'background 0.2s',
                    }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3,
                      left: form.stackable ? 23 : 3, transition: 'left 0.2s',
                    }} />
                  </button>
                  <span style={{ fontSize: 11, color: form.stackable ? 'var(--success)' : 'var(--muted)' }}>{form.stackable ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Multi-Stop Builder */}
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: showStopBuilder ? 'var(--accent)' : 'var(--muted)' }}
              onClick={() => setShowStopBuilder(!showStopBuilder)}>
              <Ic icon={MapPin} size={12} /> {showStopBuilder ? 'Hide Stops' : 'Multi-Stop Load'}
            </button>
            {!showStopBuilder && <span style={{ fontSize: 10, color: 'var(--muted)' }}>Add multiple pickup/delivery stops</span>}
          </div>
          {showStopBuilder && <StopBuilder stops={formStops} setStops={setFormStops} />}

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
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, fontSize: 12, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>Gross: <b style={{ color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18 }}>${parseFloat(form.rate||0).toLocaleString(undefined,{maximumFractionDigits:0})}</b> <span style={{ fontSize: 9, color: 'var(--muted)' }}>total pay</span></span>
              {form.miles && <span>RPM: <b style={{ color: 'var(--accent2)' }}>${(parseFloat(form.rate||0) / parseFloat(form.miles||1)).toFixed(2)}</b>/mi <span style={{ fontSize: 9, color: 'var(--muted)' }}>rate per mile</span></span>}
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
                ...(invoicePayTerms === 'Same Day Pay' ? [{ label:'QuickPay Fee (2.5%)', value: '−$' + Math.round(invoiceLoad.gross * 0.025).toLocaleString(), main:false, danger:true }] : []),
                { label:'TOTAL DUE', value: '$' + (invoicePayTerms === 'Same Day Pay' ? Math.round(invoiceLoad.gross * 0.975) : invoiceLoad.gross).toLocaleString(undefined,{maximumFractionDigits:0}), main:true },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding: item.main ? '10px 0 0' : '6px 0', borderTop: item.main ? '2px solid var(--border)' : 'none', marginTop: item.main ? 6 : 0 }}>
                  <span style={{ fontSize: item.main ? 14 : 12, fontWeight: item.main ? 800 : 400, color: item.main ? 'var(--text)' : 'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: item.main ? 26 : 18, color: item.danger ? 'var(--danger)' : item.main ? 'var(--accent)' : 'var(--text)' }}>{item.value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom:16, padding:'10px 14px', background:'var(--surface2)', borderRadius:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:6, letterSpacing:1 }}>PAYMENT TERMS</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                {['Same Day Pay','Net 15','Net 30','Net 45','Biweekly'].map(term => (
                  <button key={term} onClick={() => setInvoicePayTerms(term)}
                    style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', border: invoicePayTerms === term ? '1.5px solid var(--accent)' : '1px solid var(--border)', background: invoicePayTerms === term ? 'rgba(240,165,0,0.1)' : 'var(--surface)', color: invoicePayTerms === term ? 'var(--accent)' : 'var(--muted)' }}>
                    {term}
                  </button>
                ))}
              </div>
              {invoicePayTerms === 'Same Day Pay' && (
                <div style={{ fontSize:10, color:'var(--accent)', fontWeight:600 }}>QuickPay — 2.5% factoring fee applied for same-day payment</div>
              )}
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                Please reference invoice number {`INV-${String(invoiceLoad.id).slice(-4).padStart(4,'0')}`} on payment.
              </div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={async () => {
                const invId = 'INV-' + String(invoiceLoad.id).slice(-4).padStart(4,'0')
                const brokerEmail = invoiceLoad.broker_email || invoiceLoad.brokerEmail || ''
                const invAmount = invoicePayTerms === 'Same Day Pay' ? Math.round(invoiceLoad.gross * 0.975) : invoiceLoad.gross
                if (brokerEmail) {
                  try {
                    await apiFetch('/api/send-invoice', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        to: brokerEmail,
                        carrierName: company?.company_name || company?.name || 'Carrier',
                        invoiceNumber: invId,
                        loadNumber: invoiceLoad.loadId || invoiceLoad.load_number || '',
                        route: `${(invoiceLoad.origin||'').split(',')[0]} → ${(invoiceLoad.dest||'').split(',')[0]}`,
                        amount: invAmount,
                        dueDate: invoicePayTerms === 'Same Day Pay' ? 'Same Day' : invoicePayTerms,
                        brokerName: invoiceLoad.broker || '',
                      }),
                    })
                    showToast('','Invoice Emailed', `Sent to ${brokerEmail} · $${invAmount.toLocaleString()}`)
                  } catch {
                    showToast('','Email Failed', 'Invoice marked but email could not be sent')
                  }
                } else {
                  showToast('','Invoice Created', `${invoiceLoad.broker} · $${invAmount.toLocaleString()} · ${invoicePayTerms} (no broker email on file)`)
                }
                ctxUpdateStatus(invoiceLoad.id || invoiceLoad.loadId, 'Invoiced')
                setInvoiceLoad(null)
              }}><Ic icon={FileText} size={14} /> Send to Broker</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => {
                const invId = 'INV-' + String(invoiceLoad.id).slice(-4).padStart(4,'0')
                const route = invoiceLoad.origin?.split(',')[0]?.substring(0,3)?.toUpperCase() + ' → ' + invoiceLoad.dest?.split(',')[0]?.substring(0,3)?.toUpperCase()
                const invDate = new Date()
                const dueLabel = invoicePayTerms === 'Same Day Pay' ? 'Same Day' : invoicePayTerms
                const invAmount = invoicePayTerms === 'Same Day Pay' ? Math.round(invoiceLoad.gross * 0.975) : invoiceLoad.gross
                generateInvoicePDF({ id: invId, loadId: invoiceLoad.loadId, broker: invoiceLoad.broker, route, amount: invAmount, date: invDate.toLocaleDateString('en-US',{month:'short',day:'numeric'}), dueDate: dueLabel, driver: invoiceLoad.driver, status: invoicePayTerms === 'Same Day Pay' ? 'QuickPay' : 'Unpaid', paymentTerms: invoicePayTerms })
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
          No booked loads yet. Click <b>+ Add Load</b> to log your first confirmed load.
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
                  {load.load_type === 'LTL' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' }}>LTL</span>}
                  {load.load_type === 'Partial' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' }}>Partial</span>}
                  {load.consolidation_id && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(240,165,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(240,165,0,0.25)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Ic icon={Layers} size={9} /> Consolidated</span>}
                  {(load.stopCount || 0) > 2 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(240,165,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(240,165,0,0.25)' }}>{load.stopCount} stops</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {load.loadId} · {load.broker} · {load.miles.toLocaleString()} mi · {load.commodity}
                  {load.driver ? <span> · <b style={{ color: 'var(--accent2)' }}>{load.driver}</b>{load.co_driver_name ? <span style={{ color: 'var(--accent2)' }}> + {load.co_driver_name}</span> : ''}</span> : <span style={{ color: 'var(--warning)' }}> · No driver assigned</span>}
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

                {/* LTL / Partial details */}
                {(load.load_type === 'LTL' || load.load_type === 'Partial') && (
                  <div style={{ background: load.load_type === 'LTL' ? 'rgba(59,130,246,0.04)' : 'rgba(168,85,247,0.04)', border: `1px solid ${load.load_type === 'LTL' ? 'rgba(59,130,246,0.2)' : 'rgba(168,85,247,0.2)'}`, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: load.load_type === 'LTL' ? '#3b82f6' : '#a855f7', letterSpacing: 1.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Ic icon={Package} size={12} color={load.load_type === 'LTL' ? '#3b82f6' : '#a855f7'} /> {load.load_type} DETAILS
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
                      {load.freight_class && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Freight Class</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{load.freight_class}</div>
                        </div>
                      )}
                      {load.pallet_count && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Pallets</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{load.pallet_count}</div>
                        </div>
                      )}
                      {load.handling_unit && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Handling Unit</div>
                          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{load.handling_unit}</div>
                        </div>
                      )}
                      {(load.length_inches || load.width_inches || load.height_inches) && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Dimensions (L x W x H)</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{load.length_inches || '—'}" x {load.width_inches || '—'}" x {load.height_inches || '—'}"</div>
                        </div>
                      )}
                      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Stackable</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: load.stackable ? 'var(--success)' : 'var(--muted)' }}>{load.stackable ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stop Timeline (multi-stop loads) */}
                {load.stops && load.stops.length > 0 && (
                  <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
                    <StopTimeline stops={load.stops} />
                  </div>
                )}

                {/* Assign driver (supports team — primary + co-driver) */}
                {!load.driver && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:4 }}><Ic icon={AlertTriangle} size={12} color="var(--warning)" /> Assign driver:</span>
                      {driverNames.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>No drivers added yet</span>}
                      {driverNames.map(d => (
                        <button key={d} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => assignDriver(load.loadId, d)}>{d}</button>
                      ))}
                    </div>
                    {driverNames.length >= 2 && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingLeft: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Team dispatch:</span>
                        {driverNames.map((d, i) => {
                          // Pair each driver with every other driver
                          return driverNames.slice(i + 1).map(d2 => (
                            <button key={d+d2} className="btn btn-ghost" style={{ fontSize: 10, padding: '4px 8px', border: '1px solid var(--accent2)', borderRadius: 6 }}
                              onClick={() => assignDriver(load.loadId, d, d2)}>
                              {d.split(' ')[0]} + {d2.split(' ')[0]}
                            </button>
                          ))
                        })}
                      </div>
                    )}
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

      {/* ── Consolidation Panel ── */}
      <ConsolidationPanel
        loads={bookedLoads}
        consolidations={consolidations}
        addConsolidation={addConsolidation}
        editConsolidation={editConsolidation}
        updateLoadStatus={ctxUpdateStatus}
        showToast={showToast}
      />

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
