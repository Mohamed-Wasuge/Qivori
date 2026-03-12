/**
 * Skeleton loading components for Qivori AI
 * Use these in place of content while data loads
 */

const shimmerStyle = `
@keyframes qivori-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`

function SkeletonBase({ width, height, borderRadius = 8, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius,
      background: 'linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%)',
      backgroundSize: '800px 100%',
      animation: 'qivori-shimmer 1.5s ease-in-out infinite',
      ...style,
    }} />
  )
}

/** Single line text placeholder */
export function SkeletonText({ width = '100%', height = 14, style }) {
  return <SkeletonBase width={width} height={height} borderRadius={4} style={style} />
}

/** Circle placeholder (avatar, icon) */
export function SkeletonCircle({ size = 40, style }) {
  return <SkeletonBase width={size} height={size} borderRadius="50%" style={style} />
}

/** Card-shaped placeholder */
export function SkeletonCard({ height = 120, style }) {
  return <SkeletonBase width="100%" height={height} borderRadius={12} style={style} />
}

/** Stat card skeleton */
export function SkeletonStat() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 16,
    }}>
      <SkeletonText width={80} height={10} style={{ marginBottom: 12 }} />
      <SkeletonText width={120} height={28} style={{ marginBottom: 8 }} />
      <SkeletonText width={60} height={10} />
    </div>
  )
}

/** Table row skeleton */
export function SkeletonRow({ cols = 4 }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center',
      padding: '12px 16px', borderBottom: '1px solid var(--border)',
    }}>
      {Array.from({ length: cols }).map((_, i) => (
        <SkeletonText
          key={i}
          width={i === 0 ? '30%' : `${Math.floor(70 / (cols - 1))}%`}
          height={12}
        />
      ))}
    </div>
  )
}

/** Full dashboard skeleton — 4 stat cards + table */
export function DashboardSkeleton() {
  return (
    <div style={{ padding: 20 }}>
      <style>{shimmerStyle}</style>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <SkeletonText width={140} height={16} />
        </div>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  )
}

/** Mobile chat skeleton — message bubbles */
export function ChatSkeleton() {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{shimmerStyle}</style>
      {/* AI message */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <SkeletonCircle size={32} />
        <div style={{ flex: 1, maxWidth: '75%' }}>
          <SkeletonText width="90%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonText width="70%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonText width="40%" height={14} />
        </div>
      </div>
      {/* User message */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SkeletonBase width="60%" height={40} borderRadius={16} />
      </div>
      {/* AI message */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <SkeletonCircle size={32} />
        <div style={{ flex: 1, maxWidth: '75%' }}>
          <SkeletonText width="85%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonText width="60%" height={14} />
        </div>
      </div>
    </div>
  )
}

/** List skeleton — rows with icon + text */
export function ListSkeleton({ rows = 5 }) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{shimmerStyle}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 12, background: 'var(--surface)', borderRadius: 10,
          border: '1px solid var(--border)',
        }}>
          <SkeletonCircle size={36} />
          <div style={{ flex: 1 }}>
            <SkeletonText width="60%" height={12} style={{ marginBottom: 6 }} />
            <SkeletonText width="40%" height={10} />
          </div>
          <SkeletonText width={60} height={24} />
        </div>
      ))}
    </div>
  )
}
