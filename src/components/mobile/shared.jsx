import {
  Receipt, MapPin, Navigation, Phone, ArrowLeft, ScanLine,
  Camera, Truck, Package, Mail, CheckCircle
} from 'lucide-react'

// ── Shared mobile utilities ─────────────────────────────────
export const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export const haptic = (pattern = 'light') => {
  if (!navigator.vibrate) return
  const patterns = { light: 10, medium: 25, heavy: 50, success: [10, 50, 10], error: [50, 30, 50, 30, 50] }
  navigator.vibrate(patterns[pattern] || 10)
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

export function ActionBadge({ action }) {
  const icons = { add_expense: Receipt, check_call: MapPin, get_gps: Navigation, call_broker: Phone, navigate: ArrowLeft, snap_ratecon: ScanLine, upload_doc: Camera, update_load_status: Truck, book_load: Package, send_invoice: Mail }
  const labels = {
    add_expense: `Expense: $${action.amount} ${action.category || ''}`,
    check_call: `Check Call: ${action.location || action.status || 'submitted'}`,
    get_gps: 'Getting location...',
    call_broker: 'Calling broker',
    navigate: `Opening ${action.to}`,
    snap_ratecon: 'Snap Rate Con',
    upload_doc: `Upload ${action.doc_type || 'Document'}`,
    update_load_status: `Load → ${action.status}`,
    book_load: `Booked: ${action.origin} → ${action.destination || action.dest}`,
    send_invoice: `Invoice sent to ${action.to || 'broker'}`,
  }
  const Icon = icons[action.type] || CheckCircle
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 8, fontSize: 10, fontWeight: 600, color: 'var(--success)' }}>
      <Ic icon={Icon} size={11} />
      {labels[action.type] || action.type}
    </div>
  )
}

// GPS coords helper — returns promise with {lat, lng} or null
export const getGPSCoords = (showToast) => new Promise((resolve) => {
  if (!navigator.geolocation) {
    showToast?.('error', 'GPS Unavailable', 'Your browser does not support GPS')
    resolve(null)
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => {
      const msgs = {
        1: 'Location permission denied. Go to Settings → Safari → Location and allow for qivori.com',
        2: 'Could not determine your location. Make sure GPS is turned on.',
        3: 'Location request timed out. Try again in an open area.',
      }
      showToast?.('error', 'Location Error', msgs[err.code] || 'Failed to get location')
      resolve(null)
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  )
})

// Status color helper
export function statusColor(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('delivered') || s.includes('paid')) return 'var(--success)'
  if (s.includes('transit') || s.includes('loaded')) return 'var(--accent)'
  if (s.includes('booked') || s.includes('dispatched')) return 'var(--accent2)'
  if (s.includes('invoice')) return '#8b5cf6'
  if (s.includes('cancel')) return 'var(--danger)'
  return 'var(--muted)'
}

// Format currency
export const fmt$ = (n) => '$' + Number(n || 0).toLocaleString()

// CSS animations used across mobile tabs
export const mobileAnimations = `
  @keyframes aipulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.1); }
  }
  @keyframes micPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.15); }
  }
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes voiceWave {
    0% { height: 8px; }
    100% { height: 28px; }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes msgSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes staggerIn {
    from { opacity: 0; transform: translateY(8px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes cardPop {
    0% { opacity: 0; transform: scale(0.95); }
    70% { opacity: 1; transform: scale(1.02); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes shimmer {
    from { transform: translateX(-100%); }
    to { transform: translateX(100%); }
  }
  @keyframes pressScale {
    to { transform: scale(0.97); }
  }
  @keyframes tabSlide {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0.3); }
    50% { box-shadow: 0 0 0 6px rgba(0, 212, 170, 0); }
  }
  @keyframes pulseGlowAmber {
    0%, 100% { box-shadow: 0 0 15px rgba(240,165,0,0.08); }
    50% { box-shadow: 0 0 25px rgba(240,165,0,0.15); }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fabPop {
    0% { opacity: 0; transform: scale(0.5); }
    70% { opacity: 1; transform: scale(1.08); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes overlaySlideUp {
    from { opacity: 0; transform: translateY(40px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes qPulse {
    0%, 100% { box-shadow: 0 4px 20px rgba(240,165,0,0.3), 0 2px 8px rgba(0,0,0,0.3); }
    50% { box-shadow: 0 4px 30px rgba(240,165,0,0.5), 0 2px 12px rgba(0,0,0,0.3); }
  }
  .press-scale:active { transform: scale(0.97); transition: transform 0.1s ease; }
  .momentum-scroll { -webkit-overflow-scrolling: touch; overflow-y: auto; }
  .smooth-transition { transition: all 0.2s ease; }
`
