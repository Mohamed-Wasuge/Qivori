import { sendAdminEmail, sendAdminSMS } from './_lib/emails.js'

export const config = { runtime: 'edge' }

// Plan prices in cents (monthly, first truck)
const PLAN_PRICES = {
  autonomous_fleet: 19900,
  autopilot_ai: 19900,
  fleet: 19900,
  tms_pro: 9900,
  basic: 9900,
  solo: 9900,
  ai_dispatch: 19900,
  pro: 19900,
  growing: 19900,
  autopilot: 19900,
}

/**
 * Daily cron: apply pending referral rewards as Stripe billing credits.
 * Fetches referral_rewards where applied = false, looks up the user's
 * stripe_customer_id, and adds a negative balance (credit) to their
 * Stripe customer account equal to months_credited * plan price.
 */
export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!stripeKey || !supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing required env vars' }, { status: 500 })
  }

  const sbHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  const sb = (path, opts = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { ...sbHeaders, ...opts.headers },
    ...opts,
  })

  const results = { applied: 0, skipped: 0, errors: 0, details: [] }

  try {
    // Fetch all unapplied rewards
    const rewardsRes = await sb('referral_rewards?applied=eq.false&select=id,user_id,months_credited,reward_type,referral_id&order=created_at.asc&limit=100')
    if (!rewardsRes.ok) {
      const text = await rewardsRes.text().catch(() => '')
      console.error('[apply-referral-rewards] Failed to fetch rewards:', rewardsRes.status, text)
      return Response.json({ error: 'Failed to fetch rewards' }, { status: 500 })
    }

    const rewards = await rewardsRes.json()
    if (!Array.isArray(rewards) || rewards.length === 0) {
      console.log('[apply-referral-rewards] No pending rewards to apply')
      return Response.json({ message: 'No pending rewards', ...results })
    }

    console.log(`[apply-referral-rewards] Found ${rewards.length} pending reward(s)`)

    for (const reward of rewards) {
      try {
        // Look up user's profile for stripe_customer_id and plan
        const profRes = await sb(`profiles?id=eq.${reward.user_id}&select=id,email,stripe_customer_id,subscription_plan&limit=1`)
        const profiles = await profRes.json()
        const profile = profiles?.[0]

        if (!profile?.stripe_customer_id) {
          console.log(`[apply-referral-rewards] Skipping reward ${reward.id}: user ${reward.user_id} has no stripe_customer_id`)
          results.skipped++
          results.details.push({ reward_id: reward.id, status: 'skipped', reason: 'no_stripe_customer' })
          continue
        }

        // Determine credit amount based on plan
        const planId = profile.subscription_plan || 'autonomous_fleet'
        const pricePerMonth = PLAN_PRICES[planId] || PLAN_PRICES.autonomous_fleet
        const creditAmount = (reward.months_credited || 1) * pricePerMonth

        // Apply credit to Stripe customer balance (negative amount = credit)
        const creditRes = await fetch('https://api.stripe.com/v1/customers/' + profile.stripe_customer_id + '/balance_transactions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            amount: (-creditAmount).toString(),
            currency: 'usd',
            description: `Referral reward: ${reward.months_credited} free month(s) (reward #${reward.id})`,
          }).toString(),
        })

        if (!creditRes.ok) {
          const errText = await creditRes.text().catch(() => '')
          console.error(`[apply-referral-rewards] Stripe credit failed for reward ${reward.id}:`, creditRes.status, errText)
          results.errors++
          results.details.push({ reward_id: reward.id, status: 'error', reason: `stripe_error_${creditRes.status}` })
          continue
        }

        const creditData = await creditRes.json()
        console.log(`[apply-referral-rewards] Applied $${(creditAmount / 100).toFixed(2)} credit to ${profile.email} (balance_txn: ${creditData.id})`)

        // Mark reward as applied
        await sb(`referral_rewards?id=eq.${reward.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            applied: true,
            applied_at: new Date().toISOString(),
            stripe_balance_txn_id: creditData.id,
          }),
          headers: { 'Prefer': 'return=minimal' },
        })

        results.applied++
        results.details.push({
          reward_id: reward.id,
          status: 'applied',
          email: profile.email,
          amount_cents: creditAmount,
          months: reward.months_credited,
          balance_txn: creditData.id,
        })

      } catch (err) {
        console.error(`[apply-referral-rewards] Error processing reward ${reward.id}:`, err?.message)
        results.errors++
        results.details.push({ reward_id: reward.id, status: 'error', reason: err?.message })
      }
    }

    // Admin summary if any rewards were applied
    if (results.applied > 0) {
      const totalCredits = results.details
        .filter(d => d.status === 'applied')
        .reduce((sum, d) => sum + (d.amount_cents || 0), 0)

      await sendAdminEmail('Referral Rewards Applied', `
        <h2 style="color:#22c55e;margin:0 0 12px;">Referral Rewards Applied</h2>
        <p style="color:#c8c8d0;"><strong>${results.applied}</strong> reward(s) applied, totaling <strong style="color:#f0a500;">$${(totalCredits / 100).toFixed(2)}</strong> in billing credits.</p>
        <p style="color:#8a8a9a;">Skipped: ${results.skipped} | Errors: ${results.errors}</p>
        <ul style="color:#c8c8d0;font-size:13px;">
          ${results.details.filter(d => d.status === 'applied').map(d => `<li>${d.email}: $${(d.amount_cents / 100).toFixed(2)} (${d.months} mo)</li>`).join('')}
        </ul>
      `).catch(() => {})
      await sendAdminSMS(`QIVORI: ${results.applied} referral reward(s) applied — $${(totalCredits / 100).toFixed(2)} in credits`).catch(() => {})
    }

    console.log(`[apply-referral-rewards] Done: ${results.applied} applied, ${results.skipped} skipped, ${results.errors} errors`)
    return Response.json(results)

  } catch (err) {
    console.error('[apply-referral-rewards] Fatal error:', err?.message)
    return Response.json({ error: 'Internal error', detail: err?.message }, { status: 500 })
  }
}

/**
 * Apply a single user's pending referral rewards immediately.
 * Called from stripe-webhook after checkout.session.completed.
 * Exported so it can be imported by other modules.
 */
export async function applyPendingRewardsForUser(userId, supabaseUrl, serviceKey, stripeKey) {
  const sbHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  // Fetch unapplied rewards for this user
  const rewardsRes = await fetch(`${supabaseUrl}/rest/v1/referral_rewards?user_id=eq.${userId}&applied=eq.false&select=id,months_credited,reward_type`, {
    headers: sbHeaders,
  })
  const rewards = await rewardsRes.json()
  if (!Array.isArray(rewards) || rewards.length === 0) return { applied: 0 }

  // Get user's stripe_customer_id and plan
  const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id,subscription_plan,email&limit=1`, {
    headers: sbHeaders,
  })
  const profiles = await profRes.json()
  const profile = profiles?.[0]
  if (!profile?.stripe_customer_id) return { applied: 0, reason: 'no_stripe_customer' }

  const planId = profile.subscription_plan || 'autonomous_fleet'
  const pricePerMonth = PLAN_PRICES[planId] || PLAN_PRICES.autonomous_fleet
  let applied = 0

  for (const reward of rewards) {
    const creditAmount = (reward.months_credited || 1) * pricePerMonth

    const creditRes = await fetch('https://api.stripe.com/v1/customers/' + profile.stripe_customer_id + '/balance_transactions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: (-creditAmount).toString(),
        currency: 'usd',
        description: `Referral reward: ${reward.months_credited} free month(s) (reward #${reward.id})`,
      }).toString(),
    })

    if (!creditRes.ok) {
      console.error(`[apply-referral-rewards] Stripe credit failed for reward ${reward.id} (user ${userId})`)
      continue
    }

    const creditData = await creditRes.json()

    // Mark applied
    await fetch(`${supabaseUrl}/rest/v1/referral_rewards?id=eq.${reward.id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        applied: true,
        applied_at: new Date().toISOString(),
        stripe_balance_txn_id: creditData.id,
      }),
    })

    applied++
    console.log(`[apply-referral-rewards] Immediate: Applied $${(creditAmount / 100).toFixed(2)} credit to ${profile.email} (reward ${reward.id})`)
  }

  return { applied }
}
