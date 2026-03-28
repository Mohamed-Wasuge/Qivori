/**
 * Qivori EDI — Validation & Duplicate Detection
 */

/**
 * Validate a parsed 204 before processing.
 * Returns { valid, errors[], warnings[] }
 */
export function validateInbound204(canonical, envelope) {
  const errors = []
  const warnings = []

  // Required fields
  if (!canonical.origin && canonical.stops.length === 0) {
    errors.push('Missing origin/pickup location')
  }
  if (!canonical.destination && canonical.stops.length < 2) {
    errors.push('Missing destination/delivery location')
  }
  if (!canonical.rate || canonical.rate <= 0) {
    errors.push('Rate is missing or zero — cannot evaluate profitability')
  }

  // Envelope validation
  if (envelope) {
    if (!envelope.isa_control_number) errors.push('Missing ISA control number')
    if (!envelope.st_control_number) errors.push('Missing ST control number')
  }

  // Warnings (non-blocking)
  if (!canonical.pickup_date) warnings.push('No pickup date — using today')
  if (!canonical.delivery_date) warnings.push('No delivery date specified')
  if (!canonical.equipment || canonical.equipment === 'Dry Van') {
    warnings.push('Equipment defaulted to Dry Van')
  }
  if (!canonical.broker_name && !canonical.shipper_name) {
    warnings.push('No shipper or broker identified in tender')
  }
  if (!canonical.weight) warnings.push('No weight specified')
  if (!canonical.miles || canonical.miles <= 0) {
    warnings.push('Miles not specified — will need route calculation')
  }
  if (canonical.stops.length === 0) {
    warnings.push('No stop details parsed — using origin/destination only')
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Validate outbound 990 before sending.
 */
export function validate990(canonical, decision) {
  const errors = []
  if (!decision || !['accept', 'reject'].includes(decision)) {
    errors.push('Decision must be accept or reject')
  }
  if (!canonical.load_id && !canonical.reference_numbers?.shipper_ref && !canonical.reference_numbers?.bol) {
    errors.push('No reference number to link 990 response to original tender')
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Validate outbound 214 before sending.
 */
export function validate214(canonical, statusEvent) {
  const errors = []
  if (!statusEvent) errors.push('Missing status event')
  if (!canonical.load_id && !canonical.load_number) {
    errors.push('No load identifier for status update')
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Validate outbound 210 before sending.
 */
export function validate210(canonical, invoice) {
  const errors = []
  if (!invoice?.invoice_number && !canonical.load_number) {
    errors.push('Missing invoice number')
  }
  if (!canonical.rate && !invoice?.amount) {
    errors.push('No amount for invoice')
  }
  if (canonical.status !== 'Delivered' && canonical.status !== 'Invoiced') {
    errors.push(`Load status is "${canonical.status}" — must be Delivered to invoice`)
  }
  return { valid: errors.length === 0, errors }
}
