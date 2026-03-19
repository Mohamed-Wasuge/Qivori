// ═══════════════════════════════════════════════════════════════
// Document Expiry Alerts — Cron job (daily 8am)
// Checks DQ files for upcoming expirations, sends SMS + email
// ═══════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' }

export default async function handler(req) {
  // Auth
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const RESEND_KEY = process.env.RESEND_API_KEY
  const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
  const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER
  const ADMIN_PHONE = process.env.ADMIN_PHONE || '+13134748674'
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'team@qivori.com'

  const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }

  try {
    // Fetch all DQ files with expiry dates
    const filesRes = await fetch(`${SUPABASE_URL}/rest/v1/driver_dq_files?expiry_date=not.is.null&select=*`, { headers: sbHeaders })
    const files = filesRes.ok ? await filesRes.json() : []

    // Fetch drivers for name mapping
    const driversRes = await fetch(`${SUPABASE_URL}/rest/v1/drivers?select=id,full_name,phone,email`, { headers: sbHeaders })
    const drivers = driversRes.ok ? await driversRes.json() : []
    const driverMap = Object.fromEntries(drivers.map(d => [d.id, d]))

    const now = new Date()
    const alerts = { expired: [], sevenDay: [], thirtyDay: [] }

    const DOC_LABELS = {
      cdl: 'CDL', medical_card: 'Medical Card', mvr: 'MVR', employment_history: 'Employment History',
      road_test: 'Road Test', annual_review: 'Annual Review', hazmat_endorsement: 'Hazmat',
      twic_card: 'TWIC Card', insurance: 'Insurance',
    }

    files.forEach(f => {
      const days = Math.floor((new Date(f.expiry_date) - now) / (1000 * 60 * 60 * 24))
      const driver = driverMap[f.driver_id]
      const item = {
        driverName: driver?.full_name || 'Unknown',
        driverPhone: driver?.phone,
        driverEmail: driver?.email,
        docType: DOC_LABELS[f.doc_type] || f.doc_type,
        expiryDate: f.expiry_date,
        daysLeft: days,
      }
      if (days < 0) alerts.expired.push(item)
      else if (days <= 7) alerts.sevenDay.push(item)
      else if (days <= 30) alerts.thirtyDay.push(item)
    })

    const totalAlerts = alerts.expired.length + alerts.sevenDay.length + alerts.thirtyDay.length
    if (totalAlerts === 0) {
      return new Response(JSON.stringify({ message: 'No expiring documents', alerts: 0 }))
    }

    // Build SMS summary for admin
    const smsLines = []
    if (alerts.expired.length) smsLines.push(`🔴 ${alerts.expired.length} EXPIRED`)
    if (alerts.sevenDay.length) smsLines.push(`🟡 ${alerts.sevenDay.length} expire within 7 days`)
    if (alerts.thirtyDay.length) smsLines.push(`🟠 ${alerts.thirtyDay.length} expire within 30 days`)

    const smsBody = `📋 Qivori DQ Alert\n${smsLines.join('\n')}\n\nExpired:\n${alerts.expired.slice(0,5).map(a => `• ${a.driverName}: ${a.docType}`).join('\n') || 'None'}`

    // Send SMS to admin
    if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      try {
        const twilioAuth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: ADMIN_PHONE, From: TWILIO_FROM, Body: smsBody }),
        })
      } catch (e) { /* SMS failed — non-blocking */ }
    }

    // Send email summary
    if (RESEND_KEY) {
      const buildSection = (title, items, color) => items.length === 0 ? '' : `
        <div style="margin-bottom:20px">
          <div style="font-weight:700;color:${color};margin-bottom:8px">${title} (${items.length})</div>
          ${items.map(a => `<div style="padding:8px 12px;background:#1a1a2e;border-radius:8px;margin-bottom:4px;border-left:3px solid ${color}">
            <span style="font-weight:600">${a.driverName}</span> — ${a.docType}
            <span style="color:#888;font-size:12px"> · ${a.daysLeft < 0 ? `Expired ${Math.abs(a.daysLeft)}d ago` : `${a.daysLeft}d left`}</span>
          </div>`).join('')}
        </div>`

      const html = `
        <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e0e0e0;padding:32px;border-radius:12px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:24px;font-weight:800;letter-spacing:2px;color:#f0a500">QIVORI</div>
            <div style="font-size:14px;color:#888">Document Expiry Alert</div>
          </div>
          <div style="background:linear-gradient(135deg,rgba(240,165,0,0.1),rgba(239,68,68,0.1));border:1px solid rgba(240,165,0,0.2);border-radius:10px;padding:16px;text-align:center;margin-bottom:24px">
            <div style="font-size:36px;font-weight:800;color:#f0a500">${totalAlerts}</div>
            <div style="font-size:12px;color:#888">documents need attention</div>
          </div>
          ${buildSection('Expired', alerts.expired, '#ef4444')}
          ${buildSection('Expiring This Week', alerts.sevenDay, '#f0a500')}
          ${buildSection('Expiring Within 30 Days', alerts.thirtyDay, '#f97316')}
          <div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #333">
            <div style="font-size:11px;color:#666">Qivori TMS · Automated DQ File Monitoring</div>
          </div>
        </div>`

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Qivori Alerts <alerts@qivori.com>',
            to: [ADMIN_EMAIL],
            subject: `📋 ${totalAlerts} DQ File${totalAlerts > 1 ? 's' : ''} Expiring — Action Required`,
            html,
          }),
        })
      } catch (e) { /* Email failed — non-blocking */ }
    }

    // Update status in DB for expired/expiring files
    for (const f of files) {
      const days = Math.floor((new Date(f.expiry_date) - now) / (1000 * 60 * 60 * 24))
      const newStatus = days < 0 ? 'expired' : days <= 30 ? 'expiring_soon' : 'valid'
      if (f.status !== newStatus) {
        await fetch(`${SUPABASE_URL}/rest/v1/driver_dq_files?id=eq.${f.id}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
        }).catch(() => {})
      }
    }

    return new Response(JSON.stringify({
      success: true,
      expired: alerts.expired.length,
      sevenDay: alerts.sevenDay.length,
      thirtyDay: alerts.thirtyDay.length,
    }))
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
