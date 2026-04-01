/**
 * POST /api/pre-trip
 * AI-powered pre-trip inspection flow.
 * Q walks the driver through FMCSA §396.11 DVIR requirements.
 *
 * Body: { vehicle_id?, load_id?, items: [{ item, status, notes? }], driver_name? }
 *
 * Two modes:
 * 1. GET — returns the FMCSA checklist items for the UI
 * 2. POST — submits completed inspection, AI analyzes for safety
 */
import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

function sbHeaders() {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' }
}

// FMCSA §396.11 required inspection items — complete list
const FMCSA_CHECKLIST = [
  // Tractor
  { id: 'brakes', category: 'Tractor', item: 'Service Brakes (inc. trailer brake connections)', critical: true },
  { id: 'parking_brake', category: 'Tractor', item: 'Parking Brake', critical: true },
  { id: 'steering', category: 'Tractor', item: 'Steering Mechanism', critical: true },
  { id: 'horn', category: 'Tractor', item: 'Horn', critical: false },
  { id: 'wipers', category: 'Tractor', item: 'Windshield Wipers', critical: false },
  { id: 'mirrors', category: 'Tractor', item: 'Rear Vision Mirrors', critical: false },
  { id: 'lights_head', category: 'Tractor', item: 'Headlights', critical: true },
  { id: 'lights_tail', category: 'Tractor', item: 'Tail Lights & Stop Lights', critical: true },
  { id: 'lights_turn', category: 'Tractor', item: 'Turn Signals', critical: true },
  { id: 'lights_clearance', category: 'Tractor', item: 'Clearance & Marker Lights', critical: false },
  { id: 'tires_front', category: 'Tractor', item: 'Front Tires (tread depth, inflation, damage)', critical: true },
  { id: 'tires_rear', category: 'Tractor', item: 'Rear Tires (tread depth, inflation, damage)', critical: true },
  { id: 'wheels_lug', category: 'Tractor', item: 'Wheels & Lug Nuts (loose, cracked, missing)', critical: true },
  { id: 'fuel_system', category: 'Tractor', item: 'Fuel System (leaks, cap secure)', critical: true },
  { id: 'exhaust', category: 'Tractor', item: 'Exhaust System (leaks, damage)', critical: false },
  { id: 'fluids', category: 'Tractor', item: 'Fluid Levels (oil, coolant, DEF, washer)', critical: false },
  { id: 'belts_hoses', category: 'Tractor', item: 'Belts & Hoses', critical: false },
  { id: 'air_lines', category: 'Tractor', item: 'Air Lines & Connections', critical: true },
  { id: 'suspension', category: 'Tractor', item: 'Suspension Components', critical: true },
  { id: 'frame', category: 'Tractor', item: 'Frame & Body (cracks, damage)', critical: false },
  // Safety
  { id: 'fire_ext', category: 'Safety', item: 'Fire Extinguisher (charged, accessible)', critical: true },
  { id: 'triangles', category: 'Safety', item: 'Warning Triangles / Reflectors (3 required)', critical: true },
  { id: 'seat_belt', category: 'Safety', item: 'Seat Belt (functional)', critical: true },
  { id: 'first_aid', category: 'Safety', item: 'First Aid Kit', critical: false },
  // Trailer
  { id: 'trailer_brakes', category: 'Trailer', item: 'Trailer Brake System', critical: true },
  { id: 'trailer_tires', category: 'Trailer', item: 'Trailer Tires (all positions)', critical: true },
  { id: 'trailer_lights', category: 'Trailer', item: 'Trailer Lights (tail, marker, reflectors)', critical: true },
  { id: 'coupling', category: 'Trailer', item: 'Coupling Devices (5th wheel, kingpin, safety chains)', critical: true },
  { id: 'trailer_doors', category: 'Trailer', item: 'Doors & Hinges (secure, functional)', critical: false },
  { id: 'trailer_floor', category: 'Trailer', item: 'Trailer Floor & Walls (holes, damage)', critical: false },
  { id: 'landing_gear', category: 'Trailer', item: 'Landing Gear (crank, base)', critical: false },
  { id: 'mud_flaps', category: 'Trailer', item: 'Mud Flaps / Splash Guards', critical: false },
]

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  // GET — return checklist
  if (req.method === 'GET') {
    return Response.json({ checklist: FMCSA_CHECKLIST, total: FMCSA_CHECKLIST.length, critical: FMCSA_CHECKLIST.filter(i => i.critical).length }, { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') return Response.json({ error: 'GET or POST' }, { status: 405, headers: corsHeaders(req) })

  try {
    const { vehicle_id, load_id, items, driver_name, notes, odometer } = await req.json()

    if (!items || !Array.isArray(items)) {
      return Response.json({ error: 'items array required' }, { status: 400, headers: corsHeaders(req) })
    }

    const defects = items.filter(i => i.status === 'defect' || i.status === 'Defect')
    const criticalDefects = defects.filter(i => {
      const ref = FMCSA_CHECKLIST.find(c => c.id === i.id || c.item === i.item)
      return ref?.critical
    })

    const passed = defects.length === 0
    const safe = criticalDefects.length === 0

    // AI analysis of defects
    let aiAnalysis = null
    if (defects.length > 0 && ANTHROPIC_KEY) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 512,
            messages: [{
              role: 'user',
              content: `You are Q, an FMCSA compliance AI for a trucking company. A driver completed a pre-trip inspection and found these defects:

${defects.map(d => `- ${d.item || d.id}: ${d.notes || 'Defect noted'}`).join('\n')}

Critical defects (vehicle CANNOT operate): ${criticalDefects.map(d => d.item || d.id).join(', ') || 'None'}
Non-critical defects: ${defects.filter(d => !criticalDefects.includes(d)).map(d => d.item || d.id).join(', ') || 'None'}

Respond in JSON: {"dispatch_ok": true/false, "severity": "safe|caution|unsafe", "action": "what driver should do right now", "repair_priority": ["item1", "item2"], "fmcsa_note": "relevant regulation"}

Be direct. Driver safety first.`
            }],
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const text = data.content?.[0]?.text || ''
          const match = text.match(/\{[\s\S]*\}/)
          if (match) aiAnalysis = JSON.parse(match[0])
        }
      } catch {}
    }

    // Determine dispatch clearance
    const dispatchOk = aiAnalysis?.dispatch_ok ?? safe
    const severity = aiAnalysis?.severity || (passed ? 'safe' : safe ? 'caution' : 'unsafe')

    // Save DVIR to database
    let dvirRecord = null
    if (SUPABASE_URL && SERVICE_KEY) {
      const dvirData = {
        owner_id: user.id,
        driver_name: driver_name || user.email,
        vehicle_id: vehicle_id || null,
        vehicle_name: vehicle_id || 'Unknown',
        inspection_type: 'pre_trip',
        status: passed ? 'safe' : safe ? 'defects_minor' : 'defects_found',
        defects: defects.map(d => d.item || d.id),
        items: items,
        odometer: odometer || null,
        notes: notes || null,
        ai_analysis: aiAnalysis,
        load_id: load_id || null,
        submitted_at: new Date().toISOString(),
        source_provider: 'qivori_ai',
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/eld_dvirs`, {
        method: 'POST', headers: sbHeaders(), body: JSON.stringify(dvirData),
      })
      if (res.ok) {
        const rows = await res.json()
        dvirRecord = Array.isArray(rows) ? rows[0] : rows
      }
    }

    // If load is assigned, update dispatch clearance
    if (load_id && SUPABASE_URL && SERVICE_KEY) {
      if (!dispatchOk) {
        // Block dispatch — set load note
        await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load_id}`, {
          method: 'PATCH', headers: sbHeaders(),
          body: JSON.stringify({ notes: `PRE-TRIP FAILED: ${criticalDefects.map(d => d.item || d.id).join(', ')}. Vehicle unsafe to operate.` }),
        })
      }
    }

    return Response.json({
      success: true,
      passed,
      dispatch_ok: dispatchOk,
      severity,
      defects: defects.length,
      critical_defects: criticalDefects.length,
      items_inspected: items.length,
      ai_analysis: aiAnalysis,
      dvir_id: dvirRecord?.id || null,
      message: passed ? 'All clear. Vehicle safe to operate.' :
               dispatchOk ? `${defects.length} minor defect(s) noted. Safe to dispatch — schedule repair.` :
               `CRITICAL: ${criticalDefects.length} critical defect(s). DO NOT DISPATCH until repaired.`,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
