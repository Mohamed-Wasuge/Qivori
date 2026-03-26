import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { sendEmail, logEmail, wasEmailSent } from './_lib/emails.js'

export const config = { runtime: 'edge' }

/**
 * POST /api/invoice-reminder
 *
 * Two modes:
 * 1. Cron mode (Authorization: Bearer CRON_SECRET) — batch process all overdue invoices
 * 2. Manual mode (user auth + { manualTrigger, invoiceId }) — send reminder for specific invoice
 *
 * De-duplicates via email_logs so the same reminder is never sent twice.
 */

const MAX_EMAILS_PER_RUN = 30

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Accept either cron secret or user auth
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  let userId = null

  if (!isCron) {
    const { user, error: authError } = await verifyAuth(req)
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
    }
    userId = user.id
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const dbHeaders = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
  const now = new Date()

  // ── Manual trigger mode: send reminder for a single invoice ──
  if (!isCron) {
    try {
      const body = await req.json().catch(() => ({}))
      if (body.manualTrigger && body.invoiceId) {
        const invRes = await fetch(
          `${supabaseUrl}/rest/v1/invoices?id=eq.${body.invoiceId}&owner_id=eq.${userId}&select=id,invoice_number,amount,due_date,broker,broker_email,owner_id,load_number&limit=1`,
          { headers: dbHeaders }
        )
        const invs = invRes.ok ? await invRes.json() : []
        if (!invs.length) return Response.json({ error: 'Invoice not found' }, { status: 404, headers: corsHeaders(req) })
        const inv = invs[0]
        if (!inv.broker_email) return Response.json({ error: 'No broker email on file' }, { status: 400, headers: corsHeaders(req) })

        const daysOverdue = inv.due_date ? Math.max(0, Math.floor((now - new Date(inv.due_date)) / (1000 * 60 * 60 * 24))) : 0

        // Get carrier info
        const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=full_name,company_name,email,phone&limit=1`, { headers: dbHeaders })
        const profs = profRes.ok ? await profRes.json() : []
        const carrier = profs[0] || {}

        const subject = `Payment Reminder: Invoice #${inv.invoice_number} — $${(parseFloat(inv.amount) || 0).toFixed(2)}${daysOverdue > 0 ? ` (${daysOverdue} days overdue)` : ''}`
        const html = buildReminderEmail({
          tier: daysOverdue >= 60 ? '60day' : daysOverdue >= 30 ? '30day' : '7day',
          invoiceNumber: inv.invoice_number,
          amount: parseFloat(inv.amount) || 0,
          daysOverdue,
          dueDate: inv.due_date || now.toISOString(),
          broker: inv.broker,
          carrierName: carrier.company_name || carrier.full_name || 'Carrier',
          carrierEmail: carrier.email,
          carrierPhone: carrier.phone,
          loadNumber: inv.load_number,
        })

        const result = await sendEmail(inv.broker_email, subject, html)
        if (!result.ok) return Response.json({ error: 'Email send failed' }, { status: 502, headers: corsHeaders(req) })

        await logEmail(userId, inv.broker_email, `manual_reminder_${inv.id}_${now.toISOString().split('T')[0]}`, {
          invoice_id: inv.id, days_overdue: daysOverdue, amount: inv.amount,
        })

        return Response.json({ ok: true, sent: inv.broker_email }, { headers: corsHeaders(req) })
      }
    } catch (err) {
      return Response.json({ error: err.message || 'Manual reminder failed' }, { status: 500, headers: corsHeaders(req) })
    }
  }

  // ── Cron batch mode ──
  const results = { sent: [], skipped: [], errors: [] }
  let totalSent = 0

  try {
    // Fetch all unpaid/overdue invoices with a due date in the past
    const invoicesRes = await fetch(
      `${supabaseUrl}/rest/v1/invoices?status=in.(Unpaid,Overdue)&due_date=lt.${now.toISOString().split('T')[0]}&select=id,invoice_number,amount,due_date,broker,broker_email,owner_id,load_number&order=due_date.asc`,
      { headers: dbHeaders }
    )
    if (!invoicesRes.ok) {
      return Response.json({ error: `Failed to fetch invoices: ${invoicesRes.status}` }, { status: 500 })
    }
    const invoices = await invoicesRes.json()
    if (!invoices?.length) {
      return Response.json({ message: 'No overdue invoices found', sent: 0 })
    }

    // Group by owner to get carrier info
    const ownerIds = [...new Set(invoices.map(i => i.owner_id).filter(Boolean))]
    const profilesRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=in.(${ownerIds.join(',')})&select=id,full_name,company_name,email,phone`,
      { headers: dbHeaders }
    )
    const profiles = profilesRes.ok ? await profilesRes.json() : []
    const profileMap = {}
    for (const p of profiles) profileMap[p.id] = p

    for (const inv of invoices) {
      if (totalSent >= MAX_EMAILS_PER_RUN) break

      const daysOverdue = Math.floor((now - new Date(inv.due_date)) / (1000 * 60 * 60 * 24))
      const brokerEmail = inv.broker_email

      // Determine which reminder tier to send
      let tier = null
      if (daysOverdue >= 90) tier = '90day'
      else if (daysOverdue >= 60) tier = '60day'
      else if (daysOverdue >= 30) tier = '30day'
      else if (daysOverdue >= 7) tier = '7day'

      if (!tier) {
        results.skipped.push({ invoice: inv.invoice_number, reason: 'too_recent' })
        continue
      }

      if (!brokerEmail) {
        results.skipped.push({ invoice: inv.invoice_number, reason: 'no_broker_email' })
        continue
      }

      // De-duplicate: check if this tier reminder was already sent for this invoice
      const templateKey = `invoice_reminder_${inv.id}_${tier}`
      const alreadySent = await wasEmailSent(inv.owner_id, templateKey)
      if (alreadySent) {
        results.skipped.push({ invoice: inv.invoice_number, reason: `${tier}_already_sent` })
        continue
      }

      const carrier = profileMap[inv.owner_id] || {}
      const carrierName = carrier.company_name || carrier.full_name || 'Carrier'
      const amount = parseFloat(inv.amount) || 0

      const subject = tier === '90day'
        ? `FINAL NOTICE: Invoice #${inv.invoice_number} — $${amount.toFixed(2)} is 90+ days overdue`
        : tier === '60day'
        ? `Second Reminder: Invoice #${inv.invoice_number} — $${amount.toFixed(2)} is 60+ days overdue`
        : tier === '30day'
        ? `Payment Reminder: Invoice #${inv.invoice_number} — $${amount.toFixed(2)} is past due`
        : `Friendly Reminder: Invoice #${inv.invoice_number} — $${amount.toFixed(2)} is past due`

      const html = buildReminderEmail({
        tier,
        invoiceNumber: inv.invoice_number,
        amount,
        daysOverdue,
        dueDate: inv.due_date,
        broker: inv.broker,
        carrierName,
        carrierEmail: carrier.email,
        carrierPhone: carrier.phone,
        loadNumber: inv.load_number,
      })

      const sendResult = await sendEmail(brokerEmail, subject, html)
      if (!sendResult.ok) {
        results.errors.push({ invoice: inv.invoice_number, error: 'Send failed' })
        continue
      }

      await logEmail(inv.owner_id, brokerEmail, templateKey, {
        invoice_id: inv.id,
        tier,
        days_overdue: daysOverdue,
        amount,
      })

      totalSent++
      results.sent.push({
        invoice: inv.invoice_number,
        broker: inv.broker,
        brokerEmail,
        tier,
        daysOverdue,
        amount,
      })
    }

    results.total_invoices_checked = invoices.length
    results.summary = { sent: results.sent.length, skipped: results.skipped.length, errors: results.errors.length }
    return Response.json(results)
  } catch (err) {
    return Response.json({ error: err.message || 'Invoice reminder cron failed' }, { status: 500 })
  }
}

function buildReminderEmail({ tier, invoiceNumber, amount, daysOverdue, dueDate, broker, carrierName, carrierEmail, carrierPhone, loadNumber }) {
  const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dueDateFmt = new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const urgencyColor = tier === '90day' ? '#ef4444' : tier === '60day' ? '#f97316' : '#f0a500'
  const urgencyLabel = tier === '90day' ? 'FINAL NOTICE' : tier === '60day' ? 'SECOND REMINDER' : tier === '30day' ? 'PAYMENT REMINDER' : 'FRIENDLY REMINDER'
  const urgencyMessage = tier === '90day'
    ? 'This invoice is critically overdue. Please remit payment immediately to avoid further collection actions.'
    : tier === '60day'
    ? 'This invoice is significantly past due. We kindly request immediate attention to this matter.'
    : tier === '30day'
    ? 'This invoice is past due. We would appreciate your prompt payment.'
    : 'This is a friendly reminder that payment is due for the following invoice.'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">

<!-- Header -->
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>

<!-- Urgency Banner -->
<div style="background:${urgencyColor};border-radius:12px 12px 0 0;padding:12px 20px;text-align:center;">
<span style="color:#fff;font-size:13px;font-weight:800;letter-spacing:2px;">${urgencyLabel}</span>
</div>

<!-- Main Content -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:0 0 16px 16px;padding:32px 24px;margin-bottom:16px;">

<p style="color:#c8c8d0;font-size:14px;line-height:1.6;margin:0 0 20px;">Dear ${escapeHtml(broker || 'Broker')},</p>
<p style="color:#c8c8d0;font-size:14px;line-height:1.6;margin:0 0 20px;">${urgencyMessage}</p>

<!-- Invoice Details -->
<div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin:20px 0;">
<table style="width:100%;border-collapse:collapse;">
<tr>
<td style="padding:8px 0;color:#8a8a9a;font-size:13px;">Invoice #</td>
<td style="padding:8px 0;color:#fff;font-size:13px;font-weight:700;text-align:right;">${escapeHtml(invoiceNumber || '—')}</td>
</tr>
${loadNumber ? `<tr>
<td style="padding:8px 0;color:#8a8a9a;font-size:13px;border-top:1px solid #2a2a35;">Load #</td>
<td style="padding:8px 0;color:#fff;font-size:13px;font-weight:700;text-align:right;border-top:1px solid #2a2a35;">${escapeHtml(loadNumber)}</td>
</tr>` : ''}
<tr>
<td style="padding:8px 0;color:#8a8a9a;font-size:13px;border-top:1px solid #2a2a35;">Amount Due</td>
<td style="padding:8px 0;color:${urgencyColor};font-size:18px;font-weight:800;text-align:right;border-top:1px solid #2a2a35;">$${fmt(amount)}</td>
</tr>
<tr>
<td style="padding:8px 0;color:#8a8a9a;font-size:13px;border-top:1px solid #2a2a35;">Due Date</td>
<td style="padding:8px 0;color:#ef4444;font-size:13px;font-weight:700;text-align:right;border-top:1px solid #2a2a35;">${dueDateFmt}</td>
</tr>
<tr>
<td style="padding:8px 0;color:#8a8a9a;font-size:13px;border-top:1px solid #2a2a35;">Days Overdue</td>
<td style="padding:8px 0;color:${urgencyColor};font-size:13px;font-weight:700;text-align:right;border-top:1px solid #2a2a35;">${daysOverdue} days</td>
</tr>
<tr>
<td style="padding:8px 0;color:#8a8a9a;font-size:13px;border-top:1px solid #2a2a35;">From</td>
<td style="padding:8px 0;color:#fff;font-size:13px;font-weight:700;text-align:right;border-top:1px solid #2a2a35;">${escapeHtml(carrierName)}</td>
</tr>
</table>
</div>

<p style="color:#c8c8d0;font-size:14px;line-height:1.6;margin:20px 0 0;">
If payment has already been sent, please disregard this notice. For questions, contact ${escapeHtml(carrierName)}${carrierEmail ? ` at <a href="mailto:${escapeHtml(carrierEmail)}" style="color:#4d8ef0;">${escapeHtml(carrierEmail)}</a>` : ''}${carrierPhone ? ` or ${escapeHtml(carrierPhone)}` : ''}.
</p>

</div>

<!-- Footer -->
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Sent via Qivori AI on behalf of ${escapeHtml(carrierName)}</p>
<p style="color:#444;font-size:10px;margin:8px 0 0;">This is an automated payment reminder for a freight invoice.</p>
</div>

</div></body></html>`
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
