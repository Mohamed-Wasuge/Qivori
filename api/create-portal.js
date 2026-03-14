import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return Response.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { customerId } = await req.json()
    if (!customerId) return Response.json({ error: 'Customer ID required' }, { status: 400, headers: corsHeaders(req) })

    const origin = req.headers.get('origin') || 'https://qivori.com'

    const params = new URLSearchParams()
    params.append('customer', customerId)
    params.append('return_url', `${origin}/?portal=return`)

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const session = await res.json()
    if (session.error) {
      return Response.json({ error: session.error.message }, { status: 400, headers: corsHeaders(req) })
    }

    return Response.json({ url: session.url }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
