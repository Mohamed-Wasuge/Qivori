import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../../lib/api'

// ── Carrier Score Card ────────────────────────────────────────────────────
export function CarrierScoreCard() {
  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/carrier-score')
        if (res.ok) setScore(await res.json())
      } catch {}
      setLoading(false)
    })()
  }, [])

  if (loading || !score) return null

  const gradeColors = { A: '#22c55e', B: '#3b82f6', C: '#f0a500', D: '#ef4444' }
  const gc = gradeColors[score.grade] || '#6b7280'
  const pct = score.score / 100

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
    }}>
      {/* Score ring */}
      <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
        <svg width={56} height={56}>
          <circle cx={28} cy={28} r={22} fill="none" stroke="var(--border)" strokeWidth={5} />
          <circle cx={28} cy={28} r={22} fill="none" stroke={gc} strokeWidth={5}
            strokeDasharray={`${2 * Math.PI * 22}`} strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct)}`}
            strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: gc }}>{score.score}</span>
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>Carrier Score</span>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 6, background: gc + '15', color: gc }}>{score.grade} — {score.grade_label}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(score.factors || []).slice(0, 4).map(f => (
            <span key={f.name} style={{ fontSize: 9, color: 'var(--muted)' }}>
              {f.name}: <span style={{ color: f.points >= f.max * 0.7 ? 'var(--success)' : f.points >= f.max * 0.4 ? 'var(--accent)' : 'var(--danger)', fontWeight: 700 }}>{f.points}/{f.max}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Grade badge */}
      <div style={{ width: 40, height: 40, borderRadius: 10, background: gc + '15', border: `1px solid ${gc}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: gc }}>{score.grade}</span>
      </div>
    </div>
  )
}
