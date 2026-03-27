import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import {
  User, Shield, FileText, DollarSign, TrendingUp, LogOut,
  ChevronRight, Fuel, HelpCircle, Mail, MessageCircle,
  CheckCircle, Clock, AlertTriangle, Package, Truck, Navigation,
  CreditCard, Heart, Upload, Camera
} from 'lucide-react'
import { Ic, haptic, fmt$ } from './shared'
import MobileIFTATab from './MobileIFTATab'

function calcDriverPay(revenue, miles, driver) {
  if (driver?.pay_model && driver?.pay_rate) {
    const rate = Number(driver.pay_rate) || 0
    if (driver.pay_model === 'percent') return revenue * (rate / 100)
    if (driver.pay_model === 'permile') return (miles || 0) * rate
    if (driver.pay_model === 'flat') return rate
  }
  return revenue * 0.28
}

export default function DriverMoreTab() {
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
    : '28% of gross (default)'

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

  // ── PROFILE Section ──
  if (activeSection === 'profile') {
    const d = myDriver || {}
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackButton />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>My Profile</div>

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

          {/* Personal Info */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 10 }}>PERSONAL INFO</div>
            {[
              ['Phone', profile?.phone || d.phone || '—'],
              ['Address', d.address || '—'],
              ['DOB', d.dob || '—'],
              ['Emergency Contact', d.emergency_name || d.emergency_contact || '—'],
              ['Emergency Phone', d.emergency_phone || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'right', maxWidth: '55%' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* CDL & Qualifications */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 10 }}>CDL & QUALIFICATIONS</div>
            {[
              ['CDL Number', d.cdl_number || d.license_number || '•••••'],
              ['CDL Class', d.license_class || d.cdl_class || 'A'],
              ['CDL State', d.license_state || d.cdl_state || '—'],
              ['CDL Expiry', d.license_expiry || d.cdl_expiration || '—'],
              ['Endorsements', d.endorsements || 'None'],
              ['Medical Card Expiry', d.medical_card_expiry || d.medical_card_expiration || '—'],
              ['Equipment Experience', d.equipment_experience || d.equipment || '—'],
              ['Years Experience', d.years_experience || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Company */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 10 }}>COMPANY</div>
            {[
              ['Company', company.name || company.company_name || '—'],
              ['MC #', company.mc_number || company.mc || '—'],
              ['DOT #', company.dot_number || company.dot || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
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
              <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>YTD Earnings</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(stats.totalPay)}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>YTD Miles</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif" }}>{stats.totalMiles.toLocaleString()}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>YTD Loads</div>
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

  // ── PACKETS / DOCUMENTS Section ──
  if (activeSection === 'packets') {
    const d = myDriver || {}
    const docs = [
      { label: 'CDL — Front', field: 'cdl_front_url', icon: CreditCard },
      { label: 'CDL — Back', field: 'cdl_back_url', icon: CreditCard },
      { label: 'Medical Card', field: 'medical_card_url', icon: Heart },
      { label: 'W-9 Form', field: 'w9_url', icon: FileText },
      { label: 'Proof of Insurance', field: 'insurance_url', icon: Shield },
      { label: 'MVR Authorization', field: 'mvr_auth_url', icon: FileText },
      { label: 'Drug & Alcohol Consent', field: 'drug_consent_url', icon: Shield },
      { label: 'Direct Deposit Form', field: 'deposit_form_url', icon: DollarSign },
      { label: 'Profile Photo', field: 'photo_url', icon: Camera },
    ]
    const uploadedCount = docs.filter(doc => d[doc.field]).length
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackButton />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>My Packets</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Driver qualification documents</div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: uploadedCount === docs.length ? 'rgba(0,212,170,0.12)' : 'rgba(245,158,11,0.12)',
              color: uploadedCount === docs.length ? 'var(--success)' : '#f59e0b',
            }}>
              {uploadedCount}/{docs.length} complete
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: uploadedCount === docs.length ? 'var(--success)' : 'var(--accent)',
              width: `${(uploadedCount / docs.length) * 100}%`,
              transition: 'width 0.5s ease',
            }} />
          </div>

          {docs.map((doc, i) => {
            const hasFile = !!myDriver?.[doc.field]
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
                    {hasFile ? 'Uploaded' : 'Missing'}
                  </div>
                </div>
                {hasFile ? (
                  <button onClick={() => window.open(myDriver[doc.field], '_blank')}
                    style={{ padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif" }}>
                    View
                  </button>
                ) : (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'qStatusPulse 2s infinite' }} />
                )}
              </div>
            )
          })}

          {uploadedCount < docs.length && (
            <div style={{
              marginTop: 12, padding: '12px 14px',
              background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)',
              borderRadius: 10, textAlign: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                Missing documents? Contact your dispatcher or re-submit via the onboarding link.
              </span>
            </div>
          )}
        </div>
      </div>
    )
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
      { q: 'How do I update my load status?', a: 'Go to My Loads, tap the load, then tap "Update Status" or use the advance button.' },
      { q: 'Where do I upload BOL/POD?', a: 'Tap a delivered load → "Upload BOL" or "Upload POD" in the Get Paid section.' },
      { q: 'When do I get paid?', a: 'Your carrier processes settlements after loads are delivered and invoiced. Check the Pay tab.' },
      { q: 'How is detention calculated?', a: '2 hours free time at pickup/delivery. After that, $75/hr is tracked automatically.' },
    ]
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackButton />
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Help & Support</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 12 }}>CONTACT</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, marginBottom: 8 }}>
              <Ic icon={Mail} size={15} color="var(--accent)" />
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Email</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>support@qivori.com</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
              <Ic icon={MessageCircle} size={15} color="var(--accent)" />
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Talk to Q</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>Tap the Q button for AI help</div>
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 12 }}>FAQ</div>
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
    { id: 'profile', label: 'My Profile', sub: 'Personal info, CDL, qualifications', icon: User, color: 'var(--accent)' },
    { id: 'payroll', label: 'Payroll', sub: 'Weekly pay breakdown & YTD', icon: DollarSign, color: 'var(--success)' },
    { id: 'packets', label: 'My Packets', sub: 'DQ file — documents & uploads', icon: FileText, color: '#8b5cf6' },
    { id: 'compliance', label: 'Compliance', sub: 'CDL, medical card, drug test', icon: Shield, color: 'var(--success)' },
    { id: 'ifta', label: 'IFTA Report', sub: 'Fuel tax calculator', icon: Fuel, color: '#8b5cf6' },
    { id: 'help', label: 'Help & Support', sub: 'FAQ & contact', icon: HelpCircle, color: 'var(--accent)' },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16 }}>

      {/* Driver profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, animation: 'fadeInUp 0.3s ease' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{firstName[0]}</span>
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
            <div style={{ fontSize: 7, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</div>
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
