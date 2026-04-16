/**
 * AutoSettingsDetail — shared detail screen for settings sub-pages
 *
 * One component handles all detail screens via the `which` prop:
 *   'equipment' | 'home' | 'factoring' | 'account' | 'card'
 *
 * Slides in from the right when activated. Single Save button at bottom.
 * Closes back to settings list on save or back tap.
 */
import { useState, useCallback, useEffect } from 'react'
import {
  ArrowLeft, Truck, Home, DollarSign, User, CreditCard, Check, Snowflake, Package
} from 'lucide-react'
import { Ic, haptic } from '../mobile/shared'
import { useApp } from '../../context/AppContext'
import { updateProfile } from '../../lib/database'

const EQUIPMENT_OPTIONS = [
  { id: 'Dry Van',  label: 'Dry Van',  sub: 'Most loads · easy starts',   icon: Truck,     color: '#f0a500' },
  { id: 'Reefer',   label: 'Reefer',   sub: 'Pays more · harder lanes',   icon: Snowflake, color: '#3b82f6' },
  { id: 'Flatbed',  label: 'Flatbed',  sub: 'Specialty · premium rates',  icon: Package,   color: '#22c55e' },
]

const FACTORING_OPTIONS = [
  { id: 'apex',      label: 'Apex Capital' },
  { id: 'rts',       label: 'RTS Financial' },
  { id: 'tbs',       label: 'TBS Factoring' },
  { id: 'triumph',   label: 'Triumph Business Capital' },
  { id: 'otr',       label: 'OTR Capital' },
  { id: 'other',     label: 'Other / Not listed' },
  { id: 'none',      label: "I don't have a factor yet" },
]

export default function AutoSettingsDetail({ which, onBack }) {
  const { profile, user, showToast } = useApp()
  const [equipment, setEquipment] = useState(profile?.equipment || '')
  const [homeCity, setHomeCity] = useState(profile?.home_base_city || '')
  const [homeState, setHomeState] = useState(profile?.home_base_state || '')
  const [factoring, setFactoring] = useState(profile?.factoring_company || '')
  const [name, setName] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)

  // Sync local state when profile loads/changes
  useEffect(() => {
    if (profile) {
      setEquipment(profile.equipment || '')
      setHomeCity(profile.home_base_city || '')
      setHomeState(profile.home_base_state || '')
      setFactoring(profile.factoring_company || '')
      setName(profile.full_name || '')
    }
  }, [profile])

  const meta = {
    equipment: { title: 'EQUIPMENT & LANES',   icon: Truck,      sub: 'What Q hunts for' },
    home:      { title: 'HOME BASE',           icon: Home,       sub: 'Where Q routes you home to' },
    factoring: { title: 'FACTORING COMPANY',   icon: DollarSign, sub: 'Who handles your payouts' },
    account:   { title: 'YOUR ACCOUNT',        icon: User,       sub: 'Profile and contact info' },
    card:      { title: 'PAYMENT METHOD',      icon: CreditCard, sub: 'Card on file for the 3% Q fee' },
  }[which] || { title: 'SETTINGS', icon: User, sub: '' }

  const handleSave = useCallback(async () => {
    if (saving) return
    haptic('success')
    setSaving(true)
    try {
      const updates = {}
      if (which === 'equipment') updates.equipment = equipment
      if (which === 'home') {
        updates.home_base_city = homeCity
        updates.home_base_state = homeState
      }
      if (which === 'factoring') updates.factoring_company = factoring
      if (which === 'account') updates.full_name = name

      if (Object.keys(updates).length > 0) {
        await updateProfile(updates)
      }
      showToast?.('success', 'Saved', `${meta.title.toLowerCase()} updated`)
      onBack?.()
    } catch (e) {
      showToast?.('error', 'Save failed', 'Please try again')
      setSaving(false)
    }
  }, [saving, which, equipment, homeCity, homeState, factoring, name, user, showToast, onBack, meta.title])

  return (
    <div style={SHELL}>
      {/* ─── Header bar ─────────────────────────────────────────── */}
      <div style={HEADER}>
        <button
          onClick={() => { haptic('light'); onBack?.() }}
          style={BACK_BTN}
          aria-label="Back"
        >
          <Ic icon={ArrowLeft} size={20} color="#fff" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>{meta.sub}</div>
          <div style={TITLE}>{meta.title}</div>
        </div>
      </div>

      {/* ─── Body ──────────────────────────────────────────────── */}
      <div style={BODY}>
        {which === 'equipment' && (
          <EquipmentForm value={equipment} onChange={setEquipment} />
        )}
        {which === 'home' && (
          <HomeForm
            city={homeCity}
            state={homeState}
            onCity={setHomeCity}
            onState={setHomeState}
          />
        )}
        {which === 'factoring' && (
          <FactoringForm value={factoring} onChange={setFactoring} />
        )}
        {which === 'account' && (
          <AccountForm name={name} onName={setName} email={profile?.email || user?.email} />
        )}
        {which === 'card' && (
          <CardSummary profile={profile} />
        )}
      </div>

      {/* ─── Save button ───────────────────────────────────────── */}
      {which !== 'card' && (
        <div style={FOOTER}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...SAVE_BTN, opacity: saving ? 0.6 : 1 }}
            className="press-scale"
          >
            {saving ? <span>Saving...</span> : (
              <>
                <Check size={20} color="#fff" strokeWidth={2.6} />
                <span>SAVE</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FORMS
// ═══════════════════════════════════════════════════════════════
function EquipmentForm({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={HELPER}>Q only shows you loads matching your equipment.</p>
      {EQUIPMENT_OPTIONS.map((opt) => {
        const selected = value === opt.id
        const Icon = opt.icon
        return (
          <button
            key={opt.id}
            onClick={() => { haptic('medium'); onChange(opt.id) }}
            style={{
              ...BIG_CARD,
              background: selected ? `${opt.color}15` : 'rgba(255,255,255,0.03)',
              borderColor: selected ? opt.color : 'rgba(255,255,255,0.08)',
              boxShadow: selected ? `0 0 24px ${opt.color}33` : 'none',
            }}
            className="press-scale"
          >
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: `${opt.color}1f`,
              border: `1px solid ${opt.color}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={22} color={opt.color} strokeWidth={2.4} />
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{opt.sub}</div>
            </div>
            {selected && (
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: opt.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={14} color="#fff" strokeWidth={3} />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function HomeForm({ city, state, onCity, onState }) {
  return (
    <div>
      <p style={HELPER}>Q routes you home when you're ready to head in.</p>
      <div style={{ marginBottom: 14 }}>
        <label style={INPUT_LABEL}>City</label>
        <input
          type="text"
          value={city}
          onChange={(e) => onCity(e.target.value)}
          placeholder="Dallas"
          autoCapitalize="words"
          style={INPUT}
        />
      </div>
      <div>
        <label style={INPUT_LABEL}>State</label>
        <input
          type="text"
          value={state}
          onChange={(e) => onState(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="TX"
          maxLength={2}
          autoCapitalize="characters"
          style={INPUT}
        />
      </div>
    </div>
  )
}

function FactoringForm({ value, onChange }) {
  return (
    <div>
      <p style={HELPER}>Q sends rate cons and signed BOLs to your factor automatically.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FACTORING_OPTIONS.map((opt) => {
          const selected = value === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => { haptic('medium'); onChange(opt.id) }}
              style={{
                ...FACTOR_ROW,
                background: selected ? 'rgba(240,165,0,0.12)' : 'rgba(255,255,255,0.03)',
                borderColor: selected ? 'rgba(240,165,0,0.4)' : 'rgba(255,255,255,0.06)',
              }}
              className="press-scale"
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: `2px solid ${selected ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
                background: selected ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {selected && <Check size={12} color="#000" strokeWidth={3.5} />}
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AccountForm({ name, onName, email }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <label style={INPUT_LABEL}>Full Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Quick Test Driver"
          autoCapitalize="words"
          style={INPUT}
        />
      </div>
      <div>
        <label style={INPUT_LABEL}>Email</label>
        <input type="email" value={email || ''} disabled style={{ ...INPUT, opacity: 0.5 }} />
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          Email changes coming soon. Contact support if you need to change yours.
        </p>
      </div>
    </div>
  )
}

function CardSummary({ profile }) {
  if (!profile?.payment_method_last4) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
        }}>
          <CreditCard size={22} color="rgba(255,255,255,0.5)" />
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
          No card on file
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', maxWidth: 260, margin: '0 auto', lineHeight: 1.5 }}>
          You'll be prompted to add one the next time Q books a load.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      padding: '20px 18px',
      background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(245,158,11,0.02))',
      border: '1px solid rgba(240,165,0,0.2)',
      borderRadius: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(240,165,0,0.4)',
        }}>
          <CreditCard size={22} color="#000" strokeWidth={2.4} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
            {profile.payment_method_brand || 'Card'} •••• {profile.payment_method_last4}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            Auto-charged 3% after each delivered load
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const SHELL = {
  position: 'fixed', inset: 0, zIndex: 9996,
  background: 'radial-gradient(ellipse at top, #0c0f17 0%, #07090e 60%)',
  display: 'flex', flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  fontFamily: "'DM Sans', sans-serif",
  color: '#fff',
  animation: 'settingsSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
}

const HEADER = {
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '20px 20px 20px',
}

const BACK_BTN = {
  width: 40, height: 40, borderRadius: 12,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  WebkitTapHighlightColor: 'transparent',
}

const SUB_LABEL = {
  fontSize: 11, fontWeight: 700,
  color: 'rgba(255,255,255,0.45)',
  letterSpacing: 1, textTransform: 'uppercase',
  marginBottom: 4,
}

const TITLE = {
  fontSize: 24, fontWeight: 900,
  color: '#fff', fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: 0.5, lineHeight: 1,
}

const BODY = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '8px 16px 24px',
  minHeight: 0,
}

const HELPER = {
  fontSize: 13, color: 'rgba(255,255,255,0.55)',
  lineHeight: 1.5, marginBottom: 16, marginTop: 0,
}

const BIG_CARD = {
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '14px 16px',
  borderRadius: 16,
  border: '1px solid',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease, transform 0.1s ease',
}

const FACTOR_ROW = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '14px 16px',
  borderRadius: 14,
  border: '1px solid',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'background 0.2s ease, border-color 0.2s ease',
}

const INPUT_LABEL = {
  display: 'block',
  fontSize: 10, fontWeight: 800,
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: 1.2, textTransform: 'uppercase',
  marginBottom: 8,
}

const INPUT = {
  width: '100%',
  padding: '14px 18px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  fontSize: 16, fontWeight: 600,
  color: '#fff',
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  WebkitAppearance: 'none',
  boxSizing: 'border-box',
}

const FOOTER = {
  flexShrink: 0,
  padding: '12px 16px 16px',
  borderTop: '1px solid rgba(255,255,255,0.04)',
}

const SAVE_BTN = {
  width: '100%',
  padding: '18px',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  border: 'none',
  borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  fontSize: 15, fontWeight: 900, color: '#fff',
  letterSpacing: 1.5, fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
  boxShadow: '0 8px 32px rgba(240,165,0,0.4)',
  WebkitTapHighlightColor: 'transparent',
  transition: 'transform 0.15s ease, opacity 0.2s ease',
}
