/**
 * /api/parse-fuel-receipt — Claude Vision reads a fuel receipt photo
 *
 * POST body: { image: base64string, mimeType: 'image/jpeg' }
 * Returns:   { station, city, state, gallons, price_per_gallon, total,
 *              discount, date, state_avg, savings, savings_per_gallon }
 *
 * Uses EIA hardcoded state diesel averages as fallback (no API key needed).
 * Runtime: edge
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// EIA state diesel averages ($/gal, updated 2024-Q4 — refresh quarterly)
const STATE_AVG = {
  AL:3.85,AK:4.65,AZ:4.05,AR:3.80,CA:5.20,CO:4.00,CT:4.30,DE:4.00,
  FL:4.00,GA:3.85,HI:5.50,ID:3.95,IL:4.15,IN:3.95,IA:3.85,KS:3.80,
  KY:3.90,LA:3.75,ME:4.20,MD:4.05,MA:4.35,MI:4.00,MN:3.95,MS:3.75,
  MO:3.80,MT:4.00,NE:3.85,NV:4.30,NH:4.15,NJ:4.10,NM:3.90,NY:4.45,
  NC:3.90,ND:3.90,OH:4.00,OK:3.75,OR:4.25,PA:4.20,RI:4.25,SC:3.80,
  SD:3.90,TN:3.80,TX:3.75,UT:3.95,VT:4.25,VA:4.00,WA:4.45,WV:4.00,
  WI:3.95,WY:3.90,
}

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) {
    return Response.json({ error: 'Claude API not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const rawText = await req.text()
    if (rawText.length > 8 * 1024 * 1024) {
      return Response.json({ error: 'Image too large (max 8MB)' }, { status: 413, headers: corsHeaders(req) })
    }

    const body = JSON.parse(rawText)
    const { image, mimeType = 'image/jpeg' } = body
    if (!image) {
      return Response.json({ error: 'image (base64) required' }, { status: 400, headers: corsHeaders(req) })
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: image },
            },
            {
              type: 'text',
              text: `Read this fuel receipt and return ONLY a JSON object. No explanation, no markdown.

{
  "station": "station name and number (e.g. Pilot #0847) or null",
  "city": "city name or null",
  "state": "2-letter US state code (e.g. TN) or null",
  "gallons": 0.0,
  "price_per_gallon": 0.000,
  "total": 0.00,
  "discount": 0.00,
  "date": "YYYY-MM-DD"
}

Rules:
- state must be a 2-letter US state code
- All numeric fields must be numbers, not strings
- discount = 0 if no fuel card or fleet card discount is shown
- date = today (${new Date().toISOString().split('T')[0]}) if not visible on receipt
- Return ONLY the JSON object`,
            },
          ],
        }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      console.error('[parse-fuel-receipt] Claude error', claudeRes.status, err.slice(0, 200))
      return Response.json({ error: 'Vision API error' }, { status: 502, headers: corsHeaders(req) })
    }

    const claudeData = await claudeRes.json()
    const rawOutput = claudeData.content?.[0]?.text || ''

    let parsed
    try {
      const jsonStr = rawOutput.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('[parse-fuel-receipt] JSON parse failed, raw:', rawOutput.slice(0, 300))
      return Response.json({ error: 'Could not read receipt — try better lighting or enter manually', raw: rawOutput }, { status: 422, headers: corsHeaders(req) })
    }

    const state = ((parsed.state || '').toUpperCase().trim()).slice(0, 2)
    const stateAvg = STATE_AVG[state] || null
    const ppg = Number(parsed.price_per_gallon) || 0
    const gallons = Number(parsed.gallons) || 0
    const total = Number(parsed.total) || 0
    const discount = Number(parsed.discount) || 0

    // Savings vs state avg pump price
    const rawSavings = stateAvg && ppg > 0 && gallons > 0 ? (stateAvg - ppg) * gallons : null
    const savings = rawSavings !== null ? Math.round(rawSavings * 100) / 100 : null
    const savingsPpg = stateAvg && ppg > 0 ? Math.round((stateAvg - ppg) * 1000) / 1000 : null

    return Response.json({
      station: parsed.station || null,
      city: parsed.city || null,
      state: state || null,
      gallons,
      price_per_gallon: ppg,
      total,
      discount,
      date: parsed.date || new Date().toISOString().split('T')[0],
      state_avg: stateAvg,
      savings,
      savings_per_gallon: savingsPpg,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[parse-fuel-receipt] error:', err.message)
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
