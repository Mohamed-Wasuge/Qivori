/**
 * QActivityFeed — live stream of every Q decision
 *
 * Reads from q_decisions, subscribes to realtime INSERTs, renders an
 * always-fresh ticker. Used by both mobile (full screen) and TMS (panel).
 *
 *   variant="screen" → full-page list, header included
 *   variant="panel"  → embedded card, no header
 */
import { useEffect, useState, useRef } from 'react'
import { Brain, CheckCircle, XCircle, MessageSquare, Eye, Phone, TrendingUp, Activity } from 'lucide-react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/database'

const TYPE_META = {
  load_accepted:   { icon: CheckCircle,    color: '#22c55e', label: 'Load accepted' },
  load_passed:     { icon: XCircle,        color: '#ef4444', label: 'Load passed' },
  load_scored:     { icon: Brain,          color: '#f0a500', label: 'Load scored' },
  rate_negotiated: { icon: MessageSquare,  color: '#f59e0b', label: 'Rate negotiated' },
  broker_called:   { icon: Phone,          color: '#3b82f6', label: 'Broker called' },
  lane_watched:    { icon: Eye,            color: '#8b5cf6', label: 'Lane watched' },
  market_scan:     { icon: TrendingUp,     color: '#06b6d4', label: 'Market scan' },
}

const fallback = { icon: Activity, color: 'var(--muted)', label: 'Activity' }

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function QActivityFeed({ variant = 'panel', limit = 50 }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    db.fetchDecisions({ limit }).then((rows) => {
      if (cancelled) return
      setItems(rows || [])
      setLoading(false)
    })

    // Realtime — new decisions stream in
    const ch = supabase
      .channel('q_decisions_feed')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'q_decisions' },
        (payload) => {
          if (!payload?.new) return
          setItems((prev) => [payload.new, ...prev].slice(0, limit))
        })
      .subscribe()
    channelRef.current = ch

    return () => {
      cancelled = true
      try { supabase.removeChannel(ch) } catch {}
    }
  }, [limit])

  const isScreen = variant === 'screen'

  return (
    <div style={{
      padding: isScreen ? '20px 16px' : 0,
      paddingTop: isScreen ? 'calc(env(safe-area-inset-top, 0px) + 16px)' : 0,
    }}>
      {isScreen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(240,165,0,0.4)',
          }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#000', fontWeight: 800 }}>Q</span>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>AI Activity</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Every decision Q makes, live</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
              boxShadow: '0 0 8px #22c55e', animation: 'qpulse 1.5s infinite',
            }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: 1 }}>LIVE</span>
          </div>
        </div>
      )}

      {!isScreen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Activity size={14} color="var(--muted)" />
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1.2 }}>Q ACTIVITY</div>
          <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Loading…</div>
      )}

      {!loading && items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 24 }}>
          No activity yet — Q is watching the market.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => {
          const meta = TYPE_META[it.type] || fallback
          const Icon = meta.icon
          return (
            <div key={it.id} style={{
              display: 'flex', gap: 12, padding: '12px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${meta.color}`,
              borderRadius: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${meta.color}1a`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={16} color={meta.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: meta.color, letterSpacing: 0.8 }}>
                    {meta.label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{timeAgo(it.created_at)}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4 }}>
                  {it.summary}
                </div>
                {Array.isArray(it.reasoning) && it.reasoning.slice(0, 2).map((r, i) => (
                  <div key={i} style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>· {r}</div>
                ))}
                {it.confidence != null && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                    Confidence {it.confidence}%
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes qpulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
