// ─── Compliance Validation Service ─────────────────────────────────────────
// Pure logic — no React, no Supabase. Takes raw data, returns structured results.
// Used by: AuditToday UI, dispatch engine, auto-book, compliance-check API
//
// SINGLE SOURCE OF TRUTH for all DOT/FMCSA compliance rules.
// Do NOT duplicate these checks elsewhere. Import and call these functions.

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.round((d - new Date()) / (1000 * 60 * 60 * 24))
}

// ─── Individual Check Functions ─────────────────────────────────────────────
// Each returns { status: 'pass'|'fail'|'warn', key, label, detail, action, dotRef?, category }

export function checkCDL(driver) {
  const name = driver.full_name || driver.name || 'Unknown'
  const expiry = driver.cdl_expiry || driver.license_expiry
  const days = daysUntil(expiry)
  const base = { key: 'cdl_valid', category: 'driver', entity: name, entityId: driver.id, icon: 'id-card', dotRef: '49 CFR §391.11' }

  if (days !== null && days < 0) {
    return { ...base, status: 'fail', label: 'CDL Expired', detail: `Expired ${Math.abs(days)} days ago (${expiry})`, action: 'Renew CDL immediately — driver cannot operate' }
  }
  if (days !== null && days <= 30) {
    return { ...base, status: 'warn', label: 'CDL Expiring Soon', detail: `Expires in ${days} days (${expiry})`, action: 'Schedule CDL renewal' }
  }
  if (days !== null && days <= 60) {
    return { ...base, status: 'info', label: 'CDL Renewal Due', detail: `Expires in ${days} days (${expiry})`, action: 'Plan CDL renewal', dotRef: null }
  }
  return { ...base, status: 'pass', label: 'CDL Valid', detail: days !== null ? `Expires in ${days} days` : 'No expiry date on file' }
}

export function checkMedicalCard(driver) {
  const name = driver.full_name || driver.name || 'Unknown'
  const expiry = driver.medical_card_expiry || driver.med_card_expiry
  const days = daysUntil(expiry)
  const base = { key: 'medical_card', category: 'driver', entity: name, entityId: driver.id, icon: 'medical', dotRef: '49 CFR §391.45' }

  if (days !== null && days < 0) {
    return { ...base, status: 'fail', label: 'Medical Card Expired', detail: `Expired ${Math.abs(days)} days ago (${expiry})`, action: 'Driver must get new DOT physical — cannot drive' }
  }
  if (days !== null && days <= 30) {
    return { ...base, status: 'warn', label: 'Medical Card Expiring', detail: `Expires in ${days} days (${expiry})`, action: 'Schedule DOT physical' }
  }
  return { ...base, status: 'pass', label: 'Medical Card Valid', detail: days !== null ? `Valid for ${days} days` : 'No expiry on file' }
}

export function checkDrugTest(driver, clearinghouseOrders) {
  const name = driver.full_name || driver.name || 'Unknown'
  const base = { key: 'drug_test', category: 'driver', entity: name, entityId: driver.id, icon: 'substance', dotRef: '49 CFR Part 40 / §382.501' }

  const query = (clearinghouseOrders || []).find(c => c.driver_name === name)
  if (query && (query.result === 'Positive' || query.result === 'Refused')) {
    return { ...base, status: 'fail', label: `Drug Test: ${query.result}`, detail: `${query.query_type} on ${query.query_date} — ${query.result}`, action: 'Remove from safety-sensitive duties immediately. SAP referral required.' }
  }
  if (query) {
    return { ...base, status: 'pass', label: 'Drug Test Clear', detail: `Last result: ${query.result || 'Clear'} (${query.query_date || '?'})` }
  }
  return { ...base, status: 'warn', label: 'No Clearinghouse Query', detail: 'No clearinghouse query on file', dotRef: null }
}

export function checkAnnualClearinghouse(driver, clearinghouseOrders) {
  const name = driver.full_name || driver.name || 'Unknown'
  const base = { key: 'annual_clearinghouse', category: 'driver', entity: name, entityId: driver.id, icon: 'substance', dotRef: '49 CFR §382.701' }

  const queries = (clearinghouseOrders || []).filter(c => c.driver_name === name && c.query_type === 'Annual')
  const hasRecent = queries.some(c => {
    const d = daysUntil(c.query_date)
    return d !== null && Math.abs(d) < 365
  })
  if (!hasRecent && clearinghouseOrders && clearinghouseOrders.length > 0) {
    return { ...base, status: 'warn', label: 'Annual Clearinghouse Query Overdue', detail: 'No annual query found in the last 12 months', action: 'Run annual clearinghouse query' }
  }
  return { ...base, status: 'pass', label: 'Annual Query Current', detail: 'Annual clearinghouse query is current' }
}

export function checkHOSViolations(driver, hosLogs) {
  const name = driver.full_name || driver.name || 'Unknown'
  const base = { key: 'hos_violations', category: 'driver', entity: name, entityId: driver.id, icon: 'hos', dotRef: '49 CFR Part 395' }

  const driverLogs = (hosLogs || []).filter(l => l.driver_name === name)
  const recentViolations = driverLogs.filter(l => {
    const hasViolations = l.violations && (Array.isArray(l.violations) ? l.violations.length > 0 : Object.keys(l.violations).length > 0)
    const d = daysUntil(l.start_time)
    const isRecent = d !== null && Math.abs(d) < 7
    return hasViolations && isRecent
  })

  if (recentViolations.length > 0) {
    return { ...base, status: 'fail', label: `${recentViolations.length} HOS Violation${recentViolations.length > 1 ? 's' : ''} (7d)`, detail: 'Active hours-of-service violations in the last 7 days', action: 'Review driving patterns — ensure 10hr off-duty / 34hr restart' }
  }
  return { ...base, status: 'pass', label: 'HOS Compliant', detail: 'No HOS violations in last 7 days' }
}

export function checkHOSAvailability(driver, hosLogs, minHours = 6) {
  const name = driver.full_name || driver.name || 'Unknown'
  const base = { key: 'hos_available', category: 'driver', entity: name, entityId: driver.id, icon: 'hos', dotRef: '49 CFR Part 395' }

  const driverLogs = (hosLogs || []).filter(l => l.driver_name === name)
  const todayStr = new Date().toDateString()
  const todayDriving = driverLogs
    .filter(l => l.status === 'driving' && new Date(l.start_time).toDateString() === todayStr)
    .reduce((sum, l) => sum + (parseFloat(l.duration_hours) || 0), 0)
  const hoursLeft = Math.max(0, 11 - todayDriving)

  if (hoursLeft < 1) {
    return { ...base, status: 'fail', label: 'Out of Drive Hours', detail: `Only ${hoursLeft.toFixed(1)}h remaining — cannot drive`, action: 'Driver must take required off-duty time before driving' }
  }
  if (hoursLeft < minHours) {
    return { ...base, status: 'warn', label: 'Low Drive Hours', detail: `${hoursLeft.toFixed(1)}h remaining — below ${minHours}h threshold`, action: 'Consider shorter loads or plan rest stop' }
  }
  return { ...base, status: 'pass', label: 'HOS Available', detail: `${hoursLeft.toFixed(1)}h drive time remaining` }
}

export function checkDVIR(driver, dvirHistory) {
  const name = driver.full_name || driver.name || 'Unknown'
  const base = { key: 'dvir_clear', category: 'driver', entity: name, entityId: driver.id, icon: 'dvir', dotRef: '49 CFR §396.13' }

  const latest = (dvirHistory || []).find(dv => dv.driver_name === name)
  if (latest && latest.status === 'defects_found' && !latest.resolved_at) {
    return { ...base, status: 'fail', label: 'Unresolved DVIR Defects', detail: `DVIR from ${latest.inspection_date || 'unknown date'} has unresolved defects`, action: 'Repair defects before next dispatch — driver cannot use vehicle' }
  }
  return { ...base, status: 'pass', label: 'DVIR Clear', detail: latest ? 'Last DVIR passed' : 'No DVIR on file' }
}

export function checkDriverAvailability(driver) {
  const name = driver.full_name || driver.name || 'Unknown'
  const base = { key: 'driver_available', category: 'driver', entity: name, entityId: driver.id, icon: 'status' }

  if (driver.is_available === false) {
    const isSuspended = driver.availability_status === 'suspended'
    return { ...base, status: 'fail', label: isSuspended ? 'Driver Suspended' : 'Driver Unavailable', detail: `Status: ${driver.availability_status || 'not available'}`, action: isSuspended ? 'Review suspension reason before re-activating' : 'Check driver status' }
  }
  return { ...base, status: 'pass', label: 'Driver Available', detail: `Status: ${driver.availability_status || 'ready'}` }
}

// ─── Vehicle Checks ─────────────────────────────────────────────────────────

export function checkAnnualInspection(vehicle) {
  const unit = vehicle.unit_number || vehicle.truck_number || vehicle.vin || 'Unknown Unit'
  const base = { key: 'annual_inspection', category: 'vehicle', entity: unit, entityId: vehicle.id, icon: 'inspection', dotRef: '49 CFR §396.17' }

  const inspDate = vehicle.annual_inspection_date || vehicle.last_annual_inspection || vehicle.annual_inspection_due
  const days = daysUntil(inspDate)

  // annual_inspection_due: future date = pass, past date = overdue
  if (vehicle.annual_inspection_due) {
    const dueDays = daysUntil(vehicle.annual_inspection_due)
    if (dueDays !== null && dueDays < 0) {
      return { ...base, status: 'fail', label: 'Annual Inspection Overdue', detail: `Overdue by ${Math.abs(dueDays)} days`, action: 'Schedule annual inspection immediately — vehicle cannot operate' }
    }
    if (dueDays !== null && dueDays <= 30) {
      return { ...base, status: 'warn', label: 'Annual Inspection Due Soon', detail: `Due in ${dueDays} days`, action: 'Schedule annual inspection within 30 days' }
    }
    return { ...base, status: 'pass', label: 'Annual Inspection Current', detail: dueDays !== null ? `Due in ${dueDays} days` : 'No date on file' }
  }

  // Fallback: last inspection date (overdue if >365 days ago)
  if (inspDate && days !== null) {
    const daysSince = -days
    if (daysSince > 365) {
      return { ...base, status: 'fail', label: 'Annual Inspection Overdue', detail: `Last inspection was ${daysSince} days ago (${inspDate})`, action: 'Schedule annual inspection immediately — vehicle cannot operate' }
    }
    if (daysSince > 300) {
      return { ...base, status: 'warn', label: 'Annual Inspection Due Soon', detail: `Last inspection ${daysSince} days ago — due in ${365 - daysSince} days`, action: 'Schedule annual inspection within 60 days' }
    }
    return { ...base, status: 'pass', label: 'Annual Inspection Current', detail: `Last inspected ${daysSince} days ago` }
  }

  return { ...base, status: 'pass', label: 'Annual Inspection', detail: 'No inspection date on file' }
}

export function checkRegistration(vehicle) {
  const unit = vehicle.unit_number || vehicle.truck_number || vehicle.vin || 'Unknown Unit'
  const base = { key: 'registration_valid', category: 'vehicle', entity: unit, entityId: vehicle.id, icon: 'registration' }

  const expiry = vehicle.registration_expiry || vehicle.reg_expiry
  const days = daysUntil(expiry)

  if (days !== null && days < 0) {
    return { ...base, status: 'fail', label: 'Registration Expired', detail: `Expired ${Math.abs(days)} days ago`, action: 'Renew registration — vehicle cannot operate on public roads' }
  }
  if (days !== null && days <= 30) {
    return { ...base, status: 'warn', label: 'Registration Expiring', detail: `Expires in ${days} days`, action: 'Renew registration' }
  }
  return { ...base, status: 'pass', label: 'Registration Valid', detail: days !== null ? `Valid for ${days} days` : 'No expiry on file' }
}

export function checkInsurance(vehicle) {
  const unit = vehicle.unit_number || vehicle.truck_number || vehicle.vin || 'Unknown Unit'
  const base = { key: 'insurance_valid', category: 'vehicle', entity: unit, entityId: vehicle.id, icon: 'insurance', dotRef: '49 CFR §387' }

  const days = daysUntil(vehicle.insurance_expiry)

  if (days !== null && days < 0) {
    return { ...base, status: 'fail', label: 'Insurance Expired', detail: `Expired ${Math.abs(days)} days ago`, action: 'Renew insurance immediately — operating uninsured is a federal violation' }
  }
  if (days !== null && days <= 30) {
    return { ...base, status: 'warn', label: 'Insurance Expiring', detail: `Expires in ${days} days`, action: 'Contact insurance provider for renewal' }
  }
  return { ...base, status: 'pass', label: 'Insurance Valid', detail: days !== null ? `Valid for ${days} days` : 'No expiry on file' }
}

export function checkOutOfService(vehicle) {
  const unit = vehicle.unit_number || vehicle.truck_number || vehicle.vin || 'Unknown Unit'
  const base = { key: 'vehicle_in_service', category: 'vehicle', entity: unit, entityId: vehicle.id, icon: 'oos', dotRef: '49 CFR §396.9' }

  if (vehicle.out_of_service) {
    return { ...base, status: 'fail', label: 'Out of Service', detail: vehicle.out_of_service_reason || 'Vehicle placed out of service', action: 'Resolve OOS condition before returning to service' }
  }
  return { ...base, status: 'pass', label: 'In Service', detail: 'Vehicle in service' }
}

// ─── Composite: Validate a single driver ────────────────────────────────────

export function validateDriver(driver, { clearinghouseOrders, hosLogs, dvirHistory, settings } = {}) {
  const checks = [
    checkCDL(driver),
    checkMedicalCard(driver),
    checkDrugTest(driver, clearinghouseOrders),
    checkAnnualClearinghouse(driver, clearinghouseOrders),
    checkHOSViolations(driver, hosLogs),
    checkHOSAvailability(driver, hosLogs, settings?.hos_min_hours),
    checkDVIR(driver, dvirHistory),
    checkDriverAvailability(driver),
  ]
  return checks
}

// ─── Composite: Validate a single vehicle ───────────────────────────────────

export function validateVehicle(vehicle) {
  return [
    checkAnnualInspection(vehicle),
    checkRegistration(vehicle),
    checkInsurance(vehicle),
    checkOutOfService(vehicle),
  ]
}

// ─── Composite: Validate all drivers and vehicles (for AuditToday) ──────────

export function validateFleet(drivers, vehicles, { clearinghouseOrders, hosLogs, dvirHistory, settings } = {}) {
  const allChecks = []

  ;(drivers || []).forEach(d => {
    allChecks.push(...validateDriver(d, { clearinghouseOrders, hosLogs, dvirHistory, settings }))
  })
  ;(vehicles || []).forEach(v => {
    allChecks.push(...validateVehicle(v))
  })

  const failures = allChecks.filter(c => c.status === 'fail')
  const warnings = allChecks.filter(c => c.status === 'warn' || c.status === 'info')

  // Sort: fail first, then warn, then info
  const priority = { fail: 0, warn: 1, info: 2 }
  failures.sort((a, b) => (priority[a.status] || 0) - (priority[b.status] || 0))
  warnings.sort((a, b) => (priority[a.status] || 0) - (priority[b.status] || 0))

  const driverFails = failures.filter(f => f.category === 'driver').length
  const vehicleFails = failures.filter(f => f.category === 'vehicle').length

  return {
    failures,
    warnings,
    passing: allChecks.filter(c => c.status === 'pass'),
    stats: {
      critCount: failures.length,
      warnCount: warnings.length,
      total: failures.length + warnings.length,
      driverFails,
      vehicleFails,
      driverCount: (drivers || []).length,
      vehicleCount: (vehicles || []).length,
    },
  }
}

// ─── validateDispatch ───────────────────────────────────────────────────────
// Primary entrypoint for dispatch decisions.
// Takes a driver, optional vehicle, optional load context, and supporting data.
// Returns a structured compliance verdict suitable for the dispatch engine.
//
// Usage:
//   import { validateDispatch } from '../lib/compliance'
//   const result = validateDispatch(driver, vehicle, load, { clearinghouseOrders, hosLogs, dvirHistory, settings })
//   if (result.compliance_status === 'BLOCKED') { /* hold the load */ }

export function validateDispatch(driver, vehicle, load, { clearinghouseOrders, hosLogs, dvirHistory, settings } = {}) {
  const violations = []
  const warnings = []
  const reasons = []
  const checkResults = {}

  // ── Driver checks ──
  if (driver) {
    const driverChecks = validateDriver(driver, { clearinghouseOrders, hosLogs, dvirHistory, settings })

    for (const check of driverChecks) {
      checkResults[check.key] = { status: check.status, detail: check.detail }

      if (check.status === 'fail') {
        // Apply enforcement settings — only block if the carrier has enforcement on for this check
        const enforced = isEnforced(check.key, settings)
        if (enforced) {
          violations.push({ check: check.key, label: check.label, detail: check.detail, action: check.action, dotRef: check.dotRef || null, entity: check.entity })
          reasons.push(`BLOCKED: ${check.label} — ${check.detail}`)
        } else {
          // Failed but enforcement is off — treat as warning
          warnings.push({ check: check.key, label: check.label, detail: check.detail, action: check.action, dotRef: check.dotRef || null, entity: check.entity })
          reasons.push(`WARNING (unenforced): ${check.label} — ${check.detail}`)
        }
      } else if (check.status === 'warn' || check.status === 'info') {
        warnings.push({ check: check.key, label: check.label, detail: check.detail, action: check.action, dotRef: check.dotRef || null, entity: check.entity })
        if (check.status === 'warn') {
          reasons.push(`CAUTION: ${check.label} — ${check.detail}`)
        }
      }
    }
  }

  // ── Vehicle checks ──
  if (vehicle) {
    const vehicleChecks = validateVehicle(vehicle)

    for (const check of vehicleChecks) {
      checkResults[check.key] = { status: check.status, detail: check.detail }

      if (check.status === 'fail') {
        const enforced = isEnforced(check.key, settings)
        if (enforced) {
          violations.push({ check: check.key, label: check.label, detail: check.detail, action: check.action, dotRef: check.dotRef || null, entity: check.entity })
          reasons.push(`BLOCKED: ${check.label} — ${check.detail}`)
        } else {
          warnings.push({ check: check.key, label: check.label, detail: check.detail, action: check.action, dotRef: check.dotRef || null, entity: check.entity })
          reasons.push(`WARNING (unenforced): ${check.label} — ${check.detail}`)
        }
      } else if (check.status === 'warn') {
        warnings.push({ check: check.key, label: check.label, detail: check.detail, action: check.action, dotRef: check.dotRef || null, entity: check.entity })
        reasons.push(`CAUTION: ${check.label} — ${check.detail}`)
      }
    }
  }

  // ── Load-specific checks (estimated drive time vs HOS) ──
  if (load && driver) {
    const driveHours = load.drive_time_minutes ? load.drive_time_minutes / 60 : (load.miles ? load.miles / 50 : null) // ~50mph avg
    if (driveHours !== null) {
      const hosCheck = checkHOSAvailability(driver, hosLogs, settings?.hos_min_hours)
      const hoursLeft = parseFloat(hosCheck.detail) || 11
      if (driveHours > hoursLeft) {
        warnings.push({ check: 'load_hos_fit', label: 'Load May Exceed Available Hours', detail: `Load requires ~${driveHours.toFixed(1)}h drive time, driver has ${hoursLeft.toFixed(1)}h available`, action: 'Driver may need a rest break en route — plan accordingly', entity: driver.full_name || driver.name })
        reasons.push(`CAUTION: Load requires ~${driveHours.toFixed(1)}h, driver has ${hoursLeft.toFixed(1)}h available`)
      }
    }
  }

  // ── Determine overall status ──
  const compliance_status = violations.length > 0 ? 'BLOCKED'
    : warnings.length > 0 ? 'RISK'
    : 'OK'

  return {
    compliance_status,
    reasons,
    violations,
    warnings,
    checks: checkResults,
    summary: compliance_status === 'OK'
      ? 'All compliance checks passed — clear to dispatch'
      : compliance_status === 'RISK'
      ? `${warnings.length} warning(s) — dispatch allowed with caution`
      : `${violations.length} violation(s) — dispatch blocked`,
  }
}

// ─── Enforcement mapping ────────────────────────────────────────────────────
// Maps check keys to carrier_settings enforcement toggles.
// If enforce_compliance is false, nothing is enforced.
// If a specific toggle isn't set, defaults to enforced (safe default).

function isEnforced(checkKey, settings) {
  if (!settings || settings.enforce_compliance === false) return false

  const map = {
    cdl_valid: settings.block_expired_cdl,
    medical_card: settings.block_expired_medical,
    drug_test: settings.block_failed_drug_test,
    dvir_clear: settings.block_active_defects,
    insurance_valid: settings.block_expired_insurance,
    // These are always enforced when master enforcement is on
    hos_violations: true,
    hos_available: true,
    driver_available: true,
    vehicle_in_service: true,
    annual_inspection: true,
    registration_valid: true,
  }

  const value = map[checkKey]
  // Default to true (enforced) if not explicitly set to false
  return value !== false
}
