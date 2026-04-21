/**
 * POST /api/validate-document
 * AI-powered document validation using Claude Vision.
 * Validates BOL, rate con, POD, lumper receipts against load data.
 * Called before factoring submission and on document upload.
 *
 * Body: { load_id, doc_type, file_url } OR { load_id, validate_all: true }
 */
import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

function sbHeaders() {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json()

    // ── Driver document validation (CDL, medical card, drug test) ──
    if (['cdl', 'medical_card', 'drug_test'].includes(body.doc_type)) {
      const result = await validateDriverDoc(body.doc_type, body.file_url, body.driver_name)
      return Response.json(result, { headers: corsHeaders(req) })
    }

    const { load_id, doc_type, file_url, validate_all } = body
    if (!load_id) return Response.json({ error: 'load_id required' }, { status: 400, headers: corsHeaders(req) })

    // Fetch load
    let load = null
    for (const field of ['id', 'load_number', 'load_id']) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${user.id}&${field}=eq.${encodeURIComponent(load_id)}&select=*&limit=1`, { headers: sbHeaders() })
      if (res.ok) { const rows = await res.json(); if (rows.length > 0) { load = rows[0]; break } }
    }
    if (!load) return Response.json({ error: 'Load not found' }, { status: 404, headers: corsHeaders(req) })

    // Fetch invoice for this load
    let invoice = null
    if (load.id) {
      const invRes = await fetch(`${SUPABASE_URL}/rest/v1/invoices?owner_id=eq.${user.id}&load_id=eq.${load.id}&select=*&limit=1`, { headers: sbHeaders() })
      if (invRes.ok) { const invs = await invRes.json(); invoice = invs[0] || null }
    }

    // ── Validate All Mode: check completeness + validate each doc ──
    if (validate_all) {
      const docsRes = await fetch(`${SUPABASE_URL}/rest/v1/documents?load_id=eq.${load.id}&select=*&order=created_at.desc`, { headers: sbHeaders() })
      const docs = docsRes.ok ? await docsRes.json() : []

      const docTypes = docs.map(d => (d.doc_type || '').toLowerCase())
      const results = {
        complete: false,
        missing: [],
        validations: [],
        ready_to_factor: false,
      }

      // Check required docs
      const required = ['rate_con', 'bol', 'pod']
      for (const req of required) {
        if (!docTypes.some(t => t.includes(req.replace('_', '')))) {
          results.missing.push(req.replace('_', ' ').toUpperCase())
        }
      }
      results.complete = results.missing.length === 0

      // Validate each document
      for (const doc of docs) {
        if (doc.file_url) {
          const validation = await validateSingleDoc(doc.doc_type, doc.file_url, load, invoice)
          results.validations.push({ doc_type: doc.doc_type, doc_name: doc.name, ...validation })
        }
      }

      const allValid = results.validations.every(v => v.valid)
      results.ready_to_factor = results.complete && allValid

      return Response.json(results, { headers: corsHeaders(req) })
    }

    // ── Single Document Validation ──
    if (!file_url || !doc_type) {
      return Response.json({ error: 'doc_type and file_url required' }, { status: 400, headers: corsHeaders(req) })
    }

    const validation = await validateSingleDoc(doc_type, file_url, load, invoice)
    return Response.json(validation, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}

// ── Driver Document Validation (CDL / Medical / Drug Test) ───────────────────

const DRIVER_DOC_PROMPTS = {
  cdl: (driverName) => `You are verifying a commercial driver's license (CDL) for a trucking company.
${driverName ? `The driver's name on file is: "${driverName}"` : ''}

Look at this document image carefully. Return ONLY valid JSON:
{
  "is_correct_document": true or false,
  "document_detected": "describe what this document actually is",
  "driver_name": "full name visible on document or null",
  "license_number": "CDL number or null",
  "license_class": "A, B, or C or null",
  "state": "issuing US state abbreviation or null",
  "expiry_date": "YYYY-MM-DD or null",
  "is_expired": true or false or null,
  "name_matches": true or false or null,
  "issues": []
}

If this is NOT a CDL, set is_correct_document to false and explain in document_detected.
If name doesn't match the driver on file, add it to issues and set name_matches to false.`,

  medical_card: (driverName) => `You are verifying a DOT Medical Examiner's Certificate (medical card) for a truck driver.
${driverName ? `The driver's name on file is: "${driverName}"` : ''}

Return ONLY valid JSON:
{
  "is_correct_document": true or false,
  "document_detected": "what this document actually is",
  "driver_name": "name on document or null",
  "expiry_date": "YYYY-MM-DD or null",
  "is_expired": true or false or null,
  "name_matches": true or false or null,
  "issues": []
}

If this is NOT a DOT medical certificate, set is_correct_document to false.`,

  drug_test: (driverName) => `You are verifying a DOT drug test result document for a truck driver.
${driverName ? `The driver's name on file is: "${driverName}"` : ''}

Return ONLY valid JSON:
{
  "is_correct_document": true or false,
  "document_detected": "what this document actually is",
  "driver_name": "name on document or null",
  "result": "negative or positive or null",
  "test_date": "YYYY-MM-DD or null",
  "name_matches": true or false or null,
  "issues": []
}

If this is NOT a drug test result, set is_correct_document to false.`,
}

async function validateDriverDoc(docType, fileUrl, driverName) {
  if (!ANTHROPIC_KEY) return { valid: true, skipped: true, issues: [] }

  const prompt = DRIVER_DOC_PROMPTS[docType]?.(driverName)
  if (!prompt) return { valid: true, skipped: true, issues: [] }

  try {
    // Fetch the image and convert to base64 — Claude API requires base64.
    // Supabase Storage URLs for private buckets return an empty body without
    // auth, so we add the service-role key when the URL is on our project.
    const SUPABASE_URL = process.env.SUPABASE_URL || ''
    const isOurStorage = SUPABASE_URL && fileUrl.startsWith(SUPABASE_URL)
    const fetchOpts = isOurStorage
      ? {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          },
        }
      : {}

    const imgRes = await fetch(fileUrl, fetchOpts)
    if (!imgRes.ok) {
      console.error('[validate-document] fetch non-OK', imgRes.status, fileUrl)
      return { valid: true, skipped: true, issues: [`Could not fetch document image (${imgRes.status})`] }
    }
    const imgBuffer = await imgRes.arrayBuffer()

    // Bail early if empty — Claude's "image cannot be empty" message is opaque
    if (!imgBuffer || imgBuffer.byteLength === 0) {
      console.error('[validate-document] empty image buffer for', fileUrl)
      return { valid: true, skipped: true, issues: ['Uploaded image is empty — try re-capturing the photo'] }
    }

    // Chunked base64 — the naive spread blows the Edge runtime arg stack
    // for anything larger than ~60KB (any real phone photo).
    const base64 = (() => {
      const bytes = new Uint8Array(imgBuffer)
      const chunkSize = 8192
      let binary = ''
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
      }
      return btoa(binary)
    })()
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg'

    const content = [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
      { type: 'text', text: prompt },
    ]

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 512, messages: [{ role: 'user', content }] }),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      console.error('[validate-document] Anthropic error:', res.status, errBody)
      return { valid: true, skipped: true, issues: [`AI error ${res.status}: ${errBody?.error?.message || 'unavailable'}`] }
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return { valid: true, skipped: true, issues: [] }

    const parsed = JSON.parse(match[0])
    return {
      valid:               parsed.is_correct_document !== false,
      is_correct_document: parsed.is_correct_document,
      document_detected:   parsed.document_detected || null,
      driver_name:         parsed.driver_name || null,
      license_number:      parsed.license_number || null,
      license_class:       parsed.license_class || null,
      state:               parsed.state || null,
      expiry_date:         parsed.expiry_date || null,
      is_expired:          parsed.is_expired || null,
      result:              parsed.result || null,
      name_matches:        parsed.name_matches ?? null,
      issues:              parsed.issues || [],
    }
  } catch (e) {
    return { valid: true, skipped: true, issues: [`Validation error: ${e.message}`] }
  }
}

// ── Claude Vision Document Validation ────────────────────────────────────────

async function validateSingleDoc(docType, fileUrl, load, invoice) {
  const type = (docType || '').toLowerCase().replace(/[_\s-]/g, '')

  const loadContext = `
LOAD DATA:
- Load Number: ${load.load_number || load.load_id || ''}
- Origin: ${load.origin || ''}
- Destination: ${load.destination || ''}
- Broker: ${load.broker_name || ''}
- Rate: $${load.rate || 0}
- Weight: ${load.weight || 'unknown'} lbs
- Equipment: ${load.equipment || 'Dry Van'}
- Pickup Date: ${load.pickup_date || ''}
- Delivery Date: ${load.delivery_date || ''}
- Reference #: ${load.reference_number || ''}
- PO #: ${load.po_number || ''}
- Driver: ${load.driver_name || load.carrier_name || ''}
- Shipper: ${load.shipper_name || ''}
${invoice ? `- Invoice #: ${invoice.invoice_number || ''}
- Invoice Amount: $${invoice.amount || 0}` : ''}`

  let prompt = ''

  switch (type) {
    case 'ratecon':
    case 'rateconfirmation':
    case 'rate_con':
      prompt = `You are a trucking document validator. Analyze this RATE CONFIRMATION document and compare it to the load data.

${loadContext}

CHECK THESE:
1. Does the origin on the rate con match "${load.origin}"?
2. Does the destination match "${load.destination}"?
3. Does the rate/amount match $${load.rate}?
4. Does the broker name match "${load.broker_name}"?
5. Is there a reference/load number visible?
6. Is the document a legitimate rate confirmation (not a different doc type)?

Respond in JSON ONLY:
{"valid": true/false, "confidence": 0-100, "issues": ["issue1", "issue2"], "extracted": {"origin": "...", "destination": "...", "rate": 0, "broker": "...", "reference": "..."}, "summary": "one line summary"}`
      break

    case 'bol':
    case 'billoflading':
    case 'bill_of_lading':
      prompt = `You are a trucking document validator. Analyze this BILL OF LADING (BOL) and compare it to the load data.

${loadContext}

CHECK THESE:
1. Does the shipper/origin match "${load.origin}" or "${load.shipper_name}"?
2. Does the consignee/destination match "${load.destination}"?
3. Is the weight consistent with ${load.weight || 'the load'}?
4. Is there a BOL number or reference number?
5. Is this actually a BOL (not a rate con or POD)?

Respond in JSON ONLY:
{"valid": true/false, "confidence": 0-100, "issues": ["issue1"], "extracted": {"shipper": "...", "consignee": "...", "weight": "...", "bol_number": "..."}, "summary": "one line summary"}`
      break

    case 'pod':
    case 'proofofdelivery':
    case 'proof_of_delivery':
    case 'signedbol':
    case 'signed_bol':
      prompt = `You are a trucking document validator. Analyze this PROOF OF DELIVERY (POD) or SIGNED BOL.

${loadContext}

CHECK THESE:
1. Is there a SIGNATURE present on this document? (This is critical)
2. Is there a delivery date/time visible?
3. Does the receiver/destination match "${load.destination}"?
4. Is this document signed by someone at the delivery location?
5. Is this actually a POD/signed BOL (not an unsigned BOL)?

Respond in JSON ONLY:
{"valid": true/false, "confidence": 0-100, "has_signature": true/false, "issues": ["issue1"], "extracted": {"signed_by": "...", "delivery_date": "...", "receiver": "..."}, "summary": "one line summary"}`
      break

    case 'lumper':
    case 'lumperreceipt':
    case 'lumper_receipt':
      prompt = `You are a trucking document validator. Analyze this LUMPER RECEIPT.

${loadContext}

CHECK THESE:
1. Is this a legitimate lumper receipt (warehouse unloading charge)?
2. Does the location/facility match the delivery: "${load.destination}"?
3. Is there an amount visible?
4. Is there a date that's consistent with the delivery date: ${load.delivery_date || 'unknown'}?

Respond in JSON ONLY:
{"valid": true/false, "confidence": 0-100, "issues": ["issue1"], "extracted": {"amount": 0, "facility": "...", "date": "..."}, "summary": "one line summary"}`
      break

    case 'detention':
    case 'detentionreceipt':
      prompt = `You are a trucking document validator. Analyze this DETENTION RECEIPT or time log.

${loadContext}

CHECK THESE:
1. Does the location match either "${load.origin}" (shipper) or "${load.destination}" (receiver)?
2. Are the times/hours documented?
3. Is there a rate per hour or total charge visible?

Respond in JSON ONLY:
{"valid": true/false, "confidence": 0-100, "issues": ["issue1"], "extracted": {"hours": 0, "charge": 0, "location": "..."}, "summary": "one line summary"}`
      break

    default:
      prompt = `You are a trucking document validator. Identify what type of document this is and whether it appears legitimate.

${loadContext}

What type of trucking document is this? (rate con, BOL, POD, lumper receipt, scale ticket, fuel receipt, or other?)
Does it appear to be related to this load?

Respond in JSON ONLY:
{"valid": true/false, "confidence": 0-100, "detected_type": "...", "issues": ["issue1"], "summary": "one line summary"}`
  }

  try {
    // Determine if file is image or PDF
    const isImage = /\.(jpg|jpeg|png|gif|webp|heic)/i.test(fileUrl)
    const isPdf = /\.pdf/i.test(fileUrl)

    let content = []
    if (isImage) {
      content = [
        { type: 'image', source: { type: 'url', url: fileUrl } },
        { type: 'text', text: prompt },
      ]
    } else if (isPdf) {
      content = [
        { type: 'document', source: { type: 'url', url: fileUrl } },
        { type: 'text', text: prompt },
      ]
    } else {
      // Try as image anyway
      content = [
        { type: 'image', source: { type: 'url', url: fileUrl } },
        { type: 'text', text: prompt },
      ]
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    })

    if (!res.ok) {
      // Fallback: assume valid but low confidence
      return { valid: true, confidence: 30, issues: ['Could not analyze document — AI unavailable'], summary: 'Document uploaded but not validated' }
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0])
        return {
          valid: result.valid ?? true,
          confidence: result.confidence ?? 50,
          has_signature: result.has_signature ?? null,
          detected_type: result.detected_type ?? null,
          issues: result.issues || [],
          extracted: result.extracted || {},
          summary: result.summary || 'Document analyzed',
        }
      } catch {}
    }

    return { valid: true, confidence: 40, issues: ['Could not parse AI response'], summary: text.slice(0, 200) }

  } catch (err) {
    return { valid: true, confidence: 20, issues: [`Validation error: ${err.message}`], summary: 'Document uploaded but validation failed' }
  }
}
