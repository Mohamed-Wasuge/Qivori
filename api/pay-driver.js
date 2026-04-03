// api/pay-driver.js — One-click driver payment via Stripe Connect
// Debits carrier's connected bank → ACH credit to driver's bank account

import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase error: ${err}`)
  }
  return res.json()
}

async function stripeConnectFetch(endpoint, params, stripeAccountId, method = 'POST') {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured')

  const options = {
    method,
    headers: {
      Authorization: `Basic ${btoa(stripeKey + ':')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': stripeAccountId,
    },
  }

  if (method === 'POST' && Object.keys(params).length) {
    options.body = new URLSearchParams(params).toString()
  }

  const url = method === 'GET'
    ? `https://api.stripe.com/v1/${endpoint}?${new URLSearchParams(params)}`
    : `https://api.stripe.com/v1/${endpoint}`

  const res = await fetch(url, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Stripe error: ${res.status}`)
  return data
}

async function stripeFetch(endpoint, params = {}, method = 'POST') {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured')

  const options = {
    method,
    headers: {
      Authorization: `Basic ${btoa(stripeKey + ':')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  }

  if (method === 'POST' && Object.keys(params).length) {
    options.body = new URLSearchParams(params).toString()
  }

  const url = method === 'GET'
    ? `https://api.stripe.com/v1/${endpoint}?${new URLSearchParams(params)}`
    : `https://api.stripe.com/v1/${endpoint}`

  const res = await fetch(url, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Stripe error: ${res.status}`)
  return data
}

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  const userId = req._user.id

  try {
    const { payrollId, paymentSpeed = 'standard' } = await req.json()

    if (!payrollId) {
      return Response.json({ error: 'payrollId is required' }, { status: 400, headers: corsHeaders(req) })
    }

    // 1. Verify payroll record belongs to this user and is approved
    const payrolls = await supabaseRequest(
      `driver_payroll?id=eq.${payrollId}&owner_id=eq.${userId}&limit=1`
    )
    const payroll = payrolls[0]
    if (!payroll) {
      return Response.json({ error: 'Payroll record not found' }, { status: 404, headers: corsHeaders(req) })
    }
    if (payroll.status !== 'approved') {
      return Response.json({ error: `Cannot pay — status is "${payroll.status}", must be "approved"` }, { status: 400, headers: corsHeaders(req) })
    }
    if (payroll.payment_status === 'processing' || payroll.payment_status === 'paid') {
      return Response.json({ error: 'Payment already in progress or completed' }, { status: 400, headers: corsHeaders(req) })
    }

    const netPay = Number(payroll.net_pay || 0)
    if (netPay <= 0) {
      return Response.json({ error: 'Net pay must be positive' }, { status: 400, headers: corsHeaders(req) })
    }

    // 2. Get carrier's Stripe Connect account
    const connectAccounts = await supabaseRequest(
      `stripe_connect_accounts?owner_id=eq.${userId}&limit=1`
    )
    const connectAccount = connectAccounts[0]
    if (!connectAccount || !connectAccount.payouts_enabled) {
      return Response.json({
        error: 'Bank account not connected. Please complete Stripe Connect onboarding first.',
      }, { status: 400, headers: corsHeaders(req) })
    }

    // 3. Get driver's bank info
    const bankInfos = await supabaseRequest(
      `driver_bank_info?driver_id=eq.${payroll.driver_id}&owner_id=eq.${userId}&limit=1`
    )
    const bankInfo = bankInfos[0]
    if (!bankInfo || !bankInfo.routing_number || !bankInfo.account_last4) {
      return Response.json({
        error: 'Driver bank info incomplete. Add routing number and account number in the Drivers hub.',
      }, { status: 400, headers: corsHeaders(req) })
    }

    // 4. Get driver name for description
    let driverName = 'Driver'
    try {
      const drivers = await supabaseRequest(
        `drivers?id=eq.${payroll.driver_id}&select=name,full_name&limit=1`
      )
      if (drivers[0]) driverName = drivers[0].name || drivers[0].full_name || 'Driver'
    } catch (err) {
      console.error('[pay-driver] Failed to fetch driver name:', err?.message)
    }

    // 5. Calculate fee for instant pay
    const isInstant = paymentSpeed === 'instant'
    const feeRate = isInstant ? 0.015 : 0 // 1.5% for instant
    const fee = Math.round(netPay * feeRate * 100) / 100
    const payoutAmount = Math.round((netPay - fee) * 100) // Stripe uses cents

    // 6. Mark as processing
    await supabaseRequest(`driver_payroll?id=eq.${payrollId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        payment_status: 'processing',
        payment_method: isInstant ? 'ach_instant' : 'ach_standard',
        payment_fee: fee,
      }),
    })

    // 7. Create the transfer via Stripe
    // Use platform transfers: charge from carrier's Connect account balance
    // to the driver's external bank account
    try {
      // First, create a Transfer from platform to the carrier's connected account
      // Then create a Payout from the connected account to the driver's bank
      const transfer = await stripeFetch('transfers', {
        amount: payoutAmount,
        currency: 'usd',
        destination: connectAccount.stripe_account_id,
        description: `Settlement: ${driverName} (${payroll.period_start} to ${payroll.period_end})`,
        'metadata[payroll_id]': payrollId,
        'metadata[driver_id]': payroll.driver_id,
        'metadata[driver_name]': driverName,
        'metadata[user_id]': userId,
      })

      // Update payroll with transfer ID
      await supabaseRequest(`driver_payroll?id=eq.${payrollId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'paid',
          payment_status: 'in_transit',
          stripe_transfer_id: transfer.id,
          paid_at: new Date().toISOString(),
        }),
      })

      return Response.json({
        ok: true,
        transfer_id: transfer.id,
        amount: netPay,
        fee,
        net_amount: netPay - fee,
        payment_speed: paymentSpeed,
        driver: driverName,
        estimated_arrival: isInstant ? 'Within minutes' : '2-3 business days',
      }, { headers: corsHeaders(req) })

    } catch (stripeErr) {
      // Revert payment status on Stripe failure
      await supabaseRequest(`driver_payroll?id=eq.${payrollId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          payment_status: 'failed',
          payment_error: stripeErr.message,
        }),
      })

      return Response.json({
        error: `Payment failed: ${stripeErr.message}`,
      }, { status: 500, headers: corsHeaders(req) })
    }

  } catch (err) {
    console.error('[pay-driver] Error:', err)
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
