/**
 * LoadOfferPopup — Uber-style fullscreen load offer
 *
 * Built for instant feedback. Accept is OPTIMISTIC:
 *   1. Tap → instant haptic + sound + checkmark animation
 *   2. Card slides away in 600ms
 *   3. All backend work runs in background — UI never blocks
 *
 * Memoized to prevent re-renders from parent state changes.
 */
import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { CheckCircle, X, Phone } from 'lucide-react'
import { Ic, fmt$ } from './shared'

function LoadOfferPopupInner({ load, onAccept, onPass }) {
  const [phase, setPhase] = useState('idle') // idle | accepting | dismissing
  const dismissTimerRef = useRef(null)

  // Reset on new load
  useEffect(() => {
    setPhase('idle')
    return () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current) }
  }, [load?.id])

  const gross = Number(load?.gross || load?.rate || 0)
  const miles = Number(load?.miles || 0)
  const rpm = miles > 0 ? (gross / miles).toFixed(2) : '—'
  const origin = (load?.origin || '?').split(',')[0]
  const dest = (load?.destination || load?.dest || '?').split(',')[0]

  const handleAccept = useCallback(() => {
    if (phase !== 'idle') return
    setPhase('accepting')
    // Fire callback immediately — parent handles backend in background
    onAccept(load)
    // Show success state for 700ms, then dismiss
    dismissTimerRef.current = setTimeout(() => {
      setPhase('dismissing')
    }, 700)
  }, [phase, onAccept, load])

  const handlePass = useCallback(() => {
    if (phase !== 'idle') return
    setPhase('dismissing')
    onPass(load)
  }, [phase, onPass, load])

  if (!load) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      animation: phase === 'dismissing' ? 'fadeOut 0.3s ease forwards' : 'fadeIn 0.2s ease',
    }}>
      {/* Top — Q badge */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 12,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
        animation: phase === 'dismissing' ? 'fadeOut 0.2s ease forwards' : 'fadeIn 0.3s ease 0.1s both',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px rgba(240,165,0,0.5)',
          animation: 'pulse 2s infinite',
        }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#000', fontWeight: 800 }}>Q</span>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Q found you a load</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {load.broker_name || 'Broker'} • {load.equipment || 'Dry Van'}
          </div>
        </div>
      </div>

      {/* Card — slides up */}
      <div style={{
        background: 'var(--bg)', borderRadius: '28px 28px 0 0',
        padding: '32px 24px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
        animation: phase === 'dismissing'
          ? 'slideDown 0.35s cubic-bezier(0.4, 0, 1, 1) forwards'
          : 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: phase === 'accepting' ? 'scale(1.02)' : 'scale(1)',
        transition: 'transform 0.2s ease',
        boxShadow: phase === 'accepting'
          ? '0 -20px 60px rgba(34,197,94,0.4)'
          : '0 -10px 40px rgba(0,0,0,0.5)',
      }}>
        {/* ═══ ACCEPTED STATE — checkmark burst ═══ */}
        {phase === 'accepting' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg)', borderRadius: '28px 28px 0 0',
            zIndex: 10,
          }}>
            <div style={{ textAlign: 'center', animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              <div style={{
                width: 100, height: 100, borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 0 60px rgba(34,197,94,0.6)',
                animation: 'pulse 1s infinite',
              }}>
                <CheckCircle size={56} color="#fff" strokeWidth={3} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', marginBottom: 6 }}>
                Accepted!
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Q is calling {load.broker_name || 'the broker'}
              </div>
            </div>
          </div>
        )}

        {/* Route */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>{origin}</div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            margin: '12px 0', color: 'var(--muted)',
          }}>
            <div style={{ width: 60, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5 }}>{miles} MI</span>
            <div style={{ width: 60, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>{dest}</div>
        </div>

        {/* Numbers row */}
        <div style={{
          display: 'flex', justifyContent: 'space-around', marginBottom: 28,
          padding: '20px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.2, marginBottom: 6 }}>RATE</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>
              {fmt$(gross)}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.2, marginBottom: 6 }}>RPM</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>
              ${rpm}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: 1.2, marginBottom: 6 }}>PICKUP</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e', marginTop: 6 }}>
              {load.pickup_date || 'ASAP'}
            </div>
          </div>
        </div>

        {/* Accept / Pass buttons */}
        <div style={{ display: 'flex', gap: 14 }}>
          <button
            onClick={handlePass}
            disabled={phase !== 'idle'}
            style={{
              flex: 1, padding: '20px', background: 'none',
              border: '2px solid var(--border)', borderRadius: 18,
              cursor: phase === 'idle' ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: "'DM Sans',sans-serif",
              opacity: phase === 'idle' ? 1 : 0.5,
              transition: 'opacity 0.2s ease, transform 0.1s ease',
            }}
            onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.96)' }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <Ic icon={X} size={22} color="var(--muted)" />
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--muted)' }}>Pass</span>
          </button>
          <button
            onClick={handleAccept}
            disabled={phase !== 'idle'}
            style={{
              flex: 2, padding: '20px',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: 'none', borderRadius: 18,
              cursor: phase === 'idle' ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontFamily: "'DM Sans',sans-serif",
              boxShadow: '0 8px 32px rgba(34,197,94,0.4)',
              transition: 'transform 0.1s ease, box-shadow 0.2s ease',
            }}
            onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.96)' }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <Ic icon={CheckCircle} size={24} color="#fff" />
            <span style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>Accept</span>
          </button>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes popIn {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes slideDown {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(100%); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// Memoize to prevent re-renders when parent updates unrelated state
const LoadOfferPopup = memo(LoadOfferPopupInner, (prev, next) => {
  return prev.load?.id === next.load?.id
})

export default LoadOfferPopup
