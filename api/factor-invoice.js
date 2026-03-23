import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

// Factoring company submission emails (public/known addresses)
const FACTOR_EMAILS = {
  'OTR Solutions':              'invoices@otrsolutions.com',
  'RTS Financial':              'invoices@rtsinc.com',
  'Triumph Business Capital':   'invoices@triumphpay.com',
  'Apex Capital':               'invoices@apexcapitalcorp.com',
  'TAFS':                       'invoices@tafs.com',
  'TBS Factoring':              'invoices@tbsfactoring.com',
  'Thunder Funding':            'invoices@thunderfunding.com',
  'WEX Capital':                'invoices@wexinc.com',
  'Riviera Finance':            'invoices@rivierafinance.com',
  'Fleet One Factoring':        'invoices@fleetone.com',
  'Express Freight Finance':    'invoices@expressfreightfinance.com',
  'Cass Commercial Bank':       'invoices@cassinfo.com',
  'Interstate Capital':         'invoices@interstatecapital.com',
  'Compass Funding':            'invoices@compassfunding.com',
  'Porter Freight Funding':     'invoices@porterfreight.com',
  'Bobtail':                    'invoices@bobtail.com',
  'Denim':                      'invoices@denim.co',
}

/**
 * POST { invoiceId, factoringCompany, factoringRate }
 * Submits an invoice to the carrier's factoring company via email.
 * Packages: invoice details, load info, carrier info.
 * Updates invoice status to 'Factored'.
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`factor-invoice:${user.id}:${ip}`, 5, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const resendKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  const dbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }

  try {
    const { invoiceId, factoringCompany, factoringRate } = await req.json()

    if (!invoiceId) {
      return Response.json({ error: 'invoiceId required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Fetch invoice
    const invRes = await fetch(
      `${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&owner_id=eq.${user.id}&select=*`,
      { headers: dbHeaders }
    )
    const invoices = await invRes.json()
    const invoice = invoices?.[0]
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404, headers: corsHeaders(req) })
    }

    // Fetch linked load
    let load = null
    if (invoice.load_id) {
      const loadRes = await fetch(
        `${supabaseUrl}/rest/v1/loads?id=eq.${invoice.load_id}&select=*`,
        { headers: dbHeaders }
      )
      const loads = await loadRes.json()
      load = loads?.[0]
    }

    // Fetch carrier company info
    const compRes = await fetch(
      `${supabaseUrl}/rest/v1/carrier_companies?owner_id=eq.${user.id}&select=*`,
      { headers: dbHeaders }
    )
    const companies = await compRes.json()
    const company = companies?.[0]

    // Calculate factoring amounts
    const rate = parseFloat(factoringRate) || 2.5
    const amount = Number(invoice.amount) || 0
    const fee = Math.round(amount * (rate / 100) * 100) / 100
    const net = amount - fee

    // Determine factor email — use carrier's saved email first, fallback to known addresses
    const factorEmail = company?.factoring_email || FACTOR_EMAILS[factoringCompany]
    const companyName = company?.name || company?.company_name || 'Carrier'
    const mcNumber = company?.mc || company?.mc_number || ''
    const dotNumber = company?.dot || company?.dot_number || ''

    // Build email HTML
    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0c12;color:#fff;padding:30px;border-radius:12px;">
        <div style="border-bottom:3px solid #f0a500;padding-bottom:20px;margin-bottom:20px;">
          <h1 style="color:#f0a500;margin:0;font-size:24px;">FACTORING SUBMISSION</h1>
          <p style="color:#888;margin:5px 0 0;">Submitted via Qivori TMS</p>
        </div>

        <h2 style="color:#f0a500;font-size:16px;margin-bottom:10px;">CARRIER INFORMATION</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:#888;width:140px;">Company</td><td style="color:#fff;font-weight:bold;">${companyName}</td></tr>
          ${mcNumber ? `<tr><td style="padding:6px 0;color:#888;">MC Number</td><td style="color:#fff;">${mcNumber}</td></tr>` : ''}
          ${dotNumber ? `<tr><td style="padding:6px 0;color:#888;">DOT Number</td><td style="color:#fff;">${dotNumber}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#888;">Contact</td><td style="color:#fff;">${user.email}</td></tr>
        </table>

        <h2 style="color:#f0a500;font-size:16px;margin-bottom:10px;">INVOICE DETAILS</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:#888;width:140px;">Invoice #</td><td style="color:#fff;font-weight:bold;">${invoice.invoice_number || invoice.id}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Broker</td><td style="color:#fff;">${invoice.broker || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Route</td><td style="color:#fff;">${invoice.route || (load ? `${load.origin || ''} → ${load.destination || load.dest || ''}` : '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Load #</td><td style="color:#fff;">${invoice.load_number || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Invoice Date</td><td style="color:#fff;">${invoice.invoice_date || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Due Date</td><td style="color:#fff;">${invoice.due_date || '—'}</td></tr>
          ${load ? `<tr><td style="padding:6px 0;color:#888;">Miles</td><td style="color:#fff;">${load.miles || '—'}</td></tr>` : ''}
          ${load ? `<tr><td style="padding:6px 0;color:#888;">Equipment</td><td style="color:#fff;">${load.equipment || '—'}</td></tr>` : ''}
          ${load ? `<tr><td style="padding:6px 0;color:#888;">Driver</td><td style="color:#fff;">${load.driver_name || invoice.driver_name || '—'}</td></tr>` : ''}
        </table>

        <div style="background:#1a1d27;border:2px solid #f0a500;border-radius:10px;padding:20px;margin-bottom:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#888;font-size:14px;">Invoice Amount</td><td style="text-align:right;color:#fff;font-size:18px;font-weight:bold;">$${amount.toLocaleString()}</td></tr>
            <tr><td style="padding:8px 0;color:#888;font-size:14px;">Factoring Fee (${rate}%)</td><td style="text-align:right;color:#ef4444;font-size:14px;">−$${fee.toLocaleString()}</td></tr>
            <tr style="border-top:2px solid #f0a500;"><td style="padding:12px 0 0;color:#f0a500;font-size:16px;font-weight:bold;">ADVANCE AMOUNT</td><td style="text-align:right;padding:12px 0 0;color:#f0a500;font-size:24px;font-weight:bold;">$${net.toLocaleString()}</td></tr>
          </table>
        </div>

        <p style="color:#888;font-size:12px;margin-top:20px;">
          Supporting documents (Rate Confirmation, BOL, POD) are available in the carrier's Qivori TMS portal.
          Please contact ${user.email} for any additional documentation.
        </p>

        <div style="border-top:1px solid #333;margin-top:20px;padding-top:15px;text-align:center;">
          <p style="color:#666;font-size:11px;">Submitted via Qivori AI TMS · qivori.com</p>
        </div>
      </div>
    `

    // Send email to factoring company (or carrier if no factor email known)
    let emailSent = false
    let sentTo = ''

    if (resendKey) {
      // Send to factoring company if we have their email, CC carrier
      const toEmail = factorEmail || user.email
      sentTo = toEmail

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `Qivori TMS <hello@qivori.com>`,
          reply_to: user.email,
          to: [toEmail],
          cc: factorEmail ? [user.email] : [],
          subject: `Factoring Submission — ${invoice.invoice_number || invoice.id} — ${companyName} — $${amount.toLocaleString()}`,
          html: emailHtml,
        }),
      })
      emailSent = true
    }

    // Update invoice status to Factored
    await fetch(
      `${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}`,
      {
        method: 'PATCH',
        headers: dbHeaders,
        body: JSON.stringify({
          status: 'Factored',
          factored_at: new Date().toISOString(),
          factoring_company: factoringCompany,
          factoring_rate: rate,
          factoring_fee: fee,
          factoring_net: net,
        }),
      }
    )

    return Response.json({
      success: true,
      invoiceNumber: invoice.invoice_number || invoice.id,
      amount,
      fee,
      net,
      factoringCompany,
      emailSent,
      sentTo: factorEmail ? factoringCompany : 'your email (factor email not on file)',
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message || 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
