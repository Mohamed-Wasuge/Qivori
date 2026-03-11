export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { file, mediaType } = req.body
    if (!file) return res.status(400).json({ error: 'No file provided' })

    const isPdf = mediaType === 'application/pdf'

    const promptText = `Extract ALL load details from this rate confirmation document. Return ONLY valid JSON with these fields (use null if not found):
{
  "origin": "City, ST",
  "destination": "City, ST",
  "rate": 0,
  "weight": 0,
  "equipment": "Dry Van or Reefer or Flatbed or Step Deck or Power Only or Conestoga or Hotshot",
  "pickup_date": "YYYY-MM-DD",
  "delivery_date": "YYYY-MM-DD",
  "commodity": "",
  "notes": "",
  "load_type": "FTL or LTL or Partial"
}
Return ONLY the JSON object, no markdown, no other text.`

    const content = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file } },
          { type: 'text', text: promptText },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: file } },
          { type: 'text', text: promptText },
        ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        ...(isPdf ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {}),
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await response.json()

    if (data.error) {
      console.error('Anthropic API error:', data.error)
      return res.status(500).json({ error: data.error.message })
    }

    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return res.status(200).json(parsed)
    }

    return res.status(500).json({ error: 'Could not parse response', raw: text })
  } catch (e) {
    console.error('Parse ratecon error:', e)
    return res.status(500).json({ error: e.message })
  }
}
