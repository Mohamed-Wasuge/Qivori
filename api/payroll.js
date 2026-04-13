/**
 * POST /api/payroll
 * action: 'run'         — calculate + create payroll run for the week
 * action: 'pay_driver'  — mark individual driver payslip as paid + push notification
 * action: 'history'     — list past payroll runs (GET equivalent via POST)
 *
 * Runtime: Edge
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { sendPush, getPushToken, buildQActivityPush } from './_lib/push.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const sbH = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' })

async function sb(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbH() })
  return r.ok ? r.json() : []
}
async function sbPost(table, body, prefer = 'return=representation') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sbH(), Prefer: prefer }, body: JSON.stringify(body),
  })
  return r.ok ? r.json() : null
}
async function sbPatch(table, filter, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH', headers: { ...sbH(), Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  return r.ok ? r.json() : null
}

function weekRange(offsetWeeks = 0) {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7) - offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  const body = await req.json().catch(() => ({}))
  const { action } = body

  // ── history ──────────────────────────────────────────────────────────────────
  if (action === 'history') {
    const runs = await sb(`payroll_runs?owner_id=eq.${user.id}&order=week_start.desc&limit=12`)
    if (!Array.isArray(runs)) return Response.json({ runs: [] }, { headers: corsHeaders(req) })

    // Attach payslips to each run
    const enriched = await Promise.all(runs.map(async run => {
      const payslips = await sb(`driver_payslips?payroll_run_id=eq.${run.id}&select=*`)
      return { ...run, payslips: Array.isArray(payslips) ? payslips : [] }
    }))
    return Response.json({ runs: enriched }, { headers: corsHeaders(req) })
  }

  // ── pay_driver ───────────────────────────────────────────────────────────────
  if (action === 'pay_driver') {
    const { payslipId, driverId } = body
    if (!payslipId) return Response.json({ error: 'payslipId required' }, { status: 400, headers: corsHeaders(req) })

    const updated = await sbPatch('driver_payslips', `id=eq.${payslipId}`, {
      status: 'paid', paid_at: new Date().toISOString(),
    })

    const payslip = Array.isArray(updated) ? updated[0] : null

    // Push notification to driver
    if (driverId && payslip) {
      const token = await getPushToken(driverId, SUPABASE_URL, SUPABASE_KEY)
      if (token) {
        const net = payslip.net_pay || 0
        const runRows = await sb(`payroll_runs?id=eq.${payslip.payroll_run_id}&select=week_start,week_end&limit=1`)
        const run = runRows[0]
        const weekLabel = run
          ? `${new Date(run.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(run.week_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : 'this week'
        await sendPush(
          token,
          `You got paid $${net.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          `Week of ${weekLabel} — ${payslip.loads_completed || 0} load${payslip.loads_completed !== 1 ? 's' : ''}. Check Pay tab for breakdown.`,
          { type: 'payment_received', screen: 'pay' }
        ).catch(() => {})
      }
    }

    return Response.json({ success: true, payslip }, { headers: corsHeaders(req) })
  }

  // ── run ──────────────────────────────────────────────────────────────────────
  if (action === 'run') {
    const { weekOffset = 0 } = body
    const { start, end } = weekRange(weekOffset)

    // Get company
    const companies = await sb(`companies?owner_id=eq.${user.id}&select=id,name&limit=1`)
    const company = companies[0]
    if (!company) return Response.json({ error: 'No company found' }, { status: 404, headers: corsHeaders(req) })

    // Get all active drivers in this company
    const members = await sb(`company_members?company_id=eq.${company.id}&status=eq.active&select=user_id`)
    const driverIds = (Array.isArray(members) ? members : []).map(m => m.user_id).filter(Boolean)

    if (driverIds.length === 0) {
      return Response.json({ error: 'No active drivers in your fleet' }, { status: 400, headers: corsHeaders(req) })
    }

    // Get loads completed by each driver this week (delivered status)
    const loadsRes = await sb(
      `loads?owner_id=eq.${user.id}&status=in.(Delivered,delivered)&created_at=gte.${start}T00:00:00Z&created_at=lte.${end}T23:59:59Z&select=id,truck_id,driver_id,rate,gross_pay,miles`
    )
    const allLoads = Array.isArray(loadsRes) ? loadsRes : []

    // Get pay structures
    const payStructures = await sb(
      `driver_pay_structures?owner_id=eq.${user.id}&select=*`
    )
    const payStructMap = {}
    if (Array.isArray(payStructures)) {
      for (const ps of payStructures) {
        if (ps.driver_id) payStructMap[ps.driver_id] = ps
      }
    }

    const payslips = []
    let totalGross = 0, totalDriverPay = 0, totalQFee = 0

    for (const driverId of driverIds) {
      const driverLoads = allLoads.filter(l => l.driver_id === driverId || l.truck_id)
      const gross = driverLoads.reduce((s, l) => s + Number(l.rate || l.gross_pay || 0), 0)
      const miles = driverLoads.reduce((s, l) => s + Number(l.miles || 0), 0)
      const qFee = gross * 0.03

      // Pay structure: default 70% if no structure on file
      const ps = payStructMap[driverId]
      let driverPct = 0.70
      let leaseDed = 0, insDed = 0, advDed = 0

      if (ps) {
        if (ps.pay_type === 'percentage') driverPct = (ps.percentage || 70) / 100
        else if (ps.pay_type === 'per_mile') {
          // per-mile: rate × miles
          const driverGross = (ps.per_mile_rate || 0.45) * miles
          const net = driverGross - (ps.truck_lease_weekly || 0) - (ps.insurance_weekly || 0) - Math.min(ps.advance_balance || 0, driverGross * 0.2)
          payslips.push({
            driver_id: driverId,
            truck_id: driverLoads[0]?.truck_id || null,
            loads_completed: driverLoads.length,
            total_miles: miles,
            gross_earned: gross,
            driver_percentage: null,
            driver_gross: driverGross,
            truck_lease_deduction: ps.truck_lease_weekly || 0,
            insurance_deduction: ps.insurance_weekly || 0,
            advance_deduction: Math.min(ps.advance_balance || 0, driverGross * 0.2),
            net_pay: Math.max(0, net),
            status: 'pending',
          })
          totalGross += gross
          totalDriverPay += Math.max(0, net)
          totalQFee += qFee
          continue
        } else if (ps.pay_type === 'flat') {
          const net = (ps.flat_rate || 0) - (ps.truck_lease_weekly || 0) - (ps.insurance_weekly || 0)
          payslips.push({
            driver_id: driverId,
            truck_id: driverLoads[0]?.truck_id || null,
            loads_completed: driverLoads.length,
            total_miles: miles,
            gross_earned: gross,
            driver_percentage: null,
            driver_gross: ps.flat_rate || 0,
            truck_lease_deduction: ps.truck_lease_weekly || 0,
            insurance_deduction: ps.insurance_weekly || 0,
            advance_deduction: 0,
            net_pay: Math.max(0, net),
            status: 'pending',
          })
          totalGross += gross
          totalDriverPay += Math.max(0, net)
          totalQFee += qFee
          continue
        }
        leaseDed = ps.truck_lease_weekly || 0
        insDed = ps.insurance_weekly || 0
        advDed = Math.min(ps.advance_balance || 0, gross * driverPct * 0.3)
      }

      const driverGross = (gross - qFee) * driverPct
      const netPay = Math.max(0, driverGross - leaseDed - insDed - advDed)

      payslips.push({
        driver_id: driverId,
        truck_id: driverLoads[0]?.truck_id || null,
        loads_completed: driverLoads.length,
        total_miles: miles,
        gross_earned: gross,
        driver_percentage: driverPct * 100,
        driver_gross: driverGross,
        truck_lease_deduction: leaseDed,
        insurance_deduction: insDed,
        advance_deduction: advDed,
        net_pay: netPay,
        status: 'pending',
      })

      totalGross += gross
      totalDriverPay += netPay
      totalQFee += qFee
    }

    const ownerCut = totalGross - totalQFee - totalDriverPay

    // Insert payroll run
    const runRows = await sbPost('payroll_runs', {
      owner_id: user.id,
      week_start: start,
      week_end: end,
      total_gross: totalGross,
      total_q_fee: totalQFee,
      total_driver_pay: totalDriverPay,
      owner_cut: ownerCut,
      status: 'pending',
    })
    const run = Array.isArray(runRows) ? runRows[0] : runRows
    if (!run?.id) return Response.json({ error: 'Failed to create payroll run' }, { status: 500, headers: corsHeaders(req) })

    // Insert payslips
    const slipsWithRunId = payslips.map(p => ({ ...p, payroll_run_id: run.id }))
    const insertedSlips = await sbPost('driver_payslips', slipsWithRunId)

    return Response.json({
      run: { ...run, payslips: Array.isArray(insertedSlips) ? insertedSlips : [] },
      summary: {
        week: `${start} – ${end}`,
        drivers: payslips.length,
        totalGross,
        totalQFee,
        totalDriverPay,
        ownerCut,
      },
    }, { headers: corsHeaders(req) })
  }

  return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders(req) })
}
