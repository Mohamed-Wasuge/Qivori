import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET' && req.method !== 'POST') {
    return Response.json({ error: 'GET or POST only' }, { status: 405, headers: corsHeaders(req) })
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
    // Get profile from Supabase
    const profRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=subscription_plan,subscription_status,trial_ends_at,current_period_end,stripe_customer_id,stripe_subscription_id,truck_count,cancelled_at&limit=1`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    )
    const profiles = await profRes.json()
    const profile = profiles?.[0]

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404, headers: corsHeaders(req) })
    }

    const result = {
      plan: profile.subscription_plan || 'starter',
      status: profile.subscription_status || 'inactive',
      trialEndsAt: profile.trial_ends_at || null,
      currentPeriodEnd: profile.current_period_end || null,
      customerId: profile.stripe_customer_id || null,
      subscriptionId: profile.stripe_subscription_id || null,
      truckCount: profile.truck_count || 1,
      cancelledAt: profile.cancelled_at || null,
    }

    // If there's an active Stripe subscription, fetch live data
    if (profile.stripe_subscription_id && stripeKey) {
      try {
        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`,
          { headers: { 'Authorization': `Bearer ${stripeKey}` } }
        )
        const sub = await subRes.json()

        if (!sub.error) {
          result.status = sub.status
          result.plan = sub.metadata?.plan_id || result.plan
          result.currentPeriodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : result.currentPeriodEnd
          result.trialEndsAt = sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : result.trialEndsAt
          result.cancelAtPeriodEnd = sub.cancel_at_period_end || false

          // Get amount from line items
          const baseItem = sub.items?.data?.[0]
          if (baseItem) {
            result.amount = baseItem.price?.unit_amount || 0
            result.interval = baseItem.price?.recurring?.interval || 'month'
          }
        }
      } catch (e) {
        // Stripe fetch failed — use cached Supabase data
      }
    }

    // Compute trial days left
    if (result.status === 'trialing' && result.trialEndsAt) {
      const msLeft = new Date(result.trialEndsAt).getTime() - Date.now()
      result.trialDaysLeft = Math.max(0, Math.ceil(msLeft / 86400000))
    }

    return Response.json(result, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
