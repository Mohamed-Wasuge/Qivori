/**
 * POST /api/edi/send-214
 * Send outbound 214 Shipment Status Message.
 * Triggered by: dispatch events, mobile status updates, or manual send.
 *
 * Body: { load_id, status_event, location?: { city, state, zip }, timestamp? }
 *
 * Status events: 'Dispatched', 'At Pickup', 'In Transit', 'At Delivery', 'Delivered', 'Cancelled'
 */
import { handleCors, corsHeaders, verifyAuth } from '../_lib/auth.js'

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

const STATUS_AT7 = {
  'Dispatched': { code: 'X3', desc: 'Shipment dispatched' },
  'At Pickup': { code: 'X1', desc: 'Arrived at pickup' },
  'In Transit': { code: 'X6', desc: 'En route to delivery' },
  'At Delivery': { code: 'X2', desc: 'Arrived at delivery' },
  'Delivered': { code: 'D1', desc: 'Delivered' },
  'Cancelled': { code: 'X5', desc: 'Shipment cancelled' },
}

let ctrlSeq = Math.floor(Date.now() / 1000) % 999999999
function nextCtrl(d = 9) { ctrlSeq = (ctrlSeq + 1) % (10 ** d); return String(ctrlSeq).padStart(d, '0') }
function pad(v, l) { return String(v||'').padEnd(l,' ').slice(0,l) }

function generate214(load, statusEvent, scac, partner, location, timestamp) {
  const ic = nextCtrl(9), gc = nextCtrl(9), sc = nextCtrl(4)
  const sid = scac || 'QIVORI', rid = partner?.isa_id || 'PARTNER'
  const ts = timestamp ? new Date(timestamp) : new Date()
  const d6 = ts.toISOString().slice(2,10).replace(/-/g,'')
  const d8 = ts.toISOString().slice(0,10).replace(/-/g,'')
  const t4 = ts.toISOString().slice(11,16).replace(':','')

  const at7 = STATUS_AT7[statusEvent] || { code: 'NS', desc: 'Status update' }
  const ref = load.load_id || load.load_number || ''

  const segs = [
    `ISA*00*${pad('',10)}*00*${pad('',10)}*ZZ*${pad(sid,15)}*ZZ*${pad(rid,15)}*${d6}*${t4}*U*00401*${ic}*0*P*>`,
    `GS*QM*${partner?.gs_id||sid}*${partner?.gs_id||rid}*${d8}*${t4}*${gc}*X*004010`,
    `ST*214*${sc}`,
    `B10*${ref}*${load.reference_number||''}*${scac||''}`,
  ]

  if (load.reference_number) segs.push(`L11*${load.reference_number}*BM`)
  if (load.po_number) segs.push(`L11*${load.po_number}*PO`)
  if (load.load_number) segs.push(`L11*${load.load_number}*CR`)

  segs.push(`AT7*${at7.code}*NS*${d8}*${t4}`)

  // Location
  const loc = location || {}
  let city = loc.city || ''
  let state = loc.state || ''
  if (!city) {
    if (statusEvent === 'At Pickup' || statusEvent === 'Dispatched') {
      city = (load.origin || '').split(',')[0]?.trim() || ''
      state = (load.origin || '').split(',')[1]?.trim() || ''
    } else {
      city = (load.destination || '').split(',')[0]?.trim() || ''
      state = (load.destination || '').split(',')[1]?.trim() || ''
    }
  }
  if (city || state) segs.push(`MS1*${city}*${state}*US`)

  // Equipment
  segs.push(`MS2*${scac||''}*TL`)

  const cnt = segs.length - 2 + 1
  segs.push(`SE*${cnt}*${sc}`, `GE*1*${gc}`, `IEA*1*${ic}`)
  return segs.join('~\n') + '~'
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  try {
    const { load_id, status_event, location, timestamp } = await req.json()

    if (!status_event) {
      return Response.json({ error: 'Missing status_event' }, { status: 400, headers: corsHeaders(req) })
    }

    if (!STATUS_AT7[status_event]) {
      return Response.json({ error: `Invalid status: ${status_event}. Valid: ${Object.keys(STATUS_AT7).join(', ')}` }, { status: 400, headers: corsHeaders(req) })
    }

    // Fetch load
    let load = null
    if (load_id) {
      for (const field of ['id', 'load_number', 'load_id']) {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${user.id}&${field}=eq.${encodeURIComponent(load_id)}&select=*&limit=1`,
          { headers: sbHeaders() }
        )
        if (res.ok) {
          const rows = await res.json()
          if (rows.length > 0) { load = rows[0]; break }
        }
      }
    }

    if (!load) {
      return Response.json({ error: 'Load not found' }, { status: 404, headers: corsHeaders(req) })
    }

    // Update load status
    await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ status: status_event }),
    })

    // Get carrier SCAC
    let scac = 'QVRI'
    try {
      const sr = await fetch(`${SUPABASE_URL}/rest/v1/carrier_settings?owner_id=eq.${user.id}&select=scac&limit=1`, { headers: sbHeaders() })
      if (sr.ok) { const rows = await sr.json(); if (rows[0]?.scac) scac = rows[0].scac }
    } catch {}

    // Find trading partner from original 204
    let partner = null
    try {
      const txnRes = await fetch(
        `${SUPABASE_URL}/rest/v1/edi_transactions?owner_id=eq.${user.id}&load_id=eq.${load.id}&transaction_type=eq.204&direction=eq.inbound&select=trading_partner_id&order=created_at.desc&limit=1`,
        { headers: sbHeaders() }
      )
      if (txnRes.ok) {
        const txns = await txnRes.json()
        if (txns[0]?.trading_partner_id) {
          const pr = await fetch(`${SUPABASE_URL}/rest/v1/trading_partners?id=eq.${txns[0].trading_partner_id}&select=*&limit=1`, { headers: sbHeaders() })
          if (pr.ok) { const p = await pr.json(); if (p.length > 0) partner = p[0] }
        }
      }
    } catch {}

    // Generate 214
    const edi214 = generate214(load, status_event, scac, partner, location, timestamp)

    // Store outbound transaction
    await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        owner_id: user.id,
        transaction_type: '214',
        direction: 'outbound',
        trading_partner_id: partner?.id || null,
        raw_edi: edi214,
        parsed_data: { status_event, location, timestamp: timestamp || new Date().toISOString() },
        canonical_load: { load_number: load.load_number, origin: load.origin, destination: load.destination, status: status_event },
        load_id: load.id,
        load_number: load.load_number,
        status: 'processed',
        processed_at: new Date().toISOString(),
      }),
    })

    // Send to partner webhook
    let sent = false
    if (partner?.api_endpoint && partner?.send_214 !== false) {
      try {
        const sendRes = await fetch(partner.api_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-edi', ...(partner.api_key ? { 'X-API-Key': partner.api_key } : {}) },
          body: edi214,
        })
        sent = sendRes.ok
      } catch {}
    }

    // If delivered, auto-trigger 210 invoice
    let autoInvoice = null
    if (status_event === 'Delivered') {
      try {
        const invoiceRes = await fetch(`${new URL(req.url).origin}/api/edi/send-210`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('authorization'),
          },
          body: JSON.stringify({ load_id: load.id }),
        })
        if (invoiceRes.ok) {
          autoInvoice = await invoiceRes.json()
        }
      } catch {}
    }

    return Response.json({
      success: true,
      status_event,
      edi_214: edi214,
      load_id: load.id,
      load_number: load.load_number,
      partner_notified: sent,
      auto_invoice: autoInvoice?.success ? autoInvoice : null,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
