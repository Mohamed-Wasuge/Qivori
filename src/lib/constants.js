/**
 * Qivori — centralized constants
 * Single source of truth for load statuses, colors, and other shared values.
 * Import from here instead of inlining arrays in filters and switch statements.
 */

// ─── Load Status Groups ───────────────────────────────────────────────────────

/** Loads that are fully done and should appear in history/invoicing */
export const DELIVERED_STATUSES = ['Delivered', 'Invoiced', 'Paid']

/** Loads currently moving — driver is on the road */
export const IN_TRANSIT_STATUSES = ['In Transit', 'Loaded', 'En Route to Pickup']

/** Loads that are booked/confirmed but not yet rolling */
export const BOOKED_STATUSES = [
  'Rate Con Received',
  'Booked',
  'Assigned to Driver',
  'Dispatched',
]

/** Everything that is active (booked + in transit) — use for "open workload" views */
export const ACTIVE_STATUSES = [...BOOKED_STATUSES, ...IN_TRANSIT_STATUSES]

/** Loads that count toward revenue (delivered or invoiced) */
export const REVENUE_STATUSES = [...DELIVERED_STATUSES]

/** Every valid load status in pipeline order */
export const ALL_LOAD_STATUSES = [
  'Available',
  'Rate Con Received',
  'Booked',
  'Assigned to Driver',
  'Dispatched',
  'En Route to Pickup',
  'Loaded',
  'In Transit',
  'Delivered',
  'Invoiced',
  'Paid',
]

// ─── Load Status Colors ───────────────────────────────────────────────────────

/** Maps each status to a CSS color token or hex value */
export const LOAD_STATUS_COLOR = {
  'Available':           'var(--muted)',
  'Rate Con Received':   'var(--accent)',
  'Booked':              'var(--accent)',
  'Assigned to Driver':  'var(--accent2)',
  'Dispatched':          'var(--accent2)',
  'En Route to Pickup':  '#3b82f6',
  'Loaded':              '#3b82f6',
  'In Transit':          '#8b5cf6',
  'Delivered':           'var(--success)',
  'Invoiced':            'var(--warning)',
  'Paid':                'var(--success)',
}

/** Returns a color for any load status, with a safe fallback */
export function getStatusColor(status) {
  return LOAD_STATUS_COLOR[status] || 'var(--muted)'
}

// ─── Invoice Status Groups ────────────────────────────────────────────────────

export const UNPAID_INVOICE_STATUSES = ['draft', 'sent', 'overdue']
export const PAID_INVOICE_STATUSES   = ['paid', 'factored']

// ─── Driver Status ────────────────────────────────────────────────────────────

export const DRIVER_ACTIVE_STATUSES   = ['active', 'on_load']
export const DRIVER_INACTIVE_STATUSES = ['inactive', 'suspended', 'terminated']

// ─── Subscription Plans ───────────────────────────────────────────────────────

export const PLAN_DISPLAY_NAMES = {
  tms_pro:          'TMS Pro',
  ai_dispatch:      'AI Dispatch',
  autonomous_fleet: 'Autonomous Fleet',
  autopilot_ai:     'Autonomous Fleet',
  autopilot:        'AI Dispatch',
  pro:              'AI Dispatch',
  fleet:            'Autonomous Fleet',
  basic:            'TMS Pro',
  solo:             'TMS Pro',
  growing:          'AI Dispatch',
  enterprise:       'Autonomous Fleet',
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE     = 1000

// ─── Timing ───────────────────────────────────────────────────────────────────

export const DEBOUNCE_REALTIME_MS = 300
export const TOAST_DURATION_MS    = 3500
export const API_TIMEOUT_MS       = 10000
