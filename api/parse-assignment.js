/**
 * POST /api/parse-assignment
 *
 * Parses a trucking assignment screenshot/photo/PDF (Amazon Relay schedule,
 * broker rate con, dispatcher sheet, etc.) using Claude Sonnet vision, then
 * upserts into `blocks` + `block_stops` keyed on (owner_id, external_id).
 *
 * Re-scanning the same block (e.g. Amazon schedule update) merges the new
 * data into the existing block — preserves any stops already marked
 * completed so the driver doesn't lose progress.
 *
 * Returns:
 *   { success: true, data: { block, stops, changes: [...] } }
 *   where changes describes what was added/updated vs the existing block
 */

import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

// ── Generic extraction prompt — works for any source ─────────────────────
// The model decides what it's looking at. We don't assume Amazon.
const EXTRACTION_PROMPT = `You are parsing a trucking assignment document for an owner-operator app. The image may be a screenshot of the Amazon Relay app, a broker's rate confirmation, a dispatcher's text message, a handwritten load sheet, or anything similar. Extract the structured data.

Return ONLY valid JSON with this shape. Use null for any field you cannot determine:
{
  "source_type": "amazon_relay" | "rate_con" | "dispatch_sheet" | "manual" | "other",
  "source_company": "Amazon Relay" | "TQL" | "CH Robinson" | ...,
  "external_id": "Block ID, Load ID, or reference number from the document",
  "starts_at": "ISO 8601 datetime for the first stop arrival",
  "ends_at": "ISO 8601 datetime for the last stop departure",
  "total_miles": 1044,
  "total_rate": null,
  "equipment": "53' Dry Van | Skirted Trailer | Reefer | ...",
  "stops": [
    {
      "stop_index": 1,
      "external_stop_id": "FC code like MSP9 or DSM5, or dock number",
      "location_name": "MSP9",
      "address": "full street address if present",
      "city": "Brooklyn Park",
      "state": "MN",
      "zip": "55428",
      "action": "pickup_empty | drop_loaded_pickup_empty | drop_empty_pickup_preloaded | drop_loaded | delivery",
      "action_label": "verbatim action text from the document (e.g. 'Pickup empty trailer')",
      "trailer_type": "Skirted Trailer | 53' Van | null",
      "preloaded": true | false,
      "arrive_by": "ISO 8601 datetime",
      "depart_by": "ISO 8601 datetime"
    }
  ]
}

Rules:
- external_id is CRITICAL. On Amazon this is the Block ID (e.g. "Block-12345"). On a rate con it's the Load # or PRO #. Without it we can't update the assignment later when the schedule changes.
- If the document shows multiple date-separated blocks (e.g. Amazon's "My Schedule" listing Sun 19 + Wed 22), extract the FIRST / current block only. The user can scan the next block separately.
- Timestamps: if you can see both time AND date, produce a full ISO 8601 datetime. If only the time is visible but not the date, assume the current or next-upcoming date that makes the sequence valid. If you truly can't tell, use null.
- action: normalize to one of the listed codes. If the label says "Pickup empty trailer" → pickup_empty. "Drop-off empty trailer and pick up pre-loaded trailer" → drop_empty_pickup_preloaded. "Drop off loaded trailer and pick an empty trailer" → drop_loaded_pickup_empty. Final delivery stop → delivery. Unsure → null.
- stop_index must be 1-indexed and sequential.
- Return ONLY the JSON. No markdown, no explanation.`


// ── Supabase admin helper ────────────────────────────────────────────────
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}
const SUPABASE_URL = process.env.SUPABASE_URL

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() })
  if (!res.ok) return []
  return res.json()
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
  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  const { limited, resetSeconds } = await checkRateLimit(user.id, 'parse-assignment', 20, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ success: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file) {
      return Response.json({ success: false, error: 'No file uploaded' }, { status: 400, headers: corsHeaders(req) })
    }

    const mediaType = file.type || 'image/jpeg'
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    if (!allowed.some(t => mediaType.includes(t.split('/')[1]))) {
      return Response.json({ success: false, error: 'Invalid file type. Upload an image or PDF.' }, { status: 400, headers: corsHeaders(req) })
    }

    const buffer = await file.arrayBuffer()
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return Response.json({ success: false, error: 'File too large. Maximum 10MB.' }, { status: 400, headers: corsHeaders(req) })
    }

    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    const isPdf = mediaType.includes('pdf')

    const content = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: EXTRACTION_PROMPT },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: EXTRACTION_PROMPT },
        ]

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
    if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25'

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content }],
      }),
    })

    const aiData = await aiRes.json()
    if (aiData.error) {
      return Response.json({ success: false, error: aiData.error.message }, { status: 500, headers: corsHeaders(req) })
    }

    const text = aiData.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json({ success: false, error: 'Could not read assignment. Try a clearer photo.' }, { status: 500, headers: corsHeaders(req) })
    }

    let extracted
    try {
      extracted = JSON.parse(jsonMatch[0])
    } catch {
      return Response.json({ success: false, error: 'Invalid JSON from AI' }, { status: 500, headers: corsHeaders(req) })
    }

    const stops = Array.isArray(extracted.stops) ? extracted.stops : []
    if (!extracted.external_id && stops.length === 0) {
      return Response.json({
        success: false,
        error: 'No block ID or stops found. This may not be a valid assignment document.',
      }, { status: 400, headers: corsHeaders(req) })
    }

    // ── Upsert into blocks + block_stops ─────────────────────────────────
    const ownerId = user.id
    const changes = []

    // 1. Find existing block by (owner_id, external_id)
    let existing = null
    if (extracted.external_id) {
      const rows = await sbGet(
        `blocks?owner_id=eq.${ownerId}&external_id=eq.${encodeURIComponent(extracted.external_id)}&limit=1`
      )
      existing = rows[0] || null
    }

    const blockPayload = {
      owner_id: ownerId,
      external_id: extracted.external_id || null,
      source_type: extracted.source_type || 'other',
      source_company: extracted.source_company || null,
      starts_at: extracted.starts_at || null,
      ends_at: extracted.ends_at || null,
      total_miles: extracted.total_miles || null,
      total_rate: extracted.total_rate || null,
      equipment: extracted.equipment || null,
      status: existing?.status || 'draft',
      raw_extraction: extracted,
    }

    let blockId
    if (existing) {
      // UPDATE existing block (preserve id + status + created_at)
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/blocks?id=eq.${existing.id}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(blockPayload),
        }
      )
      const [updated] = await r.json()
      blockId = updated?.id || existing.id
      changes.push({ type: 'block_updated', block_id: blockId })
    } else {
      // INSERT new block
      const r = await fetch(`${SUPABASE_URL}/rest/v1/blocks`, {
        method: 'POST',
        headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(blockPayload),
      })
      const [inserted] = await r.json()
      blockId = inserted?.id
      changes.push({ type: 'block_created', block_id: blockId })
    }

    if (!blockId) {
      return Response.json({ success: false, error: 'Could not save block.' }, { status: 500, headers: corsHeaders(req) })
    }

    // 2. Merge stops
    // Load existing stops once so we can preserve completed ones.
    const existingStops = existing
      ? await sbGet(`block_stops?block_id=eq.${blockId}&select=*&order=stop_index.asc`)
      : []

    for (const s of stops) {
      const idx = s.stop_index || (stops.indexOf(s) + 1)
      const prior = existingStops.find(e => e.stop_index === idx)

      // If the stop was already completed/arrived/working, preserve its live
      // status + timestamps. Only merge the schedule fields (times, action).
      const preserveLive = prior && ['arrived', 'working', 'completed'].includes(prior.status)

      const stopPayload = {
        block_id: blockId,
        owner_id: ownerId,
        stop_index: idx,
        external_stop_id: s.external_stop_id || null,
        location_name: s.location_name || null,
        address: s.address || null,
        city: s.city || null,
        state: s.state || null,
        zip: s.zip || null,
        action: s.action || null,
        action_label: s.action_label || null,
        trailer_type: s.trailer_type || null,
        preloaded: s.preloaded === true,
        arrive_by: s.arrive_by || null,
        depart_by: s.depart_by || null,
        // Preserve progress fields on existing stops mid-work:
        status: preserveLive ? prior.status : (prior?.status || 'not_started'),
        arrived_at: preserveLive ? prior.arrived_at : prior?.arrived_at || null,
        departed_at: preserveLive ? prior.departed_at : prior?.departed_at || null,
      }

      if (prior) {
        // UPDATE existing stop — detect and report time changes
        if (prior.arrive_by !== stopPayload.arrive_by) {
          changes.push({
            type: 'stop_time_changed',
            stop_index: idx,
            field: 'arrive_by',
            from: prior.arrive_by,
            to: stopPayload.arrive_by,
          })
        }
        await fetch(`${SUPABASE_URL}/rest/v1/block_stops?id=eq.${prior.id}`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify(stopPayload),
        })
      } else {
        // INSERT new stop
        await fetch(`${SUPABASE_URL}/rest/v1/block_stops`, {
          method: 'POST',
          headers: sbHeaders(),
          body: JSON.stringify(stopPayload),
        })
        changes.push({ type: 'stop_added', stop_index: idx })
      }
    }

    // 3. Detect removed stops (exist in DB but not in new scan)
    if (existing && existingStops.length > stops.length) {
      const newIndices = new Set(stops.map(s => s.stop_index || 0))
      for (const prior of existingStops) {
        if (!newIndices.has(prior.stop_index) && prior.status === 'not_started') {
          // Only mark as skipped if driver hasn't started it yet
          await fetch(`${SUPABASE_URL}/rest/v1/block_stops?id=eq.${prior.id}`, {
            method: 'PATCH',
            headers: sbHeaders(),
            body: JSON.stringify({ status: 'skipped' }),
          })
          changes.push({ type: 'stop_skipped', stop_index: prior.stop_index })
        }
      }
    }

    // 4. Return the fresh block + stops
    const [freshBlock] = await sbGet(`blocks?id=eq.${blockId}&limit=1`)
    const freshStops = await sbGet(`block_stops?block_id=eq.${blockId}&select=*&order=stop_index.asc`)

    return Response.json({
      success: true,
      data: {
        block: freshBlock,
        stops: freshStops,
        changes,
        created: !existing,
      },
    }, { headers: corsHeaders(req) })
  } catch (e) {
    console.error('[parse-assignment] error:', e)
    return Response.json({ success: false, error: 'Server error: ' + e.message }, { status: 500, headers: corsHeaders(req) })
  }
}
