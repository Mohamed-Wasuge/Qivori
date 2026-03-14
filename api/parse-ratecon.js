import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

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
  "special_instructions": ""
}

Rules:
- Read EVERY detail on the document — names, addresses, phones, reference numbers, PO numbers
- For origin/destination use "City, ST" format (e.g. "Atlanta, GA")
- Rate should be a number (no $ sign)
- Weight should be a number in lbs
- Miles should be a number
- Equipment: one of Dry Van, Reefer, Flatbed, Step Deck, Power Only, Conestoga, Hotshot
- load_type: one of FTL, LTL, Partial
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await response.json()

    if (data.error) {
      return Response.json({ error: data.error.message }, { status: 500, headers: corsHeaders(req) })
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
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
