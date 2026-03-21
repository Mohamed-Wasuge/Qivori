import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

// ── Document type schemas for the Claude Vision prompt ──────────────

const DOCUMENT_SCHEMAS = {
  rate_con: {
    label: 'Rate Confirmation',
    schema: `{
  "type": "rate_con",
  "broker": "",
  "broker_phone": "",
  "broker_email": "",
  "rate": 0,
  "origin": { "city": "", "state": "", "zip": "", "facility": "" },
  "destination": { "city": "", "state": "", "zip": "", "facility": "" },
  "pickup_date": "YYYY-MM-DD",
  "pickup_time": "",
  "delivery_date": "YYYY-MM-DD",
  "delivery_time": "",
  "equipment": "",
  "weight": 0,
  "miles": 0,
  "commodity": "",
  "reference": "",
  "po_number": "",
  "load_number": "",
  "special_instructions": "",
  "confidence": {}
}`,
    rules: `- broker: the brokerage or company name issuing the rate con
- rate: total line-haul rate as a number (no $ sign)
- origin/destination: extract city, state (2-letter), zip, and facility/company name
- equipment: one of Dry Van, Reefer, Flatbed, Step Deck, Power Only, Conestoga, Hotshot
- weight in lbs as a number
- miles as a number
- pickup_date and delivery_date in YYYY-MM-DD format
- reference: any reference or confirmation number
- load_number: the load/order number`,
  },

  bol: {
    label: 'Bill of Lading',
    schema: `{
  "type": "bol",
  "shipper": "",
  "shipper_address": "",
  "consignee": "",
  "consignee_address": "",
  "bol_number": "",
  "po_numbers": [],
  "pieces": 0,
  "weight": 0,
  "commodity": "",
  "hazmat": false,
  "hazmat_class": "",
  "seal_number": "",
  "trailer_number": "",
  "carrier": "",
  "special_instructions": "",
  "date": "YYYY-MM-DD",
  "confidence": {}
}`,
    rules: `- shipper: the shipping company/facility name
- consignee: the receiving company/facility name
- bol_number: the Bill of Lading number
- po_numbers: array of all PO numbers found
- pieces: total piece/unit count as a number
- weight: total weight in lbs as a number
- commodity: description of goods
- hazmat: true if hazardous materials are indicated
- seal_number: trailer seal number if present
- trailer_number: trailer number if present`,
  },

  pod: {
    label: 'Proof of Delivery',
    schema: `{
  "type": "pod",
  "receiver_name": "",
  "signature": false,
  "delivery_date": "YYYY-MM-DD",
  "delivery_time": "",
  "pieces_received": 0,
  "weight_received": 0,
  "damage_noted": false,
  "damage_description": "",
  "shortage_noted": false,
  "bol_number": "",
  "po_number": "",
  "notes": "",
  "confidence": {}
}`,
    rules: `- receiver_name: name of the person who signed for delivery
- signature: true if a signature is visible on the document
- delivery_date in YYYY-MM-DD format
- delivery_time if visible
- pieces_received: number of pieces/units received
- damage_noted: true if any damage is mentioned or checked
- shortage_noted: true if any shortage is mentioned or checked
- notes: any receiver notes or comments`,
  },

  fuel_receipt: {
    label: 'Fuel Receipt',
    schema: `{
  "type": "fuel_receipt",
  "station": "",
  "location": { "city": "", "state": "" },
  "address": "",
  "gallons": 0,
  "price_per_gallon": 0,
  "total": 0,
  "fuel_type": "",
  "date": "YYYY-MM-DD",
  "time": "",
  "payment_method": "",
  "card_last_four": "",
  "odometer": 0,
  "truck_number": "",
  "confidence": {}
}`,
    rules: `- station: fuel station/truck stop name (e.g. Pilot, Love's, TA)
- gallons: number of gallons purchased as a decimal number
- price_per_gallon: price per gallon as a decimal number
- total: total amount paid as a number (no $ sign)
- fuel_type: Diesel, DEF, Gasoline, etc.
- payment_method: Cash, Credit, Debit, Fleet Card, Comdata, EFS, etc.
- card_last_four: last 4 digits of payment card if visible
- odometer: odometer reading as a number if visible`,
  },

  scale_ticket: {
    label: 'Scale Ticket',
    schema: `{
  "type": "scale_ticket",
  "weight_gross": 0,
  "weight_tare": 0,
  "weight_net": 0,
  "location": "",
  "address": "",
  "date": "YYYY-MM-DD",
  "time": "",
  "ticket_number": "",
  "truck_number": "",
  "trailer_number": "",
  "axle_weights": [],
  "confidence": {}
}`,
    rules: `- weight_gross: gross weight in lbs as a number
- weight_tare: tare (empty) weight in lbs as a number
- weight_net: net weight in lbs as a number
- axle_weights: array of individual axle weights if listed
- ticket_number: the scale ticket number
- location: scale/weigh station name or location`,
  },

  insurance: {
    label: 'Insurance Certificate',
    schema: `{
  "type": "insurance",
  "carrier": "",
  "policy_number": "",
  "coverage_type": "",
  "insurer": "",
  "effective_date": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "auto_liability_limit": "",
  "cargo_limit": "",
  "general_liability_limit": "",
  "workers_comp": false,
  "certificate_holder": "",
  "additional_insured": [],
  "confidence": {}
}`,
    rules: `- carrier: the trucking company/carrier named on the certificate
- policy_number: the insurance policy number
- coverage_type: Auto Liability, Cargo, General Liability, Workers Comp, Umbrella, etc.
- insurer: the insurance company name
- effective_date and expiration_date in YYYY-MM-DD format
- Extract all coverage limits as strings (e.g. "$1,000,000")
- workers_comp: true if workers compensation coverage is listed
- certificate_holder: who the certificate is issued to
- additional_insured: array of additional insured parties`,
  },
}

const VALID_DOC_TYPES = ['rate_con', 'bol', 'pod', 'fuel_receipt', 'scale_ticket', 'insurance', 'auto']

// ── Build the prompt for Claude Vision ──────────────────────────────

function buildPrompt(docType) {
  if (docType === 'auto') {
    // Auto-detect mode: show all schemas and let Claude pick
    const allSchemas = Object.entries(DOCUMENT_SCHEMAS)
      .map(([key, v]) => `### ${v.label} (type: "${key}")\nSchema:\n${v.schema}\n\nField rules:\n${v.rules}`)
      .join('\n\n')

    return `You are an expert freight/trucking document parser with OCR capabilities. Analyze this document and:

1. IDENTIFY the document type (one of: rate_con, bol, pod, fuel_receipt, scale_ticket, insurance)
2. EXTRACT all relevant data fields
3. Return structured JSON matching the schema for that document type

Here are the schemas for each document type:

${allSchemas}

IMPORTANT RULES:
- First determine the document type, then extract fields using the matching schema
- For EVERY field in the confidence object, include a score from 0.0 to 1.0 indicating extraction confidence
  Example: "confidence": { "broker": 0.95, "rate": 0.85, "origin": 0.9 }
- Use null for any field you cannot find or read
- If the image is blurry, rotated, or partially cut off, still extract what you can and lower confidence scores
- If the document appears incomplete, add a top-level "warnings" array with string descriptions
  Example: "warnings": ["Document appears cut off at bottom", "Some text is blurry"]
- Dates should be in YYYY-MM-DD format
- Numbers should be plain numbers (no $ signs, no commas)
- Return ONLY the JSON object, no explanation, no markdown code fences`
  }

  // Specific document type mode
  const docSchema = DOCUMENT_SCHEMAS[docType]
  if (!docSchema) return null

  return `You are an expert freight/trucking document parser with OCR capabilities. This document is a ${docSchema.label}. Extract ALL relevant data fields.

Return ONLY a valid JSON object matching this schema:
${docSchema.schema}

Field rules:
${docSchema.rules}

IMPORTANT RULES:
- For EVERY field in the confidence object, include a score from 0.0 to 1.0 indicating extraction confidence
  Example: "confidence": { "broker": 0.95, "rate": 0.85, "origin": 0.9 }
- Use null for any field you cannot find or read
- If the image is blurry, rotated, or partially cut off, still extract what you can and lower confidence scores
- If the document appears incomplete, add a top-level "warnings" array with string descriptions
  Example: "warnings": ["Document appears cut off at bottom", "Some text is blurry"]
- Dates should be in YYYY-MM-DD format
- Numbers should be plain numbers (no $ signs, no commas)
- Return ONLY the JSON object, no explanation, no markdown code fences`
}

// ── Handler ─────────────────────────────────────────────────────────

export default async function handler(req) {
  // CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Auth
  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }
  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  // Rate limit: 10 requests per 60 seconds per user (Supabase-backed)
  const { limited, resetSeconds } = await checkRateLimit(user.id, 'parse-document', 10, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500, headers: corsHeaders(req) }
    )
  }

  try {
    const rawText = await req.text()

    // Validate payload size (5MB base64 ~ ~6.7MB text)
    if (rawText.length > 7 * 1024 * 1024) {
      return Response.json(
        { error: 'File too large. Maximum 5MB.' },
        { status: 413, headers: corsHeaders(req) }
      )
    }

    let body
    try {
      body = JSON.parse(rawText)
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body' },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    const { file, mediaType, documentType = 'auto' } = body

    // Validate required fields
    if (!file) {
      return Response.json(
        { error: 'Missing required field: file (base64-encoded image or PDF)' },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    // Validate document type
    if (!VALID_DOC_TYPES.includes(documentType)) {
      return Response.json(
        { error: `Invalid documentType. Must be one of: ${VALID_DOC_TYPES.join(', ')}` },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    // Validate media type
    const resolvedMediaType = mediaType || 'image/jpeg'
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
    if (!allowedTypes.some(t => resolvedMediaType.includes(t.split('/')[1]))) {
      return Response.json(
        { error: 'Invalid file type. Supported: JPEG, PNG, WebP, GIF, PDF.' },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    // Build the prompt
    const promptText = buildPrompt(documentType)
    if (!promptText) {
      return Response.json(
        { error: 'Could not build prompt for document type' },
        { status: 400, headers: corsHeaders(req) }
      )
    }

    // Build Claude Vision request content
    const isPdf = resolvedMediaType.includes('pdf')

    const content = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file } },
          { type: 'text', text: promptText },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: resolvedMediaType, data: file } },
          { type: 'text', text: promptText },
        ]

    // Call Claude API
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
        max_tokens: 2048,
        messages: [{ role: 'user', content }],
      }),
    })

    const data = await response.json()

    if (data.error) {
      return Response.json(
        { error: data.error.message },
        { status: 500, headers: corsHeaders(req) }
      )
    }

    // Parse the JSON response from Claude
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      return Response.json(
        { error: 'Could not extract data from document. Try a clearer image.' },
        { status: 500, headers: corsHeaders(req) }
      )
    }

    let parsed
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return Response.json(
        { error: 'AI returned invalid JSON. Try again with a clearer image.' },
        { status: 500, headers: corsHeaders(req) }
      )
    }

    // Ensure the type field is present
    if (!parsed.type && documentType !== 'auto') {
      parsed.type = documentType
    }

    // Ensure confidence object exists
    if (!parsed.confidence) {
      parsed.confidence = {}
    }

    // Calculate an overall confidence score
    const confidenceValues = Object.values(parsed.confidence).filter(v => typeof v === 'number')
    parsed._meta = {
      overall_confidence: confidenceValues.length > 0
        ? Math.round((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) * 100) / 100
        : null,
      fields_extracted: Object.keys(parsed).filter(k => k !== 'confidence' && k !== '_meta' && k !== 'warnings' && parsed[k] !== null).length,
      document_type: parsed.type || 'unknown',
      has_warnings: Array.isArray(parsed.warnings) && parsed.warnings.length > 0,
    }

    return Response.json(
      { success: true, data: parsed },
      { headers: corsHeaders(req) }
    )
  } catch (e) {
    return Response.json(
      { error: 'Server error processing document' },
      { status: 500, headers: corsHeaders(req) }
    )
  }
}
