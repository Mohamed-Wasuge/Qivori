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
`
