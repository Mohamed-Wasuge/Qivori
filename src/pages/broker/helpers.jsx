import {
  Package, TrendingUp, Truck, DollarSign, Clock, CheckCircle, MapPin,
  Search, Star, Shield, Phone, ChevronDown, ChevronUp, Zap, Bot,
  FileText, Radio, Filter, ArrowRight, CreditCard, AlertTriangle,
  Plus, Trash2, GripVertical, Navigation, Send, MessageSquare,
  BarChart2, Repeat, Timer, Route
} from 'lucide-react'

export const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

// ── Shared styles ──────────────────────────────────────────────────────────
export const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }
export const panelHead = { padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
export const statCard = (color) => ({
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 16px',
  borderTop: `3px solid ${color}`
})
export const badge = (bg, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
  borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color
})

export const statusColor = (s) => {
  const m = { Posted: 'var(--warning)', Matched: 'var(--accent2)', Booked: 'var(--success)', 'In Transit': 'var(--accent)', Delivered: 'var(--muted)' }
  return m[s] || 'var(--muted)'
}
export const safetyColor = (s) => s >= 90 ? 'var(--success)' : s >= 80 ? 'var(--warning)' : 'var(--danger)'
export const payColor = (s) => ({ Paid: 'var(--success)', Pending: 'var(--warning)', Overdue: 'var(--danger)' }[s])

export const getState = (loc) => {
  if (!loc) return ''
  const parts = loc.split(',')
  return parts.length > 1 ? parts[parts.length - 1].trim() : loc
}
