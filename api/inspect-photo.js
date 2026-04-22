/**
 * POST /api/inspect-photo
 * AI-powered visual vehicle inspection using Claude Vision.
 * Driver takes a photo of a vehicle component → Q analyzes it for defects.
 *
 * Body: { image_url, component: "tire|brake|light|coupling|...", vehicle_id?, load_id? }
 * OR multipart form with image file
 */
import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

function sbHeaders() {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' }
}

// FMCSA defect criteria by component
const INSPECTION_CRITERIA = {
  tire: 'Check for: tread depth (must be ≥4/32" steer, ≥2/32" drive/trailer per FMCSA §393.75), sidewall cracks/bulges/cuts, proper inflation (visual), uneven wear patterns, exposed cords or belts, embedded objects (nails, screws). A tire with tread depth below minimum or visible cord is an OUT OF SERVICE defect.',
  brake: 'Check for: brake pad thickness (min 1/4" per FMCSA §393.47), visible damage to drums/rotors, brake fluid leaks, air brake chamber condition, loose or missing components, cracked brake hoses, slack adjuster condition. Brakes with pads below minimum or air leaks are OUT OF SERVICE.',
  light: 'Check for: bulb burned out, cracked/broken lens, improper color (red rear, amber side/turn), loose mounting, water inside housing, reflector condition. Non-functioning headlights, tail lights, or turn signals are OUT OF SERVICE per FMCSA §393.9.',
  coupling: 'Check for: fifth wheel cracks/damage, kingpin wear, locking jaw engagement, safety chain/cable condition, air line connections, glad hands condition, slider pins locked. Fifth wheel not properly locked is an OUT OF SERVICE defect.',
  exhaust: 'Check for: exhaust leaks (soot marks), loose/damaged pipes, missing or damaged muffler, exhaust discharge location (must not enter cab). Exhaust leaking under cab is a critical defect.',
  suspension: 'Check for: broken or cracked leaf springs, damaged air bags, leaking shock absorbers, missing U-bolts, cracked hangers, torque rod damage. Broken leaf spring or deflated air bag is OUT OF SERVICE.',
  frame: 'Check for: cracked or bent frame rails, loose or missing bolts, excessive rust/corrosion, cross member damage. Cracked frame is OUT OF SERVICE per FMCSA §393.201.',
  fluid: 'Check for: oil leaks under vehicle, coolant level in overflow tank, DEF level (if visible), power steering fluid, windshield washer fluid. Active fluid leaks indicate maintenance needed.',
  mirror: 'Check for: cracked or missing mirrors, loose mounting, proper adjustment, clean reflective surface. Missing required mirror is a defect per FMCSA §393.80.',
  general: 'Inspect the image for any safety defects, damage, wear, or FMCSA violations visible on this commercial motor vehicle component. Look for anything that would make this vehicle unsafe to operate or fail a DOT roadside inspection.',
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!ANTHROPIC_KEY) return Response.json({ error: 'AI not configured' }, { status: 500, headers: corsHeaders(req) })

  try {
    const { image_url, component, vehicle_id, load_id, dvir_id } = await req.json()

    if (!image_url) {
      return Response.json({ error: 'image_url required' }, { status: 400, headers: corsHeaders(req) })
    }

    const comp = (component || 'general').toLowerCase()
    const criteria = INSPECTION_CRITERIA[comp] || INSPECTION_CRITERIA.general

    // Fetch image server-side and convert to base64 — Claude requires base64.
    // Supabase Storage private-bucket URLs need service-key auth headers.
    const isOurStorage = SUPABASE_URL && image_url.startsWith(SUPABASE_URL)
    const imgRes = await fetch(image_url, isOurStorage ? {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    } : {})
    if (!imgRes.ok) {
      return Response.json({ error: `Could not fetch image (${imgRes.status})` }, { status: 502, headers: corsHeaders(req) })
    }
    const imgBuffer = await imgRes.arrayBuffer()
    if (!imgBuffer || imgBuffer.byteLength === 0) {
      return Response.json({ error: 'Image is empty' }, { status: 400, headers: corsHeaders(req) })
    }
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

    // Claude Vision analysis
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: `You are Q, an FMCSA-certified AI vehicle inspector for commercial motor vehicles (Class 8 trucks and trailers).

A driver is performing a pre-trip inspection and took this photo of: ${comp.toUpperCase()}

INSPECTION CRITERIA:
${criteria}

Analyze this image carefully. Look for:
1. Any visible defects, damage, or wear
2. Whether this component passes or fails FMCSA standards
3. Severity: PASS (safe), MINOR DEFECT (note but can operate), CRITICAL DEFECT (out of service)
4. Specific measurements or observations if visible

Respond in JSON ONLY:
{
  "component": "${comp}",
  "status": "pass" | "minor_defect" | "critical_defect",
  "out_of_service": true/false,
  "confidence": 0-100,
  "findings": ["finding 1", "finding 2"],
  "fmcsa_violation": "§XXX.XX citation if applicable" or null,
  "action_required": "what the driver should do",
  "severity_reason": "why this rating",
  "estimated_repair": "what type of repair needed" or null
}

Be specific about what you see. If the image is unclear, say so but still give your best assessment. Driver safety is the priority.` },
          ],
        }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[inspect-photo] Claude error', res.status, errText)
      return Response.json({ error: `AI analysis failed: ${errText}` }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''

    let analysis = { component: comp, status: 'unknown', confidence: 0, findings: ['Could not analyze image'] }
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try { analysis = JSON.parse(jsonMatch[0]) } catch {}
    }

    // Save inspection photo record
    if (SUPABASE_URL && SERVICE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
        method: 'POST',
        headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          owner_id: user.id,
          name: `Pre-trip: ${comp} inspection`,
          file_url: image_url,
          doc_type: 'dvir_photo',
          load_id: load_id || null,
          metadata: {
            component: comp,
            status: analysis.status,
            out_of_service: analysis.out_of_service,
            findings: analysis.findings,
            fmcsa_violation: analysis.fmcsa_violation,
            vehicle_id: vehicle_id || null,
            dvir_id: dvir_id || null,
            inspected_at: new Date().toISOString(),
          },
        }),
      })
    }

    // Build response message
    const statusEmoji = analysis.status === 'pass' ? 'PASS' : analysis.status === 'critical_defect' ? 'CRITICAL DEFECT' : 'MINOR DEFECT'
    const statusColor = analysis.status === 'pass' ? 'green' : analysis.status === 'critical_defect' ? 'red' : 'yellow'

    return Response.json({
      success: true,
      component: comp,
      status: analysis.status,
      status_label: statusEmoji,
      status_color: statusColor,
      out_of_service: analysis.out_of_service || false,
      confidence: analysis.confidence || 50,
      findings: analysis.findings || [],
      fmcsa_violation: analysis.fmcsa_violation || null,
      action_required: analysis.action_required || 'No action needed',
      severity_reason: analysis.severity_reason || '',
      estimated_repair: analysis.estimated_repair || null,
      message: analysis.status === 'pass'
        ? `${comp} passes inspection. Safe to operate.`
        : analysis.out_of_service
        ? `CRITICAL: ${comp} — OUT OF SERVICE. ${analysis.action_required}. DO NOT DISPATCH.`
        : `${comp} has a minor defect. ${analysis.action_required}. Schedule repair.`,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
