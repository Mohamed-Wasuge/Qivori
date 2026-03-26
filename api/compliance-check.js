// api/compliance-check.js — Pre-dispatch compliance validation
// Validates driver + vehicle compliance before any load assignment/booking
// Returns pass/fail/warn with individual check details
import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.round((d - new Date()) / (1000 * 60 * 60 * 24))
}

// ── Run all compliance checks for a driver + vehicle ──────────────────────────
async function runComplianceChecks(ownerId, driverId, vehicleId, settings) {
  const checks = {}
  const failing = []
  const warnings = []

  // ── 1. DRIVER CHECKS ──────────────────────────────────────────
  let driver = null
  if (driverId) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/drivers?id=eq.${driverId}&select=*&limit=1`,
      { headers: sbHeaders() }
    )
    if (res.ok) {
      const rows = await res.json()
      driver = rows?.[0]
    }
  }

  if (!driver) {
    checks.driver_found = { status: 'fail', detail: 'Driver not found in system' }
    failing.push('driver_found')
    return { overall: 'fail', checks, failing, warnings, driver: null, vehicle: null }
  }

  // CDL validity
  const cdlExpiry = daysUntil(driver.cdl_expiry || driver.license_expiry)
  if (cdlExpiry !== null && cdlExpiry < 0) {
    checks.cdl_valid = { status: 'fail', detail: `CDL expired ${Math.abs(cdlExpiry)} days ago` }
    if (settings.block_expired_cdl !== false) failing.push('cdl_valid')
  } else if (cdlExpiry !== null && cdlExpiry < 30) {
    checks.cdl_valid = { status: 'warn', detail: `CDL expires in ${cdlExpiry} days` }
    warnings.push('cdl_valid')
  } else {
    checks.cdl_valid = { status: 'pass', detail: cdlExpiry !== null ? `Expires in ${cdlExpiry} days` : 'No expiry date on file' }
  }

  // Medical card
  const medExpiry = daysUntil(driver.medical_card_expiry || driver.med_card_expiry)
  if (medExpiry !== null && medExpiry < 0) {
    checks.medical_card = { status: 'fail', detail: `Medical card expired ${Math.abs(medExpiry)} days ago` }
    if (settings.block_expired_medical !== false) failing.push('medical_card')
  } else if (medExpiry !== null && medExpiry < 30) {
    checks.medical_card = { status: 'warn', detail: `Medical card expires in ${medExpiry} days` }
    warnings.push('medical_card')
  } else {
    checks.medical_card = { status: 'pass', detail: medExpiry !== null ? `Valid for ${medExpiry} days` : 'No expiry on file' }
  }

  // HOS availability
  const hosRes = await fetch(
    `${SUPABASE_URL}/rest/v1/eld_hos_logs?owner_id=eq.${ownerId}&driver_name=eq.${encodeURIComponent(driver.full_name || driver.name || '')}&order=start_time.desc&limit=5`,
    { headers: sbHeaders() }
  ).catch(() => null)
  let hosHoursLeft = 11 // default if no logs
  if (hosRes?.ok) {
    const logs = await hosRes.json()
    const todayDriving = logs
      .filter(l => l.status === 'driving' && new Date(l.start_time).toDateString() === new Date().toDateString())
      .reduce((sum, l) => sum + (parseFloat(l.duration_hours) || 0), 0)
    hosHoursLeft = Math.max(0, 11 - todayDriving)
  }
  const minHOS = settings.hos_min_hours || 6
  if (hosHoursLeft < 1) {
    checks.hos_available = { status: 'fail', detail: `Only ${hosHoursLeft.toFixed(1)}h remaining — cannot drive` }
    failing.push('hos_available')
  } else if (hosHoursLeft < minHOS) {
    checks.hos_available = { status: 'warn', detail: `${hosHoursLeft.toFixed(1)}h remaining — below ${minHOS}h threshold` }
    warnings.push('hos_available')
  } else {
    checks.hos_available = { status: 'pass', detail: `${hosHoursLeft.toFixed(1)}h drive time remaining` }
  }

  // Drug/alcohol clearinghouse
  const chRes = await fetch(
    `${SUPABASE_URL}/rest/v1/clearinghouse_queries?owner_id=eq.${ownerId}&driver_name=eq.${encodeURIComponent(driver.full_name || driver.name || '')}&order=created_at.desc&limit=1`,
    { headers: sbHeaders() }
  ).catch(() => null)
  if (chRes?.ok) {
    const chRows = await chRes.json()
    const latest = chRows?.[0]
    if (latest && (latest.result === 'Positive' || latest.result === 'Refused')) {
      checks.drug_test = { status: 'fail', detail: `${latest.result} result on ${latest.query_date || latest.created_at?.split('T')[0]}` }
      if (settings.block_failed_drug_test !== false) failing.push('drug_test')
    } else if (latest) {
      checks.drug_test = { status: 'pass', detail: `Last result: ${latest.result || 'Clear'} (${latest.query_date || latest.created_at?.split('T')[0]})` }
    } else {
      checks.drug_test = { status: 'warn', detail: 'No clearinghouse query on file' }
      warnings.push('drug_test')
    }
  } else {
    checks.drug_test = { status: 'warn', detail: 'Unable to check clearinghouse' }
    warnings.push('drug_test')
  }

  // Driver availability
  if (driver.is_available === false) {
    checks.driver_available = { status: 'fail', detail: `Driver status: ${driver.availability_status || 'not available'}` }
    failing.push('driver_available')
  } else {
    checks.driver_available = { status: 'pass', detail: `Driver status: ${driver.availability_status || 'ready'}` }
  }

  // ── 2. VEHICLE CHECKS ──────────────────────────────────────────
  let vehicle = null
  if (vehicleId) {
    const vRes = await fetch(
      `${SUPABASE_URL}/rest/v1/vehicles?id=eq.${vehicleId}&select=*&limit=1`,
      { headers: sbHeaders() }
    )
    if (vRes.ok) {
      const vRows = await vRes.json()
      vehicle = vRows?.[0]
    }
  }

  if (vehicle) {
    // Insurance
    const insExpiry = daysUntil(vehicle.insurance_expiry)
    if (insExpiry !== null && insExpiry < 0) {
      checks.insurance_valid = { status: 'fail', detail: `Insurance expired ${Math.abs(insExpiry)} days ago` }
      if (settings.block_expired_insurance !== false) failing.push('insurance_valid')
    } else if (insExpiry !== null && insExpiry < 30) {
      checks.insurance_valid = { status: 'warn', detail: `Insurance expires in ${insExpiry} days` }
      warnings.push('insurance_valid')
    } else {
      checks.insurance_valid = { status: 'pass', detail: insExpiry !== null ? `Valid for ${insExpiry} days` : 'No expiry on file' }
    }

    // Registration
    const regExpiry = daysUntil(vehicle.registration_expiry)
    if (regExpiry !== null && regExpiry < 0) {
      checks.registration_valid = { status: 'fail', detail: `Registration expired ${Math.abs(regExpiry)} days ago` }
      failing.push('registration_valid')
    } else if (regExpiry !== null && regExpiry < 30) {
      checks.registration_valid = { status: 'warn', detail: `Registration expires in ${regExpiry} days` }
      warnings.push('registration_valid')
    } else {
      checks.registration_valid = { status: 'pass', detail: regExpiry !== null ? `Valid for ${regExpiry} days` : 'No expiry on file' }
    }

    // Annual inspection
    const annualDue = daysUntil(vehicle.annual_inspection_due)
    if (annualDue !== null && annualDue < 0) {
      checks.annual_inspection = { status: 'fail', detail: `Annual inspection overdue by ${Math.abs(annualDue)} days` }
      failing.push('annual_inspection')
    } else if (annualDue !== null && annualDue < 30) {
      checks.annual_inspection = { status: 'warn', detail: `Annual inspection due in ${annualDue} days` }
      warnings.push('annual_inspection')
    } else {
      checks.annual_inspection = { status: 'pass', detail: annualDue !== null ? `Due in ${annualDue} days` : 'No date on file' }
    }

    // Out of service
    if (vehicle.out_of_service) {
      checks.vehicle_in_service = { status: 'fail', detail: `Out of service: ${vehicle.out_of_service_reason || 'reason not specified'}` }
      failing.push('vehicle_in_service')
    } else {
      checks.vehicle_in_service = { status: 'pass', detail: 'Vehicle in service' }
    }

    // DVIR defects
    const dvirRes = await fetch(
      `${SUPABASE_URL}/rest/v1/eld_dvirs?owner_id=eq.${ownerId}&vehicle_id=eq.${vehicleId}&status=eq.defects_found&order=created_at.desc&limit=1`,
      { headers: sbHeaders() }
    ).catch(() => null)
    if (dvirRes?.ok) {
      const dvirs = await dvirRes.json()
      if (dvirs?.length > 0) {
        const defectCount = dvirs[0].defects?.length || 0
        checks.dvir_clear = { status: settings.block_active_defects !== false ? 'fail' : 'warn', detail: `${defectCount} unresolved DVIR defect(s) from ${dvirs[0].created_at?.split('T')[0]}` }
        if (settings.block_active_defects !== false) failing.push('dvir_clear')
        else warnings.push('dvir_clear')
      } else {
        checks.dvir_clear = { status: 'pass', detail: 'No unresolved defects' }
      }
    } else {
      checks.dvir_clear = { status: 'pass', detail: 'No DVIR records' }
    }
  }

  // ── 3. DETERMINE OVERALL STATUS ────────────────────────────────
  const overall = failing.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass'

  return { overall, checks, failing, warnings, driver, vehicle }
}

// ── Fetch carrier settings ────────────────────────────────────────────────────
async function fetchSettings(ownerId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/carrier_settings?owner_id=eq.${ownerId}&select=*&limit=1`,
      { headers: sbHeaders() }
    )
    if (!res.ok) return {}
    const rows = await res.json()
    return rows?.[0] || {}
  } catch { return {} }
}

// ── Store compliance check result ─────────────────────────────────────────────
async function storeCheck(ownerId, result, driverId, vehicleId, loadId) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/compliance_checks`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        owner_id: ownerId,
        driver_id: driverId || null,
        vehicle_id: vehicleId || null,
        load_id: loadId || null,
        check_type: 'pre_dispatch',
        overall_status: result.overall,
        checks: result.checks,
        failing_checks: result.failing,
      }),
    })
  } catch {}
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { driver_id, vehicle_id, load_id } = await req.json()

    // Get carrier compliance settings
    const settings = await fetchSettings(user.id)

    // Run all checks
    const result = await runComplianceChecks(user.id, driver_id, vehicle_id, settings)

    // Store for audit trail (fire-and-forget)
    storeCheck(user.id, result, driver_id, vehicle_id, load_id)

    // Build response
    const canDispatch = result.overall !== 'fail' || settings.enforce_compliance === false
    const response = {
      canDispatch,
      overall: result.overall,
      checks: result.checks,
      failing: result.failing,
      warnings: result.warnings,
      message: result.overall === 'pass'
        ? 'All compliance checks passed — clear to dispatch'
        : result.overall === 'warn'
        ? `${result.warnings.length} warning(s) — dispatch allowed with caution`
        : `${result.failing.length} check(s) failed — dispatch blocked`,
      failureDetails: result.failing.map(f => ({
        check: f,
        ...result.checks[f],
      })),
    }

    return Response.json(response, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Compliance check failed: ' + (err.message || 'unknown') }, { status: 500, headers: corsHeaders(req) })
  }
}
