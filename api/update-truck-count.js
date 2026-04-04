import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!stripeKey || !supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { truckCount } = await req.json()
    const totalTrucks = Math.max(1, parseInt(truckCount) || 1)
    const extraTrucks = totalTrucks - 1

    // Get user profile with Stripe subscription
    const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=stripe_subscription_id,subscription_plan,truck_count&limit=1`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    })
    const profiles = await profRes.json()
    const profile = profiles?.[0]

    if (!profile?.stripe_subscription_id) {
      // No subscription — just update the profile truck count
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ truck_count: totalTrucks }),
      })
      return Response.json({ success: true, truckCount: totalTrucks, billing: 'no_subscription' }, { headers: corsHeaders(req) })
    }

    // Fetch current subscription from Stripe
    const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`, {
      headers: { 'Authorization': `Bearer ${stripeKey}` },
    })
    const subscription = await subRes.json()
    if (subscription.error) {
      return Response.json({ error: subscription.error.message }, { status: 400, headers: corsHeaders(req) })
    }

    // Determine which truck price ID to use
    const truckPriceId = profile.subscription_plan === 'autopilot_ai'
      ? process.env.STRIPE_PRICE_TRUCK_AUTOPILOT_AI
      : process.env.STRIPE_PRICE_TRUCK_AUTOPILOT

    if (!truckPriceId) {
      return Response.json({ error: 'Truck price not configured' }, { status: 500, headers: corsHeaders(req) })
    }

    // Find existing truck line item
    const truckItem = subscription.items?.data?.find(item =>
      item.price?.id === process.env.STRIPE_PRICE_TRUCK_AUTOPILOT ||
      item.price?.id === process.env.STRIPE_PRICE_TRUCK_AUTOPILOT_AI
    )

    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    if (truckItem && extraTrucks > 0) {
      // Update existing truck item quantity
      const params = new URLSearchParams()
      params.append('quantity', extraTrucks.toString())
      params.append('proration_behavior', 'create_prorations')
      await fetch(`https://api.stripe.com/v1/subscription_items/${truckItem.id}`, {
        method: 'POST', headers: stripeHeaders, body: params.toString(),
      })
    } else if (truckItem && extraTrucks === 0) {
      // Remove truck item (back to 1 truck)
      const params = new URLSearchParams()
      params.append('proration_behavior', 'create_prorations')
      await fetch(`https://api.stripe.com/v1/subscription_items/${truckItem.id}`, {
        method: 'DELETE', headers: stripeHeaders, body: params.toString(),
      })
    } else if (!truckItem && extraTrucks > 0) {
      // Add new truck item
      const params = new URLSearchParams()
      params.append('subscription', profile.stripe_subscription_id)
      params.append('price', truckPriceId)
      params.append('quantity', extraTrucks.toString())
      params.append('proration_behavior', 'create_prorations')
      await fetch('https://api.stripe.com/v1/subscription_items', {
        method: 'POST', headers: stripeHeaders, body: params.toString(),
      })
    }

    // Update subscription metadata
    const metaParams = new URLSearchParams()
    metaParams.append('metadata[truck_count]', totalTrucks.toString())
    await fetch(`https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`, {
      method: 'POST', headers: stripeHeaders, body: metaParams.toString(),
    })

    // Update Supabase profile
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ truck_count: totalTrucks }),
    })

    // $199 first truck + $79 each additional
    const monthlyTotal = 199 + Math.max(0, totalTrucks - 1) * 79
    return Response.json({
      success: true,
      truckCount: totalTrucks,
      extraTrucks,
      monthlyTotal,
      monthlyExtra: Math.max(0, totalTrucks - 1) * 99,
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
