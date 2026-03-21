import { MapPin } from 'lucide-react'

export default function NotFoundPage({ onGoHome }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, padding: 20 }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <MapPin size={36} color="var(--accent)" />
        </div>

        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, letterSpacing: 6, color: 'var(--accent)', marginBottom: 8 }}>
          404
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          Wrong Route, Driver
        </div>

        <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32, maxWidth: 360, margin: '0 auto 32px' }}>
          Looks like this page took a detour. Let's get you back on the highway.
        </div>

        <button
          onClick={onGoHome}
          style={{
            padding: '14px 32px', fontSize: 14, fontWeight: 700,
            background: 'var(--accent)', color: '#000', border: 'none',
            borderRadius: 12, cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseOver={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 8px 24px rgba(240,165,0,0.3)' }}
          onMouseOut={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = 'none' }}
        >
          Back to Home
        </button>

        <div style={{ marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 3, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>QIVORI</span>
        </div>
      </div>
    </div>
  )
}
