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
  const rate = parseFloat(invoice.amount) || 0
  const rpmVal = miles > 0 ? (rate / miles).toFixed(2) : '—'
  const refNumber = load?.reference_number || load?.po_number || load?.load_number || invoice.load_number || '—'
  const driverName = invoice.driver_name || load?.driver_name || '—'
  const broker = invoice.broker || load?.broker || '—'
  const brokerEmail = load?.broker_email || ''

  // Status badge color
  const statusColors = {
    'Unpaid': { bg: 'rgba(240,165,0,0.15)', color: '#f0a500' },
    'Paid': { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    'Overdue': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
    'Factored': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
    'Disputed': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  }
  const st = statusColors[invoice.status] || statusColors['Unpaid']

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${esc(invoice.invoice_number)} — Qivori AI</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Bebas+Neue&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0e; color: #e8e6e3;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    @media print {
      body { background: #fff; color: #1a1a1a; }
      .no-print { display: none !important; }
      .invoice-card { border-color: #ddd !important; background: #fff !important; }
      .dark-text { color: #1a1a1a !important; }
      .muted-text { color: #666 !important; }
      .accent-text { color: #b87a00 !important; }
      .surface { background: #f5f5f5 !important; border-color: #ddd !important; }
      .border-row { border-color: #eee !important; }
    }
    .page { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
    .invoice-card { background: #16161e; border: 1px solid #2a2a35; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #12121a, #1a1a28); padding: 32px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #2a2a35; }
    .logo { font-size: 32px; font-weight: 800; letter-spacing: 5px; color: #fff; }
    .logo .gold { color: #f0a500; }
    .logo .ai { font-size: 12px; color: #00d4aa; letter-spacing: 2px; margin-left: 6px; font-weight: 700; }
    .badge { display: inline-block; padding: 4px 14px; border-radius: 8px; font-size: 11px; font-weight: 700; letter-spacing: 1px; }
    .body { padding: 32px; }
    .section-label { font-size: 10px; font-weight: 700; color: #f0a500; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #2a2a35; font-size: 13px; }
    .detail-row .label { color: #8a8f98; }
    .detail-row .value { color: #e8e6e3; font-weight: 600; text-align: right; }
    .total-box { background: linear-gradient(135deg, rgba(240,165,0,0.1), rgba(240,165,0,0.03)); border: 1px solid rgba(240,165,0,0.25); border-radius: 12px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; margin: 24px 0; }
    .total-label { font-size: 16px; font-weight: 800; color: #f0a500; letter-spacing: 2px; }
    .total-value { font-size: 36px; font-weight: 800; color: #f0a500; font-family: 'Bebas Neue', sans-serif; letter-spacing: 2px; }
    .line-items { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .line-items th { padding: 10px 14px; font-size: 11px; color: #8a8f98; font-weight: 600; text-align: left; background: #1e1e2a; border-bottom: 1px solid #2a2a35; }
    .line-items th:last-child, .line-items td:last-child { text-align: right; }
    .line-items th:nth-child(2), .line-items td:nth-child(2),
    .line-items th:nth-child(3), .line-items td:nth-child(3) { text-align: center; }
    .line-items td { padding: 12px 14px; font-size: 13px; color: #e8e6e3; border-bottom: 1px solid #2a2a35; }
    .payment-box { background: #1e1e2a; border: 1px solid #2a2a35; border-radius: 10px; padding: 20px; margin-top: 24px; }
    .footer { background: #12121a; border-top: 1px solid #2a2a35; padding: 16px 32px; text-align: center; font-size: 11px; color: #555; }
    .print-btn { position: fixed; bottom: 24px; right: 24px; background: #f0a500; color: #000; border: none; padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 4px 20px rgba(240,165,0,0.3); }
    .print-btn:hover { background: #d49200; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .party { flex: 1; }
    .party-label { font-size: 9px; font-weight: 700; letter-spacing: 2px; margin-bottom: 6px; }
    .party-name { font-size: 16px; font-weight: 700; color: #e8e6e3; margin-bottom: 4px; }
    .party-detail { font-size: 11px; color: #8a8f98; line-height: 1.6; }
    .divider { height: 1px; background: #2a2a35; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="page">
    <div class="invoice-card">
      <!-- Header -->
      <div class="header">
        <div>
          <div class="logo">QI<span class="gold">VORI</span><span class="ai">AI</span></div>
          <div style="font-size:12px;color:#8a8f98;margin-top:4px;">Invoice from ${esc(company.name || 'Carrier')}</div>
        </div>
        <div style="text-align:right;">
          <div class="badge" style="background:${st.bg};color:${st.color};">${esc(invoice.status)}</div>
          <div style="font-size:22px;font-weight:800;color:#f0a500;margin-top:8px;font-family:'Bebas Neue',sans-serif;letter-spacing:2px;">${esc(invoice.invoice_number)}</div>
        </div>
      </div>

      <div class="body">
        <!-- Invoice meta -->
        <div style="display:flex;gap:32px;margin-bottom:24px;">
          <div>
            <div style="font-size:10px;color:#8a8f98;text-transform:uppercase;letter-spacing:1px;">Invoice Date</div>
            <div style="font-size:14px;font-weight:600;margin-top:2px;" class="dark-text">${fmtDate(invoice.invoice_date)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#8a8f98;text-transform:uppercase;letter-spacing:1px;">Due Date</div>
            <div style="font-size:14px;font-weight:600;margin-top:2px;" class="dark-text">${fmtDate(invoice.due_date)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:#8a8f98;text-transform:uppercase;letter-spacing:1px;">Terms</div>
            <div style="font-size:14px;font-weight:700;color:#f0a500;margin-top:2px;">Net 30</div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- Parties -->
        <div class="parties">
          <div class="party">
            <div class="party-label accent-text" style="color:#f0a500;">FROM (CARRIER)</div>
            <div class="party-name dark-text">${esc(company.name || 'Carrier')}</div>
            <div class="party-detail muted-text">
              ${company.mc_number ? `MC# ${esc(company.mc_number)}<br>` : ''}
              ${company.dot_number ? `DOT# ${esc(company.dot_number)}<br>` : ''}
              ${company.address ? `${esc(company.address)}<br>` : ''}
              ${company.phone ? `${esc(company.phone)}<br>` : ''}
              ${company.email ? `${esc(company.email)}` : ''}
            </div>
          </div>
          <div class="party" style="text-align:right;">
            <div class="party-label" style="color:#00d4aa;">BILL TO (BROKER)</div>
            <div class="party-name dark-text">${esc(broker)}</div>
            ${brokerEmail ? `<div class="party-detail muted-text">${esc(brokerEmail)}</div>` : ''}
          </div>
        </div>

        <div class="divider"></div>

        <!-- Load Details -->
        <div class="section-label">Load Details</div>
        <div class="detail-row border-row"><span class="label muted-text">Origin</span><span class="value dark-text">${esc(origin)}</span></div>
        <div class="detail-row border-row"><span class="label muted-text">Destination</span><span class="value dark-text">${esc(dest)}</span></div>
        <div class="detail-row border-row"><span class="label muted-text">Miles</span><span class="value dark-text">${miles > 0 ? miles.toLocaleString() : '—'}</span></div>
        <div class="detail-row border-row"><span class="label muted-text">Reference #</span><span class="value dark-text">${esc(refNumber)}</span></div>
        <div class="detail-row border-row"><span class="label muted-text">Load #</span><span class="value dark-text">${esc(invoice.load_number || '—')}</span></div>
        <div class="detail-row border-row"><span class="label muted-text">Driver</span><span class="value dark-text">${esc(driverName)}</span></div>

        <div style="height:24px;"></div>

        <!-- Line Items -->
        <div class="section-label">Line Items</div>
        <table class="line-items surface">
          <thead>
            <tr>
              <th>Description</th>
              <th>Miles</th>
              <th>Rate/Mi</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="dark-text" style="font-weight:600;">Freight — ${esc(invoice.route || (origin.split(',')[0] + ' to ' + dest.split(',')[0]))}</td>
              <td class="dark-text" style="text-align:center;">${miles > 0 ? miles.toLocaleString() : '—'}</td>
              <td class="dark-text" style="text-align:center;">$${rpmVal}</td>
              <td class="dark-text" style="font-weight:700;">${fmtMoney(rate)}</td>
            </tr>
          </tbody>
        </table>

        <!-- Total -->
        <div class="total-box">
          <div class="total-label">TOTAL DUE</div>
          <div class="total-value">${fmtMoney(rate)}</div>
        </div>

        <!-- Payment Instructions -->
        <div class="payment-box surface">
          <div style="font-size:10px;color:#00d4aa;font-weight:700;letter-spacing:2px;margin-bottom:10px;">PAYMENT INSTRUCTIONS</div>
          <div style="font-size:13px;color:#c8c8d0;line-height:1.8;" class="muted-text">
            Payment is due within <strong style="color:#f0a500;" class="accent-text">30 days</strong> of the invoice date.<br>
            Please remit payment to <strong class="dark-text" style="color:#e8e6e3;">${esc(company.name || 'Carrier')}</strong>.<br>
            For questions regarding this invoice, please contact us directly.
            ${company.phone ? `<br>Phone: ${esc(company.phone)}` : ''}
            ${company.email ? `<br>Email: ${esc(company.email)}` : ''}
          </div>
        </div>

        ${invoice.notes ? `
        <div style="margin-top:16px;padding:12px 16px;background:#1e1e2a;border:1px solid #2a2a35;border-radius:8px;">
          <div style="font-size:10px;color:#8a8f98;font-weight:700;letter-spacing:1px;margin-bottom:4px;">NOTES</div>
          <div style="font-size:12px;color:#c8c8d0;">${esc(invoice.notes)}</div>
        </div>
        ` : ''}
      </div>

      <!-- Footer -->
      <div class="footer">
        Generated by <span style="color:#f0a500;font-weight:700;">Qivori AI</span> — The AI-powered carrier operating system
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
