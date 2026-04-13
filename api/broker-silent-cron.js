/**
 * Broker Silent Cron — runs daily
 * Finds loads where Q called a broker 24–48h ago with no response,
 * then queues a follow-up and notifies the driver.
 *
 * Vercel cron: schedule "0 14 * * *" (10am ET daily)
 * Runtime: Edge
 */

export const config = { runtime: 'edge' }

import { sendPush, getPushToken } from './_lib/push.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const CRON_SECRET  = process.env.CRON_SECRET

const sbH = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbH() })
  if (!res.ok) return []
  return res.json()
}

export default async function handler(req) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (CRON_SECRET && token !== CRON_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let checked = 0
  let followed_up = 0
  const errors = []

  try {
    // ── 1. Query retell_calls: unanswered, 24–48h ago ──────────────────────
    const now = new Date()
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

    const stalledCalls = await sbGet(
      `retell_calls` +
      `?outcome=in.(voicemail,no_answer,busy)` +
      `&created_at=lte.${cutoff24h}` +
      `&created_at=gte.${cutoff48h}` +
      `&select=user_id,load_id,broker_name,broker_phone,retell_call_id` +
      `&order=created_at.desc`
    )

    checked = stalledCalls.length

    for (const call of stalledCalls) {
      const { user_id, load_id, broker_name, broker_phone, retell_call_id } = call

      if (!user_id || !load_id) continue

      // ── 2. Check if a follow-up call already exists for this load ────────
      // A successful or newer call supersedes this one
      const newerCalls = await sbGet(
        `retell_calls` +
        `?load_id=eq.${encodeURIComponent(load_id)}` +
        `&created_at=gt.${cutoff24h}` +
        `&select=retell_call_id,outcome` +
        `&limit=1`
      )

      const bookedCall = await sbGet(
        `retell_calls` +
        `?load_id=eq.${encodeURIComponent(load_id)}` +
        `&outcome=eq.booked` +
        `&select=retell_call_id` +
        `&limit=1`
      )

      // Also skip if this call row is already marked as follow_up_queued
      const alreadyQueued = await sbGet(
        `retell_calls` +
        `?retell_call_id=eq.${encodeURIComponent(retell_call_id)}` +
        `&notes=eq.follow_up_queued` +
        `&select=retell_call_id` +
        `&limit=1`
      )

      if (newerCalls.length > 0 || bookedCall.length > 0 || alreadyQueued.length > 0) {
        continue
      }

      const brokerLabel = broker_name || broker_phone || 'Unknown Broker'

      // ── 3. Insert q_activity ──────────────────────────────────────────────
      await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
        method: 'POST',
        headers: { ...sbH(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          truck_id: null,
          driver_id: user_id,
          type: 'status_update',
          content: {
            message: `Broker ${brokerLabel} hasn't responded in 24h. Q will retry the call.`,
            broker_name: brokerLabel,
            load_id,
          },
          requires_action: false,
        }),
      }).catch(err => console.error('[broker-silent-cron] q_activity insert error:', err.message))

      // ── 4. Push notification to driver ────────────────────────────────────
      const pushToken = await getPushToken(user_id, SUPABASE_URL, SUPABASE_KEY)
      if (pushToken) {
        await sendPush(
          pushToken,
          'Broker went silent',
          `${brokerLabel} hasn't responded. Q is retrying.`,
          { type: 'broker_silent', screen: 'home', load_id }
        ).catch(() => {})
      }

      // ── 5. Mark retell_call row as follow_up_queued ───────────────────────
      await fetch(
        `${SUPABASE_URL}/rest/v1/retell_calls?retell_call_id=eq.${encodeURIComponent(retell_call_id)}`,
        {
          method: 'PATCH',
          headers: { ...sbH(), Prefer: 'return=minimal' },
          body: JSON.stringify({ notes: 'follow_up_queued' }),
        }
      ).catch(err => console.error('[broker-silent-cron] retell_calls PATCH error:', err.message))

      followed_up++
    }

  } catch (err) {
    errors.push(err.message)
    console.error('[broker-silent-cron] fatal:', err)
  }

  console.log('[broker-silent-cron] done', { followed_up, checked, errors })
  return json({ followed_up, checked, errors })
}
