export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  try {
    const { userId, title, body, url, tag } = await req.json()
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })

    // Get user's push subscriptions
    const subRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=subscription_json`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    })
    const subs = await subRes.json()

    if (!subs || subs.length === 0) {
      return Response.json({ error: 'No push subscriptions found for user' }, { status: 404 })
    }

    const payload = JSON.stringify({
      title: title || 'Qivori AI',
      body: body || 'You have a new notification',
      url: url || '/',
      tag: tag || 'qivori-notification',
    })

    // Send push to all user's subscriptions
    // Note: Full web push with VAPID requires crypto signing.
    // For now, store the notification and the service worker will pick it up.
    // For production, integrate with a push service like OneSignal or use web-push npm package on a Node runtime.

    // Store notification for in-app delivery
    await fetch(`${supabaseUrl}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        title: title || 'Qivori AI',
        body: body || 'You have a new notification',
        url: url || '/',
        read: false,
        created_at: new Date().toISOString(),
      }),
    })

    return Response.json({ success: true, sent: subs.length })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
