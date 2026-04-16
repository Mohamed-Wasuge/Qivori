/**
 * AutoSettings — settings root for the 3% plan user
 *
 * Six rows. Tapping a row opens AutoSettingsDetail as an overlay.
 */
import { useState, lazy, Suspense } from 'react'
import {
  User, Truck, Home, DollarSign, CreditCard, Bell, ArrowRightLeft, LogOut, ChevronRight
} from 'lucide-react'
import { Ic, haptic } from '../mobile/shared'
import { useApp } from '../../context/AppContext'
import { updateProfile } from '../../lib/database'

const AutoSettingsDetail = lazy(() => import('./AutoSettingsDetail'))

export default function AutoSettings() {
  const { profile, user, logout, showToast } = useApp()
  const [detailOpen, setDetailOpen] = useState(null) // null | 'equipment' | 'home' | 'factoring' | 'account' | 'card'

  const switchToTms = async () => {
    haptic('medium')
    try {
      await updateProfile({ experience: 'tms' })
      showToast?.('success', 'Switched to TMS', 'Reloading...')
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      showToast?.('error', 'Switch failed', 'Please try again')
    }
  }

  const handleLogout = () => {
    haptic('heavy')
    logout()
  }

  const open = (which) => () => { haptic('light'); setDetailOpen(which) }

  const cardSub = profile?.payment_method_last4
    ? `${profile.payment_method_brand || 'Card'} •••• ${profile.payment_method_last4}`
    : 'Add a card for the 3% Q fee'

  const homeSub = profile?.home_base_city
    ? `${profile.home_base_city}${profile.home_base_state ? ', ' + profile.home_base_state : ''}`
    : 'Where Q routes you home to'

  const factorSub = profile?.factoring_company
    ? `${profile.factoring_company.toUpperCase()}`
    : 'Set your factoring company'

  const rows = [
    { icon: User,          label: 'Account',          sub: profile?.email || user?.email,    onClick: open('account') },
    { icon: Truck,         label: 'Equipment & Lanes', sub: profile?.equipment || 'Set what Q hunts for', onClick: open('equipment') },
    { icon: Home,          label: 'Home Base',         sub: homeSub,                          onClick: open('home') },
    { icon: DollarSign,    label: 'Factoring Company', sub: factorSub,                        onClick: open('factoring') },
    { icon: CreditCard,    label: 'Payment Method',    sub: cardSub,                          onClick: open('card') },
    { icon: ArrowRightLeft, label: 'Switch to TMS',    sub: 'Use the full Qivori dashboard',  onClick: switchToTms },
    { icon: LogOut,        label: 'Log out',          sub: '',                                onClick: handleLogout, danger: true },
  ]

  const initials = (profile?.full_name || user?.email || 'Q').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={WRAP}>
      {/* Settings detail overlay */}
      {detailOpen && (
        <Suspense fallback={null}>
          <AutoSettingsDetail which={detailOpen} onBack={() => setDetailOpen(null)} />
        </Suspense>
      )}

      {/* Top bar */}
      <div style={TOP_BAR}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
          Settings
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1 }}>
          YOUR ACCOUNT
        </div>
      </div>

      {/* Profile card */}
      <div style={PROFILE_CARD}>
        <div style={AVATAR}>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#000', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
            {initials}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profile?.full_name || user?.email || 'Owner Operator'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: 0.5 }}>
              AUTONOMOUS · 3% per load
            </span>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={LIST}>
        {rows.map((row, i) => (
          <button
            key={i}
            onClick={row.onClick}
            style={{
              ...ROW,
              color: row.danger ? '#ef4444' : 'var(--text)',
            }}
            className="press-scale"
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: row.danger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${row.danger ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Ic icon={row.icon} size={16} color={row.danger ? '#ef4444' : 'rgba(255,255,255,0.7)'} />
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{row.label}</div>
              {row.sub && (
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.sub}
                </div>
              )}
            </div>
            <Ic icon={ChevronRight} size={16} color="rgba(255,255,255,0.25)" />
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={FOOTER}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textAlign: 'center' }}>
          QIVORI · Q stands for Quick
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────
const WRAP = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  minHeight: 0,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
}

const TOP_BAR = {
  padding: '20px 20px 12px',
  flexShrink: 0,
}

const PROFILE_CARD = {
  margin: '0 16px 20px',
  padding: '18px 18px',
  background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(245,158,11,0.02))',
  border: '1px solid rgba(240, 165, 0, 0.2)',
  borderRadius: 18,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
}

const AVATAR = {
  width: 52, height: 52, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 16px rgba(240, 165, 0, 0.4)',
  flexShrink: 0,
}

const LIST = {
  padding: '0 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const ROW = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '14px 16px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 14,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'background 0.2s ease, transform 0.1s ease',
  fontFamily: "'DM Sans', sans-serif",
}

const FOOTER = {
  marginTop: 'auto',
  padding: '24px 16px calc(env(safe-area-inset-bottom, 0px) + 24px)',
}
