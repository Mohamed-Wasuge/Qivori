/**
 * /api/q-dispatch — Q starts hunting loads when driver goes online
 *
 * Called by the mobile app when driver taps "Go Online" in the Q tab.
 * Searches 123LB/DAT for loads matching the driver's equipment + route,
 * scores them against negotiation_settings, and fires Retell broker calls
 * for the top matches.
 *
 * POST { origin, destination, equipment, radius }
 * Returns { dispatched: N, calls: [{ broker, load }] }
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SB_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SB_KEY = () => process.env.SUPABASE_SERVICE_KEY
const SELF   = () => process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.qivori.com'

const sb = () => ({
  apikey: SB_KEY(),
  Authorization: `Bearer ${SB_KEY()}`,
  'Content-Type': 'application/json',
})

async function sbGet(path) {
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, { headers: sb() })
  return res.ok ? res.json() : []
}

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  try {
    const body = await req.json().catch(() => ({}))
    const equipment = body.equipment || 'Dry Van'
    const origin = body.origin || ''
    const destination = body.destination || ''

    // ── 1. Get negotiation settings ──────────────────────────────────────────
    const negRows = await sbGet(`negotiation_settings?user_id=eq.${user.id}&select=min_rate_per_mile&limit=1`)
    const minRpm = Number(negRows[0]?.min_rate_per_mile || 2.50)

    // ── 2. Get load board credentials for this user ──────────────────────────
    const credsRows = await sbGet(
      `load_board_credentials?user_id=eq.${user.id}&select=provider,credentials&limit=10`
    )
    const creds123 = credsRows.find(c => c.provider === '123loadboard')?.credentials || null
    const credsDat  = credsRows.find(c => c.provider === 'dat')?.credentials || null

    // ── 3. Search load board via internal endpoint ───────────────────────────
    const searchParams = new URLSearchParams({
      origin: origin || 'Dallas, TX',
      destination: destination || '',
      equipment,
      limit: '15',
    })
    if (creds123) searchParams.set('provider', '123loadboard')
    else if (credsDat) searchParams.set('provider', 'dat')

    const searchRes = await fetch(`${SELF()}/api/load-board?${searchParams}`, {
      headers: {
        Authorization: `Bearer ${user.access_token || SB_KEY()}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => null)

    let loads = []
    if (searchRes?.ok) {
      const data = await searchRes.json().catch(() => ({}))
      loads = data.loads || data.results || []
    }

    // ── 4. Score + filter loads ───────────────────────────────────────────────
    const scored = loads
      .map(load => {
        const rate  = Number(load.rate || load.total_rate || 0)
        const miles = Number(load.miles || load.distance || 0)
        const rpm   = miles > 0 ? rate / miles : 0
        return { ...load, _rpm: rpm, _rate: rate, _miles: miles }
      })
      .filter(l => l._rpm >= minRpm && l._rate > 0 && l.brokerPhone)
      .sort((a, b) => b._rpm - a._rpm)
      .slice(0, 3) // Top 3 only — don't flood brokers

    if (scored.length === 0) {
      // Log that Q searched but found nothing qualifying
      await logQActivity(user.id, origin, destination, 0)
      return Response.json({
        ok: true, dispatched: 0,
        message: `Q searched ${loads.length} loads — none met $${minRpm}/mi minimum. Will retry when new loads post.`,
      }, { headers: corsHeaders(req) })
    }

    // ── 5. Fire Retell broker calls for top matches ───────────────────────────
    const calls = []
    const token = req.headers.get('authorization') || `Bearer ${SB_KEY()}`

    for (const load of scored) {
      try {
        const callRes = await fetch(`${SELF()}/api/retell-broker-call`, {
          method: 'POST',
          headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone:          load.brokerPhone || load.broker_phone,
            brokerName:     load.brokerName  || load.broker_name  || 'Broker',
            brokerEmail:    load.brokerEmail || load.broker_email || null,
            loadId:         String(load.id   || load.loadId || ''),
            originCity:     load.originCity  || load.origin_city  || origin,
            destinationCity:load.destinationCity || load.destination_city || destination,
            rate:           load._rate,
            miles:          load._miles,
            equipment:      equipment,
            loadDetails:    `${load.originCity || origin} → ${load.destinationCity || destination}. $${load._rate.toLocaleString()} (${load._rpm.toFixed(2)}/mi). ${equipment}.`,
          }),
        })
        const callData = callRes.ok ? await callRes.json().catch(() => ({})) : {}
        calls.push({
          broker:   load.brokerName || 'Broker',
          load:     `${load.originCity || origin} → ${load.destinationCity || destination}`,
          rate:     load._rate,
          callId:   callData.callId || null,
          ok:       callRes.ok,
        })
      } catch (e) {
        calls.push({ broker: load.brokerName || 'Broker', ok: false, error: e.message })
      }
    }

    const dispatched = calls.filter(c => c.ok).length
    await logQActivity(user.id, origin, destination, dispatched, calls)

    return Response.json({
      ok: true,
      dispatched,
      calls,
      message: `Q is calling ${dispatched} broker${dispatched !== 1 ? 's' : ''} now. Check the Q tab for live updates.`,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[q-dispatch] error:', err.message)
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}

async function logQActivity(userId, origin, destination, dispatched, calls = []) {
  try {
    // Get truck_id for this user
    const rows = await sbGet(`profiles?id=eq.${userId}&select=truck_id&limit=1`)
    const truckId = rows[0]?.truck_id || null
    if (!truckId) return

    const brokerNames = calls.filter(c => c.ok).map(c => c.broker).join(', ')
    await fetch(`${SB_URL()}/rest/v1/q_activity`, {
      method: 'POST',
      headers: { ...sb(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        truck_id: truckId,
        driver_id: userId,
        type: dispatched > 0 ? 'load_found' : 'status_update',
        content: {
          message: dispatched > 0
            ? `Q is calling ${dispatched} broker${dispatched !== 1 ? 's' : ''} now${brokerNames ? ` (${brokerNames})` : ''}. Watch the negotiation feed for live offers.`
            : `Q scanned the load board — no loads met your minimum rate yet. Staying online and watching.`,
          origin,
          destination,
        },
        requires_action: false,
      }),
    })
  } catch { /* non-fatal */ }
}
