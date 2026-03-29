import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

// Factoring company directory — full details for carrier selection
const FACTORING_COMPANIES = {
  'OTR Solutions':              { email: 'invoices@otrsolutions.com', phone: '877-440-8111', rate: '2-5%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'No minimums. Free fuel card program. Free load board access.' },
  'RTS Financial':              { email: 'invoices@rtsinc.com', phone: '877-787-4558', rate: '1.5-5%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Fuel discount program. Free credit checks. No hidden fees.' },
  'Triumph Business Capital':   { email: 'invoices@triumphpay.com', phone: '866-644-1149', rate: '2-4%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Bank-backed. Free fuel card. No contract required.' },
  'Apex Capital':               { email: 'invoices@apexcapitalcorp.com', phone: '855-369-2739', rate: '1.5-5%', same_day: true, payment_speed: 'Same day or next day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'No reserves on select clients. Fuel discounts. 24/7 support.' },
  'TAFS':                       { email: 'invoices@tafs.com', phone: '913-393-6100', rate: '2-5%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Fuel card with 8¢/gal discount. No monthly minimums.' },
  'TBS Factoring':              { email: 'invoices@tbsfactoring.com', phone: '877-227-0669', rate: '2-5%', same_day: false, payment_speed: 'Next day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Oklahoma-based. Personalized service. No long-term contracts.' },
  'Thunder Funding':            { email: 'invoices@thunderfunding.com', phone: '866-707-4997', rate: '2-4%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Low rates for high volume. Fuel card included.' },
  'WEX Capital':                { email: 'invoices@wexinc.com', phone: '866-230-8589', rate: '2-5%', same_day: false, payment_speed: 'Next day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Integrated with EFS fuel cards. Fleet management tools.' },
  'Riviera Finance':            { email: 'invoices@rivierafinance.com', phone: '800-872-7484', rate: '2-5%', same_day: false, payment_speed: '1-2 days', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: '50+ years in business. No long-term contracts.' },
  'Fleet One Factoring':        { email: 'invoices@fleetone.com', phone: '800-483-3840', rate: '2-4%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Part of WEX. Fuel card integration. Nationwide.' },
  'Express Freight Finance':    { email: 'invoices@expressfreightfinance.com', phone: '866-515-1249', rate: '1.5-3.5%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Low flat rates. No setup fees. No contract minimums.' },
  'Interstate Capital':         { email: 'invoices@interstatecapital.com', phone: '800-340-0396', rate: '2-5%', same_day: true, payment_speed: 'Same day', min_invoice: 200, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Fuel card with volume discounts. Credit checks included.' },
  'Compass Funding':            { email: 'invoices@compassfunding.com', phone: '405-546-2820', rate: '2-4%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Small carrier friendly. Personal account managers.' },
  'Porter Freight Funding':     { email: 'invoices@porterfreight.com', phone: '888-Portal', rate: '2-4.5%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'Fast onboarding. No long-term contracts required.' },
  'Bobtail':                    { email: 'invoices@bobtail.com', phone: '844-262-8245', rate: '2-5%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'App-based. Instant pay. Modern interface. No contracts.' },
  'Denim':                      { email: 'invoices@denim.co', phone: '844-336-4669', rate: '2-4%', same_day: true, payment_speed: 'Same day', min_invoice: 0, required_docs: ['Rate Con', 'BOL', 'POD'], notes: 'API-first. Modern platform. Broker-side factoring option.' },
}

// Legacy lookup
const FACTOR_EMAILS = Object.fromEntries(Object.entries(FACTORING_COMPANIES).map(([k, v]) => [k, v.email]))

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

  // GET — return factoring company directory
  if (req.method === 'GET') {
    const companies = Object.entries(FACTORING_COMPANIES).map(([name, info]) => ({ name, ...info }))
    return Response.json({ companies }, { headers: corsHeaders(req) })
  }

  try {
    const { invoiceId, factoringCompany, factoringRate, paymentTerms, invoicePdfUrl } = await req.json()

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

    // Fetch documents for this load (BOL, rate con, POD, lumper receipts, detention)
    let documents = []
    let docValidation = null
    if (invoice.load_id) {
      const docsRes = await fetch(
        `${supabaseUrl}/rest/v1/documents?load_id=eq.${invoice.load_id}&select=name,file_url,doc_type&order=created_at.desc`,
        { headers: dbHeaders }
      )
      if (docsRes.ok) documents = await docsRes.json()

      // AI document validation before factoring
      try {
        const validateRes = await fetch(new URL('/api/validate-document', req.url).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.get('authorization') },
          body: JSON.stringify({ load_id: invoice.load_id, validate_all: true }),
        })
        if (validateRes.ok) docValidation = await validateRes.json()
      } catch {} // non-blocking — still submit even if validation fails
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

        <h2 style="color:#f0a500;font-size:16px;margin-bottom:10px;">PAYMENT TERMS</h2>
        <div style="background:#1a1d27;border-radius:10px;padding:15px;margin-bottom:20px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#888;">Requested</td><td style="color:#fff;font-weight:bold;">${paymentTerms === 'same_day' ? 'SAME DAY PAY' : paymentTerms === 'next_day' ? 'NEXT BUSINESS DAY' : 'STANDARD (per agreement)'}</td></tr>
          </table>
        </div>

        ${invoicePdfUrl ? `
        <h2 style="color:#f0a500;font-size:16px;margin-bottom:10px;">INVOICE PDF</h2>
        <div style="background:#1a1d27;border-radius:10px;padding:15px;margin-bottom:20px;text-align:center;">
          <a href="${invoicePdfUrl}" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;">Download Invoice PDF</a>
        </div>
        ` : ''}

        ${documents.length > 0 ? `
        <h2 style="color:#f0a500;font-size:16px;margin-bottom:10px;">SUPPORTING DOCUMENTS</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          ${documents.map(doc => `
            <tr>
              <td style="padding:8px 0;color:#888;width:140px;">${(doc.doc_type || doc.name || '').replace(/_/g, ' ').toUpperCase()}</td>
              <td><a href="${doc.file_url}" style="color:#f0a500;text-decoration:none;font-weight:bold;">${doc.name || 'View Document'}</a></td>
            </tr>
          `).join('')}
        </table>
        ` : `
        <p style="color:#888;font-size:12px;margin-top:20px;">
          Supporting documents (Rate Confirmation, BOL, POD) are available in the carrier's Qivori TMS portal.
          Please contact ${user.email} for any additional documentation.
        </p>
        `}

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

      // Send confirmation email to carrier
      const confirmHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0c12;color:#fff;padding:30px;border-radius:12px;">
          <div style="border-bottom:3px solid #f0a500;padding-bottom:20px;margin-bottom:20px;">
            <h1 style="color:#22c55e;margin:0;font-size:24px;">FACTORING CONFIRMED</h1>
            <p style="color:#888;margin:5px 0 0;">Your invoice has been submitted for factoring</p>
          </div>

          <div style="background:#1a1d27;border-radius:10px;padding:20px;margin-bottom:20px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#888;">Invoice</td><td style="color:#fff;font-weight:bold;">${invoice.invoice_number || invoice.id}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Broker</td><td style="color:#fff;">${invoice.broker || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Route</td><td style="color:#fff;">${invoice.route || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Submitted To</td><td style="color:#fff;font-weight:bold;">${factoringCompany}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Sent To</td><td style="color:#fff;">${factorEmail || 'your email (no factor email on file)'}</td></tr>
            </table>
          </div>

          <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:10px;padding:20px;margin-bottom:20px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#888;">Invoice Amount</td><td style="text-align:right;color:#fff;font-size:16px;">$${amount.toLocaleString()}</td></tr>
              <tr><td style="padding:6px 0;color:#888;">Factoring Fee (${rate}%)</td><td style="text-align:right;color:#ef4444;">−$${fee.toLocaleString()}</td></tr>
              <tr style="border-top:2px solid #22c55e;"><td style="padding:10px 0 0;color:#22c55e;font-weight:bold;">YOU WILL RECEIVE</td><td style="text-align:right;padding:10px 0 0;color:#22c55e;font-size:22px;font-weight:bold;">$${net.toLocaleString()}</td></tr>
            </table>
          </div>

          <div style="background:#1a1d27;border-radius:10px;padding:16px;margin-bottom:20px;">
            <p style="color:#f0a500;font-weight:bold;margin:0 0 8px;">Expected Deposit: Within 24 business hours</p>
            <p style="color:#888;font-size:12px;margin:0;">Your factoring company will review the submission and deposit funds to your account on file. Check your Qivori dashboard for status updates.</p>
          </div>

          <div style="border-top:1px solid #333;padding-top:15px;text-align:center;">
            <p style="color:#666;font-size:11px;">Qivori AI TMS · qivori.com</p>
          </div>
        </div>
      `
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `Qivori TMS <hello@qivori.com>`,
          to: [user.email],
          subject: `Factoring Confirmed — ${invoice.invoice_number || invoice.id} — $${net.toLocaleString()} depositing in 24hrs`,
          html: confirmHtml,
        }),
      }).catch(() => {})
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

    // Build validation warnings for the response
    const validationWarnings = []
    if (docValidation) {
      if (docValidation.missing?.length > 0) validationWarnings.push(`Missing documents: ${docValidation.missing.join(', ')}`)
      for (const v of (docValidation.validations || [])) {
        if (!v.valid) validationWarnings.push(`${(v.doc_type || '').toUpperCase()}: ${v.summary || v.issues?.join(', ')}`)
      }
    }

    return Response.json({
      success: true,
      invoiceNumber: invoice.invoice_number || invoice.id,
      amount,
      fee,
      net,
      factoringCompany,
      emailSent,
      sentTo: factorEmail ? factoringCompany : 'your email (factor email not on file)',
      paymentTerms: paymentTerms || 'standard',
      documents_attached: documents.length,
      validation: docValidation ? {
        complete: docValidation.complete,
        ready_to_factor: docValidation.ready_to_factor,
        missing: docValidation.missing || [],
        warnings: validationWarnings,
      } : null,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message || 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
