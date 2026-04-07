/**
 * Retell Web Call — In-app voice call between driver/owner and Q
 *
 * Creates a Retell WebRTC session with full context:
 *   - Who is calling (driver name, company, role)
 *   - Their active loads, fleet status
 *   - Language preference
 *
 * Runtime: Vercel Edge
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

async function sbGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    })
    return res.ok ? res.json() : []
  } catch { return [] }
}

const LANG_MAP = {
  en: 'english', es: 'spanish', fr: 'french', pt: 'portuguese',
  so: 'somali', am: 'amharic', ar: 'arabic', hi: 'hindi',
  zh: 'chinese', ru: 'russian', ko: 'korean', vi: 'vietnamese',
}

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
  const RETELL_AGENT_ID = process.env.RETELL_DRIVER_AGENT_ID || process.env.RETELL_AGENT_ID
  if (!RETELL_API_KEY || !RETELL_AGENT_ID) {
    return Response.json({ error: 'Retell not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const driverName = body.driverName || 'Driver'
    const firstName = driverName.split(' ')[0]
    const context = body.context || ''
    const language = body.language || 'en'

    // Enrich with user's actual data (parallel)
    const [companies, activeLoads, memories] = await Promise.all([
      sbGet(`companies?owner_id=eq.${user.id}&select=name,mc_number,dot_number&limit=1`),
      sbGet(`loads?owner_id=eq.${user.id}&status=in.(Assigned,In Transit,Loaded,At Pickup,At Delivery)&select=id,load_id,origin,destination,status,miles,gross,driver,broker_name&order=created_at.desc&limit=5`),
      sbGet(`q_memories?owner_id=eq.${user.id}&order=importance.desc,updated_at.desc&limit=10`),
    ])

    const company = companies[0] || {}
    const companyName = company.name || 'Qivori Dispatch'

    // Build load summary
    let loadSummary = 'No active loads right now.'
    if (activeLoads.length > 0) {
      loadSummary = activeLoads.map(l => {
        const o = (l.origin || '').split(',')[0]
        const d = (l.destination || '').split(',')[0]
        return `${o} → ${d} (${l.status}, driver: ${l.driver || 'unassigned'})`
      }).join('. ')
    }

    // Pack memories
    let memoryText = 'No memories stored yet.'
    if (memories.length > 0) {
      const relevant = memories.filter(m => m.content && m.importance >= 5).slice(0, 5)
      if (relevant.length) memoryText = relevant.map(m => `- ${m.content}`).join('\n')
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
        retell_llm_dynamic_variables: {
          caller_type: 'web_call',
          caller_name: firstName,
          full_name: driverName,
          company_name: companyName,
          carrier_mc: company.mc_number || '',
          active_loads: loadSummary,
          active_load_count: String(activeLoads.length),
          q_memories: memoryText,
          context: context,
          language: LANG_MAP[language] || 'english',
        },
        agent_override: {
          agent: {
            agent_name: 'Q',
            language: LANG_MAP[language] || 'english',
          },
          retell_llm: {
            begin_message: `Hey ${firstName}, it's Q. What are you working on?`,
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
