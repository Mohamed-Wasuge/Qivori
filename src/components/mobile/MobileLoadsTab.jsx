import { useState, useRef } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, Truck, ChevronRight, ChevronDown, ScanLine, Camera, Plus,
  MapPin, Clock, DollarSign, CheckCircle, ArrowRight, Filter, X, FileText
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor } from './shared'
import { apiFetch } from '../../lib/api'

const STATUS_FILTERS = ['All', 'Booked', 'Dispatched', 'In Transit', 'Delivered', 'Invoiced', 'Paid']
const STATUS_FLOW = ['Rate Con Received', 'Booked', 'Dispatched', 'En Route to Pickup', 'At Pickup', 'Loaded', 'In Transit', 'At Delivery', 'Delivered', 'Invoiced', 'Paid']

export default function MobileLoadsTab() {
  const ctx = useCarrier() || {}
  const { showToast } = useApp()
  const loads = ctx.loads || []
  const updateLoadStatus = ctx.updateLoadStatus || (() => {})
  const addLoad = ctx.addLoad || (() => {})
  const [filter, setFilter] = useState('All')
  const [expandedId, setExpandedId] = useState(null)
  const [scanning, setScanning] = useState(false)
  const rateConRef = useRef(null)
  const [showAddLoad, setShowAddLoad] = useState(false)
  const [newLoad, setNewLoad] = useState({ origin: '', destination: '', miles: '', rate: '', broker: '', equipment: 'Dry Van', pickup: '', delivery: '', weight: '', commodity: '', refNum: '' })

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
      status: 'Booked',
      load_type: 'FTL',
    })
    haptic('success')
    showToast?.('success', 'Load Added', `${newLoad.origin} → ${newLoad.destination}`)
    setNewLoad({ origin: '', destination: '', miles: '', rate: '', broker: '', equipment: 'Dry Van', pickup: '', delivery: '', weight: '', commodity: '', refNum: '' })
    setShowAddLoad(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header with Snap Rate Con */}
      <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Loads</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{loads.length} total · {loads.filter(l => !['Delivered', 'Invoiced', 'Paid', 'Cancelled'].includes(l.status)).length} active</div>
        </div>
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
        <input ref={rateConRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleRateConPhoto(f); e.target.value = '' }} />
      </div>

      {/* Status filter chips */}
      <div style={{ flexShrink: 0, padding: '0 16px 8px', display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {STATUS_FILTERS.map(s => {
          const isActive = filter === s
          const count = s === 'All' ? loads.length : loads.filter(l => {
            const st = (l.status || '').toLowerCase()
            return st.includes(s.toLowerCase()) || (s === 'In Transit' && (st.includes('loaded') || st.includes('en route')))
          }).length
          return (
            <button key={s} onClick={() => { haptic(); setFilter(s) }}
              style={{ padding: '6px 12px', borderRadius: 20, background: isActive ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, color: isActive ? '#000' : 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>
              {s} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {showAddLoad && (
        <div style={{ margin: '0 16px 10px', background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 12, padding: '14px' }}>
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
          </div>
          <button onClick={saveNewLoad}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif" }}>
            Book Load
          </button>
        </div>
      )}

      {/* Load cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            <Ic icon={Package} size={40} color="var(--border)" />
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>No loads found</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Snap a rate con or ask the AI to find loads</div>
          </div>
        )}

        {filtered.map(load => {
          const isExpanded = expandedId === (load.id || load.load_id)
          const currentIdx = STATUS_FLOW.findIndex(s => s.toLowerCase() === (load.status || '').toLowerCase())
          const canAdvance = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1
          const nextStatus = canAdvance ? STATUS_FLOW[currentIdx + 1] : null

          return (
            <div key={load.id || load.load_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
              {/* Card header */}
              <div onClick={() => { haptic(); setExpandedId(isExpanded ? null : (load.id || load.load_id)) }}
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

                  {/* Documents */}
                  <div style={{ padding: '0 14px 10px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 6 }}>DOCUMENTS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['Rate Con', 'BOL', 'Signed BOL', 'POD'].map(docType => {
                        const docKey = docType.toLowerCase().replace(/\s/g, '_')
                        const hasDoc = load.documents?.[docKey] || load[docKey + '_url']
                        return (
                          <div key={docType} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: hasDoc ? 'rgba(0,212,170,0.08)' : 'var(--bg)', border: `1px solid ${hasDoc ? 'rgba(0,212,170,0.2)' : 'var(--border)'}`, borderRadius: 8, fontSize: 10, fontWeight: 600, color: hasDoc ? 'var(--success)' : 'var(--muted)' }}>
                            <Ic icon={hasDoc ? CheckCircle : FileText} size={10} />
                            {docType}
                          </div>
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
                </div>
              )}
            </div>
          )
        })}

        <div style={{ height: 20 }} />
      </div>
    </div>
  )
}
