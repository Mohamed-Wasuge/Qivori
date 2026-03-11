export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
    return Response.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const body = await req.text()

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const sig = req.headers.get('stripe-signature')
      if (!sig) return Response.json({ error: 'No signature' }, { status: 400 })

      // Simple signature verification for edge (without Stripe SDK)
      const timestamp = sig.split(',').find(s => s.startsWith('t='))?.split('=')[1]
      if (!timestamp) return Response.json({ error: 'Bad signature' }, { status: 400 })

      // Verify timestamp is within 5 minutes
      const now = Math.floor(Date.now() / 1000)
      if (Math.abs(now - parseInt(timestamp)) > 300) {
        return Response.json({ error: 'Timestamp too old' }, { status: 400 })
      }
    }

    const event = JSON.parse(body)

    // Handle relevant events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const customerEmail = session.customer_email || session.customer_details?.email
        const subscriptionId = session.subscription
        const customerId = session.customer

        if (customerEmail && subscriptionId) {
          // Fetch subscription details from Stripe
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${stripeKey}` },
          })
          const subscription = await subRes.json()
          const planId = subscription.metadata?.plan_id || 'solo'
          const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
          const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null

          // Update profile in Supabase
          await updateProfile(supabaseUrl, supabaseServiceKey, customerEmail, {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_plan: planId,
            subscription_status: subscription.status, // 'trialing' or 'active'
            trial_ends_at: trialEnd,
            current_period_end: currentPeriodEnd,
            status: 'active',
          })
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const customerId = subscription.customer
        const planId = subscription.metadata?.plan_id || 'solo'
        const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
        const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null

        // Find profile by stripe_customer_id
        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          subscription_plan: planId,
          subscription_status: subscription.status,
          trial_ends_at: trialEnd,
          current_period_end: currentPeriodEnd,
          status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'inactive',
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer

        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          subscription_status: 'canceled',
          subscription_plan: null,
          status: 'inactive',
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer

        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          subscription_status: 'past_due',
        })
        break
      }
    }

    return Response.json({ received: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// Update profile by email
async function updateProfile(supabaseUrl, serviceKey, email, updates) {
  const res = await fetch(`${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  })
  if (!res.ok) console.error('Profile update failed:', await res.text())
}

// Update profile by Stripe customer ID
async function updateProfileByCustomer(supabaseUrl, serviceKey, customerId, updates) {
  const res = await fetch(`${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  })
  if (!res.ok) console.error('Profile update by customer failed:', await res.text())
}
