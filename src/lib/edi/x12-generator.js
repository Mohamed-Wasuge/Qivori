/**
 * Qivori EDI — X12 Generator
 * Generates outbound X12 documents from canonical load model.
 * - 990: Response to Load Tender (accept/reject)
 * - 214: Shipment Status Message
 * - 210: Motor Carrier Freight Invoice
 */

import { STATUS_TO_AT7, EQUIPMENT_REVERSE } from './canonical.js'

// ── Control Number Generator ─────────────────────────────────────────────────
let controlSeq = Math.floor(Date.now() / 1000) % 999999999

function nextControlNumber(digits = 9) {
  controlSeq = (controlSeq + 1) % (10 ** digits)
  return String(controlSeq).padStart(digits, '0')
}

// ── Envelope Helpers ─────────────────────────────────────────────────────────

function pad(val, len) {
  return String(val || '').padEnd(len, ' ').slice(0, len)
}

function now() {
  const d = new Date()
  return {
    date6:  d.toISOString().slice(2, 10).replace(/-/g, ''),   // YYMMDD
    date8:  d.toISOString().slice(0, 10).replace(/-/g, ''),    // YYYYMMDD
    time4:  d.toISOString().slice(11, 16).replace(':', ''),     // HHMM
  }
}

/**
 * Build ISA/IEA envelope
 */
function buildISA(senderId, receiverId, controlNum) {
  const ts = now()
  return {
    isa: [
      'ISA', '00', pad('', 10), '00', pad('', 10),
      'ZZ', pad(senderId, 15), 'ZZ', pad(receiverId, 15),
      ts.date6, ts.time4, 'U', '00401', controlNum, '0', 'P', '>'
    ].join('*'),
    iea: `IEA*1*${controlNum}`,
    controlNum,
  }
}

/**
 * Build GS/GE group envelope
 */
function buildGS(funcId, senderId, receiverId, controlNum) {
  const ts = now()
  return {
    gs: `GS*${funcId}*${senderId}*${receiverId}*${ts.date8}*${ts.time4}*${controlNum}*X*004010`,
    ge: `GE*1*${controlNum}`,
    controlNum,
  }
}

// ── 990 Response to Load Tender ──────────────────────────────────────────────

/**
 * Generate X12 990 (Response to Load Tender)
 *
 * @param {Object} params
 * @param {Object} params.canonical - Canonical load model
 * @param {string} params.decision  - 'accept' or 'reject'
 * @param {string} params.scac      - Carrier SCAC code
 * @param {Object} params.partner   - Trading partner { isa_id, gs_id }
 * @param {string} params.originalStControl - ST control from original 204
 * @returns {string} X12 990 document
 */
export function generate990({ canonical, decision, scac, partner, originalStControl }) {
  const isaControl = nextControlNumber(9)
  const gsControl = nextControlNumber(9)
  const stControl = nextControlNumber(4)

  const senderId = scac || 'QIVORI'
  const receiverId = partner?.isa_id || 'PARTNER'

  const { isa, iea } = buildISA(senderId, receiverId, isaControl)
  const { gs, ge } = buildGS('GF', partner?.gs_id || senderId, partner?.gs_id || receiverId, gsControl)

  // B1: accept/reject response
  // Action codes: A=accept, D=decline/reject
  const actionCode = decision === 'accept' ? 'A' : 'D'
  const shipperRef = canonical.reference_numbers?.shipper_ref || canonical.load_id || ''

  const segments = [
    isa,
    gs,
    `ST*990*${stControl}`,
    `B1*${scac || ''}*${shipperRef}*${now().date8}*${actionCode}`,
  ]

  // N1 — Carrier identification
  segments.push(`N1*CA*${scac || 'Qivori Carrier'}`)

  // If rejecting, add reason via NTE
  if (decision === 'reject') {
    segments.push(`NTE*GEN*Load does not meet carrier requirements`)
  }

  // L11 — Reference from original 204
  if (originalStControl) {
    segments.push(`L11*${originalStControl}*CR`)
  }
  if (canonical.reference_numbers?.bol) {
    segments.push(`L11*${canonical.reference_numbers.bol}*BM`)
  }

  const segCount = segments.length - 2 + 1  // ST through SE, not ISA/GS
  segments.push(`SE*${segCount}*${stControl}`)
  segments.push(ge)
  segments.push(iea)

  return segments.join('~\n') + '~'
}

// ── 214 Shipment Status Message ──────────────────────────────────────────────

/**
 * Generate X12 214 (Transportation Carrier Shipment Status Message)
 *
 * @param {Object} params
 * @param {Object} params.canonical     - Canonical load model
 * @param {string} params.statusEvent   - Qivori status string (e.g., 'In Transit', 'Delivered')
 * @param {string} params.scac          - Carrier SCAC code
 * @param {Object} params.partner       - Trading partner
 * @param {Object} params.location      - { city, state, zip } where event occurred
 * @param {string} params.timestamp     - ISO timestamp of event
 * @returns {string} X12 214 document
 */
export function generate214({ canonical, statusEvent, scac, partner, location, timestamp }) {
  const isaControl = nextControlNumber(9)
  const gsControl = nextControlNumber(9)
  const stControl = nextControlNumber(4)

  const senderId = scac || 'QIVORI'
  const receiverId = partner?.isa_id || 'PARTNER'

  const { isa, iea } = buildISA(senderId, receiverId, isaControl)
  const { gs, ge } = buildGS('QM', partner?.gs_id || senderId, partner?.gs_id || receiverId, gsControl)

  const at7 = STATUS_TO_AT7[statusEvent] || { code: 'NS', desc: 'Status update' }
  const ts = timestamp ? new Date(timestamp) : new Date()
  const dateStr = ts.toISOString().slice(0, 10).replace(/-/g, '')
  const timeStr = ts.toISOString().slice(11, 16).replace(':', '')

  const shipperRef = canonical.reference_numbers?.shipper_ref || canonical.load_id || canonical.load_number || ''

  const segments = [
    isa,
    gs,
    `ST*214*${stControl}`,
    `B10*${shipperRef}*${canonical.reference_numbers?.bol || ''}*${scac || ''}`,
  ]

  // L11 references
  if (canonical.reference_numbers?.bol) {
    segments.push(`L11*${canonical.reference_numbers.bol}*BM`)
  }
  if (canonical.reference_numbers?.po) {
    segments.push(`L11*${canonical.reference_numbers.po}*PO`)
  }
  if (canonical.load_number) {
    segments.push(`L11*${canonical.load_number}*CR`)
  }

  // AT7 — Shipment status
  segments.push(`AT7*${at7.code}*NS*${dateStr}*${timeStr}`)

  // MS1 — Status location
  const loc = location || {}
  const city = loc.city || extractCity(canonical, statusEvent)
  const state = loc.state || extractStateFromCanonical(canonical, statusEvent)
  if (city || state) {
    segments.push(`MS1*${city}*${state}*US`)
  }

  // MS2 — Equipment info
  const equipCode = EQUIPMENT_REVERSE[(canonical.equipment || '').toLowerCase()] || 'TL'
  segments.push(`MS2*${scac || ''}*${equipCode}`)

  const segCount = segments.length - 2 + 1
  segments.push(`SE*${segCount}*${stControl}`)
  segments.push(ge)
  segments.push(iea)

  return segments.join('~\n') + '~'
}

// ── 210 Motor Carrier Freight Invoice ────────────────────────────────────────

/**
 * Generate X12 210 (Motor Carrier Freight Details and Invoice)
 *
 * @param {Object} params
 * @param {Object} params.canonical     - Canonical load model (must be Delivered)
 * @param {Object} params.invoice       - Invoice data { invoice_number, amount, line_items, fuel_surcharge }
 * @param {string} params.scac          - Carrier SCAC code
 * @param {Object} params.partner       - Trading partner
 * @returns {string} X12 210 document
 */
export function generate210({ canonical, invoice, scac, partner }) {
  const isaControl = nextControlNumber(9)
  const gsControl = nextControlNumber(9)
  const stControl = nextControlNumber(4)

  const senderId = scac || 'QIVORI'
  const receiverId = partner?.isa_id || 'PARTNER'

  const { isa, iea } = buildISA(senderId, receiverId, isaControl)
  const { gs, ge } = buildGS('IM', partner?.gs_id || senderId, partner?.gs_id || receiverId, gsControl)

  const invoiceNum = invoice?.invoice_number || `QIV-${Date.now()}`
  const shipperRef = canonical.reference_numbers?.shipper_ref || canonical.load_id || ''
  const totalAmount = invoice?.amount || canonical.rate || 0

  const segments = [
    isa,
    gs,
    `ST*210*${stControl}`,
    // B3 — Carrier details
    `B3*${invoiceNum}*${shipperRef}*${scac || ''}*PP*${now().date8}*${totalAmount.toFixed(2)}*D*${now().date8}`,
  ]

  // B3A — Transaction purpose (00 = original)
  segments.push(`B3A*00`)

  // N1 loops — Shipper and Consignee
  if (canonical.shipper_name || canonical.broker_name) {
    segments.push(`N1*SH*${canonical.shipper_name || canonical.broker_name}`)
    if (canonical.origin_address) segments.push(`N3*${canonical.origin_address}`)
    if (canonical.origin_city) {
      segments.push(`N4*${canonical.origin_city}*${canonical.origin_state || ''}*${canonical.origin_zip || ''}`)
    }
  }

  // Consignee
  if (canonical.destination_city) {
    segments.push(`N1*CN*${canonical.shipper_name || 'Consignee'}`)
    if (canonical.destination_address) segments.push(`N3*${canonical.destination_address}`)
    segments.push(`N4*${canonical.destination_city}*${canonical.destination_state || ''}*${canonical.destination_zip || ''}`)
  }

  // L11 — Reference numbers
  if (canonical.reference_numbers?.bol) {
    segments.push(`L11*${canonical.reference_numbers.bol}*BM`)
  }
  if (canonical.reference_numbers?.po) {
    segments.push(`L11*${canonical.reference_numbers.po}*PO`)
  }
  if (canonical.load_number) {
    segments.push(`L11*${canonical.load_number}*CR`)
  }

  // LX loop — Line items
  let lineSeq = 0

  // Main line haul charge
  lineSeq++
  segments.push(`LX*${lineSeq}`)
  segments.push(`L5*${lineSeq}*Line Haul*${canonical.freight_class || '70'}`)
  segments.push(`L1*${lineSeq}*${(canonical.weight || '0')}*G*${totalAmount.toFixed(2)}*****${canonical.miles || 0}`)

  // Fuel surcharge
  const fuelSurcharge = invoice?.fuel_surcharge || canonical.fuel_estimate || 0
  if (fuelSurcharge > 0) {
    lineSeq++
    segments.push(`LX*${lineSeq}`)
    segments.push(`L5*${lineSeq}*Fuel Surcharge*0`)
    segments.push(`L1*${lineSeq}*0*G*${fuelSurcharge.toFixed(2)}`)
  }

  // Accessorials from invoice line items
  if (invoice?.line_items) {
    for (const item of invoice.line_items) {
      if (item.description && item.description !== 'Line haul' && item.description !== 'Fuel surcharge') {
        lineSeq++
        segments.push(`LX*${lineSeq}`)
        segments.push(`L5*${lineSeq}*${item.description}*0`)
        segments.push(`L1*${lineSeq}*0*G*${(item.amount || 0).toFixed(2)}`)
      }
    }
  }

  // L3 — Total weight and charges
  const totalWeight = parseFloat(canonical.weight) || 0
  segments.push(`L3*${totalWeight.toFixed(0)}*G*${totalAmount.toFixed(2)}****${canonical.miles || 0}`)

  const segCount = segments.length - 2 + 1
  segments.push(`SE*${segCount}*${stControl}`)
  segments.push(ge)
  segments.push(iea)

  return segments.join('~\n') + '~'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCity(canonical, status) {
  if (status === 'At Pickup' || status === 'Dispatched') {
    return canonical.origin_city || (canonical.origin || '').split(',')[0]?.trim() || ''
  }
  return canonical.destination_city || (canonical.destination || '').split(',')[0]?.trim() || ''
}

function extractStateFromCanonical(canonical, status) {
  if (status === 'At Pickup' || status === 'Dispatched') {
    return canonical.origin_state || ''
  }
  return canonical.destination_state || ''
}
