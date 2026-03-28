/**
 * POST /api/edi/checkout
 * Creates a Stripe checkout session for EDI setup fee ($500 one-time).
 * On success, auto-submits the EDI access request.
 */
import { handleCors, corsHeaders, verifyAuth } from '../_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders(prefer) {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { 'Prefer': prefer } : {}) }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return Response.json({ error: 'Stripe not configured' }, { status: 500, headers: corsHeaders(req) })

  try {
    // Check if already requested or approved
    if (SUPABASE_URL && SERVICE_KEY) {
      const existRes = await fetch(`${SUPABASE_URL}/rest/v1/edi_access_requests?carrier_id=eq.${user.id}&select=status&limit=1`, { headers: sbHeaders() })
      if (existRes.ok) {
        const existing = (await existRes.json())?.[0]
        if (existing?.status === 'approved') return Response.json({ error: 'EDI access already active' }, { status: 409, headers: corsHeaders(req) })
        if (existing?.status === 'pending') return Response.json({ error: 'EDI request already pending' }, { status: 409, headers: corsHeaders(req) })
      }
    }

    const origin = req.headers.get('origin') || 'https://qivori.com'

    // Create Stripe checkout for one-time $500 payment
    const params = new URLSearchParams()
    params.append('mode', 'payment')
    params.append('success_url', `${origin}/?edi_setup=success`)
    params.append('cancel_url', `${origin}/?edi_setup=cancel`)
    params.append('line_items[0][price_data][currency]', 'usd')
    params.append('line_items[0][price_data][product_data][name]', 'Qivori EDI Setup — Enterprise Freight Integration')
    params.append('line_items[0][price_data][product_data][description]', 'One-time setup fee for EDI 204/990/214/210 integration. Includes API key generation, ISA/GS qualifier assignment, and partner configuration support.')
    params.append('line_items[0][price_data][unit_amount]', '50000') // $500.00
    params.append('line_items[0][quantity]', '1')
    params.append('customer_email', user.email)
    params.append('metadata[user_id]', user.id)
    params.append('metadata[type]', 'edi_setup')
    params.append('payment_intent_data[metadata][user_id]', user.id)
    params.append('payment_intent_data[metadata][type]', 'edi_setup')

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(stripeKey + ':')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!stripeRes.ok) {
      const err = await stripeRes.text()
      return Response.json({ error: 'Stripe error' }, { status: 502, headers: corsHeaders(req) })
    }

    const session = await stripeRes.json()

    // Pre-create the EDI access request as 'payment_pending'
    if (SUPABASE_URL && SERVICE_KEY) {
      const compRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?owner_id=eq.${user.id}&select=name,mc_number,dot_number,phone&limit=1`, { headers: sbHeaders() })
      const company = compRes.ok ? (await compRes.json())?.[0] : null

      await fetch(`${SUPABASE_URL}/rest/v1/edi_access_requests`, {
        method: 'POST', headers: sbHeaders('return=minimal'),
        body: JSON.stringify({
          carrier_id: user.id,
          carrier_name: company?.name || user.email,
          carrier_email: user.email,
          carrier_phone: company?.phone || null,
          mc_number: company?.mc_number || null,
          dot_number: company?.dot_number || null,
          status: 'pending',
          setup_fee: 500,
          stripe_session_id: session.id,
        }),
      })
    }

    return Response.json({ url: session.url, session_id: session.id }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
