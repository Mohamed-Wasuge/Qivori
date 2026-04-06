import React from 'react'

export function ComplianceScoreRing({ score, size = 160 }) {
  const r = (size - 16) / 2, c = 2 * Math.PI * r, offset = c * (1 - score / 100)
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#f0a500' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ display:'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition:'stroke-dashoffset 1s ease' }} />
      <text x={size/2} y={size/2 - 8} textAnchor="middle" fill={color} fontFamily="'Bebas Neue',sans-serif" fontSize={size*0.3} letterSpacing={2}>{score}</text>
      <text x={size/2} y={size/2 + 14} textAnchor="middle" fill="var(--muted)" fontSize={10} fontFamily="'DM Sans',sans-serif">AI SCORE</text>
    </svg>
  )
}

export function MiniGauge({ label, value, max, color, unit = '' }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:6, fontWeight:600, letterSpacing:0.5 }}>{label}</div>
      <div style={{ width:56, height:56, margin:'0 auto 6px', position:'relative' }}>
        <svg width={56} height={56}>
          <circle cx={28} cy={28} r={22} fill="none" stroke="var(--border)" strokeWidth={5} />
          <circle cx={28} cy={28} r={22} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${2*Math.PI*22}`} strokeDashoffset={`${2*Math.PI*22*(1-pct/100)}`}
            strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition:'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, color }}>{value}{unit}</span>
        </div>
      </div>
    </div>
  )
}
