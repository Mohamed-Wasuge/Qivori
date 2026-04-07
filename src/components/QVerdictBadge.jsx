/**
 * QVerdictBadge — compact Q decision pill for load cards
 *
 * Renders Q's verdict (ACCEPT / NEGOTIATE / REJECT) with profit + 1-line reason.
 * Used everywhere a load is shown in a list — mobile loads tab, TMS loadboard,
 * smart dispatch, etc. Zero-config: pass a load + optional driver/context.
 */
import { useMemo } from 'react'
import { qVerdict } from '../lib/qVerdict'

export default function QVerdictBadge({ load, driver = null, context = {}, variant = 'compact' }) {
  const verdict = useMemo(() => (load ? qVerdict(load, driver, context) : null), [load, driver, context])
  if (!verdict) return null

  const c = verdict.verdictColor

  if (variant === 'compact') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: `${c}15`,
        border: `1px solid ${c}40`,
        borderRadius: 8,
        padding: '6px 10px',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11, color: '#000', fontWeight: 800 }}>Q</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: c, letterSpacing: 0.4 }}>{verdict.verdict}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {verdict.headline}
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)' }}>{verdict.confidence}%</div>
      </div>
    )
  }

  // Full variant: with reasons
  return (
    <div style={{
      background: `linear-gradient(135deg, ${c}1f, ${c}08)`,
      border: `1px solid ${c}50`,
      borderRadius: 12,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: '#000', fontWeight: 800 }}>Q</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: c, letterSpacing: 0.4 }}>{verdict.verdict}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)' }}>{verdict.confidence}%</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{verdict.headline}</div>
      {verdict.reasons.slice(0, 2).map((r, i) => (
        <div key={i} style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>· {r}</div>
      ))}
    </div>
  )
}
