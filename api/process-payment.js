/**
 * POST /api/process-payment
 * AI-powered payment processing.
 * Carrier uploads payment confirmation (check stub, ACH receipt, remittance).
 * Claude reads the document, extracts payment details, matches to invoice,
 * detects short pays, and updates the books.
 *
 * Body: { image_url, invoice_id? }
 * If invoice_id is provided, matches to that invoice.
 * If not, AI tries to match based on extracted data.
 */
import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

function sbHeaders(prefer) {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { 'Prefer': prefer } : {}) }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!ANTHROPIC_KEY) return Response.json({ error: 'AI not configured' }, { status: 500, headers: corsHeaders(req) })

  try {
    const { image_url, invoice_id } = await req.json()
    if (!image_url) return Response.json({ error: 'image_url required' }, { status: 400, headers: corsHeaders(req) })

    // Fetch carrier's invoices for matching
    const invRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invoices?owner_id=eq.${user.id}&status=in.(Unpaid,Factored)&select=*&order=created_at.desc&limit=50`,
      { headers: sbHeaders() }
    )
    const invoices = invRes.ok ? await invRes.json() : []

    const invoiceList = invoices.map(i =>
      `${i.invoice_number || i.id}: $${i.amount} | ${i.broker || '—'} | ${i.route || '—'} | ${i.status}`
    ).join('\n')

    // Claude Vision — read the payment document
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: image_url } },
            { type: 'text', text: `You are Q, an AI bookkeeper for a trucking company. A carrier uploaded a payment confirmation document (check stub, ACH receipt, remittance advice, bank deposit, or payment email).

Extract the payment details from this document.

CARRIER'S OPEN INVOICES:
${invoiceList || 'No open invoices found'}

${invoice_id ? `The carrier says this payment is for invoice: ${invoice_id}` : 'Try to match this payment to one of the open invoices above.'}

Respond in JSON ONLY:
{
  "payment_amount": 0.00,
  "payer_name": "who sent the payment (broker or factoring company)",
  "payment_date": "YYYY-MM-DD or null",
  "payment_method": "ACH|check|wire|factoring|unknown",
  "reference_number": "check number, ACH trace, or reference",
  "matched_invoice": "invoice number that this payment matches" or null,
  "invoiced_amount": 0.00,
  "short_pay": true/false,
  "short_pay_amount": 0.00,
  "short_pay_reason": "deduction description if visible" or null,
  "confidence": 0-100,
  "notes": "any additional details from the document"
}

Be precise with dollar amounts. If you see deductions (fuel advance, factoring fee, lumper deduction, etc.), note them. Short pay = payment amount < invoiced amount.` },
          ],
        }],
      }),
    })

    if (!res.ok) {
      return Response.json({ error: 'AI analysis failed' }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''

    let extracted = { payment_amount: 0, confidence: 0 }
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try { extracted = JSON.parse(jsonMatch[0]) } catch {}
    }

    // Find the matched invoice
    let matchedInvoice = null
    if (extracted.matched_invoice) {
      matchedInvoice = invoices.find(i =>
        i.invoice_number === extracted.matched_invoice ||
        i.id === extracted.matched_invoice
      )
    }
    if (!matchedInvoice && invoice_id) {
      matchedInvoice = invoices.find(i => i.id === invoice_id || i.invoice_number === invoice_id)
    }

    // Determine status
    const paymentAmount = parseFloat(extracted.payment_amount) || 0
    const invoicedAmount = matchedInvoice ? parseFloat(matchedInvoice.amount) || 0 : parseFloat(extracted.invoiced_amount) || 0
    const isShortPay = paymentAmount > 0 && invoicedAmount > 0 && paymentAmount < invoicedAmount * 0.99 // 1% tolerance
    const shortPayAmount = isShortPay ? Math.round((invoicedAmount - paymentAmount) * 100) / 100 : 0
    const isFullPay = paymentAmount > 0 && paymentAmount >= invoicedAmount * 0.99

    // Update invoice if matched
    let invoiceUpdated = false
    if (matchedInvoice && SUPABASE_URL && SERVICE_KEY) {
      const updates = {}

      if (isFullPay) {
        updates.status = 'Paid'
        updates.paid_at = new Date().toISOString()
      } else if (isShortPay) {
        updates.status = 'Disputed'
        updates.notes = `Short pay detected: received $${paymentAmount.toLocaleString()} of $${invoicedAmount.toLocaleString()} (short $${shortPayAmount.toLocaleString()}). ${extracted.short_pay_reason || 'No reason provided on remittance.'}. Payment ref: ${extracted.reference_number || '—'}`
      }

      if (Object.keys(updates).length > 0) {
        const updateRes = await fetch(
          `${SUPABASE_URL}/rest/v1/invoices?id=eq.${matchedInvoice.id}&owner_id=eq.${user.id}`,
          { method: 'PATCH', headers: sbHeaders('return=representation'), body: JSON.stringify(updates) }
        )
        invoiceUpdated = updateRes.ok
      }

      // Save payment record
      await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
        method: 'POST', headers: sbHeaders('return=minimal'),
        body: JSON.stringify({
          owner_id: user.id,
          name: `Payment: ${extracted.payer_name || 'Unknown'} — $${paymentAmount.toLocaleString()}`,
          file_url: image_url,
          doc_type: 'payment_confirmation',
          load_id: matchedInvoice?.load_id || null,
          metadata: {
            payment_amount: paymentAmount,
            payer: extracted.payer_name,
            payment_date: extracted.payment_date,
            payment_method: extracted.payment_method,
            reference_number: extracted.reference_number,
            invoice_number: matchedInvoice?.invoice_number || extracted.matched_invoice,
            short_pay: isShortPay,
            short_pay_amount: shortPayAmount,
            short_pay_reason: extracted.short_pay_reason,
          },
        }),
      })
    }

    // Build response
    return Response.json({
      success: true,
      payment: {
        amount: paymentAmount,
        payer: extracted.payer_name || 'Unknown',
        date: extracted.payment_date,
        method: extracted.payment_method || 'unknown',
        reference: extracted.reference_number,
      },
      invoice: matchedInvoice ? {
        invoice_number: matchedInvoice.invoice_number,
        invoiced_amount: invoicedAmount,
        broker: matchedInvoice.broker,
        route: matchedInvoice.route,
        status: isFullPay ? 'Paid' : isShortPay ? 'Disputed' : matchedInvoice.status,
        updated: invoiceUpdated,
      } : null,
      short_pay: isShortPay ? {
        detected: true,
        invoiced: invoicedAmount,
        received: paymentAmount,
        short: shortPayAmount,
        reason: extracted.short_pay_reason || 'No reason on remittance',
        action: `Broker paid $${shortPayAmount.toLocaleString()} less than invoiced. Contact ${extracted.payer_name || 'broker'} for the difference or file a dispute.`,
      } : { detected: false },
      confidence: extracted.confidence || 50,
      message: isShortPay
        ? `SHORT PAY: Received $${paymentAmount.toLocaleString()} on $${invoicedAmount.toLocaleString()} invoice. Short $${shortPayAmount.toLocaleString()}. Invoice marked as Disputed.`
        : isFullPay
        ? `Payment confirmed: $${paymentAmount.toLocaleString()} from ${extracted.payer_name || 'broker'}. Invoice ${matchedInvoice?.invoice_number || '—'} marked as Paid.`
        : `Payment of $${paymentAmount.toLocaleString()} detected. ${matchedInvoice ? 'Matched to ' + matchedInvoice.invoice_number : 'Could not match to an invoice — check manually.'}`,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
