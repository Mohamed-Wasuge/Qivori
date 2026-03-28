/**
 * POST /api/edi/send-990
 * Manually send or resend a 990 (Response to Load Tender).
 * Used for: manual accept/reject, retransmission, negotiate resolution.
 *
 * Body: { load_id, decision: 'accept'|'reject', transaction_id? }
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
function nowStr() {
  const d = new Date()
  return { d6: d.toISOString().slice(2,10).replace(/-/g,''), d8: d.toISOString().slice(0,10).replace(/-/g,''), t4: d.toISOString().slice(11,16).replace(':','') }
}

function generate990(load, decision, scac, partner, origStControl) {
  const ic = nextCtrl(9), gc = nextCtrl(9), sc = nextCtrl(4)
  const sid = scac || 'QIVORI', rid = partner?.isa_id || 'PARTNER'
  const ts = nowStr()
  const action = decision === 'accept' ? 'A' : 'D'
  const ref = load.load_id || load.reference_number || load.load_number || ''

  const segs = [
    `ISA*00*${pad('',10)}*00*${pad('',10)}*ZZ*${pad(sid,15)}*ZZ*${pad(rid,15)}*${ts.d6}*${ts.t4}*U*00401*${ic}*0*P*>`,
    `GS*GF*${partner?.gs_id||sid}*${partner?.gs_id||rid}*${ts.d8}*${ts.t4}*${gc}*X*004010`,
    `ST*990*${sc}`,
    `B1*${scac||''}*${ref}*${ts.d8}*${action}`,
    `N1*CA*${scac||'Qivori Carrier'}`,
  ]
  if (decision === 'reject') segs.push('NTE*GEN*Load does not meet carrier requirements')
  if (origStControl) segs.push(`L11*${origStControl}*CR`)
  if (load.reference_number) segs.push(`L11*${load.reference_number}*BM`)

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
    const { load_id, decision, transaction_id } = await req.json()

    if (!decision || !['accept', 'reject'].includes(decision)) {
      return Response.json({ error: 'Decision must be accept or reject' }, { status: 400, headers: corsHeaders(req) })
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

    // Get carrier settings for SCAC
    let scac = 'QVRI'
    try {
      const sr = await fetch(`${SUPABASE_URL}/rest/v1/carrier_settings?owner_id=eq.${user.id}&select=scac&limit=1`, { headers: sbHeaders() })
      if (sr.ok) { const rows = await sr.json(); if (rows[0]?.scac) scac = rows[0].scac }
    } catch {}

    // Get trading partner from original 204 transaction
    let partner = null
    let origStControl = null
    if (transaction_id) {
      try {
        const tr = await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions?id=eq.${transaction_id}&select=*&limit=1`, { headers: sbHeaders() })
        if (tr.ok) {
          const rows = await tr.json()
          if (rows.length > 0) {
            origStControl = rows[0].st_control_number
            if (rows[0].trading_partner_id) {
              const pr = await fetch(`${SUPABASE_URL}/rest/v1/trading_partners?id=eq.${rows[0].trading_partner_id}&select=*&limit=1`, { headers: sbHeaders() })
              if (pr.ok) { const p = await pr.json(); if (p.length > 0) partner = p[0] }
            }
          }
        }
      } catch {}
    }

    // Generate 990
    const edi990 = generate990(load, decision, scac, partner, origStControl)

    // Update load status
    const newStatus = decision === 'accept' ? 'Rate Con Received' : 'Cancelled'
    await fetch(`${SUPABASE_URL}/rest/v1/loads?id=eq.${load.id}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ status: newStatus }),
    })

    // Store outbound 990 transaction
    await fetch(`${SUPABASE_URL}/rest/v1/edi_transactions`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        owner_id: user.id,
        transaction_type: '990',
        direction: 'outbound',
        trading_partner_id: partner?.id || null,
        raw_edi: edi990,
        parsed_data: { decision },
        canonical_load: { load_id: load.load_id, load_number: load.load_number, origin: load.origin, destination: load.destination },
        load_id: load.id,
        load_number: load.load_number,
        related_transaction_id: transaction_id || null,
        status: 'processed',
        processed_at: new Date().toISOString(),
      }),
    })

    // Send to partner webhook
    let sent = false
    if (partner?.api_endpoint) {
      try {
        const sendRes = await fetch(partner.api_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-edi', ...(partner.api_key ? { 'X-API-Key': partner.api_key } : {}) },
          body: edi990,
        })
        sent = sendRes.ok
      } catch {}
    }

    return Response.json({
      success: true,
      decision,
      edi_990: edi990,
      load_id: load.id,
      load_number: load.load_number,
      partner_notified: sent,
      new_status: newStatus,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
