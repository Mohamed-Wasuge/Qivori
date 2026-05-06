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
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, req)

  const { error: authError } = await verifyAuth(req)
  if (authError) return json({ error: 'Unauthorized' }, 401, req)

  try {
    const body = await req.json()
    const { file, mediaType } = body
    if (!file) return json({ error: 'No file provided' }, 400, req)

    const prompt = `You are a document parser for a trucking company. Extract ALL information from this government-issued ID (driver's license, state ID, or passport).

Return ONLY a valid JSON object. Use null for any field you cannot find:
{
  "full_name": "",
  "license_number": "",
  "license_state": "",
  "license_expiry": "YYYY-MM-DD",
  "license_issued": "YYYY-MM-DD",
  "dob": "YYYY-MM-DD",
  "address": "",
  "cdl_class": "A"
}

Rules:
- full_name: the driver's full legal name as shown
- license_number: the CDL or ID number (may be labeled as "DL", "CDL", "LIC", "ID NO", or similar)
- license_state: 2-letter state abbreviation from the card
- license_expiry: expiration date — look for "EXP", "EXPIRES", "4d" label — convert to YYYY-MM-DD
- license_issued: issue date — look for "ISS", "ISSUED", "4b" label — convert to YYYY-MM-DD
- dob: date of birth — look for "DOB", "4a", "BIRTHDAY" label — convert to YYYY-MM-DD
- address: full street address including city, state, zip as shown on card
- cdl_class: A, B, or C if shown — null if not a CDL
- All dates MUST be in YYYY-MM-DD format regardless of how they appear on the card
- Return ONLY the JSON, no explanation, no markdown`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: file } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })

    const data = await response.json()
    if (data.error) return json({ error: data.error.message || 'AI error' }, 500, req)

    const text = data.content?.[0]?.text || ''
    const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { return json(JSON.parse(match[0]), 200, req) } catch {}
    }
    return json({ error: 'Could not read ID — try a clearer photo' }, 500, req)
  } catch (e) {
    console.error('[parse-driver-id]', e.message)
    return json({ error: e.message }, 500, req)
  }
}
