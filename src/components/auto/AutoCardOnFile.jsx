/**
 * AutoCardOnFile — collect payment method for the 3% Q fee
 *
 * Triggered when:
 *   - OO has booked at least one load AND
 *   - No payment_method_last4 on profile yet
 *
 * Phase 1 (this file): UI flow with stubbed save. The card form looks
 * production-ready, but we save only the last 4 digits to profile —
 * we DO NOT process a real charge yet.
 *
 * Phase 2: replace the stub with real Stripe Elements + a serverless
 * function that creates a Stripe customer + payment_method, stores the
 * Stripe IDs in profile, and charges via Stripe Charges API after each
 * load is delivered.
 *
 * Why stubbed: real Stripe integration requires API key setup, webhook
 * handling, and end-to-end testing that we can't do in a single build
 * pass. Better to ship the flow now and swap the backend later.
 */
import { useState, useCallback } from 'react'
import { CreditCard, Lock, Check, X } from 'lucide-react'
import { Ic, haptic } from '../mobile/shared'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'

export default function AutoCardOnFile({ onComplete, onClose, loadAmount = 2500 }) {
  const { user, showToast } = useApp()
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  // Format card number with spaces every 4 digits
  const formatCardNumber = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(.{4})/g, '$1 ').trim()
  }

  // Format expiry as MM/YY
  const formatExpiry = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 4)
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
  }

  const last4 = cardNumber.replace(/\D/g, '').slice(-4)
  const isValid = cardNumber.replace(/\D/g, '').length >= 13 && expiry.length === 5 && cvc.length >= 3 && name.trim().length > 0

  const handleSave = useCallback(async () => {
    if (!isValid || saving) return
    haptic('success')
    setSaving(true)
    try {
      // Phase 1 stub — save only the last 4 digits, never the full card
      // Phase 2: call serverless function that creates Stripe customer +
      // payment_method, store Stripe IDs (NOT card data) in profile.
      await supabase.from('profiles').update({
        payment_method_last4: last4,
        payment_method_brand: detectBrand(cardNumber),
        payment_method_added_at: new Date().toISOString(),
      }).eq('id', user.id)

      showToast?.('success', 'Card saved', `${detectBrand(cardNumber)} ending in ${last4}`)
      onComplete?.()
    } catch (e) {
      showToast?.('error', 'Save failed', 'Please try again')
      setSaving(false)
    }
  }, [isValid, saving, last4, cardNumber, user, showToast, onComplete])

  return (
    <div style={OVERLAY}>
      <div style={SHEET}>
        {/* Drag handle */}
        <div style={HANDLE} />

        {/* Close button */}
        <button onClick={onClose} style={CLOSE_BTN} aria-label="Close">
          <Ic icon={X} size={18} color="rgba(255,255,255,0.6)" />
        </button>

        {/* Header */}
        <div style={{ padding: '8px 24px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
            ALMOST DONE
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1.1 }}>
            ADD A CARD TO LOCK IT IN
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 10, lineHeight: 1.5 }}>
            Q just won you a <strong style={{ color: '#fff' }}>${loadAmount.toLocaleString()}</strong> load.
            Add a card so we can charge the 3% ({fmt(loadAmount * 0.03)}) when it delivers.
            We never charge until you deliver.
          </div>
        </div>

        {/* Form */}
        <div style={{ padding: '8px 16px 0' }}>
          <FormField
            label="CARDHOLDER NAME"
            value={name}
            onChange={setName}
            placeholder="Quick Test Driver"
            autoComplete="cc-name"
          />

          <FormField
            label="CARD NUMBER"
            value={cardNumber}
            onChange={(v) => setCardNumber(formatCardNumber(v))}
            placeholder="1234 5678 9012 3456"
            inputMode="numeric"
            autoComplete="cc-number"
            icon={CreditCard}
          />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <FormField
                label="EXPIRY"
                value={expiry}
                onChange={(v) => setExpiry(formatExpiry(v))}
                placeholder="MM/YY"
                inputMode="numeric"
                autoComplete="cc-exp"
              />
            </div>
            <div style={{ flex: 1 }}>
              <FormField
                label="CVC"
                value={cvc}
                onChange={(v) => setCvc(v.replace(/\D/g, '').slice(0, 4))}
                placeholder="123"
                inputMode="numeric"
                autoComplete="cc-csc"
              />
            </div>
          </div>
        </div>

        {/* Trust footer */}
        <div style={TRUST_FOOTER}>
          <Lock size={12} color="rgba(255,255,255,0.5)" />
          <span>
            Secured · We charge 3% only after you deliver. No subscription. No surprises.
          </span>
        </div>

        {/* Save button */}
        <div style={{ padding: '0 16px 16px' }}>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            style={{
              ...SAVE_BTN,
              opacity: isValid && !saving ? 1 : 0.5,
            }}
            className="press-scale"
          >
            {saving ? (
              <span>Saving...</span>
            ) : (
              <>
                <Check size={20} color="#fff" strokeWidth={2.6} />
                <span>SAVE CARD</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Brand detection — simple prefix check ──────────────────────
function detectBrand(num) {
  const digits = num.replace(/\D/g, '')
  if (/^4/.test(digits)) return 'Visa'
  if (/^5[1-5]/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (/^6(?:011|5)/.test(digits)) return 'Discover'
  return 'Card'
}

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

// ═══════════════════════════════════════════════════════════════
// FORM FIELD
// ═══════════════════════════════════════════════════════════════
function FormField({ label, value, onChange, placeholder, inputMode, autoComplete, icon: Icon }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={INPUT_LABEL}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          style={{
            ...INPUT,
            paddingRight: Icon ? 44 : 18,
          }}
        />
        {Icon && (
          <div style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Icon size={18} color="rgba(255,255,255,0.4)" />
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const OVERLAY = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: 'rgba(0,0,0,0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  fontFamily: "'DM Sans', sans-serif",
  animation: 'fadeIn 0.3s ease',
}

const SHEET = {
  background: 'linear-gradient(180deg, #0c0f17 0%, #07090e 100%)',
  borderRadius: '28px 28px 0 0',
  paddingTop: 12,
  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
  borderTop: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
  position: 'relative',
  animation: 'qOverlayIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  maxHeight: '92vh',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
}

const HANDLE = {
  width: 40, height: 4,
  background: 'rgba(255,255,255,0.2)',
  borderRadius: 2,
  margin: '0 auto 8px',
}

const CLOSE_BTN = {
  position: 'absolute',
  top: 16,
  right: 16,
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
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
  transition: 'border-color 0.2s ease',
}

const TRUST_FOOTER = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '12px 18px',
  margin: '8px 16px 16px',
  background: 'rgba(34,197,94,0.06)',
  border: '1px solid rgba(34,197,94,0.15)',
  borderRadius: 12,
  fontSize: 11, color: 'rgba(255,255,255,0.7)',
  lineHeight: 1.4,
}

const SAVE_BTN = {
  width: '100%',
  padding: '18px',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  border: 'none',
  borderRadius: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  fontSize: 16, fontWeight: 900, color: '#fff',
  letterSpacing: 1.2, fontFamily: "'DM Sans', sans-serif",
  boxShadow: '0 8px 32px rgba(240,165,0,0.4)',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'transform 0.15s ease, opacity 0.2s ease',
}
