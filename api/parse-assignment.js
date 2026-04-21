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
const EXTRACTION_PROMPT = `You are parsing a trucking assignment document for an owner-operator app. The image may be any of these:

A) AMAZON RELAY — WEEKLY LOADS LIST (desktop web "Loads" tab or mobile "My Schedule"):
   A scrollable list showing MANY separate contracts, one per row. Each row = a whole contract.
   Columns visible: Contract ID (T-116PDP1DN, 116CJ1G6Z, 1141SKF6G, B-LQGZS4CHT, etc.), origin → destination, date/time, miles, trailer, total $, driver, status (may say "Canceled" in red).
   → Return MULTIPLE blocks (one per row).

B) AMAZON RELAY — SINGLE CONTRACT DETAIL (desktop expanded view):
   One contract ID at the top (e.g. "B-LQGZS4CHT") with its shipments listed underneath. Each shipment is a sub-row showing shipment ID (113YYRXMS, 1111R9BDH), origin FC → destination FC, miles, $ per shipment, per-stop arrival/departure times.
   → Return ONE block with full stops[] + shipments[] arrays.

C) AMAZON RELAY — DRIVER MOBILE APP (numbered stops list):
   Stops numbered 1-N with FC codes, actions like "Pickup empty trailer", "Drop-off empty trailer and pick up pre-loaded trailer", time windows. No per-shipment $ visible (mobile hides rates from the driver).
   → Return ONE block with stops[] array, no shipments[] (rates unknown).

D) BROKER RATE CON / DISPATCH SHEET / HANDWRITTEN:
   Single-shipment rate confirmation: carrier name, broker, one pickup one delivery, one rate.
   → Return ONE block with 2 stops and 1 shipment.

Return ONLY valid JSON with this shape:
{
  "view_type": "weekly_list" | "single_contract" | "driver_mobile" | "rate_con" | "other",
  "blocks": [
    {
      "source_type": "amazon_relay" | "rate_con" | "dispatch_sheet" | "other",
      "source_company": "Amazon Relay" | "TQL" | ...,
      "external_id": "Contract ID / Load ID / Block ID",
      "starts_at": "ISO 8601 datetime",
      "ends_at": "ISO 8601 datetime",
      "total_miles": 1044,
      "total_rate": 697.88,
      "equipment": "53' Trailer",
      "status": "draft" | "cancelled",
      "stops": [ /* same shape as before — array or [] */
        {
          "stop_index": 1,
          "external_stop_id": "MSP9",
          "location_name": "MSP9",
          "address": "...",
          "city": "Brooklyn Park",
          "state": "MN",
          "zip": "55428",
          "action": "pickup_empty | drop_loaded_pickup_empty | drop_empty_pickup_preloaded | drop_loaded | delivery",
          "action_label": "verbatim action text",
          "trailer_type": "Skirted Trailer | 53' Van | null",
          "preloaded": true | false,
          "arrive_by": "ISO 8601 datetime",
          "depart_by": "ISO 8601 datetime"
        }
      ],
      "shipments": [ /* array or [] */
        {
          "external_id": "113YYRXMS",
          "origin_fc": "STL3",
          "dest_fc": "WSP1",
          "origin_city": "Brookline, MO",
          "dest_city": "Lowell, AR",
          "miles": 93,
          "rate": 63.12,
          "pickup_stop_index": 1,
          "dropoff_stop_index": 2
        }
      ]
    }
  ]
}

Rules:
- external_id is CRITICAL for every block — it's what lets us update later when schedule changes.
- For WEEKLY LIST view: include EVERY row (all visible contracts), skipping none. Mark canceled rows with status:"cancelled". Each block gets total_rate and total_miles from its row; stops and shipments can be empty arrays since that detail isn't visible at list level.
- For SINGLE CONTRACT view: return one block with both stops[] AND shipments[] populated.
- For DRIVER MOBILE view: return one block with stops[] populated; shipments:[] (rates hidden from driver).
- For RATE CON: one block, 2 stops (pickup + delivery), 1 shipment.
- total_rate: only include if visible in the document. If unknown, null.
- Timestamps: full ISO 8601 if date visible. If only time, assume the displayed date context. If impossible, null.
- action codes: "Pickup empty trailer" → pickup_empty · "Drop-off empty trailer and pick up pre-loaded trailer" → drop_empty_pickup_preloaded · "Drop off loaded trailer and pick an empty trailer" → drop_loaded_pickup_empty · final stop → delivery.
- stop_index 1-indexed. Shipment pickup/dropoff indexes must reference valid stop_indexes (or be null).
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

    // ── Normalize to blocks[] array ──────────────────────────────────────
    // New prompt returns { view_type, blocks: [...] }. For backward compat
    // also accept the old shape where the root IS a single block.
    const blocksIn = Array.isArray(extracted.blocks) && extracted.blocks.length > 0
      ? extracted.blocks
      : [extracted]
    const viewType = extracted.view_type || (blocksIn.length > 1 ? 'weekly_list' : 'single_contract')

    // Basic validity check — need at least one block with an ID or stops.
    const anyValid = blocksIn.some(b => b.external_id || (Array.isArray(b.stops) && b.stops.length > 0))
    if (!anyValid) {
      return Response.json({
        success: false,
        error: 'No blocks or stops found. This may not be a valid assignment document.',
      }, { status: 400, headers: corsHeaders(req) })
    }

    const ownerId = user.id
    const processedBlocks = []
    const allChanges = []

    // Process each block independently
    for (const blk of blocksIn) {
      try {
        const result = await upsertOneBlock(blk, ownerId)
        processedBlocks.push(result)
        allChanges.push(...result.changes.map(c => ({ ...c, block_id: result.block.id })))
      } catch (e) {
        console.error('[parse-assignment] block upsert failed:', e.message)
        allChanges.push({ type: 'block_error', error: e.message })
      }
    }

    // Return in the shape the mobile review sheet expects:
    //   primary  = first processed block (for the current-active experience)
    //   blocks[] = all processed (so multi-block weekly scans can render all)
    const primary = processedBlocks[0] || null

    return Response.json({
      success: true,
      data: {
        view_type: viewType,
        // Back-compat: single-block callers can still use data.block / data.stops / data.shipments
        block:     primary?.block || null,
        stops:     primary?.stops || [],
        shipments: primary?.shipments || [],
        // New multi-block surface
        blocks:    processedBlocks.map(r => ({
          block: r.block,
          stops: r.stops,
          shipments: r.shipments,
          created: r.created,
        })),
        changes:   allChanges,
        created:   primary ? primary.created : false,
      },
    }, { headers: corsHeaders(req) })
  } catch (e) {
    console.error('[parse-assignment] error:', e)
    return Response.json({ success: false, error: 'Server error: ' + e.message }, { status: 500, headers: corsHeaders(req) })
  }
}


// ─────────────────────────────────────────────────────────────────────────
// upsertOneBlock — the per-block pipeline extracted so we can loop over
// multiple blocks from a weekly-list scan.
// ─────────────────────────────────────────────────────────────────────────
async function upsertOneBlock(blk, ownerId) {
  const changes = []
  const stops = Array.isArray(blk.stops) ? blk.stops : []

  // 1. Find existing block by (owner_id, external_id)
  let existing = null
  if (blk.external_id) {
    const rows = await sbGet(
      `blocks?owner_id=eq.${ownerId}&external_id=eq.${encodeURIComponent(blk.external_id)}&limit=1`
    )
    existing = rows[0] || null
  }

  const blockPayload = {
    owner_id: ownerId,
    external_id: blk.external_id || null,
    source_type: blk.source_type || 'other',
    source_company: blk.source_company || null,
    starts_at: blk.starts_at || null,
    ends_at: blk.ends_at || null,
    total_miles: blk.total_miles || null,
    total_rate: blk.total_rate || null,
    equipment: blk.equipment || null,
    // Respect incoming "cancelled" status from AI (weekly list rows)
    status: blk.status === 'cancelled' ? 'cancelled' : (existing?.status || 'draft'),
    raw_extraction: blk,
  }

  let blockId
  if (existing) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/blocks?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify(blockPayload),
    })
    const [updated] = await r.json()
    blockId = updated?.id || existing.id
    changes.push({ type: 'block_updated' })
  } else {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/blocks`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify(blockPayload),
    })
    const [inserted] = await r.json()
    blockId = inserted?.id
    changes.push({ type: 'block_created' })
  }

  if (!blockId) throw new Error('Could not save block')

  // 2. Merge stops
  const existingStops = existing
    ? await sbGet(`block_stops?block_id=eq.${blockId}&select=*&order=stop_index.asc`)
    : []

  for (const s of stops) {
    const idx = s.stop_index || (stops.indexOf(s) + 1)
    const prior = existingStops.find(e => e.stop_index === idx)
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
      status: preserveLive ? prior.status : (prior?.status || 'not_started'),
      arrived_at: preserveLive ? prior.arrived_at : prior?.arrived_at || null,
      departed_at: preserveLive ? prior.departed_at : prior?.departed_at || null,
    }

    if (prior) {
      if (prior.arrive_by !== stopPayload.arrive_by) {
        changes.push({
          type: 'stop_time_changed',
          stop_index: idx,
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
      await fetch(`${SUPABASE_URL}/rest/v1/block_stops`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify(stopPayload),
      })
      changes.push({ type: 'stop_added', stop_index: idx })
    }
  }

  // 3. Detect removed stops
  if (existing && existingStops.length > stops.length) {
    const newIndices = new Set(stops.map(s => s.stop_index || 0))
    for (const prior of existingStops) {
      if (!newIndices.has(prior.stop_index) && prior.status === 'not_started') {
        await fetch(`${SUPABASE_URL}/rest/v1/block_stops?id=eq.${prior.id}`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ status: 'skipped' }),
        })
        changes.push({ type: 'stop_skipped', stop_index: prior.stop_index })
      }
    }
  }

  // 4. Upsert shipments
  const shipments = Array.isArray(blk.shipments) ? blk.shipments : []
  if (shipments.length > 0) {
    const existingShipments = existing
      ? await sbGet(`block_shipments?block_id=eq.${blockId}&select=*`)
      : []

    for (const sh of shipments) {
      const shPayload = {
        block_id: blockId,
        owner_id: ownerId,
        external_id: sh.external_id || null,
        origin_fc: sh.origin_fc || null,
        dest_fc: sh.dest_fc || null,
        origin_city: sh.origin_city || null,
        dest_city: sh.dest_city || null,
        miles: sh.miles || null,
        rate: sh.rate || null,
        pickup_stop_index: sh.pickup_stop_index || null,
        dropoff_stop_index: sh.dropoff_stop_index || null,
      }
      const priorSh = sh.external_id
        ? existingShipments.find(e => e.external_id === sh.external_id)
        : null

      if (priorSh) {
        await fetch(`${SUPABASE_URL}/rest/v1/block_shipments?id=eq.${priorSh.id}`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify(shPayload),
        })
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/block_shipments`, {
          method: 'POST',
          headers: sbHeaders(),
          body: JSON.stringify({ ...shPayload, status: 'pending' }),
        })
        changes.push({ type: 'shipment_added', shipment_id: sh.external_id })
      }
    }

    // Backfill total_rate if missing + sum is known
    if (!blk.total_rate) {
      const sum = shipments.reduce((s, sh) => s + (Number(sh.rate) || 0), 0)
      if (sum > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/blocks?id=eq.${blockId}`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({ total_rate: sum }),
        })
      }
    }
  }

  // 5. Read fresh data for return
  const [freshBlock] = await sbGet(`blocks?id=eq.${blockId}&limit=1`)
  const freshStops = await sbGet(`block_stops?block_id=eq.${blockId}&select=*&order=stop_index.asc`)
  const freshShipments = await sbGet(`block_shipments?block_id=eq.${blockId}&select=*&order=pickup_stop_index.asc`)

  return {
    block: freshBlock,
    stops: freshStops,
    shipments: freshShipments,
    changes,
    created: !existing,
  }
}
