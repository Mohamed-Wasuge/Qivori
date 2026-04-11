/**
 * Qivori — canonical data model typedefs
 *
 * These are the single source of truth for shape of all core objects.
 * Import and use with JSDoc @type, @param, @returns annotations.
 *
 * @example
 * import { Load } from '../lib/types'
 * /** @type {Load} *\/
 * const load = useLoad(id)
 */

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} LoadStop
 * @property {string}      id
 * @property {string}      load_id
 * @property {'pickup'|'delivery'|'stop'} stop_type
 * @property {number}      sequence
 * @property {string}      location
 * @property {string}      [city]
 * @property {string}      [state]
 * @property {string}      [zip_code]
 * @property {string}      [scheduled_date]
 * @property {string}      [contact_name]
 * @property {string}      [contact_phone]
 * @property {string}      [reference_number]
 * @property {string}      [notes]
 * @property {string|null} [actual_arrival]
 * @property {string|null} [actual_departure]
 * @property {'pending'|'current'|'completed'} [status]
 */

/**
 * Canonical load shape — as returned by normalizeLoad().
 * Both DB-native names and frontend aliases are present.
 *
 * @typedef {object} Load
 * @property {string}     id             — DB primary key (uuid)
 * @property {string}     loadId         — user-facing load number (alias: load_id, load_number)
 * @property {string}     load_id        — alias for loadId
 * @property {string}     load_number    — alias for loadId
 * @property {string}     origin         — origin city/address
 * @property {string}     destination    — destination city/address (alias: dest)
 * @property {string}     dest           — alias for destination
 * @property {number}     gross          — total gross pay in $ (alias: gross_pay)
 * @property {number}     gross_pay      — alias for gross
 * @property {number}     _dbRate        — original DB rate (preserved across re-normalizations)
 * @property {number}     rate           — rate per mile $/mi (alias: rate_per_mile)
 * @property {number}     rate_per_mile  — alias for rate
 * @property {number}     miles          — distance in miles
 * @property {string}     weight         — freight weight string (e.g. "45,000 lbs")
 * @property {string}     driver         — driver display name (alias: driver_name, carrier_name)
 * @property {string}     driver_name    — alias for driver
 * @property {string}     carrier_name   — alias for driver
 * @property {string}     broker         — broker display name (alias: broker_name)
 * @property {string}     broker_name    — alias for broker
 * @property {string}     refNum         — reference number (alias: reference_number)
 * @property {string}     reference_number — alias for refNum
 * @property {string}     pickup         — formatted pickup date string "Apr 11" or "Apr 11 · 08:00"
 * @property {string}     delivery       — formatted delivery date string "Apr 12"
 * @property {string}     pickup_date    — raw ISO pickup date
 * @property {string}     delivery_date  — raw ISO delivery date
 * @property {string}     status         — pipeline status (see ALL_LOAD_STATUSES in constants.js)
 * @property {string}     commodity      — commodity/notes
 * @property {LoadStop[]} stops          — normalized stop array
 * @property {number}     stopCount      — number of stops
 * @property {number}     currentStop    — index of current active stop
 * @property {string}     [co_driver_name]
 * @property {string|null} [co_driver_id]
 * @property {'FTL'|'LTL'|'Partial'} load_type
 * @property {string}     [load_source]  — 'manual' | '123lb' | 'dat' | 'edi' | 'ai'
 * @property {string}     created_at
 * @property {string}     [updated_at]
 */

// ─── Invoice ──────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Invoice
 * @property {string} id             — invoice_number (user-facing)
 * @property {string} _dbId          — real DB uuid (preserved across re-normalizations)
 * @property {string} loadId         — associated load number (alias: load_number)
 * @property {string} load_number    — alias for loadId
 * @property {number} amount         — invoice amount in $
 * @property {string} status         — 'Unpaid' | 'Paid' | 'Sent' | 'Overdue' | 'Factored'
 * @property {string} date           — formatted invoice date "Apr 11"
 * @property {string} dueDate        — formatted due date "May 11"
 * @property {string} invoice_date   — raw ISO invoice date
 * @property {string} due_date       — raw ISO due date
 * @property {string} driver         — driver display name (alias: driver_name)
 * @property {string} driver_name    — alias for driver
 * @property {string} [broker_name]
 * @property {string} [broker_email]
 * @property {Array}  line_items     — invoice line items
 * @property {string} created_at
 */

// ─── Expense ──────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Expense
 * @property {string} id
 * @property {string} cat           — expense category (alias: category)
 * @property {string} category      — alias for cat
 * @property {number} amount        — expense amount in $
 * @property {string} date          — formatted date "Apr 11"
 * @property {string} load          — associated load number (alias: load_number)
 * @property {string} load_number   — alias for load
 * @property {string} driver        — driver name (alias: driver_name)
 * @property {string} driver_name   — alias for driver
 * @property {string} [notes]
 * @property {string} created_at
 */

// ─── Driver ───────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Driver
 * @property {string}  id
 * @property {string}  full_name
 * @property {string}  [email]
 * @property {string}  [phone]
 * @property {string}  [license_number]
 * @property {string}  [license_expiry]
 * @property {string}  [medical_card_expiry]
 * @property {'active'|'inactive'|'suspended'} status
 * @property {'percent'|'permile'|'flat'} pay_model
 * @property {number}  pay_rate
 * @property {string}  created_at
 */

// ─── Vehicle ──────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Vehicle
 * @property {string}  id
 * @property {string}  unit_number
 * @property {string}  [vin]
 * @property {string}  [make]
 * @property {string}  [model]
 * @property {number}  [year]
 * @property {'active'|'inactive'|'maintenance'} status
 * @property {string}  [registration_expiry]
 * @property {string}  [insurance_expiry]
 * @property {string}  created_at
 */

// ─── Company ──────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Company
 * @property {string}  id
 * @property {string}  name
 * @property {string}  [email]
 * @property {string}  [phone]
 * @property {string}  mc           — MC number (alias: mc_number)
 * @property {string}  mc_number    — alias for mc
 * @property {string}  dot          — DOT number (alias: dot_number)
 * @property {string}  dot_number   — alias for dot
 * @property {string}  [address]
 * @property {boolean} [auto_invoice]
 * @property {string}  [invoice_terms]  — e.g. "Net 30"
 * @property {string}  [subscription_plan]
 * @property {string}  created_at
 */

// ─── Exports (for IDE auto-import support) ────────────────────────────────────
// These are type-only exports — no runtime values.
export const _types = null
