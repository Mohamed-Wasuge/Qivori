import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const PLANS = {
  pro:          { name: 'Pro',          price_cents: 4900,   trial_days: 14, extra_truck_cents: 4900, max_trucks: 5 },
  autopilot:    { name: 'Autopilot',    price_cents: 9900,   trial_days: 14, extra_truck_cents: 4900 },
  autopilot_ai: { name: 'Autopilot AI', price_cents: 79900,  trial_days: 14, founder: true, full_price_cents: 120000, extra_truck_cents: 15000 },
  fleet:        { name: 'Fleet',        price_cents: 79900,  trial_days: 14, extra_truck_cents: 15000 },
}

// Legacy plan aliases (redirect old plans to new)
const PLAN_ALIASES = { basic: 'autopilot', solo: 'autopilot', growing: 'autopilot', enterprise: 'autopilot_ai' }

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

    // Autopilot AI founder pricing: $799 for verified founders, $1,200 for everyone else
    let priceCents = plan.price_cents
    if (resolvedId === 'autopilot_ai' && plan.founder) {
      // Server-side verification: check if user is a verified founder in Supabase
      let isVerifiedFounder = false
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_KEY
      if (supabaseUrl && serviceKey && userId) {
        try {
          const profRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=is_founder`,
            { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
          )
          if (profRes.ok) {
            const profiles = await profRes.json()
            isVerifiedFounder = profiles?.[0]?.is_founder === true
          }
        } catch {
          // If check fails, default to full price for safety
        }
      }
      if (!isVerifiedFounder) {
        priceCents = plan.full_price_cents
      }
    }

    const origin = req.headers.get('origin') || 'https://qivori.com'

    const params = new URLSearchParams()
    params.append('mode', 'subscription')
    params.append('success_url', `${origin}/?checkout=success&plan=${planId}`)
    params.append('cancel_url', `${origin}/?checkout=cancel`)
    params.append('line_items[0][price_data][currency]', 'usd')
    params.append('line_items[0][price_data][product_data][name]', `Qivori AI — ${plan.name}`)
    params.append('line_items[0][price_data][recurring][interval]', 'month')
    params.append('line_items[0][price_data][unit_amount]', priceCents.toString())
    params.append('line_items[0][quantity]', '1')

    // Add extra truck line item if more than 1 truck
    const trucks = Math.max(1, parseInt(truckCount) || 1)
    if (trucks > 1) {
      const truckPriceId = resolvedId === 'autopilot_ai'
        ? process.env.STRIPE_PRICE_TRUCK_AUTOPILOT_AI
        : process.env.STRIPE_PRICE_TRUCK_AUTOPILOT
      if (truckPriceId) {
        params.append('line_items[1][price]', truckPriceId)
        params.append('line_items[1][quantity]', (trucks - 1).toString())
      }
    }

    params.append('subscription_data[trial_period_days]', plan.trial_days.toString())
    params.append('subscription_data[metadata][plan_id]', resolvedId)
    params.append('subscription_data[metadata][truck_count]', trucks.toString())
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
