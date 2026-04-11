/**
 * Qivori — centralized formatting utilities
 * Import from here instead of inlining formatting logic in components.
 */

// ─── Date ────────────────────────────────────────────────────────────────────

/** "Apr 11" */
export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Apr 11, 2026" */
export function fmtDateFull(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "2026-04-11" (ISO date, no time) */
export function fmtDateISO(d) {
  if (!d) return new Date().toISOString().split('T')[0]
  return new Date(d).toISOString().split('T')[0]
}

/** "11:30 AM" */
export function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** "Apr 11, 11:30 AM" */
export function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Days since a date (positive = past, negative = future) */
export function daysSince(d) {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

/** Days until a date (positive = future, negative = past) */
export function daysUntil(d) {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

// ─── Currency ────────────────────────────────────────────────────────────────

/**
 * Compact currency: "$1.2K", "$45K", "$1.2M"
 * Under $1000 shows full: "$850"
 */
export function fmtCurrency(v) {
  const n = Number(v) || 0
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K'
  return '$' + n.toLocaleString()
}

/** Full currency with commas: "$1,234.56" */
export function fmtCurrencyFull(v) {
  const n = Number(v) || 0
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Rate per mile: "$2.45/mi" */
export function fmtRPM(v) {
  const n = Number(v) || 0
  return '$' + n.toFixed(2) + '/mi'
}

/** Cents to dollars string: "$12.34" */
export function fmtCents(cents) {
  return fmtCurrencyFull((Number(cents) || 0) / 100)
}

// ─── Distance & Weight ───────────────────────────────────────────────────────

/** "1,234 mi" */
export function fmtMiles(v) {
  const n = Number(v) || 0
  return n.toLocaleString() + ' mi'
}

/** "45,000 lbs" */
export function fmtWeight(v) {
  const n = Number(v) || 0
  return n.toLocaleString() + ' lbs'
}

// ─── Phone ───────────────────────────────────────────────────────────────────

/** "(555) 867-5309" */
export function fmtPhone(v) {
  const digits = String(v || '').replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return v || '—'
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/** Strip all non-digit characters */
export function stripNonDigits(v) {
  return String(v || '').replace(/\D/g, '')
}

// ─── Misc ────────────────────────────────────────────────────────────────────

/** Truncate string with ellipsis: "Long text..." */
export function fmtTruncate(str, max = 40) {
  if (!str) return '—'
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

/** Title-case a string: "in transit" → "In Transit" */
export function fmtTitleCase(str) {
  if (!str) return ''
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}
