import { sendEmail, logEmail, wasEmailSent } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const MAX_EMAILS_PER_RUN = 50

export default async function handler(req) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }
  if (!anthropicKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const headers = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const weekAgoISO = weekAgo.toISOString()
  const weekLabel = `${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // Generate a unique template key for this week to prevent duplicate sends
  const weekKey = `weekly_summary_${now.getFullYear()}_W${getISOWeek(now)}`

  const results = { sent: [], skipped: [], errors: [] }
  let totalSent = 0

  try {
    // ── 1. Fetch all active carriers ──
    const profilesRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?status=in.(active,trial)&select=id,email,full_name,company_name,plan,created_at&order=created_at.asc`,
      { headers }
    )
    if (!profilesRes.ok) {
      return Response.json({ error: `Failed to fetch profiles: ${profilesRes.status}` }, { status: 500 })
    }
    const profiles = await profilesRes.json()
    if (!profiles?.length) {
      return Response.json({ message: 'No active carriers found', sent: 0 })
    }

    // ── 2. Process each carrier ──
    for (const profile of profiles) {
      if (totalSent >= MAX_EMAILS_PER_RUN) break
      if (!profile.email) continue

      // Skip if already sent this week
      const alreadySent = await wasEmailSent(profile.id, weekKey)
      if (alreadySent) {
        results.skipped.push({ email: profile.email, reason: 'already_sent_this_week' })
        continue
      }

      try {
        // ── Gather carrier data in parallel ──
        const [loadsData, expensesData, invoicesData, driversData, vehiclesData] = await Promise.all([
          fetchJSON(`${supabaseUrl}/rest/v1/loads?owner_id=eq.${profile.id}&delivery_date=gte.${weekAgoISO}&status=eq.Delivered&select=id,load_number,origin,destination,miles,gross_pay,rate_per_mile,broker,delivery_date`, headers),
          fetchJSON(`${supabaseUrl}/rest/v1/expenses?owner_id=eq.${profile.id}&date=gte.${weekAgo.toISOString().split('T')[0]}&select=id,category,amount,merchant,date`, headers),
          fetchJSON(`${supabaseUrl}/rest/v1/invoices?owner_id=eq.${profile.id}&select=id,invoice_number,amount,status,due_date,broker,created_at`, headers),
          fetchJSON(`${supabaseUrl}/rest/v1/drivers?owner_id=eq.${profile.id}&status=eq.Active&select=id,full_name,license_expiry,medical_card_expiry`, headers),
          fetchJSON(`${supabaseUrl}/rest/v1/vehicles?owner_id=eq.${profile.id}&status=eq.Active&select=id,unit_number,insurance_expiry,registration_expiry`, headers),
        ])

        const loads = loadsData || []
        const expenses = expensesData || []
        const invoices = invoicesData || []
        const drivers = driversData || []
        const vehicles = vehiclesData || []

        // ── Calculate KPIs ──
        const totalRevenue = loads.reduce((sum, l) => sum + (parseFloat(l.gross_pay) || 0), 0)
        const totalMiles = loads.reduce((sum, l) => sum + (parseInt(l.miles) || 0), 0)
        const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
        const fuelExpenses = expenses.filter(e => e.category === 'Fuel').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
        const netProfit = totalRevenue - totalExpenses
        const avgRPM = totalMiles > 0 ? (totalRevenue / totalMiles) : 0

        // Unpaid invoices (all time, status Unpaid or Overdue)
        const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid' || i.status === 'Overdue')
        const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
        const overdueInvoices = unpaidInvoices.filter(i => {
          if (!i.due_date) return false
          return new Date(i.due_date) < now
        })

        // Compliance alerts: expiring docs within 30 days
        const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        const complianceAlerts = []

        for (const d of drivers) {
          if (d.license_expiry && new Date(d.license_expiry) <= thirtyDaysOut) {
            const daysLeft = Math.ceil((new Date(d.license_expiry) - now) / (1000 * 60 * 60 * 24))
            complianceAlerts.push(`Driver ${d.full_name}'s CDL expires in ${daysLeft} days (${d.license_expiry})`)
          }
          if (d.medical_card_expiry && new Date(d.medical_card_expiry) <= thirtyDaysOut) {
            const daysLeft = Math.ceil((new Date(d.medical_card_expiry) - now) / (1000 * 60 * 60 * 24))
            complianceAlerts.push(`Driver ${d.full_name}'s medical card expires in ${daysLeft} days (${d.medical_card_expiry})`)
          }
        }
        for (const v of vehicles) {
          if (v.insurance_expiry && new Date(v.insurance_expiry) <= thirtyDaysOut) {
            const daysLeft = Math.ceil((new Date(v.insurance_expiry) - now) / (1000 * 60 * 60 * 24))
            complianceAlerts.push(`Vehicle ${v.unit_number || 'N/A'} insurance expires in ${daysLeft} days (${v.insurance_expiry})`)
          }
          if (v.registration_expiry && new Date(v.registration_expiry) <= thirtyDaysOut) {
            const daysLeft = Math.ceil((new Date(v.registration_expiry) - now) / (1000 * 60 * 60 * 24))
            complianceAlerts.push(`Vehicle ${v.unit_number || 'N/A'} registration expires in ${daysLeft} days (${v.registration_expiry})`)
          }
        }

        // Build carrier data summary for Claude
        const carrierData = {
          name: profile.full_name || 'Carrier',
          company: profile.company_name || '',
          weekLabel,
          loadsDelivered: loads.length,
          totalRevenue,
          totalExpenses,
          fuelExpenses,
          netProfit,
          totalMiles,
          avgRPM: avgRPM.toFixed(2),
          unpaidInvoiceCount: unpaidInvoices.length,
          unpaidTotal,
          overdueCount: overdueInvoices.length,
          complianceAlerts,
          topLanes: getTopLanes(loads),
        }

        // ── Generate AI insights via Claude ──
        const aiInsights = await generateWeeklySummary(anthropicKey, carrierData)
        if (!aiInsights) {
          results.errors.push({ email: profile.email, error: 'AI generation failed' })
          continue
        }

        // ── Build and send email ──
        const firstName = (profile.full_name || 'there').split(' ')[0].replace(/[<>"'&]/g, '').substring(0, 50)
        const subject = `${firstName}, your weekly recap is here — ${weekLabel}`
        const html = buildWeeklySummaryHtml({
          firstName,
          weekLabel,
          loadsDelivered: loads.length,
          totalRevenue,
          totalExpenses,
          netProfit,
          totalMiles,
          fuelExpenses,
          avgRPM,
          unpaidInvoices,
          unpaidTotal,
          overdueCount: overdueInvoices.length,
          complianceAlerts,
          aiInsights,
        })

        const sendResult = await sendEmail(profile.email, subject, html)
        if (!sendResult.ok) {
          results.errors.push({ email: profile.email, error: 'Send failed' })
          continue
        }

        // Log to prevent duplicate sends
        await logEmail(profile.id, profile.email, weekKey, {
          loads: loads.length,
          revenue: totalRevenue,
          expenses: totalExpenses,
          net_profit: netProfit,
        })

        totalSent++
        results.sent.push({
          email: profile.email,
          loads: loads.length,
          revenue: totalRevenue,
        })
      } catch (err) {
        results.errors.push({ email: profile.email, error: err.message || 'Processing failed' })
      }
    }

    results.total_profiles_checked = profiles.length
    results.summary = {
      sent: results.sent.length,
      skipped: results.skipped.length,
      errors: results.errors.length,
    }

    return Response.json(results)
  } catch (err) {
    return Response.json({ error: err.message || 'Weekly summary cron failed' }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function fetchJSON(url, headers) {
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

function getTopLanes(loads) {
  const laneMap = {}
  for (const l of loads) {
    const lane = `${l.origin} → ${l.destination}`
    if (!laneMap[lane]) laneMap[lane] = { count: 0, revenue: 0 }
    laneMap[lane].count++
    laneMap[lane].revenue += parseFloat(l.gross_pay) || 0
  }
  return Object.entries(laneMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 3)
    .map(([lane, stats]) => `${lane} (${stats.count} loads, $${stats.revenue.toFixed(0)})`)
}

// ═══════════════════════════════════════════════════════════════
// AI SUMMARY GENERATION
// ═══════════════════════════════════════════════════════════════

async function generateWeeklySummary(apiKey, data) {
  const systemPrompt = `You are Qivori AI, an expert trucking business analyst. You write personalized weekly summary insights for carrier owner-operators and small fleet owners.

RULES:
- Write exactly 3 short paragraphs (2-3 sentences each)
- Paragraph 1: Performance summary — highlight revenue, loads delivered, RPM, miles. Compare to industry benchmarks when possible.
- Paragraph 2: Financial health — net profit margin, expense breakdown, fuel cost trends, payment collection status.
- Paragraph 3: Action items & opportunities — what they should do this week (collect overdue invoices, renew expiring docs, optimize lanes, reduce deadhead, etc.)
- Be specific with numbers (use the data provided, never invent data)
- Be encouraging but honest — if numbers are down, say so constructively
- Use trucking industry language naturally
- If they had zero loads/revenue this week, encourage them to use Qivori's load board and AI dispatch features
- Keep total response under 250 words
- Write ONLY the 3 paragraphs, no headers or labels
- Do NOT use markdown formatting`

  const userMessage = `Weekly data for ${data.name}${data.company ? ` (${data.company})` : ''}:
Week: ${data.weekLabel}
Loads delivered: ${data.loadsDelivered}
Total revenue: $${data.totalRevenue.toFixed(2)}
Total expenses: $${data.totalExpenses.toFixed(2)}
Fuel spend: $${data.fuelExpenses.toFixed(2)}
Net profit: $${data.netProfit.toFixed(2)}
Miles driven: ${data.totalMiles}
Average RPM: $${data.avgRPM}
Unpaid invoices: ${data.unpaidInvoiceCount} ($${data.unpaidTotal.toFixed(2)} outstanding)
Overdue invoices: ${data.overdueCount}
Compliance alerts: ${data.complianceAlerts.length > 0 ? data.complianceAlerts.join('; ') : 'None'}
Top lanes: ${data.topLanes.length > 0 ? data.topLanes.join('; ') : 'None this week'}

Write 3 personalized insight paragraphs for this carrier.`

  const models = ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022']

  for (const model of models) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })
      if (res.ok) {
        const result = await res.json()
        return result.content?.[0]?.text || null
      }
    } catch (e) { continue }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
// HTML EMAIL TEMPLATE
// ═══════════════════════════════════════════════════════════════

function buildWeeklySummaryHtml({
  firstName, weekLabel, loadsDelivered, totalRevenue, totalExpenses,
  netProfit, totalMiles, fuelExpenses, avgRPM, unpaidInvoices, unpaidTotal,
  overdueCount, complianceAlerts, aiInsights,
}) {
  const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtInt = (n) => n.toLocaleString('en-US')
  const profitColor = netProfit >= 0 ? '#22c55e' : '#ef4444'

  // AI insights paragraphs
  const insightParagraphs = aiInsights.split('\n\n').filter(Boolean)
  const insightsHtml = insightParagraphs
    .map(p => `<p style="color:#c8c8d0;font-size:14px;line-height:1.7;margin:0 0 14px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

  // Action items: unpaid invoices + compliance alerts
  let actionItemsHtml = ''
  if (unpaidInvoices.length > 0 || complianceAlerts.length > 0) {
    let items = ''
    if (overdueCount > 0) {
      items += `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a35;">
          <span style="color:#ef4444;font-size:16px;margin-right:8px;">&#9888;</span>
          <span style="color:#c8c8d0;font-size:13px;">${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''} — $${fmt(unpaidTotal)} outstanding</span>
        </td>
      </tr>`
    } else if (unpaidInvoices.length > 0) {
      items += `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a35;">
          <span style="color:#f0a500;font-size:16px;margin-right:8px;">&#9679;</span>
          <span style="color:#c8c8d0;font-size:13px;">${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length > 1 ? 's' : ''} — $${fmt(unpaidTotal)} pending</span>
        </td>
      </tr>`
    }
    for (const alert of complianceAlerts.slice(0, 5)) {
      items += `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a35;">
          <span style="color:#ef4444;font-size:16px;margin-right:8px;">&#9888;</span>
          <span style="color:#c8c8d0;font-size:13px;">${escapeHtml(alert)}</span>
        </td>
      </tr>`
    }

    actionItemsHtml = `
    <div style="margin-top:24px;">
      <div style="font-size:11px;color:#f0a500;font-weight:700;letter-spacing:2px;margin-bottom:12px;">ACTION ITEMS</div>
      <table style="width:100%;border-collapse:collapse;background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;">
        ${items}
      </table>
    </div>`
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">

<!-- Header -->
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
<p style="color:#8a8a9a;font-size:12px;letter-spacing:1px;margin:8px 0 0;">WEEKLY INTELLIGENCE REPORT</p>
</div>

<!-- Greeting -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:16px;">
<h2 style="color:#fff;font-size:18px;margin:0 0 4px;">Hey ${firstName},</h2>
<p style="color:#8a8a9a;font-size:13px;margin:0;">Here's your business snapshot for <strong style="color:#fff;">${weekLabel}</strong></p>
</div>

<!-- KPI Row -->
<div style="margin-bottom:16px;">
<table style="width:100%;border-collapse:separate;border-spacing:8px 0;">
<tr>
<td style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:16px 12px;text-align:center;width:25%;">
<div style="color:#f0a500;font-size:22px;font-weight:800;">${loadsDelivered}</div>
<div style="color:#8a8a9a;font-size:10px;letter-spacing:1px;margin-top:4px;">LOADS</div>
</td>
<td style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:16px 12px;text-align:center;width:25%;">
<div style="color:#22c55e;font-size:22px;font-weight:800;">$${fmtInt(Math.round(totalRevenue))}</div>
<div style="color:#8a8a9a;font-size:10px;letter-spacing:1px;margin-top:4px;">REVENUE</div>
</td>
<td style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:16px 12px;text-align:center;width:25%;">
<div style="color:#ef4444;font-size:22px;font-weight:800;">$${fmtInt(Math.round(totalExpenses))}</div>
<div style="color:#8a8a9a;font-size:10px;letter-spacing:1px;margin-top:4px;">EXPENSES</div>
</td>
<td style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:16px 12px;text-align:center;width:25%;">
<div style="color:${profitColor};font-size:22px;font-weight:800;">$${fmtInt(Math.round(netProfit))}</div>
<div style="color:#8a8a9a;font-size:10px;letter-spacing:1px;margin-top:4px;">NET PROFIT</div>
</td>
</tr>
</table>
</div>

<!-- Secondary metrics -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:16px 20px;margin-bottom:16px;">
<table style="width:100%;border-collapse:collapse;">
<tr>
<td style="padding:6px 0;color:#8a8a9a;font-size:13px;">Miles Driven</td>
<td style="padding:6px 0;color:#fff;font-size:13px;font-weight:700;text-align:right;">${fmtInt(totalMiles)} mi</td>
</tr>
<tr>
<td style="padding:6px 0;color:#8a8a9a;font-size:13px;border-top:1px solid #2a2a35;">Avg Rate/Mile</td>
<td style="padding:6px 0;color:#f0a500;font-size:13px;font-weight:700;text-align:right;border-top:1px solid #2a2a35;">$${avgRPM.toFixed(2)}</td>
</tr>
<tr>
<td style="padding:6px 0;color:#8a8a9a;font-size:13px;border-top:1px solid #2a2a35;">Fuel Spend</td>
<td style="padding:6px 0;color:#ef4444;font-size:13px;font-weight:700;text-align:right;border-top:1px solid #2a2a35;">$${fmt(fuelExpenses)}</td>
</tr>
</table>
</div>

<!-- AI Insights -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:16px;">
<div style="font-size:11px;color:#4d8ef0;font-weight:700;letter-spacing:2px;margin-bottom:16px;">
<span style="margin-right:6px;">&#9733;</span>AI INSIGHTS
</div>
${insightsHtml}
</div>

<!-- Action Items -->
${actionItemsHtml ? `<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">${actionItemsHtml}</div>` : ''}

<!-- CTA -->
<div style="text-align:center;margin:24px 0;">
<a href="https://www.qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 48px;border-radius:10px;text-decoration:none;">Open Qivori AI &rarr;</a>
</div>

<!-- Footer -->
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Powered by Qivori AI &mdash; The Operating System for Modern Carriers</p>
<p style="color:#555;font-size:11px;margin:4px 0 0;">Questions? Reply to this email &middot; hello@qivori.com</p>
<p style="color:#444;font-size:10px;margin:12px 0 0;">You're receiving this because you have an active Qivori account. Weekly summaries are sent every Sunday.</p>
</div>

</div></body></html>`
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
