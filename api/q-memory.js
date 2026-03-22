import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // GET — fetch memories for this user
  if (req.method === 'GET') {
    const { data } = await supabase
      .from('q_memories')
      .select('*')
      .eq('owner_id', user.id)
      .order('importance', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(50)
    return Response.json({ memories: data || [] }, { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'GET or POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // POST with action: "extract" — use Claude to extract memories from conversation
    if (body.action === 'extract') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        return Response.json({ error: 'AI not configured' }, { status: 500, headers: corsHeaders(req) })
      }

      const transcript = body.transcript || ''
      if (!transcript || transcript.length < 20) {
        return Response.json({ memories: [], message: 'Transcript too short' }, { headers: corsHeaders(req) })
      }

      // Fetch existing memories to avoid duplicates
      const { data: existing } = await supabase
        .from('q_memories')
        .select('content, memory_type')
        .eq('owner_id', user.id)
        .limit(30)

      const existingList = (existing || []).map(m => `[${m.memory_type}] ${m.content}`).join('\n')

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: `You extract memorable facts from trucking dispatcher conversations. Output ONLY a JSON array of memories. Each memory has: memory_type (preference|pattern|fact|interaction|alert), content (short sentence), importance (1-10).

Rules:
- Only extract facts that would be useful in FUTURE conversations
- Preferences: "Prefers reefer loads", "Likes Dallas→Atlanta lane", "Doesn't run NYC"
- Patterns: "Usually runs 2500-3000 miles/week", "Fills up at Loves"
- Facts: "Home base is Memphis, TN", "Has reefer and dry van", "Wife's name is Maria"
- Alerts: "Had tire blowout on I-40 last week", "Broker XYZ didn't pay"
- DO NOT extract: greetings, routine status updates, things that are just current load data
- DO NOT duplicate existing memories
- If nothing memorable, return []

Existing memories (don't duplicate):
${existingList || 'None yet'}`,
          messages: [{ role: 'user', content: `Extract memories from this conversation:\n\n${transcript}` }],
        }),
      })

      if (!res.ok) {
        return Response.json({ memories: [], error: 'AI extraction failed' }, { headers: corsHeaders(req) })
      }

      const aiData = await res.json()
      const text = aiData.content?.[0]?.text || '[]'

      let memories = []
      try {
        // Extract JSON array from response (handle markdown code blocks)
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        memories = jsonMatch ? JSON.parse(jsonMatch[0]) : []
      } catch {
        return Response.json({ memories: [], message: 'Could not parse AI response' }, { headers: corsHeaders(req) })
      }

      // Save each memory to Supabase
      const saved = []
      for (const mem of memories.slice(0, 5)) {
        if (!mem.content || !mem.memory_type) continue
        const { data } = await supabase
          .from('q_memories')
          .insert({
            owner_id: user.id,
            memory_type: mem.memory_type,
            content: mem.content,
            importance: Math.min(10, Math.max(1, mem.importance || 5)),
            metadata: {},
          })
          .select()
          .single()
        if (data) saved.push(data)
      }

      return Response.json({ memories: saved, extracted: memories.length }, { headers: corsHeaders(req) })
    }

    // POST with action: "save" — manually save a memory
    if (body.action === 'save') {
      const { data, error } = await supabase
        .from('q_memories')
        .insert({
          owner_id: user.id,
          memory_type: body.memory_type || 'fact',
          content: body.content,
          importance: body.importance || 5,
          metadata: body.metadata || {},
        })
        .select()
        .single()
      if (error) {
        return Response.json({ error: error.message }, { status: 500, headers: corsHeaders(req) })
      }
      return Response.json({ memory: data }, { headers: corsHeaders(req) })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
