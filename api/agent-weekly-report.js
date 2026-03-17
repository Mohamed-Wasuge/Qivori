/**
 * Qivori AI — Comprehensive Weekly Business Report
 * Runs every Monday at 8am via Vercel Cron.
 * Gathers all platform metrics, calls Claude for analysis, sends HTML email + SMS.
 */
export const config = { runtime: 'edge' }

import { sendEmail, sendAdminSMS } from './_lib/emails.js'

const PLAN_PRICES = { autopilot: 149, autopilot_ai: 799 }

export default async function handler(req) {
  try {
    // 1. Auth
    const authHeader = req.headers.get('authorization') || ''
    const serviceKey = req.headers.get('x-service-key') || ''
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && serviceKey !== cronSecret)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 500 })
    }

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString()
    const mondayDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` }
    const q = (path) => fetch(`${url}/rest/v1/${path}`, { headers }).then(r => r.ok ? r.json() : [])

    // 2. Gather data in parallel
    const [
      allProfiles,
      revenueThisWeek,
      revenueLastWeek,
      loadsThisWeek,
      invoicesThisWeek,
      expensesThisWeek,
      allDrivers,
      actionsThisWeek,
      decisionsThisWeek,
      emailsThisWeek,
    ] = await Promise.all([
      q('profiles?select=id,status,plan,created_at'),
      q(`revenue_events?select=id,event_type,amount_cents,plan,created_at&created_at=gte.${weekAgo}`),
      q(`revenue_events?select=id,event_type,amount_cents,plan,created_at&created_at=gte.${twoWeeksAgo}&created_at=lt.${weekAgo}`),
      q(`loads?select=id,status,rate,created_at&created_at=gte.${weekAgo}`),
      q(`invoices?select=id,status,total,created_at&created_at=gte.${weekAgo}`),
      q(`expenses?select=id,amount,created_at&created_at=gte.${weekAgo}`),
      q('drivers?select=id,status'),
      q(`agent_actions?select=id,action_type,created_at&created_at=gte.${weekAgo}`),
      q(`agent_decisions?select=id,category,priority,created_at&created_at=gte.${weekAgo}`),
      q(`email_logs?select=id,template,created_at&created_at=gte.${weekAgo}`),
    ])

    // 3. Calculate metrics
    const active = allProfiles.filter(p => p.status === 'active')
    const trial = allProfiles.filter(p => p.status === 'trial')
    const cancelled = allProfiles.filter(p => p.status === 'cancelled')
    const newThisWeek = allProfiles.filter(p => new Date(p.created_at) >= new Date(weekAgo))
    const newLastWeek = allProfiles.filter(p => {
      const d = new Date(p.created_at)
      return d >= new Date(twoWeeksAgo) && d < new Date(weekAgo)
    })

    const mrr = active.reduce((sum, p) => {
      const price = PLAN_PRICES[p.plan] || PLAN_PRICES.autopilot
      return sum + price
    }, 0)

    const revenueThisWeekTotal = revenueThisWeek.reduce((s, e) => s + (e.amount_cents || 0), 0) / 100
    const revenueLastWeekTotal = revenueLastWeek.reduce((s, e) => s + (e.amount_cents || 0), 0) / 100
    const revenueGrowth = revenueLastWeekTotal > 0
      ? (((revenueThisWeekTotal - revenueLastWeekTotal) / revenueLastWeekTotal) * 100).toFixed(1)
      : 0

    const cancelledThisWeek = cancelled.filter(p => {
      const d = new Date(p.created_at)
      return d >= new Date(weekAgo)
    }).length
    const activeLastWeek = active.length + cancelledThisWeek
    const churnRate = activeLastWeek > 0 ? ((cancelledThisWeek / activeLastWeek) * 100).toFixed(1) : 0
    const revenuePerUser = active.length > 0 ? (mrr / active.length).toFixed(0) : 0

    const loadsByStatus = {}
    let loadValueSum = 0, loadValueCount = 0
    for (const l of loadsThisWeek) {
      loadsByStatus[l.status || 'unknown'] = (loadsByStatus[l.status || 'unknown'] || 0) + 1
      if (l.rate) { loadValueSum += Number(l.rate); loadValueCount++ }
    }
    const avgLoadValue = loadValueCount > 0 ? (loadValueSum / loadValueCount).toFixed(0) : 0

    const invoicesPaid = invoicesThisWeek.filter(i => i.status === 'paid').length
    const invoicesOutstanding = invoicesThisWeek.filter(i => i.status !== 'paid').length
    const expenseTotal = expensesThisWeek.reduce((s, e) => s + (Number(e.amount) || 0), 0)

    const activeDrivers = allDrivers.filter(d => d.status === 'active').length

    const actionsByType = {}
    for (const a of actionsThisWeek) {
      actionsByType[a.action_type || 'other'] = (actionsByType[a.action_type || 'other'] || 0) + 1
    }

    const decisionsByCategory = {}
    for (const d of decisionsThisWeek) {
      decisionsByCategory[d.category || 'other'] = (decisionsByCategory[d.category || 'other'] || 0) + 1
    }

    const emailsByTemplate = {}
    for (const e of emailsThisWeek) {
      emailsByTemplate[e.template || 'other'] = (emailsByTemplate[e.template || 'other'] || 0) + 1
    }

    const revByPlan = {}
    for (const e of revenueThisWeek) {
      revByPlan[e.plan || 'unknown'] = (revByPlan[e.plan || 'unknown'] || 0) + (e.amount_cents || 0) / 100
    }

    // 4. Call Claude for analysis
    const metricsPayload = {
      mrr, active_users: active.length, trial_users: trial.length, cancelled_users: cancelled.length,
      new_users_this_week: newThisWeek.length, new_users_last_week: newLastWeek.length,
      revenue_this_week: revenueThisWeekTotal, revenue_last_week: revenueLastWeekTotal,
      revenue_growth_pct: revenueGrowth, revenue_by_plan: revByPlan,
      churn_rate: churnRate, cancelled_this_week: cancelledThisWeek,
      loads_this_week: loadsThisWeek.length, loads_by_status: loadsByStatus, avg_load_value: avgLoadValue,
      invoices_generated: invoicesThisWeek.length, invoices_paid: invoicesPaid, invoices_outstanding: invoicesOutstanding,
      expenses_total: expenseTotal,
      total_drivers: allDrivers.length, active_drivers: activeDrivers,
      agent_actions_total: actionsThisWeek.length, agent_actions_by_type: actionsByType,
      agent_decisions_total: decisionsThisWeek.length, agent_decisions_by_category: decisionsByCategory,
      emails_sent: emailsThisWeek.length, emails_by_template: emailsByTemplate,
      revenue_per_user: revenuePerUser,
    }

    let analysis = null
    const claudeKey = process.env.ANTHROPIC_API_KEY
    if (claudeKey) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: 'You are the Qivori AI Weekly Report Generator. Create a comprehensive business report for Mohamed, CEO of Qivori (trucking TMS SaaS). Analyze the data and provide: 1) Executive summary (3 sentences) 2) Revenue analysis with trends 3) Customer growth analysis 4) Feature usage insights 5) Churn analysis 6) AI agent performance summary 7) Top 3 recommendations for next week. Be data-driven and specific. Return as JSON: { executive_summary, revenue_analysis, customer_growth, feature_insights, churn_analysis, agent_performance, recommendations: [string x3] }',
          messages: [{ role: 'user', content: `Here are this week's metrics:\n${JSON.stringify(metricsPayload, null, 2)}` }],
        }),
      })
      if (claudeRes.ok) {
        const claudeData = await claudeRes.json()
        const text = claudeData.content?.[0]?.text || ''
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) analysis = JSON.parse(jsonMatch[0])
        } catch { /* use fallback */ }
      }
    }

    // Fallback if Claude unavailable
    if (!analysis) {
      analysis = {
        executive_summary: `This week Qivori processed ${loadsThisWeek.length} loads with ${active.length} active users generating $${mrr.toLocaleString()} MRR. ${newThisWeek.length} new users signed up and the AI agent performed ${actionsThisWeek.length} autonomous actions.`,
        revenue_analysis: `Weekly revenue: $${revenueThisWeekTotal.toLocaleString()} (${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}% WoW). Revenue per user: $${revenuePerUser}.`,
        customer_growth: `${newThisWeek.length} new users this week vs ${newLastWeek.length} last week. ${trial.length} in trial, ${active.length} active, ${cancelled.length} cancelled.`,
        feature_insights: `${loadsThisWeek.length} loads created, ${invoicesThisWeek.length} invoices generated, ${emailsThisWeek.length} automated emails sent.`,
        churn_analysis: `Churn rate: ${churnRate}%. ${cancelledThisWeek} cancellations this week.`,
        agent_performance: `AI agent performed ${actionsThisWeek.length} actions and made ${decisionsThisWeek.length} decisions this week.`,
        recommendations: [
          'Focus on converting trial users to paid plans.',
          'Monitor churn signals and trigger proactive outreach.',
          'Increase load board integrations to drive engagement.',
        ],
      }
    }

    // 5. Build HTML email
    const arrow = (val) => Number(val) >= 0
      ? `<span style="color:#22c55e;">&#9650; ${val}%</span>`
      : `<span style="color:#ef4444;">&#9660; ${String(val).replace('-', '')}%</span>`

    const userGrowth = newLastWeek.length > 0
      ? (((newThisWeek.length - newLastWeek.length) / newLastWeek.length) * 100).toFixed(1)
      : 0

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 16px;">

<!-- Logo -->
<div style="text-align:center;margin-bottom:32px;">
  <span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
  <span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
  <p style="color:#8a8a9a;font-size:13px;margin:8px 0 0;">Weekly Business Report</p>
</div>

<!-- KPI Dashboard -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">
  <h2 style="color:#fff;font-size:16px;margin:0 0 20px;text-align:center;">Key Metrics — Week of ${mondayDate}</h2>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td style="text-align:center;padding:12px 8px;width:25%;">
        <div style="color:#f0a500;font-size:24px;font-weight:800;">$${mrr.toLocaleString()}</div>
        <div style="color:#8a8a9a;font-size:11px;margin-top:4px;">MRR</div>
      </td>
      <td style="text-align:center;padding:12px 8px;width:25%;">
        <div style="color:#4d8ef0;font-size:24px;font-weight:800;">${active.length}</div>
        <div style="color:#8a8a9a;font-size:11px;margin-top:4px;">Active Users</div>
        <div style="font-size:11px;margin-top:2px;">${arrow(userGrowth)}</div>
      </td>
      <td style="text-align:center;padding:12px 8px;width:25%;">
        <div style="color:#22c55e;font-size:24px;font-weight:800;">${loadsThisWeek.length}</div>
        <div style="color:#8a8a9a;font-size:11px;margin-top:4px;">Loads</div>
      </td>
      <td style="text-align:center;padding:12px 8px;width:25%;">
        <div style="color:${Number(churnRate) > 5 ? '#ef4444' : '#22c55e'};font-size:24px;font-weight:800;">${churnRate}%</div>
        <div style="color:#8a8a9a;font-size:11px;margin-top:4px;">Churn Rate</div>
      </td>
    </tr>
  </table>
</div>

<!-- Revenue Comparison -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">
  <h3 style="color:#f0a500;font-size:14px;margin:0 0 12px;">Revenue This Week</h3>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:6px 0;"><span style="color:#c8c8d0;font-size:13px;">This Week</span></td>
      <td style="text-align:right;"><span style="color:#fff;font-size:14px;font-weight:700;">$${revenueThisWeekTotal.toLocaleString()}</span></td>
    </tr>
    <tr>
      <td style="padding:6px 0;"><span style="color:#c8c8d0;font-size:13px;">Last Week</span></td>
      <td style="text-align:right;"><span style="color:#8a8a9a;font-size:14px;">$${revenueLastWeekTotal.toLocaleString()}</span></td>
    </tr>
    <tr>
      <td style="padding:6px 0;"><span style="color:#c8c8d0;font-size:13px;">WoW Change</span></td>
      <td style="text-align:right;font-size:14px;">${arrow(revenueGrowth)}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;"><span style="color:#c8c8d0;font-size:13px;">Avg Load Value</span></td>
      <td style="text-align:right;"><span style="color:#fff;font-size:14px;">$${Number(avgLoadValue).toLocaleString()}</span></td>
    </tr>
  </table>
</div>

<!-- Executive Summary -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">
  <h3 style="color:#4d8ef0;font-size:14px;margin:0 0 12px;">Executive Summary</h3>
  <p style="color:#c8c8d0;font-size:13px;line-height:1.7;margin:0;">${analysis.executive_summary}</p>
</div>

<!-- Revenue Analysis -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">
  <h3 style="color:#f0a500;font-size:14px;margin:0 0 12px;">Revenue Analysis</h3>
  <p style="color:#c8c8d0;font-size:13px;line-height:1.7;margin:0;">${analysis.revenue_analysis}</p>
</div>

<!-- Customer Growth -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">
  <h3 style="color:#22c55e;font-size:14px;margin:0 0 12px;">Customer Growth</h3>
  <p style="color:#c8c8d0;font-size:13px;line-height:1.7;margin:0;">${analysis.customer_growth}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">New this week</span></td>
      <td style="text-align:right;"><span style="color:#22c55e;font-size:13px;font-weight:700;">${newThisWeek.length}</span></td>
    </tr>
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Trial</span></td>
      <td style="text-align:right;"><span style="color:#4d8ef0;font-size:13px;font-weight:700;">${trial.length}</span></td>
    </tr>
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Active</span></td>
      <td style="text-align:right;"><span style="color:#22c55e;font-size:13px;font-weight:700;">${active.length}</span></td>
    </tr>
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Cancelled</span></td>
      <td style="text-align:right;"><span style="color:#ef4444;font-size:13px;font-weight:700;">${cancelled.length}</span></td>
    </tr>
  </table>
</div>

<!-- Feature Usage -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">
  <h3 style="color:#4d8ef0;font-size:14px;margin:0 0 12px;">Feature Usage</h3>
  <p style="color:#c8c8d0;font-size:13px;line-height:1.7;margin:0;">${analysis.feature_insights}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Invoices (paid/outstanding)</span></td>
      <td style="text-align:right;"><span style="color:#fff;font-size:13px;">${invoicesPaid} / ${invoicesOutstanding}</span></td>
    </tr>
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Expenses tracked</span></td>
      <td style="text-align:right;"><span style="color:#fff;font-size:13px;">$${expenseTotal.toLocaleString()}</span></td>
    </tr>
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Drivers (active/total)</span></td>
      <td style="text-align:right;"><span style="color:#fff;font-size:13px;">${activeDrivers} / ${allDrivers.length}</span></td>
    </tr>
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Emails sent</span></td>
      <td style="text-align:right;"><span style="color:#fff;font-size:13px;">${emailsThisWeek.length}</span></td>
    </tr>
  </table>
</div>

<!-- Churn Analysis -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">
  <h3 style="color:#ef4444;font-size:14px;margin:0 0 12px;">Churn Analysis</h3>
  <p style="color:#c8c8d0;font-size:13px;line-height:1.7;margin:0;">${analysis.churn_analysis}</p>
</div>

<!-- AI Agent Performance -->
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px;margin-bottom:16px;">
  <h3 style="color:#4d8ef0;font-size:14px;margin:0 0 12px;">AI Agent Performance</h3>
  <p style="color:#c8c8d0;font-size:13px;line-height:1.7;margin:0;">${analysis.agent_performance}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Autonomous actions</span></td>
      <td style="text-align:right;"><span style="color:#4d8ef0;font-size:13px;font-weight:700;">${actionsThisWeek.length}</span></td>
    </tr>
    <tr>
      <td style="padding:4px 0;"><span style="color:#8a8a9a;font-size:12px;">Decisions made</span></td>
      <td style="text-align:right;"><span style="color:#4d8ef0;font-size:13px;font-weight:700;">${decisionsThisWeek.length}</span></td>
    </tr>
  </table>
</div>

<!-- Recommendations -->
<div style="background:#16161e;border:1px solid rgba(240,165,0,0.3);border-radius:16px;padding:24px;margin-bottom:16px;">
  <h3 style="color:#f0a500;font-size:14px;margin:0 0 16px;">AI Recommendations for Next Week</h3>
  ${analysis.recommendations.map((r, i) => `
  <div style="display:flex;margin-bottom:12px;">
    <div style="min-width:28px;height:28px;background:rgba(240,165,0,0.15);border-radius:8px;text-align:center;line-height:28px;color:#f0a500;font-weight:800;font-size:13px;margin-right:12px;">${i + 1}</div>
    <p style="color:#c8c8d0;font-size:13px;line-height:1.6;margin:3px 0 0;">${r}</p>
  </div>`).join('')}
</div>

<!-- Footer -->
<div style="text-align:center;padding-top:16px;">
  <p style="color:#555;font-size:11px;margin:0;">Qivori AI - Weekly Business Report</p>
  <p style="color:#555;font-size:11px;margin:4px 0 0;">Generated automatically every Monday at 8:00 AM</p>
</div>

</div></body></html>`

    // 6. Send email
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@qivori.com'
    const emailResult = await sendEmail(
      adminEmail,
      `\u{1F4CA} Qivori Weekly Report \u2014 Week of ${mondayDate}`,
      html
    )

    // 7. SMS summary
    const smsBody = [
      `Qivori Weekly Report`,
      `MRR: $${mrr.toLocaleString()}`,
      `Users: ${active.length} active, ${trial.length} trial`,
      `New: ${newThisWeek.length} | Churn: ${churnRate}%`,
      `Loads: ${loadsThisWeek.length} | Rev: $${revenueThisWeekTotal.toLocaleString()}`,
      `Agent: ${actionsThisWeek.length} actions`,
      `Top rec: ${analysis.recommendations[0]}`,
    ].join('\n')
    await sendAdminSMS(smsBody)

    // 8. Response
    return new Response(JSON.stringify({
      ok: true,
      email_sent: emailResult?.ok ?? false,
      metrics: metricsPayload,
      analysis_source: claudeKey ? 'claude' : 'fallback',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Weekly report error:', err)
    return new Response(JSON.stringify({ error: 'Internal error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
