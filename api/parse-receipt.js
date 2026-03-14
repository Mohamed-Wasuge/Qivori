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

    // Validate file type
    const mediaType = file.type || 'image/jpeg'
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    if (!allowedTypes.some(t => mediaType.includes(t.split('/')[1]))) {
      return Response.json({ success: false, error: 'Invalid file type. Upload an image or PDF.' }, { status: 400, headers: corsHeaders(req) })
    }

    // Validate file size (10MB max)
    const buffer = await file.arrayBuffer()
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return Response.json({ success: false, error: 'File too large. Maximum 10MB.' }, { status: 400, headers: corsHeaders(req) })
    }

    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    const isPdf = mediaType.includes('pdf')

    const promptText = `You are a receipt parser for a freight trucking company. Extract expense details from this receipt.

Return ONLY a valid JSON object with these fields. Use null for any field you cannot find:
{
  "amount": 0,
  "date": "YYYY-MM-DD",
  "category": "",
  "merchant": "",
  "notes": ""
}

Rules:
- amount: the total amount paid as a number (no $ sign). Use the total/grand total, not subtotal.
- date: the transaction date in YYYY-MM-DD format
- category: classify as one of: Fuel, Tolls, Repairs, Insurance, Meals, Parking, Permits, Tires, DEF, Lumper, Scale, Other
- merchant: the store/station/vendor name
- notes: brief description of what was purchased (e.g. "52 gal diesel", "oil change", "lunch")
- Return ONLY the JSON, no explanation, no markdown`

    const content = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: promptText },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: promptText },
        ]

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
    if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await response.json()

    if (data.error) {
      return Response.json({ success: false, error: data.error.message }, { status: 500, headers: corsHeaders(req) })
    }

    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return Response.json({ success: true, data: parsed }, { headers: corsHeaders(req) })
      } catch {
        return Response.json({ success: false, error: 'Invalid JSON from AI' }, { status: 500, headers: corsHeaders(req) })
      }
    }

    return Response.json({ success: false, error: 'Could not read receipt. Try a clearer photo.' }, { status: 500, headers: corsHeaders(req) })
  } catch (e) {
    return Response.json({ success: false, error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
