// api/compliance-check.js — Pre-dispatch compliance validation
// Validates driver + vehicle compliance before any load assignment/booking
// Uses shared compliance service from _lib/compliance.js
import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import { validateDispatch, createFetchers } from './_lib/compliance.js'

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
        overall_status: result.compliance_status,
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
    const cf = createFetchers(SUPABASE_URL, SERVICE_KEY)

    // Fetch driver first (needed for name-based lookups)
    const driver = driver_id ? await cf.fetchDriver(driver_id) : null
    if (driver_id && !driver) {
      return Response.json({
        canDispatch: false,
        compliance_status: 'BLOCKED',
        checks: { driver_found: { status: 'fail', detail: 'Driver not found in system' } },
        failing: ['driver_found'],
        warnings: [],
        violations: [{ check: 'driver_found', detail: 'Driver not found' }],
        message: 'Driver not found — cannot validate compliance',
      }, { headers: corsHeaders(req) })
    }

    const driverName = driver?.full_name || driver?.name || ''

    // Fetch all compliance data in parallel
    const [settings, vehicle, clearinghouseResult, hosHoursLeft, dvirResult] = await Promise.all([
      cf.fetchSettings(user.id),
      vehicle_id ? cf.fetchVehicle(vehicle_id) : Promise.resolve(null),
      driver ? cf.fetchClearinghouse(user.id, driverName) : Promise.resolve(null),
      driver ? cf.fetchHOSHoursLeft(user.id, driverName) : Promise.resolve(11),
      vehicle_id ? cf.fetchDVIRDefects(user.id, vehicle_id) : Promise.resolve(null),
    ])

    // Run shared compliance validation
    const result = validateDispatch({
      driver,
      vehicle,
      clearinghouseResult,
      hosHoursLeft,
      dvirResult,
      settings,
    })

    // Store for audit trail (fire-and-forget)
    storeCheck(user.id, result, driver_id, vehicle_id, load_id)

    // Build response — maintain backwards-compatible shape
    const canDispatch = result.compliance_status !== 'BLOCKED' || settings.enforce_compliance === false
    return Response.json({
      canDispatch,
      compliance_status: result.compliance_status,
      overall: result.compliance_status === 'BLOCKED' ? 'fail' : result.compliance_status === 'RISK' ? 'warn' : 'pass',
      checks: result.checks,
      failing: result.failing,
      warnings: result.warnings.map(w => w.check),
      violations: result.violations,
      message: result.summary,
      failureDetails: result.violations.map(v => ({
        check: v.check,
        status: 'fail',
        detail: v.detail,
        dotRef: v.dotRef,
      })),
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Compliance check failed: ' + (err.message || 'unknown') }, { status: 500, headers: corsHeaders(req) })
  }
}
