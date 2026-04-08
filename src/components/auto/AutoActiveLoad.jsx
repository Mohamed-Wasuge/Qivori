/**
 * AutoActiveLoad — the screen the OO sees when Q has booked a load
 *
 * Renders inside AutoHome whenever there's a load with status in
 * (Booked, Dispatched, En Route, At Pickup, Loaded, At Delivery).
 *
 * One decision per screen. Big tap targets. Status timeline at bottom.
 *
 * Status flow:
 *   Booked → Arrived Pickup → Loaded → Arrived Delivery → Delivered
 *
 * On "Delivered", the trigger in supabase-auto-experience.sql auto-calcs
 * commission_amount = gross * 0.03 and sets commission_status='pending'.
 */
import { useState, useCallback } from 'react'
import {
  Truck, Phone, Camera, CheckCircle, Package, MapPin, Navigation
} from 'lucide-react'
import { Ic, haptic, fmt$ } from '../mobile/shared'
import * as db from '../../lib/database'
import { useApp } from '../../context/AppContext'

// Status flow — drives the timeline + the big action button label
const FLOW = [
  { status: 'Booked',          next: 'En Route To Pickup',  buttonText: 'START DRIVING',     icon: Navigation },
  { status: 'En Route To Pickup', next: 'Arrived Pickup',   buttonText: 'ARRIVED AT PICKUP', icon: MapPin },
  { status: 'Arrived Pickup',  next: 'Loaded',              buttonText: 'MARK LOADED',       icon: Package },
  { status: 'Loaded',          next: 'Arrived Delivery',    buttonText: 'ARRIVED AT DELIVERY', icon: MapPin },
  { status: 'Arrived Delivery', next: 'Delivered',          buttonText: 'MARK DELIVERED',    icon: CheckCircle },
]

// Timeline pegs (collapses the more granular flow into 4 visual pegs)
const TIMELINE = [
  { label: 'Booked',    matches: ['Booked'] },
  { label: 'Pickup',    matches: ['En Route To Pickup', 'Arrived Pickup'] },
  { label: 'Loaded',    matches: ['Loaded', 'Arrived Delivery'] },
  { label: 'Delivered', matches: ['Delivered'] },
]

export default function AutoActiveLoad({ load }) {
  const { showToast } = useApp()
  const [updating, setUpdating] = useState(false)

  if (!load) return null

  const gross = Number(load.gross_pay || load.rate || 0)
  const miles = Number(load.miles || 0)
  const rpm = miles > 0 ? (gross / miles).toFixed(2) : '0.00'
  const origin = (load.origin || '?').split(',')[0]
  const dest = (load.destination || load.dest || '?').split(',')[0]
  const broker = load.broker_name || 'Broker'

  // Find current step in the flow
  const currentStep = FLOW.find((s) => s.status === load.status) || FLOW[0]

  // Find current timeline peg index
  const timelineIdx = TIMELINE.findIndex((peg) => peg.matches.includes(load.status))
  const safeTimelineIdx = timelineIdx === -1 ? 0 : timelineIdx

  // ── Advance load status ───────────────────────────────────────
  const advance = useCallback(async () => {
    if (updating) return
    haptic('success')
    setUpdating(true)
    try {
      const updates = { status: currentStep.next }
      // Stamp delivered_at when transitioning to Delivered so earnings
      // queries can sort and filter by it.
      if (currentStep.next === 'Delivered') {
        updates.delivered_at = new Date().toISOString()
      }
      await db.updateLoad(load.id, updates)
      showToast?.('success', 'Status updated', `${currentStep.next}`)
      // CarrierContext realtime will pick up the change and re-render
    } catch (e) {
      showToast?.('error', 'Update failed', 'Please try again')
    }
    setUpdating(false)
  }, [load.id, currentStep, updating, showToast])

  const callBroker = useCallback(() => {
    haptic('medium')
    const phone = load.broker_phone
    if (phone) {
      window.location.href = `tel:${phone}`
    } else {
      showToast?.('info', 'No broker phone', 'Q will reach out instead')
    }
  }, [load.broker_phone, showToast])

  const uploadBOL = useCallback(() => {
    haptic('medium')
    showToast?.('info', 'BOL upload', 'Camera flow coming soon')
    // TODO: wire to camera + Supabase storage upload
  }, [showToast])

  return (
    <div style={WRAP}>
      {/* ─── Top bar — broker + status ──────────────────────────── */}
      <div style={TOP_BAR}>
        <div style={Q_BADGE}>
          <span style={Q_TEXT}>Q</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>ACTIVE LOAD</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
            {load.status || 'Booked'}
          </div>
        </div>
        <div style={LIVE_PILL}>
          <div style={LIVE_DOT} />
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: '#22c55e' }}>LIVE</span>
        </div>
      </div>

      {/* ─── Route hero ─────────────────────────────────────────── */}
      <div style={ROUTE_WRAP}>
        <div style={ROUTE_CITY}>{origin}</div>
        <div style={ROUTE_SEP}>
          <div style={ROUTE_LINE} />
          <span style={ROUTE_MILES}>{miles} MI</span>
          <div style={ROUTE_LINE} />
        </div>
        <div style={ROUTE_CITY}>{dest}</div>
      </div>

      {/* ─── Numbers strip ──────────────────────────────────────── */}
      <div style={NUMBERS_STRIP}>
        <Stat label="RATE" value={fmt$(gross)} />
        <div style={STAT_DIVIDER} />
        <Stat label="RPM" value={`$${rpm}`} />
        <div style={STAT_DIVIDER} />
        <Stat label="BROKER" value={broker} small />
      </div>

      {/* ─── Status timeline ───────────────────────────────────── */}
      <div style={TIMELINE_WRAP}>
        <Timeline currentIdx={safeTimelineIdx} />
      </div>

      {/* ─── Big primary action button ─────────────────────────── */}
      <div style={ACTION_WRAP}>
        <button
          onClick={advance}
          disabled={updating || load.status === 'Delivered'}
          style={{
            ...BIG_ACTION,
            opacity: updating || load.status === 'Delivered' ? 0.6 : 1,
          }}
          className="press-scale"
        >
          <Ic icon={currentStep.icon} size={22} color="#fff" strokeWidth={2.6} />
          <span>
            {load.status === 'Delivered'
              ? 'DELIVERED — Q IS PROCESSING'
              : currentStep.buttonText}
          </span>
        </button>

        {/* ─── Secondary actions ─────────────────────────────── */}
        <div style={SECONDARY_ROW}>
          <button onClick={callBroker} style={SECONDARY_BTN} className="press-scale">
            <Ic icon={Phone} size={16} color="rgba(255,255,255,0.8)" />
            <span>Call broker</span>
          </button>
          <button onClick={uploadBOL} style={SECONDARY_BTN} className="press-scale">
            <Ic icon={Camera} size={16} color="rgba(255,255,255,0.8)" />
            <span>Upload BOL</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════
function Stat({ label, value, small }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: small ? 13 : 22,
        fontWeight: 900,
        color: '#fff',
        fontFamily: small ? "'DM Sans', sans-serif" : "'Bebas Neue', sans-serif",
        letterSpacing: small ? 0 : 0.5,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
    </div>
  )
}

function Timeline({ currentIdx }) {
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '0 12px' }}>
      {/* Background connecting line */}
      <div style={{ position: 'absolute', top: 11, left: 24, right: 24, height: 2, background: 'rgba(255,255,255,0.1)', zIndex: 0 }} />
      {/* Progress fill */}
      <div style={{
        position: 'absolute', top: 11, left: 24, height: 2,
        width: `calc(${(currentIdx / (TIMELINE.length - 1)) * 100}% - 24px)`,
        background: 'linear-gradient(90deg, #22c55e, #f0a500)',
        zIndex: 1,
        transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }} />
      {TIMELINE.map((peg, i) => {
        const done = i < currentIdx
        const current = i === currentIdx
        return (
          <div key={peg.label} style={{
            position: 'relative', zIndex: 2,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: done ? '#22c55e' : current ? '#f0a500' : 'rgba(255,255,255,0.08)',
              border: current ? '2px solid #f0a500' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: current ? '0 0 16px rgba(240,165,0,0.6)' : 'none',
              transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
              {done && <CheckCircle size={14} color="#fff" strokeWidth={3} />}
            </div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: current ? '#f0a500' : done ? '#22c55e' : 'rgba(255,255,255,0.4)',
              letterSpacing: 0.3,
            }}>
              {peg.label}
            </div>
          </div>
        )
      })}
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
}

const TOP_BAR = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '16px 20px 8px',
}

const Q_BADGE = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 16px rgba(240,165,0,0.35)',
  flexShrink: 0,
}

const Q_TEXT = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 18, color: '#000',
  fontWeight: 800, lineHeight: 1,
}

const SUB_LABEL = {
  fontSize: 11, fontWeight: 700,
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: 1.2, textTransform: 'uppercase',
}

const LIVE_PILL = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 999,
  background: 'rgba(34,197,94,0.12)',
  border: '1px solid rgba(34,197,94,0.35)',
}

const LIVE_DOT = {
  width: 6, height: 6, borderRadius: '50%',
  background: '#22c55e',
  boxShadow: '0 0 8px #22c55e',
  animation: 'qStatusPulse 1.6s ease-in-out infinite',
}

const ROUTE_WRAP = {
  textAlign: 'center',
  padding: '24px 20px 20px',
}

const ROUTE_CITY = {
  fontSize: 32, fontWeight: 900, color: '#fff',
  fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: 0.5, lineHeight: 1,
}

const ROUTE_SEP = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 12, margin: '14px 0',
}

const ROUTE_LINE = {
  width: 50, height: 1,
  background: 'rgba(255,255,255,0.15)',
}

const ROUTE_MILES = {
  fontSize: 12, fontWeight: 800,
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: 1.5,
}

const NUMBERS_STRIP = {
  display: 'flex',
  alignItems: 'center',
  margin: '0 16px 24px',
  padding: '18px 8px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 18,
}

const STAT_DIVIDER = {
  width: 1, height: 32,
  background: 'rgba(255,255,255,0.08)',
}

const TIMELINE_WRAP = {
  padding: '4px 16px 28px',
  flex: 1,
  display: 'flex',
  alignItems: 'flex-start',
}

const ACTION_WRAP = {
  padding: '0 16px 16px',
}

const BIG_ACTION = {
  width: '100%',
  padding: '20px',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  border: 'none',
  borderRadius: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  fontSize: 15, fontWeight: 900, color: '#fff',
  letterSpacing: 1, fontFamily: "'DM Sans', sans-serif",
  boxShadow: '0 12px 40px rgba(240,165,0,0.4)',
  cursor: 'pointer',
  marginBottom: 12,
  WebkitTapHighlightColor: 'transparent',
  transition: 'transform 0.15s ease, opacity 0.2s ease',
}

const SECONDARY_ROW = {
  display: 'flex',
  gap: 10,
}

const SECONDARY_BTN = {
  flex: 1,
  padding: '14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 12, fontWeight: 700,
  color: 'rgba(255,255,255,0.8)',
  fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'background 0.2s ease, transform 0.1s ease',
}
