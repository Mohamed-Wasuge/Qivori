import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sb() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Missing env vars' }, { status: 500, headers: corsHeaders(req) })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders(req) })
  }

  const { load_id, truck_id, driver_id, reason } = body

  if (!load_id || !truck_id || !driver_id) {
    return Response.json(
      { error: 'load_id, truck_id, and driver_id are required' },
      { status: 400, headers: corsHeaders(req) }
    )
  }

  try {
    // 1. Mark load as cancelled
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load_id}`, {
      method: 'PATCH',
      headers: { ...sb(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    if (!patchRes.ok) {
      console.error('[load-cancel-recovery] load patch failed', await patchRes.text())
    }

    // 2. Insert q_activity card
    const activityRes = await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
      method: 'POST',
      headers: { ...sb(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        truck_id,
        driver_id,
        type: 'load_cancelled',
        content: {
          loadId: load_id,
          reason: reason || 'Broker cancelled the load',
          replacementSearching: true,
        },
        requires_action: false,
      }),
    })
    if (!activityRes.ok) {
      console.error('[load-cancel-recovery] q_activity insert failed', await activityRes.text())
    }

    // 3. Send push notification (best-effort — endpoint may not exist)
    try {
      const pushRes = await fetch(`${SUPABASE_URL.replace('/rest/v1', '')}/api/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          user_id: driver_id,
          title: 'Load cancelled',
          body: 'Q is finding a replacement load now.',
        }),
      })
      if (!pushRes.ok) {
        console.log('[load-cancel-recovery] push notification skipped or failed — continuing')
      }
    } catch (pushErr) {
      console.log('[load-cancel-recovery] push endpoint not available — skipping', pushErr.message)
    }

    return Response.json(
      { success: true, message: 'Load cancelled. Q is searching for replacement.' },
      { headers: corsHeaders(req) }
    )
  } catch (err) {
    console.error('[load-cancel-recovery] Error:', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
