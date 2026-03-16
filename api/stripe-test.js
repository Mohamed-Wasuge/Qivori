/**
 * Stripe configuration test/debug endpoint.
 * GET /api/stripe-test?secret=CRON_SECRET
 *
 * Returns the current Stripe configuration status, registered webhooks,
 * and recent webhook events. Protected by CRON_SECRET.
 */

export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405 })
  }

  // Auth: require CRON_SECRET as query param or Authorization header
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const url = new URL(req.url)
  const providedSecret = url.searchParams.get('secret') || req.headers.get('authorization')?.replace('Bearer ', '')
  if (providedSecret !== cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  const result = {
    timestamp: new Date().toISOString(),
    config: {
      STRIPE_SECRET_KEY: stripeKey ? `set (${stripeKey.slice(0, 7)}...${stripeKey.slice(-4)})` : 'NOT SET',
      STRIPE_WEBHOOK_SECRET: webhookSecret ? `set (${webhookSecret.slice(0, 6)}...${webhookSecret.slice(-4)})` : 'NOT SET',
      SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL ? 'set' : 'NOT SET',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? 'set' : 'NOT SET',
    },
    webhookEndpoints: [],
    recentEvents: [],
    errors: [],
  }

  if (!stripeKey) {
    result.errors.push('STRIPE_SECRET_KEY is not set — cannot query Stripe API')
    return Response.json(result)
  }

  // Fetch registered webhook endpoints
  try {
    const endpointsRes = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=10', {
      headers: { 'Authorization': `Bearer ${stripeKey}` },
    })
    if (!endpointsRes.ok) {
      const errBody = await endpointsRes.text().catch(() => '')
      result.errors.push(`Failed to fetch webhook endpoints: ${endpointsRes.status} ${errBody}`)
    } else {
      const endpointsData = await endpointsRes.json()
      result.webhookEndpoints = (endpointsData.data || []).map(ep => ({
        id: ep.id,
        url: ep.url,
        status: ep.status,
        enabled_events: ep.enabled_events,
        api_version: ep.api_version,
        created: ep.created ? new Date(ep.created * 1000).toISOString() : null,
      }))
    }
  } catch (err) {
    result.errors.push(`Webhook endpoints fetch error: ${err?.message}`)
  }

  // Fetch recent webhook events (last 5)
  try {
    const eventsRes = await fetch('https://api.stripe.com/v1/events?limit=5', {
      headers: { 'Authorization': `Bearer ${stripeKey}` },
    })
    if (!eventsRes.ok) {
      const errBody = await eventsRes.text().catch(() => '')
      result.errors.push(`Failed to fetch events: ${eventsRes.status} ${errBody}`)
    } else {
      const eventsData = await eventsRes.json()
      result.recentEvents = (eventsData.data || []).map(ev => ({
        id: ev.id,
        type: ev.type,
        created: ev.created ? new Date(ev.created * 1000).toISOString() : null,
        livemode: ev.livemode,
        pending_webhooks: ev.pending_webhooks,
        request_id: ev.request?.id || null,
      }))
    }
  } catch (err) {
    result.errors.push(`Events fetch error: ${err?.message}`)
  }

  return Response.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
