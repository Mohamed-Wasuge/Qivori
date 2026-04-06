import { useState, useEffect } from 'react'

// ═══════════════════════════════════════════════════════════════
// PUBLIC LOAD TRACKING PAGE — no auth required
// Brokers/shippers use this to track load status via shared link
// ═══════════════════════════════════════════════════════════════
export function LoadTrackingPage({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    const apiBase = window.location.origin
    // Try new /api/track endpoint first, fall back to legacy /api/load-tracking
    fetch(`${apiBase}/api/track?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Unable to load tracking information'))
      .finally(() => setLoading(false))
  }, [token])

  const STATUS_COLORS = {
    'Rate Con Received': '#8a8a9a',
    'Booked': '#f0a500',
    'Dispatched': '#a78bfa',
    'En Route to Pickup': '#38bdf8',
    'Loaded': '#a78bfa',
    'In Transit': '#4d8ef0',
    'Delivered': '#22c55e',
    'Invoiced': '#f97316',
    'Paid': '#22c55e',
  }

  const statusColor = STATUS_COLORS[data?.status] || '#f0a500'

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0e', fontFamily: "'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1e1e2a', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <a href="https://qivori.com" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 24, letterSpacing: 4, color: '#fff', fontWeight: 800 }}>QI<span style={{ color: '#f0a500' }}>VORI</span></span>
          <span style={{ fontSize: 10, color: '#4d8ef0', letterSpacing: 2, fontWeight: 700, marginLeft: 6 }}>AI</span>
        </a>
        <span style={{ fontSize: 11, color: '#8a8a9a', marginLeft: 16, letterSpacing: 1 }}>SHIPMENT TRACKING</span>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px 60px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #2a2a35', borderTopColor: '#f0a500', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ color: '#8a8a9a', fontSize: 13 }}>Loading tracking info...</div>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#128722;</div>
            <div style={{ color: '#ef4444', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              {error === 'Tracking link expired' ? 'Link Expired' : 'Load Not Found'}
            </div>
            <div style={{ color: '#8a8a9a', fontSize: 13 }}>
              {error === 'Tracking link expired'
                ? 'This tracking link has expired. Please request a new link from your carrier.'
                : 'This tracking link may be expired or invalid.'}
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Status Banner */}
            <div style={{ background: '#16161e', border: '1px solid #2a2a35', borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#8a8a9a', letterSpacing: 1, marginBottom: 4 }}>LOAD</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#f0a500' }}>{data.load_number}</div>
                </div>
                <div style={{ padding: '6px 16px', borderRadius: 8, background: statusColor + '18', border: '1px solid ' + statusColor + '40' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{data.status}</span>
                </div>
              </div>

              {/* Route */}
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, marginBottom: 8 }}>
                {(data.origin || '').split(',')[0]} &rarr; {(data.destination || '').split(',')[0]}
              </div>

              {/* Details row */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#8a8a9a' }}>
                {data.miles && <span>{Number(data.miles).toLocaleString()} mi</span>}
                {data.equipment && <span>{data.equipment}</span>}
                {data.commodity && <span>{data.commodity}</span>}
                {data.weight && <span>{Number(data.weight).toLocaleString()} lbs</span>}
              </div>
            </div>

            {/* Progress Timeline */}
            <div style={{ background: '#16161e', border: '1px solid #2a2a35', borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#8a8a9a', letterSpacing: 1, marginBottom: 16, fontWeight: 700 }}>SHIPMENT PROGRESS</div>

              {/* Progress bar */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                {(data.timeline || []).map((step, i) => (
                  <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: step.completed ? '#f0a500' : '#2a2a35', transition: 'background 0.3s' }} />
                ))}
              </div>

              {/* Timeline steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(data.timeline || []).map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: step.completed ? '#f0a500' : step.current ? '#1e1e2a' : '#2a2a35',
                      border: step.current ? '2px solid #f0a500' : 'none',
                    }}>
                      {step.completed ? (
                        <span style={{ color: '#000', fontSize: 12, fontWeight: 800 }}>&#10003;</span>
                      ) : (
                        <span style={{ color: '#555', fontSize: 10 }}>{i + 1}</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 13,
                      fontWeight: step.current ? 700 : 400,
                      color: step.current ? '#f0a500' : step.completed ? '#fff' : '#555',
                    }}>{step.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dates & Details */}
            <div style={{ background: '#16161e', border: '1px solid #2a2a35', borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#8a8a9a', letterSpacing: 1, marginBottom: 16, fontWeight: 700 }}>SHIPMENT DETAILS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Pickup Date', value: data.pickup_date ? new Date(data.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014' },
                  { label: 'Delivery Date', value: data.delivery_date ? new Date(data.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014' },
                  ...(data.driver_first_name ? [{ label: 'Driver', value: data.driver_first_name }] : []),
                  { label: 'Equipment', value: data.equipment || '\u2014' },
                  ...(data.eta && data.status !== 'Delivered' ? [{ label: 'ETA', value: new Date(data.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }] : []),
                ].map(d => (
                  <div key={d.label} style={{ background: '#1e1e2a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, color: '#8a8a9a', letterSpacing: 0.5, marginBottom: 4 }}>{d.label}</div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{d.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-stop info */}
            {data.stops && data.stops.length > 0 && (
              <div style={{ background: '#16161e', border: '1px solid #2a2a35', borderRadius: 16, padding: 24, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#8a8a9a', letterSpacing: 1, marginBottom: 16, fontWeight: 700 }}>STOPS</div>
                {data.stops.map((stop, i) => {
                  const isDone = stop.status === 'completed' || !!stop.departed_at
                  const isActive = stop.status === 'current' || (!!stop.arrived_at && !stop.departed_at)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < data.stops.length - 1 ? '1px solid #2a2a35' : 'none' }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: isDone ? '#22c55e' : isActive ? '#f0a500' : '#2a2a35',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: isDone || isActive ? '#000' : '#555', fontWeight: 700,
                      }}>{isDone ? '\u2713' : i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{stop.city}{stop.state ? `, ${stop.state}` : ''}</span>
                        <span style={{ fontSize: 10, color: '#8a8a9a', marginLeft: 8, textTransform: 'uppercase' }}>{stop.type}</span>
                      </div>
                      {stop.arrived_at && <span style={{ fontSize: 10, color: '#8a8a9a' }}>Arrived {new Date(stop.arrived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <a href="https://qivori.com" style={{ textDecoration: 'none' }}>
                <div style={{ color: '#555', fontSize: 11 }}>Powered by <strong style={{ color: '#f0a500' }}>Qivori AI</strong> &mdash; AI-Powered TMS for Trucking</div>
              </a>
              <div style={{ color: '#444', fontSize: 10, marginTop: 4 }}>Last updated: {new Date(data.last_updated).toLocaleString()}</div>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
