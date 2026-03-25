// api/auto-book.js — Autonomous load booking: create load, assign driver, invoice, log
// Called when dispatch engine decision = auto_book
import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

// Generate unique load ID
function genLoadId() {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `QB-${ts}-${rand}`
}

// Generate invoice number
function genInvoiceNumber() {
  const d = new Date()
  const ymd = d.toISOString().split('T')[0].replace(/-/g, '')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `QIV-${ymd}-${rand}`
}

// Find best available driver
async function findBestDriver(ownerId, equipment, originState) {
  try {
    // Get all active drivers
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/drivers?owner_id=eq.${ownerId}&status=eq.Active&select=*`,
      { headers: sbHeaders() }
    )
    if (!res.ok) return null
    const drivers = await res.json()
    if (!drivers?.length) return null

    // Get loads currently assigned (not delivered/paid)
    const loadRes = await fetch(
      `${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${ownerId}&status=not.in.(Delivered,Invoiced,Paid,Cancelled)&select=carrier_name`,
      { headers: sbHeaders() }
    )
    const activeLoads = loadRes.ok ? await loadRes.json() : []
    const busyDriverNames = new Set(activeLoads.map(l => l.carrier_name).filter(Boolean))

    // Score drivers: prefer idle, equipment match, CDL-A
    const scored = drivers.map(d => {
      let score = 50
      const name = d.full_name || ''
      if (busyDriverNames.has(name)) score -= 40 // busy = deprioritize
      else score += 30 // idle = prefer

      // Equipment match
      const exp = (d.equipment_experience || '').toLowerCase()
      const equip = (equipment || '').toLowerCase()
      if (exp.includes(equip) || exp.includes('all')) score += 15

      // CDL-A preferred
      if ((d.license_class || '').includes('A')) score += 10

      return { ...d, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored[0] || null
  } catch {
    return null
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json()
    const { load, decision_id, driver_type, metrics } = body

    if (!load) {
      return Response.json({ error: 'Missing load data' }, { status: 400, headers: corsHeaders(req) })
    }

    const timeline = []
    const loadId = genLoadId()
    const now = new Date()

    // ── STEP 1: Find best driver ────────────────────────────────────
    timeline.push({ step: 'driver_search', time: now.toISOString(), detail: 'Searching for available driver...' })

    const originState = (load.origin || '').split(',').pop()?.trim() || ''
    const driver = await findBestDriver(user.id, load.equipment, originState)
    const driverName = driver?.full_name || null
    const driverAssigned = !!driverName

    timeline.push({
      step: 'driver_assigned',
      time: new Date().toISOString(),
      detail: driverAssigned
        ? `Assigned to ${driverName} — ${driver.license_class || 'CDL-A'} · ${driver.license_state || '??'} · ${driver.driver_type === 'owner_operator' ? 'O/O' : 'Company'} · ${driver.equipment_experience || 'General'}`
        : 'No available driver — load booked unassigned',
    })

    // ── STEP 2: Create load record ──────────────────────────────────
    const loadRecord = {
      owner_id: user.id,
      load_id: loadId,
      origin: load.origin || '',
      destination: load.dest || load.destination || '',
      rate: parseFloat(load.gross) || 0,
      miles: parseInt(load.miles) || null,
      weight: load.weight ? parseInt(load.weight) : null,
      equipment: load.equipment || 'Dry Van',
      broker_name: load.broker || '',
      broker_phone: load.broker_phone || null,
      carrier_name: driverName,
      driver_id: driver?.id || null,
      status: driverAssigned ? 'Dispatched' : 'Rate Con Received',
      pickup_date: load.pickup_date || null,
      delivery_date: load.delivery_date || null,
      load_type: 'FTL',
      load_source: 'ai_auto_book',
      notes: `Auto-booked by Q AI (${(metrics?.confidence || 0)}% confidence). Est. profit: $${(metrics?.estProfit || 0).toLocaleString()}`,
    }

    const loadRes = await fetch(`${SUPABASE_URL}/rest/v1/loads`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify(loadRecord),
    })
    let loadRows, loadError
    if (!loadRes.ok) {
      loadError = await loadRes.text()
      timeline.push({ step: 'load_error', time: new Date().toISOString(), detail: `Load insert failed: ${loadError}` })
    } else {
      loadRows = await loadRes.json()
    }
    const createdLoad = loadRows?.[0]
    const dbLoadId = createdLoad?.id

    timeline.push({
      step: 'load_created',
      time: new Date().toISOString(),
      detail: dbLoadId
        ? `Load ${loadId} created — ${load.origin} → ${load.dest || load.destination} — $${parseFloat(load.gross).toLocaleString()} — ${driverAssigned ? `Dispatched to ${driverName}` : 'Queued (unassigned)'}`
        : `Load creation failed — continuing with invoice and logging`,
    })

    // ── STEP 2b: Update driver with current load assignment ─────────
    if (driverAssigned && driver?.id) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/drivers?id=eq.${driver.id}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ current_load_id: dbLoadId }),
        }
      ).catch(() => {})

      timeline.push({
        step: 'driver_updated',
        time: new Date().toISOString(),
        detail: `${driverName} marked as assigned — ${driver.equipment_experience || 'CDL-A'} · ${driver.years_experience || '?'} yrs experience`,
      })
    }

    // ── STEP 3: Create invoice ──────────────────────────────────────
    // Pre-create invoice (status: Pending — will flip to Unpaid on delivery)
    const invoiceNumber = genInvoiceNumber()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + 30)

    const originShort = (load.origin || '').split(',')[0].substring(0, 3).toUpperCase()
    const destShort = (load.dest || load.destination || '').split(',')[0].substring(0, 3).toUpperCase()

    const invoiceRecord = {
      owner_id: user.id,
      invoice_number: invoiceNumber,
      load_id: dbLoadId || null,
      load_number: loadId,
      broker: load.broker || '',
      route: `${originShort} → ${destShort}`,
      amount: parseFloat(load.gross) || 0,
      invoice_date: now.toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0],
      status: 'Pending',
      driver_name: driverName || '',
      notes: `Auto-generated by Q AI auto-book. Will activate on delivery.`,
    }

    const invRes = await fetch(`${SUPABASE_URL}/rest/v1/invoices`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify(invoiceRecord),
    })
    const invRows = await invRes.json()
    const createdInvoice = invRows?.[0]

    timeline.push({
      step: 'invoice_created',
      time: new Date().toISOString(),
      detail: `Invoice ${invoiceNumber} pre-created — $${parseFloat(load.gross).toLocaleString()} — due ${dueDate.toISOString().split('T')[0]}`,
    })

    // ── STEP 4: Link decision to load ───────────────────────────────
    if (decision_id) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/dispatch_decisions?id=eq.${decision_id}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            load_id: loadId,
            auto_booked: true,
          }),
        }
      ).catch(() => {})

      timeline.push({
        step: 'decision_linked',
        time: new Date().toISOString(),
        detail: `Dispatch decision ${decision_id} linked to load ${loadId}`,
      })
    }

    // ── STEP 5: Log auto-book event ─────────────────────────────────
    const autoBookLog = {
      owner_id: user.id,
      load_id: loadId,
      db_load_id: dbLoadId,
      driver_id: driver?.id || null,
      driver_name: driverName,
      decision_id: decision_id || null,
      invoice_number: invoiceNumber,
      load_data: load,
      metrics: metrics || {},
      driver_type: driver_type || 'owner_operator',
      timeline,
      created_at: now.toISOString(),
    }

    // Store in dispatch_decisions as a comprehensive record
    await fetch(`${SUPABASE_URL}/rest/v1/dispatch_decisions`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        owner_id: user.id,
        load_id: loadId,
        driver_id: driver?.id || null,
        driver_type: driver_type || 'owner_operator',
        decision: 'auto_book',
        confidence: metrics?.confidence || 95,
        reasons: [
          `AUTO-BOOKED: ${load.origin} → ${load.dest || load.destination}`,
          `Gross: $${parseFloat(load.gross).toLocaleString()} | Profit: $${(metrics?.estProfit || 0).toLocaleString()}`,
          driverAssigned ? `Assigned to ${driverName}` : 'Unassigned — no idle driver',
          `Invoice ${invoiceNumber} pre-created`,
        ],
        metrics: metrics || {},
        negotiation: null,
        load_data: load,
        auto_booked: true,
        created_at: now.toISOString(),
      }),
    }).catch(() => {})

    timeline.push({
      step: 'complete',
      time: new Date().toISOString(),
      detail: 'Auto-book execution complete',
    })

    return Response.json({
      ok: true,
      load_id: loadId,
      db_load_id: dbLoadId,
      driver: driverAssigned ? {
        id: driver.id,
        name: driverName,
        type: driver.driver_type,
        equipment: driver.equipment_experience,
        license: driver.license_class,
        state: driver.license_state,
        pay: driver.pay_model === 'permile' ? `$${driver.pay_rate}/mi` : `${driver.pay_rate}%`,
      } : null,
      invoice: { number: invoiceNumber, amount: parseFloat(load.gross) || 0, due: dueDate.toISOString().split('T')[0] },
      status: driverAssigned ? 'Dispatched' : 'Queued',
      timeline,
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message || 'Auto-book failed' }, { status: 500, headers: corsHeaders(req) })
  }
}
