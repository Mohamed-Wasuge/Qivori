import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const sbH = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

/**
 * GET /api/export-data?type=tax&year=2026&format=csv
 * Export loads, expenses, invoices for tax purposes.
 * type: 'tax' | 'loads' | 'expenses' | 'invoices' | 'ifta'
 * format: 'csv' | 'json'
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  try {
    const userId = req._user.id
    const url = new URL(req.url)
    const type = url.searchParams.get('type') || 'tax'
    const year = url.searchParams.get('year') || new Date().getFullYear().toString()
    const format = url.searchParams.get('format') || 'csv'

    const yearStart = `${year}-01-01`
    const yearEnd   = `${year}-12-31`

    let rows = []
    let filename = ''
    let headers = []

    if (type === 'loads' || type === 'tax') {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/loads?user_id=eq.${userId}&delivery_date=gte.${yearStart}&delivery_date=lte.${yearEnd}&select=load_number,origin,destination,pickup_date,delivery_date,gross_pay,miles,broker_name,status&order=delivery_date.asc`,
        { headers: sbH() }
      )
      const loads = res.ok ? await res.json() : []
      if (type === 'loads') {
        rows = loads
        headers = ['load_number', 'origin', 'destination', 'pickup_date', 'delivery_date', 'gross_pay', 'miles', 'broker_name', 'status']
        filename = `loads_${year}.csv`
      } else {
        rows = loads.map(l => ({ ...l, record_type: 'income' }))
      }
    }

    if (type === 'expenses' || type === 'tax') {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/expenses?user_id=eq.${userId}&date=gte.${yearStart}&date=lte.${yearEnd}&select=date,category,amount,description,load_number&order=date.asc`,
        { headers: sbH() }
      )
      const expenses = res.ok ? await res.json() : []
      if (type === 'expenses') {
        rows = expenses
        headers = ['date', 'category', 'amount', 'description', 'load_number']
        filename = `expenses_${year}.csv`
      } else {
        rows = [...rows, ...expenses.map(e => ({ ...e, record_type: 'expense' }))]
      }
    }

    if (type === 'invoices') {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/invoices?user_id=eq.${userId}&created_at=gte.${yearStart}&created_at=lte.${yearEnd}T23:59:59&select=invoice_number,broker_name,amount,status,created_at,sent_at,paid_at&order=created_at.asc`,
        { headers: sbH() }
      )
      rows = res.ok ? await res.json() : []
      headers = ['invoice_number', 'broker_name', 'amount', 'status', 'created_at', 'sent_at', 'paid_at']
      filename = `invoices_${year}.csv`
    }

    if (type === 'tax') {
      headers = ['record_type', 'load_number', 'origin', 'destination', 'pickup_date', 'delivery_date', 'gross_pay', 'miles', 'broker_name', 'date', 'category', 'amount', 'description']
      filename = `tax_export_${year}.csv`
    }

    if (format === 'json') {
      return new Response(JSON.stringify({ year, type, count: rows.length, data: rows }), {
        headers: {
          ...corsHeaders(req),
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename.replace('.csv', '.json')}"`,
        },
      })
    }

    // Build CSV
    const csvHeaders = headers.length ? headers : Object.keys(rows[0] || {})
    const csvLines = [
      csvHeaders.join(','),
      ...rows.map(row =>
        csvHeaders.map(h => {
          const val = row[h] ?? ''
          const str = String(val)
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"` : str
        }).join(',')
      ),
    ]

    return new Response(csvLines.join('\n'), {
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })

  } catch (err) {
    console.error('[export-data]', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
