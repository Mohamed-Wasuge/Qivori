/**
 * AutoShell — Autonomous Fleet (3% plan) mobile app
 *
 * Purpose-built shell for solo OOs who only want Q to dispatch.
 * No TMS surfaces. No fleet UI. Three screens: Home, Earnings, Settings.
 *
 * Activated when profiles.experience === 'auto'.
 * Existing TMS users (experience='tms') never see this shell.
 *
 * Built to feel like a million-dollar consumer app:
 *   - Glass-blur bottom nav (iOS-style)
 *   - Gold active indicator with glow
 *   - Haptic on every interaction
 *   - Spring transitions, no linear easing
 *   - Safe area aware (notch + home indicator)
 */
import { useState, lazy, Suspense, useEffect } from 'react'
import { Home as HomeIcon, DollarSign, Settings as SettingsIcon } from 'lucide-react'
import { Ic, haptic, mobileAnimations } from '../mobile/shared'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'

// Lazy-load tabs so the shell stays light
const AutoHome = lazy(() => import('./AutoHome'))
const AutoEarnings = lazy(() => import('./AutoEarnings'))
const AutoSettings = lazy(() => import('./AutoSettings'))
const AutoOnboarding = lazy(() => import('./AutoOnboarding'))
const AutoNegotiation = lazy(() => import('./AutoNegotiation'))
const AutoCardOnFile = lazy(() => import('./AutoCardOnFile'))

// ── Tab definitions ──────────────────────────────────────────────
const TABS = [
  { id: 'home',     label: 'Home',     icon: HomeIcon },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

// ── Loading state — premium, branded, no generic spinner ────────
function ShellLoader() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 40px rgba(240,165,0,0.4), 0 8px 24px rgba(0,0,0,0.4)',
        animation: 'qBreath 2s ease-in-out infinite',
      }}>
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 28, color: '#000', fontWeight: 800, lineHeight: 1,
        }}>Q</span>
      </div>
    </div>
  )
}

export default function AutoShell() {
  const { profile } = useApp()
  const ctx = useCarrier() || {}
  const [activeTab, setActiveTab] = useState('home')
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const [cardDismissed, setCardDismissed] = useState(false)

  // Show onboarding overlay if profile hasn't completed it yet
  const needsOnboarding = !!profile && !profile.auto_onboarded_at && !onboardingDismissed

  // Show card-on-file overlay if OO has booked at least one load but
  // hasn't added a payment method yet (and hasn't dismissed it this session)
  const hasBookedLoad = (ctx.loads || []).some((l) =>
    ['Booked', 'Dispatched', 'En Route To Pickup', 'Arrived Pickup', 'Loaded',
     'En Route', 'Arrived Delivery', 'Delivered'].includes(l.status)
  )
  // Real payment method check uses Stripe customer_id (set after Checkout
  // completes via stripe-webhook). Falls back to legacy payment_method_last4
  // so users who saved a fake card during the stub phase don't get re-prompted.
  const hasStripeCustomer = !!(profile?.stripe_customer_id || profile?.payment_method_last4)
  const needsCardOnFile =
    !!profile &&
    !hasStripeCustomer &&
    hasBookedLoad &&
    !cardDismissed &&
    !needsOnboarding
  const latestBookedAmount = (ctx.loads || []).find((l) => l.status === 'Booked')?.gross_pay || 2500

  // Switch tabs with haptic feedback + scroll-to-top
  const switchTab = (id) => {
    if (id === activeTab) return
    haptic('light')
    setActiveTab(id)
  }

  // Inject animations once
  useEffect(() => {
    const id = 'auto-shell-anims'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = mobileAnimations + AUTO_SHELL_ANIMS
    document.head.appendChild(style)
  }, [])

  return (
    <div style={SHELL}>
      {/* ─── Onboarding overlay — first run only ───────────────── */}
      {needsOnboarding && (
        <Suspense fallback={<ShellLoader />}>
          <AutoOnboarding onComplete={() => setOnboardingDismissed(true)} />
        </Suspense>
      )}

      {/* ─── Negotiation overlay — fires when a load is "Offered" ─ */}
      {!needsOnboarding && (
        <Suspense fallback={null}>
          <AutoNegotiation />
        </Suspense>
      )}

      {/* ─── Card on file overlay — first booked load only ─────── */}
      {needsCardOnFile && (
        <Suspense fallback={null}>
          <AutoCardOnFile
            loadAmount={latestBookedAmount}
            onComplete={() => setCardDismissed(true)}
            onClose={() => setCardDismissed(true)}
          />
        </Suspense>
      )}

      {/* ─── Active screen ─────────────────────────────────────── */}
      <div key={activeTab} style={SCREEN_WRAP}>
        <Suspense fallback={<ShellLoader />}>
          {activeTab === 'home'     && <AutoHome />}
          {activeTab === 'earnings' && <AutoEarnings />}
          {activeTab === 'settings' && <AutoSettings />}
        </Suspense>
      </div>

      {/* ─── Bottom nav — glass blur, gold active indicator ────── */}
      <nav style={NAV}>
        <div style={NAV_INNER}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  ...NAV_BTN,
                  color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.45)',
                }}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Icon with subtle scale on active */}
                <div style={{
                  transform: isActive ? 'scale(1.08) translateY(-1px)' : 'scale(1)',
                  transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  filter: isActive ? 'drop-shadow(0 0 8px rgba(240,165,0,0.5))' : 'none',
                }}>
                  <Ic icon={tab.icon} size={22} strokeWidth={isActive ? 2.4 : 2} />
                </div>

                {/* Label */}
                <span style={{
                  fontSize: 10,
                  fontWeight: isActive ? 800 : 600,
                  letterSpacing: 0.4,
                  marginTop: 4,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {tab.label}
                </span>

                {/* Active indicator — gold pill with glow */}
                {isActive && (
                  <div style={NAV_INDICATOR} />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────
const SHELL = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'radial-gradient(ellipse at top, #0c0f17 0%, #07090e 60%)',
  color: '#ffffff',
  fontFamily: "'DM Sans', sans-serif",
  overflow: 'hidden',
  // Force dark theme tokens regardless of the user's broader Qivori theme.
  // CSS custom properties cascade down the DOM tree, so any child component
  // (AutoHome, AutoNegotiation, AutoCardOnFile, etc.) that uses var(--bg)
  // will get the dark value here even though the legacy app may be on light.
  '--bg': '#07090e',
  '--surface': '#0c0f17',
  '--surface2': '#11141d',
  '--surface3': '#171b26',
  '--text': '#ffffff',
  '--muted': 'rgba(255, 255, 255, 0.5)',
  '--border': 'rgba(255, 255, 255, 0.08)',
  '--accent': '#f0a500',
  '--accent2': '#f59e0b',
  '--success': '#22c55e',
  '--danger': '#ef4444',
  '--warning': '#f0a500',
}

const SCREEN_WRAP = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
  animation: 'qTabFade 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
}

const NAV = {
  flexShrink: 0,
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  background: 'rgba(7, 9, 14, 0.72)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  borderTop: '0.5px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
}

const NAV_INNER = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  height: 64,
  padding: '0 8px',
}

const NAV_BTN = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  WebkitTapHighlightColor: 'transparent',
  transition: 'color 0.2s ease',
}

const NAV_INDICATOR = {
  position: 'absolute',
  top: 4,
  width: 28,
  height: 3,
  borderRadius: 2,
  background: 'linear-gradient(90deg, #f0a500, #f59e0b)',
  boxShadow: '0 0 12px rgba(240, 165, 0, 0.6)',
  animation: 'navIndicatorIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
}

// ─── Shell-specific animations ───────────────────────────────────
const AUTO_SHELL_ANIMS = `
  @keyframes navIndicatorIn {
    0%   { transform: scaleX(0); opacity: 0; }
    60%  { transform: scaleX(1.15); opacity: 1; }
    100% { transform: scaleX(1); opacity: 1; }
  }
`
