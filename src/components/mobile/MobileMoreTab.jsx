import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { FileText, Settings, User, HelpCircle, LogOut, ChevronRight, Shield, Fuel } from 'lucide-react'
import { Ic, haptic, getQSystemState, fmt$ } from './shared'
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
  const qState = getQSystemState(ctx)
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

      {/* Q System Status */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '16px', marginBottom: 16, animation: 'qInsightSlide 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'qGlow 3s ease-in-out infinite' }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'var(--accent)', marginBottom: 2 }}>Q SYSTEM STATUS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: qState.color, animation: 'qStatusPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: qState.color }}>{qState.label}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            ['Loads', ctx.activeLoads?.length || 0, 'var(--accent)'],
            ['Revenue', fmt$(ctx.totalRevenue || 0), 'var(--success)'],
            ['Unpaid', ctx.unpaidInvoices?.length || 0, (ctx.unpaidInvoices?.length || 0) > 0 ? 'var(--danger)' : 'var(--muted)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MENU_ITEMS.map((item, index) => (
          <button key={item.id} onClick={() => { haptic(); setActiveSection(item.id) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
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
          border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, cursor: 'pointer',
          fontFamily: "'DM Sans',sans-serif",
        }}>
        <Ic icon={LogOut} size={15} color="var(--danger)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>Sign Out</span>
      </button>

      <div style={{ height: 20 }} />
    </div>
  )
}
