export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { file, mediaType } = req.body
    if (!file) return res.status(400).json({ error: 'No file provided' })

    const isPdf = mediaType === 'application/pdf' || mediaType?.includes('pdf')

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

    // For PDFs, convert to image approach if document type fails
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
      console.error('Anthropic API error:', JSON.stringify(data.error))
      // If document type fails for PDF, retry as generic
      if (isPdf && data.error.message?.includes('document')) {
        return res.status(500).json({ error: 'PDF parsing not supported yet. Try uploading as image (PNG/JPG screenshot).' })
      }
      return res.status(500).json({ error: data.error.message })
    }

    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        return res.status(200).json(parsed)
      } catch (parseErr) {
        return res.status(500).json({ error: 'Invalid JSON in AI response', raw: text.slice(0, 200) })
      }
    }

    return res.status(500).json({ error: 'Could not extract data from document. Try a clearer image.', raw: text.slice(0, 200) })
  } catch (e) {
    console.error('Parse ratecon error:', e)
    return res.status(500).json({ error: e.message || 'Server error' })
  }
}
