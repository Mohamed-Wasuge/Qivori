/**
 * /api/build-loop — assemble a multi-leg profit loop for the OO
 *
 * Body: {
 *   origin_city: "Atlanta",
 *   end_city:    "Atlanta",      // where the OO wants to be at end of week
 *   equipment:   "Dry Van",
 *   min_rpm:     2.50,           // floor — never accept legs below
 *   target_legs: 3,              // 2-4 legs typical for a week
 *   max_total_miles: 5000        // cap — keeps the loop within HOS reach
 * }
 *
 * Returns: { loop_id, total_gross, total_net, total_miles, legs: [...] }
 *
 * Algorithm (v1):
 *   1. Pull candidate loads matching equipment + min_rpm + Offered status
 *      from the loads table (or from a load board cache)
 *   2. Greedy chain: pick best leg from origin, then best leg from
 *      that leg's destination, repeat until target_legs reached or no
 *      candidate found
 *   3. "Best" = highest profit (rate - fuel cost on that lane)
 *   4. Persist as a `loops` row + N `loop_legs` rows with status='proposed'
 *
 * v2 ideas (don't ship yet):
 *   - Backtracking instead of greedy (try multiple combinations)
 *   - HOS feasibility check (driver hours remaining)
 *   - Broker risk weighting
 *   - Backhaul preference (favor loops that end at home_base)
 *   - Use real load board feed instead of just `loads` table
 */
import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

// Crude city extractor — strips state suffix and trims whitespace
function cityOnly(loc) {
  if (!loc) return ''
  return String(loc).split(',')[0].trim().toLowerCase()
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  try {
    const body = await req.json().catch(() => ({}))
    const {
      origin_city = 'Atlanta',
      end_city = origin_city,
      equipment = 'Dry Van',
      min_rpm = 2.00,
      target_legs = 3,
      max_total_miles = 5000,
    } = body

    // ── 1. Pull candidate loads ─────────────────────────────────
    // For now we use the loads table directly. Real version would query
    // DAT/123Loadboard/email-parsed loads via a unified candidate feed.
    const candidatesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/loads?status=eq.Offered&equipment=eq.${encodeURIComponent(equipment)}&select=id,load_id,origin,destination,rate,miles,broker_name,broker_phone,equipment,pickup_date&order=created_at.desc&limit=200`,
      { headers: sbHeaders() }
    )
    if (!candidatesRes.ok) {
      return Response.json({ error: 'Could not fetch candidate loads' }, { status: 500, headers: corsHeaders(req) })
    }
    let candidates = await candidatesRes.json()

    // Filter by min_rpm (rate / miles)
    candidates = candidates
      .filter((l) => Number(l.miles) > 0)
      .map((l) => ({
        ...l,
        rpm: Number(l.rate) / Number(l.miles),
        origin_city: cityOnly(l.origin),
        dest_city: cityOnly(l.destination),
      }))
      .filter((l) => l.rpm >= min_rpm)

    if (candidates.length === 0) {
      return Response.json(
        { error: 'No candidate loads found matching your filters' },
        { status: 404, headers: corsHeaders(req) }
      )
    }

    // ── 2. Greedy chain ─────────────────────────────────────────
    const usedIds = new Set()
    const legs = []
    let currentCity = cityOnly(origin_city)
    let totalMiles = 0

    for (let i = 0; i < target_legs; i++) {
      // For the LAST leg, prefer ones that end at end_city
      const isLastLeg = i === target_legs - 1
      const desiredEnd = cityOnly(end_city)

      const matching = candidates
        .filter((l) => !usedIds.has(l.id))
        .filter((l) => l.origin_city === currentCity)
        .filter((l) => totalMiles + Number(l.miles) <= max_total_miles)

      if (matching.length === 0) break  // dead end — no leg from currentCity

      // Score: rpm (primary) + bonus if last leg ends at desired city
      const scored = matching
        .map((l) => ({
          ...l,
          score: l.rpm + (isLastLeg && l.dest_city === desiredEnd ? 0.5 : 0),
        }))
        .sort((a, b) => b.score - a.score)

      const winner = scored[0]
      usedIds.add(winner.id)
      legs.push(winner)
      totalMiles += Number(winner.miles)
      currentCity = winner.dest_city
    }

    if (legs.length === 0) {
      return Response.json(
        { error: `No loads available out of ${origin_city}` },
        { status: 404, headers: corsHeaders(req) }
      )
    }

    // ── 3. Compute profit math ──────────────────────────────────
    const totalGross = legs.reduce((s, l) => s + Number(l.rate || 0), 0)
    const totalFee = totalGross * 0.03
    const totalNet = totalGross - totalFee
    const fuelCpm = 0.55  // TODO: pull from diesel_prices table
    const fuelCost = totalMiles * fuelCpm
    const estimatedProfit = totalNet - fuelCost
    const avgRpm = totalMiles > 0 ? totalGross / totalMiles : 0
    const estimatedHosHours = totalMiles / 55  // ~55mph average

    // Loop confidence — simple heuristic, refine later
    const confidenceBase = 70
    const confBonus = legs.length >= target_legs ? 10 : 0
    const confEndsAtHome = legs[legs.length - 1].dest_city === cityOnly(end_city) ? 10 : 0
    const loopConfidence = Math.min(99, confidenceBase + confBonus + confEndsAtHome)

    const loopName = `${cityOnly(legs[0].origin_city).toUpperCase()} → ${legs.map((l) => cityOnly(l.dest_city).toUpperCase()).join(' → ')}`

    // ── 4. Persist loop + legs ──────────────────────────────────
    const loopInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/loops`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: user.id,
        loop_name: loopName,
        origin_city: legs[0].origin_city,
        end_city: legs[legs.length - 1].dest_city,
        leg_count: legs.length,
        total_miles: totalMiles,
        total_gross: totalGross,
        total_fee: totalFee,
        total_net: totalNet,
        fuel_cost: fuelCost,
        estimated_profit: estimatedProfit,
        avg_rpm: Number(avgRpm.toFixed(2)),
        estimated_hos_hours: Number(estimatedHosHours.toFixed(1)),
        loop_confidence: loopConfidence,
        status: 'proposed',
      }),
    })

    if (!loopInsertRes.ok) {
      const err = await loopInsertRes.text()
      return Response.json({ error: 'Loop insert failed: ' + err }, { status: 500, headers: corsHeaders(req) })
    }

    const insertedLoops = await loopInsertRes.json()
    const loop = insertedLoops[0]

    // Insert legs
    const legRows = legs.map((l, i) => ({
      loop_id: loop.id,
      load_id: l.id,
      sequence: i,
      origin_city: l.origin_city,
      destination_city: l.dest_city,
      miles: l.miles,
      rate: l.rate,
      rpm: Number(l.rpm.toFixed(2)),
      broker_name: l.broker_name,
      broker_phone: l.broker_phone,
      equipment: l.equipment,
      pickup_date: l.pickup_date,
      leg_status: 'queued',
    }))

    await fetch(`${SUPABASE_URL}/rest/v1/loop_legs`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(legRows),
    })

    return Response.json({
      ok: true,
      loop_id: loop.id,
      loop_name: loopName,
      total_gross: totalGross,
      total_net: totalNet,
      total_miles: totalMiles,
      total_fee: totalFee,
      fuel_cost: fuelCost,
      estimated_profit: estimatedProfit,
      avg_rpm: Number(avgRpm.toFixed(2)),
      loop_confidence: loopConfidence,
      legs: legs.map((l, i) => ({
        sequence: i,
        origin_city: l.origin_city,
        destination_city: l.dest_city,
        miles: l.miles,
        rate: Number(l.rate),
        rpm: Number(l.rpm.toFixed(2)),
        broker_name: l.broker_name,
      })),
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error: ' + err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
