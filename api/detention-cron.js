export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const sbH = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

export default async function handler(req) {
  // Verify CRON_SECRET if set
  if (CRON_SECRET) {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (token !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const now = new Date()
  let checked = 0
  let triggered = 0

  try {
    // Query detention_records where status = 'counting_free_time' and arrived_at IS NOT NULL
    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/detention_records?status=eq.counting_free_time&arrived_at=not.is.null&select=*`,
      { method: 'GET', headers: sbH() }
    )

    if (!fetchRes.ok) {
      const err = await fetchRes.text()
      return new Response(JSON.stringify({ error: 'Failed to fetch detention_records', detail: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const records = await fetchRes.json()
    checked = records.length

    for (const record of records) {
      const arrivedAt = new Date(record.arrived_at)
      const freeTimeHours = record.free_time_hours ?? 2
      const freeTimeExpiry = new Date(arrivedAt.getTime() + freeTimeHours * 3600000)

      if (now <= freeTimeExpiry) continue

      const detentionStartedAt = now.toISOString()
      const ratePerHour = record.rate_per_hour || 75

      // PATCH detention_records → status: 'billing'
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/detention_records?id=eq.${record.id}`,
        {
          method: 'PATCH',
          headers: sbH(),
          body: JSON.stringify({
            status: 'billing',
            detention_started_at: detentionStartedAt,
            rate_per_hour: ratePerHour,
          }),
        }
      )

      if (!patchRes.ok) {
        console.error(`Failed to patch detention_records id=${record.id}:`, await patchRes.text())
        continue
      }

      // INSERT into q_activity
      const insertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/q_activity`,
        {
          method: 'POST',
          headers: sbH(),
          body: JSON.stringify({
            truck_id: record.truck_id,
            driver_id: record.driver_id,
            type: 'detention',
            content: {
              message: `Free time expired — detention clock started. $${ratePerHour}/hr billing to broker.`,
              rate_per_hour: ratePerHour,
              detention_started_at: detentionStartedAt,
              load_id: record.load_id,
              status: 'billing',
            },
            requires_action: false,
          }),
        }
      )

      if (!insertRes.ok) {
        console.error(`Failed to insert q_activity for detention_record id=${record.id}:`, await insertRes.text())
        // Don't skip triggered count — the patch succeeded
      }

      triggered++
    }

    return new Response(JSON.stringify({ triggered, checked }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('detention-cron error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
