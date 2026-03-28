/**
 * POST /api/edi/status-webhook
 * Server-side webhook for load status changes.
 * Can be called by:
 * - Supabase database webhook on loads table UPDATE
 * - Mobile app status updates
 * - Cron job scanning for unprocessed status changes
 *
 * For Supabase webhook: Body = { type: 'UPDATE', record: {...}, old_record: {...} }
 * For manual/cron: Body = { load_id, new_status, old_status? }
 */
import { handleCors, corsHeaders } from '../_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Prefer': 'return=representation',
  }
}

const EDI_STATUSES = ['Dispatched', 'At Pickup', 'In Transit', 'At Delivery', 'Delivered']

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  // Auth: either user token or cron secret
  const authHeader = req.headers.get('authorization') || ''
  const cronAuth = authHeader === `Bearer ${CRON_SECRET}` && CRON_SECRET

  if (!cronAuth) {
    // Verify as Supabase webhook (check for webhook secret) or user auth
    const webhookSecret = req.headers.get('x-webhook-secret')
    if (webhookSecret !== CRON_SECRET && !CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
    }
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json()
    const results = []

    // ── Supabase webhook format ──
    if (body.type === 'UPDATE' && body.record) {
      const load = body.record
      const oldLoad = body.old_record || {}

      // Only process if status changed and load is from EDI
      if (load.status !== oldLoad.status && load.load_source === 'edi_204' && EDI_STATUSES.includes(load.status)) {
        const result = await triggerEdi214(load, load.status)
        results.push(result)
      }
    }

    // ── Manual / cron format ──
    else if (body.load_id && body.new_status) {
      // Fetch load
      let load = null
      for (const field of ['id', 'load_number', 'load_id']) {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/loads?${field}=eq.${encodeURIComponent(body.load_id)}&select=*&limit=1`,
          { headers: sbHeaders() }
        )
        if (res.ok) {
          const rows = await res.json()
          if (rows.length > 0) { load = rows[0]; break }
        }
      }

      if (load && EDI_STATUSES.includes(body.new_status)) {
        const result = await triggerEdi214(load, body.new_status)
        results.push(result)
      }
    }

    // ── Cron scan mode ──
    else if (body.cron) {
      // Find all EDI loads with recent status changes that haven't had 214 sent
      const loadsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/loads?load_source=eq.edi_204&status=in.(${EDI_STATUSES.join(',')})&select=*&order=updated_at.desc&limit=50`,
        { headers: sbHeaders() }
      )
      if (loadsRes.ok) {
        const loads = await loadsRes.json()

        for (const load of loads) {
          // Check if 214 already sent for this status
          const checkRes = await fetch(
            `${SUPABASE_URL}/rest/v1/edi_transactions?load_id=eq.${load.id}&transaction_type=eq.214&select=parsed_data&order=created_at.desc&limit=1`,
            { headers: sbHeaders() }
          )
          if (checkRes.ok) {
            const txns = await checkRes.json()
            const lastStatus = txns[0]?.parsed_data?.status_event
            if (lastStatus !== load.status) {
              const result = await triggerEdi214(load, load.status)
              results.push(result)
            }
          }
        }
      }
    }

    return Response.json({ success: true, processed: results.length, results }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}

async function triggerEdi214(load, statusEvent) {
  const ownerId = load.owner_id
  let scac = 'QVRI'
  try {
    const sr = await fetch(`${SUPABASE_URL}/rest/v1/carrier_settings?owner_id=eq.${ownerId}&select=scac&limit=1`, { headers: sbHeaders() })
    if (sr.ok) { const rows = await sr.json(); if (rows[0]?.scac) scac = rows[0].scac }
  } catch {}

  // Find trading partner
  let partner = null
  try {
    const txnRes = await fetch(
      `${SUPABASE_URL}/rest/v1/edi_transactions?owner_id=eq.${ownerId}&load_id=eq.${load.id}&transaction_type=eq.204&direction=eq.inbound&select=trading_partner_id&order=created_at.desc&limit=1`,
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
  const STATUS_AT7 = { 'Dispatched': 'X3', 'At Pickup': 'X1', 'In Transit': 'X6', 'At Delivery': 'X2', 'Delivered': 'D1' }
  let ctrlSeq = Math.floor(Date.now() / 1000) % 999999999
  const nc = (d = 9) => { ctrlSeq++; return String(ctrlSeq % (10**d)).padStart(d,'0') }
  const p = (v,l) => String(v||'').padEnd(l,' ').slice(0,l)
  const ts = new Date()
  const d6 = ts.toISOString().slice(2,10).replace(/-/g,'')
  const d8 = ts.toISOString().slice(0,10).replace(/-/g,'')
  const t4 = ts.toISOString().slice(11,16).replace(':','')

  const ic = nc(9), gc = nc(9), sc = nc(4)
  const sid = scac, rid = partner?.isa_id || 'PARTNER'
  const at7 = STATUS_AT7[statusEvent] || 'NS'
  const ref = load.load_id || load.load_number || ''

  const city = (statusEvent === 'At Pickup' || statusEvent === 'Dispatched')
    ? (load.origin||'').split(',')[0]?.trim() : (load.destination||'').split(',')[0]?.trim()
  const state = (statusEvent === 'At Pickup' || statusEvent === 'Dispatched')
    ? ((load.origin||'').split(',')[1]?.trim() || '') : ((load.destination||'').split(',')[1]?.trim() || '')

  const segs = [
    `ISA*00*${p('',10)}*00*${p('',10)}*ZZ*${p(sid,15)}*ZZ*${p(rid,15)}*${d6}*${t4}*U*00401*${ic}*0*P*>`,
    `GS*QM*${partner?.gs_id||sid}*${partner?.gs_id||rid}*${d8}*${t4}*${gc}*X*004010`,
    `ST*214*${sc}`,
    `B10*${ref}*${load.reference_number||''}*${scac}`,
  ]
  if (load.reference_number) segs.push(`L11*${load.reference_number}*BM`)
  if (load.load_number) segs.push(`L11*${load.load_number}*CR`)
  segs.push(`AT7*${at7}*NS*${d8}*${t4}`)
  if (city || state) segs.push(`MS1*${city}*${state}*US`)
  segs.push(`MS2*${scac}*TL`)
  const cnt = segs.length - 2 + 1
  segs.push(`SE*${cnt}*${sc}`, `GE*1*${gc}`, `IEA*1*${ic}`)
  const edi214 = segs.join('~\n') + '~'

  // Store
  await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      owner_id: ownerId,
      transaction_type: '214',
      direction: 'outbound',
      trading_partner_id: partner?.id || null,
      raw_edi: edi214,
      parsed_data: { status_event: statusEvent },
      load_id: load.id,
      load_number: load.load_number,
      status: 'processed',
      processed_at: new Date().toISOString(),
    }),
  })

  // Send to partner
  let sent = false
  if (partner?.api_endpoint && partner?.send_214 !== false) {
    try {
      const r = await fetch(partner.api_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-edi', ...(partner.api_key ? { 'X-API-Key': partner.api_key } : {}) },
        body: edi214,
      })
      sent = r.ok
    } catch {}
  }

  // If delivered → auto-trigger 210
  if (statusEvent === 'Delivered') {
    try {
      // Check if 210 already sent
      const check = await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions?load_id=eq.${load.id}&transaction_type=eq.210&select=id&limit=1`, { headers: sbHeaders() })
      if (check.ok) {
        const existing = await check.json()
        if (existing.length === 0) {
          // Trigger 210 — create invoice + generate EDI
          await triggerEdi210(load, scac, partner)
        }
      }
    } catch {}
  }

  return { load_id: load.id, load_number: load.load_number, status: statusEvent, sent }
}

async function triggerEdi210(load, scac, partner) {
  const ownerId = load.owner_id
  const amount = parseFloat(load.rate) || parseFloat(load.gross_pay) || 0

  // Create invoice if not exists
  let invoice = null
  const invRes = await fetch(`${SUPABASE_URL}/rest/v1/invoices?owner_id=eq.${ownerId}&load_id=eq.${load.id}&select=*&limit=1`, { headers: sbHeaders() })
  if (invRes.ok) {
    const invs = await invRes.json()
    invoice = invs[0] || null
  }

  if (!invoice) {
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/invoices`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        owner_id: ownerId,
        load_id: load.id,
        load_number: load.load_number,
        broker: load.broker_name || '',
        driver_name: load.driver_name || load.carrier_name || '',
        route: `${load.origin} → ${load.destination}`,
        amount,
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        status: 'Unpaid',
      }),
    })
    if (createRes.ok) {
      const rows = await createRes.json()
      invoice = Array.isArray(rows) ? rows[0] : rows
    }
  }

  // Generate 210
  let ctrlSeq = Math.floor(Date.now() / 1000 + 100) % 999999999
  const nc = (d = 9) => { ctrlSeq++; return String(ctrlSeq % (10**d)).padStart(d,'0') }
  const p = (v,l) => String(v||'').padEnd(l,' ').slice(0,l)
  const ts = new Date()
  const d6 = ts.toISOString().slice(2,10).replace(/-/g,'')
  const d8 = ts.toISOString().slice(0,10).replace(/-/g,'')
  const t4 = ts.toISOString().slice(11,16).replace(':','')

  const ic = nc(9), gc = nc(9), sc = nc(4)
  const sid = scac || 'QIVORI', rid = partner?.isa_id || 'PARTNER'
  const invNum = invoice?.invoice_number || load.load_number || `QIV-${Date.now()}`
  const ref = load.load_id || load.load_number || ''

  const segs = [
    `ISA*00*${p('',10)}*00*${p('',10)}*ZZ*${p(sid,15)}*ZZ*${p(rid,15)}*${d6}*${t4}*U*00401*${ic}*0*P*>`,
    `GS*IM*${partner?.gs_id||sid}*${partner?.gs_id||rid}*${d8}*${t4}*${gc}*X*004010`,
    `ST*210*${sc}`,
    `B3*${invNum}*${ref}*${scac||''}*PP*${d8}*${amount.toFixed(2)}*D*${d8}`,
    `B3A*00`,
  ]

  if (load.broker_name) segs.push(`N1*SH*${load.broker_name}`)
  if (load.reference_number) segs.push(`L11*${load.reference_number}*BM`)
  if (load.load_number) segs.push(`L11*${load.load_number}*CR`)

  segs.push(`LX*1`, `L5*1*Line Haul*70`, `L1*1*${load.weight||0}*G*${amount.toFixed(2)}*****${load.miles||0}`)

  const fuel = parseFloat(load.fuel_estimate) || 0
  if (fuel > 0) {
    segs.push(`LX*2`, `L5*2*Fuel Surcharge*0`, `L1*2*0*G*${fuel.toFixed(2)}`)
  }

  segs.push(`L3*${parseFloat(load.weight)||0}*G*${amount.toFixed(2)}****${load.miles||0}`)
  const cnt = segs.length - 2 + 1
  segs.push(`SE*${cnt}*${sc}`, `GE*1*${gc}`, `IEA*1*${ic}`)
  const edi210 = segs.join('~\n') + '~'

  // Store
  await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      owner_id: ownerId,
      transaction_type: '210',
      direction: 'outbound',
      trading_partner_id: partner?.id || null,
      raw_edi: edi210,
      parsed_data: { invoice_number: invNum, amount },
      load_id: load.id,
      load_number: load.load_number,
      status: 'processed',
      processed_at: new Date().toISOString(),
    }),
  })

  // Update load
  await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({ status: 'Invoiced' }),
  })

  // Send to partner
  if (partner?.api_endpoint && partner?.send_210 !== false) {
    try {
      await fetch(partner.api_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-edi', ...(partner.api_key ? { 'X-API-Key': partner.api_key } : {}) },
        body: edi210,
      })
    } catch {}
  }
}
