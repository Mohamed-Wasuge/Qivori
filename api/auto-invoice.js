import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'
import { requireFields } from './_lib/validate.js'

export const config = { runtime: 'edge' }

/**
 * Auto-Invoice endpoint.
 * POST { loadId } — generates invoice for a delivered load, emails it to broker, updates status.
 * POST { cron: true } — scans all delivered loads without invoices and processes them.
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

  // Rate limit: 10/min/user
  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`auto-invoice:${user.id}:${ip}`, 10, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  const resendKey = process.env.RESEND_API_KEY

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }

  try {
    const body = await req.json()
    const { loadId, cron, lineItems } = body

    if (!cron) {
      const err = requireFields(body, ['loadId'], corsHeaders(req))
      if (err) return err
    }

    // ── Cron mode: find all delivered loads without invoices ──
    if (cron) {
      const loadsRes = await fetch(
        `${supabaseUrl}/rest/v1/loads?owner_id=eq.${user.id}&status=eq.Delivered&select=*`,
        { headers }
      )
      if (!loadsRes.ok) {
        return Response.json({ error: 'Failed to fetch loads' }, { status: 500, headers: corsHeaders(req) })
      }
      const deliveredLoads = await loadsRes.json()

      // Get existing invoices to skip already-invoiced loads
      const invRes = await fetch(
        `${supabaseUrl}/rest/v1/invoices?owner_id=eq.${user.id}&select=load_id`,
        { headers }
      )
      const existingInvoices = invRes.ok ? await invRes.json() : []
      const invoicedLoadIds = new Set(existingInvoices.map(i => i.load_id).filter(Boolean))

      const toInvoice = deliveredLoads.filter(l => !invoicedLoadIds.has(l.id))

      const results = []
      for (const load of toInvoice) {
        try {
          const result = await processLoad(load, user, supabaseUrl, headers, resendKey, null, {}, supabaseKey)
          results.push({ loadId: load.load_number || load.id, success: true, invoiceNumber: result.invoiceNumber })
        } catch (e) {
          results.push({ loadId: load.load_number || load.id, success: false, error: e.message })
        }
      }

      return Response.json({ success: true, processed: results.length, results }, { headers: corsHeaders(req) })
    }

    // ── Single load mode ──
    if (!loadId) {
      return Response.json({ error: 'loadId is required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Try finding load by id, load_number, or load_id
    let load = null
    for (const field of ['id', 'load_number']) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/loads?owner_id=eq.${user.id}&${field}=eq.${encodeURIComponent(loadId)}&select=*&limit=1`,
        { headers }
      )
      if (res.ok) {
        const data = await res.json()
        if (data.length > 0) { load = data[0]; break }
      }
    }

    if (!load) {
      return Response.json({ error: 'Load not found' }, { status: 404, headers: corsHeaders(req) })
    }

    if (load.status !== 'Delivered' && load.status !== 'In Transit') {
      return Response.json({ error: `Load status is "${load.status}" — must be Delivered to invoice` }, { status: 400, headers: corsHeaders(req) })
    }

    // Check if invoice already exists for this load
    const existCheck = await fetch(
      `${supabaseUrl}/rest/v1/invoices?owner_id=eq.${user.id}&load_id=eq.${load.id}&select=id,invoice_number&limit=1`,
      { headers }
    )
    if (existCheck.ok) {
      const existing = await existCheck.json()
      if (existing.length > 0) {
        return Response.json({ error: 'Invoice already exists', invoiceNumber: existing[0].invoice_number }, { status: 409, headers: corsHeaders(req) })
      }
    }

    const result = await processLoad(load, user, supabaseUrl, headers, resendKey, lineItems, body, supabaseKey)

    return Response.json({
      success: true,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      emailSent: result.emailSent,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message || 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}

/**
 * Process a single load: create invoice, send email, update load status.
 */
async function processLoad(load, user, supabaseUrl, headers, resendKey, lineItems, body = {}) {
  const now = new Date()
  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + 30)

  // Generate invoice number: QIV-YYYYMMDD-XXXX
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  const invoiceNumber = `QIV-${datePart}-${rand}`

  const origin = load.origin || ''
  const dest = load.destination || ''
  const rate = parseFloat(load.gross_pay) || parseFloat(load.rate_per_mile) * (load.miles || 0) || 0
  const broker = load.broker || 'Unknown Broker'
  const brokerEmail = load.broker_email || ''
  const driverName = load.driver_name || ''
  const refNumber = load.reference_number || load.po_number || load.load_number || ''
  const miles = load.miles || 0

  const originShort = origin.split(',')[0].trim()
  const destShort = dest.split(',')[0].trim()
  const route = `${originShort} → ${destShort}`

  // ── 1. Create invoice record in Supabase ──
  const items = lineItems || []
  const accessorialTotal = items.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0)
  const totalAmount = rate + accessorialTotal

  const invoicePayload = {
    owner_id: user.id,
    invoice_number: invoiceNumber,
    load_id: load.id,
    load_number: load.load_number || '',
    broker: broker,
    route: route,
    amount: totalAmount,
    line_items: items.length > 0 ? items : null,
    invoice_date: now.toISOString().split('T')[0],
    due_date: dueDate.toISOString().split('T')[0],
    status: 'Unpaid',
    driver_name: driverName,
    notes: items.length > 0
      ? `Auto-generated on delivery. Ref: ${refNumber}. Includes ${items.length} accessorial charge(s): $${accessorialTotal.toLocaleString()}`
      : `Auto-generated on delivery. Ref: ${refNumber}`,
  }

  const invRes = await fetch(`${supabaseUrl}/rest/v1/invoices`, {
    method: 'POST',
    headers,
    body: JSON.stringify(invoicePayload),
  })

  if (!invRes.ok) {
    const errText = await invRes.text()
    throw new Error(`Failed to create invoice: ${errText}`)
  }

  const invData = await invRes.json()
  const invoiceId = invData[0]?.id || invData.id || null

  // ── 2. Update load status to Invoiced ──
  await fetch(`${supabaseUrl}/rest/v1/loads?id=eq.${load.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'Invoiced', updated_at: now.toISOString() }),
  })

  // ── 3. Fetch carrier company info for the invoice ──
  let companyInfo = { name: 'Carrier', address: '', phone: '', email: '', mc_number: '' }
  try {
    const compRes = await fetch(
      `${supabaseUrl}/rest/v1/companies?owner_id=eq.${user.id}&select=*&limit=1`,
      { headers }
    )
    if (compRes.ok) {
      const compData = await compRes.json()
      if (compData.length > 0) companyInfo = compData[0]
    }
  } catch { /* use defaults */ }

  // Resolve factoring info: body override > companies table > profiles table
  let factoringEmail = body.factoringEmail || companyInfo.factoring_email || ''
  let factoringName = body.factoringName || companyInfo.factoring_company || 'Factoring Company'

  // If still no factoring email, check profiles table
  if (!factoringEmail) {
    try {
      const profRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=factoring_email,factoring_company&limit=1`,
        { headers }
      )
      if (profRes.ok) {
        const profData = await profRes.json()
        factoringEmail = profData?.[0]?.factoring_email || ''
        if (!factoringName || factoringName === 'Factoring Company') {
          factoringName = profData?.[0]?.factoring_company || 'Factoring Company'
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── 4. Fetch all documents attached to this load (rate con, BOL, POD, etc.) ──
  let loadDocs = []
  try {
    const docsRes = await fetch(
      `${supabaseUrl}/rest/v1/documents?load_id=eq.${load.id}&select=id,name,file_url,doc_type,file_path&order=uploaded_at.asc`,
      { headers }
    )
    if (docsRes.ok) loadDocs = await docsRes.json()
  } catch { /* no docs — still send invoice */ }

  // Download documents as base64 attachments for the email
  const attachments = []
  for (const doc of loadDocs.slice(0, 10)) { // max 10 attachments
    if (!doc.file_url) continue
    try {
      const fileRes = await fetch(doc.file_url)
      if (!fileRes.ok) continue
      const buffer = await fileRes.arrayBuffer()
      // Chunked — naive spread blows the Edge arg stack on real photos
      const base64 = (() => {
        const bytes = new Uint8Array(buffer)
        const chunkSize = 8192
        let binary = ''
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
        }
        return btoa(binary)
      })()
      const ext = (doc.file_url.split('.').pop() || 'pdf').split('?')[0].toLowerCase()
      const docLabel = (doc.doc_type || doc.name || 'document').replace(/_/g, ' ')
      attachments.push({
        filename: `${invoiceNumber}_${docLabel}.${ext}`,
        content: base64,
      })
    } catch { /* skip failed downloads */ }
  }

  // ── 5. Send invoice email to broker ──
  let emailSent = false

  const invoiceHtml = buildInvoiceEmailHtml({
    invoiceNumber, invoiceDate: now, dueDate,
    carrier: companyInfo, broker, brokerEmail,
    origin, dest, miles, refNumber, driverName,
    rate, route, lineItems: items, totalAmount,
  })

  if (resendKey && brokerEmail) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: companyInfo.email ? `${companyInfo.name || 'Carrier'} <${companyInfo.email}>` : 'Qivori Dispatch <hello@qivori.com>',
          reply_to: companyInfo.email || 'hello@qivori.com',
          to: [brokerEmail],
          subject: `Invoice ${invoiceNumber} — ${route} — $${(totalAmount || rate).toLocaleString()}`,
          html: invoiceHtml,
        }),
      })
      emailSent = emailRes.ok
    } catch { emailSent = false }
  }

  // ── 6. Send factoring packet — invoice + all docs attached ──
  let factoringEmailed = false
  if (resendKey && factoringEmail) {
    try {
      const factoringSubject = `Factoring Packet — ${invoiceNumber} — ${broker} — ${route} — $${(totalAmount || rate).toLocaleString()}`
      const factoringHtml = buildFactoringPacketHtml({
        invoiceNumber, invoiceDate: now, dueDate,
        carrier: companyInfo, broker, brokerEmail,
        origin, dest, miles, refNumber, driverName,
        rate, route, lineItems: items, totalAmount,
        docCount: loadDocs.length,
        factoringName, factoringEmail,
      })

      const factoringPayload = {
        from: companyInfo.email ? `${companyInfo.name || 'Carrier'} <${companyInfo.email}>` : 'Qivori Dispatch <hello@qivori.com>',
        reply_to: companyInfo.email || 'hello@qivori.com',
        to: [factoringEmail],
        subject: factoringSubject,
        html: factoringHtml,
      }
      if (attachments.length > 0) factoringPayload.attachments = attachments

      const factRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify(factoringPayload),
      })
      factoringEmailed = factRes.ok
    } catch { factoringEmailed = false }
  }

  // ── 7. Store invoice HTML in Supabase Storage + user_documents table for mobile visibility ──
  try {
    const storagePath = `invoices/${user.id}/${invoiceNumber}.html`
    await fetch(`${supabaseUrl}/storage/v1/object/documents/${storagePath}`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'text/html',
        'x-upsert': 'true',
      },
      body: invoiceHtml,
    })
    await fetch(`${supabaseUrl}/rest/v1/user_documents`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner_id: user.id,
        name: `Invoice ${invoiceNumber} — ${route}`,
        category: 'invoice',
        mime_type: 'text/html',
        storage_path: storagePath,
        size_bytes: new TextEncoder().encode(invoiceHtml).length,
        load_number: load.load_number || null,
        created_at: now.toISOString(),
      }),
    })
  } catch { /* non-fatal */ }

  return { invoiceId, invoiceNumber, emailSent, factoringEmailed, docsAttached: attachments.length }
}

/**
 * Build a professional invoice email HTML with Qivori branding.
 */
function buildInvoiceEmailHtml({ invoiceNumber, invoiceDate, dueDate, carrier, broker, origin, dest, miles, refNumber, driverName, rate, route, lineItems, totalAmount }) {
  const esc = (s) => String(s || '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c]))
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const rpmVal = miles > 0 ? (rate / miles).toFixed(2) : '—'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:30px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#12121a,#1a1a28);border:1px solid #2a2a35;border-radius:16px 16px 0 0;padding:28px 24px;text-align:center;">
    <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#fff;margin-bottom:4px;">
      QI<span style="color:#f0a500;">VORI</span>
      <span style="font-size:12px;color:#00d4aa;letter-spacing:2px;margin-left:6px;">AI</span>
    </div>
    <div style="font-size:12px;color:#8a8f98;letter-spacing:1px;">INVOICE</div>
  </div>

  <!-- Invoice body -->
  <div style="background:#16161e;border-left:1px solid #2a2a35;border-right:1px solid #2a2a35;padding:28px 24px;">

    <!-- Invoice meta -->
    <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
      <div>
        <div style="font-size:10px;color:#8a8f98;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Invoice Number</div>
        <div style="font-size:18px;font-weight:800;color:#f0a500;letter-spacing:1px;">${esc(invoiceNumber)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;color:#8a8f98;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Date Issued</div>
        <div style="font-size:13px;color:#e8e6e3;font-weight:600;">${fmtDate(invoiceDate)}</div>
        <div style="font-size:10px;color:#8a8f98;margin-top:6px;">DUE: ${fmtDate(dueDate)}</div>
        <div style="font-size:9px;color:#f0a500;font-weight:700;margin-top:2px;">NET 30</div>
      </div>
    </div>

    <div style="height:1px;background:#2a2a35;margin:0 0 20px;"></div>

    <!-- Carrier & Broker info -->
    <table style="width:100%;margin-bottom:20px;"><tr>
      <td style="vertical-align:top;width:50%;">
        <div style="font-size:9px;color:#f0a500;font-weight:700;letter-spacing:2px;margin-bottom:6px;">FROM (CARRIER)</div>
        <div style="font-size:14px;color:#e8e6e3;font-weight:700;margin-bottom:2px;">${esc(carrier.name || 'Carrier')}</div>
        ${carrier.mc_number ? `<div style="font-size:11px;color:#8a8f98;">MC# ${esc(carrier.mc_number)}</div>` : ''}
        ${carrier.address ? `<div style="font-size:11px;color:#8a8f98;">${esc(carrier.address)}</div>` : ''}
        ${carrier.phone ? `<div style="font-size:11px;color:#8a8f98;">${esc(carrier.phone)}</div>` : ''}
        ${carrier.email ? `<div style="font-size:11px;color:#8a8f98;">${esc(carrier.email)}</div>` : ''}
      </td>
      <td style="vertical-align:top;width:50%;text-align:right;">
        <div style="font-size:9px;color:#00d4aa;font-weight:700;letter-spacing:2px;margin-bottom:6px;">BILL TO (BROKER)</div>
        <div style="font-size:14px;color:#e8e6e3;font-weight:700;">${esc(broker)}</div>
      </td>
    </tr></table>

    <div style="height:1px;background:#2a2a35;margin:0 0 20px;"></div>

    <!-- Load details -->
    <div style="font-size:9px;color:#f0a500;font-weight:700;letter-spacing:2px;margin-bottom:12px;">LOAD DETAILS</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 0;font-size:12px;color:#8a8f98;border-bottom:1px solid #2a2a35;">Origin</td>
        <td style="padding:8px 0;font-size:12px;color:#e8e6e3;font-weight:600;text-align:right;border-bottom:1px solid #2a2a35;">${esc(origin)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:12px;color:#8a8f98;border-bottom:1px solid #2a2a35;">Destination</td>
        <td style="padding:8px 0;font-size:12px;color:#e8e6e3;font-weight:600;text-align:right;border-bottom:1px solid #2a2a35;">${esc(dest)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:12px;color:#8a8f98;border-bottom:1px solid #2a2a35;">Miles</td>
        <td style="padding:8px 0;font-size:12px;color:#e8e6e3;font-weight:600;text-align:right;border-bottom:1px solid #2a2a35;">${miles > 0 ? miles.toLocaleString() : '—'}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:12px;color:#8a8f98;border-bottom:1px solid #2a2a35;">Reference #</td>
        <td style="padding:8px 0;font-size:12px;color:#e8e6e3;font-weight:600;text-align:right;border-bottom:1px solid #2a2a35;">${esc(refNumber) || '—'}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:12px;color:#8a8f98;border-bottom:1px solid #2a2a35;">Driver</td>
        <td style="padding:8px 0;font-size:12px;color:#e8e6e3;font-weight:600;text-align:right;border-bottom:1px solid #2a2a35;">${esc(driverName) || '—'}</td>
      </tr>
    </table>

    <!-- Line items -->
    <div style="font-size:9px;color:#f0a500;font-weight:700;letter-spacing:2px;margin-bottom:12px;">LINE ITEMS</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr style="background:#1e1e2a;">
        <th style="padding:10px 12px;font-size:11px;color:#8a8f98;text-align:left;font-weight:600;border-bottom:1px solid #2a2a35;">Description</th>
        <th style="padding:10px 12px;font-size:11px;color:#8a8f98;text-align:center;font-weight:600;border-bottom:1px solid #2a2a35;">Miles</th>
        <th style="padding:10px 12px;font-size:11px;color:#8a8f98;text-align:center;font-weight:600;border-bottom:1px solid #2a2a35;">Rate/Mi</th>
        <th style="padding:10px 12px;font-size:11px;color:#8a8f98;text-align:right;font-weight:600;border-bottom:1px solid #2a2a35;">Amount</th>
      </tr>
      <tr>
        <td style="padding:10px 12px;font-size:12px;color:#e8e6e3;font-weight:600;border-bottom:1px solid #2a2a35;">Freight — ${esc(route)}</td>
        <td style="padding:10px 12px;font-size:12px;color:#e8e6e3;text-align:center;border-bottom:1px solid #2a2a35;">${miles > 0 ? miles.toLocaleString() : '—'}</td>
        <td style="padding:10px 12px;font-size:12px;color:#e8e6e3;text-align:center;border-bottom:1px solid #2a2a35;">$${rpmVal}</td>
        <td style="padding:10px 12px;font-size:12px;color:#e8e6e3;font-weight:700;text-align:right;border-bottom:1px solid #2a2a35;">${fmtMoney(rate)}</td>
      </tr>
      ${(lineItems || []).map(li => `<tr>
        <td style="padding:10px 12px;font-size:12px;color:#e8e6e3;font-weight:600;border-bottom:1px solid #2a2a35;">${esc(li.description || li.type || 'Accessorial')}</td>
        <td style="padding:10px 12px;font-size:12px;color:#8a8f98;text-align:center;border-bottom:1px solid #2a2a35;">—</td>
        <td style="padding:10px 12px;font-size:12px;color:#8a8f98;text-align:center;border-bottom:1px solid #2a2a35;">—</td>
        <td style="padding:10px 12px;font-size:12px;color:#e8e6e3;font-weight:700;text-align:right;border-bottom:1px solid #2a2a35;">${fmtMoney(li.amount)}</td>
      </tr>`).join('')}
    </table>

    <!-- Total -->
    <div style="background:linear-gradient(135deg,rgba(240,165,0,0.08),rgba(240,165,0,0.02));border:1px solid rgba(240,165,0,0.2);border-radius:10px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div style="font-size:14px;font-weight:800;color:#f0a500;letter-spacing:1px;">TOTAL DUE</div>
      <div style="font-size:28px;font-weight:800;color:#f0a500;">${fmtMoney(totalAmount || rate)}</div>
    </div>

    <!-- Payment instructions -->
    <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:10px;padding:16px;">
      <div style="font-size:9px;color:#00d4aa;font-weight:700;letter-spacing:2px;margin-bottom:8px;">PAYMENT INSTRUCTIONS</div>
      <div style="font-size:12px;color:#c8c8d0;line-height:1.7;">
        Payment is due within <strong style="color:#f0a500;">30 days</strong> of the invoice date.<br>
        Please remit payment to <strong style="color:#e8e6e3;">${esc(carrier.name || 'Carrier')}</strong>.<br>
        For questions regarding this invoice, reply to this email or contact us directly.
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#12121a;border:1px solid #2a2a35;border-radius:0 0 16px 16px;padding:16px 24px;text-align:center;">
    <div style="font-size:11px;color:#555;">
      Sent via <span style="color:#f0a500;font-weight:700;">Qivori AI</span> — The AI-powered carrier operating system
    </div>
  </div>

</div>
</body></html>`
}

function buildFactoringPacketHtml({ invoiceNumber, invoiceDate, dueDate, carrier, broker, brokerEmail, origin, dest, miles, refNumber, driverName, rate, route, lineItems, totalAmount, docCount }) {
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const carrierName = carrier.name || 'Carrier'
  const carrierMC = carrier.mc_number || carrier.mc || ''
  const carrierDOT = carrier.dot_number || carrier.dot || ''
  const carrierPhone = carrier.phone || ''
  const carrierEmail = carrier.email || ''
  const carrierAddr = carrier.address || ''
  const accessorialTotal = (lineItems || []).reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px">

  <!-- Header -->
  <div style="background:#0a0a0e;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
    <div style="font-size:24px;font-weight:bold;color:#f0a500;letter-spacing:1px">FACTORING PACKET</div>
    <div style="font-size:12px;color:#888;margin-top:4px">Submitted via Qivori AI</div>
  </div>

  <div style="background:#fff;border:1px solid #e2e2e8;border-top:none;border-radius:0 0 12px 12px;padding:32px">

    <!-- Invoice Summary -->
    <div style="background:#f8f9fa;border:1px solid #e2e2e8;border-radius:8px;padding:20px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666">Invoice #</td>
          <td style="padding:4px 0;font-size:14px;font-weight:bold;text-align:right">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666">Invoice Date</td>
          <td style="padding:4px 0;font-size:13px;text-align:right">${fmtDate(invoiceDate)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666">Due Date</td>
          <td style="padding:4px 0;font-size:13px;text-align:right">${fmtDate(dueDate)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666">Total Amount</td>
          <td style="padding:4px 0;font-size:20px;font-weight:bold;color:#0a0a0e;text-align:right">$${(totalAmount || rate || 0).toLocaleString()}</td>
        </tr>
      </table>
    </div>

    <!-- Carrier Info -->
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:bold;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Carrier (Seller)</div>
      <div style="font-size:14px;font-weight:bold;color:#0a0a0e">${carrierName}</div>
      ${carrierMC ? `<div style="font-size:12px;color:#666">MC# ${carrierMC}</div>` : ''}
      ${carrierDOT ? `<div style="font-size:12px;color:#666">DOT# ${carrierDOT}</div>` : ''}
      ${carrierAddr ? `<div style="font-size:12px;color:#666">${carrierAddr}</div>` : ''}
      ${carrierPhone ? `<div style="font-size:12px;color:#666">${carrierPhone}</div>` : ''}
      ${carrierEmail ? `<div style="font-size:12px;color:#666">${carrierEmail}</div>` : ''}
    </div>

    <!-- Broker / Debtor Info -->
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:bold;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Broker / Debtor</div>
      <div style="font-size:14px;font-weight:bold;color:#0a0a0e">${broker}</div>
      ${brokerEmail ? `<div style="font-size:12px;color:#666">${brokerEmail}</div>` : ''}
    </div>

    <!-- Load Details -->
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:bold;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Load Details</div>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666;width:120px">Route</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600">${origin} → ${dest}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666">Miles</td>
          <td style="padding:4px 0;font-size:13px">${miles ? miles.toLocaleString() : 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666">Reference #</td>
          <td style="padding:4px 0;font-size:13px">${refNumber || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666">Driver</td>
          <td style="padding:4px 0;font-size:13px">${driverName || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#666">Line Haul</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600">$${(rate || 0).toLocaleString()}</td>
        </tr>
        ${(lineItems || []).map(li => `<tr>
          <td style="padding:4px 0;font-size:12px;color:#666">${li.description || 'Accessorial'}</td>
          <td style="padding:4px 0;font-size:13px">$${(parseFloat(li.amount) || 0).toLocaleString()}</td>
        </tr>`).join('')}
        ${accessorialTotal > 0 ? `<tr style="border-top:1px solid #e2e2e8">
          <td style="padding:8px 0 4px;font-size:12px;font-weight:bold">Total</td>
          <td style="padding:8px 0 4px;font-size:15px;font-weight:bold">$${(totalAmount || 0).toLocaleString()}</td>
        </tr>` : ''}
      </table>
    </div>

    <!-- Attached Documents -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:bold;color:#166534;margin-bottom:4px">📎 ${docCount || 0} Supporting Document${docCount !== 1 ? 's' : ''} Attached</div>
      <div style="font-size:11px;color:#15803d">Rate Confirmation, BOL, POD, and any receipts for this load are attached to this email.</div>
    </div>

    <!-- Notice of Assignment -->
    <div style="border:2px solid #0a0a0e;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:bold;color:#0a0a0e;margin-bottom:8px">NOTICE OF ASSIGNMENT</div>
      <div style="font-size:11px;color:#444;line-height:1.6">
        This invoice has been assigned to our factoring company. Please remit payment directly to the factoring company per the terms of our agreement. Do not pay the carrier directly for this invoice.
      </div>
    </div>

    <div style="text-align:center;padding-top:16px;border-top:1px solid #e2e2e8">
      <div style="font-size:10px;color:#999">Generated by Qivori AI — ${fmtDate(invoiceDate)}</div>
    </div>
  </div>
</div>
</body></html>`
}
