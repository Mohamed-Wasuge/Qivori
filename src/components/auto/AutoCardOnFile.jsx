/**
 * AutoCardOnFile — Stripe Checkout setup sheet
 *
 * Shown when:
 *   - OO has booked at least one load AND
 *   - profile.stripe_customer_id is not yet set
 *
 * Tap "Set up payment" → calls /api/create-checkout?planId=autonomous_fleet
 * → redirects to Stripe Checkout (hosted page) → user enters card →
 * Stripe creates customer + saves payment method → redirects back to
 * qivori.com → existing webhook stamps stripe_customer_id on profile.
 *
 * After return, AutoShell's gating condition (`!profile.stripe_customer_id`)
 * is false → this sheet stops appearing.
 *
 * No card form here — Stripe Checkout handles all card collection on
 * Stripe's PCI-compliant hosted page.
 */
import { useState, useCallback } from 'react'
import { CreditCard, Lock, Shield, X, ArrowRight } from 'lucide-react'
import { Ic, haptic } from '../mobile/shared'
import { useApp } from '../../context/AppContext'
import { apiFetch } from '../../lib/api'

export default function AutoCardOnFile({ onClose, loadAmount = 2500 }) {
  const { user, profile, showToast } = useApp()
  const [redirecting, setRedirecting] = useState(false)

  const handleSetup = useCallback(async () => {
    if (redirecting) return
    haptic('success')
    setRedirecting(true)
    try {
      const res = await apiFetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: 'autonomous_fleet',
          email: profile?.email || user?.email,
          userId: user?.id,
          truckCount: 1,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        // Stripe Checkout — full page redirect
        window.location.href = data.url
      } else {
        showToast?.('error', 'Setup failed', data.error || 'Could not start checkout')
        setRedirecting(false)
      }
    } catch (e) {
      showToast?.('error', 'Setup failed', 'Network error — please try again')
      setRedirecting(false)
    }
  }, [redirecting, user, profile, showToast])

  const fee = (loadAmount * 0.03).toFixed(0)

  return (
    <div style={OVERLAY}>
      <div style={SHEET}>
        <div style={HANDLE} />
        <button onClick={onClose} style={CLOSE_BTN} aria-label="Close">
          <Ic icon={X} size={18} color="rgba(255,255,255,0.6)" />
        </button>

        {/* Header */}
        <div style={{ padding: '8px 24px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
            ALMOST DONE
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1.1 }}>
            SET UP PAYMENT TO LOCK IN
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 10, lineHeight: 1.5 }}>
            Q just won you a <strong style={{ color: '#fff' }}>${loadAmount.toLocaleString()}</strong> load.
            Set up payment in 30 seconds so we can charge the 3% (${fee}) when it delivers.
            <strong style={{ color: '#fff' }}> We never charge until you deliver.</strong>
          </div>
        </div>

        {/* Stripe trust card */}
        <div style={{ padding: '8px 16px' }}>
          <div style={STRIPE_CARD}>
            <div style={STRIPE_LOGO_WRAP}>
              <Ic icon={CreditCard} size={28} color="#635bff" strokeWidth={2.4} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                Powered by Stripe
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                Bank-grade encryption. PCI compliant. Used by millions of businesses.
              </div>
            </div>
          </div>

          {/* Trust bullets */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <TrustBullet icon={Lock} text="3% only on loads Q books and you deliver — no monthly fee" />
            <TrustBullet icon={Shield} text="Cancel anytime · No long-term commitment" />
          </div>
        </div>

        {/* Setup button */}
        <div style={{ padding: '20px 16px 0' }}>
          <button
            onClick={handleSetup}
            disabled={redirecting}
            style={{ ...SETUP_BTN, opacity: redirecting ? 0.7 : 1 }}
            className="press-scale"
          >
            {redirecting ? (
              <span>Opening Stripe...</span>
            ) : (
              <>
                <span>SET UP PAYMENT</span>
                <Ic icon={ArrowRight} size={20} color="#fff" strokeWidth={2.6} />
              </>
            )}
          </button>
          <button onClick={onClose} style={LATER_BTN}>
            <span>I'll set this up later</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function TrustBullet({ icon: Icon, text }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      background: 'rgba(34,197,94,0.06)',
      border: '1px solid rgba(34,197,94,0.18)',
      borderRadius: 12,
    }}>
      <Icon size={14} color="#22c55e" />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>{text}</span>
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

const STRIPE_CARD = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '16px 18px',
  background: 'rgba(99, 91, 255, 0.06)',
  border: '1px solid rgba(99, 91, 255, 0.25)',
  borderRadius: 16,
}

const STRIPE_LOGO_WRAP = {
  width: 52, height: 52, borderRadius: 14,
  background: 'rgba(99, 91, 255, 0.12)',
  border: '1px solid rgba(99, 91, 255, 0.3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}

const SETUP_BTN = {
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

const LATER_BTN = {
  width: '100%',
  padding: '14px',
  background: 'transparent',
  border: 'none',
  marginTop: 8,
  fontSize: 12, fontWeight: 700,
  color: 'rgba(255,255,255,0.4)',
  fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}
