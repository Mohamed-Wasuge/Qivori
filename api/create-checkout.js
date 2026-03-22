import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const PLANS = {
  autonomous_fleet: { name: 'Qivori AI Dispatch', first_truck_cents: 19900, extra_truck_cents: 9900, trial_days: 14 },
}

// Legacy plan aliases — all old plans redirect to the single plan
const PLAN_ALIASES = { basic: 'autonomous_fleet', solo: 'autonomous_fleet', pro: 'autonomous_fleet', autopilot: 'autonomous_fleet', autopilot_ai: 'autonomous_fleet', fleet: 'autonomous_fleet', growing: 'autonomous_fleet', enterprise: 'autonomous_fleet', truck_autopilot_ai: 'autonomous_fleet' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return Response.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { planId, email, userId, founderCount, truckCount } = await req.json()
    const resolvedId = PLAN_ALIASES[planId] || planId
    const plan = PLANS[resolvedId]
    if (!plan) return Response.json({ error: 'Invalid plan' }, { status: 400, headers: corsHeaders(req) })

    // $199 first truck + $99 each additional (founder pricing)
    const trucks = Math.max(1, parseInt(truckCount) || 1)
    const totalCents = plan.first_truck_cents + (Math.max(0, trucks - 1) * plan.extra_truck_cents)

    const origin = req.headers.get('origin') || 'https://qivori.com'

    const params = new URLSearchParams()
    params.append('mode', 'subscription')
    params.append('success_url', `${origin}/?checkout=success&plan=${resolvedId}`)
    params.append('cancel_url', `${origin}/?checkout=cancel`)
    params.append('line_items[0][price_data][currency]', 'usd')
    params.append('line_items[0][price_data][product_data][name]', `Qivori AI Dispatch (${trucks} truck${trucks > 1 ? 's' : ''})`)
    params.append('line_items[0][price_data][recurring][interval]', 'month')
    params.append('line_items[0][price_data][unit_amount]', totalCents.toString())
    params.append('line_items[0][quantity]', '1')

    params.append('subscription_data[trial_period_days]', plan.trial_days.toString())
    params.append('subscription_data[metadata][plan_id]', resolvedId)
    params.append('subscription_data[metadata][truck_count]', trucks.toString())
    params.append('subscription_data[metadata][first_truck_cents]', plan.first_truck_cents.toString())
    params.append('subscription_data[metadata][extra_truck_cents]', plan.extra_truck_cents.toString())
    if (userId) params.append('subscription_data[metadata][user_id]', userId)
    if (email) params.append('customer_email', email)
    params.append('allow_promotion_codes', 'true')

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const session = await res.json()
    if (session.error) {
      return Response.json({ error: session.error.message }, { status: 400, headers: corsHeaders(req) })
    }

    return Response.json({ url: session.url, sessionId: session.id }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
