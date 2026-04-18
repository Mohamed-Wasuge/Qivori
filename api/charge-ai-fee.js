import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const AI_FEE_RATE = 0.03 // 3% per load

/**
 * POST /api/charge-ai-fee
 * Called when a load is delivered and Q was involved.
 * 1. Looks up the carrier's Stripe customer ID
 * 2. Creates a Stripe charge (one-time) on their default payment method
 * 3. Records the fee in q_ai_fees table
 *
 * Body: { loadId, loadNumber, loadRate, origin, destination, broker, featureUsed }
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
    return Response.json({ error: 'Missing env vars' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { loadId, loadNumber, loadRate, origin, destination, broker, featureUsed } = await req.json()
    const userId = req._user.id
    const rate = parseFloat(loadRate) || 0

    if (rate <= 0) {
      return Response.json({ error: 'Invalid load rate' }, { status: 400, headers: corsHeaders(req) })
    }

    const feeAmount = Math.round(rate * AI_FEE_RATE * 100) / 100 // e.g. $2000 * 0.03 = $60.00
    const feeCents = Math.round(feeAmount * 100) // Stripe uses cents

    if (feeCents < 50) {
      // Stripe minimum charge is $0.50 — skip tiny fees
      return Response.json({ skipped: true, reason: 'Fee below minimum', feeAmount }, { headers: corsHeaders(req) })
    }

    const sbHeaders = {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    }

    // Only charge 3% for autonomous_fleet carriers — other plans pay flat monthly subscription
    const planRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=subscription_plan`,
      { headers: sbHeaders }
    )
    const planData = await planRes.json()
    const plan = planData?.[0]?.subscription_plan
    const PAID_PLANS = ['autonomous_fleet', 'ai_dispatch', 'pay_as_you_go']
    if (!PAID_PLANS.includes(plan)) {
      return Response.json({ skipped: true, reason: 'Plan does not include Q dispatch fee', plan }, { headers: corsHeaders(req) })
    }

    // Only charge 3% when Q booked the load — not for manually-added loads
    // Q-booked sources: 123loadboard, dat, truckstop, load_board, ai_auto_book, mobile_loadboard
    const Q_BOOKED_SOURCES = ['123loadboard', 'dat', 'truckstop', 'load_board', 'ai_auto_book', 'mobile_loadboard', 'edi_204']
    if (loadId) {
      const loadRes = await fetch(
        `${supabaseUrl}/rest/v1/loads?id=eq.${loadId}&select=load_source&limit=1`,
        { headers: sbHeaders }
      )
      if (loadRes.ok) {
        const loadData = await loadRes.json()
        const loadSource = loadData?.[0]?.load_source
        if (!loadSource || loadSource === 'manual' || !Q_BOOKED_SOURCES.includes(loadSource)) {
          return Response.json({ skipped: true, reason: 'Load was added manually — no Q dispatch fee', load_source: loadSource }, { headers: corsHeaders(req) })
        }
      }
    }

    // 1. Get carrier's Stripe customer ID from profiles
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id,email`,
      { headers: sbHeaders }
    )
    const profiles = await profileRes.json()
    const customerId = profiles?.[0]?.stripe_customer_id
    const email = profiles?.[0]?.email

    if (!customerId) {
      // No Stripe customer — record fee as pending (will be charged later)
      await fetch(`${supabaseUrl}/rest/v1/q_ai_fees`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          owner_id: userId,
          load_id: loadId || null,
          load_number: loadNumber || null,
          load_rate: rate,
          fee_percent: AI_FEE_RATE,
          fee_amount: feeAmount,
          stripe_status: 'pending',
          feature_used: featureUsed || 'dispatch',
          origin: origin || null,
          destination: destination || null,
          broker: broker || null,
        }),
      })
      return Response.json({ recorded: true, charged: false, feeAmount, reason: 'No payment method' }, { headers: corsHeaders(req) })
    }

    // 2. Create Stripe invoice item + invoice for immediate charge
    // Using invoice approach so it shows up in their Stripe billing history
    const invoiceItemParams = new URLSearchParams()
    invoiceItemParams.append('customer', customerId)
    invoiceItemParams.append('amount', feeCents.toString())
    invoiceItemParams.append('currency', 'usd')
    invoiceItemParams.append('description', `Q Intelligence fee — ${loadNumber || 'Load'} (${origin || '?'} → ${destination || '?'}) — 3% of $${rate.toLocaleString()}`)

    const itemRes = await fetch('https://api.stripe.com/v1/invoiceitems', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: invoiceItemParams.toString(),
    })
    const invoiceItem = await itemRes.json()

    if (invoiceItem.error) {
      // Record as failed
      await fetch(`${supabaseUrl}/rest/v1/q_ai_fees`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          owner_id: userId, load_id: loadId || null, load_number: loadNumber || null,
          load_rate: rate, fee_percent: AI_FEE_RATE, fee_amount: feeAmount,
          stripe_status: 'failed', feature_used: featureUsed || 'dispatch',
          origin, destination, broker,
        }),
      })
      console.error('[charge-ai-fee] Invoice item failed:', invoiceItem.error.message)
      return Response.json({ error: invoiceItem.error.message }, { status: 400, headers: corsHeaders(req) })
    }

    // 3. Create and finalize invoice for immediate payment
    const invoiceParams = new URLSearchParams()
    invoiceParams.append('customer', customerId)
    invoiceParams.append('auto_advance', 'true') // auto-finalize and attempt payment
    invoiceParams.append('collection_method', 'charge_automatically')
    invoiceParams.append('metadata[type]', 'q_ai_fee')
    invoiceParams.append('metadata[load_number]', loadNumber || '')
    invoiceParams.append('metadata[user_id]', userId)

    const invoiceRes = await fetch('https://api.stripe.com/v1/invoices', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: invoiceParams.toString(),
    })
    const invoice = await invoiceRes.json()

    let stripeChargeId = null
    let stripeStatus = 'pending'

    if (invoice.id && !invoice.error) {
      // Finalize and pay the invoice immediately
      const payRes = await fetch(`https://api.stripe.com/v1/invoices/${invoice.id}/pay`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const payResult = await payRes.json()

      if (payResult.status === 'paid') {
        stripeChargeId = payResult.charge || invoice.id
        stripeStatus = 'succeeded'
      } else {
        stripeChargeId = invoice.id
        stripeStatus = payResult.status || 'failed'
      }
    }

    // 4. Record in q_ai_fees
    await fetch(`${supabaseUrl}/rest/v1/q_ai_fees`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        owner_id: userId,
        load_id: loadId || null,
        load_number: loadNumber || null,
        load_rate: rate,
        fee_percent: AI_FEE_RATE,
        fee_amount: feeAmount,
        stripe_charge_id: stripeChargeId,
        stripe_status: stripeStatus,
        feature_used: featureUsed || 'dispatch',
        origin: origin || null,
        destination: destination || null,
        broker: broker || null,
      }),
    })

    console.log(`[charge-ai-fee] ${stripeStatus}: $${feeAmount} for ${loadNumber || loadId} (${email})`)

    return Response.json({
      charged: stripeStatus === 'succeeded',
      feeAmount,
      stripeStatus,
      stripeChargeId,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[charge-ai-fee] Error:', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
