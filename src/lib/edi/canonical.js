/**
 * Qivori EDI — Canonical Load Model
 * Single source of truth for all load data flowing through the EDI system.
 * Maps between X12 EDI fields, Supabase loads table, and AI decision engine.
 */

// ── Status Constants ─────────────────────────────────────────────────────────
export const LOAD_STATUS = {
  PENDING:        'pending',
  ACCEPTED:       'accepted',
  REJECTED:       'rejected',
  NEGOTIATING:    'negotiating',
  DISPATCHED:     'Dispatched',
  IN_TRANSIT:     'In Transit',
  AT_PICKUP:      'At Pickup',
  AT_DELIVERY:    'At Delivery',
  DELIVERED:      'Delivered',
  INVOICED:       'Invoiced',
  CANCELLED:      'Cancelled',
}

// EDI → AT7 status code mapping (used for 214 generation)
export const STATUS_TO_AT7 = {
  'Dispatched':    { code: 'X3', desc: 'Arrived at pickup location' },
  'At Pickup':     { code: 'X1', desc: 'Arrived at pickup' },
  'In Transit':    { code: 'X6', desc: 'En route to delivery' },
  'At Delivery':   { code: 'X2', desc: 'Arrived at delivery location' },
  'Delivered':     { code: 'D1', desc: 'Delivered' },
  'accepted':      { code: 'A3', desc: 'Shipment accepted' },
  'Cancelled':     { code: 'X5', desc: 'Shipment cancelled' },
}

// Equipment type mapping (X12 codes ↔ Qivori names)
export const EQUIPMENT_MAP = {
  'TL': 'Dry Van',
  'TF': 'Flatbed',
  'TR': 'Reefer',
  'TN': 'Tanker',
  'SD': 'Step Deck',
  'LB': 'Lowboy',
  'PO': 'Power Only',
  'CN': 'Container',
}

export const EQUIPMENT_REVERSE = Object.fromEntries(
  Object.entries(EQUIPMENT_MAP).map(([k, v]) => [v.toLowerCase(), k])
)

// ── Canonical Load Model ─────────────────────────────────────────────────────

/**
 * Creates a canonical load object from any source (EDI, UI, API).
 * This is the ONLY shape the AI decision engine accepts.
 */
export function createCanonicalLoad(input = {}) {
  return {
    // Identity
    id:                   input.id || null,
    load_number:          input.load_number || null,
    load_id:              input.load_id || input.loadId || null,

    // Source tracking
    source:               input.source || input.load_source || 'manual',  // 'edi_204', 'manual', 'api', 'broker', 'amazon_relay'
    edi_transaction_id:   input.edi_transaction_id || null,
    trading_partner_id:   input.trading_partner_id || null,

    // Shipper / Broker
    shipper_name:         input.shipper_name || input.consignee_name || null,
    broker_name:          input.broker_name || input.broker || null,
    broker_phone:         input.broker_phone || null,
    broker_email:         input.broker_email || null,

    // Origin
    origin:               input.origin || null,
    origin_address:       input.origin_address || null,
    origin_city:          input.origin_city || null,
    origin_state:         input.origin_state || null,
    origin_zip:           input.origin_zip || null,
    origin_lat:           parseNum(input.origin_lat),
    origin_lng:           parseNum(input.origin_lng),

    // Destination
    destination:          input.destination || input.dest || null,
    destination_address:  input.destination_address || null,
    destination_city:     input.destination_city || null,
    destination_state:    input.destination_state || null,
    destination_zip:      input.destination_zip || null,
    dest_lat:             parseNum(input.dest_lat),
    dest_lng:             parseNum(input.dest_lng),

    // Shipment details
    equipment:            input.equipment || input.equipment_type || 'Dry Van',
    trailer_type:         input.trailer_type || null,
    weight:               input.weight || null,
    commodity:            input.commodity || null,
    load_type:            input.load_type || 'FTL',
    miles:                parseInt(input.miles) || 0,

    // Pricing
    rate:                 parseNum(input.rate) || parseNum(input.gross_pay) || parseNum(input.gross) || 0,
    rate_per_mile:        parseNum(input.rate_per_mile),
    fuel_estimate:        parseNum(input.fuel_estimate),
    toll_estimate:        parseNum(input.toll_estimate),
    diesel_price_at_booking: parseNum(input.diesel_price_at_booking),

    // Timing
    pickup_date:          input.pickup_date || input.pickupDate || null,
    pickup_time:          input.pickup_time || null,
    delivery_date:        input.delivery_date || input.deliveryDate || null,
    delivery_time:        input.delivery_time || null,
    drive_time_minutes:   parseInt(input.drive_time_minutes) || null,

    // Stops (multi-stop)
    stops:                (input.stops || input.load_stops || []).map(normalizeStop),

    // References
    reference_numbers: {
      bol:                input.bol || input.reference_numbers?.bol || null,
      po:                 input.po_number || input.reference_numbers?.po || null,
      pro:                input.pro_number || input.reference_numbers?.pro || null,
      shipper_ref:        input.shipper_ref || input.reference_numbers?.shipper_ref || null,
    },
    reference_number:     input.reference_number || null,
    po_number:            input.po_number || null,
    special_instructions: input.special_instructions || input.notes || null,

    // Assignment
    driver_id:            input.driver_id || null,
    driver_name:          input.driver_name || input.carrier_name || null,
    vehicle_id:           input.vehicle_id || null,

    // Status
    status:               input.status || LOAD_STATUS.PENDING,

    // LTL fields (pass through)
    freight_class:        input.freight_class || null,
    pallet_count:         input.pallet_count ? parseInt(input.pallet_count) : null,
    stackable:            input.stackable || false,

    // Payment
    payment_terms:        input.payment_terms || null,

    // Timestamps
    created_at:           input.created_at || new Date().toISOString(),
    updated_at:           input.updated_at || new Date().toISOString(),
  }
}

// ── Stop Normalization ───────────────────────────────────────────────────────

function normalizeStop(s, idx) {
  return {
    sequence:         s.sequence ?? idx + 1,
    type:             s.type || (idx === 0 ? 'pickup' : 'dropoff'),
    city:             s.city || null,
    state:            s.state || null,
    address:          s.address || null,
    zip_code:         s.zip_code || s.zip || null,
    contact_name:     s.contact_name || null,
    contact_phone:    s.contact_phone || null,
    reference_number: s.reference_number || null,
    notes:            s.notes || null,
    scheduled_date:   s.scheduled_date || null,
    scheduled_time:   s.scheduled_time || null,
    actual_arrival:   s.actual_arrival || null,
    actual_departure: s.actual_departure || null,
    status:           s.status || 'pending',
  }
}

// ── Converters ───────────────────────────────────────────────────────────────

/**
 * Convert Supabase loads row → Canonical Load
 */
export function fromSupabaseLoad(row) {
  if (!row) return null
  return createCanonicalLoad({
    ...row,
    source: row.load_source || 'manual',
    broker_name: row.broker_name || row.broker || null,
    destination: row.destination || row.dest || null,
    rate: parseNum(row.rate) || parseNum(row.gross_pay) || 0,
    stops: row.load_stops || [],
    reference_numbers: {
      bol: row.reference_number || null,
      po: row.po_number || null,
    },
  })
}

/**
 * Convert Canonical Load → Supabase loads insert/update object
 * Only includes fields that exist in the loads table.
 */
export function toSupabaseLoad(canonical, ownerId) {
  return {
    owner_id:               ownerId,
    load_id:                canonical.load_id,
    origin:                 canonical.origin,
    origin_address:         canonical.origin_address,
    origin_zip:             canonical.origin_zip,
    origin_lat:             canonical.origin_lat,
    origin_lng:             canonical.origin_lng,
    destination:            canonical.destination,
    destination_address:    canonical.destination_address,
    destination_zip:        canonical.destination_zip,
    dest_lat:               canonical.dest_lat,
    dest_lng:               canonical.dest_lng,
    miles:                  canonical.miles,
    weight:                 canonical.weight,
    commodity:              canonical.commodity,
    equipment:              canonical.equipment,
    load_type:              canonical.load_type,
    rate:                   canonical.rate,
    rate_per_mile:          canonical.rate_per_mile,
    fuel_estimate:          canonical.fuel_estimate,
    toll_estimate:          canonical.toll_estimate,
    diesel_price_at_booking: canonical.diesel_price_at_booking,
    pickup_date:            canonical.pickup_date,
    pickup_time:            canonical.pickup_time,
    delivery_date:          canonical.delivery_date,
    delivery_time:          canonical.delivery_time,
    drive_time_minutes:     canonical.drive_time_minutes,
    driver_id:              canonical.driver_id,
    driver_name:            canonical.driver_name,
    carrier_name:           canonical.driver_name,
    vehicle_id:             canonical.vehicle_id,
    status:                 canonical.status,
    broker_name:            canonical.broker_name,
    broker_phone:           canonical.broker_phone,
    broker_email:           canonical.broker_email,
    shipper_name:           canonical.shipper_name,
    consignee_name:         canonical.shipper_name,
    reference_number:       canonical.reference_number || canonical.reference_numbers?.bol,
    po_number:              canonical.po_number || canonical.reference_numbers?.po,
    special_instructions:   canonical.special_instructions,
    notes:                  canonical.special_instructions,
    load_source:            canonical.source,
    payment_terms:          canonical.payment_terms,
    freight_class:          canonical.freight_class,
    pallet_count:           canonical.pallet_count,
    stackable:              canonical.stackable,
  }
}

/**
 * Convert Canonical Load → format accepted by the existing dispatch-evaluate engine.
 * This bridges the canonical model to the existing AI decision logic.
 */
export function toDispatchFormat(canonical) {
  return {
    // Fields dispatch-evaluate.js reads
    gross:          canonical.rate,
    miles:          canonical.miles,
    weight:         parseFloat(canonical.weight) || 0,
    origin:         canonical.origin,
    destination:    canonical.destination,
    equipment:      canonical.equipment,
    pickup_date:    canonical.pickup_date,
    delivery_date:  canonical.delivery_date,
    book_type:      null,
    instant_book:   false,
    load_type:      canonical.load_type,
    // Pass through for reference
    load_id:        canonical.load_id,
    load_number:    canonical.load_number,
    broker_name:    canonical.broker_name,
    commodity:      canonical.commodity,
    special_instructions: canonical.special_instructions,
  }
}

/**
 * Convert Canonical Load → Invoice data for auto-invoice generation
 */
export function toInvoiceData(canonical) {
  const rpm = canonical.miles > 0 ? canonical.rate / canonical.miles : 0
  return {
    load_id:        canonical.id,
    load_number:    canonical.load_number,
    broker:         canonical.broker_name,
    broker_email:   canonical.broker_email,
    driver_name:    canonical.driver_name,
    route:          `${canonical.origin} → ${canonical.destination}`,
    amount:         canonical.rate,
    line_items: [
      { description: 'Line haul', amount: canonical.rate, miles: canonical.miles, rpm: Math.round(rpm * 100) / 100 },
      ...(canonical.fuel_estimate ? [{ description: 'Fuel surcharge', amount: canonical.fuel_estimate }] : []),
    ],
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(val) {
  if (val === null || val === undefined || val === '') return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

/**
 * Compute derived metrics for display / AI decisions
 */
export function computeMetrics(canonical, fuelCostPerMile = 0.55) {
  const rate = canonical.rate || 0
  const miles = canonical.miles || 0
  const rpm = miles > 0 ? rate / miles : 0
  const fuelCost = miles * fuelCostPerMile
  const grossProfit = rate - fuelCost

  let transitDays = Math.max(Math.ceil(miles / 500), 1)
  if (canonical.pickup_date && canonical.delivery_date) {
    const diff = Math.ceil(
      (new Date(canonical.delivery_date) - new Date(canonical.pickup_date)) / (1000 * 60 * 60 * 24)
    )
    if (diff > 0) transitDays = Math.max(transitDays, diff)
  }

  return {
    rpm: Math.round(rpm * 100) / 100,
    fuelCost: Math.round(fuelCost),
    grossProfit: Math.round(grossProfit),
    profitPerMile: miles > 0 ? Math.round((grossProfit / miles) * 100) / 100 : 0,
    profitPerDay: Math.round(grossProfit / transitDays),
    transitDays,
    weightLbs: parseFloat(canonical.weight) || 0,
    isLight: (parseFloat(canonical.weight) || 0) <= 37000,
    isHeavy: (parseFloat(canonical.weight) || 0) > 42000,
  }
}
