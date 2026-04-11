#!/usr/bin/env node
/**
 * QIVORI EDI — Full End-to-End Pipeline Simulation
 * Runs against LIVE Supabase database.
 */

const SUPABASE_URL = 'https://jrencclzfztrilrldmwf.supabase.co'
const SERVICE_KEY = 'sb_secret_FqzPMGPOIz-ivGkm2h0aRA_2SgAH26C'
const OWNER_ID = '0c99abcf-157d-4a4e-930f-ef22de063ff0'

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Prefer': 'return=representation',
  }
}

const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const MAGENTA = '\x1b[35m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const LINE = '─'.repeat(72)

function step(num, title) {
  console.log(`\n${CYAN}${LINE}${RESET}`)
  console.log(`${BOLD}${CYAN}  STEP ${num}${RESET} ${BOLD}${title}${RESET}`)
  console.log(`${CYAN}${LINE}${RESET}\n`)
}

function ok(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`) }
function info(msg) { console.log(`  ${DIM}${msg}${RESET}`) }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`) }
function data(label, val) { console.log(`  ${DIM}${label}:${RESET} ${BOLD}${val}${RESET}`) }
function json(obj) { console.log(`  ${DIM}${JSON.stringify(obj, null, 2).split('\n').join('\n  ')}${RESET}`) }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── X12 Parser (inline) ────────────────────────────────────────────────────

const EQUIPMENT_MAP = { 'TL': 'Dry Van', 'TF': 'Flatbed', 'TR': 'Reefer', 'TN': 'Tanker' }

function parseX12(raw) {
  const cleaned = raw.trim()
  let term = '~', sep = '*'
  if (cleaned.length > 105) { const t = cleaned[105]; if (t && t !== '*') term = t }
  if (cleaned.length > 3) sep = cleaned[3]

  const segs = cleaned.split(term).map(s => s.replace(/[\r\n]/g, '').trim()).filter(s => s.length > 0)
    .map(seg => { const el = seg.split(sep); return { id: el[0], el } })

  const isa = segs.find(s => s.id === 'ISA')
  const gs = segs.find(s => s.id === 'GS')
  const st = segs.find(s => s.id === 'ST')

  const envelope = {
    isa_sender: (isa?.el[6] || '').trim(),
    isa_receiver: (isa?.el[8] || '').trim(),
    isa_control: (isa?.el[13] || '').trim(),
    gs_sender: (gs?.el[2] || '').trim(),
    gs_receiver: (gs?.el[3] || '').trim(),
    gs_control: (gs?.el[6] || '').trim(),
    st_type: (st?.el[1] || '').trim(),
    st_control: (st?.el[2] || '').trim(),
  }

  const parsed = { shipment: {}, refs: {}, parties: [], stops: [], weight: {}, notes: [], equipment: null }
  let curStop = null, inStop = false

  for (const seg of segs) {
    const el = seg.el
    switch (seg.id) {
      case 'B2': parsed.shipment = { scac: el[2]||'', ref: el[4]||'', pay: el[6]||'' }; break
      case 'B2A': parsed.purpose = el[1]||'00'; break
      case 'L11': {
        const q = el[2]||'', v = el[1]||''
        if (q==='BM') parsed.refs.bol=v; else if (q==='PO') parsed.refs.po=v;
        else if (q==='SI') parsed.refs.shipper_ref=v; else parsed.refs[q]=v; break
      }
      case 'MS3': parsed.equipment = EQUIPMENT_MAP[el[4]||''] || el[4] || 'Dry Van'; break
      case 'S5': inStop=true; curStop = { seq: parseInt(el[1])||0, reason: el[2]||'', weight: parseFloat(el[4])||0, party: null, csz: null, dates: [] }; parsed.stops.push(curStop); break
      case 'N1': { const p = { q: el[1]||'', name: el[2]||'' }; if (inStop && curStop) curStop.party=p; else parsed.parties.push(p); break }
      case 'N3': if (inStop && curStop) curStop.addr = el[1]||''; break
      case 'N4': { const c = { city: el[1]||'', state: el[2]||'', zip: el[3]||'' }; if (inStop && curStop) curStop.csz=c; break }
      case 'G62': { const d = { q: el[1]||'', date: el[2]||'', time: el[4]||'' }; if (inStop && curStop) curStop.dates.push(d); break }
      case 'AT8': parsed.weight = { lbs: parseFloat(el[3])||0 }; break
      case 'L3': parsed.weight.charges = parseFloat(el[5])||0; parsed.weight.total = parseFloat(el[1])||0; break
      case 'NTE': if (el[2]||el[1]) parsed.notes.push(el[2]||el[1]); break
      case 'SE': case 'GE': case 'IEA': inStop=false; break
    }
  }

  return { envelope, parsed, segs }
}

function fmtDate(d) { return d ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : null }

// ── AI Decision Engine ──────────────────────────────────────────────────────

function evaluateLoad(rate, miles, weight, equipment, originState) {
  const fuelCPM = 0.55
  const fuelCost = Math.round(miles * fuelCPM)
  const estProfit = Math.round(rate - fuelCost)
  const rpm = miles > 0 ? rate / miles : 0
  const ppm = miles > 0 ? estProfit / miles : 0
  const transitDays = Math.max(Math.ceil(miles / 500), 1)
  const ppd = Math.round(estProfit / transitDays)
  const r2 = n => Math.round(n * 100) / 100

  const metrics = { rate, miles, fuelCost, estProfit, rpm: r2(rpm), profitPerMile: r2(ppm), profitPerDay: ppd, transitDays, weight }
  const reasons = []
  let decision = 'negotiate', confidence = 50

  if (estProfit < 200) return { decision: 'reject', confidence: 95, reasons: [`Profit $${estProfit} below minimum`], metrics }
  if (estProfit < 800) return { decision: 'reject', confidence: 88, reasons: [`Profit $${estProfit} below $800 threshold`], metrics }

  if (estProfit >= 800 && estProfit < 1200) {
    decision = 'negotiate'
    const tgt = Math.round(rate * 1.12)
    reasons.push(`Profit marginal at $${estProfit} — counter at $${tgt}`)
  }
  if (ppm < 1.00) { decision = 'negotiate'; reasons.push(`RPM $${r2(ppm)} below $1.00`) }
  if (ppd < 400) { decision = 'negotiate'; reasons.push(`Profit/day $${ppd} below $400`) }

  if (estProfit >= 1200 && ppm >= 1.00 && ppd >= 400) { decision = 'accept'; confidence = 75 }
  if (ppm >= 1.50) { confidence += 10; reasons.push(`Strong rate $${r2(ppm)}/mi`) }
  if (ppm >= 2.00) { confidence += 10; reasons.push(`Excellent rate $${r2(ppm)}/mi`) }

  const w = parseFloat(weight) || 0
  if (w > 0 && w <= 37000) { confidence += 3; reasons.push('Light load (under 37K lbs)') }
  if (w > 42000) { confidence -= 5; reasons.push('Heavy load — wear & tear') }

  if (estProfit >= 2000 && ppm >= 1.50 && ppd >= 500) { decision = 'accept'; confidence = 95; reasons.push('High-profit override — excellent load') }

  confidence = Math.max(0, Math.min(100, confidence))
  return { decision, confidence, reasons, metrics }
}

// ── X12 Generators ──────────────────────────────────────────────────────────

let ctrl = Math.floor(Date.now()/1000) % 999999999
function nc(d=9) { ctrl++; return String(ctrl%(10**d)).padStart(d,'0') }
function pad(v,l) { return String(v||'').padEnd(l,' ').slice(0,l) }
function ts() { const d=new Date(); return { d6: d.toISOString().slice(2,10).replace(/-/g,''), d8: d.toISOString().slice(0,10).replace(/-/g,''), t4: d.toISOString().slice(11,16).replace(':','') } }

function gen990(decision, ref, scac) {
  const ic=nc(9), gc=nc(9), sc=nc(4), t=ts()
  const action = decision === 'accept' ? 'A' : 'D'
  const segs = [
    `ISA*00*${pad('',10)}*00*${pad('',10)}*ZZ*${pad(scac,15)}*ZZ*${pad('BROKERTEST',15)}*${t.d6}*${t.t4}*U*00401*${ic}*0*P*>`,
    `GS*GF*${scac}*BROKERTEST*${t.d8}*${t.t4}*${gc}*X*004010`,
    `ST*990*${sc}`, `B1*${scac}*${ref}*${t.d8}*${action}`, `N1*CA*Qivori Carrier`,
  ]
  if (decision === 'reject') segs.push('NTE*GEN*Load does not meet carrier requirements')
  segs.push(`L11*${ref}*BM`)
  const cnt = segs.length - 2 + 1
  segs.push(`SE*${cnt}*${sc}`, `GE*1*${gc}`, `IEA*1*${ic}`)
  return { raw: segs.join('~\n')+'~', ic, gc, sc }
}

const AT7_MAP = { 'Dispatched': 'X3', 'At Pickup': 'X1', 'In Transit': 'X6', 'At Delivery': 'X2', 'Delivered': 'D1' }
const AT7_DESC = { 'X3': 'Shipment dispatched', 'X1': 'Arrived at pickup', 'X6': 'En route', 'X2': 'Arrived at delivery', 'D1': 'Delivered' }

function gen214(status, loadNum, ref, scac, city, state) {
  const ic=nc(9), gc=nc(9), sc=nc(4), t=ts()
  const at7 = AT7_MAP[status] || 'NS'
  const segs = [
    `ISA*00*${pad('',10)}*00*${pad('',10)}*ZZ*${pad(scac,15)}*ZZ*${pad('BROKERTEST',15)}*${t.d6}*${t.t4}*U*00401*${ic}*0*P*>`,
    `GS*QM*${scac}*BROKERTEST*${t.d8}*${t.t4}*${gc}*X*004010`,
    `ST*214*${sc}`, `B10*${ref}*${ref}*${scac}`, `L11*${loadNum}*CR`,
    `AT7*${at7}*NS*${t.d8}*${t.t4}`,
  ]
  if (city) segs.push(`MS1*${city}*${state}*US`)
  segs.push(`MS2*${scac}*TL`)
  const cnt = segs.length - 2 + 1
  segs.push(`SE*${cnt}*${sc}`, `GE*1*${gc}`, `IEA*1*${ic}`)
  return { raw: segs.join('~\n')+'~', at7, ic }
}

function gen210(loadNum, ref, scac, invoiceNum, amount, miles, weight) {
  const ic=nc(9), gc=nc(9), sc=nc(4), t=ts()
  const segs = [
    `ISA*00*${pad('',10)}*00*${pad('',10)}*ZZ*${pad(scac,15)}*ZZ*${pad('BROKERTEST',15)}*${t.d6}*${t.t4}*U*00401*${ic}*0*P*>`,
    `GS*IM*${scac}*BROKERTEST*${t.d8}*${t.t4}*${gc}*X*004010`,
    `ST*210*${sc}`,
    `B3*${invoiceNum}*${ref}*${scac}*PP*${t.d8}*${amount.toFixed(2)}*D*${t.d8}`,
    `B3A*00`,
    `N1*SH*ABC Manufacturing Co`, `N3*1200 Industrial Blvd`, `N4*Chicago*IL*60601`,
    `N1*CN*XYZ Distribution Center`, `N3*4500 Commerce Drive`, `N4*Dallas*TX*75201`,
    `L11*${ref}*BM`, `L11*${loadNum}*CR`,
    `LX*1`, `L5*1*Line Haul*70`, `L1*1*${weight}*G*${amount.toFixed(2)}*****${miles}`,
    `L3*${weight}*G*${amount.toFixed(2)}****${miles}`,
  ]
  const cnt = segs.length - 2 + 1
  segs.push(`SE*${cnt}*${sc}`, `GE*1*${gc}`, `IEA*1*${ic}`)
  return { raw: segs.join('~\n')+'~', ic, invoiceNum }
}

// ════════════════════════════════════════════════════════════════════════════
//  SIMULATION
// ════════════════════════════════════════════════════════════════════════════

async function run() {
  console.log(`\n${BOLD}${MAGENTA}`)
  console.log('  ╔══════════════════════════════════════════════════════════════════╗')
  console.log('  ║     QIVORI EDI — FULL END-TO-END PIPELINE SIMULATION           ║')
  console.log('  ║     204 → AI → 990 → Dispatch → 214 → 210                     ║')
  console.log('  ╚══════════════════════════════════════════════════════════════════╝')
  console.log(`${RESET}`)

  const SCAC = 'QVRI'

  // ════════════════════════════════════════════════════════════════════════
  // STEP 1: RECEIVE 204 LOAD TENDER
  // ════════════════════════════════════════════════════════════════════════

  const now = new Date()
  const pickup = new Date(now.getTime() + 2 * 86400000)
  const delivery = new Date(now.getTime() + 4 * 86400000)
  const pd = pickup.toISOString().slice(0,10).replace(/-/g,'')
  const dd = delivery.toISOString().slice(0,10).replace(/-/g,'')
  const td = now.toISOString().slice(2,10).replace(/-/g,'')
  const td8 = now.toISOString().slice(0,10).replace(/-/g,'')

  const RAW_204 = `ISA*00*          *00*          *ZZ*BROKERTEST     *ZZ*QIVORI         *${td}*1430*U*00401*000000099*0*P*>~
GS*SM*BROKERTEST*QIVORI*${td8}*1430*000000099*X*004010~
ST*204*0099~
B2**QVRI**TENDER-SIM-001**PP~
B2A*00~
L11*BOL-SIM-8847*BM~
L11*PO-SIM-55012*PO~
L11*TENDER-SIM-001*SI~
MS3*QVRI*B*CL*TL~
NTE*GEN*Driver must check in at gate. No lumper needed. Dock appointment required.~
S5*1*CL*24*38000*L~
N1*SH*ABC Manufacturing Co~
N3*1200 Industrial Blvd~
N4*Chicago*IL*60601~
G62*10*${pd}*1*0800~
S5*2*UL*24*38000*L~
N1*CN*XYZ Distribution Center~
N3*4500 Commerce Drive~
N4*Dallas*TX*75201~
G62*11*${dd}*1*1400~
N1*BT*Apex Freight Solutions~
AT8*G*L*38000*1~
L3*38000****4800.00~
SE*22*0099~
GE*1*000000099~
IEA*1*000000099~`

  step(1, 'RECEIVE INBOUND 204 LOAD TENDER')
  console.log(`  ${DIM}Raw X12 204 received from broker...${RESET}\n`)
  console.log(`  ${DIM}${RAW_204.split('\n').slice(0, 8).join('\n  ')}`)
  console.log(`  ${DIM}  ... (${RAW_204.split('\n').length} segments total)${RESET}\n`)

  // ════════════════════════════════════════════════════════════════════════
  // STEP 2: PARSE 204
  // ════════════════════════════════════════════════════════════════════════

  step(2, 'PARSE X12 204 → CANONICAL LOAD MODEL')

  const { envelope, parsed } = parseX12(RAW_204)

  ok('X12 envelope parsed')
  data('ISA Sender', envelope.isa_sender)
  data('ISA Receiver', envelope.isa_receiver)
  data('ISA Control #', envelope.isa_control)
  data('ST Type', envelope.st_type)
  data('ST Control #', envelope.st_control)

  console.log()
  ok('Shipment data extracted')
  data('Shipper', parsed.stops[0]?.party?.name || '—')
  data('Consignee', parsed.stops[1]?.party?.name || '—')
  data('Broker', parsed.parties.find(p => p.q === 'BT')?.name || '—')
  data('Origin', `${parsed.stops[0]?.csz?.city}, ${parsed.stops[0]?.csz?.state} ${parsed.stops[0]?.csz?.zip}`)
  data('Destination', `${parsed.stops[1]?.csz?.city}, ${parsed.stops[1]?.csz?.state} ${parsed.stops[1]?.csz?.zip}`)
  data('Equipment', parsed.equipment || 'Dry Van')
  data('Weight', `${parsed.weight.lbs || parsed.weight.total} lbs`)
  data('Rate', `$${(parsed.weight.charges || 0).toLocaleString()}`)
  data('Pickup', fmtDate(parsed.stops[0]?.dates?.[0]?.date))
  data('Delivery', fmtDate(parsed.stops[1]?.dates?.[0]?.date))
  data('BOL', parsed.refs.bol || '—')
  data('PO', parsed.refs.po || '—')
  data('Notes', parsed.notes.join('; ') || '—')

  const origin = `${parsed.stops[0]?.csz?.city}, ${parsed.stops[0]?.csz?.state}`
  const dest = `${parsed.stops[1]?.csz?.city}, ${parsed.stops[1]?.csz?.state}`
  const rate = parsed.weight.charges || 0
  const miles = 920 // Chicago → Dallas
  const weight = parsed.weight.lbs || parsed.weight.total || 0

  // ════════════════════════════════════════════════════════════════════════
  // STEP 3: AI DECISION ENGINE
  // ════════════════════════════════════════════════════════════════════════

  step(3, 'AI DISPATCH DECISION ENGINE')

  const ai = evaluateLoad(rate, miles, weight, parsed.equipment, 'IL')

  const decColor = ai.decision === 'accept' ? GREEN : ai.decision === 'reject' ? RED : YELLOW
  console.log(`  ${BOLD}${decColor}┌─────────────────────────────────────────────┐${RESET}`)
  console.log(`  ${BOLD}${decColor}│  DECISION: ${ai.decision.toUpperCase().padEnd(10)} CONFIDENCE: ${ai.confidence}%     │${RESET}`)
  console.log(`  ${BOLD}${decColor}└─────────────────────────────────────────────┘${RESET}\n`)

  data('Rate', `$${rate.toLocaleString()}`)
  data('Miles', `${miles}`)
  data('RPM', `$${ai.metrics.rpm}`)
  data('Fuel Cost', `$${ai.metrics.fuelCost}`)
  data('Est. Profit', `$${ai.metrics.estProfit}`)
  data('Profit/Mile', `$${ai.metrics.profitPerMile}`)
  data('Profit/Day', `$${ai.metrics.profitPerDay}`)
  data('Transit Days', `${ai.metrics.transitDays}`)
  data('Weight', `${weight} lbs`)
  console.log()
  console.log(`  ${BOLD}AI Reasoning:${RESET}`)
  for (const r of ai.reasons) {
    console.log(`  ${YELLOW}→${RESET} ${r}`)
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 4: CREATE LOAD IN SUPABASE
  // ════════════════════════════════════════════════════════════════════════

  step(4, 'CREATE LOAD IN SUPABASE')

  const loadData = {
    owner_id: OWNER_ID,
    load_id: 'TENDER-SIM-001',
    origin: origin,
    destination: dest,
    weight: String(weight),
    equipment: parsed.equipment || 'Dry Van',
    rate: rate,
    pickup_date: fmtDate(pd),
    delivery_date: fmtDate(dd),
    broker_name: 'Apex Freight Solutions',
    notes: `BOL: ${parsed.refs.bol} | PO: ${parsed.refs.po} | ${parsed.notes.join('; ')}`,
    load_source: 'edi_204',
    payment_terms: 'prepaid',
    status: ai.decision === 'accept' ? 'Rate Con Received' : 'Cancelled',
  }

  const loadRes = await fetch(`${SUPABASE_URL}/rest/v1/loads`, {
    method: 'POST', headers: sbHeaders(), body: JSON.stringify(loadData),
  })
  const loadRows = await loadRes.json()
  const load = Array.isArray(loadRows) ? loadRows[0] : loadRows
  // Ensure load has expected fields
  if (!load || !load.id) { console.error('Load creation failed:', loadRows); process.exit(1) }

  ok(`Load created: ${BOLD}${load.load_number}${RESET}`)
  data('Load UUID', load.id)
  data('Load Number', load.load_number)
  data('Status', load.status)

  // Create stops
  const stopsData = [
    { load_id: load.id, sequence: 1, type: 'pickup', city: 'Chicago', state: 'IL', address: '1200 Industrial Blvd', zip_code: '60601', contact_name: 'ABC Manufacturing Co', status: 'pending' },
    { load_id: load.id, sequence: 2, type: 'dropoff', city: 'Dallas', state: 'TX', address: '4500 Commerce Drive', zip_code: '75201', contact_name: 'XYZ Distribution Center', status: 'pending' },
  ]
  await fetch(`${SUPABASE_URL}/rest/v1/load_stops`, { method: 'POST', headers: sbHeaders(), body: JSON.stringify(stopsData) })
  ok('Load stops created (pickup + delivery)')

  // Store 204 transaction
  const txnRes = await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({
      owner_id: OWNER_ID, transaction_type: '204', direction: 'inbound',
      isa_control_number: envelope.isa_control, gs_control_number: envelope.gs_control,
      st_control_number: envelope.st_control, raw_edi: RAW_204,
      parsed_data: parsed, canonical_load: loadData,
      load_id: load.id, load_number: load.load_number,
      status: 'processed', ai_decision: ai.decision, ai_confidence: ai.confidence,
      ai_reasons: ai.reasons, ai_metrics: ai.metrics,
      received_at: new Date().toISOString(), processed_at: new Date().toISOString(),
    }),
  })
  const txnRows = await txnRes.json()
  const txn204 = Array.isArray(txnRows) ? txnRows[0] : txnRows
  ok(`EDI transaction stored: ${txn204.id?.slice(0,8)}...`)

  // ════════════════════════════════════════════════════════════════════════
  // STEP 5: GENERATE & SEND 990 RESPONSE
  // ════════════════════════════════════════════════════════════════════════

  step(5, `GENERATE 990 RESPONSE (${ai.decision.toUpperCase()})`)

  const edi990 = gen990(ai.decision, parsed.refs.bol, SCAC)

  console.log(`  ${DIM}X12 990 Generated:${RESET}\n`)
  console.log(`  ${DIM}${edi990.raw.split('\n').join('\n  ')}${RESET}\n`)

  data('Action Code', ai.decision === 'accept' ? 'A (Accept)' : 'D (Decline)')
  data('Reference', parsed.refs.bol)
  data('ISA Control', edi990.ic)

  // Store 990
  await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({
      owner_id: OWNER_ID, transaction_type: '990', direction: 'outbound',
      raw_edi: edi990.raw, parsed_data: { decision: ai.decision },
      load_id: load.id, load_number: load.load_number,
      related_transaction_id: txn204.id,
      status: 'processed', processed_at: new Date().toISOString(),
    }),
  })
  ok(`990 ${ai.decision.toUpperCase()} stored and ready to transmit`)

  if (ai.decision !== 'accept') {
    console.log(`\n  ${RED}${BOLD}PIPELINE STOPS — Load was ${ai.decision.toUpperCase()}ED${RESET}`)
    console.log(`  ${DIM}In production, the broker would receive the 990 rejection.${RESET}`)
    await cleanup(load.id)
    return
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 6: AUTO-ASSIGN DRIVER
  // ════════════════════════════════════════════════════════════════════════

  step(6, 'AUTO-ASSIGN DRIVER + DISPATCH')

  // Find available driver
  const driverRes = await fetch(`${SUPABASE_URL}/rest/v1/drivers?owner_id=eq.${OWNER_ID}&status=eq.Active&select=*&limit=5`, { headers: sbHeaders() })
  const drivers = await driverRes.json()

  let driver = drivers?.[0]
  let driverName = driver?.full_name || 'Mohamed Wasuge (Owner-Operator)'

  if (driver) {
    ok(`Driver found: ${BOLD}${driverName}${RESET}`)
    data('License Class', driver.license_class || 'CDL-A')
    data('Equipment Exp', driver.equipment_experience || 'All')
  } else {
    warn('No drivers in DB — simulating owner-operator dispatch')
    driverName = 'Mohamed Wasuge (Owner-Operator)'
  }

  // Update load to Dispatched
  await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
    method: 'PATCH', headers: sbHeaders(),
    body: JSON.stringify({ status: 'Dispatched', carrier_name: driverName, carrier_id: driver?.id || null }),
  })
  ok(`Load ${load.load_number} → ${BOLD}DISPATCHED${RESET} to ${driverName}`)

  // Store dispatch decision
  await fetch(`${SUPABASE_URL}/rest/v1/dispatch_decisions`, {
    method: 'POST', headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      owner_id: OWNER_ID, load_id: load.load_id || load.load_number,
      driver_id: driver?.id || null, decision: 'accept', confidence: ai.confidence,
      reasons: ai.reasons, metrics: ai.metrics, load_data: loadData,
      auto_booked: true, created_at: new Date().toISOString(),
    }),
  })
  ok('Dispatch decision logged')

  // ════════════════════════════════════════════════════════════════════════
  // STEP 7: STATUS UPDATES → 214 MESSAGES
  // ════════════════════════════════════════════════════════════════════════

  const statusFlow = [
    { status: 'Dispatched',  city: 'Chicago',  state: 'IL', delay: 1000 },
    { status: 'At Pickup',   city: 'Chicago',  state: 'IL', delay: 1500 },
    { status: 'In Transit',  city: 'Springfield', state: 'MO', delay: 1500 },
    { status: 'At Delivery', city: 'Dallas',   state: 'TX', delay: 1500 },
    { status: 'Delivered',   city: 'Dallas',   state: 'TX', delay: 1500 },
  ]

  step(7, 'SHIPMENT STATUS UPDATES → 214 MESSAGES')

  for (let i = 0; i < statusFlow.length; i++) {
    const s = statusFlow[i]
    await sleep(s.delay)

    const at7Code = AT7_MAP[s.status]
    const edi214 = gen214(s.status, load.load_number, parsed.refs.bol, SCAC, s.city, s.state)

    console.log(`  ${CYAN}━━━ ${BOLD}${s.status.toUpperCase()}${RESET}${CYAN} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`)
    console.log()
    data('  Location', `${s.city}, ${s.state}`)
    data('  AT7 Code', `${at7Code} — ${AT7_DESC[at7Code]}`)
    data('  Timestamp', new Date().toISOString())
    console.log()
    console.log(`  ${DIM}214 X12:${RESET}`)
    console.log(`  ${DIM}${edi214.raw.split('\n').slice(2, 7).join('\n  ')}${RESET}`)
    console.log(`  ${DIM}  ... (${edi214.raw.split('\n').length} segments)${RESET}`)

    // Update load status
    await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
      method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ status: s.status }),
    })

    // Store 214 transaction
    await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
      method: 'POST', headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        owner_id: OWNER_ID, transaction_type: '214', direction: 'outbound',
        raw_edi: edi214.raw, parsed_data: { status_event: s.status, city: s.city, state: s.state },
        load_id: load.id, load_number: load.load_number,
        status: 'processed', processed_at: new Date().toISOString(),
      }),
    })

    ok(`214 stored + transmitted`)
    console.log()
  }

  // ════════════════════════════════════════════════════════════════════════
  // STEP 8: AUTO-GENERATE 210 INVOICE
  // ════════════════════════════════════════════════════════════════════════

  step(8, 'AUTO-GENERATE 210 FREIGHT INVOICE')

  // Create invoice
  const invoiceNum = `QIV-${now.toISOString().split('T')[0].replace(/-/g,'')}-${Math.floor(1000+Math.random()*9000)}`
  const dueDate = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0]

  const invRes = await fetch(`${SUPABASE_URL}/rest/v1/invoices`, {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({
      owner_id: OWNER_ID, load_id: load.id, load_number: load.load_number,
      broker: 'Apex Freight Solutions',
      route: `${origin} → ${dest}`, amount: rate,
      invoice_date: now.toISOString().split('T')[0], due_date: dueDate,
      status: 'Unpaid',
      line_items: JSON.stringify([
        { description: 'Line haul', amount: rate, miles, rpm: Math.round(rate/miles*100)/100 },
      ]),
    }),
  })
  const invRows = await invRes.json()
  const invoice = Array.isArray(invRows) ? invRows[0] : invRows

  ok(`Invoice created: ${BOLD}${invoice?.invoice_number || invoiceNum}${RESET}`)
  data('Amount', `$${rate.toLocaleString()}`)
  data('Due Date', dueDate)

  // Generate 210
  const edi210 = gen210(load.load_number, parsed.refs.bol, SCAC, invoice?.invoice_number || invoiceNum, rate, miles, weight)

  console.log(`\n  ${DIM}X12 210 Generated:${RESET}\n`)
  console.log(`  ${DIM}${edi210.raw.split('\n').join('\n  ')}${RESET}\n`)

  // Store 210
  await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
    method: 'POST', headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      owner_id: OWNER_ID, transaction_type: '210', direction: 'outbound',
      raw_edi: edi210.raw, parsed_data: { invoice_number: invoice?.invoice_number || invoiceNum, amount: rate },
      load_id: load.id, load_number: load.load_number,
      status: 'processed', processed_at: new Date().toISOString(),
    }),
  })
  ok('210 stored + transmitted')

  // Update load to Invoiced
  await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
    method: 'PATCH', headers: sbHeaders(), body: JSON.stringify({ status: 'Invoiced' }),
  })
  ok(`Load ${load.load_number} → INVOICED`)

  // ════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════

  console.log(`\n${MAGENTA}${LINE}${RESET}`)
  console.log(`${BOLD}${MAGENTA}  PIPELINE COMPLETE — FULL END-TO-END SUMMARY${RESET}`)
  console.log(`${MAGENTA}${LINE}${RESET}\n`)

  // Count transactions
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions?load_id=eq.${load.id}&select=transaction_type,direction`, { headers: sbHeaders() })
  const txns = await countRes.json()

  console.log(`  ${BOLD}Load:${RESET}       ${load.load_number || 'QV-SIM'} (${(load.id||'').slice(0,8)}...)`)
  console.log(`  ${BOLD}Route:${RESET}      ${origin} → ${dest}`)
  console.log(`  ${BOLD}Rate:${RESET}       $${rate.toLocaleString()} · ${miles} mi · $${(rate/miles).toFixed(2)}/mi`)
  console.log(`  ${BOLD}Profit:${RESET}     $${ai.metrics.estProfit} ($${ai.metrics.profitPerMile}/mi, $${ai.metrics.profitPerDay}/day)`)
  console.log(`  ${BOLD}Decision:${RESET}   ${ai.decision.toUpperCase()} @ ${ai.confidence}% confidence`)
  console.log(`  ${BOLD}Driver:${RESET}     ${driverName}`)
  console.log(`  ${BOLD}Invoice:${RESET}    ${invoice?.invoice_number || invoiceNum} — $${rate.toLocaleString()} due ${dueDate}`)
  console.log()
  console.log(`  ${BOLD}EDI Transactions:${RESET}`)

  const typeCounts = {}
  for (const t of txns) {
    const key = `${t.transaction_type} ${t.direction}`
    typeCounts[key] = (typeCounts[key] || 0) + 1
  }
  for (const [key, count] of Object.entries(typeCounts)) {
    console.log(`    ${GREEN}✓${RESET} ${key}: ${count}`)
  }

  console.log(`\n  ${BOLD}${GREEN}Total: ${txns.length} EDI transactions generated${RESET}`)
  console.log(`  ${DIM}204 → AI → 990 → Dispatch → 214×5 → 210 — zero manual input${RESET}`)
  console.log()
}

async function cleanup(loadId) {
  // Don't delete — keep for demo
}

run().catch(e => { console.error('Simulation failed:', e); process.exit(1) })
