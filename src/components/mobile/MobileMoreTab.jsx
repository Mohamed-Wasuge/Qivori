import { useState, useEffect, lazy, Suspense } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { User, HelpCircle, LogOut, ChevronRight, Shield, Fuel, Mail, MessageCircle, ChevronDown, Upload, FileText, CheckCircle, XCircle, Clock, ClipboardCheck, X, Truck, Users, Settings, UserPlus, Plus, Edit3, Trash2, Zap, Radio, Bot, Activity } from 'lucide-react'
import { Ic, haptic } from './shared'
import { apiFetch } from '../../lib/api'
import * as db from '../../lib/database'
import MobileIFTATab from './MobileIFTATab'
import { DVIRInspection } from './DriverMoreTab'
import QActivityFeed from '../QActivityFeed'
import QLiveNegotiation from '../QLiveNegotiation'

// Lazy-load desktop components for mobile More tab sections
const EDIDashboard = lazy(() => import('../../pages/carrier/EDIDashboard').then(m => ({ default: m.EDIDashboard })))
const AIDispatchDashboard = lazy(() => import('../carrier/AIDispatchDashboard').then(m => ({ default: m.AIDispatchDashboard })))
const QOperationsHub = lazy(() => import('../carrier/Hubs').then(m => ({ default: m.QOperationsHub })))

const SectionLoader = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#000', fontWeight: 800 }}>Q</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Loading...</div>
    </div>
  </div>
)

// Recent DVIR history for mobile
function MobileDVIRHistory() {
  const [dvirs, setDvirs] = useState([])
  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase.from('eld_dvirs').select('id,status,vehicle_name,driver_name,defects,submitted_at').order('submitted_at', { ascending: false }).limit(5)
        if (data) setDvirs(data)
      } catch {}
    })()
  }, [])

  if (dvirs.length === 0) return (
    <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 8 }}>RECENT INSPECTIONS</div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>No DVIRs yet. Complete a pre-trip to see history here.</div>
    </div>
  )

  return (
    <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 10 }}>RECENT INSPECTIONS</div>
      {dvirs.map(d => {
        const passed = d.status === 'safe' || d.status === 'defects_minor'
        const defectCount = (d.defects || []).length
        return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <Ic icon={passed ? CheckCircle : XCircle} size={16} color={passed ? 'var(--success)' : 'var(--danger)'} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{d.vehicle_name || 'Vehicle'}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>{d.driver_name} · {new Date(d.submitted_at).toLocaleDateString()}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: passed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: passed ? 'var(--success)' : 'var(--danger)' }}>
              {passed ? 'PASS' : `${defectCount} DEFECT${defectCount !== 1 ? 'S' : ''}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const MENU_ITEMS = [
  { id: 'find', label: 'Find Loads', sub: 'AI Load Board — scored & ranked', icon: Zap, color: 'var(--accent)', nav: 'find' },
  { id: 'dvir', label: 'Pre-Trip Inspection', sub: 'DOT DVIR — 46-point checklist', icon: ClipboardCheck, color: '#22c55e' },
  { id: 'fleet', label: 'Fleet', sub: 'Trucks & trailers', icon: Truck, color: '#3b82f6' },
  { id: 'drivers', label: 'Drivers', sub: 'Add & manage drivers', icon: Users, color: '#8b5cf6' },
  { id: 'compliance', label: 'Compliance', sub: 'ELD, DVIR, CSA, HOS', icon: Shield, color: 'var(--success)' },
  { id: 'ifta', label: 'IFTA Report', sub: 'Fuel tax calculator', icon: Fuel, color: '#8b5cf6' },
  { id: 'edi', label: 'EDI Hub', sub: 'Electronic data interchange', icon: Radio, color: '#06b6d4' },
  { id: 'ai-dashboard', label: 'AI Control Center', sub: 'AI dispatch intelligence', icon: Bot, color: '#8b5cf6' },
  { id: 'q-ops', label: 'Q Operations', sub: 'Q decisions, calls & activity', icon: Activity, color: 'var(--accent)' },
  { id: 'settings', label: 'Company Settings', sub: 'Profile, integrations, billing', icon: Settings, color: '#6b7280' },
  { id: 'team', label: 'Team & Invite', sub: 'Invite dispatchers & drivers', icon: UserPlus, color: '#f59e0b' },
  { id: 'profile', label: 'Profile', sub: 'Your account details', icon: User, color: 'var(--accent)' },
  { id: 'help', label: 'Help & Support', sub: 'Get help from the team', icon: HelpCircle, color: 'var(--accent2)' },
]

export default function MobileMoreTab({ onNavigate, onClose }) {
  const { logout, user, profile } = useApp()
  const ctx = useCarrier() || {}
  const drivers = ctx.drivers || []
  const company = ctx.company || {}
  // Match current user to their driver profile (fall back to first driver for single-driver carriers)
  const firstDriver = drivers.find(d => d.user_id === user?.id) || drivers.find(d => (d.full_name || d.name || '') === (profile?.full_name || '')) || drivers[0]
  const [activeSection, setActiveSection] = useState(null)

  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  // If a section is open, render it full-screen with back button
  if (activeSection === 'ifta') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button onClick={() => { haptic(); setActiveSection(null) }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
        </button>
        <MobileIFTATab />
      </div>
    )
  }

  if (activeSection === 'dvir') {
    const BackBtn = () => (
      <button onClick={() => { haptic(); setActiveSection(null) }}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
        <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
      </button>
    )
    return <DVIRInspection myDriver={firstDriver} vehicles={ctx.vehicles || []} BackButton={BackBtn} />
  }

  if (activeSection === 'profile') {
    const fullName = profile?.full_name || user?.user_metadata?.full_name || '—'
    const email = user?.email || '—'
    const phone = profile?.phone || '—'
    const companyName = company.name || company.company_name || '—'
    const mc = company.mc_number || company.mc || '—'
    const dot = company.dot_number || company.dot || '—'
    const fields = [
      { label: 'Full Name', value: fullName },
      { label: 'Email', value: email },
      { label: 'Phone', value: phone },
      { label: 'Company', value: companyName },
      { label: 'MC #', value: mc },
      { label: 'DOT #', value: dot },
    ]
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button onClick={() => { haptic(); setActiveSection(null) }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
        </button>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16, letterSpacing: 1 }}>Profile</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {fields.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < fields.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{f.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (activeSection === 'compliance') {
    const d = firstDriver
    const complianceItems = d ? [
      { label: 'CDL License', value: d.license_class || 'CDL-A', sub: d.license_state || '—', expiry: d.license_expiry },
      { label: 'Medical Card', value: d.medical_card_expiry ? 'Active' : 'Unknown', expiry: d.medical_card_expiry },
      ...(d.drug_test_date || d.drug_test_status ? [{ label: 'Drug Test', value: d.drug_test_status || 'Completed', sub: d.drug_test_date ? new Date(d.drug_test_date).toLocaleDateString() : undefined }] : []),
      { label: 'Equipment', value: d.equipment_experience || d.equipment || '—' },
      { label: 'Endorsements', value: d.endorsements || 'None on file' },
    ] : []
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button onClick={() => { haptic(); setActiveSection(null) }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
        </button>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16, letterSpacing: 1 }}>Compliance</div>
          {d ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {complianceItems.map(item => {
                const isExpiring = item.expiry && new Date(item.expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                const isExpired = item.expiry && new Date(item.expiry) < new Date()
                const expiryColor = isExpired ? 'var(--danger)' : isExpiring ? 'var(--accent)' : 'var(--success)'
                return (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {item.value} {item.sub && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({item.sub})</span>}
                      </div>
                    </div>
                    {item.expiry && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, color: expiryColor, fontWeight: 700 }}>
                          {isExpired ? 'EXPIRED' : isExpiring ? 'EXPIRING SOON' : 'VALID'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(item.expiry).toLocaleDateString()}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>No driver profile found. Add a driver to view compliance info.</div>
            </div>
          )}
          {/* HOS Status */}
          <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 10 }}>HOS STATUS</div>
            {(() => {
              const hosStart = localStorage.getItem('qivori_hos_drive_start')
              const hosDriven = parseFloat(localStorage.getItem('qivori_hos_driven') || '0')
              let currentDriving = hosDriven
              if (hosStart) currentDriving += (Date.now() - parseInt(hosStart)) / 3600000
              const remaining = Math.max(0, 11 - currentDriving)
              const pct = Math.min(100, (currentDriving / 11) * 100)
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Drive time</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: remaining < 2 ? 'var(--danger)' : 'var(--success)' }}>{remaining.toFixed(1)}h remaining</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: remaining < 2 ? 'var(--danger)' : remaining < 4 ? 'var(--warning)' : 'var(--success)', borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text)' }}>{currentDriving.toFixed(1)}h</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>Driven</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", color: remaining < 2 ? 'var(--danger)' : 'var(--success)' }}>{remaining.toFixed(1)}h</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>Remaining</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text)' }}>14h</div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>On-Duty Window</div>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

          {/* Recent DVIRs */}
          <MobileDVIRHistory />

          {/* Quick Actions */}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => { haptic(); setActiveSection('dvir') }}
              style={{ flex: 1, padding: '12px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'center', fontFamily: "'DM Sans',sans-serif" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}><ClipboardCheck size={18} color="#22c55e" /></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>Pre-Trip</div>
            </button>
            <button onClick={() => {
              haptic()
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/*,.pdf'
              input.capture = 'environment'
              input.onchange = async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const { uploadFile: upFn } = await import('../../lib/storage')
                  const uploaded = await upFn(file, `docs/${Date.now()}`)
                  const { createDocument } = await import('../../lib/database')
                  await createDocument({ name: file.name, file_url: uploaded.url, doc_type: 'other', metadata: { original_name: file.name, size: file.size } })
                  haptic('success')
                  alert('Document uploaded successfully')
                } catch { alert('Upload failed') }
              }
              input.click()
            }}
              style={{ flex: 1, padding: '12px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'center', fontFamily: "'DM Sans',sans-serif" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}><Upload size={18} color="var(--accent)" /></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>Upload Doc</div>
            </button>
            <button onClick={() => { haptic(); setActiveSection('ifta') }}
              style={{ flex: 1, padding: '12px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'center', fontFamily: "'DM Sans',sans-serif" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}><FileText size={18} color="var(--accent)" /></div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>IFTA</div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Fleet Management ──────────────────────────────────────────────
  if (activeSection === 'fleet') {
    const vehicles = ctx.vehicles || []
    const [showAddForm, setShowAddForm] = useState(false)
    const [vForm, setVForm] = useState({ unit_number: '', year: '', make: '', model: '', vin: '', license_plate: '', plate_state: '' })
    const saveVehicle = async () => {
      if (!vForm.unit_number) return alert('Unit number is required')
      try {
        await db.createVehicle({ ...vForm, status: 'active', owner_id: user.id })
        haptic('success')
        setShowAddForm(false)
        setVForm({ unit_number: '', year: '', make: '', model: '', vin: '', license_plate: '', plate_state: '' })
        ctx.refreshVehicles?.()
      } catch (e) { alert('Failed to add vehicle: ' + e.message) }
    }
    const BackBtn = () => (
      <button onClick={() => { haptic(); setActiveSection(null) }}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
        <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
      </button>
    )
    const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', outline: 'none' }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackBtn />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>Fleet ({vehicles.length})</div>
            <button onClick={() => { haptic(); setShowAddForm(!showAddForm) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--accent)', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              <Plus size={14} color="#000" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#000' }}>Add Truck</span>
            </button>
          </div>
          {showAddForm && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 14, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>NEW VEHICLE</div>
              <input placeholder="Unit # *" value={vForm.unit_number} onChange={e => setVForm(p => ({ ...p, unit_number: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="Year" value={vForm.year} onChange={e => setVForm(p => ({ ...p, year: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                <input placeholder="Make" value={vForm.make} onChange={e => setVForm(p => ({ ...p, make: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <input placeholder="Model" value={vForm.model} onChange={e => setVForm(p => ({ ...p, model: e.target.value }))} style={inputStyle} />
              <input placeholder="VIN" value={vForm.vin} onChange={e => setVForm(p => ({ ...p, vin: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="License Plate" value={vForm.license_plate} onChange={e => setVForm(p => ({ ...p, license_plate: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                <input placeholder="State" value={vForm.plate_state} onChange={e => setVForm(p => ({ ...p, plate_state: e.target.value }))} style={{ ...inputStyle, width: 80, flex: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowAddForm(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
                <button onClick={saveVehicle} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif" }}>Save</button>
              </div>
            </div>
          )}
          {vehicles.length === 0 && !showAddForm ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, textAlign: 'center' }}>
              <Truck size={28} color="var(--muted)" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>No vehicles yet</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tap "Add Truck" to register your first vehicle.</div>
            </div>
          ) : vehicles.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 8 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Truck size={17} color="#3b82f6" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Unit {v.unit_number}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'No details'}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: v.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: v.status === 'active' ? 'var(--success)' : 'var(--danger)' }}>
                {(v.status || 'active').toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Driver Management ──────────────────────────────────────────────
  if (activeSection === 'drivers') {
    const allDrivers = ctx.drivers || []
    const [showAddDriver, setShowAddDriver] = useState(false)
    const [dForm, setDForm] = useState({ full_name: '', email: '', phone: '', license_class: 'CDL-A', pay_model: 'percent', pay_rate: '28' })
    const saveDriver = async () => {
      if (!dForm.full_name) return alert('Driver name is required')
      try {
        await db.createDriver({ ...dForm, status: 'Active', owner_id: user.id })
        haptic('success')
        setShowAddDriver(false)
        setDForm({ full_name: '', email: '', phone: '', license_class: 'CDL-A', pay_model: 'percent', pay_rate: '28' })
        ctx.refreshDrivers?.()
      } catch (e) { alert('Failed to add driver: ' + e.message) }
    }
    const BackBtn = () => (
      <button onClick={() => { haptic(); setActiveSection(null) }}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
        <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
      </button>
    )
    const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', outline: 'none' }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackBtn />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>Drivers ({allDrivers.length})</div>
            <button onClick={() => { haptic(); setShowAddDriver(!showAddDriver) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--accent)', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              <Plus size={14} color="#000" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#000' }}>Add Driver</span>
            </button>
          </div>
          {showAddDriver && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 14, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>NEW DRIVER</div>
              <input placeholder="Full Name *" value={dForm.full_name} onChange={e => setDForm(p => ({ ...p, full_name: e.target.value }))} style={inputStyle} />
              <input placeholder="Email" value={dForm.email} onChange={e => setDForm(p => ({ ...p, email: e.target.value }))} style={inputStyle} />
              <input placeholder="Phone" value={dForm.phone} onChange={e => setDForm(p => ({ ...p, phone: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={dForm.license_class} onChange={e => setDForm(p => ({ ...p, license_class: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
                  <option value="CDL-A">CDL-A</option>
                  <option value="CDL-B">CDL-B</option>
                  <option value="CDL-C">CDL-C</option>
                </select>
                <select value={dForm.pay_model} onChange={e => setDForm(p => ({ ...p, pay_model: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
                  <option value="percent">% of Load</option>
                  <option value="permile">Per Mile</option>
                  <option value="flat">Flat Rate</option>
                </select>
              </div>
              <input placeholder="Pay Rate (e.g. 28)" value={dForm.pay_rate} onChange={e => setDForm(p => ({ ...p, pay_rate: e.target.value }))} style={inputStyle} type="number" />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowAddDriver(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
                <button onClick={saveDriver} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif" }}>Save</button>
              </div>
            </div>
          )}
          {allDrivers.length === 0 && !showAddDriver ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, textAlign: 'center' }}>
              <Users size={28} color="var(--muted)" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>No drivers yet</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tap "Add Driver" to add your first driver.</div>
            </div>
          ) : allDrivers.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 8 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#8b5cf6', fontFamily: "'Bebas Neue',sans-serif" }}>{(d.full_name || d.name || '?')[0]}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{d.full_name || d.name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{d.license_class || 'CDL-A'} · {d.pay_model === 'percent' ? `${d.pay_rate}%` : d.pay_model === 'permile' ? `$${d.pay_rate}/mi` : `$${d.pay_rate}`}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: d.status === 'Active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: d.status === 'Active' ? 'var(--success)' : 'var(--danger)' }}>
                {(d.status || 'Active').toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Company Settings ──────────────────────────────────────────────
  if (activeSection === 'settings') {
    const [cForm, setCForm] = useState({
      name: company.name || company.company_name || '',
      mc_number: company.mc_number || company.mc || '',
      dot_number: company.dot_number || company.dot || '',
      phone: company.phone || '',
      email: company.email || '',
      address: company.address || '',
    })
    const [saving, setSaving] = useState(false)
    const saveCompany = async () => {
      setSaving(true)
      try {
        await db.upsertCompany(cForm)
        haptic('success')
        ctx.refreshCompany?.()
        alert('Company info saved')
      } catch (e) { alert('Save failed: ' + e.message) }
      setSaving(false)
    }
    const BackBtn = () => (
      <button onClick={() => { haptic(); setActiveSection(null) }}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
        <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
      </button>
    )
    const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', outline: 'none' }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackBtn />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16, letterSpacing: 1 }}>Company Settings</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Company Name</div>
              <input value={cForm.name} onChange={e => setCForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>MC #</div>
                <input value={cForm.mc_number} onChange={e => setCForm(p => ({ ...p, mc_number: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>DOT #</div>
                <input value={cForm.dot_number} onChange={e => setCForm(p => ({ ...p, dot_number: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Phone</div>
              <input value={cForm.phone} onChange={e => setCForm(p => ({ ...p, phone: e.target.value }))} style={inputStyle} type="tel" />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Email</div>
              <input value={cForm.email} onChange={e => setCForm(p => ({ ...p, email: e.target.value }))} style={inputStyle} type="email" />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Business Address</div>
              <input value={cForm.address} onChange={e => setCForm(p => ({ ...p, address: e.target.value }))} style={inputStyle} />
            </div>
            <button onClick={saveCompany} disabled={saving}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif", marginTop: 4, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Team & Invite ──────────────────────────────────────────────
  if (activeSection === 'team') {
    const members = ctx.teamMembers || []
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('driver')
    const [sending, setSending] = useState(false)
    const sendInvite = async () => {
      if (!inviteEmail) return alert('Enter an email address')
      setSending(true)
      try {
        await apiFetch('/api/invite-member', { method: 'POST', body: JSON.stringify({ email: inviteEmail, role: inviteRole }) })
        haptic('success')
        setInviteEmail('')
        alert('Invite sent!')
      } catch (e) { alert('Failed to send invite: ' + (e.message || 'Unknown error')) }
      setSending(false)
    }
    const BackBtn = () => (
      <button onClick={() => { haptic(); setActiveSection(null) }}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
        <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
      </button>
    )
    const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)', outline: 'none' }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackBtn />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16, letterSpacing: 1 }}>Team & Invite</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 12 }}>INVITE A TEAM MEMBER</div>
            <input placeholder="Email address" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} type="email" />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
              <option value="driver">Driver</option>
              <option value="dispatcher">Dispatcher</option>
            </select>
            <button onClick={sendInvite} disabled={sending}
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif", opacity: sending ? 0.6 : 1 }}>
              {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
          {/* Current members */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>TEAM MEMBERS ({members.length})</div>
          {members.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>No team members yet. Send an invite above.</div>
            </div>
          ) : members.map(m => (
            <div key={m.id || m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={14} color="#f59e0b" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{m.full_name || m.email || '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.role || 'member'}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: 'var(--success)' }}>{(m.status || 'active').toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── EDI Hub ──
  if (activeSection === 'edi') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button onClick={() => { haptic(); setActiveSection(null) }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
        </button>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Suspense fallback={<SectionLoader />}>
            <EDIDashboard />
          </Suspense>
        </div>
      </div>
    )
  }

  // ── AI Control Center ──
  if (activeSection === 'ai-dashboard') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button onClick={() => { haptic(); setActiveSection(null) }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
        </button>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Suspense fallback={<SectionLoader />}>
            <AIDispatchDashboard />
          </Suspense>
        </div>
      </div>
    )
  }

  // ── Q Operations ──
  if (activeSection === 'q-ops') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button onClick={() => { haptic(); setActiveSection(null) }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
        </button>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Suspense fallback={<SectionLoader />}>
            <QOperationsHub />
          </Suspense>
        </div>
      </div>
    )
  }

  if (activeSection === 'help') {
    const faqs = [
      { q: 'How do I add a load?', a: "Tap 'Add Load' on the Loads tab or snap a rate con." },
      { q: 'How do I invoice a broker?', a: 'When a load is delivered, Q auto-generates an invoice. View in Money tab.' },
      { q: 'How do I track my IFTA?', a: 'Go to More \u2192 IFTA Report. Log fuel purchases as expenses with state.' },
    ]
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button onClick={() => { haptic(); setActiveSection(null) }}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <ChevronRight size={14} color="var(--accent)" style={{ transform: 'rotate(180deg)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Back</span>
        </button>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16, letterSpacing: 1 }}>Help & Support</div>

          {/* Contact */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 12 }}>CONTACT US</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, marginBottom: 8 }}>
              <Ic icon={Mail} size={15} color="var(--accent)" />
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Email</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>hello@qivori.com</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
              <Ic icon={MessageCircle} size={15} color="var(--accent2)" />
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Talk to Q</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>Open Q from the home screen for AI assistance</div>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 12 }}>FAQ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {faqs.map(faq => (
                <div key={faq.q} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{faq.q}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{faq.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

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
      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{firstName[0]}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{profile?.full_name || user?.user_metadata?.full_name || 'Driver'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || ''}</div>
        </div>
      </div>

      {/* Q Live Negotiation */}
      <div style={{ marginBottom: 16 }}>
        <QLiveNegotiation variant="panel" />
      </div>

      {/* Q Activity Feed */}
      <div style={{ marginBottom: 16 }}>
        <QActivityFeed variant="panel" limit={20} />
      </div>

      {/* Driver Compliance Status */}
      {firstDriver && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '16px', marginBottom: 16, animation: 'fadeInUp 0.3s ease 0.1s both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Ic icon={Shield} size={13} color="var(--success)" />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--success)' }}>COMPLIANCE STATUS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              {
                label: 'CDL License',
                value: firstDriver.license_class || 'CDL-A',
                sub: firstDriver.license_state || '—',
                expiry: firstDriver.license_expiry,
              },
              {
                label: 'Medical Card',
                value: firstDriver.medical_card_expiry ? 'Active' : 'Unknown',
                expiry: firstDriver.medical_card_expiry,
              },
              {
                label: 'Equipment',
                value: firstDriver.equipment_experience || firstDriver.equipment || '—',
              },
              {
                label: 'Endorsements',
                value: firstDriver.endorsements || 'None on file',
              },
            ].map(item => {
              const isExpiring = item.expiry && new Date(item.expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              const isExpired = item.expiry && new Date(item.expiry) < new Date()
              const expiryColor = isExpired ? 'var(--danger)' : isExpiring ? 'var(--accent)' : 'var(--success)'
              return (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{item.value} {item.sub && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({item.sub})</span>}</div>
                  </div>
                  {item.expiry && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: expiryColor, fontWeight: 700 }}>
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
      )}

      {/* Menu items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MENU_ITEMS.map((item, index) => (
          <button key={item.id} onClick={() => { haptic(); item.nav ? onNavigate?.(item.nav) : setActiveSection(item.id) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", textAlign: 'left',
              transition: 'all 0.15s ease',
            }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
