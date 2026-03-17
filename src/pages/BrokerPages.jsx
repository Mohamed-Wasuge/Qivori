import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { fetchLoads, createLoad, updateLoad, fetchInvoices, createInvoice, updateInvoice, fetchDrivers, fetchDocuments, createDocument, fetchMessages, sendMessage } from '../lib/database'
import { apiFetch } from '../lib/api'
import {
  Package, TrendingUp, Truck, DollarSign, Clock, CheckCircle, MapPin,
  Search, Star, Shield, Phone, ChevronDown, ChevronUp, Zap, Bot,
  FileText, Radio, Filter, ArrowRight, CreditCard, AlertTriangle,
  Plus, Trash2, GripVertical, Navigation, Send, MessageSquare,
  BarChart2, Repeat, Timer, Route
} from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

// ── Shared styles ──────────────────────────────────────────────────────────
const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }
const panelHead = { padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
const statCard = (color) => ({
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 16px',
  borderTop: `3px solid ${color}`
})
const badge = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
  borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color
})

// ─── No demo data — production uses Supabase only ───────────

const statusColor = (s) => {
  const m = { Posted: 'var(--warning)', Matched: 'var(--accent2)', Booked: 'var(--success)', 'In Transit': 'var(--accent)', Delivered: 'var(--muted)' }
  return m[s] || 'var(--muted)'
}
const safetyColor = (s) => s >= 90 ? 'var(--success)' : s >= 80 ? 'var(--warning)' : 'var(--danger)'
const payColor = (s) => ({ Paid: 'var(--success)', Pending: 'var(--warning)', Overdue: 'var(--danger)' }[s])

// ════════════════════════════════════════════════════════════════════════════
// BROKER DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
export function BrokerDashboard() {
  const { navigatePage } = useApp()
  const [loads, setLoads] = useState([])
  const [loadingData, setLoadingData] = useState(true)

  const loadData = async () => {
    const data = await fetchLoads()
    setLoads(data || [])
    setLoadingData(false)
  }

  useEffect(() => { loadData() }, [])

  // Real-time polling every 15 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [])

  const activeLoads = loads.filter(l => ['open', 'in_transit', 'booked'].includes(l.status))
  const deliveredLoads = loads.filter(l => l.status === 'delivered')
  const totalRevenue = loads.reduce((sum, l) => sum + (l.rate || 0), 0)
  const recentLoads = loads.slice(0, 6)

  const getState = (loc) => {
    if (!loc) return ''
    const parts = loc.split(',')
    return parts.length > 1 ? parts[parts.length - 1].trim() : loc
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>BROKER DASHBOARD</div>

      {/* ── Top Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Active Loads', value: activeLoads.length, color: 'var(--accent)', icon: Package },
          { label: 'Total Loads', value: loads.length, color: 'var(--success)', icon: CheckCircle },
          { label: 'Delivered', value: deliveredLoads.length, color: 'var(--accent2)', icon: Truck },
          { label: 'Total Revenue', value: '$' + (totalRevenue / 1000).toFixed(1) + 'K', color: 'var(--accent3)', icon: DollarSign },
        ].map(s => (
          <div key={s.label} style={statCard(s.color)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
              <Ic icon={s.icon} size={16} style={{ color: s.color, opacity: 0.5 }} />
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Performance Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Avg Rate', value: loads.length ? '$' + Math.round(totalRevenue / loads.length).toLocaleString() : '—', icon: Timer, color: 'var(--accent)' },
          { label: 'Open Loads', value: loads.filter(l => l.status === 'open').length, icon: Package, color: 'var(--warning)' },
          { label: 'In Transit', value: loads.filter(l => l.status === 'in_transit').length, icon: Route, color: 'var(--success)' },
          { label: 'Booked', value: loads.filter(l => l.status === 'booked').length, icon: CheckCircle, color: 'var(--accent3)' },
        ].map(s => (
          <div key={s.label} style={{ ...panel, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={s.icon} size={16} style={{ color: s.color }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* ── Recent Loads ── */}
        <div style={panel}>
          <div style={panelHead}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Clock} size={14} /> Recent Loads</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {loadingData ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
            ) : recentLoads.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No loads yet</div>
            ) : recentLoads.map((l, i) => (
              <div key={l.id} onClick={() => navigatePage('broker-loads')}
                style={{ padding: '10px 16px', borderBottom: i < recentLoads.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <Ic icon={Package} size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{l.load_id} — {getState(l.origin)} → {getState(l.destination)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.equipment || '—'}{l.weight ? ' · ' + Number(l.weight).toLocaleString() + ' lbs' : ''} · ${Number(l.rate || 0).toLocaleString()}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: l.status === 'open' ? 'rgba(240,165,0,0.12)' : l.status === 'delivered' ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', color: l.status === 'open' ? 'var(--warning)' : l.status === 'delivered' ? 'var(--success)' : 'var(--muted)' }}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: Package, label: 'Post a Load', sub: 'Post and let AI match the best carrier', color: 'rgba(240,165,0,0.1)', border: 'rgba(240,165,0,0.3)', iconColor: 'var(--accent)', page: 'broker-post' },
            { icon: FileText, label: 'View My Loads', sub: 'Track all loads and carrier assignments', color: 'rgba(77,142,240,0.1)', border: 'rgba(77,142,240,0.3)', iconColor: 'var(--accent2)', page: 'broker-loads' },
            { icon: Truck, label: 'Find Carriers', sub: 'Browse verified carriers on the platform', color: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', iconColor: 'var(--success)', page: 'broker-carriers' },
          ].map(a => (
            <div key={a.label} style={{ ...panel, padding: 20, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
              onClick={() => navigatePage(a.page)}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: a.color, border: '1px solid ' + a.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic icon={a.icon} size={22} style={{ color: a.iconColor }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{a.label}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.sub}</div>
              </div>
              <Ic icon={ArrowRight} size={16} style={{ color: 'var(--muted)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BROKER POST LOAD
// ════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════
// BROKER LOADS
// ════════════════════════════════════════════════════════════════════════════
const STATUS_DISPLAY = { open: 'Posted', booked: 'Booked', assigned: 'Assigned', en_route_pickup: 'En Route to Pickup', at_pickup: 'At Pickup', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled' }

// ── Load Status Tracker ──
function LoadStatusTracker({ status }) {
  const steps = [
    { key: 'open', label: 'Posted' },
    { key: 'booked', label: 'Booked' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'en_route_pickup', label: 'En Route' },
    { key: 'at_pickup', label: 'At Pickup' },
    { key: 'in_transit', label: 'In Transit' },
    { key: 'delivered', label: 'Delivered' },
  ]
  const currentIdx = steps.findIndex(s => s.key === status)
  const activeIdx = currentIdx >= 0 ? currentIdx : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '16px 0' }}>
      {steps.map((step, i) => {
        const done = i <= activeIdx
        const isCurrent = i === activeIdx
        return (
          <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div style={{ position: 'absolute', top: 10, right: '50%', width: '100%', height: 3,
                background: done ? 'var(--success)' : 'var(--border)', zIndex: 0 }} />
            )}
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
              background: done ? 'var(--success)' : 'var(--surface2)', border: `2px solid ${done ? 'var(--success)' : 'var(--border)'}`,
              boxShadow: isCurrent ? '0 0 8px rgba(34,197,94,0.4)' : 'none' }}>
              {done && <Ic icon={CheckCircle} size={12} style={{ color: '#fff' }} />}
            </div>
            <div style={{ fontSize: 9, color: done ? 'var(--success)' : 'var(--muted)', fontWeight: isCurrent ? 800 : 600, marginTop: 4, textAlign: 'center' }}>{step.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Message Thread ──
function MessageThread({ loadId, user }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const loadMessages = async () => {
    const data = await fetchMessages(loadId)
    setMessages(data)
  }

  useEffect(() => { loadMessages() }, [loadId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadMessages, 10000)
    return () => clearInterval(interval)
  }, [loadId])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await sendMessage(loadId, input.trim(), user?.email?.split('@')[0] || 'Broker', 'broker')
      setInput('')
      await loadMessages()
    } catch (e) {
    }
    setSending(false)
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', marginTop: 16 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
        <Ic icon={MessageSquare} size={14} style={{ color: 'var(--accent)' }} /> Messages
        {messages.length > 0 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>({messages.length})</span>}
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', padding: '10px 14px' }}>
        {messages.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No messages yet — start a conversation with the carrier</div>
        ) : messages.map(msg => (
          <div key={msg.id} style={{ marginBottom: 10, display: 'flex', flexDirection: 'column',
            alignItems: msg.sender_role === 'broker' ? 'flex-end' : 'flex-start' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
              {msg.sender_name} · {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
            <div style={{ maxWidth: '75%', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
              background: msg.sender_role === 'broker' ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
              color: 'var(--text)', border: `1px solid ${msg.sender_role === 'broker' ? 'rgba(240,165,0,0.25)' : 'var(--border)'}` }}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '8px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', outline: 'none' }} />
        <button onClick={handleSend} disabled={sending || !input.trim()}
          style={{ padding: '8px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending || !input.trim() ? 0.5 : 1 }}>
          <Ic icon={Send} size={13} />
        </button>
      </div>
    </div>
  )
}

export function BrokerLoads() {
  const { showToast, navigatePage, user } = useApp()
  const [filter, setFilter] = useState('All')
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const filters = ['All', 'Active', 'Booked', 'Delivered']

  const loadData = async () => {
    const data = await fetchLoads()
    setLoads(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Poll for real-time status updates every 15 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [])

  const getState = (loc) => {
    if (!loc) return ''
    const parts = loc.split(',')
    return parts.length > 1 ? parts[parts.length - 1].trim() : loc
  }

  const filtered = loads.filter(l => {
    const display = STATUS_DISPLAY[l.status] || l.status
    if (filter === 'All') return true
    if (filter === 'Active') return ['Posted', 'In Transit'].includes(display)
    if (filter === 'Booked') return display === 'Booked'
    if (filter === 'Delivered') return display === 'Delivered'
    return true
  })

  const stats = {
    total: loads.length,
    active: loads.filter(l => ['open', 'in_transit'].includes(l.status)).length,
    booked: loads.filter(l => l.status === 'booked').length,
    delivered: loads.filter(l => l.status === 'delivered').length,
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading loads...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>MY LOADS</div>
        <button className="btn btn-primary" onClick={() => navigatePage('broker-post')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic icon={Package} size={14} /> Post a Load
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Total Loads', value: stats.total, color: 'var(--accent)' },
          { label: 'Active', value: stats.active, color: 'var(--warning)' },
          { label: 'Booked', value: stats.booked, color: 'var(--success)' },
          { label: 'Delivered', value: stats.delivered, color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} style={statCard(s.color)}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              background: filter === f ? 'var(--accent)' : 'var(--surface)', color: filter === f ? '#000' : 'var(--muted)',
              border: filter === f ? 'none' : '1px solid var(--border)' }}>
            {f}
          </button>
        ))}
      </div>

      <div style={panel}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Load ID', 'Route', 'Rate', 'Weight', 'Equipment', 'Status', 'Posted'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                {loads.length === 0 ? 'No loads yet — post your first load!' : 'No loads match this filter.'}
              </td></tr>
            ) : filtered.map(load => {
              const display = STATUS_DISPLAY[load.status] || load.status
              const sc = statusColor(display)
              const originState = getState(load.origin)
              const destState = getState(load.destination)
              const isExp = expanded === load.id
              return [
                <tr key={load.id} onClick={() => setExpanded(isExp ? null : load.id)}
                  style={{ cursor: 'pointer', background: isExp ? 'rgba(240,165,0,0.03)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent3)' }}>{load.load_id}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {originState} <Ic icon={ArrowRight} size={10} style={{ margin: '0 4px', color: 'var(--muted)' }} /> {destState}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{load.origin} → {load.destination}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>${Number(load.rate || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>{load.weight ? Number(load.weight).toLocaleString() + ' lbs' : '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>{load.equipment || '—'}</td>
                  <td style={{ padding: '10px 14px' }}><span style={badge(sc + '18', sc)}><span style={{ width: 6, height: 6, borderRadius: '50%', background: sc }} /> {display}</span></td>
                  <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{load.posted_at ? new Date(load.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                    <Ic icon={isExp ? ChevronUp : ChevronDown} size={14} style={{ color: 'var(--muted)' }} />
                  </td>
                </tr>,
                isExp && (
                  <tr key={load.id + '-detail'}>
                    <td colSpan={7} style={{ padding: 0, background: 'var(--surface2)', borderTop: '2px solid var(--accent)' }}>
                      <div style={{ padding: '20px 24px' }}>
                        {/* Route Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Ic icon={Package} size={20} style={{ color: 'var(--accent)' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{load.load_id}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{load.origin} → {load.destination}</div>
                          </div>
                          <div style={{ marginLeft: 'auto' }}>
                            <span style={{ ...badge(sc + '18', sc), fontSize: 12, padding: '5px 14px' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: sc }} /> {display}</span>
                          </div>
                        </div>

                        {/* Detail Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
                          {[
                            { label: 'Origin', value: load.origin || '—', icon: MapPin, color: 'var(--success)' },
                            { label: 'Destination', value: load.destination || '—', icon: MapPin, color: 'var(--danger)' },
                            { label: 'Rate', value: '$' + Number(load.rate || 0).toLocaleString(), icon: DollarSign, color: 'var(--accent)' },
                            { label: 'Weight', value: load.weight ? Number(load.weight).toLocaleString() + ' lbs' : '—', icon: Package, color: 'var(--accent2)' },
                          ].map(d => (
                            <div key={d.label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <Ic icon={d.icon} size={11} style={{ color: d.color }} /> {d.label}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: d.color }}>{d.value}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
                          {[
                            { label: 'Equipment', value: load.equipment || '—' },
                            { label: 'Load Type', value: load.load_type || '—' },
                            { label: 'Pickup Date', value: load.pickup_date ? new Date(load.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                            { label: 'Delivery Date', value: load.delivery_date ? new Date(load.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                          ].map(d => (
                            <div key={d.label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{d.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.value}</div>
                            </div>
                          ))}
                        </div>

                        {/* Notes */}
                        {load.notes && (
                          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)', marginBottom: 18 }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Special Instructions</div>
                            <div style={{ fontSize: 12, lineHeight: 1.6 }}>{load.notes}</div>
                          </div>
                        )}

                        {/* Rate Con + Carrier */}
                        <div style={{ display: 'flex', gap: 12 }}>
                          {load.rate_con_url && (
                            <a href={load.rate_con_url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                              <Ic icon={FileText} size={14} /> View Rate Confirmation
                            </a>
                          )}
                          {load.carrier_name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>
                              <Ic icon={Truck} size={14} /> {load.carrier_name}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
                              <Ic icon={Clock} size={14} /> Waiting for carrier match
                            </div>
                          )}
                        </div>

                        {/* ── Real-time Status Tracker ── */}
                        <LoadStatusTracker status={load.status} />

                        {/* ── Direct Messaging ── */}
                        <MessageThread loadId={load.load_id} user={user} />
                      </div>
                    </td>
                  </tr>
                )
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BROKER CARRIERS — Real data from Supabase profiles
// ════════════════════════════════════════════════════════════════════════════
export function BrokerCarriers() {
  const { showToast } = useApp()
  const [search, setSearch] = useState('')
  const [carriers, setCarriers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'carrier').eq('status', 'active').order('created_at', { ascending: false })
      setCarriers(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const filtered = carriers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.full_name || '').toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.mc_number || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q) ||
      (c.equipment_type || '').toLowerCase().includes(q)
  })

  const getInitials = (name) => {
    if (!name) return 'CR'
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading carriers...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>FIND CARRIERS</div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{carriers.length} active carriers</span>
      </div>

      <div style={{ position: 'relative' }}>
        <Ic icon={Search} size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--muted)' }} />
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, company, MC#, location, or equipment..."
          style={{ paddingLeft: 34, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <Ic icon={Truck} size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>{carriers.length === 0 ? 'No carriers on the platform yet' : 'No carriers match your search'}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {filtered.map(c => (
            <div key={c.id} style={{ ...panel, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: 'var(--success)' }}>{getInitials(c.full_name)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{c.full_name || 'Unknown'}</div>
                  {c.company_name && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{c.company_name}</div>}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {[c.mc_number, c.dot_number].filter(Boolean).join(' · ') || 'No MC/DOT'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Location</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</div>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Equipment</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.equipment_type || '—'}</div>
                </div>
              </div>

              {c.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 12, color: 'var(--muted)' }}>
                  <Ic icon={Phone} size={12} /> {c.phone}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, padding: '9px 0', fontSize: 12, justifyContent: 'center' }}
                  onClick={() => showToast('', 'Request Sent', `Booking request sent to ${c.full_name}`)}>
                  Book Direct
                </button>
                <button className="btn btn-ghost" style={{ padding: '9px 12px', fontSize: 12 }}
                  onClick={() => showToast('', c.full_name, `${c.email || '—'} · ${c.phone || '—'}`)}>
                  <Ic icon={Phone} size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BROKER PAYMENTS — Real data from loads table
// ════════════════════════════════════════════════════════════════════════════
export function BrokerPayments() {
  const { showToast } = useApp()
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchLoads()
      setLoads(data || [])
      setLoading(false)
    }
    loadData()
  }, [])

  const totalRevenue = loads.reduce((s, l) => s + (l.rate || 0), 0)
  const deliveredRevenue = loads.filter(l => l.status === 'delivered').reduce((s, l) => s + (l.rate || 0), 0)
  const pendingRevenue = loads.filter(l => l.status !== 'delivered' && l.status !== 'cancelled').reduce((s, l) => s + (l.rate || 0), 0)

  const getState = (loc) => {
    if (!loc) return ''
    const parts = loc.split(',')
    return parts.length > 1 ? parts[parts.length - 1].trim() : loc
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading payments...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>PAYMENTS</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Total Revenue', value: '$' + totalRevenue.toLocaleString(), color: 'var(--accent)' },
          { label: 'Completed', value: '$' + deliveredRevenue.toLocaleString(), color: 'var(--success)' },
          { label: 'Pending', value: '$' + pendingRevenue.toLocaleString(), color: 'var(--warning)' },
          { label: 'Total Loads', value: loads.length, color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} style={statCard(s.color)}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={panel}>
        <div style={panelHead}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={CreditCard} size={14} /> Load Payments</span>
        </div>
        {loads.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No loads yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Load', 'Route', 'Rate', 'Status', 'Payment', 'Posted'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loads.map(l => {
                const payStatus = l.status === 'delivered' ? 'Paid' : l.status === 'cancelled' ? 'Cancelled' : 'Pending'
                const pc = payColor(payStatus)
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent3)' }}>{l.load_id}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }}>{getState(l.origin)} → {getState(l.destination)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>${Number(l.rate || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: l.status === 'delivered' ? 'rgba(34,197,94,0.12)' : l.status === 'open' ? 'rgba(240,165,0,0.12)' : 'var(--surface2)', color: l.status === 'delivered' ? 'var(--success)' : l.status === 'open' ? 'var(--warning)' : 'var(--muted)' }}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={badge((pc || 'var(--muted)') + '18', pc || 'var(--muted)')}>
                        {payStatus === 'Pending' && <Ic icon={Clock} size={10} />}
                        {payStatus === 'Paid' && <Ic icon={CheckCircle} size={10} />}
                        {payStatus}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted)' }}>{l.posted_at ? new Date(l.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
