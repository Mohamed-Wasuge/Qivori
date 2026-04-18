// Shared BOL vs Rate Con validation — used by both web TMS and mobile app.
// Pure JS, no framework dependencies.

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const cityOf    = (s) => String(s || '').split(',')[0].trim().toLowerCase()
const cityMatch = (a, b) => {
  const na = normalize(cityOf(a)), nb = normalize(cityOf(b))
  return !na || !nb || na.includes(nb) || nb.includes(na)
}

/**
 * Compare parsed BOL fields against a load record.
 * @param {object} parsed  — output of extractParseData / parse-ratecon API
 * @param {object} load    — load row from Supabase / CarrierContext
 * @returns {Array<{field, bolValue, expected, severity: 'critical'|'warning'}>}
 */
export function checkBOLMismatches(parsed, load) {
  if (!parsed || !load) return []
  const issues = []

  // 1. Load number
  const bolNum  = normalize(parsed.loadNumber || parsed.load_number)
  const loadNum = normalize(load.load_number || load.loadId)
  if (bolNum && loadNum && bolNum !== loadNum) {
    issues.push({
      field:    'Load Number',
      bolValue: parsed.loadNumber || parsed.load_number,
      expected: load.load_number || load.loadId,
      severity: 'critical',
    })
  }

  // 2. Delivery / destination
  const bolDest  = parsed.consigneeAddress || parsed.consignee_address || parsed.consigneeName || parsed.consignee_name || ''
  const loadDest = load.destination || load.dest || ''
  if (!cityMatch(bolDest, loadDest)) {
    issues.push({
      field:    'Delivery Location',
      bolValue: bolDest || '—',
      expected: loadDest,
      severity: 'critical',
    })
  }

  // 3. Pickup / origin
  const bolOrigin  = parsed.shipperAddress || parsed.shipper_address || parsed.shipperName || parsed.shipper_name || ''
  const loadOrigin = load.origin || ''
  if (!cityMatch(bolOrigin, loadOrigin)) {
    issues.push({
      field:    'Pickup Location',
      bolValue: bolOrigin || '—',
      expected: loadOrigin,
      severity: 'warning',
    })
  }

  // 4. Signatures
  const signed = parsed.signaturesPresent ?? parsed.signatures_present
  if (signed === false || String(signed).toLowerCase() === 'no') {
    issues.push({
      field:    'Signatures',
      bolValue: 'Not detected',
      expected: 'Both shipper & consignee signatures required',
      severity: 'critical',
    })
  }

  // 5. Exceptions
  const exceptions = parsed.exceptionsNoted || parsed.exceptions_noted || ''
  if (exceptions && exceptions.trim().length > 2) {
    issues.push({
      field:    'Exceptions Noted',
      bolValue: exceptions,
      expected: 'No exceptions',
      severity: 'warning',
    })
  }

  return issues
}
