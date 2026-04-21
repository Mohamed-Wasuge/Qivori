/**
 * GET /api/block-summary?block_id=...
 *
 * Returns the full P&L for a block:
 *   - gross (sum of shipment rates)
 *   - shipments[] with individual $
 *   - expenses itemized by category
 *   - driver_pay computed from profile.pay_type + pay_value
 *   - net
 *
 * The mobile BlockDetailScreen + Today card progress bar both read this.
 */

import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() })
  if (!res.ok) return []
  return res.json()
}

// Compute driver pay based on profile config.
// - percent:  pay_value % of gross
// - per_mile: pay_value $ per mile driven
// - flat:     pay_value $ per block
function computeDriverPay(profile, gross, totalMiles) {
  if (!profile) return 0
  const type  = profile.pay_type  || 'percent'
  const value = Number(profile.pay_value || 0)
  if (!value) return 0
  if (type === 'percent')  return gross * (value / 100)
  if (type === 'per_mile') return totalMiles * value
  if (type === 'flat')     return value
  return 0
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET' && req.method !== 'POST') {
    return Response.json({ error: 'GET or POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }
  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  const url = new URL(req.url)
  const blockId = url.searchParams.get('block_id')
  if (!blockId) {
    return Response.json({ error: 'block_id required' }, { status: 400, headers: corsHeaders(req) })
  }

  try {
    // Gate by owner — user can only summarize their own blocks.
    const [block] = await sbGet(`blocks?id=eq.${blockId}&owner_id=eq.${user.id}&limit=1`)
    if (!block) {
      return Response.json({ error: 'Block not found' }, { status: 404, headers: corsHeaders(req) })
    }

    const [shipments, stops, expenses, profile, burn] = await Promise.all([
      sbGet(`block_shipments?block_id=eq.${blockId}&order=pickup_stop_index.asc`),
      sbGet(`block_stops?block_id=eq.${blockId}&order=stop_index.asc`),
      sbGet(`expenses?block_id=eq.${blockId}&select=category,amount`),
      sbGet(`profiles?id=eq.${user.id}&select=pay_type,pay_value&limit=1`).then(r => r[0] || null),
      // Daily burn across all fixed costs + dispatch fee % + etc.
      // Captured at carrier onboarding, editable in Settings. Used to
      // prorate fixed costs into every block's P&L.
      sbGet(`companies_daily_burn?owner_id=eq.${user.id}&limit=1`).then(r => r[0] || null),
    ])

    const gross = shipments.reduce((s, sh) => s + Number(sh.rate || 0), 0)
    const shipmentsCompleted = shipments.filter(sh => sh.status === 'completed').length
    const totalMiles = shipments.reduce((s, sh) => s + Number(sh.miles || 0), 0)
    const earnedSoFar = shipments
      .filter(sh => sh.status === 'completed')
      .reduce((s, sh) => s + Number(sh.rate || 0), 0)

    // Itemize expenses by category
    const expensesByCategory = {}
    let expensesTotal = 0
    for (const e of expenses) {
      const cat = e.category || 'Other'
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(e.amount || 0)
      expensesTotal += Number(e.amount || 0)
    }

    // Prorate fixed costs across the block's duration.
    // If we have starts_at + ends_at, use those. Otherwise assume 1 day.
    let blockDays = 1
    if (block.starts_at && block.ends_at) {
      const ms = new Date(block.ends_at) - new Date(block.starts_at)
      blockDays = Math.max(1, ms / (1000 * 60 * 60 * 24))
    }

    const dailyBurn = burn ? Number(burn.total_daily || 0) : 0
    const fixedCosts = dailyBurn * blockDays
    const fixedBreakdown = burn ? {
      insurance: Number(burn.insurance_daily || 0) * blockDays,
      truck:     Number(burn.truck_daily     || 0) * blockDays,
      trailer:   Number(burn.trailer_daily   || 0) * blockDays,
      eld:       Number(burn.eld_daily       || 0) * blockDays,
      other:     Number(burn.other_daily     || 0) * blockDays,
    } : null

    const dispatchFeePct = burn ? Number(burn.dispatch_fee_pct || 0) : 0
    const dispatchFee    = gross * (dispatchFeePct / 100)

    const driverPay = computeDriverPay(profile, gross, totalMiles)
    const net = gross - expensesTotal - fixedCosts - driverPay - dispatchFee

    return Response.json({
      success: true,
      data: {
        block_id: blockId,
        block: {
          external_id:    block.external_id,
          source_company: block.source_company,
          status:         block.status,
          starts_at:      block.starts_at,
          ends_at:        block.ends_at,
          equipment:      block.equipment,
        },
        gross,
        earned_so_far: earnedSoFar,
        shipment_count: shipments.length,
        shipments_completed: shipmentsCompleted,
        stop_count: stops.length,
        stops_completed: stops.filter(s => s.status === 'completed').length,
        total_miles: totalMiles,
        shipments,

        // Expenses — receipts the driver scanned while on this block
        expenses_total: expensesTotal,
        expenses_by_category: expensesByCategory,

        // Fixed operating costs — prorated across block duration
        fixed_costs_total: fixedCosts,
        fixed_costs_breakdown: fixedBreakdown,
        block_days: blockDays,
        daily_burn: dailyBurn,

        // Driver pay — from profile config (per-driver)
        driver_pay: driverPay,
        driver_pay_config: profile
          ? { type: profile.pay_type || 'percent', value: Number(profile.pay_value || 0) }
          : null,

        // Dispatch fee — only applies when owner dispatches for other drivers
        dispatch_fee: dispatchFee,
        dispatch_fee_pct: dispatchFeePct,

        net,
      },
    }, { headers: corsHeaders(req) })
  } catch (e) {
    console.error('[block-summary] error:', e)
    return Response.json({ error: 'Server error: ' + e.message }, { status: 500, headers: corsHeaders(req) })
  }
}
