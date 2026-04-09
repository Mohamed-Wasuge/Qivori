/**
 * AutoLoopOffer — premium fullscreen overlay showing a Q Profit Loop
 *
 * This is the leapfrog feature. While Otto/TruckSmarter show single
 * loads, Q presents a multi-leg route (e.g. ATL → DFW → PHX → ATL)
 * with whole-week profit math. Driver accepts the entire loop with
 * one tap; Q books each leg in sequence and protects the whole route.
 *
 * Props: { loop, onPass, onAccept, onClose }
 *   loop: {
 *     loop_id, loop_name, total_gross, total_net, total_miles,
 *     total_fee, fuel_cost, estimated_profit, avg_rpm,
 *     loop_confidence, legs: [{ sequence, origin_city, destination_city,
 *                                miles, rate, rpm, broker_name }]
 *   }
 */
import { useState, useCallback } from 'react'
import {
  X, MapPin, ArrowRight, CheckCircle, Phone, TrendingUp, Fuel, Clock
} from 'lucide-react'
import { Ic, haptic, fmt$ } from '../mobile/shared'

export default function AutoLoopOffer({ loop, onPass, onAccept, onClose }) {
  const [accepting, setAccepting] = useState(false)

  if (!loop) return null

  const handleAccept = useCallback(() => {
    if (accepting) return
    haptic('success')
    setAccepting(true)
    onAccept?.(loop)
  }, [loop, accepting, onAccept])

  const handlePass = useCallback(() => {
    haptic('light')
    onPass?.(loop)
  }, [loop, onPass])

  // Verdict color based on confidence
  const verdictColor = loop.loop_confidence >= 85 ? '#22c55e'
                     : loop.loop_confidence >= 70 ? '#f0a500'
                     : '#ef4444'
  const verdictLabel = loop.loop_confidence >= 85 ? 'STRONG LOOP'
                     : loop.loop_confidence >= 70 ? 'GOOD LOOP'
                     : 'CAUTION'

  return (
    <div style={OVERLAY}>
      {/* ─── Header ─────────────────────────────────────────── */}
      <div style={HEADER}>
        <div style={{ ...Q_BADGE, width: 48, height: 48 }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Q built you a loop</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{loop.leg_count || loop.legs?.length || 0} legs · {loop.total_miles} mi</div>
        </div>
        <button onClick={onClose || handlePass} style={CLOSE_BTN} aria-label="Close">
          <Ic icon={X} size={18} color="rgba(255,255,255,0.6)" />
        </button>
      </div>

      {/* ─── Scrollable body ─────────────────────────────────── */}
      <div style={BODY}>
        {/* Loop verdict */}
        <div style={{
          background: `linear-gradient(135deg, ${verdictColor}22, ${verdictColor}08)`,
          border: `1.5px solid ${verdictColor}55`,
          borderRadius: 16, padding: '14px 16px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.2 }}>Q SAYS</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: verdictColor, letterSpacing: 0.5 }}>{verdictLabel}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.2 }}>CONFIDENCE</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{loop.loop_confidence}%</div>
            </div>
          </div>
        </div>

        {/* Loop name (route summary) */}
        <div style={LOOP_NAME}>{loop.loop_name}</div>

        {/* Profit hero card */}
        <div style={PROFIT_HERO}>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 6 }}>
            ESTIMATED PROFIT
          </div>
          <div style={{
            fontSize: 56, fontWeight: 900, color: '#22c55e',
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: 0.5, lineHeight: 1, marginBottom: 12,
            textShadow: '0 0 30px rgba(34,197,94,0.3)',
          }}>
            {fmt$(loop.estimated_profit)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
            <span>Gross <strong style={{ color: '#fff' }}>{fmt$(loop.total_gross)}</strong></span>
            <span>·</span>
            <span>Q fee <strong style={{ color: '#fff' }}>{fmt$(loop.total_fee)}</strong></span>
            <span>·</span>
            <span>Fuel <strong style={{ color: '#fff' }}>{fmt$(loop.fuel_cost)}</strong></span>
          </div>
        </div>

        {/* Stats strip */}
        <div style={STATS_STRIP}>
          <Stat icon={MapPin}    label="MILES"   value={loop.total_miles?.toLocaleString()} />
          <div style={DIVIDER} />
          <Stat icon={TrendingUp} label="AVG RPM" value={`$${Number(loop.avg_rpm || 0).toFixed(2)}`} />
          <div style={DIVIDER} />
          <Stat icon={Clock}      label="EST HOS" value={`${Number(loop.estimated_hos_hours || (loop.total_miles / 55)).toFixed(0)}h`} />
        </div>

        {/* Per-leg breakdown */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 10 }}>
          THE ROUTE
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {(loop.legs || []).map((leg, i) => (
            <LegCard key={i} leg={leg} index={i} total={loop.legs.length} />
          ))}
        </div>
      </div>

      {/* ─── Footer buttons ───────────────────────────────────── */}
      <div style={FOOTER}>
        <button
          onClick={handlePass}
          style={{ ...PASS_BTN, flex: 1 }}
          className="press-scale"
          disabled={accepting}
        >
          <X size={20} color="rgba(255,255,255,0.6)" />
          <span style={{ fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>Pass</span>
        </button>
        <button
          onClick={handleAccept}
          disabled={accepting}
          style={{ ...ACCEPT_BTN, flex: 2, opacity: accepting ? 0.85 : 1 }}
          className="press-scale"
        >
          {accepting && (
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
              animation: 'shimmer 1.4s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
          )}
          <CheckCircle size={20} color="#fff" style={{ position: 'relative', zIndex: 1 }} />
          <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 0.5, position: 'relative', zIndex: 1 }}>
            {accepting ? 'BUILDING LOOP…' : 'ACCEPT LOOP'}
          </span>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════
function Stat({ icon: Icon, label, value }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '12px 4px' }}>
      <Icon size={14} color="rgba(255,255,255,0.5)" style={{ marginBottom: 4 }} />
      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
        {value}
      </div>
    </div>
  )
}

function LegCard({ leg, index, total }) {
  const isLast = index === total - 1
  return (
    <div style={{
      padding: '14px 16px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      position: 'relative',
    }}>
      {/* Leg number badge */}
      <div style={{
        position: 'absolute',
        top: -8, left: 14,
        background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
        color: '#000', fontSize: 10, fontWeight: 900,
        padding: '3px 10px', borderRadius: 999,
        fontFamily: "'DM Sans', sans-serif",
        letterSpacing: 0.5,
      }}>
        LEG {index + 1}
      </div>

      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span>{(leg.origin_city || '').toUpperCase()}</span>
            <ArrowRight size={14} color="rgba(255,255,255,0.4)" />
            <span>{(leg.destination_city || '').toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            {leg.miles}mi · ${Number(leg.rpm || 0).toFixed(2)}/mi · {leg.broker_name || 'Broker'}
          </div>
        </div>
        <div style={{
          fontSize: 18,
          fontWeight: 900,
          color: '#fff',
          fontFamily: "'Bebas Neue', sans-serif",
        }}>
          {fmt$(leg.rate)}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const OVERLAY = {
  position: 'fixed', inset: 0, zIndex: 9998,
  background: 'rgba(0,0,0,0.94)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'DM Sans', sans-serif",
  color: '#fff',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  animation: 'fadeIn 0.3s ease',
  // Force dark theme tokens regardless of broader Qivori theme
  '--bg': '#07090e',
  '--text': '#ffffff',
  '--muted': 'rgba(255,255,255,0.5)',
  '--accent': '#f0a500',
}

const HEADER = {
  padding: '20px 20px 12px',
  display: 'flex', alignItems: 'center', gap: 12,
}

const Q_BADGE = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 16px rgba(240,165,0,0.35)',
  flexShrink: 0,
}

const CLOSE_BTN = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}

const BODY = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '8px 16px 16px',
  minHeight: 0,
  animation: 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
}

const LOOP_NAME = {
  fontSize: 22,
  fontWeight: 900,
  color: '#fff',
  fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: 0.5,
  lineHeight: 1.2,
  marginBottom: 16,
  textAlign: 'center',
}

const PROFIT_HERO = {
  padding: '24px 20px',
  background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.02))',
  border: '2px solid rgba(34,197,94,0.4)',
  borderRadius: 20,
  marginBottom: 18,
  boxShadow: '0 0 40px rgba(34,197,94,0.15)',
}

const STATS_STRIP = {
  display: 'flex',
  alignItems: 'center',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  marginBottom: 24,
}

const DIVIDER = {
  width: 1, height: 36,
  background: 'rgba(255,255,255,0.08)',
}

const FOOTER = {
  flexShrink: 0,
  padding: '12px 16px 16px',
  display: 'flex', gap: 12,
  borderTop: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(7,9,14,0.92)',
}

const PASS_BTN = {
  padding: '18px',
  background: 'transparent',
  border: '2px solid rgba(255,255,255,0.15)',
  borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}

const ACCEPT_BTN = {
  position: 'relative',
  overflow: 'hidden',
  padding: '18px',
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  border: 'none',
  borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  boxShadow: '0 8px 32px rgba(34,197,94,0.4)',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'transform 0.15s ease, opacity 0.2s ease',
}
