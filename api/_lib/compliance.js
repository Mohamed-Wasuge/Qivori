// ─── Server-side Compliance Validation Service ──────────────────────────────
// Mirrors src/lib/compliance.js logic for use in Vercel Edge Functions.
// SINGLE SOURCE OF TRUTH for dispatch compliance rules on the server side.
//
// Used by: dispatch-evaluate.js, auto-book.js, compliance-check.js
//
// Returns the same { compliance_status, violations, warnings, reasons, checks }
// structure as the frontend service so both sides speak the same language.

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.round((d - new Date()) / (1000 * 60 * 60 * 24))
}

// ─── Individual Driver Checks ───────────────────────────────────────────────

function checkCDL(driver) {
  const expiry = driver.cdl_expiry || driver.license_expiry
  const days = daysUntil(expiry)
  if (days !== null && days < 0) return { key: 'cdl_valid', status: 'fail', detail: `CDL expired ${Math.abs(days)} days ago`, dotRef: '49 CFR §391.11' }
  if (days !== null && days <= 30) return { key: 'cdl_valid', status: 'warn', detail: `CDL expires in ${days} days`, dotRef: '49 CFR §391.11' }
  return { key: 'cdl_valid', status: 'pass', detail: days !== null ? `CDL valid for ${days} days` : 'No expiry on file' }
}

function checkMedicalCard(driver) {
  const expiry = driver.medical_card_expiry || driver.med_card_expiry
  const days = daysUntil(expiry)
  if (days !== null && days < 0) return { key: 'medical_card', status: 'fail', detail: `Medical card expired ${Math.abs(days)} days ago`, dotRef: '49 CFR §391.45' }
  if (days !== null && days <= 30) return { key: 'medical_card', status: 'warn', detail: `Medical card expires in ${days} days`, dotRef: '49 CFR §391.45' }
  return { key: 'medical_card', status: 'pass', detail: days !== null ? `Valid for ${days} days` : 'No expiry on file' }
}

function checkDriverAvailability(driver) {
  if (driver.is_available === false) return { key: 'driver_available', status: 'fail', detail: `Driver ${driver.availability_status || 'unavailable'}` }
  return { key: 'driver_available', status: 'pass', detail: `Status: ${driver.availability_status || 'ready'}` }
}

function checkDrugTest(clearinghouseResult) {
  // clearinghouseResult = latest clearinghouse query row or null
  if (!clearinghouseResult) return { key: 'drug_test', status: 'warn', detail: 'No clearinghouse query on file' }
  if (clearinghouseResult.result === 'Positive' || clearinghouseResult.result === 'Refused') {
    return { key: 'drug_test', status: 'fail', detail: `${clearinghouseResult.result} result on ${clearinghouseResult.query_date || '?'}`, dotRef: '49 CFR Part 40 / §382.501' }
  }
  return { key: 'drug_test', status: 'pass', detail: `Last result: ${clearinghouseResult.result || 'Clear'}` }
}

function checkHOSAvailability(hoursLeft, minHours) {
  if (hoursLeft < 1) return { key: 'hos_available', status: 'fail', detail: `Only ${hoursLeft.toFixed(1)}h remaining — cannot drive`, dotRef: '49 CFR Part 395' }
  if (hoursLeft < minHours) return { key: 'hos_available', status: 'warn', detail: `${hoursLeft.toFixed(1)}h remaining — below ${minHours}h threshold`, dotRef: '49 CFR Part 395' }
  return { key: 'hos_available', status: 'pass', detail: `${hoursLeft.toFixed(1)}h drive time remaining` }
}

// ─── Vehicle Checks ─────────────────────────────────────────────────────────

function checkInsurance(vehicle) {
  const days = daysUntil(vehicle.insurance_expiry)
  if (days !== null && days < 0) return { key: 'insurance_valid', status: 'fail', detail: `Insurance expired ${Math.abs(days)} days ago`, dotRef: '49 CFR §387' }
  if (days !== null && days <= 30) return { key: 'insurance_valid', status: 'warn', detail: `Insurance expires in ${days} days` }
  return { key: 'insurance_valid', status: 'pass', detail: days !== null ? `Valid for ${days} days` : 'No expiry on file' }
}

function checkRegistration(vehicle) {
  const expiry = vehicle.registration_expiry || vehicle.reg_expiry
  const days = daysUntil(expiry)
  if (days !== null && days < 0) return { key: 'registration_valid', status: 'fail', detail: `Registration expired ${Math.abs(days)} days ago` }
  if (days !== null && days <= 30) return { key: 'registration_valid', status: 'warn', detail: `Registration expires in ${days} days` }
  return { key: 'registration_valid', status: 'pass', detail: days !== null ? `Valid for ${days} days` : 'No expiry on file' }
}

function checkAnnualInspection(vehicle) {
  const dueDate = vehicle.annual_inspection_due
  if (dueDate) {
    const days = daysUntil(dueDate)
    if (days !== null && days < 0) return { key: 'annual_inspection', status: 'fail', detail: `Annual inspection overdue by ${Math.abs(days)} days`, dotRef: '49 CFR §396.17' }
    if (days !== null && days <= 30) return { key: 'annual_inspection', status: 'warn', detail: `Annual inspection due in ${days} days` }
    return { key: 'annual_inspection', status: 'pass', detail: days !== null ? `Due in ${days} days` : 'No date on file' }
  }
  // Fallback: check last inspection date
  const lastInsp = vehicle.annual_inspection_date || vehicle.last_annual_inspection
  if (lastInsp) {
    const days = daysUntil(lastInsp)
    if (days !== null && -days > 365) return { key: 'annual_inspection', status: 'fail', detail: `Last inspection was ${Math.abs(days)} days ago`, dotRef: '49 CFR §396.17' }
    if (days !== null && -days > 300) return { key: 'annual_inspection', status: 'warn', detail: `Last inspection ${Math.abs(days)} days ago` }
  }
  return { key: 'annual_inspection', status: 'pass', detail: 'No inspection date on file' }
}

function checkOutOfService(vehicle) {
  if (vehicle.out_of_service) return { key: 'vehicle_in_service', status: 'fail', detail: vehicle.out_of_service_reason || 'Vehicle out of service', dotRef: '49 CFR §396.9' }
  return { key: 'vehicle_in_service', status: 'pass', detail: 'Vehicle in service' }
}

function checkDVIR(dvirResult) {
  // dvirResult = latest DVIR row with unresolved defects, or null
  if (dvirResult) {
    const defectCount = dvirResult.defects?.length || 0
    return { key: 'dvir_clear', status: 'fail', detail: `${defectCount} unresolved DVIR defect(s) from ${dvirResult.created_at?.split('T')[0] || '?'}`, dotRef: '49 CFR §396.13' }
  }
  return { key: 'dvir_clear', status: 'pass', detail: 'No unresolved defects' }
}

// ─── Enforcement ────────────────────────────────────────────────────────────

function isEnforced(checkKey, settings) {
  if (!settings || settings.enforce_compliance === false) return false
  const map = {
    cdl_valid: settings.block_expired_cdl,
    medical_card: settings.block_expired_medical,
    drug_test: settings.block_failed_drug_test,
    dvir_clear: settings.block_active_defects,
    insurance_valid: settings.block_expired_insurance,
    hos_available: true,
    driver_available: true,
    vehicle_in_service: true,
    annual_inspection: true,
    registration_valid: true,
  }
  return map[checkKey] !== false
}

// ─── validateDispatch (server-side) ─────────────────────────────────────────
// Takes pre-fetched data (driver, vehicle, clearinghouse, HOS hours, DVIR, settings)
// Returns { compliance_status, violations, warnings, reasons, checks, summary }
//
// This avoids DB calls — caller is responsible for fetching data and passing it in.
// This keeps the function pure and testable.

export function validateDispatch({
  driver,
  vehicle,
  clearinghouseResult,  // latest clearinghouse query row or null
  hosHoursLeft,         // number: remaining drive hours (default 11)
  dvirResult,           // latest unresolved DVIR row or null
  settings,             // carrier_settings row or {}
  load,                 // optional: load data for HOS fit check
} = {}) {
  const violations = []
  const warnings = []
  const reasons = []
  const checks = {}
  const s = settings || {}
  const minHOS = s.hos_min_hours || 6

  // ── Driver checks ──
  if (driver) {
    const driverChecks = [
      checkCDL(driver),
      checkMedicalCard(driver),
      checkDriverAvailability(driver),
      checkDrugTest(clearinghouseResult),
      checkHOSAvailability(hosHoursLeft ?? 11, minHOS),
    ]

    for (const c of driverChecks) {
      checks[c.key] = { status: c.status, detail: c.detail }
      if (c.status === 'fail') {
        if (isEnforced(c.key, s)) {
          violations.push({ check: c.key, detail: c.detail, dotRef: c.dotRef || null })
          reasons.push(`BLOCKED: ${c.detail}`)
        } else {
          warnings.push({ check: c.key, detail: c.detail, dotRef: c.dotRef || null })
          reasons.push(`WARNING (unenforced): ${c.detail}`)
        }
      } else if (c.status === 'warn') {
        warnings.push({ check: c.key, detail: c.detail, dotRef: c.dotRef || null })
        reasons.push(`CAUTION: ${c.detail}`)
      }
    }
  }

  // ── Vehicle checks ──
  if (vehicle) {
    const vehicleChecks = [
      checkInsurance(vehicle),
      checkRegistration(vehicle),
      checkAnnualInspection(vehicle),
      checkOutOfService(vehicle),
    ]

    if (dvirResult) vehicleChecks.push(checkDVIR(dvirResult))

    for (const c of vehicleChecks) {
      checks[c.key] = { status: c.status, detail: c.detail }
      if (c.status === 'fail') {
        if (isEnforced(c.key, s)) {
          violations.push({ check: c.key, detail: c.detail, dotRef: c.dotRef || null })
          reasons.push(`BLOCKED: ${c.detail}`)
        } else {
          warnings.push({ check: c.key, detail: c.detail, dotRef: c.dotRef || null })
          reasons.push(`WARNING (unenforced): ${c.detail}`)
        }
      } else if (c.status === 'warn') {
        warnings.push({ check: c.key, detail: c.detail, dotRef: c.dotRef || null })
        reasons.push(`CAUTION: ${c.detail}`)
      }
    }
  }

  // ── Load HOS fit check ──
  if (load && driver) {
    const driveHours = load.drive_time_minutes ? load.drive_time_minutes / 60 : (load.miles ? parseFloat(load.miles) / 50 : null)
    const avail = hosHoursLeft ?? 11
    if (driveHours !== null && driveHours > avail) {
      warnings.push({ check: 'load_hos_fit', detail: `Load needs ~${driveHours.toFixed(1)}h, driver has ${avail.toFixed(1)}h` })
      reasons.push(`CAUTION: Load needs ~${driveHours.toFixed(1)}h, driver has ${avail.toFixed(1)}h available`)
    }
  }

  // ── Determine status ──
  const compliance_status = violations.length > 0 ? 'BLOCKED'
    : warnings.length > 0 ? 'RISK'
    : 'OK'

  return {
    compliance_status,
    violations,
    warnings,
    reasons,
    checks,
    failing: violations.map(v => v.check),
    summary: compliance_status === 'OK'
      ? 'All compliance checks passed — clear to dispatch'
      : compliance_status === 'RISK'
      ? `${warnings.length} warning(s) — dispatch allowed with caution`
      : `${violations.length} violation(s) — dispatch blocked`,
  }
}

// ─── Data fetchers (Supabase REST, for Edge Functions) ──────────────────────
// These fetch the data needed by validateDispatch. Callers can use these or
// provide their own data.

export function createFetchers(supabaseUrl, serviceKey) {
  function headers() {
    return {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  return {
    async fetchDriver(driverId) {
      if (!driverId) return null
      const res = await fetch(`${supabaseUrl}/rest/v1/drivers?id=eq.${driverId}&select=*&limit=1`, { headers: headers() })
      if (!res.ok) return null
      return (await res.json())?.[0] || null
    },

    async fetchVehicle(vehicleId) {
      if (!vehicleId) return null
      const res = await fetch(`${supabaseUrl}/rest/v1/vehicles?id=eq.${vehicleId}&select=*&limit=1`, { headers: headers() })
      if (!res.ok) return null
      return (await res.json())?.[0] || null
    },

    async fetchClearinghouse(ownerId, driverName) {
      if (!driverName) return null
      const res = await fetch(
        `${supabaseUrl}/rest/v1/clearinghouse_queries?owner_id=eq.${ownerId}&driver_name=eq.${encodeURIComponent(driverName)}&order=created_at.desc&limit=1`,
        { headers: headers() }
      ).catch(() => null)
      if (!res?.ok) return null
      return (await res.json())?.[0] || null
    },

    async fetchHOSHoursLeft(ownerId, driverName) {
      if (!driverName) return 11
      const res = await fetch(
        `${supabaseUrl}/rest/v1/eld_hos_logs?owner_id=eq.${ownerId}&driver_name=eq.${encodeURIComponent(driverName)}&order=start_time.desc&limit=5`,
        { headers: headers() }
      ).catch(() => null)
      if (!res?.ok) return 11
      const logs = await res.json()
      const todayDriving = (logs || [])
        .filter(l => l.status === 'driving' && new Date(l.start_time).toDateString() === new Date().toDateString())
        .reduce((sum, l) => sum + (parseFloat(l.duration_hours) || 0), 0)
      return Math.max(0, 11 - todayDriving)
    },

    async fetchDVIRDefects(ownerId, vehicleId) {
      if (!vehicleId) return null
      const res = await fetch(
        `${supabaseUrl}/rest/v1/eld_dvirs?owner_id=eq.${ownerId}&vehicle_id=eq.${vehicleId}&status=eq.defects_found&order=created_at.desc&limit=1`,
        { headers: headers() }
      ).catch(() => null)
      if (!res?.ok) return null
      const rows = await res.json()
      return rows?.length > 0 ? rows[0] : null
    },

    async fetchSettings(ownerId) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/carrier_settings?owner_id=eq.${ownerId}&select=*&limit=1`,
        { headers: headers() }
      ).catch(() => null)
      if (!res?.ok) return {}
      return (await res.json())?.[0] || {}
    },
  }
}
