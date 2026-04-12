import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const json = (data, status, req) =>
  new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  })

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405, req)
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    console.log('[parse-ratecon] auth failed:', authError)
    return json({ error: 'Unauthorized' }, 401, req)
  }

  try {
    const rawText = await req.text()

    if (rawText.length > 20 * 1024 * 1024) {
      return json({ error: 'Payload too large' }, 413, req)
    }

    let body
    try { body = JSON.parse(rawText) } catch {
      return json({ error: 'JSON parse error' }, 400, req)
    }

    const file = body.file
    const mediaType = body.mediaType

    if (!file) {
      return json({ error: 'No file in request body' }, 400, req)
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (mediaType && !allowedTypes.some(t => mediaType.includes(t.split('/')[1]))) {
      return json({ error: 'Invalid file type' }, 400, req)
    }

    const isPdf = (mediaType || '').includes('pdf')

    const promptText = `You are a freight logistics document parser. Extract ALL load details from this rate confirmation / load document.

Return ONLY a valid JSON object with these fields. Use null for any field you cannot find:
{
  "load_number": "",
  "broker": "",
  "broker_phone": "",
  "broker_email": "",
  "origin": "City, ST",
  "origin_address": "Full street address",
  "origin_zip": "",
  "shipper_name": "",
  "shipper_phone": "",
  "destination": "City, ST",
  "destination_address": "Full street address",
  "destination_zip": "",
  "consignee_name": "",
  "consignee_phone": "",
  "rate": 0,
  "weight": 0,
  "miles": 0,
  "equipment": "Dry Van",
  "pickup_date": "YYYY-MM-DD",
  "pickup_time": "",
  "delivery_date": "YYYY-MM-DD",
  "delivery_time": "",
  "commodity": "",
  "reference_number": "",
  "po_number": "",
  "notes": "",
  "load_type": "FTL",
  "special_instructions": "",
  "stops": [],
  "freight_class": null,
  "pallet_count": null,
  "length_inches": null,
  "width_inches": null,
  "height_inches": null,
  "handling_unit": null,
  "stackable": false
}

Rules:
- Read EVERY detail on the document — names, addresses, phones, reference numbers, PO numbers
- For origin/destination use "City, ST" format (e.g. "Atlanta, GA")
- Rate should be a number (no $ sign)
- Weight should be a number in lbs
- Miles should be a number
- Equipment: one of Dry Van, Reefer, Flatbed, Step Deck, Power Only, Conestoga, Hotshot
- load_type: one of FTL, LTL, Partial
- For LTL/Partial loads: extract freight_class (NMFC class like 50, 55, 60... 500), pallet_count, dimensions (length/width/height in inches), handling_unit (pallet/crate/drum/box/roll/bundle/loose), stackable (true/false)
- If you see pallet count, freight class, or partial shipment indicators, set load_type to LTL or Partial accordingly
- MULTI-STOP: If the document has multiple pickup or delivery locations, populate the "stops" array. Each stop object:
  {"type": "pickup" or "dropoff", "city": "City, ST", "address": "full address", "state": "ST", "zip_code": "12345", "scheduled_date": "YYYY-MM-DD", "scheduled_time": "HH:MM AM/PM", "contact_name": "", "contact_phone": "", "reference_number": "", "notes": ""}
  Order: all pickups first (in route order), then all deliveries (in route order).
  If there is only 1 pickup and 1 delivery, leave "stops" as an empty array (the origin/destination fields are sufficient).
- Return ONLY the JSON, no explanation, no markdown`

    const content = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file } },
          { type: 'text', text: promptText },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: file } },
          { type: 'text', text: promptText },
        ]

    const anthropicHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    }
    if (isPdf) anthropicHeaders['anthropic-beta'] = 'pdfs-2024-09-25'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders,
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await response.json()
    console.log('[parse-ratecon] anthropic status:', response.status, 'error:', data.error?.type, data.error?.message)

    if (data.error) {
      return json({ error: data.error.message || data.error.type }, 500, req)
    }

    const text = data.content?.[0]?.text || ''
    // Strip markdown code fences if present
    const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return json(JSON.parse(jsonMatch[0]), 200, req)
      } catch {
        console.log('[parse-ratecon] json parse failed, text:', cleaned.slice(0, 200))
        return json({ error: 'Invalid JSON from AI' }, 500, req)
      }
    }

    return json({ error: 'Could not extract data. Try a clearer image.' }, 500, req)
  } catch (e) {
    console.error('[parse-ratecon] caught:', e.message)
    return json({ error: e.message || 'Server error' }, 500, req)
  }
}
