/**
 * GET /api/fleet-brief
 *
 * The owner-driver dashboard. Returns every driver under the caller's
 * company with their active block, current stop, today's earnings, and
 * a status classification (rolling / idle / alert / off).
 *
 * Also returns fleet totals (gross today, est net, miles, rolling count,
 * week pace vs goal) so the Today tab can render in one call.
 *
 * Security:
 *   - Caller must be an active member of a company
 *   - Only returns drivers in the caller's company (enforced via
 *     company_members join — same security boundary as the table's RLS)
 *
 * Returns:
 *   { drivers: [...], totals: {...} }
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

// Status classification for a driver based on their active block + timing.
function classifyDriver({ activeBlock, currentStop, todayGross }) {
  if (!activeBlock || activeBlock.status === 'completed') {
    return todayGross > 0 ? 'done' : 'off'
  }
  if (activeBlock.status === 'cancelled') return 'off'

  // Alert conditions — for v1 we just flag draft blocks that have been
  // sitting open for > 4h without the driver tapping "I'm here."
  if (currentStop?.status === 'not_started' && currentStop.arrive_by) {
    const arriveByMs = new Date(currentStop.arrive_by).getTime()
    if (Date.now() - arriveByMs > 4 * 3600 * 1000) return 'alert'
  }
  return 'rolling'
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

  try {
    // 1. Find caller's company.
    //    Prefer profiles.company_id (denormalized), fall back to
    //    company_members lookup, fall back to companies.owner_id
    //    (for solo carriers where no company_members row exists).
    let companyId = null

    const profile = await sbGet(`profiles?id=eq.${user.id}&select=company_id&limit=1`).then(r => r[0])
    if (profile?.company_id) companyId = profile.company_id

    if (!companyId) {
      const membership = await sbGet(
        `company_members?user_id=eq.${user.id}&status=eq.active&select=company_id&limit=1`
      ).then(r => r[0])
      if (membership?.company_id) companyId = membership.company_id
    }

    if (!companyId) {
      const ownedCompany = await sbGet(
        `companies?owner_id=eq.${user.id}&select=id&limit=1`
      ).then(r => r[0])
      if (ownedCompany?.id) companyId = ownedCompany.id
    }

    if (!companyId) {
      // Solo driver with no company record. Fleet is just themselves.
      return Response.json({
        success: true,
        data: {
          drivers: [],
          totals: empty_totals(),
          solo: true,
        },
      }, { headers: corsHeaders(req) })
    }

    // 2. Pull all member user IDs for this company.
    const members = await sbGet(
      `company_members?company_id=eq.${companyId}&status=eq.active&select=user_id,role`
    )
    // Include the owner even if they don't have a company_members row yet
    // (small carrier that hasn't invited anyone — they still see themselves).
    const memberUserIds = new Set(members.map(m => m.user_id))
    memberUserIds.add(user.id)

    if (memberUserIds.size === 0) {
      return Response.json({ success: true, data: { drivers: [], totals: empty_totals() } }, { headers: corsHeaders(req) })
    }

    // 3. Pull driver profile info in bulk.
    const profileIds = Array.from(memberUserIds).map(id => `"${id}"`).join(',')
    const profiles = await sbGet(
      `profiles?id=in.(${profileIds})&select=id,full_name,phone,avatar_url,assigned_truck_id,last_lat,last_lng,last_ping_at,last_speed_mph,last_heading,location_permission_granted`
    )
    const vehicleIds = profiles.map(p => p.assigned_truck_id).filter(Boolean)
    const vehicles = vehicleIds.length
      ? await sbGet(
          `vehicles?id=in.(${vehicleIds.map(v => `"${v}"`).join(',')})&select=id,unit_number`
        )
      : []
    const vehicleById = Object.fromEntries(vehicles.map(v => [v.id, v]))

    // 4. Pull the active (draft OR active) block per user.
    //    One query, then group client-side.
    const userIds = Array.from(memberUserIds)
    const userIdsSql = userIds.map(id => `"${id}"`).join(',')
    const blocks = await sbGet(
      `blocks?owner_id=in.(${userIdsSql})&status=in.(draft,active)&order=starts_at.asc,created_at.desc`
    )
    const blockByOwner = {}
    for (const b of blocks) {
      if (!blockByOwner[b.owner_id]) blockByOwner[b.owner_id] = b
    }

    // 5. For each active block, pull its first not-completed stop +
    //    count of completed stops + total stops (one query per block —
    //    keep it tight since fleets are 2-6 drivers typical).
    const blockIds = Object.values(blockByOwner).map(b => b.id)
    const stopsByBlock = {}
    if (blockIds.length) {
      const stops = await sbGet(
        `block_stops?block_id=in.(${blockIds.map(b => `"${b}"`).join(',')})&order=stop_index.asc`
      )
      for (const s of stops) {
        if (!stopsByBlock[s.block_id]) stopsByBlock[s.block_id] = []
        stopsByBlock[s.block_id].push(s)
      }
    }

    // 6. Pull today's earnings per user (sum of completed shipments today).
    //    If no shipments, fall back to block.total_rate * stops_completed_ratio.
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayStartIso = todayStart.toISOString()
    const todayShipments = await sbGet(
      `block_shipments?owner_id=in.(${userIdsSql})&status=eq.completed&completed_at=gte.${todayStartIso}&select=owner_id,rate`
    )
    const todayGrossByOwner = {}
    for (const sh of todayShipments) {
      todayGrossByOwner[sh.owner_id] = (todayGrossByOwner[sh.owner_id] || 0) + Number(sh.rate || 0)
    }

    // 7. Pull this week's completed shipments for pace bar.
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekStartIso = weekStart.toISOString()
    const weekShipments = await sbGet(
      `block_shipments?owner_id=in.(${userIdsSql})&status=eq.completed&completed_at=gte.${weekStartIso}&select=owner_id,rate,miles`
    )
    let weekGross = 0
    let weekMiles = 0
    for (const sh of weekShipments) {
      weekGross += Number(sh.rate || 0)
      weekMiles += Number(sh.miles || 0)
    }

    // 8. Pull weekly goal from owner's profile (owner sets it at signup)
    const ownerProfile = await sbGet(`profiles?id=eq.${user.id}&select=weekly_goal`).then(r => r[0])
    const weekGoal = Number(ownerProfile?.weekly_goal || 0)

    // 9. Build the drivers list. One row per member.
    const drivers = profiles.map(p => {
      const block = blockByOwner[p.id] || null
      const stops = block ? (stopsByBlock[block.id] || []) : []
      const currentStop = stops.find(s => !['completed', 'skipped'].includes(s.status)) || null
      const completed   = stops.filter(s => s.status === 'completed').length
      const todayGross  = todayGrossByOwner[p.id] || 0
      const status      = classifyDriver({ activeBlock: block, currentStop, todayGross })
      const truck       = vehicleById[p.assigned_truck_id] || null

      // Location freshness — anything > 15 min is "stale", meaning the
      // driver's phone hasn't pinged recently (probably not foregrounded).
      const pingAt = p.last_ping_at ? new Date(p.last_ping_at).getTime() : null
      const pingAgeSec = pingAt ? Math.round((Date.now() - pingAt) / 1000) : null
      const locationFresh = pingAgeSec != null && pingAgeSec < 15 * 60

      return {
        user_id: p.id,
        name: p.full_name || 'Driver',
        avatar_url: p.avatar_url || null,
        phone: p.phone || null,
        truck_unit: truck?.unit_number || null,
        status,
        is_self: p.id === user.id,

        // Live position from the driver's foreground GPS ping.
        // Null if they haven't granted permission or never pinged.
        location: (p.last_lat != null && p.last_lng != null) ? {
          lat:           p.last_lat,
          lng:           p.last_lng,
          ping_at:       p.last_ping_at,
          ping_age_sec:  pingAgeSec,
          speed_mph:     p.last_speed_mph || 0,
          heading:       p.last_heading,
          fresh:         locationFresh,
        } : null,
        location_permission_granted: p.location_permission_granted === true,
        active_block: block ? {
          id: block.id,
          external_id: block.external_id,
          source_company: block.source_company,
          total_rate: Number(block.total_rate || 0),
          total_miles: Number(block.total_miles || 0),
          origin_fc: stops[0]?.external_stop_id || null,
          dest_fc:   stops[stops.length - 1]?.external_stop_id || null,
          stops_total: stops.length,
          stops_completed: completed,
        } : null,
        current_stop: currentStop ? {
          stop_index: currentStop.stop_index,
          location_name: currentStop.location_name,
          city: currentStop.city,
          state: currentStop.state,
          action_label: currentStop.action_label,
          arrive_by: currentStop.arrive_by,
          status: currentStop.status,
        } : null,
        today_gross: todayGross,
      }
    })

    // 10. Fleet totals.
    const rolling = drivers.filter(d => d.status === 'rolling').length
    const idle    = drivers.filter(d => d.status === 'alert').length
    const offOrDone = drivers.filter(d => ['off', 'done'].includes(d.status)).length
    const grossToday = drivers.reduce((s, d) => s + Number(d.today_gross || 0), 0)

    // Very rough net estimate — 44% margin is an industry-ish average for
    // owner-operators after fuel + driver pay + fixed. We'll replace this
    // with actual block-summary numbers once we wire them per-driver.
    const estNetToday = grossToday * 0.44

    return Response.json({
      success: true,
      data: {
        company_id: companyId,
        drivers,
        totals: {
          gross_today: grossToday,
          est_net_today: estNetToday,
          miles_today: drivers.reduce((s, d) => s + (d.active_block?.total_miles || 0), 0),
          rolling_count: rolling,
          idle_count: idle,
          off_count: offOrDone,
          driver_count: drivers.length,
          week_gross: weekGross,
          week_miles: weekMiles,
          week_goal: weekGoal,
          week_pace_pct: weekGoal > 0 ? Math.round((weekGross / weekGoal) * 100) : null,
        },
      },
    }, { headers: corsHeaders(req) })
  } catch (e) {
    console.error('[fleet-brief] error:', e)
    return Response.json({ error: 'Server error: ' + e.message }, { status: 500, headers: corsHeaders(req) })
  }
}

function empty_totals() {
  return {
    gross_today: 0, est_net_today: 0, miles_today: 0,
    rolling_count: 0, idle_count: 0, off_count: 0, driver_count: 0,
    week_gross: 0, week_miles: 0, week_goal: 0, week_pace_pct: null,
  }
}
