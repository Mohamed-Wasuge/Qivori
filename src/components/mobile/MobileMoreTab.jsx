import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { User, HelpCircle, LogOut, ChevronRight, Shield, Fuel } from 'lucide-react'
import { Ic, haptic } from './shared'
import MobileIFTATab from './MobileIFTATab'

const MENU_ITEMS = [
  { id: 'ifta', label: 'IFTA Report', sub: 'Fuel tax calculator', icon: Fuel, color: '#8b5cf6' },
  { id: 'profile', label: 'Profile', sub: 'Your account details', icon: User, color: 'var(--accent)' },
  { id: 'compliance', label: 'Compliance', sub: 'ELD, DVIR, CSA', icon: Shield, color: 'var(--success)' },
  { id: 'help', label: 'Help & Support', sub: 'Get help from the team', icon: HelpCircle, color: 'var(--accent2)' },
]

export default function MobileMoreTab() {
  const { logout, user, profile } = useApp()
  const ctx = useCarrier() || {}
  const drivers = ctx.drivers || []
  const firstDriver = drivers[0] // Current user's driver profile (if exists)
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
