/**
 * Data normalizers — canonical shape for all DB rows.
 *
 * Each function adds frontend alias fields alongside DB names so
 * both old camelCase and new snake_case consumer code works.
 * Import from here; do NOT redefine these inline in context files.
 */

import { fmtDate } from './formatters'

// ─── Load ─────────────────────────────────────────────────────
export function normalizeLoad(l) {
  if (!l) return l
  const fmtLoadDate = (d, t) => {
    const base = fmtDate(d)
    return (base && t) ? `${base} · ${t}` : base
  }
  const dbRate  = Number(l._dbRate) || Number(l.rate) || 0
  const grossVal = (dbRate > 100 ? dbRate : 0) || Number(l.gross_pay) || Number(l.gross) || 0
  const milesVal = Number(l.miles) || 0
  const rpm = milesVal > 0 ? +(grossVal / milesVal).toFixed(2) : 0
  return {
    ...l,
    loadId:       l.load_id || l.load_number || l.loadId || '',
    dest:         l.destination || l.dest || '',
    gross:        grossVal,
    _dbRate:      dbRate || grossVal,
    rate:         rpm || Number(l.rate_per_mile) || 0,
    driver:       l.carrier_name || l.driver_name || l.driver || '',
    broker:       l.broker_name || l.broker || '',
    refNum:       l.reference_number || l.refNum || '',
    pickup:       fmtLoadDate(l.pickup_date, l.pickup_time),
    delivery:     fmtLoadDate(l.delivery_date, l.delivery_time),
    commodity:    l.notes || l.commodity || '',
    miles:        milesVal,
    weight:       l.weight || '',
    // DB aliases
    load_id:      l.load_id || l.load_number || l.loadId || '',
    load_number:  l.load_id || l.load_number || l.loadId || '',
    destination:  l.destination || l.dest || '',
    gross_pay:    grossVal,
    rate_per_mile: rpm,
    driver_name:  l.carrier_name || l.driver_name || l.driver || '',
    carrier_name: l.carrier_name || l.driver_name || l.driver || '',
    reference_number: l.reference_number || l.refNum || '',
    co_driver_name: l.co_driver_name || '',
    co_driver_id:   l.co_driver_id || null,
    stops: (l.load_stops || l.stops || []).map(s => ({
      ...s,
      contact_name:    s.contact_name    || '',
      contact_phone:   s.contact_phone   || '',
      reference_number: s.reference_number || '',
      notes:           s.notes           || '',
      scheduled_date:  s.scheduled_date  || '',
      actual_arrival:  s.actual_arrival  || null,
      actual_departure: s.actual_departure || null,
      state:    s.state    || '',
      zip_code: s.zip_code || '',
    })),
    stopCount:   (l.load_stops || l.stops || []).length,
    currentStop: l.load_stops
      ? (l.load_stops.findIndex(s => s.status === 'current') ?? 0)
      : (l.currentStop ?? 0),
    load_type:     l.load_type     || 'FTL',
    freight_class: l.freight_class || null,
    pallet_count:  l.pallet_count  || null,
    stackable:     l.stackable     || false,
    length_inches: l.length_inches || null,
    width_inches:  l.width_inches  || null,
    height_inches: l.height_inches || null,
    handling_unit: l.handling_unit || null,
    consolidation_id: l.consolidation_id || null,
    load_source:   l.load_source   || null,
    amazon_block_id: l.amazon_block_id || null,
    payment_terms: l.payment_terms || null,
  }
}

// ─── Invoice ──────────────────────────────────────────────────
export function normalizeInvoice(inv) {
  if (!inv) return inv
  return {
    ...inv,
    id:           inv.invoice_number || inv.id,
    _dbId:        inv.id,
    loadId:       inv.load_number || inv.loadId,
    date:         fmtDate(inv.invoice_date) || inv.date || '',
    dueDate:      fmtDate(inv.due_date) || inv.dueDate || '',
    driver:       inv.driver_name || inv.driver || '',
    invoice_number: inv.invoice_number || inv.id,
    load_number:  inv.load_number || inv.loadId,
    invoice_date: inv.invoice_date || '',
    due_date:     inv.due_date || '',
    driver_name:  inv.driver_name || inv.driver || '',
    amount:       Number(inv.amount) || 0,
    line_items:   inv.line_items || [],
  }
}

// ─── Expense ──────────────────────────────────────────────────
export function normalizeExpense(e) {
  if (!e) return e
  return {
    ...e,
    cat:         e.category || e.cat,
    load:        e.load_number || e.load || '',
    driver:      e.driver_name || e.driver || '',
    date:        fmtDate(e.date) || '',
    category:    e.category || e.cat,
    load_number: e.load_number || e.load || '',
    driver_name: e.driver_name || e.driver || '',
    amount:      Number(e.amount) || 0,
  }
}

// ─── Company ──────────────────────────────────────────────────
export function normalizeCompany(c) {
  if (!c) return c
  return {
    ...c,
    mc:        c.mc_number || c.mc || '',
    dot:       c.dot_number || c.dot || '',
    mc_number: c.mc_number || c.mc || '',
    dot_number: c.dot_number || c.dot || '',
  }
}
