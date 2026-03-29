/**
 * POST /api/edi/request-access
 * Carrier requests EDI access. Creates a pending request for admin approval.
 * Admin approves after $500 setup fee is collected.
 * On approval, generates API key + ISA/GS qualifiers for the carrier.
 *
 * POST { action: 'request' } — carrier requests access
 * POST { action: 'approve', carrier_id } — admin approves
 * POST { action: 'deny', carrier_id, reason } — admin denies
 * GET — list requests (admin) or check status (carrier)
 */
import { handleCors, corsHeaders, verifyAuth } from '../_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY = process.env.RESEND_API_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'mwasuge@qivori.com'

function sbHeaders(prefer) {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { 'Prefer': prefer } : {}) }
}

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let key = 'qvedi_'
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)]
  return key
}

function generateISAId(companyName) {
  return (companyName || 'CARRIER').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 15).padEnd(15, ' ')
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  // GET — check status
  if (req.method === 'GET') {
    // Check if user is admin
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,email`, { headers: sbHeaders() })
    const profile = profileRes.ok ? (await profileRes.json())?.[0] : null
    const isAdmin = profile?.role === 'admin' || profile?.email?.endsWith('@qivori.com')

    if (isAdmin) {
      // Admin: return all requests
      const res = await fetch(`${SUPABASE_URL}/rest/v1/edi_access_requests?order=created_at.desc&select=*`, { headers: sbHeaders() })
      const requests = res.ok ? await res.json() : []
      return Response.json({ requests }, { headers: corsHeaders(req) })
    } else {
      // Carrier: return their request status
      const res = await fetch(`${SUPABASE_URL}/rest/v1/edi_access_requests?carrier_id=eq.${user.id}&select=*&limit=1`, { headers: sbHeaders() })
      const requests = res.ok ? await res.json() : []
      const request = requests[0] || null

      // Also check if they have active EDI credentials
      let credentials = null
      if (request?.status === 'approved') {
        const credRes = await fetch(`${SUPABASE_URL}/rest/v1/edi_credentials?carrier_id=eq.${user.id}&select=api_key,isa_id,gs_id,endpoint_url,created_at&limit=1`, { headers: sbHeaders() })
        if (credRes.ok) credentials = (await credRes.json())?.[0] || null
      }

      return Response.json({ request, credentials }, { headers: corsHeaders(req) })
    }
  }

  if (req.method !== 'POST') return Response.json({ error: 'GET or POST' }, { status: 405, headers: corsHeaders(req) })

  try {
    const { action, carrier_id, reason } = await req.json()

    // ── Carrier: Request EDI access ──
    if (action === 'request') {
      // Get carrier company info
      const compRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?owner_id=eq.${user.id}&select=name,mc_number,dot_number,phone,email&limit=1`, { headers: sbHeaders() })
      const company = compRes.ok ? (await compRes.json())?.[0] : null

      const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=full_name,email,phone&limit=1`, { headers: sbHeaders() })
      const profile = profRes.ok ? (await profRes.json())?.[0] : null

      // Check if already requested
      const existRes = await fetch(`${SUPABASE_URL}/rest/v1/edi_access_requests?carrier_id=eq.${user.id}&select=id,status&limit=1`, { headers: sbHeaders() })
      const existing = existRes.ok ? (await existRes.json())?.[0] : null
      if (existing) {
        return Response.json({ error: `EDI access already ${existing.status}`, status: existing.status }, { status: 409, headers: corsHeaders(req) })
      }

      // Create request
      const requestData = {
        carrier_id: user.id,
        carrier_name: company?.name || profile?.full_name || user.email,
        carrier_email: profile?.email || user.email,
        carrier_phone: company?.phone || profile?.phone || null,
        mc_number: company?.mc_number || null,
        dot_number: company?.dot_number || null,
        status: 'pending',
        setup_fee: 1500,
        created_at: new Date().toISOString(),
      }

      await fetch(`${SUPABASE_URL}/rest/v1/edi_access_requests`, {
        method: 'POST', headers: sbHeaders('return=minimal'), body: JSON.stringify(requestData),
      })

      // Notify admin
      if (RESEND_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Qivori <hello@qivori.com>',
            to: [ADMIN_EMAIL],
            subject: `EDI Access Request — ${requestData.carrier_name} (${requestData.mc_number || 'No MC'})`,
            html: `<h2>New EDI Access Request</h2>
              <p><strong>${requestData.carrier_name}</strong> is requesting EDI access.</p>
              <p>Email: ${requestData.carrier_email}<br>Phone: ${requestData.carrier_phone || '—'}<br>MC: ${requestData.mc_number || '—'}<br>DOT: ${requestData.dot_number || '—'}</p>
              <p>Setup fee: <strong>$1,500</strong></p>
              <p>Log in to your admin dashboard to approve or deny.</p>`,
          }),
        }).catch(() => {})
      }

      return Response.json({ success: true, status: 'pending', message: 'EDI access request submitted. You will be notified once approved.' }, { headers: corsHeaders(req) })
    }

    // ── Admin: Approve EDI access ──
    if (action === 'approve') {
      if (!carrier_id) return Response.json({ error: 'carrier_id required' }, { status: 400, headers: corsHeaders(req) })

      // Verify admin
      const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,email`, { headers: sbHeaders() })
      const profile = profRes.ok ? (await profRes.json())?.[0] : null
      if (profile?.role !== 'admin' && !profile?.email?.endsWith('@qivori.com')) {
        return Response.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders(req) })
      }

      // Get carrier info
      const compRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?owner_id=eq.${carrier_id}&select=name&limit=1`, { headers: sbHeaders() })
      const company = compRes.ok ? (await compRes.json())?.[0] : null
      const companyName = company?.name || 'Carrier'

      // Generate credentials
      const apiKey = generateApiKey()
      const isaId = generateISAId(companyName)
      const gsId = companyName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10)

      // Save credentials
      await fetch(`${SUPABASE_URL}/rest/v1/edi_credentials`, {
        method: 'POST', headers: sbHeaders('return=minimal'),
        body: JSON.stringify({
          carrier_id,
          api_key: apiKey,
          isa_id: isaId.trim(),
          gs_id: gsId,
          endpoint_url: 'https://qivori.com/api/edi/receive-204',
          status: 'active',
          created_at: new Date().toISOString(),
        }),
      })

      // Update request status
      await fetch(`${SUPABASE_URL}/rest/v1/edi_access_requests?carrier_id=eq.${carrier_id}`, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString(), approved_by: user.id }),
      })

      // Notify carrier
      const carrierRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${carrier_id}&select=email&limit=1`, { headers: sbHeaders() })
      const carrierProfile = carrierRes.ok ? (await carrierRes.json())?.[0] : null

      if (RESEND_KEY && carrierProfile?.email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Qivori <hello@qivori.com>',
            to: [carrierProfile.email],
            subject: 'EDI Access Approved — Your credentials are ready',
            html: `<h2>EDI Access Approved</h2>
              <p>Your EDI access has been activated. Here are your credentials:</p>
              <table style="border-collapse:collapse;">
                <tr><td style="padding:6px;font-weight:bold;">Endpoint</td><td style="padding:6px;">https://qivori.com/api/edi/receive-204</td></tr>
                <tr><td style="padding:6px;font-weight:bold;">API Key</td><td style="padding:6px;font-family:monospace;">${apiKey}</td></tr>
                <tr><td style="padding:6px;font-weight:bold;">ISA ID</td><td style="padding:6px;font-family:monospace;">${isaId.trim()}</td></tr>
                <tr><td style="padding:6px;font-weight:bold;">GS ID</td><td style="padding:6px;font-family:monospace;">${gsId}</td></tr>
              </table>
              <p>Give these to your broker to start receiving load tenders electronically.</p>
              <p>View your credentials anytime in Qivori → EDI Hub.</p>`,
          }),
        }).catch(() => {})
      }

      return Response.json({ success: true, carrier_id, api_key: apiKey, isa_id: isaId.trim(), gs_id: gsId }, { headers: corsHeaders(req) })
    }

    // ── Admin: Deny EDI access ──
    if (action === 'deny') {
      if (!carrier_id) return Response.json({ error: 'carrier_id required' }, { status: 400, headers: corsHeaders(req) })

      await fetch(`${SUPABASE_URL}/rest/v1/edi_access_requests?carrier_id=eq.${carrier_id}`, {
        method: 'PATCH', headers: sbHeaders(),
        body: JSON.stringify({ status: 'denied', denied_reason: reason || null }),
      })

      return Response.json({ success: true, status: 'denied' }, { headers: corsHeaders(req) })
    }

    return Response.json({ error: 'Invalid action' }, { status: 400, headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
