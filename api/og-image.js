import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

export default async function handler() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0c0f15',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle gradient overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(240,165,0,0.08) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #f0a500 0%, #4d8ef0 50%, #22c55e 100%)',
            display: 'flex',
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            marginBottom: '24px',
          }}
        >
          <span
            style={{
              fontSize: '72px',
              fontWeight: 800,
              letterSpacing: '8px',
              color: '#ffffff',
            }}
          >
            QI
          </span>
          <span
            style={{
              fontSize: '72px',
              fontWeight: 800,
              letterSpacing: '8px',
              color: '#f0a500',
            }}
          >
            VORI
          </span>
          <span
            style={{
              fontSize: '36px',
              fontWeight: 700,
              color: '#4d8ef0',
              marginLeft: '12px',
              letterSpacing: '2px',
            }}
          >
            AI
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '28px',
            fontWeight: 500,
            color: '#c8d0dc',
            marginBottom: '48px',
            letterSpacing: '1px',
          }}
        >
          The Operating System for Modern Carriers
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: '1000px',
          }}
        >
          {[
            { label: 'Load Board', color: '#f0a500', icon: '📦' },
            { label: 'Dispatch', color: '#4d8ef0', icon: '🚛' },
            { label: 'Fleet GPS', color: '#22c55e', icon: '📍' },
            { label: 'IFTA', color: '#f0a500', icon: '⛽' },
            { label: 'P&L', color: '#4d8ef0', icon: '📊' },
            { label: 'Compliance', color: '#22c55e', icon: '✅' },
          ].map((feat) => (
            <div
              key={feat.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '40px',
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: `1px solid ${feat.color}33`,
              }}
            >
              <span style={{ fontSize: '20px' }}>{feat.icon}</span>
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: feat.color,
                  letterSpacing: '0.5px',
                }}
              >
                {feat.label}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: 'absolute',
            bottom: '28px',
            fontSize: '16px',
            fontWeight: 500,
            color: '#6b7590',
            letterSpacing: '2px',
            display: 'flex',
          }}
        >
          www.qivori.com
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
