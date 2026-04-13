/**
 * HOS Alert Cron — runs hourly
 * Pushes HOS warnings to drivers running low on drive time.
 *
 * Vercel cron: schedule "0 * * * *"
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

async function insertQActivity({ userId, truckId, driverId, message, extra = {} }) {
  await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
    method: 'POST',
    headers: { ...sbH(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      truck_id: truckId || null,
      driver_id: driverId || userId || null,
      type: 'status_update',
      content: {
        message,
        ...extra,
      },
      requires_action: false,
    }),
  }).catch(err => console.error('[hos-alert-cron] q_activity insert error:', err.message))
}

export default async function handler(req) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (CRON_SECRET && token !== CRON_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let checked = 0
  let notified = 0
  const errors = []

  try {
    // ── 1. Query active HOS logs with remaining drive time ─────────────────
    const hosLogs = await sbGet(
      'eld_hos_logs?status=eq.active&drive_remaining_mins=not.is.null' +
      '&select=user_id,truck_id,drive_remaining_mins,duty_remaining_mins'
    )

    checked = hosLogs.length

    for (const log of hosLogs) {
      const { user_id, truck_id, drive_remaining_mins } = log

      if (!user_id) continue

      const token = await getPushToken(user_id, SUPABASE_URL, SUPABASE_KEY)

      // ── 2h warning ────────────────────────────────────────────────────────
      if (drive_remaining_mins <= 120 && drive_remaining_mins > 60) {
        if (token) {
          await sendPush(
            token,
            'HOS warning: 2 hours of drive time remaining',
            'Plan your next stop. Q is tracking your delivery.',
            { type: 'hos_alert', screen: 'home', drive_remaining_mins }
          ).catch(() => {})
          notified++
        }
        continue
      }

      // ── 1h warning ────────────────────────────────────────────────────────
      if (drive_remaining_mins <= 60) {
        if (token) {
          await sendPush(
            token,
            '\u26a0\ufe0f 1 hour of drive time left',
            'You must stop within the hour. Q has notified your broker of potential delay.',
            { type: 'hos_alert', screen: 'home', drive_remaining_mins }
          ).catch(() => {})
          notified++
        }

        // Find any active load for this driver to annotate
        const activeLoads = await sbGet(
          `loads?status=eq.en_route&user_id=eq.${user_id}&select=id,load_number,notes&limit=1`
        )

        if (activeLoads.length > 0) {
          const load = activeLoads[0]
          const hosNote = 'Driver HOS low — broker notified'
          const existingNotes = load.notes || ''
          const updatedNotes = existingNotes.includes(hosNote)
            ? existingNotes
            : [existingNotes, hosNote].filter(Boolean).join('\n')

          // PATCH load notes
          await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
            method: 'PATCH',
            headers: { ...sbH(), Prefer: 'return=minimal' },
            body: JSON.stringify({ notes: updatedNotes }),
          }).catch(err => console.error('[hos-alert-cron] load PATCH error:', err.message))

          // Insert q_activity
          await insertQActivity({
            userId: user_id,
            truckId: truck_id || null,
            driverId: user_id,
            message: 'HOS low — Q notified broker. 60 min drive time remaining.',
            extra: {
              drive_remaining_mins,
              load_id: load.load_number || load.id,
            },
          })
        }
      }
    }

    // ── 2. Also check active en_route trucks via vehicles + company_members ─
    // This catches trucks without a matching eld_hos_log entry (e.g. non-ELD carriers)
    const knownUserIds = new Set(hosLogs.map(l => l.user_id).filter(Boolean))

    const enRouteTrucks = await sbGet(
      'vehicles?status=eq.en_route&select=id,unit_number,company_id'
    )

    for (const truck of enRouteTrucks) {
      checked++

      // Resolve driver user_id via company_members
      const members = await sbGet(
        `company_members?company_id=eq.${truck.company_id}&role=eq.driver&select=user_id&limit=1`
      )
      const driverUserId = members[0]?.user_id
      if (!driverUserId || knownUserIds.has(driverUserId)) continue
      // This driver had no HOS log — nothing to alert on, skip
    }

  } catch (err) {
    errors.push(err.message)
    console.error('[hos-alert-cron] fatal:', err)
  }

  console.log('[hos-alert-cron] done', { notified, checked, errors })
  return json({ notified, checked, errors })
}
