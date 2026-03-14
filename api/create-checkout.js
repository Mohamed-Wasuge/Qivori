import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const PLANS = {
  solo:    { name: 'Solo',       price_cents: 9900,  trial_days: 14 },
  fleet:   { name: 'Fleet',     price_cents: 29900, trial_days: 14 },
  growing: { name: 'Enterprise', price_cents: 59900, trial_days: 14 },
}

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
    const { planId, email, userId } = await req.json()
    const plan = PLANS[planId]
    if (!plan) return Response.json({ error: 'Invalid plan' }, { status: 400, headers: corsHeaders(req) })

    const origin = req.headers.get('origin') || 'https://qivori.com'

    const params = new URLSearchParams()
    params.append('mode', 'subscription')
    params.append('success_url', `${origin}/?checkout=success&plan=${planId}`)
    params.append('cancel_url', `${origin}/?checkout=cancel`)
    params.append('line_items[0][price_data][currency]', 'usd')
    params.append('line_items[0][price_data][product_data][name]', `Qivori AI — ${plan.name}`)
    params.append('line_items[0][price_data][recurring][interval]', 'month')
    params.append('line_items[0][price_data][unit_amount]', plan.price_cents.toString())
    params.append('line_items[0][quantity]', '1')
    params.append('subscription_data[trial_period_days]', plan.trial_days.toString())
    params.append('subscription_data[metadata][plan_id]', planId)
    if (userId) params.append('subscription_data[metadata][user_id]', userId)
    if (email) {
      params.append('customer_email', email)
    }
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
