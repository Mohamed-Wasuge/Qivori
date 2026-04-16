/**
 * PlanPicker — pick a plan and activate it via Stripe Checkout
 *
 * Shown ONCE after signup (or any time profile.subscription_plan is null).
 * Tap a plan → POST /api/create-checkout → window.location.href = stripe url
 * → user enters card on Stripe → webhook stamps stripe_customer_id +
 * subscription_plan on profile → user returns to app and the picker
 * stops appearing.
 *
 * Three plans:
 *   - tms_pro          $79/mo first truck + $39 each additional
 *   - ai_dispatch      $199/mo first truck + $99 each additional
 *   - autonomous_fleet 3% per booked load (no monthly fee)
 *
 * Designed mobile-first, premium dark + gold. Drops the user straight into
 * the right shell after activation.
 */
import { useState, useCallback } from 'react'
import {
  Briefcase, Bot, Sparkles, Check, ArrowRight, CheckCircle, Zap
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { apiFetch } from '../lib/api'
import { PLAN_DISPLAY } from '../hooks/useSubscription'

const PLANS = [
  {
    id: 'tms_pro',
    name: 'TMS PRO',
    tagline: 'Core trucking management',
    price: `$${PLAN_DISPLAY.tms_pro.price}`,
    priceUnit: '/mo per truck',
    secondary: `$${PLAN_DISPLAY.tms_pro.extraTruck} each additional`,
    icon: Briefcase,
    color: PLAN_DISPLAY.tms_pro.color,
    features: [
      'Fleet & dispatch management',
      'Invoicing & factoring',
      'IFTA & compliance suite',
      'Driver portal & scorecards',
      'Document management',
      'Fuel optimizer',
    ],
  },
  {
    id: 'ai_dispatch',
    name: 'AI DISPATCH',
    tagline: 'Q assists, you approve',
    price: `$${PLAN_DISPLAY.ai_dispatch.price}`,
    priceUnit: '/mo first truck',
    secondary: `$${PLAN_DISPLAY.ai_dispatch.extraTruck} each additional`,
    icon: Bot,
    color: PLAN_DISPLAY.ai_dispatch.color,
    badge: 'POPULAR',
    features: [
      'Everything in TMS Pro',
      'AI load board & scoring',
      'Rate analysis & lane intel',
      'Broker risk intelligence',
      'Market & lane analysis',
      'AI dispatch suggestions',
    ],
  },
  {
    id: 'autonomous_fleet',
    name: 'AUTONOMOUS FLEET',
    tagline: 'Fully hands-free AI dispatch',
    price: '3%',
    priceUnit: 'per booked load',
    secondary: 'Only when Q books',
    icon: Sparkles,
    color: '#22c55e',
    badge: 'NO MONTHLY FEE',
    features: [
      'Everything in AI Dispatch',
      'Voice AI assistant',
      'Autonomous broker calling',
      'Auto rate negotiation',
      'Proactive load finding',
      'Auto booking & dispatch',
      'Zero manual work required',
    ],
  },
]

export default function PlanPicker({ onSkip }) {
  const { user, profile, showToast, logout } = useApp()
  const [redirecting, setRedirecting] = useState(null)

  const handlePick = useCallback(async (planId) => {
    if (redirecting) return
    setRedirecting(planId)
    try {
      const res = await apiFetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          email: profile?.email || user?.email,
          userId: user?.id,
          truckCount: 1,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        window.location.href = data.url
      } else {
        showToast?.('error', 'Checkout failed', data.error || 'Try again in a moment')
        setRedirecting(null)
      }
    } catch (e) {
      showToast?.('error', 'Checkout failed', 'Network error — please try again')
      setRedirecting(null)
    }
  }, [redirecting, user, profile, showToast])

  return (
    <div style={SHELL}>
      <div style={HEADER}>
        <div style={Q_BADGE}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#f0a500', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
            ALMOST DONE
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1.1 }}>
            PICK YOUR PLAN
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 8, lineHeight: 1.5, maxWidth: 480 }}>
            All plans get 14 days free. Cancel anytime. Q starts working the moment you activate.
          </div>
        </div>
      </div>

      <div style={BODY}>
        {PLANS.map((plan) => {
          const isLoading = redirecting === plan.id
          const Icon = plan.icon
          return (
            <button
              key={plan.id}
              onClick={() => handlePick(plan.id)}
              disabled={!!redirecting}
              style={{
                ...PLAN_CARD,
                borderColor: plan.color + '55',
                opacity: redirecting && !isLoading ? 0.5 : 1,
              }}
              className="press-scale"
            >
              {plan.badge && (
                <div style={{
                  position: 'absolute',
                  top: -10, right: 16,
                  background: `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`,
                  color: '#000',
                  fontSize: 9, fontWeight: 900,
                  padding: '4px 10px', borderRadius: 999,
                  letterSpacing: 0.8,
                  boxShadow: `0 4px 12px ${plan.color}55`,
                }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: `${plan.color}1a`,
                  border: `1px solid ${plan.color}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={26} color={plan.color} strokeWidth={2.2} />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                    {plan.tagline}
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14,
                paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{
                  fontSize: 36, fontWeight: 900,
                  color: plan.color,
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: 0.5, lineHeight: 1,
                }}>
                  {plan.price}
                </span>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                    {plan.priceUnit}
                  </div>
                  {plan.secondary && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                      {plan.secondary}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <CheckCircle size={14} color={plan.color} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'left', lineHeight: 1.4 }}>
                      {f}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{
                ...CTA_BUTTON,
                background: `linear-gradient(135deg, ${plan.color}, ${plan.color}dd)`,
                boxShadow: `0 8px 24px ${plan.color}40`,
              }}>
                {isLoading ? (
                  <span>Opening Stripe…</span>
                ) : (
                  <>
                    <Zap size={16} color="#fff" />
                    <span>START 14-DAY FREE TRIAL</span>
                    <ArrowRight size={16} color="#fff" />
                  </>
                )}
              </div>
            </button>
          )
        })}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
            Powered by Stripe · Cancel anytime · Bank-grade encryption
          </div>
          {onSkip && (
            <button onClick={onSkip} style={SKIP_BTN}>
              Skip for now — explore the app first
            </button>
          )}
          <button onClick={logout} style={{ ...SKIP_BTN, marginTop: 4 }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const SHELL = {
  position: 'fixed', inset: 0, zIndex: 9997,
  background: 'radial-gradient(ellipse at top, #0c0f17 0%, #07090e 60%)',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  fontFamily: "'DM Sans', sans-serif",
  color: '#fff',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  // Force dark theme tokens regardless of broader Qivori theme
  '--bg': '#07090e',
  '--text': '#ffffff',
  '--muted': 'rgba(255,255,255,0.5)',
  '--accent': '#f0a500',
}

const HEADER = {
  padding: '32px 24px 20px',
  textAlign: 'left',
  maxWidth: 600,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

const Q_BADGE = {
  width: 56, height: 56, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 0 40px rgba(240,165,0,0.4), 0 8px 24px rgba(0,0,0,0.4)',
  animation: 'qBreath 2.8s ease-in-out infinite',
}

const BODY = {
  padding: '0 16px 32px',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  maxWidth: 600,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

const PLAN_CARD = {
  position: 'relative',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid',
  borderRadius: 20,
  padding: '20px 18px',
  cursor: 'pointer',
  transition: 'transform 0.15s ease, opacity 0.2s ease, border-color 0.2s ease',
  WebkitTapHighlightColor: 'transparent',
  textAlign: 'left',
  width: '100%',
  fontFamily: "'DM Sans', sans-serif",
}

const CTA_BUTTON = {
  padding: '14px',
  borderRadius: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 13, fontWeight: 900, color: '#fff',
  letterSpacing: 0.8, fontFamily: "'DM Sans', sans-serif",
  border: 'none',
}

const SKIP_BTN = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.4)',
  fontSize: 11, fontWeight: 600,
  cursor: 'pointer',
  padding: '8px 16px',
  fontFamily: "'DM Sans', sans-serif",
  display: 'block',
  margin: '0 auto',
  WebkitTapHighlightColor: 'transparent',
}
