// api/stripe-connect.js — Stripe Connect for carrier bank onboarding
// Handles: create-account, check-status, create-login-link, refresh-onboarding

import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function supabaseRequest(path, options = {}) {
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

  const url = method === 'GET' && Object.keys(params).length
    ? `https://api.stripe.com/v1/${endpoint}?${new URLSearchParams(params)}`
    : `https://api.stripe.com/v1/${endpoint}`

  const res = await fetch(url, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Stripe error: ${res.status}`)
  return data
}

// Stripe fetch with Connected Account header
async function stripeConnectFetch(endpoint, params = {}, stripeAccountId, method = 'POST') {
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

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  const userId = req._user.id

  if (req.method === 'GET') {
    // Check connection status
    try {
      const rows = await supabaseRequest(
        `stripe_connect_accounts?owner_id=eq.${userId}&limit=1`
      )
      const account = rows[0]
      if (!account) {
        return Response.json({ connected: false }, { headers: corsHeaders(req) })
      }

      // Refresh status from Stripe
      try {
        const stripeAccount = await stripeFetch(`accounts/${account.stripe_account_id}`, {}, 'GET')
        const updates = {
          charges_enabled: stripeAccount.charges_enabled,
          payouts_enabled: stripeAccount.payouts_enabled,
          details_submitted: stripeAccount.details_submitted,
          onboarding_complete: stripeAccount.details_submitted && stripeAccount.payouts_enabled,
          updated_at: new Date().toISOString(),
        }

        if (updates.charges_enabled !== account.charges_enabled ||
            updates.payouts_enabled !== account.payouts_enabled ||
            updates.details_submitted !== account.details_submitted) {
          await supabaseRequest(
            `stripe_connect_accounts?owner_id=eq.${userId}`,
            { method: 'PATCH', body: JSON.stringify(updates) }
          )
        }

        return Response.json({
          connected: true,
          stripe_account_id: account.stripe_account_id,
          charges_enabled: stripeAccount.charges_enabled,
          payouts_enabled: stripeAccount.payouts_enabled,
          details_submitted: stripeAccount.details_submitted,
          onboarding_complete: stripeAccount.details_submitted && stripeAccount.payouts_enabled,
          business_name: account.business_name,
        }, { headers: corsHeaders(req) })
      } catch {
        // Return cached status if Stripe call fails
        return Response.json({
          connected: true,
          ...account,
          onboarding_complete: account.onboarding_complete,
        }, { headers: corsHeaders(req) })
      }
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
    }
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
  }

  try {
    const { action } = await req.json()

    // ── Create Express Connected Account ──
    if (action === 'create-account') {
      // Check if already exists
      const existing = await supabaseRequest(
        `stripe_connect_accounts?owner_id=eq.${userId}&limit=1`
      )

      let stripeAccountId
      if (existing.length) {
        stripeAccountId = existing[0].stripe_account_id
      } else {
        // Get user email for the account
        const email = req._user.email || ''

        // Create Express account
        const account = await stripeFetch('accounts', {
          type: 'express',
          country: 'US',
          email,
          'capabilities[transfers][requested]': 'true',
          'business_type': 'company',
          'business_profile[mcc]': '4214', // Trucking / Motor Freight
          'business_profile[product_description]': 'Freight carrier — driver settlement payments',
        })

        stripeAccountId = account.id

        // Save to Supabase
        await supabaseRequest('stripe_connect_accounts', {
          method: 'POST',
          body: JSON.stringify({
            owner_id: userId,
            stripe_account_id: stripeAccountId,
            account_type: 'express',
            business_name: account.business_profile?.name || null,
          }),
        })
      }

      // Create onboarding link
      const origin = req.headers.get('origin') || 'https://qivori.com'
      const accountLink = await stripeFetch('account_links', {
        account: stripeAccountId,
        refresh_url: `${origin}/carrier?tab=drivers&connect=refresh`,
        return_url: `${origin}/carrier?tab=drivers&connect=complete`,
        type: 'account_onboarding',
      })

      return Response.json({
        ok: true,
        url: accountLink.url,
        stripe_account_id: stripeAccountId,
      }, { headers: corsHeaders(req) })
    }

    // ── Create Express Dashboard login link ──
    if (action === 'create-login-link') {
      const rows = await supabaseRequest(
        `stripe_connect_accounts?owner_id=eq.${userId}&limit=1`
      )
      if (!rows.length) {
        return Response.json({ error: 'No Connect account found' }, { status: 404, headers: corsHeaders(req) })
      }

      const loginLink = await stripeFetch('accounts/' + rows[0].stripe_account_id + '/login_links', {})

      return Response.json({ ok: true, url: loginLink.url }, { headers: corsHeaders(req) })
    }

    // ── Refresh onboarding (if link expired) ──
    if (action === 'refresh-onboarding') {
      const rows = await supabaseRequest(
        `stripe_connect_accounts?owner_id=eq.${userId}&limit=1`
      )
      if (!rows.length) {
        return Response.json({ error: 'No Connect account found' }, { status: 404, headers: corsHeaders(req) })
      }

      const origin = req.headers.get('origin') || 'https://qivori.com'
      const accountLink = await stripeFetch('account_links', {
        account: rows[0].stripe_account_id,
        refresh_url: `${origin}/carrier?tab=drivers&connect=refresh`,
        return_url: `${origin}/carrier?tab=drivers&connect=complete`,
        type: 'account_onboarding',
      })

      return Response.json({ ok: true, url: accountLink.url }, { headers: corsHeaders(req) })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders(req) })
  } catch (err) {
    console.error('[stripe-connect] Error:', err)
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
