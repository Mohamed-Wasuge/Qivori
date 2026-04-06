import React, { useState, useEffect, useRef } from 'react'
import { Fuel, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Ic } from '../shared'

// ── Overview tab content ───────────────────────────────────────────────────────
// Alerts are generated dynamically from real data below
export const STATUS_DOT = { 'In Transit':'var(--success)', 'Loaded':'var(--accent2)', 'Assigned to Driver':'var(--accent)', 'En Route to Pickup':'var(--accent2)', 'Rate Con Received':'var(--accent)', 'Available':'var(--muted)' }

// ── Animated counter hook ─────────────────────────────────────────────────────
export function useAnimatedNumber(target, duration = 900) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    const start = val
    const diff = target - start
    if (diff === 0) return
    const t0 = performance.now()
    const step = (now) => {
      const p = Math.min((now - t0) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setVal(Math.round(start + diff * ease))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target])
  return val
}

// ── Live clock ────────────────────────────────────────────────────────────────
export function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const h = now.getHours()
  const isMarketHours = h >= 6 && h < 20 // freight moves 6AM-8PM
  const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true })
  const dayStr = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background: isMarketHours ? 'var(--success)' : 'var(--muted)', boxShadow: isMarketHours ? '0 0 8px var(--success)' : 'none' }} />
      <div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:600, letterSpacing:1, color:'var(--text)' }}>{timeStr}</div>
        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>{dayStr} · {isMarketHours ? 'MARKET OPEN' : 'AFTER HOURS'}</div>
      </div>
    </div>
  )
}

// ── Fuel ticker ───────────────────────────────────────────────────────────────
export function FuelTicker() {
  const [prices, setPrices] = useState([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function fetchDiesel() {
      try {
        const res = await fetch('/api/diesel-prices')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.prices?.length > 0) {
          const valid = data.prices.filter(p => p.price > 0)
          if (valid.length > 0) setPrices(valid)
        }
      } catch { /* non-critical: diesel price fetch failed */ }
    }
    fetchDiesel()
    // Re-fetch every 2 hours
    const interval = setInterval(fetchDiesel, 2 * 60 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (prices.length === 0) return
    const t = setInterval(() => setIdx(i => (i+1) % prices.length), 4000)
    return () => clearInterval(t)
  }, [prices.length])

  if (prices.length === 0) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)', minWidth:0, flexShrink:1 }}>
        <Ic icon={Fuel} size={14} color="var(--accent)" />
        <div>
          <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700, letterSpacing:1 }}>US AVG DIESEL</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:'var(--muted)' }}>—</div>
        </div>
      </div>
    )
  }

  const p = prices[idx % prices.length]
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)', minWidth:150 }}>
      <Ic icon={Fuel} size={14} color="var(--accent)" />
      <div>
        <div style={{ fontSize:8, color:'var(--muted)', fontWeight:700, letterSpacing:0.5, whiteSpace:'nowrap' }}>{p.region} DIESEL</div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:'var(--text)' }}>${p.price.toFixed(2)}</span>
          {p.change !== 0 && (
            <span style={{ fontSize:10, fontWeight:700, color: p.change < 0 ? 'var(--success)' : 'var(--danger)', display:'flex', alignItems:'center', gap:1 }}>
              <Ic icon={p.change < 0 ? ArrowDownRight : ArrowUpRight} size={10} />{Math.abs(p.change).toFixed(3)}
            </span>
          )}
        </div>
        {p.period && <div style={{ fontSize:8, color:'var(--muted)', marginTop:1 }}>Week of {p.period}</div>}
      </div>
    </div>
  )
}

// ── Greeting helper ───────────────────────────────────────────────────────────
export function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
