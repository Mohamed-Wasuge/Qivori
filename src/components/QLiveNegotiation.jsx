/**
 * QLiveNegotiation — live broker call cockpit
 *
 * Subscribes to retell_calls realtime updates. When a broker call is in progress,
 * shows the live transcript, rate ladder (current → target → floor), broker name,
 * confidence, and exposes a Take Over button so the operator can intervene.
 *
 *   variant="screen" → full page (mobile)
 *   variant="panel"  → embedded card (TMS)
 */
import { useEffect, useState, useRef } from 'react'
import { Phone, PhoneOff, MessageSquare, TrendingUp, User } from 'lucide-react'
import { updateRetellCall } from '../lib/database'
import { supabase } from '../lib/supabase'

const ACTIVE_STATUSES = ['initiating', 'in_progress', 'ringing']

function fmt$(n) { return '$' + Math.round(Number(n) || 0).toLocaleString() }
function dur(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function QLiveNegotiation({ variant = 'panel' }) {
  const [activeCall, setActiveCall] = useState(null)
  const [recentCalls, setRecentCalls] = useState([])
  const [tick, setTick] = useState(0)
  const channelRef = useRef(null)

  // Initial fetch
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const owner_id = session?.user?.id
      if (!owner_id) return

      const { data } = await supabase
        .from('retell_calls')
        .select('*')
        .eq('owner_id', owner_id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (cancelled) return
      const rows = data || []
      const active = rows.find(c => ACTIVE_STATUSES.includes(c.call_status))
      setActiveCall(active || null)
      setRecentCalls(rows.filter(c => !ACTIVE_STATUSES.includes(c.call_status)).slice(0, 8))

      // Realtime — track every change for owner's calls
      const ch = supabase
        .channel('retell_calls_live')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'retell_calls', filter: `owner_id=eq.${owner_id}` },
          (payload) => {
            const row = payload.new || payload.old
            if (!row) return
            if (ACTIVE_STATUSES.includes(row.call_status)) {
              setActiveCall(row)
            } else {
              setActiveCall(prev => (prev && prev.id === row.id ? null : prev))
              setRecentCalls(prev => [row, ...prev.filter(c => c.id !== row.id)].slice(0, 8))
            }
          })
        .subscribe()
      channelRef.current = ch
    })()
    return () => {
      cancelled = true
      try { if (channelRef.current) supabase.removeChannel(channelRef.current) } catch {}
    }
  }, [])

  // Tick every second so duration counter updates
  useEffect(() => {
    if (!activeCall) return
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [activeCall])

  const handleTakeOver = async () => {
    if (!activeCall) return
    const ok = window.confirm(`Take over the call with ${activeCall.broker_name || 'broker'}? This will end Q's call and connect you directly.`)
    if (!ok) return
    try {
      await updateRetellCall(activeCall.id, { call_status: 'human_takeover', notes: 'Operator took over' })
      if (activeCall.broker_phone) {
        window.location.href = `tel:${activeCall.broker_phone}`
      }
    } catch {}
  }

  const isScreen = variant === 'screen'

  // Live call card
  if (activeCall) {
    const startedAt = activeCall.started_at || activeCall.created_at
    const elapsed = startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0
    void tick

    return (
      <div style={{
        padding: isScreen ? '20px 16px' : 16,
        paddingTop: isScreen ? 'calc(env(safe-area-inset-top, 0px) + 16px)' : 16,
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.02))',
          border: '1.5px solid rgba(34,197,94,0.5)',
          borderRadius: 16, padding: 18, marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(34,197,94,0.5)', animation: 'qringing 1.4s infinite',
            }}>
              <Phone size={20} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: 1.2 }}>Q IS NEGOTIATING</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>
                {activeCall.broker_name || 'Broker'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1 }}>LIVE</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#22c55e', fontFamily: "'Bebas Neue',sans-serif" }}>
                {dur(elapsed)}
              </div>
            </div>
          </div>

          {/* Rate ladder */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
            background: 'var(--bg)', borderRadius: 12, padding: 12,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1 }}>POSTED</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--muted)' }}>{fmt$(activeCall.rate)}</div>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, color: '#22c55e', fontWeight: 700, letterSpacing: 1 }}>TARGET</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#22c55e' }}>{fmt$(activeCall.target_rate)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700, letterSpacing: 1 }}>FLOOR</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#f59e0b' }}>{fmt$(activeCall.floor_rate)}</div>
            </div>
          </div>

          {/* Live transcript */}
          {activeCall.transcript && (
            <div style={{
              marginTop: 12, padding: 12, background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 10,
              maxHeight: 160, overflowY: 'auto',
              fontSize: 11, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>
              {typeof activeCall.transcript === 'string' ? activeCall.transcript : JSON.stringify(activeCall.transcript)}
            </div>
          )}

          {/* Take over */}
          <button
            onClick={handleTakeOver}
            style={{
              marginTop: 14, width: '100%', padding: '14px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 12, cursor: 'pointer', color: '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 800,
            }}
          >
            <PhoneOff size={16} />
            Take Over Call
          </button>
        </div>

        {recentCalls.length > 0 && <RecentCalls calls={recentCalls} />}

        <style>{`
          @keyframes qringing {
            0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(34,197,94,0.5); }
            50% { transform: scale(1.08); box-shadow: 0 0 30px rgba(34,197,94,0.8); }
          }
        `}</style>
      </div>
    )
  }

  // Idle state
  return (
    <div style={{ padding: isScreen ? '20px 16px' : 16 }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 14,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)', margin: '0 auto 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Phone size={20} color="var(--muted)" />
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
          No active negotiation
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          Q is standing by — accept a load to start a broker call
        </div>
      </div>
      {recentCalls.length > 0 && <RecentCalls calls={recentCalls} />}
    </div>
  )
}

function RecentCalls({ calls }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: 1.2, marginBottom: 8 }}>
        RECENT CALLS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {calls.map(c => {
          const ok = c.outcome === 'booked' || c.agreed_rate
          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              borderLeft: `3px solid ${ok ? '#22c55e' : 'var(--muted)'}`,
            }}>
              <User size={14} color="var(--muted)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                  {c.broker_name || 'Broker'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {c.outcome || c.call_status} · {c.duration_seconds ? dur(c.duration_seconds) : '—'}
                </div>
              </div>
              {c.agreed_rate && (
                <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>
                  {fmt$(c.agreed_rate)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
