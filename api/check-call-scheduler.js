export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const CRON_SECRET = process.env.CRON_SECRET

function json(d, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
}

const sb = () => ({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' })

const ACTIVE_STATUSES = ['Assigned to Driver', 'En Route to Pickup', 'Loaded', 'In Transit', 'At Pickup', 'At Delivery']
const THREE_HOURS_MS = 3 * 60 * 60 * 1000

function callTypeForStatus(status) {
  if (['En Route to Pickup', 'At Pickup', 'Assigned to Driver'].includes(status)) return 'pickup_check'
  return 'delivery_check'
}

export default async function handler(req) {
  // Auth — cron secret required
  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'Missing Supabase config' }, 500)
  }

  try {
    // 1. Fetch all active loads
    const statusFilter = ACTIVE_STATUSES.map(s => `"${s}"`).join(',')
    const loadsRes = await fetch(
      SUPABASE_URL + '/rest/v1/loads?status=in.(' + encodeURIComponent(statusFilter.replace(/"/g, '"')) + ')&select=id,load_id,load_number,status,broker_phone,broker,broker_name,driver,driver_name,carrier_name,dest,destination,delivery_date',
      { headers: sb() }
    )
    if (!loadsRes.ok) {
      const err = await loadsRes.text()
      return json({ error: 'Failed to fetch loads', detail: err }, 500)
    }
    const loads = await loadsRes.json()

    if (!loads.length) {
      return json({ ok: true, activeLoads: 0, scheduled: 0, message: 'No active loads' })
    }

    // 2. Fetch recent check calls (last 3 hours) for these loads
    const threeHoursAgo = new Date(Date.now() - THREE_HOURS_MS).toISOString()
    const loadIds = loads.map(l => l.id)
    // Fetch recent check calls — filter by created_at > 3 hours ago
    const recentRes = await fetch(
      SUPABASE_URL + '/rest/v1/check_calls?created_at=gte.' + encodeURIComponent(threeHoursAgo) + '&select=load_id',
      { headers: sb() }
    )
    const recentCalls = recentRes.ok ? await recentRes.json() : []
    const recentLoadIds = new Set(recentCalls.map(c => c.load_id))

    // 3. Schedule check calls for loads without recent ones
    let scheduled = 0
    for (const load of loads) {
      if (recentLoadIds.has(load.id)) continue

      const callType = callTypeForStatus(load.status)
      const loadRef = load.load_id || load.load_number || load.id
      const brokerPhone = load.broker_phone
      const brokerName = load.broker || load.broker_name || ''
      const carrierName = load.driver || load.driver_name || load.carrier_name || ''
      const destination = load.dest || load.destination || ''
      const eta = load.delivery_date || ''

      const insertRes = await fetch(SUPABASE_URL + '/rest/v1/check_calls', {
        method: 'POST',
        headers: { ...sb(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          load_id: load.id,
          call_type: callType,
          broker_phone: brokerPhone,
          broker_name: brokerName,
          carrier_name: carrierName,
          destination,
          eta,
          call_status: 'scheduled',
          scheduled_at: new Date().toISOString(),
        }),
      })

      if (insertRes.ok) {
        scheduled++
      } else {
        console.error('Failed to schedule check call for load', loadRef, await insertRes.text())
      }
    }

    console.log(`Check-call scheduler: ${loads.length} active loads, ${scheduled} calls scheduled`)
    return json({ ok: true, activeLoads: loads.length, scheduled })
  } catch (e) {
    console.error('Check-call scheduler error:', e)
    return json({ error: e.message }, 500)
  }
}
