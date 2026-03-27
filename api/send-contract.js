import { handleCors, corsHeaders, verifyAuth, requireActiveSubscription } from './_lib/auth.js'
import { sendEmail } from './_lib/emails.js'
import { sendSMS } from './_lib/sms.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  const subErr = await requireActiveSubscription(req, user)
  if (subErr) return subErr

  const { limited, resetSeconds } = await checkRateLimit(user.id, 'send-contract', 10, 60)
  if (limited) return rateLimitResponse(req, corsHeaders, resetSeconds)

  try {
    const { contractId, sendMethod } = await req.json()
    if (!contractId || !sendMethod) {
      return Response.json({ error: 'contractId and sendMethod required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Fetch the contract — verify ownership
    const contracts = await supabaseRequest(`driver_contracts?id=eq.${contractId}&owner_id=eq.${user.id}&select=*`)
    if (!contracts.length) {
      return Response.json({ error: 'Contract not found' }, { status: 404, headers: corsHeaders(req) })
    }
    const contract = contracts[0]

    // Fetch driver for contact info
    const drivers = await supabaseRequest(`drivers?id=eq.${contract.driver_id}&select=full_name,email,phone`)
    const driver = drivers[0]
    if (!driver) {
      return Response.json({ error: 'Driver not found' }, { status: 404, headers: corsHeaders(req) })
    }

    // Generate signing token
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Update contract with token
    await supabaseRequest(`driver_contracts?id=eq.${contractId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        signing_token: token,
        signing_token_expires_at: expiresAt,
        sent_via: sendMethod,
        sent_at: new Date().toISOString(),
      }),
    })

    const signingUrl = `https://www.qivori.com/#/sign-contract?token=${token}`
    const typeLabel = contract.contract_type === 'lease' ? 'Owner-Operator Lease Agreement'
      : contract.contract_type === 'ic' ? 'Independent Contractor Agreement'
      : 'Contract'
    const companyName = contract.company_name || 'Your Carrier'
    const results = { email: null, sms: null }

    // Send email
    if ((sendMethod === 'email' || sendMethod === 'both') && driver.email) {
      const html = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0e;color:#f5f5f5;border-radius:12px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#c78c00,#f0a500);padding:24px 32px;text-align:center">
            <div style="font-size:28px;font-weight:800;color:#0a0a0e;letter-spacing:2px">QIVORI</div>
            <div style="font-size:12px;color:#0a0a0e;opacity:0.7;margin-top:2px">AI-Powered Fleet Management</div>
          </div>
          <div style="padding:32px">
            <h2 style="color:#f0a500;font-size:20px;margin:0 0 16px">Contract Ready for Your Signature</h2>
            <p style="color:#ccc;font-size:14px;line-height:1.6;margin:0 0 16px">
              <strong style="color:#fff">${companyName}</strong> has sent you a <strong style="color:#fff">${typeLabel}</strong> to review and sign.
            </p>
            <div style="background:#1a1a22;border:1px solid #2a2a35;border-radius:8px;padding:16px;margin:0 0 24px">
              <div style="font-size:12px;color:#888;margin-bottom:4px">Driver</div>
              <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:12px">${driver.full_name}</div>
              <div style="font-size:12px;color:#888;margin-bottom:4px">Agreement Type</div>
              <div style="font-size:14px;font-weight:600;color:#fff">${typeLabel}</div>
            </div>
            <div style="text-align:center;margin:24px 0">
              <a href="${signingUrl}" style="display:inline-block;background:linear-gradient(135deg,#c78c00,#f0a500);color:#0a0a0e;font-size:16px;font-weight:700;padding:14px 40px;border-radius:8px;text-decoration:none;letter-spacing:0.5px">
                Review & Sign Contract
              </a>
            </div>
            <p style="color:#888;font-size:12px;text-align:center;margin:24px 0 0">
              This link expires in 7 days. If you have questions, contact ${companyName} directly.
            </p>
          </div>
          <div style="background:#0d0d12;padding:16px 32px;text-align:center;border-top:1px solid #1a1a22">
            <div style="font-size:10px;color:#666">Sent via Qivori AI &bull; Transportation Management System</div>
          </div>
        </div>`

      const emailResult = await sendEmail(driver.email, `${companyName} — ${typeLabel} for Your Signature`, html)
      results.email = emailResult.ok
    }

    // Send SMS
    if ((sendMethod === 'sms' || sendMethod === 'both') && driver.phone) {
      const msg = `[Qivori] ${companyName} sent you a ${typeLabel} to sign. Review and sign here: ${signingUrl}`
      const smsResult = await sendSMS(driver.phone, msg)
      results.sms = smsResult.ok
    }

    return Response.json({
      ok: true,
      sentVia: sendMethod,
      driverName: driver.full_name,
      results,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message || 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
