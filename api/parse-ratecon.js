import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

// Serverless (not edge) — edge runtime has 1MB body limit, images exceed that
export const config = { maxDuration: 30 }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    console.log('[parse-ratecon] auth failed:', authError)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  try {
    const rawText = await req.text()

    // Validate payload size (20MB max for base64 documents)
    if (rawText.length > 20 * 1024 * 1024) {
      return Response.json({ error: 'Payload too large' }, { status: 413, headers: corsHeaders(req) })
    }

    let body
    try { body = JSON.parse(rawText) } catch (parseErr) {
      return Response.json({ error: 'JSON parse error' }, { status: 400, headers: corsHeaders(req) })
    }

    const file = body.file
    const mediaType = body.mediaType

    if (!file) {
      return Response.json({ error: 'No file in request body' }, { status: 400, headers: corsHeaders(req) })
    }

    // Validate media type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (mediaType && !allowedTypes.some(t => mediaType.includes(t.split('/')[1]))) {
      return Response.json({ error: 'Invalid file type' }, { status: 400, headers: corsHeaders(req) })
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

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    }
    if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await response.json()
    console.log('[parse-ratecon] anthropic status:', response.status, 'error:', data.error?.type, data.error?.message)

    if (data.error) {
      return Response.json({ error: data.error.message || data.error.type }, { status: 500, headers: corsHeaders(req) })
    }

    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return Response.json(JSON.parse(jsonMatch[0]), { headers: corsHeaders(req) })
      } catch {
        return Response.json({ error: 'Invalid JSON from AI' }, { status: 500, headers: corsHeaders(req) })
      }
    }

    return Response.json({ error: 'Could not extract data. Try a clearer image.' }, { status: 500, headers: corsHeaders(req) })
  } catch (e) {
    console.error('[parse-ratecon] caught:', e.message)
    return Response.json({ error: e.message || 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
