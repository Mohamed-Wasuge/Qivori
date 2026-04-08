/**
 * AutoEarnings — single screen, three numbers, loads list
 *
 * Solo OO doesn't want a P&L. They want: how much did I make this week,
 * what did Q take, what did I keep. Loads below for receipts.
 *
 * Phase A: read from CarrierContext.loads, no aggregation backend yet.
 */
import { useMemo, useState } from 'react'
import { TrendingUp, Calendar, ChevronRight } from 'lucide-react'
import { Ic, fmt$, haptic } from '../mobile/shared'
import { useCarrier } from '../../context/CarrierContext'

const PERIODS = [
  { id: 'week',  label: 'This Week',  days: 7 },
  { id: 'month', label: 'This Month', days: 30 },
  { id: 'all',   label: 'All Time',   days: 99999 },
]

export default function AutoEarnings() {
  const ctx = useCarrier() || {}
  const [period, setPeriod] = useState('week')

  const data = useMemo(() => {
    const loads = ctx.loads || []
    const cutoff = Date.now() - PERIODS.find((p) => p.id === period).days * 86400000
    const DELIVERED_STATUSES = ['Delivered', 'Paid', 'Invoiced', 'delivered', 'paid']
    const filtered = loads.filter((l) => {
      const d = new Date(l.delivered_at || l.updated_at || l.created_at || 0).getTime()
      return d >= cutoff && DELIVERED_STATUSES.includes(l.status)
    })
    const gross = filtered.reduce((s, l) => s + Number(l.gross_pay || l.rate || 0), 0)
    const fee = gross * 0.03
    const net = gross - fee
    return {
      loads: filtered.sort((a, b) =>
        new Date(b.delivered_at || b.updated_at || b.created_at || 0) -
        new Date(a.delivered_at || a.updated_at || a.created_at || 0)
      ),
      gross,
      fee,
      net,
    }
  }, [ctx.loads, period])

  return (
    <div style={WRAP}>
      {/* Top bar */}
      <div style={TOP_BAR}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
          Earnings
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1 }}>
          WHAT YOU KEPT
        </div>
      </div>

      {/* Period tabs */}
      <div style={PERIOD_TABS}>
        {PERIODS.map((p) => {
          const active = period === p.id
          return (
            <button
              key={p.id}
              onClick={() => { haptic('light'); setPeriod(p.id) }}
              style={{
                ...PERIOD_BTN,
                background: active ? 'rgba(240, 165, 0, 0.12)' : 'transparent',
                color: active ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${active ? 'rgba(240, 165, 0, 0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Big net number */}
      <div style={HERO_CARD}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1.5, marginBottom: 8 }}>
          NET TO YOU
        </div>
        <div style={{ fontSize: 56, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1, marginBottom: 12 }}>
          {fmt$(data.net)}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
          <span>Gross <span style={{ color: 'var(--text)' }}>{fmt$(data.gross)}</span></span>
          <span>·</span>
          <span>Q fee <span style={{ color: 'var(--text)' }}>{fmt$(data.fee)}</span></span>
        </div>
      </div>

      {/* Loads list */}
      <div style={LIST_HEADER}>
        <span>{data.loads.length} delivered load{data.loads.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={LIST_WRAP}>
        {data.loads.length === 0 ? (
          <EmptyState />
        ) : (
          data.loads.map((l) => <LoadRow key={l.id} load={l} />)
        )}
      </div>
    </div>
  )
}

function LoadRow({ load }) {
  const gross = Number(load.gross_pay || load.rate || 0)
  const fee = gross * 0.03
  const net = gross - fee
  const origin = (load.origin || '?').split(',')[0]
  const dest = (load.destination || load.dest || '?').split(',')[0]
  const date = load.delivered_at ? new Date(load.delivered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

  return (
    <div style={ROW}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {origin} → {dest}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>
          {date} · {load.broker_name || 'Broker'}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1 }}>
          {fmt$(net)}
        </div>
        <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, marginTop: 3 }}>
          fee {fmt$(fee)}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={EMPTY}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'rgba(240, 165, 0, 0.1)',
        border: '1px solid rgba(240, 165, 0, 0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
      }}>
        <Ic icon={TrendingUp} size={22} color="var(--accent)" />
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
        No loads yet
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', maxWidth: 240, lineHeight: 1.5 }}>
        Once Q books your first load and you deliver it, your earnings will show up here.
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────
const WRAP = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  minHeight: 0,
  overflow: 'hidden',
}

const TOP_BAR = {
  padding: '20px 20px 12px',
}

const PERIOD_TABS = {
  display: 'flex',
  gap: 8,
  padding: '0 20px 16px',
}

const PERIOD_BTN = {
  padding: '8px 14px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  fontFamily: "'DM Sans', sans-serif",
  WebkitTapHighlightColor: 'transparent',
}

const HERO_CARD = {
  margin: '0 16px 16px',
  padding: '24px 24px 22px',
  background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(245,158,11,0.02))',
  border: '1px solid rgba(240, 165, 0, 0.2)',
  borderRadius: 20,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
}

const LIST_HEADER = {
  padding: '8px 24px 12px',
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--muted)',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
}

const LIST_WRAP = {
  flex: 1,
  overflowY: 'auto',
  padding: '0 16px 24px',
  WebkitOverflowScrolling: 'touch',
  minHeight: 0,
}

const ROW = {
  display: 'flex',
  alignItems: 'center',
  padding: '14px 16px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  borderRadius: 14,
  marginBottom: 8,
}

const EMPTY = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 20px',
}
