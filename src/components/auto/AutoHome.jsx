/**
 * AutoHome — the heart of the Autonomous Fleet (3%) app
 *
 * Two states:
 *   1. OFFLINE — gray, calm, "Tap to go online" CTA
 *   2. ONLINE  — pulsing gold, Q activity feed, "Q is hunting"
 *
 * One decision on this screen: are you working or not.
 *
 * Premium details:
 *   - Q logo breathes (existing qBreath keyframe)
 *   - Status pill animates between states
 *   - Online toggle is the centerpiece — large, satisfying, haptic
 *   - Q activity rotates every 2.5s when online (reused pattern)
 *   - Earnings strip is secondary, sits at bottom
 *   - "Where to?" sheet pops up when going online
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search, Brain, Phone, TrendingUp, MapPin, Zap, Activity,
  Power, Home as HomeIcon, Navigation, ChevronRight, X
} from 'lucide-react'
import { Ic, haptic, fmt$ } from '../mobile/shared'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { supabase } from '../../lib/supabase'
import AutoActiveLoad from './AutoActiveLoad'

// ── Q activity messages — rotate when hunting ───────────────────
const Q_HUNTING_ACTIVITY = [
  { icon: Search,     msg: 'Scanning DAT load board' },
  { icon: Brain,      msg: 'Analyzing rate vs market average' },
  { icon: Phone,      msg: 'Checking 123Loadboard postings' },
  { icon: TrendingUp, msg: 'Comparing lane rates' },
  { icon: MapPin,     msg: 'Filtering by your equipment' },
  { icon: Zap,        msg: 'Reading broker emails' },
  { icon: Activity,   msg: 'Watching the market in real time' },
  { icon: Brain,      msg: 'Scoring 47 candidate loads' },
  { icon: Phone,      msg: 'Verifying broker credit' },
  { icon: Search,     msg: 'Hunting backhauls toward home' },
]

// ── Wrapper — fork between Active Load mode and Hunting/Offline mode ──
// This wrapper only calls ONE hook (useCarrier) before its conditional
// return, so we never violate Rules of Hooks. Each branch is its own
// component with its own complete hook tree.
export default function AutoHome() {
  const ctx = useCarrier() || {}
  const activeLoad = useMemo(() => {
    const loads = ctx.loads || []
    const ACTIVE_STATUSES = [
      'Booked', 'Dispatched', 'En Route To Pickup',
      'Arrived Pickup', 'Loaded', 'En Route', 'Arrived Delivery'
    ]
    return loads.find((l) => ACTIVE_STATUSES.includes(l.status)) || null
  }, [ctx.loads])

  if (activeLoad) return <AutoActiveLoad load={activeLoad} />
  return <AutoHomeHunting />
}

// ── Inner — the offline/hunting screen (only renders when no active load) ──
function AutoHomeHunting() {
  const { profile, user, showToast } = useApp()
  const ctx = useCarrier() || {}
  const [online, setOnline] = useState(profile?.auto_online || false)
  const [showWhereTo, setShowWhereTo] = useState(false)
  const [activityIdx, setActivityIdx] = useState(0)
  const [toggling, setToggling] = useState(false)

  // Sync local state when profile updates
  useEffect(() => {
    if (profile) setOnline(profile.auto_online || false)
  }, [profile?.auto_online])

  // Rotate activity feed when online
  useEffect(() => {
    if (!online) return
    const id = setInterval(() => {
      setActivityIdx((i) => (i + 1) % Q_HUNTING_ACTIVITY.length)
    }, 2500)
    return () => clearInterval(id)
  }, [online])

  // ── Earnings strip data (this week) ─────────────────────────
  const weeklyEarnings = useMemo(() => {
    const loads = ctx.loads || []
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const thisWeek = loads.filter((l) => {
      const d = new Date(l.delivered_at || l.created_at || 0).getTime()
      return d >= oneWeekAgo && ['Delivered', 'Paid', 'Invoiced', 'delivered', 'paid'].includes(l.status)
    })
    const gross = thisWeek.reduce((s, l) => s + Number(l.gross_pay || l.rate || 0), 0)
    const fee = gross * 0.03
    const net = gross - fee
    return { gross, fee, net, count: thisWeek.length }
  }, [ctx.loads])

  // ── Tap the big toggle ──────────────────────────────────────
  const handleToggle = useCallback(() => {
    if (toggling) return
    haptic(online ? 'medium' : 'success')
    if (!online) {
      // Going online → show "Where to?" sheet first
      setShowWhereTo(true)
    } else {
      // Going offline → confirm + update
      setOnline(false)
      goOffline()
    }
  }, [online, toggling])

  const goOffline = async () => {
    setToggling(true)
    try {
      await supabase.from('profiles').update({ auto_online: false }).eq('id', user.id)
    } catch (e) {
      showToast?.('error', 'Could not go offline', 'Please try again')
    }
    setToggling(false)
  }

  const goOnline = async (intent, destination) => {
    setToggling(true)
    haptic('success')
    try {
      await supabase.from('profiles').update({
        auto_online: true,
        auto_intent: intent,
        auto_intent_destination: destination || null,
        location_updated_at: new Date().toISOString(),
      }).eq('id', user.id)
      setOnline(true)
      setShowWhereTo(false)
    } catch (e) {
      showToast?.('error', 'Could not go online', 'Please try again')
    }
    setToggling(false)
  }

  return (
    <div style={WRAP}>
      {/* ─── Top bar — safe area + Q badge + status pill ─────── */}
      <div style={TOP_BAR}>
        <div style={Q_BADGE_SMALL}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Qivori · Autonomous
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: online ? '#22c55e' : 'rgba(255,255,255,0.45)' }}>
            {online ? 'Q is hunting' : 'You are offline'}
          </div>
        </div>
        <StatusPill online={online} />
      </div>

      {/* ─── Center stage — Q logo + state ─────────────────────── */}
      <div style={CENTER}>
        <QHero online={online} />

        {/* Activity / status text */}
        <div style={{ marginTop: 32, textAlign: 'center', minHeight: 60 }}>
          {online ? (
            <ActivityRotator activity={Q_HUNTING_ACTIVITY[activityIdx]} idx={activityIdx} />
          ) : (
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', lineHeight: 1.2, marginBottom: 8, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>
                Q IS YOUR DISPATCHER
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, padding: '0 32px' }}>
                Tap below to go online and let Q find, negotiate, and book your next load.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Big online toggle ─────────────────────────────────── */}
      <div style={TOGGLE_WRAP}>
        <button
          onClick={handleToggle}
          disabled={toggling}
          style={{
            ...TOGGLE_BTN,
            background: online
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #f0a500, #f59e0b)',
            boxShadow: online
              ? '0 12px 40px rgba(239, 68, 68, 0.4), 0 0 0 0 rgba(239,68,68,0.4)'
              : '0 12px 40px rgba(240, 165, 0, 0.45), 0 4px 16px rgba(0,0,0,0.4)',
            opacity: toggling ? 0.7 : 1,
          }}
          className="press-scale"
        >
          <Ic icon={Power} size={22} color="#fff" strokeWidth={2.6} />
          <span>{online ? 'GO OFFLINE' : 'GO ONLINE'}</span>
        </button>
      </div>

      {/* ─── Earnings strip ─────────────────────────────────────── */}
      <EarningsStrip earnings={weeklyEarnings} />

      {/* ─── "Where to?" bottom sheet ───────────────────────────── */}
      {showWhereTo && (
        <WhereToSheet
          profile={profile}
          onClose={() => { haptic('light'); setShowWhereTo(false) }}
          onPick={goOnline}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function StatusPill({ online }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      borderRadius: 999,
      background: online ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255,255,255,0.06)',
      border: `1px solid ${online ? 'rgba(34, 197, 94, 0.35)' : 'rgba(255,255,255,0.1)'}`,
      transition: 'all 0.3s ease',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: online ? '#22c55e' : 'rgba(255,255,255,0.4)',
        boxShadow: online ? '0 0 8px #22c55e' : 'none',
        animation: online ? 'qStatusPulse 1.6s ease-in-out infinite' : 'none',
      }} />
      <span style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 1,
        color: online ? '#22c55e' : 'rgba(255,255,255,0.5)',
      }}>
        {online ? 'LIVE' : 'OFF'}
      </span>
    </div>
  )
}

function QHero({ online }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer pulse rings — only when online */}
      {online && (
        <>
          <div style={{ ...PULSE_RING, animationDelay: '0s' }} />
          <div style={{ ...PULSE_RING, animationDelay: '0.7s' }} />
          <div style={{ ...PULSE_RING, animationDelay: '1.4s' }} />
        </>
      )}

      {/* Q logo */}
      <div style={{
        width: 132, height: 132, borderRadius: '50%',
        background: online
          ? 'linear-gradient(135deg, #f0a500, #f59e0b)'
          : 'linear-gradient(135deg, rgba(240,165,0,0.3), rgba(245,158,11,0.2))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: online
          ? '0 0 60px rgba(240, 165, 0, 0.55), 0 12px 40px rgba(0,0,0,0.5)'
          : '0 8px 24px rgba(0,0,0,0.4)',
        border: online ? 'none' : '1px solid rgba(255,255,255,0.06)',
        animation: online ? 'qBreath 2.8s ease-in-out infinite' : 'none',
        transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <span style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 72,
          color: online ? '#000' : 'rgba(255,255,255,0.5)',
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: -2,
        }}>Q</span>
      </div>
    </div>
  )
}

function ActivityRotator({ activity, idx }) {
  const Icon = activity.icon
  return (
    <div key={idx} style={{ animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        background: 'rgba(34, 197, 94, 0.08)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: 999,
        marginBottom: 10,
      }}>
        <Ic icon={Icon} size={14} color="#22c55e" />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', letterSpacing: 0.3 }}>
          {activity.msg}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>
        Q will alert you the moment a load is worth taking.
      </div>
    </div>
  )
}

function EarningsStrip({ earnings }) {
  return (
    <div style={STRIP}>
      <div style={{ flex: 1, padding: '14px 18px' }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
          This Week
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
            {fmt$(earnings.net)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            net · {earnings.count} load{earnings.count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>
        <ChevronRight size={18} />
      </div>
    </div>
  )
}

// ── Where to? bottom sheet ─────────────────────────────────────
function WhereToSheet({ profile, onClose, onPick }) {
  const homeBase = profile?.home_base_city
    ? `${profile.home_base_city}${profile.home_base_state ? ', ' + profile.home_base_state : ''}`
    : null

  const options = [
    {
      id: 'anywhere',
      icon: Navigation,
      title: 'Anywhere',
      sub: 'Maximum load options · Q hunts in every direction',
      color: '#f0a500',
    },
    {
      id: 'home',
      icon: HomeIcon,
      title: homeBase ? `Toward home — ${homeBase}` : 'Toward home',
      sub: homeBase ? 'Q filters loads heading toward your home base' : 'Set your home base in Settings first',
      color: '#22c55e',
      disabled: !homeBase,
    },
    {
      id: 'specific',
      icon: MapPin,
      title: 'Specific destination',
      sub: 'Tell Q exactly where you want to head',
      color: '#3b82f6',
    },
  ]

  return (
    <div style={SHEET_BACKDROP} onClick={onClose}>
      <div style={SHEET} onClick={(e) => e.stopPropagation()}>
        {/* Drag handle */}
        <div style={SHEET_HANDLE} />

        {/* Header */}
        <div style={{ padding: '8px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
              Going Online
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1.1 }}>
              WHERE TO NEXT?
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
            className="press-scale"
          >
            <Ic icon={X} size={18} color="rgba(255,255,255,0.6)" />
          </button>
        </div>

        {/* Options */}
        <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              disabled={opt.disabled}
              onClick={() => { haptic('medium'); onPick(opt.id) }}
              style={{
                ...SHEET_OPT,
                opacity: opt.disabled ? 0.4 : 1,
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
              }}
              className={opt.disabled ? '' : 'press-scale'}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: `${opt.color}1a`,
                border: `1px solid ${opt.color}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Ic icon={opt.icon} size={22} color={opt.color} />
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>
                  {opt.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, fontWeight: 500 }}>
                  {opt.sub}
                </div>
              </div>
              <Ic icon={ChevronRight} size={18} color="rgba(255,255,255,0.3)" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const WRAP = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  minHeight: 0,
  overflow: 'hidden',
  position: 'relative',
}

const TOP_BAR = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '16px 20px 8px',
}

const Q_BADGE_SMALL = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 16px rgba(240, 165, 0, 0.35)',
  flexShrink: 0,
}

const CENTER = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  minHeight: 0,
}

const PULSE_RING = {
  position: 'absolute',
  width: 132, height: 132,
  borderRadius: '50%',
  border: '2px solid rgba(240, 165, 0, 0.4)',
  animation: 'ringExpand 2.4s ease-out infinite',
}

const TOGGLE_WRAP = {
  padding: '8px 24px 16px',
  display: 'flex',
  justifyContent: 'center',
}

const TOGGLE_BTN = {
  width: '100%',
  maxWidth: 340,
  padding: '20px 32px',
  border: 'none',
  borderRadius: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: 1.5,
  color: '#fff',
  fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
  transition: 'transform 0.15s ease, box-shadow 0.3s ease, background 0.4s ease',
  WebkitTapHighlightColor: 'transparent',
}

const STRIP = {
  margin: '0 16px 16px',
  display: 'flex',
  alignItems: 'center',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 16,
  marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
}

const SHEET_BACKDROP = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  zIndex: 9999,
  animation: 'qOverlayDim 0.3s ease',
}

const SHEET = {
  background: 'linear-gradient(180deg, #0c0f17 0%, #07090e 100%)',
  borderRadius: '28px 28px 0 0',
  paddingTop: 12,
  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
  boxShadow: '0 -20px 60px rgba(0, 0, 0, 0.6)',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  animation: 'qOverlayIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
}

const SHEET_HANDLE = {
  width: 40, height: 4,
  background: 'rgba(255, 255, 255, 0.2)',
  borderRadius: 2,
  margin: '0 auto 8px',
}

const SHEET_OPT = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '14px 16px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 16,
  width: '100%',
  cursor: 'pointer',
  transition: 'background 0.2s ease, transform 0.1s ease',
  WebkitTapHighlightColor: 'transparent',
}
