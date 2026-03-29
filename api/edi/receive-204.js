/**
 * POST /api/edi/receive-204
 * Receive inbound X12 204 Motor Carrier Load Tender.
 *
 * Flow:
 * 1. Parse raw X12 → canonical load model
 * 2. Validate fields + check duplicates
 * 3. Store EDI transaction record
 * 4. Run AI decision engine (accept/reject/negotiate)
 * 5. Create or update load in Supabase
 * 6. Auto-generate + send 990 response
 * 7. If accepted: find + assign driver → dispatch
 * 8. Return full result
 *
 * Body: { raw_edi: string, partner_id?: string } OR { load: object } (API mode)
 */
import { handleCors, corsHeaders, verifyAuth } from '../_lib/auth.js'
import { checkRateLimit, rateLimitResponse } from '../_lib/rate-limit.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Prefer': 'return=representation',
  }
}

// ── Inline X12 204 Parser (Edge-compatible, no node_modules) ─────────────────

function parseX12Segments(raw) {
  if (!raw || typeof raw !== 'string') return { segments: [], envelope: null, errors: ['Empty EDI data'] }
  const cleaned = raw.trim()
  let terminator = '~'
  if (cleaned.length > 105) {
    const t = cleaned[105]
    if (t && t !== '*') terminator = t
  }
  let separator = '*'
  if (cleaned.length > 3) separator = cleaned[3]

  const rawSegs = cleaned.split(terminator).map(s => s.replace(/[\r\n]/g, '').trim()).filter(s => s.length > 0)
  const segments = rawSegs.map(seg => {
    const elements = seg.split(separator)
    return { id: elements[0], elements }
  })

  const isa = segments.find(s => s.id === 'ISA')
  const gs = segments.find(s => s.id === 'GS')
  const st = segments.find(s => s.id === 'ST')

  const envelope = (isa && gs && st) ? {
    isa_sender_id: (isa.elements[6] || '').trim(),
    isa_receiver_id: (isa.elements[8] || '').trim(),
    isa_control_number: (isa.elements[13] || '').trim(),
    gs_sender: (gs.elements[2] || '').trim(),
    gs_receiver: (gs.elements[3] || '').trim(),
    gs_control_number: (gs.elements[6] || '').trim(),
    st_type: (st.elements[1] || '').trim(),
    st_control_number: (st.elements[2] || '').trim(),
  } : null

  return { segments, envelope, errors: envelope ? [] : ['Missing ISA/GS/ST envelope'] }
}

const EQUIPMENT_MAP = { 'TL': 'Dry Van', 'TF': 'Flatbed', 'TR': 'Reefer', 'TN': 'Tanker', 'SD': 'Step Deck', 'LB': 'Lowboy', 'PO': 'Power Only' }

function parse204FromSegments(segments, envelope) {
  const parsed = { shipment: {}, references: {}, parties: [], stops: [], weight: {}, notes: [], equipment: null, dates: [] }
  let currentStop = null, inStopLoop = false

  for (const seg of segments) {
    const el = seg.elements
    switch (seg.id) {
      case 'B2':
        parsed.shipment = { scac: el[2] || '', shipper_ref: el[4] || '', payment_method: el[6] || '' }
        break
      case 'B2A':
        parsed.purpose = el[1] || '00'
        break
      case 'L11': {
        const q = el[2] || '', v = el[1] || ''
        if (q === 'BM') parsed.references.bol = v
        else if (q === 'PO') parsed.references.po = v
        else if (q === 'CN') parsed.references.pro = v
        else if (q === 'SI') parsed.references.shipper_ref = v
        else parsed.references[q] = v
        break
      }
      case 'MS3':
        parsed.equipment = EQUIPMENT_MAP[el[4] || ''] || el[4] || 'Dry Van'
        break
      case 'S5':
        inStopLoop = true
        currentStop = { sequence: parseInt(el[1]) || 0, reason: el[2] || '', weight: parseFloat(el[4]) || 0, party: null, address: null, csz: null, dates: [] }
        parsed.stops.push(currentStop)
        break
      case 'N1': {
        const party = { qualifier: el[1] || '', name: el[2] || '', id_type: el[3] || '', id_value: el[4] || '' }
        if (inStopLoop && currentStop) currentStop.party = party
        else parsed.parties.push(party)
        break
      }
      case 'N3':
        if (inStopLoop && currentStop) currentStop.address = el[1] || ''
        break
      case 'N4': {
        const csz = { city: el[1] || '', state: el[2] || '', zip: el[3] || '' }
        if (inStopLoop && currentStop) currentStop.csz = csz
        break
      }
      case 'G62': {
        const d = { qualifier: el[1] || '', date: el[2] || '', time: el[4] || '' }
        if (inStopLoop && currentStop) currentStop.dates.push(d)
        else parsed.dates.push(d)
        break
      }
      case 'AT8':
        parsed.weight = { weight: parseFloat(el[3]) || 0 }
        break
      case 'L3':
        parsed.weight.total_charges = parseFloat(el[5]) || 0
        parsed.weight.total_weight = parseFloat(el[1]) || parsed.weight.weight || 0
        break
      case 'NTE':
        if (el[2] || el[1]) parsed.notes.push(el[2] || el[1])
        break
      case 'SE': case 'GE': case 'IEA':
        inStopLoop = false
        break
    }
  }

  // Map to canonical
  const shipper = parsed.parties.find(p => p.qualifier === 'SH') || parsed.stops.find(s => s.reason === 'CL' || s.reason === 'PL')?.party
  const broker = parsed.parties.find(p => p.qualifier === 'BT' || p.qualifier === 'BY')
  const pickupStop = parsed.stops.find(s => s.reason === 'CL' || s.reason === 'PL') || parsed.stops[0]
  const deliveryStop = parsed.stops.find(s => s.reason === 'UL') || parsed.stops[parsed.stops.length - 1]

  function loc(stop) {
    if (!stop?.csz) return ''
    return `${stop.csz.city}, ${stop.csz.state}`.trim().replace(/^,\s*/, '')
  }

  function parseDates(entries, quals) {
    for (const q of quals) {
      const e = (entries || []).find(d => d.qualifier === q)
      if (e?.date) {
        return { date: `${e.date.slice(0,4)}-${e.date.slice(4,6)}-${e.date.slice(6,8)}`, time: e.time ? `${e.time.slice(0,2)}:${e.time.slice(2,4)}` : null }
      }
    }
    return { date: null, time: null }
  }

  const pd = parseDates([...(pickupStop?.dates || []), ...parsed.dates], ['10','64','37'])
  const dd = parseDates([...(deliveryStop?.dates || []), ...parsed.dates], ['11','69','38'])

  const stops = parsed.stops.map((s, i) => ({
    sequence: s.sequence || i + 1,
    type: (s.reason === 'CL' || s.reason === 'PL') ? 'pickup' : 'dropoff',
    city: s.csz?.city || '',
    state: s.csz?.state || '',
    address: s.address || '',
    zip_code: s.csz?.zip || '',
    contact_name: s.party?.name || '',
    status: 'pending',
  }))

  return {
    canonical: {
      source: 'edi_204',
      load_id: parsed.shipment.shipper_ref || parsed.references.bol || null,
      shipper_name: shipper?.name || '',
      broker_name: broker?.name || '',
      origin: loc(pickupStop),
      origin_address: pickupStop?.address || '',
      origin_city: pickupStop?.csz?.city || '',
      origin_state: pickupStop?.csz?.state || '',
      origin_zip: pickupStop?.csz?.zip || '',
      destination: loc(deliveryStop),
      destination_address: deliveryStop?.address || '',
      destination_city: deliveryStop?.csz?.city || '',
      destination_state: deliveryStop?.csz?.state || '',
      destination_zip: deliveryStop?.csz?.zip || '',
      equipment: parsed.equipment || 'Dry Van',
      weight: String(parsed.weight.weight || parsed.weight.total_weight || ''),
      rate: parsed.weight.total_charges || 0,
      pickup_date: pd.date, pickup_time: pd.time,
      delivery_date: dd.date, delivery_time: dd.time,
      stops,
      reference_number: parsed.references.bol || null,
      po_number: parsed.references.po || null,
      special_instructions: parsed.notes.join('; ') || null,
      payment_terms: parsed.shipment.payment_method === 'PP' ? 'prepaid' : parsed.shipment.payment_method === 'CC' ? 'collect' : null,
      status: parsed.purpose === '01' ? 'Cancelled' : 'pending',
    },
    parsed,
    purpose: parsed.purpose || '00',
  }
}

// ── AI Decision Engine (inline for Edge) ─────────────────────────────────────

const SEASONAL_FACTORS = {
  midwest: [0.88,0.85,0.95,1.05,1.10,1.08,1.05,1.00,1.02,1.12,1.15,1.08],
  southeast: [0.90,0.88,0.95,1.08,1.12,1.10,1.06,1.02,1.00,1.08,1.10,1.05],
  northeast: [0.92,0.88,0.98,1.05,1.08,1.05,1.00,0.98,1.02,1.10,1.12,1.08],
  west: [0.90,0.88,0.95,1.10,1.15,1.12,1.08,1.05,1.02,1.08,1.10,1.05],
  south: [0.88,0.85,0.92,1.05,1.10,1.08,1.05,1.02,1.00,1.10,1.12,1.06],
}
const REGION_MAP = {
  midwest: ['IL','IN','OH','MI','WI','MN','IA','MO','KS','NE','SD','ND'],
  southeast: ['FL','GA','SC','NC','VA','AL','MS','TN','KY','WV','AR','LA'],
  northeast: ['NY','NJ','PA','CT','MA','RI','VT','NH','ME','MD','DE','DC'],
  west: ['CA','WA','OR','NV','AZ','UT','CO','ID','MT','WY','NM'],
  south: ['TX','OK'],
}
const EQUIP_MULT = { 'reefer':1.15,'flatbed':1.08,'tanker':1.12,'step deck':1.10,'lowboy':1.15,'dry van':1.00,'power only':0.95 }

function getRegion(st) {
  if (!st) return 'midwest'
  const s = st.toUpperCase().trim()
  for (const [r, states] of Object.entries(REGION_MAP)) if (states.includes(s)) return r
  return 'midwest'
}

function extractState(loc) {
  if (!loc) return ''
  const parts = loc.split(',')
  const last = (parts[parts.length-1]||'').trim().replace(/[^A-Za-z]/g,'').toUpperCase()
  return last.length === 2 ? last : ''
}

function evaluateLoad(load, context = {}) {
  const gross = parseFloat(load.rate) || 0
  const miles = parseInt(load.miles) || 0
  const weight = parseFloat(load.weight) || 0
  const fuelCPM = context.fuelCostPerMile || 0.55
  const minProfit = context.min_profit || 800
  const minRpm = context.min_rpm || 1.00

  const fuelCost = Math.round(miles * fuelCPM)
  const estProfit = Math.round(gross - fuelCost)
  const rpm = miles > 0 ? gross / miles : 0
  const profitPerMile = miles > 0 ? estProfit / miles : 0

  let transitDays = Math.max(Math.ceil(miles / 500), 1)
  if (load.pickup_date && load.delivery_date) {
    const diff = Math.ceil((new Date(load.delivery_date) - new Date(load.pickup_date)) / 86400000)
    if (diff > 0) transitDays = Math.max(transitDays, diff)
  }
  const profitPerDay = Math.round(estProfit / transitDays)

  const originState = extractState(load.origin) || load.origin_state || ''
  const month = new Date().getMonth() + 1
  const region = getRegion(originState)
  const baseMult = SEASONAL_FACTORS[region][(month-1)] || 1.0
  const eq = (load.equipment||'').toLowerCase()
  let eqMult = 1.0
  for (const [k,v] of Object.entries(EQUIP_MULT)) if (eq.includes(k)) { eqMult = v; break }
  const seasonMult = Math.round(baseMult * eqMult * 100) / 100

  const isLight = weight > 0 && weight <= 37000
  const isHeavy = weight > 42000
  const r2 = n => Math.round(n * 100) / 100

  const metrics = { estProfit, profitPerMile: r2(profitPerMile), profitPerDay, fuelCost, transitDays, rpm: r2(rpm), seasonMultiplier: seasonMult, gross, miles }

  // Hard reject
  if (estProfit < 200) return { decision: 'reject', confidence: 95, reasons: [`Profit $${estProfit} below minimum`], metrics, negotiation: null }
  if (estProfit < minProfit) return { decision: 'reject', confidence: 88, reasons: [`Profit $${estProfit} below $${minProfit} threshold`], metrics, negotiation: null }

  let decision = 'negotiate', confidence = 50
  const reasons = []
  let negotiation = null

  // Negotiate zone
  if (estProfit >= minProfit && estProfit < 1200) {
    const markup = 1.10 + (1200 - estProfit) / 400 * 0.05
    const tgt = Math.round(gross * markup)
    const tgtRate = r2(miles > 0 ? tgt / miles : 0)
    reasons.push(`Profit marginal at $${estProfit} — counter at $${tgt}`)
    negotiation = { currentRate: r2(rpm), targetRate: tgtRate, minAcceptRate: r2(miles > 0 ? Math.round(gross * 1.05) / miles : 0), script: `Load at $${r2(rpm)}/mi. Market shows $${tgtRate}. Can you get closer?` }
  }

  if (profitPerMile < minRpm && decision !== 'reject') { decision = 'negotiate'; reasons.push(`RPM $${r2(profitPerMile)} below $${minRpm}`) }
  if (profitPerDay < 400 && decision !== 'reject') { decision = 'negotiate'; reasons.push(`Profit/day $${profitPerDay} below $400`) }

  if (estProfit >= 1200 && profitPerMile >= minRpm && profitPerDay >= 400) { decision = 'accept'; confidence = 75 }
  if (profitPerMile >= 1.50) { confidence += 10; reasons.push(`Strong rate $${r2(profitPerMile)}/mi`) }
  if (profitPerMile >= 2.00) { confidence += 10; reasons.push(`Excellent rate $${r2(profitPerMile)}/mi`) }
  if (isLight) { confidence += 3; reasons.push('Light load (under 37K lbs)') }
  if (isHeavy) { confidence -= 5; reasons.push('Heavy load — wear & tear') }
  if (weight > 43000 && rpm < 1.20) return { decision: 'reject', confidence: 90, reasons: [`Overweight ${weight} lbs + low RPM`], metrics, negotiation: null }
  if (transitDays > 1.5 && profitPerDay < 400) { if (decision === 'accept') decision = 'negotiate'; reasons.push(`Multi-day: ${transitDays}d, $${profitPerDay}/day`) }
  if (seasonMult > 1.1) reasons.push('Peak season')
  if (seasonMult < 0.9) reasons.push('Slow season')

  if (estProfit >= 2000 && profitPerMile >= 1.50 && profitPerDay >= 500) { decision = 'accept'; confidence = 95; reasons.push('High-profit override') }

  confidence = Math.max(0, Math.min(100, confidence))
  if (decision === 'negotiate' && !negotiation) {
    const tgt = Math.round(gross * 1.12), tgtR = r2(miles > 0 ? tgt / miles : 0)
    negotiation = { currentRate: r2(rpm), targetRate: tgtR, minAcceptRate: r2(miles > 0 ? Math.round(gross*1.05)/miles : 0), script: `Load at $${r2(rpm)}/mi. Market shows $${tgtR}. Can you get closer?` }
  }

  return { decision, confidence, reasons, metrics, negotiation: decision === 'negotiate' ? negotiation : null }
}

// ── 990 Generator (inline) ───────────────────────────────────────────────────

let ctrlSeq = Math.floor(Date.now() / 1000) % 999999999
function nextCtrl(d = 9) { ctrlSeq = (ctrlSeq + 1) % (10 ** d); return String(ctrlSeq).padStart(d, '0') }
function pad(v, l) { return String(v||'').padEnd(l,' ').slice(0,l) }
function nowStr() {
  const d = new Date()
  return { d6: d.toISOString().slice(2,10).replace(/-/g,''), d8: d.toISOString().slice(0,10).replace(/-/g,''), t4: d.toISOString().slice(11,16).replace(':','') }
}

function generate990(canonical, decision, scac, partner, origStControl) {
  const ic = nextCtrl(9), gc = nextCtrl(9), sc = nextCtrl(4)
  const sid = scac || 'QIVORI', rid = partner?.isa_id || 'PARTNER'
  const ts = nowStr()
  const action = decision === 'accept' ? 'A' : 'D'
  const ref = canonical.load_id || canonical.reference_number || ''

  const segs = [
    `ISA*00*${pad('',10)}*00*${pad('',10)}*ZZ*${pad(sid,15)}*ZZ*${pad(rid,15)}*${ts.d6}*${ts.t4}*U*00401*${ic}*0*P*>`,
    `GS*GF*${partner?.gs_id||sid}*${partner?.gs_id||rid}*${ts.d8}*${ts.t4}*${gc}*X*004010`,
    `ST*990*${sc}`,
    `B1*${scac||''}*${ref}*${ts.d8}*${action}`,
    `N1*CA*${scac||'Qivori Carrier'}`,
  ]
  if (decision === 'reject') segs.push('NTE*GEN*Load does not meet carrier requirements')
  if (origStControl) segs.push(`L11*${origStControl}*CR`)
  if (canonical.reference_number) segs.push(`L11*${canonical.reference_number}*BM`)

  const cnt = segs.length - 2 + 1
  segs.push(`SE*${cnt}*${sc}`, `GE*1*${gc}`, `IEA*1*${ic}`)
  return segs.join('~\n') + '~'
}

// ── Find Best Driver ─────────────────────────────────────────────────────────

async function findBestDriver(ownerId, equipment) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/drivers?owner_id=eq.${ownerId}&status=eq.Active&select=*`, { headers: sbHeaders() })
  if (!res.ok) return null
  const drivers = await res.json()
  if (!drivers?.length) return null

  const loadRes = await fetch(`${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${ownerId}&status=not.in.(Delivered,Invoiced,Paid,Cancelled)&select=carrier_name`, { headers: sbHeaders() })
  const active = loadRes.ok ? await loadRes.json() : []
  const busy = new Set(active.map(l => l.carrier_name).filter(Boolean))

  const scored = drivers.map(d => {
    let score = 50
    const name = d.full_name || ''
    if (busy.has(name)) score -= 40; else score += 30
    const exp = (d.equipment_experience || '').toLowerCase()
    if (exp.includes((equipment||'').toLowerCase()) || exp.includes('all')) score += 15
    if ((d.license_class||'').includes('A')) score += 10
    return { ...d, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0] || null
}

// ── Main Handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  // Auth: user JWT (from Qivori UI) OR partner API key (from broker system)
  let userId = null
  const { user, error: authErr } = await verifyAuth(req)
  if (user) {
    userId = user.id
  } else {
    // Try partner API key auth
    const apiKey = req.headers.get('x-api-key') || req.headers.get('x-edi-key')
    if (apiKey && SUPABASE_URL && SERVICE_KEY) {
      try {
        const credRes = await fetch(`${SUPABASE_URL}/rest/v1/edi_credentials?api_key=eq.${encodeURIComponent(apiKey)}&status=eq.active&select=carrier_id&limit=1`, { headers: sbHeaders() })
        if (credRes.ok) {
          const creds = await credRes.json()
          if (creds?.[0]?.carrier_id) userId = creds[0].carrier_id
        }
      } catch {}
    }
    if (!userId) return Response.json({ error: 'Unauthorized — provide user token or X-API-Key header' }, { status: 401, headers: corsHeaders(req) })
  }

  const { limited, resetSeconds } = await checkRateLimit(userId, 'edi-204', 20, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  try {
    const body = await req.json()
    const { raw_edi, partner_id, load: apiLoad } = body
    const timeline = []
    const ts = () => new Date().toISOString()

    // ── STEP 1: Parse ──
    timeline.push({ step: 'parse', time: ts(), detail: 'Parsing EDI document...' })

    let canonical, parsed, envelope, purpose
    if (raw_edi) {
      // X12 EDI mode
      const { segments, envelope: env, errors: parseErrors } = parseX12Segments(raw_edi)
      if (parseErrors.length > 0 && !env) {
        // Store exception
        await storeException(userId, partner_id, null, 'parse_error', 'critical', 'EDI Parse Failed', parseErrors.join('; '), raw_edi)
        return Response.json({ success: false, errors: parseErrors }, { status: 400, headers: corsHeaders(req) })
      }
      envelope = env
      const result = parse204FromSegments(segments, env)
      canonical = result.canonical
      parsed = result.parsed
      purpose = result.purpose
    } else if (apiLoad) {
      // API/JSON mode — direct load object
      canonical = {
        source: 'api',
        load_id: apiLoad.load_id || null,
        shipper_name: apiLoad.shipper_name || '',
        broker_name: apiLoad.broker_name || apiLoad.broker || '',
        broker_phone: apiLoad.broker_phone || '',
        broker_email: apiLoad.broker_email || '',
        origin: apiLoad.origin || '',
        origin_city: apiLoad.origin_city || '',
        origin_state: apiLoad.origin_state || '',
        origin_zip: apiLoad.origin_zip || '',
        destination: apiLoad.destination || apiLoad.dest || '',
        destination_city: apiLoad.destination_city || '',
        destination_state: apiLoad.destination_state || '',
        destination_zip: apiLoad.destination_zip || '',
        equipment: apiLoad.equipment || 'Dry Van',
        weight: String(apiLoad.weight || ''),
        commodity: apiLoad.commodity || '',
        rate: parseFloat(apiLoad.rate) || parseFloat(apiLoad.gross_pay) || parseFloat(apiLoad.gross) || 0,
        miles: parseInt(apiLoad.miles) || 0,
        pickup_date: apiLoad.pickup_date || null,
        pickup_time: apiLoad.pickup_time || null,
        delivery_date: apiLoad.delivery_date || null,
        delivery_time: apiLoad.delivery_time || null,
        stops: apiLoad.stops || [],
        reference_number: apiLoad.reference_number || null,
        po_number: apiLoad.po_number || null,
        special_instructions: apiLoad.special_instructions || apiLoad.notes || '',
        payment_terms: apiLoad.payment_terms || null,
        status: 'pending',
      }
      parsed = apiLoad
      purpose = '00'
      envelope = null
    } else {
      return Response.json({ error: 'Provide raw_edi or load object' }, { status: 400, headers: corsHeaders(req) })
    }

    // ── STEP 2: Validate ──
    timeline.push({ step: 'validate', time: ts(), detail: 'Validating tender...' })

    const errors = []
    const warnings = []
    if (!canonical.origin && (!canonical.stops || canonical.stops.length === 0)) errors.push('Missing pickup location')
    if (!canonical.destination) errors.push('Missing delivery location')
    if (!canonical.rate || canonical.rate <= 0) errors.push('Rate is missing or zero')
    if (!canonical.pickup_date) warnings.push('No pickup date specified')
    if (!canonical.miles || canonical.miles <= 0) warnings.push('Miles not specified — route calculation needed')

    if (errors.length > 0) {
      await storeException(userId, partner_id, null, 'validation_error', 'error', 'Validation Failed', errors.join('; '), raw_edi || JSON.stringify(apiLoad))
      // Still store the transaction as error
      await storeTransaction(userId, '204', 'inbound', partner_id, envelope, raw_edi, parsed, canonical, 'error', null, errors.join('; '))
      return Response.json({ success: false, errors, warnings, canonical }, { status: 400, headers: corsHeaders(req) })
    }

    // ── STEP 3: Duplicate check ──
    if (envelope?.isa_control_number && envelope?.st_control_number) {
      const dupRes = await fetch(
        `${SUPABASE_URL}/rest/v1/edi_transactions?owner_id=eq.${userId}&isa_control_number=eq.${envelope.isa_control_number}&st_control_number=eq.${envelope.st_control_number}&transaction_type=eq.204&status=not.in.(error,duplicate)&select=id&limit=1`,
        { headers: sbHeaders() }
      )
      if (dupRes.ok) {
        const dups = await dupRes.json()
        if (dups.length > 0) {
          await storeTransaction(userId, '204', 'inbound', partner_id, envelope, raw_edi, parsed, canonical, 'duplicate', null, 'Duplicate tender detected')
          await storeException(userId, partner_id, null, 'duplicate', 'warning', 'Duplicate 204 Tender', `ISA ${envelope.isa_control_number} / ST ${envelope.st_control_number} already processed`)
          return Response.json({ success: false, error: 'Duplicate tender', existing_transaction: dups[0].id }, { status: 409, headers: corsHeaders(req) })
        }
      }
    }

    // ── STEP 4: Get carrier settings for AI thresholds ──
    let carrierSettings = {}
    try {
      const settingsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/carrier_settings?owner_id=eq.${userId}&select=*&limit=1`,
        { headers: sbHeaders() }
      )
      if (settingsRes.ok) {
        const rows = await settingsRes.json()
        if (rows.length > 0) carrierSettings = rows[0]
      }
    } catch {}

    // ── STEP 5: Calculate miles if missing ──
    if (!canonical.miles || canonical.miles <= 0) {
      // Rough estimate: 1 degree ≈ 60 miles, use zip codes or city/state
      // In production this calls /api/calculate-route — for now estimate
      if (canonical.origin && canonical.destination) {
        // Default estimate for unknown routes
        canonical.miles = 500
        warnings.push('Miles estimated at 500 — route calculation recommended')
      }
    }

    // ── STEP 6: AI Decision ──
    timeline.push({ step: 'ai_decision', time: ts(), detail: 'Running AI decision engine...' })

    const context = {
      fuelCostPerMile: carrierSettings.fuel_cost_per_mile || 0.55,
      min_profit: carrierSettings.min_profit || 800,
      min_rpm: carrierSettings.min_rpm || 1.00,
    }

    // Get partner-specific overrides
    let partnerConfig = null
    if (partner_id) {
      try {
        const pRes = await fetch(`${SUPABASE_URL}/rest/v1/trading_partners?id=eq.${partner_id}&owner_id=eq.${userId}&select=*&limit=1`, { headers: sbHeaders() })
        if (pRes.ok) {
          const rows = await pRes.json()
          if (rows.length > 0) {
            partnerConfig = rows[0]
            if (partnerConfig.min_profit) context.min_profit = partnerConfig.min_profit
            if (partnerConfig.min_rpm) context.min_rpm = parseFloat(partnerConfig.min_rpm)
          }
        }
      } catch {}
    }

    const aiResult = evaluateLoad(canonical, context)
    timeline.push({ step: 'ai_result', time: ts(), detail: `Decision: ${aiResult.decision.toUpperCase()} (${aiResult.confidence}% confidence)` })

    // Partner auto-accept override
    if (partnerConfig?.auto_accept && aiResult.decision === 'negotiate') {
      aiResult.decision = 'accept'
      aiResult.confidence = 70
      aiResult.reasons.push('Partner auto-accept override applied')
    }

    // ── STEP 7: Create/Update Load ──
    timeline.push({ step: 'create_load', time: ts(), detail: 'Creating load record...' })

    const loadStatus = aiResult.decision === 'accept' ? 'Rate Con Received' :
                       aiResult.decision === 'reject' ? 'Cancelled' : 'Rate Con Received'

    const loadData = {
      owner_id: userId,
      load_id: canonical.load_id,
      origin: canonical.origin,
      origin_address: canonical.origin_address || null,
      origin_zip: canonical.origin_zip || null,
      origin_lat: null,
      origin_lng: null,
      destination: canonical.destination,
      destination_address: canonical.destination_address || null,
      destination_zip: canonical.destination_zip || null,
      dest_lat: null,
      dest_lng: null,
      miles: canonical.miles || null,
      weight: canonical.weight || null,
      commodity: canonical.commodity || null,
      equipment: canonical.equipment || 'Dry Van',
      load_type: 'FTL',
      rate: canonical.rate,
      pickup_date: canonical.pickup_date,
      pickup_time: canonical.pickup_time,
      delivery_date: canonical.delivery_date,
      delivery_time: canonical.delivery_time,
      broker_name: canonical.broker_name,
      broker_phone: canonical.broker_phone || null,
      broker_email: canonical.broker_email || null,
      shipper_name: canonical.shipper_name || null,
      reference_number: canonical.reference_number,
      po_number: canonical.po_number,
      special_instructions: canonical.special_instructions,
      notes: canonical.special_instructions,
      load_source: 'edi_204',
      payment_terms: canonical.payment_terms,
      status: loadStatus,
    }

    const loadRes = await fetch(`${SUPABASE_URL}/rest/v1/loads`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify(loadData),
    })

    let load = null
    if (loadRes.ok) {
      const rows = await loadRes.json()
      load = Array.isArray(rows) ? rows[0] : rows
    } else {
      const err = await loadRes.text()
      warnings.push(`Load creation warning: ${err}`)
    }

    // Create stops if available
    if (load && canonical.stops && canonical.stops.length > 0) {
      const stopsData = canonical.stops.map(s => ({
        load_id: load.id,
        sequence: s.sequence,
        type: s.type,
        city: s.city,
        state: s.state,
        address: s.address,
        zip_code: s.zip_code,
        contact_name: s.contact_name,
        scheduled_date: s.scheduled_date,
        scheduled_time: s.scheduled_time,
        status: 'pending',
      }))
      await fetch(`${SUPABASE_URL}/rest/v1/load_stops`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify(stopsData),
      })
    }

    // ── STEP 8: Store EDI transaction ──
    const txnId = await storeTransaction(
      userId, '204', 'inbound', partner_id, envelope, raw_edi,
      parsed, canonical, 'processed', load?.id,
      null, aiResult.decision, aiResult.confidence, aiResult.reasons, aiResult.metrics
    )

    // ── STEP 9: Auto-send 990 ──
    let response990 = null
    if (aiResult.decision === 'accept' || aiResult.decision === 'reject') {
      const shouldAutoRespond = partnerConfig?.auto_respond !== false
      if (shouldAutoRespond) {
        timeline.push({ step: 'generate_990', time: ts(), detail: `Generating 990 ${aiResult.decision}...` })

        const scac = carrierSettings.scac || 'QVRI'
        response990 = generate990(canonical, aiResult.decision, scac, partnerConfig, envelope?.st_control_number)

        // Store outbound 990
        await storeTransaction(
          userId, '990', 'outbound', partner_id, null, response990,
          { decision: aiResult.decision }, canonical, 'processed', load?.id,
          null, null, null, null, null, txnId
        )

        // If partner has webhook, send 990
        if (partnerConfig?.api_endpoint) {
          try {
            const sendRes = await fetch(partnerConfig.api_endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-edi',
                ...(partnerConfig.api_key ? { 'X-API-Key': partnerConfig.api_key } : {}),
              },
              body: response990,
            })
            timeline.push({ step: 'send_990', time: ts(), detail: `990 sent to partner: ${sendRes.ok ? 'success' : 'failed'}` })
          } catch (e) {
            timeline.push({ step: 'send_990_error', time: ts(), detail: `990 send failed: ${e.message}` })
            await storeException(userId, partner_id, load?.id, 'transmission_failure', 'error', '990 Send Failed', e.message)
          }
        }
      }
    } else {
      // Negotiate — flag for human review
      await storeException(userId, partner_id, load?.id, 'ai_review', 'info', 'Negotiation Required',
        `AI recommends negotiating: ${aiResult.reasons.join('; ')}`)
    }

    // ── STEP 10: Auto-dispatch if accepted ──
    let driverAssigned = null
    if (aiResult.decision === 'accept' && load) {
      timeline.push({ step: 'find_driver', time: ts(), detail: 'Finding available driver...' })

      const driver = await findBestDriver(userId, canonical.equipment)
      if (driver) {
        // Assign driver to load
        const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
          method: 'PATCH',
          headers: sbHeaders(),
          body: JSON.stringify({
            driver_id: driver.id,
            driver_name: driver.full_name,
            carrier_name: driver.full_name,
            status: 'Dispatched',
          }),
        })

        if (updateRes.ok) {
          driverAssigned = { id: driver.id, name: driver.full_name }
          timeline.push({ step: 'dispatch', time: ts(), detail: `Dispatched to ${driver.full_name}` })

          // Store dispatch decision
          await fetch(`${SUPABASE_URL}/rest/v1/dispatch_decisions`, {
            method: 'POST',
            headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              owner_id: userId,
              load_id: load.load_id || load.load_number || '',
              driver_id: driver.id,
              decision: 'accept',
              confidence: aiResult.confidence,
              reasons: aiResult.reasons,
              metrics: aiResult.metrics,
              load_data: canonical,
              auto_booked: true,
              created_at: new Date().toISOString(),
            }),
          })

          // Auto-send 214 "Dispatched" status
          await send214Status(userId, load, canonical, 'Dispatched', carrierSettings.scac || 'QVRI', partnerConfig, partner_id)
          timeline.push({ step: 'send_214', time: ts(), detail: '214 Dispatched status sent' })
        }
      } else {
        timeline.push({ step: 'no_driver', time: ts(), detail: 'No available driver found — load awaiting assignment' })
        await storeException(userId, partner_id, load?.id, 'ai_review', 'warning', 'No Driver Available',
          'Load accepted but no driver available for auto-dispatch')
      }
    }

    // ── DONE ──
    timeline.push({ step: 'complete', time: ts(), detail: 'Processing complete' })

    return Response.json({
      success: true,
      transaction_id: txnId,
      load_id: load?.id || null,
      load_number: load?.load_number || null,
      decision: aiResult.decision,
      confidence: aiResult.confidence,
      reasons: aiResult.reasons,
      metrics: aiResult.metrics,
      negotiation: aiResult.negotiation,
      driver: driverAssigned,
      response_990: response990 ? true : false,
      warnings,
      timeline,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[EDI 204] Error:', err)
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}

// ── Helper: Store EDI Transaction ────────────────────────────────────────────

async function storeTransaction(ownerId, type, direction, partnerId, envelope, rawEdi, parsed, canonical, status, loadId, errorMsg, aiDecision, aiConfidence, aiReasons, aiMetrics, relatedTxnId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        owner_id: ownerId,
        transaction_type: type,
        direction: direction,
        trading_partner_id: partnerId || null,
        isa_control_number: envelope?.isa_control_number || null,
        gs_control_number: envelope?.gs_control_number || null,
        st_control_number: envelope?.st_control_number || null,
        raw_edi: rawEdi || null,
        parsed_data: parsed || null,
        canonical_load: canonical || null,
        load_id: loadId || null,
        load_number: canonical?.load_number || null,
        related_transaction_id: relatedTxnId || null,
        status: status,
        ai_decision: aiDecision || null,
        ai_confidence: aiConfidence || null,
        ai_reasons: aiReasons || null,
        ai_metrics: aiMetrics || null,
        error_message: errorMsg || null,
        received_at: new Date().toISOString(),
        processed_at: status === 'processed' ? new Date().toISOString() : null,
      }),
    })
    if (res.ok) {
      const rows = await res.json()
      return Array.isArray(rows) ? rows[0]?.id : rows?.id
    }
  } catch {}
  return null
}

// ── Helper: Store Exception ──────────────────────────────────────────────────

async function storeException(ownerId, partnerId, loadId, type, severity, title, description, rawData) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/edi_exceptions`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        owner_id: ownerId,
        trading_partner_id: partnerId || null,
        load_id: loadId || null,
        exception_type: type,
        severity: severity,
        title: title,
        description: description || null,
        raw_data: rawData || null,
        status: 'open',
      }),
    })
  } catch {}
}

// ── Helper: Send 214 Status ──────────────────────────────────────────────────

const STATUS_AT7 = {
  'Dispatched': 'X3', 'At Pickup': 'X1', 'In Transit': 'X6',
  'At Delivery': 'X2', 'Delivered': 'D1', 'accepted': 'A3', 'Cancelled': 'X5',
}

async function send214Status(ownerId, load, canonical, statusEvent, scac, partnerConfig, partnerId) {
  const ic = nextCtrl(9), gc = nextCtrl(9), sc = nextCtrl(4)
  const sid = scac || 'QIVORI', rid = partnerConfig?.isa_id || 'PARTNER'
  const t = nowStr()
  const at7 = STATUS_AT7[statusEvent] || 'NS'
  const ref = canonical.load_id || load.load_number || ''

  const city = statusEvent.includes('Pickup') || statusEvent === 'Dispatched'
    ? (canonical.origin_city || (canonical.origin||'').split(',')[0]?.trim() || '')
    : (canonical.destination_city || (canonical.destination||'').split(',')[0]?.trim() || '')
  const state = statusEvent.includes('Pickup') || statusEvent === 'Dispatched'
    ? (canonical.origin_state || '') : (canonical.destination_state || '')

  const segs = [
    `ISA*00*${pad('',10)}*00*${pad('',10)}*ZZ*${pad(sid,15)}*ZZ*${pad(rid,15)}*${t.d6}*${t.t4}*U*00401*${ic}*0*P*>`,
    `GS*QM*${partnerConfig?.gs_id||sid}*${partnerConfig?.gs_id||rid}*${t.d8}*${t.t4}*${gc}*X*004010`,
    `ST*214*${sc}`,
    `B10*${ref}*${canonical.reference_number||''}*${scac||''}`,
  ]
  if (canonical.reference_number) segs.push(`L11*${canonical.reference_number}*BM`)
  if (load.load_number) segs.push(`L11*${load.load_number}*CR`)
  segs.push(`AT7*${at7}*NS*${t.d8}*${t.t4}`)
  if (city || state) segs.push(`MS1*${city}*${state}*US`)
  const cnt = segs.length - 2 + 1
  segs.push(`SE*${cnt}*${sc}`, `GE*1*${gc}`, `IEA*1*${ic}`)
  const edi214 = segs.join('~\n') + '~'

  // Store outbound 214
  await storeTransaction(ownerId, '214', 'outbound', partnerId, null, edi214, { statusEvent }, canonical, 'processed', load.id)

  // Send to partner if webhook configured
  if (partnerConfig?.api_endpoint && partnerConfig?.send_214 !== false) {
    try {
      await fetch(partnerConfig.api_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-edi', ...(partnerConfig.api_key ? { 'X-API-Key': partnerConfig.api_key } : {}) },
        body: edi214,
      })
    } catch {}
  }

  return edi214
}
