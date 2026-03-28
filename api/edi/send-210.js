/**
 * POST /api/edi/send-210
 * Generate and send outbound 210 Motor Carrier Freight Invoice.
 * Triggered by: delivery (via send-214), or manual send.
 *
 * Body: { load_id, fuel_surcharge?, accessorials?: [{ description, amount }] }
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

let ctrlSeq = Math.floor(Date.now() / 1000) % 999999999
function nextCtrl(d = 9) { ctrlSeq = (ctrlSeq + 1) % (10 ** d); return String(ctrlSeq).padStart(d, '0') }
function pad(v, l) { return String(v||'').padEnd(l,' ').slice(0,l) }

function generate210(load, invoice, scac, partner, accessorials, fuelSurcharge) {
  const ic = nextCtrl(9), gc = nextCtrl(9), sc = nextCtrl(4)
  const sid = scac || 'QIVORI', rid = partner?.isa_id || 'PARTNER'
  const ts = new Date()
  const d6 = ts.toISOString().slice(2,10).replace(/-/g,'')
  const d8 = ts.toISOString().slice(0,10).replace(/-/g,'')
  const t4 = ts.toISOString().slice(11,16).replace(':','')

  const invoiceNum = invoice?.invoice_number || load.load_number || `QIV-${Date.now()}`
  const totalAmount = parseFloat(invoice?.amount) || parseFloat(load.rate) || parseFloat(load.gross_pay) || 0
  const ref = load.load_id || load.load_number || ''

  const segs = [
    `ISA*00*${pad('',10)}*00*${pad('',10)}*ZZ*${pad(sid,15)}*ZZ*${pad(rid,15)}*${d6}*${t4}*U*00401*${ic}*0*P*>`,
    `GS*IM*${partner?.gs_id||sid}*${partner?.gs_id||rid}*${d8}*${t4}*${gc}*X*004010`,
    `ST*210*${sc}`,
    `B3*${invoiceNum}*${ref}*${scac||''}*PP*${d8}*${totalAmount.toFixed(2)}*D*${d8}`,
    `B3A*00`,
  ]

  // Shipper/broker
  if (load.broker_name || load.shipper_name) {
    segs.push(`N1*SH*${load.shipper_name || load.broker_name}`)
    if (load.origin_address) segs.push(`N3*${load.origin_address}`)
    const originParts = (load.origin || '').split(',')
    const oCity = originParts[0]?.trim() || ''
    const oState = originParts[1]?.trim() || ''
    if (oCity) segs.push(`N4*${oCity}*${oState}*${load.origin_zip || ''}`)
  }

  // Consignee
  const destParts = (load.destination || '').split(',')
  const dCity = destParts[0]?.trim() || ''
  const dState = destParts[1]?.trim() || ''
  if (dCity) {
    segs.push(`N1*CN*Consignee`)
    if (load.destination_address) segs.push(`N3*${load.destination_address}`)
    segs.push(`N4*${dCity}*${dState}*${load.destination_zip || ''}`)
  }

  // References
  if (load.reference_number) segs.push(`L11*${load.reference_number}*BM`)
  if (load.po_number) segs.push(`L11*${load.po_number}*PO`)
  if (load.load_number) segs.push(`L11*${load.load_number}*CR`)

  // LX — Line haul
  let lineSeq = 0
  lineSeq++
  segs.push(`LX*${lineSeq}`)
  segs.push(`L5*${lineSeq}*Line Haul*70`)
  segs.push(`L1*${lineSeq}*${load.weight||0}*G*${totalAmount.toFixed(2)}*****${load.miles||0}`)

  // Fuel surcharge
  const fuel = parseFloat(fuelSurcharge) || parseFloat(load.fuel_estimate) || 0
  if (fuel > 0) {
    lineSeq++
    segs.push(`LX*${lineSeq}`)
    segs.push(`L5*${lineSeq}*Fuel Surcharge*0`)
    segs.push(`L1*${lineSeq}*0*G*${fuel.toFixed(2)}`)
  }

  // Accessorials
  if (accessorials?.length) {
    for (const acc of accessorials) {
      lineSeq++
      segs.push(`LX*${lineSeq}`)
      segs.push(`L5*${lineSeq}*${acc.description || 'Accessorial'}*0`)
      segs.push(`L1*${lineSeq}*0*G*${(parseFloat(acc.amount)||0).toFixed(2)}`)
    }
  }

  // L3 — Totals
  const weight = parseFloat(load.weight) || 0
  segs.push(`L3*${weight.toFixed(0)}*G*${totalAmount.toFixed(2)}****${load.miles||0}`)

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
    const { load_id, fuel_surcharge, accessorials } = await req.json()

    if (!load_id) {
      return Response.json({ error: 'Missing load_id' }, { status: 400, headers: corsHeaders(req) })
    }

    // Fetch load
    let load = null
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

    if (!load) {
      return Response.json({ error: 'Load not found' }, { status: 404, headers: corsHeaders(req) })
    }

    // Get or create invoice
    let invoice = null
    const invRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invoices?owner_id=eq.${user.id}&load_id=eq.${load.id}&select=*&limit=1`,
      { headers: sbHeaders() }
    )
    if (invRes.ok) {
      const invs = await invRes.json()
      if (invs.length > 0) {
        invoice = invs[0]
      }
    }

    // Create invoice if doesn't exist
    if (!invoice) {
      const amount = parseFloat(load.rate) || parseFloat(load.gross_pay) || 0
      const invCreateRes = await fetch(`${SUPABASE_URL}/rest/v1/invoices`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({
          owner_id: user.id,
          load_id: load.id,
          load_number: load.load_number,
          broker: load.broker_name || load.broker || '',
          driver_name: load.driver_name || load.carrier_name || '',
          route: `${load.origin} → ${load.destination}`,
          amount: amount,
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          status: 'Unpaid',
          line_items: JSON.stringify([
            { description: 'Line haul', amount, miles: load.miles, rpm: load.miles > 0 ? Math.round(amount / load.miles * 100) / 100 : 0 },
            ...(fuel_surcharge ? [{ description: 'Fuel surcharge', amount: parseFloat(fuel_surcharge) }] : []),
            ...(accessorials || []),
          ]),
        }),
      })
      if (invCreateRes.ok) {
        const rows = await invCreateRes.json()
        invoice = Array.isArray(rows) ? rows[0] : rows
      }
    }

    // Update load to Invoiced
    await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ status: 'Invoiced' }),
    })

    // Get SCAC
    let scac = 'QVRI'
    try {
      const sr = await fetch(`${SUPABASE_URL}/rest/v1/carrier_settings?owner_id=eq.${user.id}&select=scac&limit=1`, { headers: sbHeaders() })
      if (sr.ok) { const rows = await sr.json(); if (rows[0]?.scac) scac = rows[0].scac }
    } catch {}

    // Get trading partner
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

    // Generate 210
    const edi210 = generate210(load, invoice, scac, partner, accessorials, fuel_surcharge)

    // Store outbound 210 transaction
    await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        owner_id: user.id,
        transaction_type: '210',
        direction: 'outbound',
        trading_partner_id: partner?.id || null,
        raw_edi: edi210,
        parsed_data: { invoice_number: invoice?.invoice_number, amount: invoice?.amount || load.rate },
        canonical_load: { load_number: load.load_number, origin: load.origin, destination: load.destination, rate: load.rate },
        load_id: load.id,
        load_number: load.load_number,
        status: 'processed',
        processed_at: new Date().toISOString(),
      }),
    })

    // Send to partner webhook
    let sent = false
    if (partner?.api_endpoint && partner?.send_210 !== false) {
      try {
        const sendRes = await fetch(partner.api_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-edi', ...(partner.api_key ? { 'X-API-Key': partner.api_key } : {}) },
          body: edi210,
        })
        sent = sendRes.ok
      } catch {}
    }

    return Response.json({
      success: true,
      edi_210: edi210,
      invoice_id: invoice?.id || null,
      invoice_number: invoice?.invoice_number || null,
      load_id: load.id,
      load_number: load.load_number,
      amount: invoice?.amount || load.rate,
      partner_notified: sent,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
