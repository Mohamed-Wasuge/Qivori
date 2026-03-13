export const config = { runtime: 'edge' }

const PLANS = {
  solo:    { name: 'Solo',       price_cents: 9900,  trial_days: 14 },
  fleet:   { name: 'Fleet',     price_cents: 29900, trial_days: 14 },
  growing: { name: 'Enterprise', price_cents: 59900, trial_days: 14 },
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return Response.json({ error: 'STRIPE_SECRET_KEY not configured. Add it in Vercel → Settings → Environment Variables.' }, { status: 500 })
  }

  try {
    const { planId, email, userId } = await req.json()
    const plan = PLANS[planId]
    if (!plan) return Response.json({ error: 'Invalid plan' }, { status: 400 })

    const origin = req.headers.get('origin') || 'https://qivori.ai'

    // Create Stripe Checkout Session via API (no SDK needed for edge)
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
      return Response.json({ error: session.error.message }, { status: 400 })
    }

    return Response.json({ url: session.url, sessionId: session.id })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
