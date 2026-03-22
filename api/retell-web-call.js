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
  // Use driver chat agent for web calls, fall back to broker agent
  const RETELL_AGENT_ID = process.env.RETELL_DRIVER_AGENT_ID || process.env.RETELL_AGENT_ID
  if (!RETELL_API_KEY || !RETELL_AGENT_ID) {
    return Response.json({ error: 'Retell not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const driverName = body.driverName || 'Driver'
    const context = body.context || ''
    const language = body.language || 'en'

    // Map language codes to Retell-compatible language names
    const langMap = {
      en: 'english',
      es: 'spanish',
      fr: 'french',
      pt: 'portuguese',
      so: 'somali',
      am: 'amharic',
      ar: 'arabic',
      hi: 'hindi',
      zh: 'chinese',
      ru: 'russian',
      ko: 'korean',
      vi: 'vietnamese',
    }

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
          language: language,
        },
        // Dynamic variables — referenced in Retell agent's prompt as {{variable_name}}
        retell_llm_dynamic_variables: {
          agent_name: 'Q',
          agent_role: 'AI dispatcher for Qivori, a trucking TMS for owner-operators',
          agent_personality: 'You are Q. Never say you are Alex or any other name. You ARE Q, the AI dispatcher. Be warm, confident, direct. Sound like a real dispatcher who knows the driver personally. Keep answers short and natural — this is a phone call.',
          driver_name: driverName,
          context: context,
          language: langMap[language] || 'english',
        },
        // Override agent name and first greeting per-call (correct Retell v2 structure)
        agent_override: {
          agent: {
            agent_name: 'Q',
            language: langMap[language] || 'english',
          },
          retell_llm: {
            begin_message: `Hey ${driverName}, it's Q. What are you working on?`,
          },
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
