import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
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

// ── Demo Data ──────────────────────────────────────────────────────────────
const DEMO_LOADS = [
  { id: 'BL-1001', origin: 'Atlanta, GA', dest: 'Chicago, IL', rate: 3200, equipment: 'Dry Van', status: 'Posted', carrier: null, tracking: null, notes: [] },
  { id: 'BL-1002', origin: 'Dallas, TX', dest: 'Miami, FL', rate: 4800, equipment: 'Reefer', status: 'Matched', carrier: null, tracking: null, notes: [] },
  { id: 'BL-1003', origin: 'Memphis, TN', dest: 'New York, NY', rate: 5100, equipment: 'Dry Van', status: 'Booked',
    carrier: { name: 'R&J Transport LLC', mc: 'MC-338821', dot: 'DOT-2847291', safety: 96, truck: '2022 Freightliner Cascadia', driver: 'James Tucker', phone: '(214) 555-0341', insurance: 'Active', eld: true, onTime: 98 },
    tracking: null,
    notes: [
      { from: 'carrier', name: 'James Tucker', text: 'Confirmed pickup for tomorrow 8AM. Truck is in Memphis now.', time: '2h ago' },
      { from: 'broker', name: 'You', text: 'Great, shipper expects you at Dock 4. Ask for Mike at receiving.', time: '1h ago' },
    ]},
  { id: 'BL-1004', origin: 'Phoenix, AZ', dest: 'Los Angeles, CA', rate: 1850, equipment: 'Flatbed', status: 'In Transit',
    carrier: { name: 'Western Haul Inc', mc: 'MC-451002', dot: 'DOT-3102844', safety: 91, truck: '2023 Peterbilt 579', driver: 'Marcus Rivera', phone: '(602) 555-1188', insurance: 'Active', eld: true, onTime: 95 },
    tracking: { location: 'Buckeye, AZ', lat: 33.37, lng: -112.58, updated: '4 min ago', eta: 'Today 6:30 PM', milesLeft: 142, pctComplete: 62, speed: '64 mph', nextStop: 'Los Angeles, CA', status: 'On Schedule' },
    notes: [
      { from: 'carrier', name: 'Marcus Rivera', text: 'Loaded and rolling. Traffic clear on I-10 westbound.', time: '3h ago' },
      { from: 'broker', name: 'You', text: 'Receiver closes at 8PM, you have plenty of time.', time: '2h ago' },
      { from: 'carrier', name: 'Marcus Rivera', text: 'Copy that. ETA 6:30 PM.', time: '1h ago' },
    ]},
  { id: 'BL-1005', origin: 'Nashville, TN', dest: 'Charlotte, NC', rate: 1650, equipment: 'Dry Van', status: 'Delivered',
    carrier: { name: 'Blue Line Freight', mc: 'MC-289114', dot: 'DOT-2219043', safety: 88, truck: '2021 Kenworth T680', driver: 'David Park', phone: '(615) 555-7720', insurance: 'Active', eld: true, onTime: 92 },
    tracking: { location: 'Charlotte, NC', pctComplete: 100, status: 'Delivered', updated: 'Mar 3, 11:42 AM' },
    notes: [
      { from: 'carrier', name: 'David Park', text: 'Delivered and signed. POD uploaded.', time: 'Mar 3' },
    ]},
  { id: 'BL-1006', origin: 'Denver, CO', dest: 'Houston, TX', rate: 3400, equipment: 'Dry Van', status: 'Delivered',
    carrier: { name: 'Peak Transport Co', mc: 'MC-510033', dot: 'DOT-3384012', safety: 94, truck: '2022 Volvo VNL 860', driver: 'Sarah Kim', phone: '(303) 555-2290', insurance: 'Active', eld: true, onTime: 97 },
    tracking: { location: 'Houston, TX', pctComplete: 100, status: 'Delivered', updated: 'Mar 5, 2:15 PM' },
    notes: [] },
  { id: 'BL-1007', origin: 'Chicago, IL', dest: 'Detroit, MI', rate: 1200, equipment: 'Step Deck', status: 'Booked',
    carrier: { name: 'Midwest Express LLC', mc: 'MC-667210', dot: 'DOT-4001587', safety: 85, truck: '2020 International LT', driver: 'Tom Bradley', phone: '(312) 555-4410', insurance: 'Active', eld: true, onTime: 90 },
    tracking: null,
    notes: [
      { from: 'carrier', name: 'Tom Bradley', text: 'Will pick up tomorrow morning. Any dock restrictions?', time: '30m ago' },
    ]},
  { id: 'BL-1008', origin: 'Seattle, WA', dest: 'Portland, OR', rate: 950, equipment: 'Reefer', status: 'Posted', carrier: null, tracking: null, notes: [] },
]

const DEMO_CARRIERS = [
  { name: 'R&J Transport LLC', mc: 'MC-338821', dot: 'DOT-2847291', safety: 96, equipment: ['Dry Van', 'Reefer'], lanes: ['ATL-CHI', 'DAL-MIA', 'MEM-NYC'], onTime: 98, loads: 142, preferred: true },
  { name: 'Western Haul Inc', mc: 'MC-451002', dot: 'DOT-3102844', safety: 91, equipment: ['Flatbed', 'Step Deck'], lanes: ['PHX-LAX', 'DEN-HOU', 'DAL-PHX'], onTime: 95, loads: 87, preferred: true },
  { name: 'Blue Line Freight', mc: 'MC-289114', dot: 'DOT-2219043', safety: 88, equipment: ['Dry Van'], lanes: ['NAS-CLT', 'ATL-JAX', 'CLT-RDU'], onTime: 92, loads: 63, preferred: false },
  { name: 'Peak Transport Co', mc: 'MC-510033', dot: 'DOT-3384012', safety: 94, equipment: ['Dry Van', 'Reefer'], lanes: ['DEN-HOU', 'DEN-DAL', 'KC-CHI'], onTime: 97, loads: 118, preferred: true },
  { name: 'Midwest Express LLC', mc: 'MC-667210', dot: 'DOT-4001587', safety: 85, equipment: ['Step Deck', 'Flatbed'], lanes: ['CHI-DET', 'CHI-IND', 'CHI-STL'], onTime: 90, loads: 44, preferred: false },
  { name: 'Sunbelt Carriers', mc: 'MC-773401', dot: 'DOT-4229018', safety: 78, equipment: ['Dry Van'], lanes: ['MIA-ATL', 'JAX-ATL', 'MIA-NAS'], onTime: 85, loads: 29, preferred: false },
]

const DEMO_INVOICES = [
  { id: 'INV-4001', load: 'BL-1005', carrier: 'Blue Line Freight', amount: 1650, status: 'Paid', date: 'Mar 3, 2026' },
  { id: 'INV-4002', load: 'BL-1006', carrier: 'Peak Transport Co', amount: 3400, status: 'Paid', date: 'Mar 5, 2026' },
  { id: 'INV-4003', load: 'BL-1003', carrier: 'R&J Transport LLC', amount: 5100, status: 'Pending', date: 'Mar 8, 2026' },
  { id: 'INV-4004', load: 'BL-1004', carrier: 'Western Haul Inc', amount: 1850, status: 'Pending', date: 'Mar 9, 2026' },
  { id: 'INV-4005', load: 'BL-1007', carrier: 'Midwest Express LLC', amount: 1200, status: 'Pending', date: 'Mar 10, 2026' },
  { id: 'INV-4006', load: 'BL-0998', carrier: 'Sunbelt Carriers', amount: 2200, status: 'Overdue', date: 'Feb 20, 2026' },
]

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
  const activity = [
    { icon: Package, text: 'Load BL-1008 posted — Seattle to Portland, Reefer', time: '2 min ago', color: 'var(--accent)' },
    { icon: Truck, text: 'R&J Transport booked load BL-1003 — Memphis to NYC', time: '18 min ago', color: 'var(--success)' },
    { icon: CheckCircle, text: 'Load BL-1005 delivered — Nashville to Charlotte', time: '1 hr ago', color: 'var(--accent2)' },
    { icon: DollarSign, text: 'Payment received from Blue Line Freight — $1,650', time: '2 hrs ago', color: 'var(--success)' },
    { icon: Truck, text: 'Western Haul picked up load BL-1004 — Phoenix to LA', time: '3 hrs ago', color: 'var(--accent)' },
    { icon: CheckCircle, text: 'Load BL-1006 delivered — Denver to Houston', time: '5 hrs ago', color: 'var(--accent2)' },
  ]

  const inTransit = DEMO_LOADS.filter(l => l.status === 'In Transit')

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>BROKER DASHBOARD</div>

      {/* ── Top Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Active Loads', value: '8', color: 'var(--accent)', icon: Package },
          { label: 'Booked Today', value: '3', color: 'var(--success)', icon: CheckCircle },
          { label: 'Carriers Matched', value: '12', color: 'var(--accent2)', icon: Truck },
          { label: 'Revenue MTD', value: '$21.2K', color: 'var(--accent3)', icon: DollarSign },
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
          { label: 'Avg Time to Book', value: '8 min', icon: Timer, color: 'var(--accent)' },
          { label: 'Carrier Repeat Rate', value: '72%', icon: Repeat, color: 'var(--success)' },
          { label: 'Top Lane', value: 'ATL→CHI', icon: Route, color: 'var(--accent2)' },
          { label: 'On-Time Delivery', value: '96%', icon: CheckCircle, color: 'var(--accent3)' },
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

      {/* ── Live Tracking Banner ── */}
      {inTransit.length > 0 && (
        <div style={panel}>
          <div style={panelHead}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Navigation} size={14} style={{ color: 'var(--success)' }} /> Live Tracking</span>
            <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} /> {inTransit.length} IN TRANSIT</span>
          </div>
          {inTransit.map(l => l.tracking && (
            <div key={l.id} onClick={() => navigatePage('broker-loads')}
              style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent3)' }}>{l.id}</span>
                  <span style={{ fontSize: 11 }}>{l.origin.split(',')[0]} <Ic icon={ArrowRight} size={10} style={{ margin: '0 2px', color: 'var(--muted)' }} /> {l.dest.split(',')[0]}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {l.carrier.driver}</span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: l.tracking.pctComplete + '%', background: 'var(--success)', borderRadius: 2, transition: 'width 0.5s' }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>{l.tracking.location}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>ETA {l.tracking.eta} · {l.tracking.milesLeft} mi left</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* ── Activity Feed ── */}
        <div style={panel}>
          <div style={panelHead}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Clock} size={14} /> Recent Activity</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activity.map((a, i) => (
              <div key={i} style={{ padding: '10px 16px', borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Ic icon={a.icon} size={14} style={{ color: a.color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>{a.text}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{a.time}</div>
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
  const { showToast, navigatePage } = useApp()
  const [loadType, setLoadType] = useState('FTL')
  const [stops, setStops] = useState([])

  const addStop = () => setStops(s => [...s, { city: '', date: '', type: 'Pickup', notes: '' }])
  const removeStop = (i) => setStops(s => s.filter((_, idx) => idx !== i))
  const updateStop = (i, field, val) => setStops(s => s.map((st, idx) => idx === i ? { ...st, [field]: val } : st))

  const submit = () => {
    const label = loadType === 'FTL' ? 'Full Truckload' : loadType === 'LTL' ? 'LTL Shipment' : 'Partial Load'
    const stopLabel = stops.length > 0 ? ` · ${stops.length} stop${stops.length > 1 ? 's' : ''}` : ''
    showToast('', 'Load Posted', `${label}${stopLabel} is live — carriers can now book it`)
    setTimeout(() => navigatePage('broker-loads'), 1200)
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

        {/* ── Load Details ── */}
        <div style={{ ...panel, marginBottom: 14 }}>
          <div style={panelHead}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Package} size={14} /> Load Details</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group"><label className="form-label">Origin City</label><input className="form-input" placeholder="e.g. Atlanta, GA" /></div>
              <div className="form-group"><label className="form-label">Final Destination</label><input className="form-input" placeholder="e.g. Chicago, IL" /></div>
              <div className="form-group"><label className="form-label">Pickup Date</label><input className="form-input" type="date" /></div>
              <div className="form-group"><label className="form-label">Delivery Date</label><input className="form-input" type="date" /></div>
              <div className="form-group"><label className="form-label">Equipment Type</label>
                <select className="form-input"><option>Dry Van</option><option>Reefer</option><option>Flatbed</option><option>Step Deck</option><option>Power Only</option><option>Conestoga</option><option>Hotshot</option></select>
              </div>
              <div className="form-group"><label className="form-label">Weight (lbs)</label><input className="form-input" placeholder={loadType === 'LTL' ? 'e.g. 8,500' : loadType === 'Partial' ? 'e.g. 22,000' : 'e.g. 42,000'} /></div>
              <div className="form-group"><label className="form-label">Rate ($)</label><input className="form-input" placeholder="e.g. 3,200" /></div>
              <div className="form-group"><label className="form-label">Commodity</label><input className="form-input" placeholder="e.g. General Freight" /></div>
              {loadType === 'LTL' && (
                <>
                  <div className="form-group"><label className="form-label">Pieces / Pallets</label><input className="form-input" placeholder="e.g. 6 pallets" /></div>
                  <div className="form-group"><label className="form-label">Dimensions (L×W×H)</label><input className="form-input" placeholder='e.g. 48×40×48"' /></div>
                  <div className="form-group"><label className="form-label">Freight Class</label>
                    <select className="form-input"><option>Class 50</option><option>Class 55</option><option>Class 60</option><option>Class 65</option><option>Class 70</option><option>Class 77.5</option><option>Class 85</option><option>Class 92.5</option><option>Class 100</option><option>Class 110</option><option>Class 125</option><option>Class 150</option><option>Class 175</option><option>Class 200</option><option>Class 250</option><option>Class 300</option><option>Class 400</option><option>Class 500</option></select>
                  </div>
                  <div className="form-group"><label className="form-label">Stackable?</label>
                    <select className="form-input"><option>Yes</option><option>No</option></select>
                  </div>
                </>
              )}
              {loadType === 'Partial' && (
                <>
                  <div className="form-group"><label className="form-label">Linear Feet Needed</label><input className="form-input" placeholder="e.g. 24 ft" /></div>
                  <div className="form-group"><label className="form-label">Pieces / Pallets</label><input className="form-input" placeholder="e.g. 12 pallets" /></div>
                </>
              )}
            </div>
            <div className="form-group"><label className="form-label">Special Instructions</label>
              <textarea className="form-input" rows={3} placeholder="e.g. No touch freight, appointment required, driver assist, liftgate needed, hazmat" style={{ resize: 'vertical', fontFamily: "'DM Sans', sans-serif" }} />
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
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input className="form-input" value={stop.city} onChange={e => updateStop(i, 'city', e.target.value)} placeholder="e.g. Nashville, TN" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date</label>
                      <input className="form-input" type="date" value={stop.date} onChange={e => updateStop(i, 'date', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Stop Type</label>
                      <select className="form-input" value={stop.type} onChange={e => updateStop(i, 'type', e.target.value)}>
                        <option>Pickup</option><option>Delivery</option><option>Pickup & Delivery</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <input className="form-input" value={stop.notes} onChange={e => updateStop(i, 'notes', e.target.value)} placeholder="e.g. Dock hours 7AM–3PM" />
                    </div>
                  </div>
                  <button onClick={() => removeStop(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4, marginTop: 20, flexShrink: 0 }}>
                    <Ic icon={Trash2} size={14} />
                  </button>
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
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>Market avg $3,140 · 12 carriers available · Avg booking time: 8 min{stops.length > 0 && ` · ${stops.length} extra stop${stops.length > 1 ? 's' : ''} (+$${stops.length * 150}/stop)`}</div>
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }} onClick={submit}>
          <Ic icon={Zap} size={16} /> Post {loadType} Load{stops.length > 0 ? ` · ${stops.length + 2} Stops` : ''}
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BROKER LOADS
// ════════════════════════════════════════════════════════════════════════════
export function BrokerLoads() {
  const { showToast, navigatePage } = useApp()
  const [filter, setFilter] = useState('All')
  const [expanded, setExpanded] = useState(null)
  const [noteTab, setNoteTab] = useState('info') // 'info' | 'tracking' | 'notes'
  const [newNote, setNewNote] = useState('')
  const [localNotes, setLocalNotes] = useState({})
  const noteInputRef = useRef(null)
  const filters = ['All', 'Active', 'Booked', 'Delivered']

  const filtered = DEMO_LOADS.filter(l => {
    if (filter === 'All') return true
    if (filter === 'Active') return ['Posted', 'Matched', 'In Transit'].includes(l.status)
    if (filter === 'Booked') return l.status === 'Booked'
    if (filter === 'Delivered') return l.status === 'Delivered'
    return true
  })

  const sendNote = (loadId) => {
    if (!newNote.trim()) return
    setLocalNotes(prev => ({
      ...prev,
      [loadId]: [...(prev[loadId] || []), { from: 'broker', name: 'You', text: newNote.trim(), time: 'Just now' }]
    }))
    setNewNote('')
    showToast('', 'Note Sent', 'Carrier will see this on their load')
  }

  const getNotesForLoad = (load) => [...(load.notes || []), ...(localNotes[load.id] || [])]

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>MY LOADS</div>
        <button className="btn btn-primary" onClick={() => navigatePage('broker-post')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic icon={Package} size={14} /> Post a Load
        </button>
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
              {['Load ID', 'Route', 'Rate', 'Equipment', 'Status', 'Carrier', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(load => {
              const isExpanded = expanded === load.id
              const sc = statusColor(load.status)
              const noteCount = getNotesForLoad(load).length
              return (
                <tr key={load.id} style={{ cursor: load.carrier ? 'pointer' : 'default', background: isExpanded ? 'rgba(240,165,0,0.03)' : 'transparent' }}
                  onClick={() => { if (load.carrier) { setExpanded(isExpanded ? null : load.id); setNoteTab('info'); setNewNote('') } }}>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent3)' }}>{load.id}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }}>{load.origin.split(',')[0]} <Ic icon={ArrowRight} size={10} style={{ margin: '0 4px', color: 'var(--muted)' }} /> {load.dest.split(',')[0]}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>${load.rate.toLocaleString()}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>{load.equipment}</td>
                  <td style={{ padding: '10px 14px' }}><span style={badge(sc + '18', sc)}><span style={{ width: 6, height: 6, borderRadius: '50%', background: sc }} /> {load.status}</span></td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>
                    {load.carrier ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {load.carrier.name}
                        {noteCount > 0 && <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{noteCount}</span>}
                      </div>
                    ) : <span style={{ color: 'var(--muted)' }}>--</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {load.carrier && <Ic icon={isExpanded ? ChevronUp : ChevronDown} size={14} style={{ color: 'var(--muted)' }} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Expanded detail panel */}
        {expanded && (() => {
          const load = DEMO_LOADS.find(l => l.id === expanded)
          if (!load || !load.carrier) return null
          const c = load.carrier
          const t = load.tracking
          const notes = getNotesForLoad(load)

          return (
            <div style={{ background: 'var(--surface2)', borderTop: '2px solid var(--accent)' }}>
              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {[
                  { id: 'info', label: 'Carrier Info', icon: Truck },
                  { id: 'tracking', label: 'Live Tracking', icon: Navigation, disabled: !t },
                  { id: 'notes', label: `Notes (${notes.length})`, icon: MessageSquare },
                ].map(tab => (
                  <button key={tab.id}
                    onClick={e => { e.stopPropagation(); if (!tab.disabled) setNoteTab(tab.id) }}
                    style={{
                      padding: '10px 18px', fontSize: 11, fontWeight: 700, cursor: tab.disabled ? 'default' : 'pointer',
                      background: 'none', border: 'none', borderBottom: `2px solid ${noteTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                      color: tab.disabled ? 'var(--border)' : noteTab === tab.id ? 'var(--accent)' : 'var(--muted)',
                      display: 'flex', alignItems: 'center', gap: 5, fontFamily: "'DM Sans',sans-serif",
                      opacity: tab.disabled ? 0.4 : 1
                    }}>
                    <Ic icon={tab.icon} size={12} /> {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Carrier Info Tab ── */}
              {noteTab === 'info' && (
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ic icon={Truck} size={13} /> Carrier Details — One Click Info Exchange
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Carrier</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.mc} · {c.dot}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Safety Score</div>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: safetyColor(c.safety), lineHeight: 1 }}>{c.safety}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.onTime}% on-time</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Truck & Driver</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{c.driver}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.truck}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Contact & Status</div>
                      <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Ic icon={Phone} size={12} /> {c.phone}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <span style={badge('rgba(34,197,94,0.12)', 'var(--success)')}><Ic icon={Shield} size={10} /> Insured</span>
                        {c.eld && <span style={badge('rgba(77,142,240,0.12)', 'var(--accent2)')}><Ic icon={Radio} size={10} /> ELD</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Live Tracking Tab ── */}
              {noteTab === 'tracking' && t && (
                <div style={{ padding: '16px 20px' }}>
                  {t.pctComplete < 100 ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 2s infinite' }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>{t.status}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>· Updated {t.updated}</span>
                      </div>

                      {/* Progress visualization */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '14px 16px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{load.origin.split(',')[0]}</div>
                        <div style={{ flex: 1, position: 'relative', height: 6 }}>
                          <div style={{ height: '100%', borderRadius: 3, background: 'var(--surface2)' }} />
                          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: t.pctComplete + '%', borderRadius: 3, background: 'linear-gradient(90deg, var(--accent), var(--success))' }} />
                          <div style={{ position: 'absolute', top: -6, left: `calc(${t.pctComplete}% - 9px)`, width: 18, height: 18, borderRadius: '50%', background: 'var(--success)', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Ic icon={Truck} size={10} style={{ color: '#fff' }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{load.dest.split(',')[0]}</div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        {[
                          { label: 'Current Location', value: t.location, color: 'var(--success)' },
                          { label: 'ETA', value: t.eta, color: 'var(--accent)' },
                          { label: 'Miles Remaining', value: t.milesLeft + ' mi', color: 'var(--accent2)' },
                          { label: 'Speed', value: t.speed, color: 'var(--accent3)' },
                        ].map(s => (
                          <div key={s.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{s.label}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: 16, textAlign: 'center' }}>
                      <Ic icon={CheckCircle} size={28} style={{ color: 'var(--success)', marginBottom: 8 }} />
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>Delivered</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.location} · {t.updated}</div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Notes Tab ── */}
              {noteTab === 'notes' && (
                <div style={{ display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                  {/* Messages */}
                  <div style={{ maxHeight: 220, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {notes.length === 0 && (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No notes yet. Send a message to the carrier below.</div>
                    )}
                    {notes.map((n, i) => {
                      const isBroker = n.from === 'broker'
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isBroker ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            maxWidth: '75%', padding: '8px 12px', borderRadius: 10,
                            background: isBroker ? 'rgba(240,165,0,0.12)' : 'var(--surface)',
                            border: `1px solid ${isBroker ? 'rgba(240,165,0,0.25)' : 'var(--border)'}`,
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: isBroker ? 'var(--accent)' : 'var(--accent2)', marginBottom: 3 }}>{n.name}</div>
                            <div style={{ fontSize: 12, lineHeight: 1.5 }}>{n.text}</div>
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, padding: '0 4px' }}>{n.time}</div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Input */}
                  <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input ref={noteInputRef} value={newNote} onChange={e => setNewNote(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') sendNote(load.id) }}
                      placeholder="Type a note to the carrier..."
                      style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", outline: 'none' }} />
                    <button onClick={() => sendNote(load.id)}
                      style={{ width: 34, height: 34, borderRadius: 8, background: newNote.trim() ? 'var(--accent)' : 'var(--surface2)', border: 'none', cursor: newNote.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Ic icon={Send} size={14} style={{ color: newNote.trim() ? '#000' : 'var(--muted)' }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BROKER CARRIERS
// ════════════════════════════════════════════════════════════════════════════
export function BrokerCarriers() {
  const { showToast } = useApp()
  const [search, setSearch] = useState('')

  const filtered = DEMO_CARRIERS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.mc.toLowerCase().includes(search.toLowerCase()) ||
    c.lanes.some(l => l.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>FIND CARRIERS</div>

      <div style={{ position: 'relative' }}>
        <Ic icon={Search} size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--muted)' }} />
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by carrier name, MC#, or lane..."
          style={{ paddingLeft: 34, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {filtered.map(c => (
          <div key={c.mc} style={{ ...panel, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: safetyColor(c.safety) + '18', border: '1px solid ' + safetyColor(c.safety) + '40', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: safetyColor(c.safety) }}>{c.safety}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                  {c.preferred && <span style={badge('rgba(240,165,0,0.12)', 'var(--accent)')}><Ic icon={Star} size={10} /> Preferred</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.mc} · {c.dot}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>On-Time</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.onTime}%</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Loads Completed</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.loads}</div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Equipment</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {c.equipment.map(e => <span key={e} style={badge('var(--surface2)', 'var(--text)')}>{e}</span>)}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lanes</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {c.lanes.map(l => <span key={l} style={badge('rgba(77,142,240,0.1)', 'var(--accent2)')}>{l}</span>)}
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', padding: '9px 0', fontSize: 12, justifyContent: 'center' }}
              onClick={() => showToast('', 'Booking Sent', `Direct booking request sent to ${c.name}`)}>
              Book Direct
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BROKER PAYMENTS
// ════════════════════════════════════════════════════════════════════════════
export function BrokerPayments() {
  const { showToast } = useApp()

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>PAYMENTS</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Outstanding', value: '$8,150', color: 'var(--warning)' },
          { label: 'Paid MTD', value: '$5,050', color: 'var(--success)' },
          { label: 'Avg Days to Pay', value: '4.2', color: 'var(--accent2)' },
          { label: 'Total Carriers Paid', value: '6', color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} style={statCard(s.color)}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={panel}>
        <div style={panelHead}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={CreditCard} size={14} /> Invoices</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Invoice', 'Load', 'Carrier', 'Amount', 'Status', 'Date', 'Action'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_INVOICES.map(inv => {
              const pc = payColor(inv.status)
              return (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>{inv.id}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--accent3)' }}>{inv.load}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>{inv.carrier}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>${inv.amount.toLocaleString()}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={badge(pc + '18', pc)}>
                      {inv.status === 'Overdue' && <Ic icon={AlertTriangle} size={10} />}
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>{inv.date}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {inv.status === 'Pending' && (
                      <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => showToast('', 'Payment Sent', `$${inv.amount.toLocaleString()} sent to ${inv.carrier}`)}>
                        Pay Now
                      </button>
                    )}
                    {inv.status === 'Overdue' && (
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--danger)' }}
                        onClick={() => showToast('', 'Reminder Sent', `Payment reminder sent for ${inv.id}`)}>
                        Send Reminder
                      </button>
                    )}
                    {inv.status === 'Paid' && (
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => showToast('', 'Receipt', `Downloading receipt for ${inv.id}`)}>
                        Receipt
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
