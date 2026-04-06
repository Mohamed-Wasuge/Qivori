import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { createLoad } from '../../lib/database'
import { apiFetch } from '../../lib/api'
import {
  Package, Truck, CheckCircle, MapPin,
  Zap, Bot, FileText, Plus, Trash2
} from 'lucide-react'
import { Ic, panel, panelHead } from './helpers'

export function BrokerPostLoad() {
  const { showToast, navigatePage, user } = useApp()
  const [loadType, setLoadType] = useState('FTL')
  const [stops, setStops] = useState([])
  const [posting, setPosting] = useState(false)
  const [rateCon, setRateCon] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const fileRef = useRef(null)

  // Form fields
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [equipment, setEquipment] = useState('Dry Van')
  const [weight, setWeight] = useState('')
  const [rate, setRate] = useState('')
  const [notes, setNotes] = useState('')
  const [commodity, setCommodity] = useState('')

  const compressImg = (file) => new Promise((resolve) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const reader = new FileReader()
      reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: 'application/pdf' })
      reader.readAsDataURL(file)
      return
    }
    const img = new Image()
    img.onload = () => {
      const maxW = 1200
      let w = img.width, h = img.height
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve({ b64: c.toDataURL('image/jpeg', 0.85).split(',')[1], mt: 'image/jpeg' })
    }
    img.onerror = () => {
      const reader = new FileReader()
      reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: file.type || 'image/jpeg' })
      reader.readAsDataURL(file)
    }
    img.src = URL.createObjectURL(file)
  })

  const parseRateCon = async (file) => {
    setParsing(true)
    showToast('', 'Reading Rate Con', 'Compressing and sending to AI...')
    try {
      const { b64: base64, mt: mediaType } = await compressImg(file)

      const res = await apiFetch('/api/parse-ratecon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64, mediaType })
      })

      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch {
        showToast('', 'Parse Error', 'Server returned invalid response')
        setParsing(false)
        return
      }

      if (data.error) {
        showToast('', 'Parse Error', data.error)
        setParsing(false)
        return
      }

      // Auto-fill form fields
      if (data.origin) setOrigin(data.origin)
      if (data.destination) setDestination(data.destination)
      if (data.rate) setRate(String(data.rate))
      if (data.weight) setWeight(String(data.weight))
      if (data.equipment) setEquipment(data.equipment)
      if (data.pickup_date) setPickupDate(data.pickup_date)
      if (data.delivery_date) setDeliveryDate(data.delivery_date)
      if (data.notes) setNotes(data.notes)
      if (data.load_type) setLoadType(data.load_type)

      showToast('', 'Rate Con Parsed', 'Form auto-filled — review and post')
    } catch (e) {
      showToast('', 'Error', 'Failed to parse rate con')
    }
    setParsing(false)
  }

  const handleFile = (file) => {
    if (file && /\.(pdf|png|jpg|jpeg)$/i.test(file.name)) {
      setRateCon(file)
      parseRateCon(file)
    } else if (file) {
      showToast('', 'Invalid File', 'Only PDF, PNG, or JPG files are accepted')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const addStop = () => setStops(s => [...s, { city: '', date: '', type: 'Pickup', notes: '' }])
  const removeStop = (i) => setStops(s => s.filter((_, idx) => idx !== i))
  const updateStop = (i, field, val) => setStops(s => s.map((st, idx) => idx === i ? { ...st, [field]: val } : st))

  const submit = async () => {
    if (!origin || !destination || !rate) {
      showToast('', 'Missing Fields', 'Origin, destination, and rate are required')
      return
    }
    setPosting(true)

    const loadId = 'QV-' + Math.floor(1000 + Math.random() * 9000)
    let rateConUrl = null

    // Upload rate confirmation if provided
    if (rateCon) {
      const ext = rateCon.name.split('.').pop()
      const path = `ratecons/${loadId}-${Date.now()}.${ext}`
      const { data: upData, error: upErr } = await supabase.storage.from('documents').upload(path, rateCon)
      if (upErr) {
        showToast('', 'Upload Error', 'Rate con upload failed — posting without it')
      } else {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        rateConUrl = urlData?.publicUrl || null
      }
    }

    try {
      await createLoad({
        load_id: loadId,
        origin,
        destination,
        rate: parseFloat(rate.replace(/[^0-9.]/g, '')),
        load_type: loadType,
        equipment,
        weight: weight || null,
        status: 'open',
        pickup_date: pickupDate || null,
        delivery_date: deliveryDate || null,
        broker_name: user?.email?.split('@')[0] || 'Broker',
        notes: notes || null,
        rate_con_url: rateConUrl,
      })
    } catch (error) {
      setPosting(false)
      showToast('', 'Error', 'Failed to post load: ' + error.message)
      return
    }
    setPosting(false)

    // Auto-match: score carriers and notify top 3
    apiFetch('/api/auto-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loadId, origin, destination, rate, equipment, brokerName: user?.email?.split('@')[0] || 'Broker' }),
    }).then(r => r.json()).then(data => {
      if (data.matches?.length > 0) {
        showToast('', 'AI Matched', `Notified ${data.matches.length} carriers — top score: ${data.matches[0].score}/100`)
      }
    }).catch(() => {})

    showToast('', 'Load Posted', `${loadId} — ${origin} to ${destination} is live`)
    setTimeout(() => navigatePage('broker-loads'), 1500)
  }

  const LOAD_TYPES = [
    { id: 'FTL', label: 'Full Truckload', sub: '44,000+ lbs · Dedicated truck' },
    { id: 'LTL', label: 'Less Than Truckload', sub: 'Under 15,000 lbs · Shared space' },
    { id: 'Partial', label: 'Partial Load', sub: '15,000–35,000 lbs · Partial trailer' },
  ]

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', paddingBottom: 40 }}>
      <div style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, letterSpacing: 2, marginBottom: 4 }}>POST A LOAD</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Carriers on the platform can book your load with one click. You will see their full profile instantly.</div>
        </div>

        {/* ── Load Type Selector ── */}
        <div style={{ ...panel, marginBottom: 14 }}>
          <div style={panelHead}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Truck} size={14} /> Load Type</span>
          </div>
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {LOAD_TYPES.map(t => {
              const active = loadType === t.id
              return (
                <div key={t.id} onClick={() => setLoadType(t.id)}
                  style={{
                    padding: '14px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                    background: active ? 'rgba(240,165,0,0.08)' : 'var(--surface2)',
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    transition: 'all 0.15s'
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text)', marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{t.sub}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Rate Confirmation Upload (compact, top) ── */}
        <div style={{ ...panel, marginBottom: 14 }}>
          <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}><Ic icon={FileText} size={14} /> Rate Confirmation</span>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }} />
            {rateCon ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {parsing ? (
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                    Reading {rateCon.name}...
                  </span>
                ) : (
                  <>
                    <Ic icon={CheckCircle} size={14} color="var(--success)" />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{rateCon.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>({(rateCon.size / 1024).toFixed(0)} KB)</span>
                    <button className="btn btn-ghost" style={{ fontSize: 10, color: 'var(--danger)', padding: '2px 6px' }} onClick={() => { setRateCon(null); fileRef.current.value = '' }}>
                      <Ic icon={Trash2} size={11} />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                style={{
                  padding: '8px 16px', border: `1px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8,
                  background: dragging ? 'rgba(240,165,0,0.06)' : 'transparent'
                }}>
                <Ic icon={FileText} size={14} color={dragging ? 'var(--accent)' : 'var(--muted)'} />
                <span style={{ fontSize: 11, color: dragging ? 'var(--accent)' : 'var(--muted)' }}>
                  {dragging ? 'Drop here' : 'Drag & drop or click to upload'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Load Details ── */}
        <div style={{ ...panel, marginBottom: 14 }}>
          <div style={panelHead}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Package} size={14} /> Load Details</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group"><label className="form-label">Origin City *</label><input className="form-input" placeholder="e.g. Atlanta, GA" value={origin} onChange={e => setOrigin(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Final Destination *</label><input className="form-input" placeholder="e.g. Chicago, IL" value={destination} onChange={e => setDestination(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Pickup Date</label><input className="form-input" type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Delivery Date</label><input className="form-input" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Equipment Type</label>
                <select className="form-input" value={equipment} onChange={e => setEquipment(e.target.value)}><option>Dry Van</option><option>Reefer</option><option>Flatbed</option><option>Step Deck</option><option>Power Only</option><option>Conestoga</option><option>Hotshot</option></select>
              </div>
              <div className="form-group"><label className="form-label">Weight (lbs)</label><input className="form-input" placeholder={loadType === 'LTL' ? 'e.g. 8,500' : 'e.g. 42,000'} value={weight} onChange={e => setWeight(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Rate ($) *</label><input className="form-input" placeholder="e.g. 3,200" value={rate} onChange={e => setRate(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Commodity</label><input className="form-input" placeholder="e.g. General Freight" value={commodity} onChange={e => setCommodity(e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label">Special Instructions</label>
              <textarea className="form-input" rows={3} placeholder="e.g. No touch freight, appointment required, driver assist" style={{ resize: 'vertical', fontFamily: "'DM Sans', sans-serif" }} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Multi-Stop ── */}
        <div style={{ ...panel, marginBottom: 14 }}>
          <div style={panelHead}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={MapPin} size={14} /> Stops ({stops.length})</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} onClick={addStop}>
              <Ic icon={Plus} size={12} /> Add Stop
            </button>
          </div>
          {stops.length === 0 ? (
            <div style={{ padding: '20px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              No extra stops — direct origin to destination. Click "Add Stop" for multi-stop routes.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stops.map((stop, i) => (
                <div key={i} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', flexShrink: 0, marginTop: 20 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{i + 1}</span>
                  </div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group"><label className="form-label">City</label><input className="form-input" value={stop.city} onChange={e => updateStop(i, 'city', e.target.value)} placeholder="e.g. Nashville, TN" /></div>
                    <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={stop.date} onChange={e => updateStop(i, 'date', e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Stop Type</label>
                      <select className="form-input" value={stop.type} onChange={e => updateStop(i, 'type', e.target.value)}><option>Pickup</option><option>Delivery</option><option>Pickup & Delivery</option></select>
                    </div>
                    <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={stop.notes} onChange={e => updateStop(i, 'notes', e.target.value)} placeholder="e.g. Dock hours 7AM–3PM" /></div>
                  </div>
                  <button onClick={() => removeStop(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4, marginTop: 20, flexShrink: 0 }}><Ic icon={Trash2} size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── AI Rate Suggestion ── */}
        <div style={{ background: 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.04))', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Ic icon={Bot} size={12} /> AI Suggested Rate</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 42, color: 'var(--accent)', lineHeight: 1 }}>$3,200</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--accent2)' }}>$2.94/mi · Based on 847 recent loads</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Competitive for this lane</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Market avg $3,140 · 12 carriers available · Avg booking time: 8 min</div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={submit} disabled={posting}
          style={{ width: '100%', padding: 14, fontSize: 15, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8, opacity: posting ? 0.7 : 1 }}>
          <Ic icon={Zap} size={16} /> {posting ? 'Posting...' : `Post ${loadType} Load${stops.length > 0 ? ` · ${stops.length + 2} Stops` : ''}`}
        </button>
      </div>
    </div>
  )
}
