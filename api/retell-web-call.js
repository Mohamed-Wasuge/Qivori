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
  if (!RETELL_API_KEY || !RETELL_AGENT_ID) {
    return Response.json({ error: 'Retell not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const driverName = body.driverName || 'Driver'
    const context = body.context || ''

    const res = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: RETELL_AGENT_ID,
        metadata: {
          user_id: user.id,
          driver_name: driverName,
        },
        retell_llm_dynamic_variables: {
          driver_name: driverName,
          context: context,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: 'Retell error: ' + err }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    return Response.json({
      access_token: data.access_token,
      call_id: data.call_id,
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
