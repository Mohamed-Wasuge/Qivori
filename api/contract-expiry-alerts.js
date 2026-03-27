// api/contract-expiry-alerts.js — Contract Expiry Alert System
// Cron job: runs weekly to check for expiring contracts
// Sends alerts at 30 days and 7 days before expiry, auto-expires past-due

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER
const CRON_SECRET = process.env.CRON_SECRET

function isAuthorized(req) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${CRON_SECRET}` || auth === `Bearer ${SUPABASE_KEY}`
}

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return { ok: false }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Qivori AI <hello@qivori.com>', to: [to], subject, html }),
  })
  return { ok: res.ok }
}

async function sendSMS(to, message) {
  if (!TWILIO_SID || !TWILIO_AUTH || !TWILIO_PHONE) return { ok: false }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_AUTH}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_PHONE, Body: message }),
  })
  return { ok: res.ok }
}

export default async function handler(req) {
  if (!isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const results = { alerts30d: 0, alerts7d: 0, expired: 0, errors: [] }

  try {
    // Fetch all active contracts with end dates
    const contracts = await supabaseRequest(
      'driver_contracts?status=eq.active&end_date=not.is.null&select=*&order=end_date.asc'
    )

    const now = new Date()

    for (const c of contracts) {
      const endDate = new Date(c.end_date)
      const daysLeft = Math.floor((endDate - now) / (1000 * 60 * 60 * 24))

      try {
        // Get carrier profile for contact info
        const profiles = await supabaseRequest(`carrier_profiles?user_id=eq.${c.owner_id}&limit=1`).catch(() => [])
        const profile = profiles[0]
        const carrierEmail = profile?.email || profile?.contact_email
        const carrierPhone = profile?.phone

        const typeLabel = c.contract_type === 'lease' ? 'Lease Agreement' : c.contract_type === 'ic' ? 'IC Agreement' : 'Contract'

        // Contract expired
        if (daysLeft <= 0) {
          await supabaseRequest(`driver_contracts?id=eq.${c.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'expired' }),
          })
          if (carrierEmail) {
            await sendEmail(carrierEmail, `Contract Expired — ${c.driver_name}`,
              buildAlertEmail(c.driver_name, typeLabel, c.company_name, 'EXPIRED', 'This contract has expired and has been automatically marked as expired.', '#ef4444'))
          }
          results.expired++
        }
        // 7-day warning
        else if (daysLeft <= 7 && !c.expiry_alert_7d_sent) {
          if (carrierEmail) {
            await sendEmail(carrierEmail, `Contract Expiring in ${daysLeft} Days — ${c.driver_name}`,
              buildAlertEmail(c.driver_name, typeLabel, c.company_name, `${daysLeft} DAYS LEFT`, 'This contract is expiring very soon. Renew or create a new agreement immediately.', '#f59e0b'))
          }
          if (carrierPhone) {
            await sendSMS(carrierPhone, `[Qivori] URGENT: ${typeLabel} for ${c.driver_name} expires in ${daysLeft} days. Renew now at qivori.com`)
          }
          await supabaseRequest(`driver_contracts?id=eq.${c.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ expiry_alert_7d_sent: true }),
          })
          results.alerts7d++
        }
        // 30-day warning
        else if (daysLeft <= 30 && !c.expiry_alert_30d_sent) {
          if (carrierEmail) {
            await sendEmail(carrierEmail, `Contract Expiring in ${daysLeft} Days — ${c.driver_name}`,
              buildAlertEmail(c.driver_name, typeLabel, c.company_name, `${daysLeft} DAYS LEFT`, 'This contract is expiring soon. Consider renewing or creating a replacement agreement.', '#f0a500'))
          }
          await supabaseRequest(`driver_contracts?id=eq.${c.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ expiry_alert_30d_sent: true }),
          })
          results.alerts30d++
        }
      } catch (err) {
        results.errors.push({ contractId: c.id, error: err.message })
      }
    }

    return Response.json({ ok: true, ...results })
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 })
  }
}

function buildAlertEmail(driverName, typeLabel, companyName, badge, message, badgeColor) {
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0e;color:#f5f5f5;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#c78c00,#f0a500);padding:24px 32px;text-align:center">
    <div style="font-size:28px;font-weight:800;color:#0a0a0e">QIVORI</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:${badgeColor};font-size:20px;margin:0 0 16px">Contract Expiry Alert</h2>
    <div style="display:inline-block;background:${badgeColor}22;color:${badgeColor};padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;margin-bottom:16px">${badge}</div>
    <div style="background:#1a1a22;border:1px solid #2a2a35;border-radius:8px;padding:16px;margin:0 0 16px">
      <div style="font-size:12px;color:#888">Driver</div>
      <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:8px">${driverName}</div>
      <div style="font-size:12px;color:#888">Agreement</div>
      <div style="font-size:14px;font-weight:600;color:#fff">${typeLabel}</div>
    </div>
    <p style="color:#ccc;font-size:14px;line-height:1.6">${message}</p>
    <div style="text-align:center;margin:24px 0">
      <a href="https://www.qivori.com" style="display:inline-block;background:#f0a500;color:#0a0a0e;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none">Open Qivori Dashboard</a>
    </div>
  </div>
</div>`
}
