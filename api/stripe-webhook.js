import { sendEmail, sendAdminEmail, sendAdminSMS, logEmail, logRevenueEvent, TEMPLATES } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const PLAN_NAMES = { autopilot: 'Autopilot', autopilot_ai: 'Autopilot AI', basic: 'Autopilot', pro: 'Autopilot', solo: 'Autopilot', fleet: 'Autopilot', growing: 'Autopilot', enterprise: 'Autopilot AI' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
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

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      return Response.json({ error: 'Timestamp too old' }, { status: 400 })
    }

    const signedPayload = `${timestamp}.${body}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    const expectedSig = Array.from(new Uint8Array(signatureBytes)).map(b => b.toString(16).padStart(2, '0')).join('')

    if (expectedSig !== v1Sig) {
      return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)

    switch (event.type) {
      // ── CHECKOUT COMPLETED — new subscription ──
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
          const planId = subscription.metadata?.plan_id || 'basic'
          const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
          const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
          const planName = PLAN_NAMES[planId] || planId

          await updateProfile(supabaseUrl, supabaseServiceKey, customerEmail, {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_plan: planId,
            subscription_status: subscription.status,
            trial_ends_at: trialEnd,
            current_period_end: currentPeriodEnd,
            status: 'active',
          })

          // Log revenue event
          const amount = subscription.items?.data?.[0]?.price?.unit_amount || 0
          await logRevenueEvent(subscription.metadata?.user_id, 'trial_start', amount, planId, { email: customerEmail })

          // Send upgrade congrats email
          const firstName = customerEmail.split('@')[0]
          const t = TEMPLATES.upgrade_congrats(firstName, planName)
          await sendEmail(customerEmail, t.subject, t.html).catch(() => {})

          // Admin notification: new signup
          await sendAdminEmail(`New Signup: ${customerEmail}`, `
            <h2 style="color:#22c55e;margin:0 0 12px;">New Subscriber!</h2>
            <p style="color:#c8c8d0;font-size:14px;"><strong>${customerEmail}</strong> signed up for <strong style="color:#f0a500;">${planName}</strong></p>
            <p style="color:#8a8a9a;font-size:13px;">Trial ends: ${trialEnd || 'No trial'}</p>
          `).catch(() => {})
          await sendAdminSMS(`QIVORI: New signup! ${customerEmail} → ${planName}`).catch(() => {})

          // Check if this was a referral signup → reward referrer
          await processReferralReward(supabaseUrl, supabaseServiceKey, customerEmail, stripeKey).catch(() => {})
        }
        break
      }

      // ── SUBSCRIPTION UPDATED — plan change, trial ending ──
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const customerId = subscription.customer
        const planId = subscription.metadata?.plan_id || 'basic'
        const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
        const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
        const prevAttrs = event.data.previous_attributes || {}

        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          subscription_plan: planId,
          subscription_status: subscription.status,
          trial_ends_at: trialEnd,
          current_period_end: currentPeriodEnd,
          status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'inactive',
        })

        // Detect plan upgrade
        if (prevAttrs.items && subscription.status === 'active') {
          const planName = PLAN_NAMES[planId] || planId
          const profile = await getProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId)
          if (profile?.email) {
            const firstName = (profile.full_name || profile.email.split('@')[0]).split(' ')[0]
            const t = TEMPLATES.upgrade_congrats(firstName, planName)
            await sendEmail(profile.email, t.subject, t.html).catch(() => {})
            await sendAdminEmail(`Plan Upgrade: ${profile.email}`, `<p style="color:#c8c8d0;"><strong>${profile.email}</strong> upgraded to <strong style="color:#f0a500;">${planName}</strong></p>`).catch(() => {})
          }
        }

        // Trial ending soon (Stripe sends this ~3 days before)
        if (subscription.status === 'trialing' && subscription.trial_end) {
          const daysLeft = Math.ceil((subscription.trial_end * 1000 - Date.now()) / 86400000)
          if (daysLeft <= 3 && daysLeft > 0) {
            const profile = await getProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId)
            if (profile?.email) {
              const firstName = (profile.full_name || profile.email.split('@')[0]).split(' ')[0]
              const t = TEMPLATES.day12_trial_ending(firstName, daysLeft)
              await sendEmail(profile.email, t.subject, t.html).catch(() => {})
            }
          }
        }
        break
      }

      // ── SUBSCRIPTION CANCELLED ──
      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer
        const cancelReason = subscription.cancellation_details?.comment || subscription.cancellation_details?.reason || 'Not provided'

        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          subscription_status: 'canceled',
          subscription_plan: null,
          status: 'inactive',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: cancelReason,
        })

        // Log churn event
        const amount = subscription.items?.data?.[0]?.price?.unit_amount || 0
        await logRevenueEvent(subscription.metadata?.user_id, 'churn', amount, subscription.metadata?.plan_id, { reason: cancelReason })

        // Admin notification
        const profile = await getProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId)
        const email = profile?.email || 'Unknown'
        await sendAdminEmail(`Cancellation: ${email}`, `
          <h2 style="color:#ef4444;margin:0 0 12px;">Customer Cancelled</h2>
          <p style="color:#c8c8d0;"><strong>${email}</strong> cancelled their subscription.</p>
          <p style="color:#8a8a9a;">Reason: ${cancelReason}</p>
        `).catch(() => {})
        await sendAdminSMS(`QIVORI CANCEL: ${email} — Reason: ${cancelReason}`).catch(() => {})

        // Win-back email (day 3) will be handled by lifecycle-cron
        break
      }

      // ── PAYMENT SUCCEEDED ──
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        const customerId = invoice.customer
        const amount = invoice.amount_paid || 0

        if (amount > 0) {
          const profile = await getProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId)
          if (profile?.email) {
            const firstName = (profile.full_name || profile.email.split('@')[0]).split(' ')[0]
            const planName = PLAN_NAMES[profile.subscription_plan] || profile.subscription_plan || 'Qivori'
            const t = TEMPLATES.payment_succeeded(firstName, amount, planName)
            await sendEmail(profile.email, t.subject, t.html).catch(() => {})
          }

          // Log revenue
          await logRevenueEvent(profile?.id, 'payment', amount, profile?.subscription_plan, { invoice_id: invoice.id })

          // Admin notification
          await sendAdminEmail(`Payment: $${(amount / 100).toFixed(2)}`, `
            <p style="color:#22c55e;font-size:16px;font-weight:700;">Payment received: $${(amount / 100).toFixed(2)}</p>
            <p style="color:#c8c8d0;">${profile?.email || 'Unknown customer'}</p>
          `).catch(() => {})
        }
        break
      }

      // ── PAYMENT FAILED ──
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer
        const attemptCount = invoice.attempt_count || 1

        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          subscription_status: 'past_due',
        })

        const profile = await getProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId)
        if (profile?.email) {
          const firstName = (profile.full_name || profile.email.split('@')[0]).split(' ')[0]

          // Send payment failed email
          const t = TEMPLATES.payment_failed(firstName)
          await sendEmail(profile.email, t.subject, t.html).catch(() => {})

          // Dunning: attempt 1 (day 1), attempt 2 (day 3), attempt 3 (day 7), then Stripe auto-cancels
          // Stripe handles retry scheduling — we just send the notification
        }

        // Admin notification
        await sendAdminEmail(`Payment FAILED: ${profile?.email || customerId}`, `
          <h2 style="color:#ef4444;margin:0 0 12px;">Payment Failed</h2>
          <p style="color:#c8c8d0;"><strong>${profile?.email || 'Unknown'}</strong> — Attempt #${attemptCount}</p>
          <p style="color:#8a8a9a;">Amount: $${((invoice.amount_due || 0) / 100).toFixed(2)}</p>
        `).catch(() => {})
        await sendAdminSMS(`QIVORI PAYMENT FAILED: ${profile?.email || 'Unknown'} — Attempt #${attemptCount}`).catch(() => {})
        break
      }
    }

    return Response.json({ received: true })
  } catch (err) {
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// ── Helpers ──

async function updateProfile(supabaseUrl, serviceKey, email, updates) {
  await fetch(`${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(updates),
  }).catch(() => {})
}

async function updateProfileByCustomer(supabaseUrl, serviceKey, customerId, updates) {
  await fetch(`${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(updates),
  }).catch(() => {})
}

async function getProfileByCustomer(supabaseUrl, serviceKey, customerId) {
  const res = await fetch(`${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id,email,full_name,subscription_plan&limit=1`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data?.[0] || null
}

async function processReferralReward(supabaseUrl, serviceKey, referredEmail, stripeKey) {
  // Check if this user was referred
  const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(referredEmail)}&select=referred_by&limit=1`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
  })
  const profiles = await profRes.json()
  const referredBy = profiles?.[0]?.referred_by
  if (!referredBy) return

  // Find the referral record and update status
  await fetch(`${supabaseUrl}/rest/v1/referrals?referred_email=eq.${encodeURIComponent(referredEmail)}&status=eq.signed_up`, {
    method: 'PATCH',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() }),
  })

  // Find referrer and send reward email
  const refRes = await fetch(`${supabaseUrl}/rest/v1/profiles?referral_code=eq.${encodeURIComponent(referredBy)}&select=id,email,full_name&limit=1`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
  })
  const referrers = await refRes.json()
  if (referrers?.[0]?.email) {
    const firstName = (referrers[0].full_name || referrers[0].email.split('@')[0]).split(' ')[0]
    const t = TEMPLATES.referral_reward(firstName)
    await sendEmail(referrers[0].email, t.subject, t.html).catch(() => {})

    // Mark referral as rewarded
    await fetch(`${supabaseUrl}/rest/v1/referrals?referred_email=eq.${encodeURIComponent(referredEmail)}&referrer_id=eq.${referrers[0].id}`, {
      method: 'PATCH',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: 'rewarded', reward_applied: true }),
    })

    // Admin notification
    await sendAdminEmail(`Referral Reward: ${referrers[0].email}`, `
      <p style="color:#c8c8d0;"><strong>${referrers[0].email}</strong> earned a free month! Referred: ${referredEmail}</p>
    `).catch(() => {})
  }
}
