/**
 * Qivori EDI — X12 Parser
 * Parses raw X12 EDI strings into structured JSON.
 * Primary: 204 Motor Carrier Load Tender
 */

import { createCanonicalLoad, EQUIPMENT_MAP } from './canonical.js'

// ── Generic X12 Segment Parser ───────────────────────────────────────────────

/**
 * Parse raw X12 string into an array of segments.
 * Handles ~, \n, or custom segment terminators.
 */
export function parseX12Segments(raw) {
  if (!raw || typeof raw !== 'string') return { segments: [], envelope: null, errors: ['Empty or invalid EDI data'] }

  const errors = []
  const cleaned = raw.trim()

  // Detect segment terminator from ISA (char at position 105)
  let terminator = '~'
  if (cleaned.length > 105) {
    const detectedTerm = cleaned[105]
    if (detectedTerm && detectedTerm !== '*') terminator = detectedTerm
  }

  // Detect element separator from ISA (char at position 3)
  let separator = '*'
  if (cleaned.length > 3) {
    separator = cleaned[3]
  }

  // Split into segments
  const rawSegments = cleaned
    .split(terminator)
    .map(s => s.replace(/[\r\n]/g, '').trim())
    .filter(s => s.length > 0)

  const segments = rawSegments.map(seg => {
    const elements = seg.split(separator)
    return { id: elements[0], elements }
  })

  // Extract envelope info
  let envelope = null
  const isa = segments.find(s => s.id === 'ISA')
  const gs = segments.find(s => s.id === 'GS')
  const st = segments.find(s => s.id === 'ST')

  if (isa && gs && st) {
    envelope = {
      isa_sender_id:      (isa.elements[6] || '').trim(),
      isa_receiver_id:    (isa.elements[8] || '').trim(),
      isa_control_number: (isa.elements[13] || '').trim(),
      isa_date:           (isa.elements[9] || '').trim(),
      isa_time:           (isa.elements[10] || '').trim(),
      gs_sender:          (gs.elements[2] || '').trim(),
      gs_receiver:        (gs.elements[3] || '').trim(),
      gs_control_number:  (gs.elements[6] || '').trim(),
      gs_date:            (gs.elements[4] || '').trim(),
      st_type:            (st.elements[1] || '').trim(),
      st_control_number:  (st.elements[2] || '').trim(),
    }
  } else {
    errors.push('Missing ISA/GS/ST envelope segments')
  }

  return { segments, envelope, errors, separator, terminator }
}

// ── 204 Motor Carrier Load Tender Parser ─────────────────────────────────────

/**
 * Parse X12 204 transaction into a canonical load.
 *
 * Key segments:
 * B2  - Shipment info (SCAC, shipper ref, pay method)
 * B2A - Set Purpose (original, change, cancel)
 * L11 - Reference numbers (BOL, PO, PRO)
 * N1  - Party identification (shipper, consignee, broker)
 * N3  - Address
 * N4  - City/State/Zip
 * S5  - Stop-off details (sequence, reason, weight)
 * G62 - Date/time references
 * AT8 - Shipment weight
 * L3  - Total weight and charges
 * NTE - Notes/special instructions
 * OID - Order identification
 */
export function parse204(raw) {
  const { segments, envelope, errors } = parseX12Segments(raw)

  if (errors.length > 0 && !envelope) {
    return { success: false, errors, canonical: null, parsed: null }
  }

  if (envelope?.st_type && envelope.st_type !== '204') {
    errors.push(`Expected transaction type 204, got ${envelope.st_type}`)
    return { success: false, errors, canonical: null, parsed: null }
  }

  const parsed = {
    envelope,
    purpose: null,       // B2A: 00=original, 01=cancel, 04=change
    shipment: {},        // B2: SCAC, shipper ref, payment method
    references: {},      // L11: BOL, PO, PRO, etc.
    parties: [],         // N1+N3+N4 loops
    stops: [],           // S5+G62+N1+N3+N4 loops
    weight: {},          // AT8/L3
    notes: [],           // NTE
    equipment: null,     // MS3
    dates: [],           // G62 at header level
  }

  let currentParty = null
  let currentStop = null
  let inStopLoop = false

  for (const seg of segments) {
    const el = seg.elements

    switch (seg.id) {
      case 'B2': {
        parsed.shipment = {
          scac:             el[2] || '',
          shipper_ref:      el[4] || '',
          payment_method:   el[6] || '',   // PP=prepaid, CC=collect, TP=third party
        }
        break
      }

      case 'B2A': {
        parsed.purpose = el[1] || '00'  // 00=original, 01=cancel, 04=change
        break
      }

      case 'L11': {
        const qualifier = el[2] || ''
        const value = el[1] || ''
        // Common qualifiers: BM=BOL, PO=PurchaseOrder, CN=PRO, SI=ShipperRef
        if (qualifier === 'BM') parsed.references.bol = value
        else if (qualifier === 'PO') parsed.references.po = value
        else if (qualifier === 'CN') parsed.references.pro = value
        else if (qualifier === 'SI') parsed.references.shipper_ref = value
        else parsed.references[qualifier] = value
        break
      }

      case 'MS3': {
        // Equipment: MS3*SCAC*routing*method*equipment_code
        const equipCode = el[4] || ''
        parsed.equipment = EQUIPMENT_MAP[equipCode] || equipCode || 'Dry Van'
        break
      }

      case 'S5': {
        // Start new stop loop
        inStopLoop = true
        currentStop = {
          sequence:   parseInt(el[1]) || 0,
          reason:     el[2] || '',   // CL=complete load, PL=partial, UL=unload
          weight:     parseFloat(el[4]) || 0,
          weight_unit: el[5] || 'L',  // L=lbs, K=kg
          party: null,
          address: null,
          city_state_zip: null,
          dates: [],
          references: [],
        }
        currentParty = null
        parsed.stops.push(currentStop)
        break
      }

      case 'N1': {
        const party = {
          qualifier:  el[1] || '',    // SH=shipper, CN=consignee, BT=bill-to, BY=buyer
          name:       el[2] || '',
          id_type:    el[3] || '',
          id_value:   el[4] || '',
        }

        if (inStopLoop && currentStop) {
          currentStop.party = party
        } else {
          currentParty = party
          parsed.parties.push(party)
        }
        break
      }

      case 'N3': {
        const addr = el[1] || ''
        if (inStopLoop && currentStop) {
          currentStop.address = addr
        } else if (currentParty) {
          currentParty.address = addr
        }
        break
      }

      case 'N4': {
        const csz = {
          city:    el[1] || '',
          state:   el[2] || '',
          zip:     el[3] || '',
          country: el[4] || 'US',
        }
        if (inStopLoop && currentStop) {
          currentStop.city_state_zip = csz
        } else if (currentParty) {
          currentParty.city_state_zip = csz
        }
        break
      }

      case 'G62': {
        const dateEntry = {
          qualifier: el[1] || '',   // 10=ship, 11=deliver, 64=pickup, 69=delivery
          date:      el[2] || '',   // YYYYMMDD
          time_qualifier: el[3] || '',
          time:      el[4] || '',   // HHMM
        }
        if (inStopLoop && currentStop) {
          currentStop.dates.push(dateEntry)
        } else {
          parsed.dates.push(dateEntry)
        }
        break
      }

      case 'AT8': {
        parsed.weight = {
          qualifier:   el[1] || '',
          unit:        el[2] || 'L',
          weight:      parseFloat(el[3]) || 0,
          lading_qty:  parseInt(el[4]) || 0,
        }
        break
      }

      case 'L3': {
        parsed.weight.total_weight = parseFloat(el[1]) || parsed.weight.weight || 0
        parsed.weight.total_charges = parseFloat(el[5]) || 0
        break
      }

      case 'NTE': {
        const note = el[2] || el[1] || ''
        if (note) parsed.notes.push(note)
        break
      }

      case 'SE':
      case 'GE':
      case 'IEA': {
        inStopLoop = false
        break
      }
    }
  }

  // ── Convert parsed 204 → Canonical Load ──

  // Identify parties
  const shipper = parsed.parties.find(p => p.qualifier === 'SH') ||
                  parsed.stops.find(s => s.reason === 'CL' || s.reason === 'PL')?.party
  const consignee = parsed.parties.find(p => p.qualifier === 'CN') ||
                    parsed.stops.find(s => s.reason === 'UL')?.party
  const broker = parsed.parties.find(p => p.qualifier === 'BT' || p.qualifier === 'BY')

  // Build origin/destination from stops
  const pickupStop = parsed.stops.find(s => s.reason === 'CL' || s.reason === 'PL') || parsed.stops[0]
  const deliveryStop = parsed.stops.find(s => s.reason === 'UL') || parsed.stops[parsed.stops.length - 1]

  function buildLocation(stop) {
    if (!stop?.city_state_zip) return ''
    const csz = stop.city_state_zip
    return `${csz.city}, ${csz.state}`.trim().replace(/^,\s*/, '').replace(/,\s*$/, '')
  }

  function buildFullAddress(stop) {
    const parts = []
    if (stop?.address) parts.push(stop.address)
    if (stop?.city_state_zip) {
      const csz = stop.city_state_zip
      parts.push(`${csz.city}, ${csz.state} ${csz.zip}`.trim())
    }
    return parts.join(', ')
  }

  // Parse dates from stop G62 segments or header
  function parseDateFromG62(dateEntries, qualifiers) {
    for (const q of qualifiers) {
      const entry = dateEntries.find(d => d.qualifier === q)
      if (entry?.date) {
        const y = entry.date.slice(0, 4)
        const m = entry.date.slice(4, 6)
        const d = entry.date.slice(6, 8)
        const dateStr = `${y}-${m}-${d}`
        const timeStr = entry.time ? `${entry.time.slice(0, 2)}:${entry.time.slice(2, 4)}` : null
        return { date: dateStr, time: timeStr }
      }
    }
    return { date: null, time: null }
  }

  const pickupDates = parseDateFromG62(
    [...(pickupStop?.dates || []), ...parsed.dates],
    ['10', '64', '37']  // ship date, pickup date, ship not before
  )
  const deliveryDates = parseDateFromG62(
    [...(deliveryStop?.dates || []), ...parsed.dates],
    ['11', '69', '38']  // delivery date, delivery date, deliver not after
  )

  // Map stops to canonical format
  const canonicalStops = parsed.stops.map((stop, idx) => ({
    sequence: stop.sequence || idx + 1,
    type: (stop.reason === 'CL' || stop.reason === 'PL') ? 'pickup' : 'dropoff',
    city: stop.city_state_zip?.city || '',
    state: stop.city_state_zip?.state || '',
    address: stop.address || '',
    zip_code: stop.city_state_zip?.zip || '',
    contact_name: stop.party?.name || '',
    scheduled_date: parseDateFromG62(stop.dates || [], ['10', '11', '64', '69']).date,
    scheduled_time: parseDateFromG62(stop.dates || [], ['10', '11', '64', '69']).time,
    status: 'pending',
  }))

  const canonical = createCanonicalLoad({
    source: 'edi_204',
    load_id: parsed.shipment.shipper_ref || parsed.references.bol || null,

    shipper_name: shipper?.name || '',
    broker_name: broker?.name || '',

    origin: buildLocation(pickupStop),
    origin_address: buildFullAddress(pickupStop),
    origin_city: pickupStop?.city_state_zip?.city || '',
    origin_state: pickupStop?.city_state_zip?.state || '',
    origin_zip: pickupStop?.city_state_zip?.zip || '',

    destination: buildLocation(deliveryStop),
    destination_address: buildFullAddress(deliveryStop),
    destination_city: deliveryStop?.city_state_zip?.city || '',
    destination_state: deliveryStop?.city_state_zip?.state || '',
    destination_zip: deliveryStop?.city_state_zip?.zip || '',

    equipment: parsed.equipment || 'Dry Van',
    weight: String(parsed.weight.weight || parsed.weight.total_weight || ''),
    commodity: parsed.references.commodity || '',

    rate: parsed.weight.total_charges || 0,

    pickup_date: pickupDates.date,
    pickup_time: pickupDates.time,
    delivery_date: deliveryDates.date,
    delivery_time: deliveryDates.time,

    stops: canonicalStops,

    reference_numbers: {
      bol: parsed.references.bol || null,
      po: parsed.references.po || null,
      pro: parsed.references.pro || null,
      shipper_ref: parsed.references.shipper_ref || parsed.shipment.shipper_ref || null,
    },
    reference_number: parsed.references.bol || null,
    po_number: parsed.references.po || null,
    special_instructions: parsed.notes.join('; ') || null,
    payment_terms: parsed.shipment.payment_method === 'PP' ? 'prepaid' :
                   parsed.shipment.payment_method === 'CC' ? 'collect' : null,

    status: parsed.purpose === '01' ? 'Cancelled' : 'pending',
  })

  // Validation
  const validationErrors = []
  if (!canonical.origin) validationErrors.push('Missing pickup location')
  if (!canonical.destination) validationErrors.push('Missing delivery location')
  if (!canonical.rate || canonical.rate <= 0) validationErrors.push('Missing or zero rate')

  return {
    success: validationErrors.length === 0,
    errors: [...errors, ...validationErrors],
    warnings: validationErrors.length > 0 ? validationErrors : [],
    canonical,
    parsed,
    envelope,
    purpose: parsed.purpose,
    isDuplicate: false,  // set by caller after DB check
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validate204(canonical) {
  const errors = []
  const warnings = []

  if (!canonical.origin) errors.push('Missing origin/pickup location')
  if (!canonical.destination) errors.push('Missing destination/delivery location')
  if (!canonical.rate || canonical.rate <= 0) errors.push('Rate is missing or zero')
  if (!canonical.pickup_date) warnings.push('No pickup date specified')
  if (!canonical.delivery_date) warnings.push('No delivery date specified')
  if (!canonical.equipment) warnings.push('No equipment type specified — defaulting to Dry Van')
  if (!canonical.broker_name && !canonical.shipper_name) warnings.push('No shipper or broker identified')
  if (canonical.stops.length === 0) warnings.push('No stops parsed — using origin/destination only')

  return { valid: errors.length === 0, errors, warnings }
}
