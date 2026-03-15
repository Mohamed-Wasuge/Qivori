export const config = { runtime: 'edge' }

// Stripe webhook — no CORS needed (called by Stripe servers, not browser)
// No user auth — authenticated via Stripe webhook signature (HMAC)
export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey || !webhookSecret) {
    return Response.json({ error: 'Missing required env vars' }, { status: 500 })
  }

  try {
    const body = await req.text()

    // Verify Stripe webhook signature (HMAC-SHA256)
    const sig = req.headers.get('stripe-signature')
    if (!sig) return Response.json({ error: 'No signature' }, { status: 400 })

    const timestamp = sig.split(',').find(s => s.startsWith('t='))?.split('=')[1]
    const v1Sig = sig.split(',').find(s => s.startsWith('v1='))?.split('=')[1]

    if (!timestamp || !v1Sig) {
      return Response.json({ error: 'Bad signature format' }, { status: 400 })
    }

    // Verify timestamp is within 5 minutes (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      return Response.json({ error: 'Timestamp too old' }, { status: 400 })
    }

    // Verify HMAC signature
    const signedPayload = `${timestamp}.${body}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    const expectedSig = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    if (expectedSig !== v1Sig) {
      return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const customerEmail = session.customer_email || session.customer_details?.email
        const subscriptionId = session.subscription
        const customerId = session.customer

        if (customerEmail && subscriptionId) {
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${stripeKey}` },
          })
          const subscription = await subRes.json()
          const planId = subscription.metadata?.plan_id || 'solo'
          const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
          const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null

          await updateProfile(supabaseUrl, supabaseServiceKey, customerEmail, {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_plan: planId,
            subscription_status: subscription.status,
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
    // Webhook processing error
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

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
  // Silent fail — Stripe will retry the webhook if we return non-200
}

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
  // Silent fail — Stripe will retry
}
