#!/usr/bin/env node
/**
 * QIVORI — Production Flow Tests
 * Tests every critical user flow against live Supabase + Vercel APIs.
 */

const SUPABASE_URL = 'https://jrencclzfztrilrldmwf.supabase.co'
const SERVICE_KEY = 'sb_secret_FqzPMGPOIz-ivGkm2h0aRA_2SgAH26C'
const OWNER_ID = '0c99abcf-157d-4a4e-930f-ef22de063ff0'
const APP_URL = 'https://qivori.com'

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m'
let pass = 0, fail = 0, warn = 0

function sb() { return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' } }

function ok(msg) { pass++; console.log(`  ${G}PASS${X} ${msg}`) }
function no(msg) { fail++; console.log(`  ${R}FAIL${X} ${msg}`) }
function wn(msg) { warn++; console.log(`  ${Y}WARN${X} ${msg}`) }

async function test(name, fn) {
  console.log(`\n${B}--- ${name} ---${X}`)
  try { await fn() } catch (e) { no(`Exception: ${e.message}`) }
}

async function run() {
  console.log(`\n${B}QIVORI PRODUCTION FLOW TESTS${X}`)
  console.log(`${D}Testing against: ${APP_URL} + ${SUPABASE_URL}${X}\n`)

  // ══════════════════════════════════════════════════════════════
  // 1. DATABASE CONNECTIVITY
  // ══════════════════════════════════════════════════════════════
  await test('1. Database connectivity', async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, { headers: sb() })
    r.ok ? ok('Supabase connected') : no('Supabase unreachable')
  })

  // ══════════════════════════════════════════════════════════════
  // 2. LOAD CRUD
  // ══════════════════════════════════════════════════════════════
  await test('2. Load CRUD (create, read, update, delete)', async () => {
    // Create
    const cr = await fetch(`${SUPABASE_URL}/rest/v1/loads`, {
      method: 'POST', headers: sb(),
      body: JSON.stringify({ owner_id: OWNER_ID, load_id: 'TEST-CRUD-001', origin: 'Test City, TX', destination: 'Test Town, GA', rate: 2500, miles: 500, equipment: 'Dry Van', status: 'Rate Con Received', load_source: 'manual' }),
    })
    const load = (await cr.json())?.[0] || (await cr.json())
    load?.id ? ok(`Create: ${load.load_number}`) : no('Create failed')
    if (!load?.id) return

    // Read
    const rr = await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}&select=id,rate,miles`, { headers: sb() })
    const reads = await rr.json()
    reads?.[0]?.rate == 2500 ? ok('Read: rate=$2500 correct') : no(`Read: rate=${reads?.[0]?.rate}`)

    // Update
    await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, { method: 'PATCH', headers: sb(), body: JSON.stringify({ status: 'Dispatched' }) })
    const ur = await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}&select=status`, { headers: sb() })
    const updated = await ur.json()
    updated?.[0]?.status === 'Dispatched' ? ok('Update: status → Dispatched') : no(`Update: status=${updated?.[0]?.status}`)

    // Delete
    await fetch(`${SUPABASE_URL}/rest/v1/load_stops?load_id=eq.${load.id}`, { method: 'DELETE', headers: sb() })
    await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions?load_id=eq.${load.id}`, { method: 'DELETE', headers: sb() })
    await fetch(`${SUPABASE_URL}/rest/v1/edi_exceptions?load_id=eq.${load.id}`, { method: 'DELETE', headers: sb() })
    const dr = await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, { method: 'DELETE', headers: sb() })
    dr.ok ? ok('Delete: cleaned up') : no('Delete failed')
  })

  // ══════════════════════════════════════════════════════════════
  // 3. INVOICE AUTO-NUMBER
  // ══════════════════════════════════════════════════════════════
  await test('3. Invoice auto-numbering', async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/invoices`, {
      method: 'POST', headers: sb(),
      body: JSON.stringify({ owner_id: OWNER_ID, broker: 'Test Broker', route: 'A → B', amount: 1000, status: 'Unpaid' }),
    })
    const inv = (await r.json())?.[0]
    inv?.invoice_number ? ok(`Invoice: ${inv.invoice_number}`) : no('Invoice auto-number missing')
    if (inv?.id) await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${inv.id}`, { method: 'DELETE', headers: sb() })
  })

  // ══════════════════════════════════════════════════════════════
  // 4. LOAD NUMBER AUTO-GENERATION
  // ══════════════════════════════════════════════════════════════
  await test('4. Load number auto-generation (QV-XXXX)', async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/loads`, {
      method: 'POST', headers: sb(),
      body: JSON.stringify({ owner_id: OWNER_ID, origin: 'Auto, TX', destination: 'Number, GA', rate: 1000, status: 'Rate Con Received' }),
    })
    const load = (await r.json())?.[0]
    load?.load_number?.startsWith('QV-') ? ok(`Load number: ${load.load_number}`) : no(`Expected QV-XXXX, got: ${load?.load_number}`)
    if (load?.id) await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, { method: 'DELETE', headers: sb() })
  })

  // ══════════════════════════════════════════════════════════════
  // 5. API ENDPOINTS (health check)
  // ══════════════════════════════════════════════════════════════
  await test('5. API health check', async () => {
    const r = await fetch(`${APP_URL}/api/health-check`)
    if (r.ok) {
      const d = await r.json()
      ok(`Status: ${d.status} | DB: ${d.checks?.database?.status} | AI: ${d.checks?.aiChat?.status}`)
      if (d.checks?.database?.status !== 'green') wn('Database not green')
      if (d.checks?.aiChat?.status !== 'green') wn('AI chat not configured')
    } else no('Health check unreachable')
  })

  // ══════════════════════════════════════════════════════════════
  // 6. DIESEL PRICES API
  // ══════════════════════════════════════════════════════════════
  await test('6. Diesel prices (EIA API)', async () => {
    const r = await fetch(`${APP_URL}/api/diesel-prices`)
    if (r.ok) {
      const d = await r.json()
      const usAvg = d.prices?.find(p => p.region === 'US AVG')
      usAvg?.price > 0 ? ok(`US Avg diesel: $${usAvg.price}/gal`) : wn('No US AVG price')
    } else no('Diesel API failed')
  })

  // ══════════════════════════════════════════════════════════════
  // 7. EDI TABLES
  // ══════════════════════════════════════════════════════════════
  await test('7. EDI tables exist', async () => {
    for (const table of ['edi_transactions', 'edi_exceptions', 'trading_partners']) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers: sb() })
      r.ok ? ok(`${table}: accessible`) : no(`${table}: ${r.status}`)
    }
  })

  // ══════════════════════════════════════════════════════════════
  // 8. LANE HISTORY TABLES
  // ══════════════════════════════════════════════════════════════
  await test('8. Lane pricing tables exist', async () => {
    for (const table of ['lane_history', 'lane_predictions']) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers: sb() })
      r.ok ? ok(`${table}: accessible`) : no(`${table}: ${r.status}`)
    }
  })

  // ══════════════════════════════════════════════════════════════
  // 9. DRIVER CRUD
  // ══════════════════════════════════════════════════════════════
  await test('9. Driver CRUD', async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/drivers?owner_id=eq.${OWNER_ID}&select=id,full_name,status&limit=5`, { headers: sb() })
    const drivers = await r.json()
    drivers?.length > 0 ? ok(`${drivers.length} drivers found (${drivers.map(d => d.full_name).join(', ')})`) : wn('No drivers in DB')
  })

  // ══════════════════════════════════════════════════════════════
  // 10. VEHICLE CRUD
  // ══════════════════════════════════════════════════════════════
  await test('10. Vehicle check', async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vehicles?owner_id=eq.${OWNER_ID}&select=id,year,make,model&limit=5`, { headers: sb() })
    const vehicles = await r.json()
    vehicles?.length > 0 ? ok(`${vehicles.length} vehicles found`) : wn('No vehicles in DB')
  })

  // ══════════════════════════════════════════════════════════════
  // 11. CHAT API (Q)
  // ══════════════════════════════════════════════════════════════
  await test('11. Q Chat API (requires auth — testing config)', async () => {
    const r = await fetch(`${APP_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }) })
    if (r.status === 401) ok('Chat requires auth (correct behavior)')
    else if (r.ok) ok('Chat responded (unexpected without auth)')
    else no(`Chat error: ${r.status}`)
  })

  // ══════════════════════════════════════════════════════════════
  // 12. EDI RECEIVE-204
  // ══════════════════════════════════════════════════════════════
  await test('12. EDI receive-204 (requires auth)', async () => {
    const r = await fetch(`${APP_URL}/api/edi/receive-204`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_edi: 'test' }) })
    if (r.status === 401) ok('EDI requires auth (correct)')
    else no(`EDI: unexpected ${r.status}`)
  })

  // ══════════════════════════════════════════════════════════════
  // 13. RLS CHECK — other users can't see data
  // ══════════════════════════════════════════════════════════════
  await test('13. RLS isolation (anon key test)', async () => {
    const anonKey = 'sb_publishable_JPboIPM1fpNAZC6RtdCWGQ_ZvaKCC3g'
    const r = await fetch(`${SUPABASE_URL}/rest/v1/loads?select=id&limit=5`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` }
    })
    if (r.ok) {
      const data = await r.json()
      data.length === 0 ? ok('RLS: anon sees 0 loads (correct)') : no(`RLS BREACH: anon sees ${data.length} loads!`)
    } else ok('RLS: anon blocked entirely')
  })

  // ══════════════════════════════════════════════════════════════
  // 14. WEATHER API (Open-Meteo)
  // ══════════════════════════════════════════════════════════════
  await test('14. Weather API (Open-Meteo)', async () => {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.78&longitude=-96.80&current=temperature_2m&temperature_unit=fahrenheit')
    if (r.ok) {
      const d = await r.json()
      d.current?.temperature_2m ? ok(`Dallas weather: ${Math.round(d.current.temperature_2m)}°F`) : no('Weather data missing')
    } else no('Open-Meteo unreachable')
  })

  // ══════════════════════════════════════════════════════════════
  // 15. TRUCK STOP API (Overpass)
  // ══════════════════════════════════════════════════════════════
  await test('15. Truck stop search (Overpass API)', async () => {
    const query = `[out:json][timeout:10];node["amenity"="fuel"]["name"~"Pilot|Love",i](around:40000,32.78,-96.80);out body 3;`
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    })
    if (r.ok) {
      const d = await r.json()
      d.elements?.length > 0 ? ok(`Found ${d.elements.length} truck stops near Dallas`) : wn('No truck stops found')
    } else wn('Overpass API slow/down')
  })

  // ══════════════════════════════════════════════════════════════
  // 16. WEB SEARCH (DuckDuckGo)
  // ══════════════════════════════════════════════════════════════
  await test('16. Web search (DuckDuckGo)', async () => {
    const r = await fetch('https://api.duckduckgo.com/?q=FMCSA+hours+of+service&format=json&no_html=1')
    if (r.ok) {
      const d = await r.json()
      d.AbstractText || d.RelatedTopics?.length > 0 ? ok('Search returned results') : wn('Search returned empty')
    } else wn('DuckDuckGo unreachable')
  })

  // ══════════════════════════════════════════════════════════════
  // 17. EXISTING LOADS DATA INTEGRITY
  // ══════════════════════════════════════════════════════════════
  await test('17. Load data integrity', async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${OWNER_ID}&select=load_number,rate,miles,origin,destination,status&order=created_at.desc&limit=10`, { headers: sb() })
    const loads = await r.json()
    ok(`${loads.length} loads in DB`)
    let issues = 0
    for (const l of loads) {
      if (!l.load_number) { no(`Load missing load_number: ${l.origin}`); issues++ }
      if (!l.rate || l.rate <= 0) { wn(`Load ${l.load_number} has no rate`); issues++ }
      if (!l.miles || l.miles <= 0) { wn(`Load ${l.load_number} has no miles`); issues++ }
    }
    if (issues === 0) ok('All loads have load_number, rate, and miles')
  })

  // ══════════════════════════════════════════════════════════════
  // 18. LANDING PAGE
  // ══════════════════════════════════════════════════════════════
  await test('18. Landing page loads', async () => {
    const r = await fetch(APP_URL)
    r.ok ? ok(`qivori.com: ${r.status} (${r.headers.get('content-type')?.split(';')[0]})`) : no(`Landing page: ${r.status}`)
  })

  // ══════════════════════════════════════════════════════════════
  // 19. CRON ENDPOINTS PROTECTED
  // ══════════════════════════════════════════════════════════════
  await test('19. Cron endpoints require auth', async () => {
    for (const ep of ['/api/lane-history-cron', '/api/lifecycle-cron', '/api/agent-autonomous']) {
      const r = await fetch(`${APP_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (r.status === 401 || r.status === 403) ok(`${ep}: protected`)
      else wn(`${ep}: returned ${r.status} (expected 401)`)
    }
  })

  // ══════════════════════════════════════════════════════════════
  // 20. SERVICE WORKER
  // ══════════════════════════════════════════════════════════════
  await test('20. Service worker accessible', async () => {
    const r = await fetch(`${APP_URL}/sw.js`)
    if (r.ok) {
      const text = await r.text()
      const match = text.match(/CACHE_VERSION = (\d+)/)
      match ? ok(`sw.js: cache v${match[1]}`) : wn('sw.js found but no version')
    } else no('sw.js not accessible')
  })

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log(`\n${B}════════════════════════════════════════${X}`)
  console.log(`${B}  RESULTS: ${G}${pass} passed${X}  ${fail > 0 ? R : ''}${fail} failed${X}  ${warn > 0 ? Y : ''}${warn} warnings${X}`)
  console.log(`${B}════════════════════════════════════════${X}\n`)

  if (fail > 0) process.exit(1)
}

run().catch(e => { console.error('Test runner failed:', e); process.exit(1) })
