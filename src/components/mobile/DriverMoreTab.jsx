import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import {
  User, Shield, FileText, DollarSign, TrendingUp, LogOut,
  ChevronRight, Fuel, HelpCircle, Mail, MessageCircle,
  CheckCircle, Clock, AlertTriangle, Package, Truck, Navigation,
  CreditCard, Heart, Upload, Camera, ClipboardCheck, Save,
  XCircle, Edit3, ChevronDown, Check, X
} from 'lucide-react'
import { Ic, haptic, fmt$ } from './shared'
import MobileIFTATab from './MobileIFTATab'
import { uploadFile } from '../../lib/storage'
import { apiFetch } from '../../lib/api'

function calcDriverPay(revenue, miles, driver) {
  if (driver?.pay_model && driver?.pay_rate) {
    const rate = Number(driver.pay_rate) || 0
    if (driver.pay_model === 'percent') return revenue * (rate / 100)
    if (driver.pay_model === 'permile') return (miles || 0) * rate
    if (driver.pay_model === 'flat') return rate
  }
  return revenue * 0.28 // fallback — per-driver rate preferred
}

export default function DriverMoreTab({ onClose }) {
  const { logout, user, profile } = useApp()
  const ctx = useCarrier() || {}
  const drivers = ctx.drivers || []
  const loads = ctx.loads || []
  const expenses = ctx.expenses || []
  const company = ctx.company || {}

  const myDriver = useMemo(() => {
    return drivers.find(d => d.user_id === user?.id)
      || drivers.find(d => (d.full_name || d.name || '') === (profile?.full_name || ''))
      || drivers[0]
  }, [drivers, user, profile])

  const [activeSection, setActiveSection] = useState(null)
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  // Stats
  const stats = useMemo(() => {
    const completed = loads.filter(l => {
      const s = (l.status || '').toLowerCase()
      return s === 'delivered' || s === 'invoiced' || s === 'paid' || s === 'settled'
    })
    const totalMiles = completed.reduce((s, l) => s + (l.miles || 0), 0)
    const totalPay = completed.reduce((s, l) => {
      const rev = l.gross || l.rate || 0
      return s + (l.driver_pay || calcDriverPay(rev, l.miles || 0, myDriver))
    }, 0)
    const active = loads.filter(l => {
      const s = (l.status || '').toLowerCase()
      return !['delivered', 'invoiced', 'paid', 'settled', 'cancelled'].includes(s)
    })
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)
    return { completed: completed.length, totalMiles, totalPay, active: active.length, totalExpenses, loads: completed }
  }, [loads, expenses, myDriver])

  // Payroll — group by week
  const payroll = useMemo(() => {
    const weeks = {}
    stats.loads.forEach(l => {
      const d = new Date(l.delivery_date || l.created_at || Date.now())
      const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay()); weekStart.setHours(0, 0, 0, 0)
      const key = weekStart.toISOString().split('T')[0]
      if (!weeks[key]) weeks[key] = { week: key, loads: 0, miles: 0, pay: 0, gross: 0 }
      const rev = l.gross || l.rate || 0
      weeks[key].loads += 1
      weeks[key].miles += (l.miles || 0)
      weeks[key].gross += rev
      weeks[key].pay += (l.driver_pay || calcDriverPay(rev, l.miles || 0, myDriver))
    })
    return Object.values(weeks).sort((a, b) => b.week.localeCompare(a.week))
  }, [stats.loads, myDriver])

  const payModelText = myDriver?.pay_model === 'percent' ? `${myDriver.pay_rate}% of gross`
    : myDriver?.pay_model === 'permile' ? `$${Number(myDriver.pay_rate || 0).toFixed(2)}/mile`
    : myDriver?.pay_model === 'flat' ? `$${Number(myDriver.pay_rate || 0).toFixed(0)} flat/load`
    : 'Not configured'

  // Back button helper
  const BackButton = () => (
    <button onClick={() => { haptic(); setActiveSection(null) }}
      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
      <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
    </button>
  )

  // ── IFTA Section ──
  if (activeSection === 'ifta') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackButton />
        <MobileIFTATab />
      </div>
    )
  }

  // ── DVIR PRE-TRIP INSPECTION Section ──
  if (activeSection === 'dvir') {
    return <DVIRInspection myDriver={myDriver} vehicles={ctx.vehicles || []} BackButton={BackButton} />
  }

  // ── PROFILE Section (Editable) ──
  if (activeSection === 'profile') {
    return <EditableProfile myDriver={myDriver} company={company} user={user} profile={profile} firstName={firstName} payModelText={payModelText} BackButton={BackButton} />
  }

  // ── PAYROLL Section ──
  if (activeSection === 'payroll') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackButton />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Payroll History</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>{payModelText}</div>

          {/* YTD summary */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>YTD Earnings</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(stats.totalPay)}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>YTD Miles</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif" }}>{stats.totalMiles.toLocaleString()}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>YTD Loads</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif" }}>{stats.completed}</div>
            </div>
          </div>

          {/* Weekly breakdown */}
          {payroll.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>No payroll history</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Complete loads to see weekly pay breakdown.</div>
            </div>
          )}
          {payroll.map((week, i) => {
            const weekEnd = new Date(week.week)
            weekEnd.setDate(weekEnd.getDate() + 6)
            return (
              <div key={week.week} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '14px', marginBottom: 8, animation: `fadeInUp 0.2s ease ${i * 0.04}s both`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      Week of {new Date(week.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {week.loads} load{week.loads !== 1 ? 's' : ''} · {week.miles.toLocaleString()} mi
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>
                      {fmt$(Math.round(week.pay * 100) / 100)}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>of {fmt$(Math.round(week.gross * 100) / 100)} gross</div>
                  </div>
                </div>
                {/* Mini progress bar showing driver cut */}
                <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, background: 'var(--success)',
                    width: week.gross > 0 ? `${(week.pay / week.gross) * 100}%` : '0%',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── MY TRUCK / EQUIPMENT Section ──
  if (activeSection === 'truck') {
    return <MyTruckSection myDriver={myDriver} vehicles={ctx.vehicles || []} BackButton={BackButton} />
  }

  // ── COMPLIANCE Section ──
  if (activeSection === 'compliance') {
    const d = myDriver || {}
    const items = [
      { label: 'CDL License', value: d.license_class || 'CDL-A', sub: d.license_state, expiry: d.license_expiry || d.cdl_expiration },
      { label: 'Medical Card', value: d.medical_card_expiry || d.medical_card_expiration ? 'Active' : 'Unknown', expiry: d.medical_card_expiry || d.medical_card_expiration },
      { label: 'Drug Test', value: d.drug_test_status || (d.drug_test_date ? 'Completed' : 'No record'), sub: d.drug_test_date ? new Date(d.drug_test_date).toLocaleDateString() : undefined },
      { label: 'MVR', value: d.mvr_status || 'On file', sub: d.mvr_date ? new Date(d.mvr_date).toLocaleDateString() : undefined },
      { label: 'Equipment', value: d.equipment_experience || d.equipment || '—' },
      { label: 'Endorsements', value: d.endorsements || 'None' },
    ]
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackButton />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Compliance</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            {items.map((item, i) => {
              const isExpiring = item.expiry && new Date(item.expiry) < new Date(Date.now() + 30 * 86400000)
              const isExpired = item.expiry && new Date(item.expiry) < new Date()
              const color = isExpired ? 'var(--danger)' : isExpiring ? '#f59e0b' : 'var(--success)'
              return (
                <div key={item.label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px',
                  background: 'var(--bg)', borderRadius: 10, marginBottom: i < items.length - 1 ? 6 : 0,
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {item.value} {item.sub && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({item.sub})</span>}
                    </div>
                  </div>
                  {item.expiry && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color, fontWeight: 700 }}>
                        {isExpired ? 'EXPIRED' : isExpiring ? 'EXPIRING SOON' : 'VALID'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(item.expiry).toLocaleDateString()}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── HELP Section ──
  if (activeSection === 'help') {
    const faqs = [
      { q: 'How do I add a load?', a: "Tap 'Add Load' on the Loads tab or snap a rate con." },
      { q: 'How do I invoice a broker?', a: 'When a load is delivered, Q auto-generates an invoice. View in Money tab.' },
      { q: 'How do I track my IFTA?', a: 'Go to More → IFTA Report. Log fuel purchases as expenses with state.' },
      { q: 'How do I do a pre-trip inspection?', a: 'Go to More → Pre-Trip Inspection. Complete the DOT DVIR checklist before driving.' },
      { q: 'How do I view my truck info?', a: 'Go to More → My Equipment to see your assigned truck, trailer, and document expiry dates.' },
    ]
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackButton />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Help & Support</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', marginBottom: 12 }}>CONTACT US</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, marginBottom: 8 }}>
              <Ic icon={Mail} size={15} color="var(--accent)" />
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Email</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>hello@qivori.com</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
              <Ic icon={MessageCircle} size={15} color="var(--accent)" />
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Talk to Q</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>Open Q from the home screen for AI assistance</div>
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', marginBottom: 12 }}>FAQ</div>
            {faqs.map(faq => (
              <div key={faq.q} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{faq.q}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN MENU ──
  const MENU = [
    { id: 'dvir', label: 'Pre-Trip Inspection', sub: 'DOT DVIR — 32-point checklist', icon: ClipboardCheck, color: '#22c55e' },
    { id: 'truck', label: 'My Equipment', sub: 'Assigned truck & trailer docs', icon: Truck, color: '#6366f1' },
    { id: 'profile', label: 'My Profile', sub: 'Personal info, CDL, qualifications', icon: User, color: 'var(--accent)' },
    { id: 'payroll', label: 'Payroll', sub: 'Weekly pay breakdown & YTD', icon: DollarSign, color: 'var(--success)' },
    { id: 'compliance', label: 'Compliance', sub: 'CDL, medical card, drug test', icon: Shield, color: 'var(--success)' },
    { id: 'ifta', label: 'IFTA Report', sub: 'Fuel tax calculator', icon: Fuel, color: '#8b5cf6' },
    { id: 'help', label: 'Help & Support', sub: 'FAQ & contact', icon: HelpCircle, color: 'var(--accent)' },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>

      {/* Close header when used as slide-in panel */}
      {onClose && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5 }}>SETTINGS</span>
          <button onClick={() => { haptic(); onClose() }}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="var(--muted)" />
          </button>
        </div>
      )}

      {/* Driver profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, animation: 'fadeInUp 0.3s ease' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#6366f1', fontFamily: "'Bebas Neue',sans-serif" }}>{firstName[0]}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{profile?.full_name || myDriver?.full_name || 'Driver'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || ''}</div>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 1 }}>{payModelText}</div>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 16,
        animation: 'fadeInUp 0.3s ease 0.05s both',
      }}>
        {[
          { label: 'Delivered', value: stats.completed, color: 'var(--success)' },
          { label: 'Active', value: stats.active, color: 'var(--accent)' },
          { label: 'Miles', value: stats.totalMiles > 999 ? `${(stats.totalMiles / 1000).toFixed(1)}k` : stats.totalMiles, color: 'var(--text)' },
          { label: 'Earned', value: fmt$(stats.totalPay), color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: "'Bebas Neue',sans-serif" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Menu items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MENU.map((item, index) => (
          <button key={item.id} onClick={() => { haptic(); setActiveSection(item.id) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", textAlign: 'left',
              animation: `fadeInUp 0.25s ease ${index * 0.05}s both`,
            }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={item.icon} size={17} color={item.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{item.label}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{item.sub}</div>
            </div>
            <ChevronRight size={14} color="var(--muted)" />
          </button>
        ))}
      </div>

      {/* Sign out */}
      <button onClick={() => { haptic(); logout() }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '14px', marginTop: 24, background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.15)', borderRadius: 14, cursor: 'pointer',
          fontFamily: "'DM Sans',sans-serif",
        }}>
        <Ic icon={LogOut} size={15} color="var(--danger)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>Sign Out</span>
      </button>

      <div style={{ height: 80 }} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// DVIR PRE-TRIP INSPECTION — DOT-compliant 32-point checklist
// ════════════════════════════════════════════════════════════════
const DVIR_CATEGORIES = [
  { category: 'Power Unit', items: [
    'Air Compressor', 'Air Lines', 'Battery', 'Body/Frame', 'Brake Accessories',
    'Brakes (Parking)', 'Brakes (Service)', 'Clutch', 'Coupling Devices',
    'Defroster/Heater', 'Drive Line', 'Engine', 'Exhaust', 'Fifth Wheel',
    'Fluid Levels', 'Fuel System', 'Horn', 'Lights (Head/Stop/Tail/Dash)',
    'Mirrors', 'Muffler', 'Oil Pressure', 'Radiator', 'Safety Equipment (Fire Ext., Triangles, Spare Fuses)',
    'Starter', 'Steering', 'Suspension', 'Tires', 'Transmission',
    'Wheels/Rims/Lugs', 'Windows', 'Windshield Wipers',
  ]},
  { category: 'Trailer', items: [
    'Brake Connections', 'Brakes', 'Coupling Devices (King Pin)', 'Coupling Chains',
    'Doors', 'Hitch', 'Landing Gear', 'Lights (All)', 'Reflectors/Reflective Tape',
    'Roof', 'Suspension', 'Tarpaulin', 'Tires', 'Wheels/Rims/Lugs',
  ]},
]

const AI_SCAN_ITEMS = {
  'Tires': 'tire',
  'Brakes (Service)': 'brake',
  'Brakes (Parking)': 'brake',
  'Lights (Head/Stop/Tail/Dash)': 'light',
  'Coupling Devices': 'coupling',
  'Fifth Wheel': 'coupling',
  'Exhaust': 'exhaust',
  'Suspension': 'suspension',
  'Wheels/Rims/Lugs': 'tire',
  'Brake Connections': 'brake',
  'Brakes': 'brake',
  'Coupling Devices (King Pin)': 'coupling',
  'Lights (All)': 'light',
  'Tarpaulin': 'general',
}

function MyTruckSection({ myDriver, vehicles, BackButton }) {
  const driverId = myDriver?.id
  const driverName = myDriver?.full_name || myDriver?.name || ''

  const assigned = (vehicles || []).filter(v =>
    v.assigned_driver === driverId ||
    v.driver_name === driverName ||
    (myDriver?.vehicle_id && v.id === myDriver.vehicle_id)
  )

  const truck = assigned.find(v => (v.type || '').toLowerCase() === 'truck') || assigned[0] || null
  const trailer = assigned.find(v => (v.type || '').toLowerCase() === 'trailer') || null

  const now = new Date()
  const daysUntil = (dateStr) => {
    if (!dateStr) return null
    return Math.ceil((new Date(dateStr) - now) / 86400000)
  }
  const statusColor = (days) => !days && days !== 0 ? 'var(--muted)' : days < 0 ? 'var(--danger)' : days <= 30 ? '#f59e0b' : 'var(--success)'
  const statusText = (days) => !days && days !== 0 ? 'N/A' : days < 0 ? 'EXPIRED' : days <= 7 ? `${days} days` : days <= 30 ? `${days} days` : 'Valid'

  const renderVehicle = (v, label) => {
    if (!v) return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 10 }}>
        <Ic icon={Truck} size={24} color="var(--border)" />
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8 }}>No {label.toLowerCase()} assigned</div>
        <div style={{ fontSize: 10, marginTop: 4 }}>Contact dispatch to assign your {label.toLowerCase()}</div>
      </div>
    )

    const docs = [
      { label: 'Registration', expiry: v.registration_expiry },
      { label: 'Insurance', expiry: v.insurance_expiry },
      { label: 'DOT Inspection', expiry: v.dot_inspection_expiry || v.annual_inspection_due },
    ]

    return (
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '16px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 2 }}>{label.toUpperCase()}</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>
              {v.unit_number || `${v.year || ''} ${v.make || ''} ${v.model || ''}`}
            </div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700,
            background: v.status === 'Active' ? 'rgba(52,176,104,0.1)' : 'rgba(239,68,68,0.1)',
            color: v.status === 'Active' ? 'var(--success)' : 'var(--danger)',
          }}>
            {v.status || 'Active'}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {[
            ['Year/Make/Model', `${v.year || '—'} ${v.make || ''} ${v.model || ''}`],
            ['License Plate', v.license_plate ? `${v.license_plate} (${v.license_state || ''})` : '—'],
            ['VIN', v.vin ? `...${v.vin.slice(-6)}` : '—'],
            ['Odometer', v.current_miles ? `${Number(v.current_miles).toLocaleString()} mi` : '—'],
          ].map(([k, val]) => (
            <div key={k}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{k}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{val}</div>
            </div>
          ))}
        </div>

        {v.next_service_miles && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 10,
            background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Ic icon={AlertTriangle} size={12} color="#f59e0b" />
            <span style={{ fontSize: 10, color: 'var(--text)' }}>
              Next service at <span style={{ fontWeight: 700 }}>{Number(v.next_service_miles).toLocaleString()} mi</span>
              {v.current_miles && ` (${Math.max(0, Number(v.next_service_miles) - Number(v.current_miles)).toLocaleString()} mi remaining)`}
            </span>
          </div>
        )}

        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>DOCUMENTS</div>
        {docs.map(doc => {
          const days = daysUntil(doc.expiry)
          return (
            <div key={doc.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(days), flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{doc.label}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {doc.expiry ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: statusColor(days) }}>{statusText(days)}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>Exp: {new Date(doc.expiry).toLocaleDateString()}</div>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Not on file</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BackButton label="My Equipment" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', WebkitOverflowScrolling: 'touch' }}>
        {renderVehicle(truck, 'Truck')}
        {renderVehicle(trailer, 'Trailer')}
        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}

export function DVIRInspection({ myDriver, vehicles, BackButton }) {
  const { showToast } = useApp()
  const [selectedVehicle, setSelectedVehicle] = useState('')
  const [inspType, setInspType] = useState('pre_trip')
  const [itemStates, setItemStates] = useState({}) // key: itemName → 'pass' | 'defect'
  const [defectNotes, setDefectNotes] = useState({}) // key: itemName → string
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [expandedCat, setExpandedCat] = useState('Power Unit')
  const [odometer, setOdometer] = useState('')
  const [scanResults, setScanResults] = useState({})
  const [scanning, setScanning] = useState(null)

  const allItems = DVIR_CATEGORIES.flatMap(c => c.items)
  const checkedCount = Object.keys(itemStates).length
  const defectCount = Object.values(itemStates).filter(v => v === 'defect').length
  const allChecked = checkedCount === allItems.length

  const markItem = (item, status) => {
    haptic()
    setItemStates(prev => ({ ...prev, [item]: status }))
    if (status === 'pass') setDefectNotes(prev => { const n = { ...prev }; delete n[item]; return n })
  }

  const markAllPass = (category) => {
    haptic('medium')
    const cat = DVIR_CATEGORIES.find(c => c.category === category)
    if (!cat) return
    const next = { ...itemStates }
    cat.items.forEach(item => { next[item] = 'pass' })
    setItemStates(next)
  }

  const scanWithAI = async (item, file) => {
    if (!file) return
    setScanning(item)
    try {
      const result = await uploadFile(file, `dvir/${selectedVehicle || 'unknown'}`)
      const res = await apiFetch('/api/inspect-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: result.url,
          component: AI_SCAN_ITEMS[item] || 'general',
        }),
      })
      const data = await res.json()
      setScanResults(prev => ({ ...prev, [item]: data }))
      if (data.status === 'pass') {
        markItem(item, 'pass')
        haptic('success')
        showToast('success', 'Q: PASS', `${item} — ${data.findings?.[0] || 'No defects found'}`)
      } else {
        markItem(item, 'defect')
        const note = data.findings?.join('. ') || data.action_required || 'Defect detected by AI'
        setDefectNotes(prev => ({ ...prev, [item]: `[AI] ${note}` }))
        haptic('warning')
        if (data.out_of_service) {
          showToast('error', 'Q: OUT OF SERVICE', `${item} — ${data.action_required || 'Critical defect detected'}`)
        } else {
          showToast('warning', 'Q: DEFECT', `${item} — ${data.action_required || 'Minor defect found'}`)
        }
      }
    } catch (err) {
      showToast('error', 'Scan Failed', 'Could not analyze photo — mark manually')
    } finally {
      setScanning(null)
    }
  }

  const submitDVIR = async () => {
    if (!allChecked) { showToast('error', 'Incomplete', 'Inspect all items before submitting'); return }
    if (!selectedVehicle) { showToast('error', 'No Vehicle', 'Select a vehicle/unit first'); return }

    // Require AI photo scan on critical items marked as pass
    const criticalWithoutScan = Object.entries(itemStates)
      .filter(([item, status]) => status === 'pass' && AI_SCAN_ITEMS[item] && !scanResults[item])
    if (criticalWithoutScan.length > 0) {
      showToast?.('error', 'Photo Required', `${criticalWithoutScan.length} critical item(s) need AI photo scan before passing`)
      haptic?.('error')
      return
    }

    setSubmitting(true)
    try {
      const defectsArr = Object.entries(itemStates)
        .filter(([, v]) => v === 'defect')
        .map(([item]) => ({ item, notes: defectNotes[item] || '' }))

      const { createDVIR } = await import('../../lib/database')
      await createDVIR({
        driver_name: myDriver?.full_name || myDriver?.name || 'Unknown',
        vehicle_name: selectedVehicle,
        inspection_type: inspType,
        status: defectsArr.length > 0 ? 'defects_found' : 'safe',
        defects: defectsArr,
        submitted_at: new Date().toISOString(),
        source_provider: 'manual',
      })

      haptic('success')
      setSubmitted(true)
      localStorage.setItem(`pretripDone_${new Date().toISOString().split('T')[0]}`, 'true')
      showToast('success', 'DVIR Submitted', defectsArr.length > 0
        ? `${defectsArr.length} defect${defectsArr.length > 1 ? 's' : ''} reported — notify your dispatcher`
        : 'Vehicle passed all inspection items — safe to dispatch')
    } catch (err) {
      showToast('error', 'Submit Failed', err.message || 'Could not save DVIR')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackButton />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', marginBottom: 20,
            background: defectCount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(0,212,170,0.1)',
            border: `2px solid ${defectCount > 0 ? '#f59e0b' : 'var(--success)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'cardPop 0.4s ease',
          }}>
            <Ic icon={defectCount > 0 ? AlertTriangle : CheckCircle} size={28} color={defectCount > 0 ? '#f59e0b' : 'var(--success)'} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, marginBottom: 8 }}>
            {defectCount > 0 ? 'DEFECTS REPORTED' : 'INSPECTION PASSED'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{selectedVehicle} — {inspType === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date().toLocaleString()}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
            <span><strong style={{ color: 'var(--success)' }}>{checkedCount - defectCount}</strong> passed</span>
            {defectCount > 0 && <span><strong style={{ color: '#f59e0b' }}>{defectCount}</strong> defects</span>}
          </div>
          <button onClick={() => { setSubmitted(false); setItemStates({}); setDefectNotes({}); setOdometer('') }}
            style={{ marginTop: 24, padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
            New Inspection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BackButton />
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>DVIR Inspection</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>FMCSA §396.11 — Required before every trip</div>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            background: allChecked ? 'rgba(0,212,170,0.12)' : 'rgba(240,165,0,0.12)',
            color: allChecked ? 'var(--success)' : 'var(--accent)',
          }}>
            {checkedCount}/{allItems.length}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 3, background: defectCount > 0 ? '#f59e0b' : 'var(--success)',
            width: `${(checkedCount / allItems.length) * 100}%`, transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Vehicle + Type selectors */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, appearance: 'none' }}>
            <option value="">Select Unit</option>
            {vehicles.map(v => <option key={v.id} value={v.unit_number || v.name || `${v.year} ${v.make} ${v.model}`}>{v.unit_number || v.name || `${v.year} ${v.make} ${v.model}`}</option>)}
            <option value="__manual">Other (type below)</option>
          </select>
          <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {['pre_trip', 'post_trip'].map(t => (
              <button key={t} onClick={() => setInspType(t)}
                style={{ padding: '10px 12px', background: inspType === t ? 'var(--accent)' : 'var(--surface)', color: inspType === t ? '#000' : 'var(--muted)', border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                {t === 'pre_trip' ? 'PRE' : 'POST'}
              </button>
            ))}
          </div>
        </div>

        {/* Odometer */}
        <input value={odometer} onChange={e => setOdometer(e.target.value.replace(/\D/g, ''))} placeholder="Odometer reading"
          style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", marginBottom: 16, boxSizing: 'border-box' }} />

        {/* AI Scan banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(139,92,246,0.06))',
          border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, marginBottom: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#000', fontWeight: 800 }}>Q</span>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>AI-Powered Inspection</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Tap the camera icon on critical items — Q scans your photo for FMCSA defects</div>
          </div>
        </div>

        {/* Inspection categories */}
        {DVIR_CATEGORIES.map(cat => {
          const catChecked = cat.items.filter(i => itemStates[i]).length
          const catDefects = cat.items.filter(i => itemStates[i] === 'defect').length
          const isExpanded = expandedCat === cat.category
          return (
            <div key={cat.category} style={{ marginBottom: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <button onClick={() => { haptic(); setExpandedCat(isExpanded ? null : cat.category) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Ic icon={cat.category === 'Trailer' ? Package : Truck} size={16} color="var(--accent)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{cat.category}</span>
                  <span style={{ fontSize: 10, color: catChecked === cat.items.length ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>
                    {catChecked}/{cat.items.length}
                    {catDefects > 0 && <span style={{ color: '#f59e0b' }}> ({catDefects} defect{catDefects > 1 ? 's' : ''})</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {catChecked < cat.items.length && (
                    <button onClick={e => { e.stopPropagation(); markAllPass(cat.category) }}
                      style={{ padding: '4px 8px', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 6, fontSize: 10, fontWeight: 700, color: 'var(--success)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                      ALL OK
                    </button>
                  )}
                  <ChevronDown size={14} color="var(--muted)" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
              </button>

              {isExpanded && (
                <div style={{ padding: '0 12px 12px' }}>
                  {cat.items.map(item => {
                    const st = itemStates[item]
                    return (
                      <div key={item} style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 4px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: st ? 600 : 400 }}>{item}</span>
                          </div>
                          {AI_SCAN_ITEMS[item] && (
                            <button onClick={() => {
                              const inp = document.createElement('input')
                              inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment'
                              inp.onchange = (e) => { const f = e.target.files?.[0]; if (f) scanWithAI(item, f) }
                              inp.click()
                            }}
                              disabled={scanning === item}
                              style={{
                                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: scanning === item ? 'wait' : 'pointer',
                                border: scanResults[item] ? `2px solid ${scanResults[item].status === 'pass' ? 'var(--success)' : '#f59e0b'}` : '1px solid var(--accent)',
                                background: scanning === item ? 'rgba(240,165,0,0.15)' : scanResults[item] ? (scanResults[item].status === 'pass' ? 'rgba(0,212,170,0.08)' : 'rgba(245,158,11,0.08)') : 'rgba(240,165,0,0.06)',
                              }}>
                              {scanning === item ? (
                                <div style={{ width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                              ) : (
                                <Camera size={14} color={scanResults[item] ? (scanResults[item].status === 'pass' ? 'var(--success)' : '#f59e0b') : 'var(--accent)'} />
                              )}
                            </button>
                          )}
                          <button onClick={() => markItem(item, 'pass')}
                            style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: st === 'pass' ? '2px solid var(--success)' : '1px solid var(--border)', background: st === 'pass' ? 'rgba(0,212,170,0.12)' : 'var(--bg)' }}>
                            <Check size={14} color={st === 'pass' ? 'var(--success)' : 'var(--muted)'} />
                          </button>
                          <button onClick={() => markItem(item, 'defect')}
                            style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: st === 'defect' ? '2px solid #f59e0b' : '1px solid var(--border)', background: st === 'defect' ? 'rgba(245,158,11,0.12)' : 'var(--bg)' }}>
                            <X size={14} color={st === 'defect' ? '#f59e0b' : 'var(--muted)'} />
                          </button>
                        </div>
                        {scanResults[item] && (
                          <div style={{
                            margin: '0 4px 4px', padding: '8px 10px', borderRadius: 8,
                            background: scanResults[item].status === 'pass' ? 'rgba(0,212,170,0.06)' : scanResults[item].out_of_service ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)',
                            border: `1px solid ${scanResults[item].status === 'pass' ? 'rgba(0,212,170,0.2)' : scanResults[item].out_of_service ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <div style={{
                                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                background: scanResults[item].status === 'pass' ? 'var(--success)' : scanResults[item].out_of_service ? 'var(--danger)' : '#f59e0b',
                              }} />
                              <span style={{
                                fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                                color: scanResults[item].status === 'pass' ? 'var(--success)' : scanResults[item].out_of_service ? 'var(--danger)' : '#f59e0b',
                              }}>
                                {scanResults[item].status === 'pass' ? 'PASS' : scanResults[item].out_of_service ? 'CRITICAL' : 'MINOR DEFECT'}
                              </span>
                              {scanResults[item].confidence && (
                                <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>{scanResults[item].confidence}% confident</span>
                              )}
                            </div>
                            {scanResults[item].findings?.length > 0 && (
                              <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.4 }}>
                                {scanResults[item].findings.map((f, i) => (
                                  <div key={i} style={{ marginBottom: 2 }}>• {f}</div>
                                ))}
                              </div>
                            )}
                            {scanResults[item].fmcsa_violation && (
                              <div style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 600, marginTop: 4 }}>
                                FMCSA {scanResults[item].fmcsa_violation}
                              </div>
                            )}
                          </div>
                        )}
                        {st === 'defect' && !scanResults[item] && (
                          <input value={defectNotes[item] || ''} onChange={e => setDefectNotes(prev => ({ ...prev, [item]: e.target.value }))}
                            placeholder="Describe the defect..."
                            style={{ width: '100%', padding: '8px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, color: 'var(--text)', fontSize: 11, fontFamily: "'DM Sans',sans-serif", marginBottom: 4, boxSizing: 'border-box' }} />
                        )}
                        {st === 'defect' && scanResults[item] && (
                          <input value={defectNotes[item] || ''} onChange={e => setDefectNotes(prev => ({ ...prev, [item]: e.target.value }))}
                            placeholder="Add notes to AI findings..."
                            style={{ width: '100%', padding: '8px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, color: 'var(--text)', fontSize: 11, fontFamily: "'DM Sans',sans-serif", marginBottom: 4, boxSizing: 'border-box' }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Defect summary */}
        {defectCount > 0 && (
          <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', letterSpacing: 1, marginBottom: 8 }}>DEFECTS FOUND ({defectCount})</div>
            {Object.entries(itemStates).filter(([, v]) => v === 'defect').map(([item]) => (
              <div key={item} style={{ fontSize: 11, color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700 }}>{item}</span>
                {defectNotes[item] && <span style={{ color: 'var(--muted)' }}> — {defectNotes[item]}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Submit button */}
        <button onClick={submitDVIR} disabled={submitting || !allChecked}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: allChecked ? 'pointer' : 'default',
            background: allChecked ? (defectCount > 0 ? '#f59e0b' : 'var(--success)') : 'var(--surface)',
            color: allChecked ? '#000' : 'var(--muted)', fontSize: 14, fontWeight: 800,
            fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, opacity: submitting ? 0.6 : 1,
          }}>
          {submitting ? 'SUBMITTING...' : !allChecked ? `CHECK ${allItems.length - checkedCount} REMAINING ITEMS` : defectCount > 0 ? `SUBMIT WITH ${defectCount} DEFECT${defectCount > 1 ? 'S' : ''}` : 'SUBMIT — VEHICLE SAFE'}
        </button>

        {/* Regulatory notice */}
        <div style={{ marginTop: 12, padding: 10, textAlign: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--muted)' }}>
            FMCSA §396.11 requires a written DVIR at the end of each driving day. §396.13 requires review before dispatch.
            This digital record satisfies the reporting requirement.
          </span>
        </div>
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// EDITABLE PROFILE — phone, address, emergency contact
// ════════════════════════════════════════════════════════════════
function EditableProfile({ myDriver, company, user, profile, firstName, payModelText, BackButton }) {
  const { showToast } = useApp()
  const d = myDriver || {}
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    phone: profile?.phone || d.phone || '',
    address: d.address || '',
    emergency_name: d.emergency_name || d.emergency_contact || '',
    emergency_phone: d.emergency_phone || '',
  })

  const updateField = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const saveProfile = async () => {
    setSaving(true)
    try {
      const { updateDriver } = await import('../../lib/database')
      if (d.id) {
        await updateDriver(d.id, {
          phone: form.phone,
          address: form.address,
          emergency_name: form.emergency_name,
          emergency_phone: form.emergency_phone,
        })
      }
      haptic('success')
      showToast('success', 'Profile Updated', 'Your info has been saved')
      setEditing(false)
    } catch (err) {
      showToast('error', 'Save Failed', err.message || 'Could not update profile')
    } finally {
      setSaving(false)
    }
  }

  const EditableRow = ({ label, fieldKey, type }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      {editing ? (
        <input value={form[fieldKey]} onChange={e => updateField(fieldKey, e.target.value)}
          type={type || 'text'}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'right', maxWidth: '58%', padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 6, fontFamily: "'DM Sans',sans-serif", outline: 'none' }} />
      ) : (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'right', maxWidth: '55%' }}>{form[fieldKey] || '—'}</span>
      )}
    </div>
  )

  const ReadOnlyRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'right', maxWidth: '55%' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BackButton />
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>My Profile</div>
          {!editing ? (
            <button onClick={() => { haptic(); setEditing(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              <Ic icon={Edit3} size={12} color="var(--accent)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Edit</span>
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { haptic(); setEditing(false) }}
                style={{ padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--muted)', fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={saveProfile} disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'var(--success)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif", opacity: saving ? 0.6 : 1 }}>
                <Ic icon={Save} size={11} color="#000" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', border: '3px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{firstName[0]}</span>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{profile?.full_name || d.full_name || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{user?.email || ''}</div>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginTop: 2 }}>{payModelText}</div>
          </div>
        </div>

        {/* Personal Info — Editable */}
        <div style={{ background: 'var(--surface)', border: editing ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12, transition: 'border-color 0.2s' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: editing ? 'var(--accent)' : 'var(--muted)', marginBottom: 10 }}>
            {editing ? 'EDITING — PERSONAL INFO' : 'PERSONAL INFO'}
          </div>
          <EditableRow label="Phone" fieldKey="phone" type="tel" />
          <EditableRow label="Address" fieldKey="address" />
          <ReadOnlyRow label="DOB" value={d.dob || '—'} />
          <EditableRow label="Emergency Contact" fieldKey="emergency_name" />
          <EditableRow label="Emergency Phone" fieldKey="emergency_phone" type="tel" />
        </div>

        {/* CDL & Qualifications — Read-only */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', marginBottom: 10 }}>CDL & QUALIFICATIONS</div>
          {[
            ['CDL Number', d.cdl_number || d.license_number || '•••••'],
            ['CDL Class', d.license_class || d.cdl_class || 'A'],
            ['CDL State', d.license_state || d.cdl_state || '—'],
            ['CDL Expiry', d.license_expiry || d.cdl_expiration || '—'],
            ['Endorsements', d.endorsements || 'None'],
            ['Medical Card Expiry', d.medical_card_expiry || d.medical_card_expiration || '—'],
            ['Equipment', d.equipment_experience || d.equipment || '—'],
            ['Years Experience', d.years_experience || '—'],
          ].map(([k, v]) => <ReadOnlyRow key={k} label={k} value={v} />)}
        </div>

        {/* Company — Read-only */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--muted)', marginBottom: 10 }}>COMPANY</div>
          {[
            ['Company', company.name || company.company_name || '—'],
            ['MC #', company.mc_number || company.mc || '—'],
            ['DOT #', company.dot_number || company.dot || '—'],
          ].map(([k, v]) => <ReadOnlyRow key={k} label={k} value={v} />)}
        </div>
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// PACKETS WITH UPLOAD — camera/file picker for DQ documents
// ════════════════════════════════════════════════════════════════
function PacketsWithUpload({ myDriver, dqFiles, setDqFiles, BackButton }) {
  const { showToast } = useApp()
  const fileInputRef = useRef(null)
  const [uploadingDoc, setUploadingDoc] = useState(null)

  const docTypes = [
    { label: 'CDL — Front', dqType: 'cdl', subLabel: 'front', icon: CreditCard },
    { label: 'CDL — Back', dqType: 'cdl', subLabel: 'back', icon: CreditCard },
    { label: 'Medical Card', dqType: 'medical_card', icon: Heart },
    { label: 'W-9 Form', dqType: 'w9', icon: FileText },
    { label: 'Proof of Insurance', dqType: 'insurance', icon: Shield },
    { label: 'MVR Authorization', dqType: 'mvr', icon: FileText },
    { label: 'Drug & Alcohol Consent', dqType: 'drug_pre_employment', icon: Shield },
    { label: 'Direct Deposit Form', dqType: 'direct_deposit', icon: DollarSign },
    { label: 'Profile Photo', dqType: 'application', icon: Camera },
  ]

  const getMatchingFile = (doc) => {
    const matches = dqFiles.filter(f => f.doc_type === doc.dqType)
    if (doc.subLabel === 'front') return matches.find(f => /front/i.test(f.file_name)) || matches[0]
    if (doc.subLabel === 'back') return matches.find(f => /back/i.test(f.file_name)) || matches[1]
    return matches[0]
  }

  const uploadedCount = docTypes.filter(doc => getMatchingFile(doc)?.file_url).length

  const triggerUpload = (doc) => {
    haptic()
    setUploadingDoc(doc)
    if (fileInputRef.current) {
      fileInputRef.current.accept = doc.dqType === 'application' ? 'image/*' : 'image/*,.pdf'
      fileInputRef.current.capture = doc.dqType === 'application' ? 'user' : undefined
      fileInputRef.current.click()
    }
  }

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingDoc) return
    e.target.value = ''

    const doc = uploadingDoc
    setUploadingDoc(null)

    try {
      showToast('', 'Uploading...', doc.label)
      const { uploadFile } = await import('../../lib/storage')
      const result = await uploadFile(file, `dq-files/${myDriver?.id || 'unknown'}`)

      const { createDQFile, updateDQFile } = await import('../../lib/database')
      const existingFile = getMatchingFile(doc)

      let saved
      if (existingFile?.id) {
        saved = await updateDQFile(existingFile.id, {
          file_url: result.url,
          file_name: doc.subLabel ? `${doc.dqType}_${doc.subLabel}_${file.name}` : file.name,
          file_size: file.size,
        })
        setDqFiles(prev => prev.map(f => f.id === existingFile.id ? { ...f, ...saved } : f))
      } else {
        saved = await createDQFile({
          driver_id: myDriver?.id,
          doc_type: doc.dqType,
          file_name: doc.subLabel ? `${doc.dqType}_${doc.subLabel}_${file.name}` : file.name,
          file_url: result.url,
          file_size: file.size,
          status: 'uploaded',
        })
        setDqFiles(prev => [...prev, saved])
      }

      haptic('success')
      showToast('success', 'Uploaded', `${doc.label} saved successfully`)
    } catch (err) {
      showToast('error', 'Upload Failed', err.message || 'Could not upload file')
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BackButton />
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelected} />
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>My Packets</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tap any missing doc to upload from camera or files</div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            background: uploadedCount === docTypes.length ? 'rgba(0,212,170,0.12)' : 'rgba(245,158,11,0.12)',
            color: uploadedCount === docTypes.length ? 'var(--success)' : '#f59e0b',
          }}>
            {uploadedCount}/{docTypes.length}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: uploadedCount === docTypes.length ? 'var(--success)' : 'var(--accent)',
            width: `${(uploadedCount / docTypes.length) * 100}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>

        {docTypes.map((doc, i) => {
          const dqFile = getMatchingFile(doc)
          const hasFile = !!dqFile?.file_url
          return (
            <div key={doc.label} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              marginBottom: 6, animation: `fadeInUp 0.2s ease ${i * 0.03}s both`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: hasFile ? 'rgba(0,212,170,0.08)' : 'rgba(239,68,68,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Ic icon={doc.icon} size={16} color={hasFile ? 'var(--success)' : 'var(--danger)'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{doc.label}</div>
                <div style={{ fontSize: 10, color: hasFile ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                  {hasFile ? 'Uploaded' : 'Missing — tap to upload'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {hasFile && (
                  <button onClick={() => window.open(dqFile.file_url, '_blank')}
                    style={{ padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif" }}>
                    View
                  </button>
                )}
                <button onClick={() => triggerUpload(doc)}
                  style={{
                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                    background: hasFile ? 'var(--surface2)' : 'rgba(240,165,0,0.1)',
                    border: hasFile ? '1px solid var(--border)' : '1px solid rgba(240,165,0,0.3)',
                    color: hasFile ? 'var(--muted)' : 'var(--accent)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  <Ic icon={hasFile ? Upload : Camera} size={11} color={hasFile ? 'var(--muted)' : 'var(--accent)'} />
                  {hasFile ? 'Replace' : 'Upload'}
                </button>
              </div>
            </div>
          )
        })}

        {uploadedCount < docTypes.length && (
          <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 10, textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
              Tap the camera icon next to any missing document. You can take a photo or choose from files.
            </span>
          </div>
        )}
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}
