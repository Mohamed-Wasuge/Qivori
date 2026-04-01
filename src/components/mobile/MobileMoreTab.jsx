import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { User, HelpCircle, LogOut, ChevronRight, Shield, Fuel, Mail, MessageCircle, ChevronDown, Upload, FileText, CheckCircle, XCircle, Clock, ClipboardCheck } from 'lucide-react'
import { Ic, haptic } from './shared'
import { apiFetch } from '../../lib/api'
import MobileIFTATab from './MobileIFTATab'
import { DVIRInspection } from './DriverMoreTab'

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
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1, marginBottom: 8, fontFamily: "'Bebas Neue',sans-serif" }}>RECENT INSPECTIONS</div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>No DVIRs yet. Complete a pre-trip to see history here.</div>
    </div>
  )

  return (
    <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1, marginBottom: 10, fontFamily: "'Bebas Neue',sans-serif" }}>RECENT INSPECTIONS</div>
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
  { id: 'dvir', label: 'Pre-Trip Inspection', sub: 'DOT DVIR — 46-point checklist', icon: ClipboardCheck, color: '#22c55e' },
  { id: 'compliance', label: 'Compliance', sub: 'ELD, DVIR, CSA, HOS', icon: Shield, color: 'var(--success)' },
  { id: 'ifta', label: 'IFTA Report', sub: 'Fuel tax calculator', icon: Fuel, color: '#8b5cf6' },
  { id: 'profile', label: 'Profile', sub: 'Your account details', icon: User, color: 'var(--accent)' },
  { id: 'help', label: 'Help & Support', sub: 'Get help from the team', icon: HelpCircle, color: 'var(--accent2)' },
]

export default function MobileMoreTab({ onNavigate }) {
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
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Profile</div>
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
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Compliance</div>
          {d ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {complianceItems.map(item => {
                const isExpiring = item.expiry && new Date(item.expiry) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                const isExpired = item.expiry && new Date(item.expiry) < new Date()
                const expiryColor = isExpired ? 'var(--danger)' : isExpiring ? '#f59e0b' : 'var(--success)'
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
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1, marginBottom: 10, fontFamily: "'Bebas Neue',sans-serif" }}>HOS STATUS</div>
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
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Help & Support</div>

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
      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, animation: 'fadeInUp 0.3s ease' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{firstName[0]}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{profile?.full_name || user?.user_metadata?.full_name || 'Driver'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || ''}</div>
        </div>
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
              const expiryColor = isExpired ? 'var(--danger)' : isExpiring ? '#f59e0b' : 'var(--success)'
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
          <button key={item.id} onClick={() => { haptic(); setActiveSection(item.id) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", textAlign: 'left',
              animation: `fadeInUp 0.25s ease ${index * 0.05}s both`,
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
