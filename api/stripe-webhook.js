import { sendEmail, sendAdminEmail, sendAdminSMS, logEmail, logRevenueEvent, TEMPLATES } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const PLAN_NAMES = { autonomous_fleet: 'Autonomous Fleet AI', autopilot_ai: 'Autonomous Fleet AI', autopilot: 'Autonomous Fleet AI', pro: 'Autonomous Fleet AI', fleet: 'Autonomous Fleet AI', basic: 'Autonomous Fleet AI', solo: 'Autonomous Fleet AI', growing: 'Autonomous Fleet AI', enterprise: 'Autonomous Fleet AI' }

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
      console.error('[stripe-webhook] Bad signature format:', sig)
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
      console.error('[stripe-webhook] Signature mismatch')
      return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)
    console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`)

    // Idempotency: skip already-processed events
    const sbHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' }
    const idempCheck = await fetch(`${supabaseUrl}/rest/v1/webhook_events?event_id=eq.${event.id}&select=id`, { headers: sbHeaders })
    const existing = await idempCheck.json()
    if (Array.isArray(existing) && existing.length > 0) {
      console.log(`[stripe-webhook] Duplicate event ${event.id}, skipping`)
      return Response.json({ received: true, skipped: true })
    }
    // Record event as processed (best-effort, table may not exist yet)
    fetch(`${supabaseUrl}/rest/v1/webhook_events`, {
      method: 'POST', headers: sbHeaders,
      body: JSON.stringify({ event_id: event.id, event_type: event.type, processed_at: new Date().toISOString() })
    }).catch(() => {})

    switch (event.type) {
      // ── CHECKOUT COMPLETED — new subscription ──
      case 'checkout.session.completed': {
        const session = event.data.object
        const customerEmail = session.customer_email || session.customer_details?.email
        const subscriptionId = session.subscription
        const customerId = session.customer
        console.log(`[stripe-webhook] checkout.session.completed — email: ${customerEmail}, sub: ${subscriptionId}, customer: ${customerId}`)

        if (customerEmail && subscriptionId) {
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${stripeKey}` },
          })
          const subscription = await subRes.json()
          const planId = subscription.metadata?.plan_id || 'basic'
          const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
          const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
          const planName = PLAN_NAMES[planId] || planId

          const truckCount = parseInt(subscription.metadata?.truck_count) || 1
          await updateProfile(supabaseUrl, supabaseServiceKey, customerEmail, {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: planId,
            subscription_plan: planId,
            subscription_status: subscription.status,
            trial_ends_at: trialEnd,
            current_period_end: currentPeriodEnd,
            status: 'active',
            truck_count: truckCount,
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
        console.log(`[stripe-webhook] customer.subscription.updated — customer: ${customerId}, status: ${subscription.status}`)
        const planId = subscription.metadata?.plan_id || 'basic'
        const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null
        const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
        const prevAttrs = event.data.previous_attributes || {}

        // Sync truck count from subscription metadata
        const truckCount = parseInt(subscription.metadata?.truck_count) || 1

        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          plan: planId,
          subscription_plan: planId,
          subscription_status: subscription.status,
          trial_ends_at: trialEnd,
          current_period_end: currentPeriodEnd,
          status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'inactive',
          truck_count: truckCount,
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
        console.log(`[stripe-webhook] customer.subscription.deleted — customer: ${customerId}`)
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
        console.log(`[stripe-webhook] invoice.payment_succeeded — customer: ${customerId}, amount: $${(amount / 100).toFixed(2)}`)

        // Extend subscription period — fetch the subscription to get updated period end
        if (invoice.subscription) {
          try {
            const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${invoice.subscription}`, {
              headers: { 'Authorization': `Bearer ${stripeKey}` },
            })
            const sub = await subRes.json()
            if (sub && !sub.error && sub.current_period_end) {
              await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
                current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
                subscription_status: sub.status,
                status: 'active',
              })
              console.log(`[stripe-webhook] Extended subscription period for customer ${customerId} to ${new Date(sub.current_period_end * 1000).toISOString()}`)
            }
          } catch (err) {
            console.error(`[stripe-webhook] Failed to extend subscription period for ${customerId}:`, err?.message)
          }
        }

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
        console.log(`[stripe-webhook] invoice.payment_failed — customer: ${customerId}, attempt: #${attemptCount}`)

        // Set grace period: 7 days from now before access is revoked
        const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          subscription_status: 'past_due',
          grace_period_end: gracePeriodEnd,
        })
        console.log(`[stripe-webhook] Set grace period for customer ${customerId} until ${gracePeriodEnd}`)

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

      // ── TRIAL WILL END (Stripe fires 3 days before trial expires) ──
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object
        const customerId = subscription.customer
        console.log(`[stripe-webhook] customer.subscription.trial_will_end — customer: ${customerId}`)
        const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
        const daysLeft = subscription.trial_end
          ? Math.max(0, Math.ceil((subscription.trial_end * 1000 - Date.now()) / 86400000))
          : 3

        // Update trial_ends_at in profile to ensure it's synced
        await updateProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId, {
          trial_ends_at: trialEnd,
        })

        const profile = await getProfileByCustomer(supabaseUrl, supabaseServiceKey, customerId)
        if (profile?.email) {
          const firstName = (profile.full_name || profile.email.split('@')[0]).split(' ')[0]
          const t = TEMPLATES.day12_trial_ending(firstName, daysLeft)
          await sendEmail(profile.email, t.subject, t.html).catch(() => {})
        }

        // Admin notification
        await sendAdminEmail(`Trial Ending: ${profile?.email || customerId}`, `
          <h2 style="color:#f0a500;margin:0 0 12px;">Trial Ending Soon</h2>
          <p style="color:#c8c8d0;"><strong>${profile?.email || 'Unknown'}</strong> — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining</p>
          <p style="color:#8a8a9a;">Trial ends: ${trialEnd || 'Unknown'}</p>
        `).catch(() => {})
        break
      }
    }

    console.log(`[stripe-webhook] Successfully processed event: ${event.type} (${event.id})`)
    return Response.json({ received: true })
  } catch (err) {
    console.error(`[stripe-webhook] Error processing webhook:`, err?.message || err)
    console.error(`[stripe-webhook] Stack:`, err?.stack || 'no stack')
    return Response.json({ error: 'Webhook processing failed', detail: err?.message }, { status: 500 })
  }
}

// ── Helpers ──

async function updateProfile(supabaseUrl, serviceKey, email, updates) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[stripe-webhook] updateProfile failed for ${email}: ${res.status} ${text}`)
    }
  } catch (err) {
    console.error(`[stripe-webhook] updateProfile error for ${email}:`, err?.message)
  }
}

async function updateProfileByCustomer(supabaseUrl, serviceKey, customerId, updates) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}`, {
      method: 'PATCH',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[stripe-webhook] updateProfileByCustomer failed for ${customerId}: ${res.status} ${text}`)
    }
  } catch (err) {
    console.error(`[stripe-webhook] updateProfileByCustomer error for ${customerId}:`, err?.message)
  }
}

async function getProfileByCustomer(supabaseUrl, serviceKey, customerId) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id,email,full_name,subscription_plan&limit=1`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    })
    if (!res.ok) {
      console.error(`[stripe-webhook] getProfileByCustomer failed for ${customerId}: ${res.status}`)
      return null
    }
    const data = await res.json()
    return data?.[0] || null
  } catch (err) {
    console.error(`[stripe-webhook] getProfileByCustomer error for ${customerId}:`, err?.message)
    return null
  }
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
