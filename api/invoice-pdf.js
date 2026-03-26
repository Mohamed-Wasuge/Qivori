import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

/**
 * GET /api/invoice-pdf?invoiceId=xxx
 * Returns a styled HTML invoice page suitable for printing / saving as PDF.
 * Uses Qivori dark theme with gold accents.
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const url = new URL(req.url)
  const invoiceId = url.searchParams.get('invoiceId')

  if (!invoiceId) {
    return Response.json({ error: 'invoiceId query parameter required' }, { status: 400, headers: corsHeaders(req) })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  }

  try {
    // Fetch invoice — try by id first, then by invoice_number
    let invoice = null
    for (const field of ['id', 'invoice_number']) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/invoices?owner_id=eq.${user.id}&${field}=eq.${encodeURIComponent(invoiceId)}&select=*&limit=1`,
        { headers }
      )
      if (res.ok) {
        const data = await res.json()
        if (data.length > 0) { invoice = data[0]; break }
      }
    }

    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404, headers: corsHeaders(req) })
    }

    // Fetch load details if linked
    let load = null
    if (invoice.load_id) {
      const loadRes = await fetch(
        `${supabaseUrl}/rest/v1/loads?id=eq.${invoice.load_id}&select=*&limit=1`,
        { headers }
      )
      if (loadRes.ok) {
        const loadData = await loadRes.json()
        if (loadData.length > 0) load = loadData[0]
      }
    }

    // Fetch company info
    let company = { name: 'Carrier', address: '', phone: '', email: '', mc_number: '', dot_number: '' }
    try {
      const compRes = await fetch(
        `${supabaseUrl}/rest/v1/companies?owner_id=eq.${user.id}&select=*&limit=1`,
        { headers }
      )
      if (compRes.ok) {
        const compData = await compRes.json()
        if (compData.length > 0) company = compData[0]
      }
    } catch { /* use defaults */ }

    const html = buildInvoicePdfHtml({ invoice, load, company })

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'text/html; charset=utf-8',
      },
    })

  } catch (err) {
    return Response.json({ error: err.message || 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}

function buildInvoicePdfHtml({ invoice, load, company }) {
  const esc = (s) => String(s || '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c]))
  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }
    catch { return d }
  }
  const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const origin = load?.origin || invoice.route?.split('→')[0]?.trim() || '—'
  const dest = load?.destination || invoice.route?.split('→')[1]?.trim() || '—'
  const miles = load?.miles || 0
  const lineItems = invoice.line_items || []
  const accessorialTotal = lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0)
  const freightRate = parseFloat(invoice.amount) || 0
  // If line_items exist, the stored amount already includes accessorials; freight = amount - accessorials
  const freightOnly = lineItems.length > 0 ? freightRate - accessorialTotal : freightRate
  const totalDue = freightRate
  const rpmVal = miles > 0 ? (freightOnly / miles).toFixed(2) : '—'
  const refNumber = load?.reference_number || load?.po_number || load?.load_number || invoice.load_number || '—'
  const driverName = invoice.driver_name || load?.driver_name || '—'
  const broker = invoice.broker || load?.broker || '—'
  const brokerEmail = load?.broker_email || ''

  const statusColors = {
    'Unpaid': { bg: '#FEF3C7', color: '#92400E', label: 'UNPAID' },
    'Paid': { bg: '#D1FAE5', color: '#065F46', label: 'PAID' },
    'Overdue': { bg: '#FEE2E2', color: '#991B1B', label: 'OVERDUE' },
    'Factored': { bg: '#DBEAFE', color: '#1E40AF', label: 'FACTORED' },
    'Disputed': { bg: '#FEE2E2', color: '#991B1B', label: 'DISPUTED' },
    'Pending': { bg: '#F3F4F6', color: '#374151', label: 'PENDING' },
  }
  const st = statusColors[invoice.status] || statusColors['Unpaid']

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${esc(invoice.invoice_number)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #f8f9fa; color: #1a1a1a;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px; line-height: 1.5;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .page { padding: 0; }
      .invoice-card { box-shadow: none; }
    }
    .page { max-width: 820px; margin: 0 auto; padding: 32px 16px; }
    .invoice-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); overflow: hidden; }

    /* Header */
    .header { padding: 32px 40px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f0f0f0; }
    .company-name { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -0.3px; }
    .company-details { font-size: 12px; color: #666; line-height: 1.7; margin-top: 6px; }
    .invoice-title { font-size: 28px; font-weight: 800; color: #111; letter-spacing: -0.5px; text-align: right; }
    .invoice-number { font-size: 15px; font-weight: 600; color: #555; margin-top: 4px; text-align: right; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }

    /* Body */
    .body { padding: 32px 40px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .meta-label { font-size: 10px; font-weight: 700; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
    .meta-value { font-size: 14px; font-weight: 600; color: #111; }

    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 28px; padding: 20px 24px; background: #f9fafb; border-radius: 8px; border: 1px solid #f0f0f0; }
    .party-label { font-size: 10px; font-weight: 700; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
    .party-name { font-size: 16px; font-weight: 700; color: #111; margin-bottom: 4px; }
    .party-detail { font-size: 12px; color: #666; line-height: 1.7; }

    .section-label { font-size: 11px; font-weight: 700; color: #999; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px; margin-top: 28px; }
    .divider { height: 1px; background: #f0f0f0; margin: 24px 0; }

    /* Details */
    .detail-row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px; }
    .detail-row .label { color: #888; }
    .detail-row .value { color: #111; font-weight: 600; }

    /* Line items table */
    .line-items { width: 100%; border-collapse: collapse; margin: 12px 0; }
    .line-items th { padding: 12px 16px; font-size: 11px; color: #888; font-weight: 600; text-align: left; background: #f9fafb; border-bottom: 2px solid #eee; letter-spacing: 0.5px; text-transform: uppercase; }
    .line-items th:last-child { text-align: right; }
    .line-items th:nth-child(2), .line-items th:nth-child(3) { text-align: center; }
    .line-items td { padding: 14px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #f0f0f0; }
    .line-items td:last-child { text-align: right; font-weight: 700; }
    .line-items td:nth-child(2), .line-items td:nth-child(3) { text-align: center; color: #888; }

    /* Total */
    .total-section { margin: 20px 0 28px; }
    .subtotal-row { display: flex; justify-content: space-between; padding: 8px 16px; font-size: 13px; color: #666; }
    .total-row { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #111; color: #fff; border-radius: 8px; margin-top: 8px; }
    .total-row .label { font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .total-row .value { font-size: 28px; font-weight: 800; letter-spacing: 0.5px; }

    /* Payment */
    .payment-box { background: #f9fafb; border: 1px solid #eee; border-radius: 8px; padding: 20px 24px; margin-top: 24px; }
    .payment-title { font-size: 11px; font-weight: 700; color: #999; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px; }
    .payment-text { font-size: 13px; color: #555; line-height: 1.8; }
    .payment-text strong { color: #111; }

    .notes-box { margin-top: 16px; padding: 14px 18px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; }
    .notes-label { font-size: 10px; font-weight: 700; color: #92400e; letter-spacing: 1px; margin-bottom: 4px; }
    .notes-text { font-size: 12px; color: #78350f; }

    /* Footer */
    .footer { border-top: 1px solid #f0f0f0; padding: 16px 40px; text-align: center; font-size: 11px; color: #bbb; }

    .print-btn { position: fixed; bottom: 24px; right: 24px; background: #111; color: #fff; border: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
    .print-btn:hover { background: #333; }
  </style>
</head>
<body>
  <div class="page">
    <div class="invoice-card">
      <!-- Header -->
      <div class="header">
        <div>
          <div class="company-name">${esc(company.name || 'Carrier')}</div>
          <div class="company-details">
            ${company.mc_number ? `MC# ${esc(company.mc_number)}` : ''}${company.dot_number ? ` &middot; DOT# ${esc(company.dot_number)}` : ''}<br>
            ${company.address ? `${esc(company.address)}<br>` : ''}
            ${company.phone ? `${esc(company.phone)}` : ''}${company.email ? ` &middot; ${esc(company.email)}` : ''}
          </div>
        </div>
        <div>
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-number">${esc(invoice.invoice_number)}</div>
          <div style="text-align:right;margin-top:8px;">
            <span class="badge" style="background:${st.bg};color:${st.color};">${st.label}</span>
          </div>
        </div>
      </div>

      <div class="body">
        <!-- Invoice meta -->
        <div class="meta-grid">
          <div>
            <div class="meta-label">Invoice Date</div>
            <div class="meta-value">${fmtDate(invoice.invoice_date)}</div>
          </div>
          <div>
            <div class="meta-label">Due Date</div>
            <div class="meta-value">${fmtDate(invoice.due_date)}</div>
          </div>
          <div>
            <div class="meta-label">Payment Terms</div>
            <div class="meta-value">Net 30</div>
          </div>
        </div>

        <!-- Parties -->
        <div class="parties">
          <div>
            <div class="party-label">From</div>
            <div class="party-name">${esc(company.name || 'Carrier')}</div>
            <div class="party-detail">
              ${company.mc_number ? `MC# ${esc(company.mc_number)}<br>` : ''}
              ${company.address ? `${esc(company.address)}<br>` : ''}
              ${company.phone ? `${esc(company.phone)}<br>` : ''}
              ${company.email ? `${esc(company.email)}` : ''}
            </div>
          </div>
          <div>
            <div class="party-label">Bill To</div>
            <div class="party-name">${esc(broker)}</div>
            ${brokerEmail ? `<div class="party-detail">${esc(brokerEmail)}</div>` : ''}
          </div>
        </div>

        <!-- Load Details -->
        <div class="section-label">Load Details</div>
        <div class="detail-row"><span class="label">Origin</span><span class="value">${esc(origin)}</span></div>
        <div class="detail-row"><span class="label">Destination</span><span class="value">${esc(dest)}</span></div>
        <div class="detail-row"><span class="label">Miles</span><span class="value">${miles > 0 ? miles.toLocaleString() : '—'}</span></div>
        <div class="detail-row"><span class="label">Reference #</span><span class="value">${esc(refNumber)}</span></div>
        <div class="detail-row"><span class="label">Load #</span><span class="value">${esc(invoice.load_number || '—')}</span></div>
        <div class="detail-row"><span class="label">Driver</span><span class="value">${esc(driverName)}</span></div>
        ${load?.equipment ? `<div class="detail-row"><span class="label">Equipment</span><span class="value">${esc(load.equipment)}</span></div>` : ''}
        ${load?.weight ? `<div class="detail-row"><span class="label">Weight</span><span class="value">${esc(load.weight)} lbs</span></div>` : ''}

        <!-- Line Items -->
        <div class="section-label">Charges</div>
        <table class="line-items">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty / Miles</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:600;">Freight — ${esc(invoice.route || (origin.split(',')[0] + ' → ' + dest.split(',')[0]))}</td>
              <td>${miles > 0 ? miles.toLocaleString() + ' mi' : '—'}</td>
              <td>${miles > 0 ? '$' + rpmVal + '/mi' : '—'}</td>
              <td>${fmtMoney(freightOnly)}</td>
            </tr>
            ${lineItems.map(li => `<tr>
              <td style="font-weight:600;">${esc(li.description || li.type || 'Accessorial')}</td>
              <td>—</td>
              <td>—</td>
              <td>${fmtMoney(li.amount)}</td>
            </tr>`).join('')}
          </tbody>
        </table>

        <!-- Total -->
        <div class="total-section">
          ${lineItems.length > 0 ? `
            <div class="subtotal-row">
              <span>Freight</span><span>${fmtMoney(freightOnly)}</span>
            </div>
            <div class="subtotal-row">
              <span>Accessorials (${lineItems.length} item${lineItems.length > 1 ? 's' : ''})</span><span>${fmtMoney(accessorialTotal)}</span>
            </div>
          ` : ''}
          <div class="total-row">
            <span class="label">Total Due</span>
            <span class="value">${fmtMoney(totalDue)}</span>
          </div>
        </div>

        <!-- Payment Instructions -->
        <div class="payment-box">
          <div class="payment-title">Payment Instructions</div>
          <div class="payment-text">
            Payment is due within <strong>30 days</strong> of the invoice date.<br>
            Please remit payment to <strong>${esc(company.name || 'Carrier')}</strong>.<br>
            For questions regarding this invoice, please contact us directly.
            ${company.phone ? `<br>Phone: <strong>${esc(company.phone)}</strong>` : ''}
            ${company.email ? `<br>Email: <strong>${esc(company.email)}</strong>` : ''}
          </div>
        </div>

        ${invoice.notes ? `
        <div class="notes-box">
          <div class="notes-label">NOTES</div>
          <div class="notes-text">${esc(invoice.notes)}</div>
        </div>
        ` : ''}
      </div>

      <!-- Footer -->
      <div class="footer">
        Generated by Qivori AI
      </div>
    </div>

    <!-- Print button -->
    <button class="print-btn no-print" onclick="window.print()">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`
}
