/**
 * AutoOnboarding — first-run setup overlay for AutoShell
 *
 * Shown ONCE when a new OO opens the AutoShell and profile is missing
 * essential fields (equipment, home_base_city, factoring_company).
 *
 * 4 steps, 4 screens, swipe-style. Skippable. ~30 seconds total.
 *
 *   Step 1: Equipment (Dry Van / Reefer / Flatbed)
 *   Step 2: Home Base (city autocomplete)
 *   Step 3: Factoring Company (Apex / RTS / TBS / Triumph / OTR / Other / None)
 *   Step 4: Ready — "Tap to go online"
 *
 * Built premium: dark + gold, big tap targets, progress dots, haptics.
 */
import { useState, useCallback } from 'react'
import {
  Truck, Home, DollarSign, ChevronRight, ChevronLeft, Check,
  Snowflake, Package, X, Sparkles
} from 'lucide-react'
import { Ic, haptic } from '../mobile/shared'
import { useApp } from '../../context/AppContext'
import { updateProfile } from '../../lib/database'

const STEPS = ['equipment', 'home', 'factoring', 'ready']

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

export default function AutoOnboarding({ onComplete }) {
  const { user, showToast } = useApp()
  const [step, setStep] = useState(0)
  const [equipment, setEquipment] = useState('')
  const [homeCity, setHomeCity] = useState('')
  const [homeState, setHomeState] = useState('')
  const [factoring, setFactoring] = useState('')
  const [saving, setSaving] = useState(false)

  const next = useCallback(() => {
    haptic('light')
    if (step < STEPS.length - 1) setStep(step + 1)
  }, [step])

  const back = useCallback(() => {
    haptic('light')
    if (step > 0) setStep(step - 1)
  }, [step])

  const skip = useCallback(async () => {
    haptic('medium')
    // Mark onboarding complete with whatever they've provided so far
    try {
      await updateProfile({
        equipment: equipment || null,
        home_base_city: homeCity || null,
        home_base_state: homeState || null,
        factoring_company: factoring || null,
        auto_onboarded_at: new Date().toISOString(),
      })
    } catch {}
    onComplete?.()
  }, [equipment, homeCity, homeState, factoring, user, onComplete])

  const finish = useCallback(async () => {
    haptic('success')
    setSaving(true)
    try {
      await updateProfile({
        equipment: equipment || null,
        home_base_city: homeCity || null,
        home_base_state: homeState || null,
        factoring_company: factoring || null,
        auto_onboarded_at: new Date().toISOString(),
      })
      onComplete?.()
    } catch (e) {
      showToast?.('error', 'Could not save', 'Please try again')
      setSaving(false)
    }
  }, [equipment, homeCity, homeState, factoring, user, onComplete, showToast])

  return (
    <div style={SHELL}>
      {/* ─── Header — progress dots + skip ─────────────────────── */}
      <div style={HEADER}>
        <div style={DOTS}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              ...DOT,
              width: i === step ? 24 : 6,
              background: i <= step ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
              boxShadow: i === step ? '0 0 8px rgba(240,165,0,0.5)' : 'none',
            }} />
          ))}
        </div>
        <button onClick={skip} style={SKIP_BTN} aria-label="Skip onboarding">
          <Ic icon={X} size={18} color="rgba(255,255,255,0.6)" />
        </button>
      </div>

      {/* ─── Step body ─────────────────────────────────────────── */}
      <div style={BODY} key={step}>
        {step === 0 && (
          <StepEquipment value={equipment} onChange={(v) => { haptic('medium'); setEquipment(v) }} />
        )}
        {step === 1 && (
          <StepHomeBase
            city={homeCity}
            state={homeState}
            onChange={(c, s) => { setHomeCity(c); setHomeState(s) }}
          />
        )}
        {step === 2 && (
          <StepFactoring value={factoring} onChange={(v) => { haptic('medium'); setFactoring(v) }} />
        )}
        {step === 3 && (
          <StepReady />
        )}
      </div>

      {/* ─── Footer — back / next buttons ──────────────────────── */}
      <div style={FOOTER}>
        {step > 0 && (
          <button onClick={back} style={BACK_BTN} aria-label="Back">
            <Ic icon={ChevronLeft} size={20} color="rgba(255,255,255,0.7)" />
          </button>
        )}
        <button
          onClick={step === STEPS.length - 1 ? finish : next}
          disabled={
            saving ||
            (step === 0 && !equipment) ||
            (step === 1 && !homeCity) ||
            (step === 2 && !factoring)
          }
          style={{
            ...NEXT_BTN,
            opacity: saving ? 0.7 : 1,
          }}
          className="press-scale"
        >
          {saving ? (
            <span>Saving...</span>
          ) : step === STEPS.length - 1 ? (
            <>
              <span>GO TO Q</span>
              <Ic icon={Sparkles} size={18} color="#fff" />
            </>
          ) : (
            <>
              <span>CONTINUE</span>
              <Ic icon={ChevronRight} size={20} color="#fff" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 1 — EQUIPMENT
// ═══════════════════════════════════════════════════════════════
function StepEquipment({ value, onChange }) {
  return (
    <div style={STEP_WRAP}>
      <div style={STEP_KICKER}>STEP 1 OF 4</div>
      <h1 style={STEP_HEADLINE}>WHAT DO YOU HAUL?</h1>
      <p style={STEP_SUB}>Q only shows you loads matching your equipment.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 32 }}>
        {EQUIPMENT_OPTIONS.map((opt) => {
          const selected = value === opt.id
          const Icon = opt.icon
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              style={{
                ...BIG_CARD,
                background: selected ? `${opt.color}15` : 'rgba(255,255,255,0.03)',
                borderColor: selected ? opt.color : 'rgba(255,255,255,0.08)',
                boxShadow: selected ? `0 0 24px ${opt.color}33` : 'none',
              }}
              className="press-scale"
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `${opt.color}1f`,
                border: `1px solid ${opt.color}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={24} color={opt.color} strokeWidth={2.4} />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  {opt.sub}
                </div>
              </div>
              {selected && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: opt.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 16px ${opt.color}66`,
                }}>
                  <Check size={16} color="#fff" strokeWidth={3} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — HOME BASE
// ═══════════════════════════════════════════════════════════════
function StepHomeBase({ city, state, onChange }) {
  // Simple text inputs for now — Mapbox autocomplete is a Phase 2 polish
  return (
    <div style={STEP_WRAP}>
      <div style={STEP_KICKER}>STEP 2 OF 4</div>
      <h1 style={STEP_HEADLINE}>WHERE'S HOME?</h1>
      <p style={STEP_SUB}>So Q can route you home when you're ready to head in.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 32 }}>
        <div>
          <label style={INPUT_LABEL}>City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => onChange(e.target.value, state)}
            placeholder="Dallas"
            autoCapitalize="words"
            autoComplete="address-level2"
            style={INPUT}
          />
        </div>
        <div>
          <label style={INPUT_LABEL}>State</label>
          <input
            type="text"
            value={state}
            onChange={(e) => onChange(city, e.target.value.toUpperCase().slice(0, 2))}
            placeholder="TX"
            maxLength={2}
            autoCapitalize="characters"
            autoComplete="address-level1"
            style={INPUT}
          />
        </div>
      </div>

      <div style={HINT_CARD}>
        <Home size={16} color="var(--accent)" />
        <span>Q never tracks you when you're offline. We only use this to find loads heading toward home.</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 3 — FACTORING COMPANY
// ═══════════════════════════════════════════════════════════════
function StepFactoring({ value, onChange }) {
  return (
    <div style={STEP_WRAP}>
      <div style={STEP_KICKER}>STEP 3 OF 4</div>
      <h1 style={STEP_HEADLINE}>WHO FACTORS YOUR LOADS?</h1>
      <p style={STEP_SUB}>Q sends rate cons + signed BOLs to your factor automatically. Pick yours.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        {FACTORING_OPTIONS.map((opt) => {
          const selected = value === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
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

// ═══════════════════════════════════════════════════════════════
// STEP 4 — READY
// ═══════════════════════════════════════════════════════════════
function StepReady() {
  return (
    <div style={{ ...STEP_WRAP, alignItems: 'center', textAlign: 'center', justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
      <div style={READY_Q}>
        <span style={READY_Q_TEXT}>Q</span>
      </div>
      <div style={STEP_KICKER}>STEP 4 OF 4</div>
      <h1 style={{ ...STEP_HEADLINE, fontSize: 32, marginTop: 8 }}>YOU'RE IN.</h1>
      <p style={{ ...STEP_SUB, maxWidth: 320 }}>
        Tap <strong style={{ color: 'var(--accent)' }}>Go to Q</strong> below to see your dispatcher screen.
        Then tap <strong style={{ color: 'var(--accent)' }}>Go Online</strong> any time you're ready to work.
      </p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 24, fontWeight: 600, letterSpacing: 0.5 }}>
        Q stands for Quick.
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const SHELL = {
  position: 'fixed', inset: 0, zIndex: 9998,
  background: 'radial-gradient(ellipse at top, #0c0f17 0%, #07090e 60%)',
  display: 'flex', flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  fontFamily: "'DM Sans', sans-serif",
  color: '#fff',
  animation: 'fadeIn 0.4s ease',
}

const HEADER = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '20px 20px 8px',
}

const DOTS = {
  display: 'flex', alignItems: 'center', gap: 6,
}

const DOT = {
  height: 6, borderRadius: 3,
  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
}

const SKIP_BTN = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}

const BODY = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '24px 20px 16px',
  minHeight: 0,
  animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
}

const STEP_WRAP = {
  display: 'flex', flexDirection: 'column',
  maxWidth: 480, margin: '0 auto', width: '100%',
}

const STEP_KICKER = {
  fontSize: 11, fontWeight: 800,
  color: 'var(--accent)', letterSpacing: 1.5,
  textTransform: 'uppercase', marginBottom: 8,
}

const STEP_HEADLINE = {
  fontSize: 28, fontWeight: 900,
  color: '#fff', fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: 0.5, lineHeight: 1.05,
  margin: 0, marginBottom: 10,
}

const STEP_SUB = {
  fontSize: 14, color: 'rgba(255,255,255,0.55)',
  lineHeight: 1.5, margin: 0,
}

const BIG_CARD = {
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '16px 18px',
  borderRadius: 18,
  border: '1px solid',
  cursor: 'pointer',
  transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.3s ease, transform 0.1s ease',
  WebkitTapHighlightColor: 'transparent',
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
  padding: '16px 18px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  fontSize: 18, fontWeight: 700,
  color: '#fff',
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  transition: 'border-color 0.2s ease, background 0.2s ease',
  WebkitAppearance: 'none',
  boxSizing: 'border-box',
}

const HINT_CARD = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '12px 14px',
  marginTop: 20,
  background: 'rgba(240,165,0,0.06)',
  border: '1px solid rgba(240,165,0,0.2)',
  borderRadius: 12,
  fontSize: 11, color: 'rgba(255,255,255,0.65)',
  lineHeight: 1.5,
}

const FACTOR_ROW = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '14px 16px',
  borderRadius: 14,
  border: '1px solid',
  cursor: 'pointer',
  transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.1s ease',
  WebkitTapHighlightColor: 'transparent',
}

const READY_Q = {
  width: 132, height: 132, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 0 60px rgba(240,165,0,0.55), 0 12px 40px rgba(0,0,0,0.5)',
  animation: 'qBreath 2.8s ease-in-out infinite',
  margin: '20px auto 24px',
}

const READY_Q_TEXT = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 72, color: '#000',
  fontWeight: 800, lineHeight: 1, letterSpacing: -2,
}

const FOOTER = {
  flexShrink: 0,
  padding: '12px 20px 16px',
  display: 'flex', gap: 10,
  borderTop: '1px solid rgba(255,255,255,0.04)',
}

const BACK_BTN = {
  width: 56, height: 56, borderRadius: 16,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  flexShrink: 0,
}

const NEXT_BTN = {
  flex: 1, height: 56,
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  border: 'none', borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: 1.5,
  fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
  boxShadow: '0 8px 32px rgba(240,165,0,0.35)',
  transition: 'transform 0.15s ease, box-shadow 0.3s ease, opacity 0.2s ease',
  WebkitTapHighlightColor: 'transparent',
}
