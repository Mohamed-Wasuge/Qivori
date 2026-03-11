export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return Response.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 500 })
  }

  try {
    const { customerId } = await req.json()
    if (!customerId) return Response.json({ error: 'Customer ID required' }, { status: 400 })

    const origin = req.headers.get('origin') || 'https://qivori.ai'

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
      return Response.json({ error: session.error.message }, { status: 400 })
    }

    return Response.json({ url: session.url })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
