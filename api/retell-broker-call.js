import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const RETELL_API_KEY = process.env.RETELL_API_KEY
  const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID
  // Use Retell phone number if available, otherwise fall back to Twilio number
  const FROM_NUMBER = process.env.RETELL_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER
  if (!RETELL_API_KEY || !RETELL_AGENT_ID || !FROM_NUMBER) {
    return Response.json({ error: 'Retell not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { phone, brokerName, loadDetails, driverName } = body

    if (!phone) {
      return Response.json({ error: 'Phone number is required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Strip non-digit characters and validate
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      return Response.json({ error: 'Invalid phone number — must be at least 10 digits' }, { status: 400, headers: corsHeaders(req) })
    }

    // Ensure E.164 format
    const toNumber = `+${digits}`

    const res = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: FROM_NUMBER,
        to_number: toNumber,
        agent_id: RETELL_AGENT_ID,
        retell_llm_dynamic_variables: {
          broker_name: brokerName || 'Broker',
          load_details: loadDetails || '',
          driver_name: driverName || 'Driver',
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: 'Retell error: ' + err }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    return Response.json({
      call_id: data.call_id,
      status: 'calling',
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
