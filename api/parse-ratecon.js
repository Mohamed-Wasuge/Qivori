export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  try {
    const body = await req.json()
    const file = body.file
    const mediaType = body.mediaType

    if (!file) {
      return Response.json({ error: 'No file in request body' }, { status: 400 })
    }

    const isPdf = (mediaType || '').includes('pdf')

    const promptText = `You are a freight logistics document parser. Extract load details from this rate confirmation / load document.

Return ONLY a valid JSON object with these fields. Use null for any field you cannot find:
{
  "origin": "City, ST",
  "destination": "City, ST",
  "rate": 0,
  "weight": 0,
  "equipment": "Dry Van",
  "pickup_date": "YYYY-MM-DD",
  "delivery_date": "YYYY-MM-DD",
  "commodity": "",
  "notes": "",
  "load_type": "FTL"
}

Rules:
- For origin/destination use "City, ST" format (e.g. "Atlanta, GA")
- Rate should be a number (no $ sign)
- Weight should be a number in lbs
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
      return Response.json({ error: data.error.message }, { status: 500 })
    }

    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return Response.json(JSON.parse(jsonMatch[0]))
      } catch {
        return Response.json({ error: 'Invalid JSON from AI', raw: text.slice(0, 200) }, { status: 500 })
      }
    }

    return Response.json({ error: 'Could not extract data. Try a clearer image.' }, { status: 500 })
  } catch (e) {
    return Response.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
