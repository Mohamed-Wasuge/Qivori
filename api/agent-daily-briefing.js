import { sendEmail, sendAdminSMS } from './_lib/emails.js'

export const config = { runtime: 'edge' }

/**
 * Daily CEO Briefing — sends Mohamed a data-driven morning briefing at 8am.
 * Gathers platform metrics, generates insights via Claude, sends HTML email + SMS.
 * Protected by CRON_SECRET.
 */
export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const serviceKey = req.headers.get('x-service-key')
  if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && serviceKey !== cronSecret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  try {
    // ── Gather all data in parallel ──
    const [
      profilesRes, newUsersRes, activeRes, trialRes, churnedRes,
      loadsRes, stuckLoadsRes,
      revenueRes,
      unpaidInvoicesRes,
      agentActionsRes, escalationsRes, agentRunsRes,
      notificationsRes,
      auditBlocksRes, auditInvoicesRes,
    ] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=10000`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/profiles?select=id&created_at=gte.${yesterday}`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/profiles?select=id&subscription_status=eq.active`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/profiles?select=id&subscription_status=eq.trialing`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/profiles?select=id&subscription_status=eq.canceled`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/loads?select=id,status`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/loads?select=id,status,created_at&created_at=lte.${sixHoursAgo}&status=in.("new","pending","quoted")`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/revenue_events?select=id,amount_cents,event_type&created_at=gte.${yesterday}`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/invoices?select=id,total_cents&status=eq.unpaid`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/agent_actions?select=id,action_type&created_at=gte.${yesterday}`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/agent_escalations?select=id&status=eq.pending`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/agent_runs?select=id,status,summary,created_at&order=created_at.desc&limit=1`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/notifications?select=id&created_at=gte.${yesterday}`, { headers }),
      // Audit: compliance blocks in last 24h
      fetch(`${supabaseUrl}/rest/v1/audit_logs?select=id,action,metadata&action=eq.dispatch_compliance_blocked&created_at=gte.${yesterday}`, { headers }),
      // Audit: invoices created in last 24h
      fetch(`${supabaseUrl}/rest/v1/audit_logs?select=id,action&action=eq.invoice_created&created_at=gte.${yesterday}`, { headers }),
    ])

    // ── Parse responses (gracefully handle missing tables) ──
    const safe = async (res) => { try { return res.ok ? await res.json() : [] } catch { return [] } }

    const [
      profiles, newUsers, active, trial, churned,
      loads, stuckLoads,
      revenueEvents,
      unpaidInvoices,
      agentActions, escalations, agentRuns,
      notifications,
      auditBlocks, auditInvoices,
    ] = await Promise.all([
      safe(profilesRes), safe(newUsersRes), safe(activeRes), safe(trialRes), safe(churnedRes),
      safe(loadsRes), safe(stuckLoadsRes),
      safe(revenueRes),
      safe(unpaidInvoicesRes),
      safe(agentActionsRes), safe(escalationsRes), safe(agentRunsRes),
      safe(notificationsRes),
      safe(auditBlocksRes), safe(auditInvoicesRes),
    ])

    // ── Compute metrics ──
    const loadsByStatus = {}
    for (const l of loads) loadsByStatus[l.status] = (loadsByStatus[l.status] || 0) + 1

    const revenueCents = revenueEvents.reduce((s, e) => s + (e.amount_cents || 0), 0)
    const revenueUSD = (revenueCents / 100).toFixed(2)
    const paymentCount = revenueEvents.filter(e => e.event_type === 'payment').length

    const outstandingCents = unpaidInvoices.reduce((s, i) => s + (i.total_cents || 0), 0)
    const outstandingUSD = (outstandingCents / 100).toFixed(2)

    const lastRun = agentRuns[0] || null

    const metrics = {
      profiles: { total: profiles.length, new_24h: newUsers.length, active: active.length, trial: trial.length, churned: churned.length },
      loads: { by_status: loadsByStatus, stuck: stuckLoads.length, total: loads.length },
      revenue: { payments_24h: paymentCount, revenue_24h_usd: revenueUSD, events_24h: revenueEvents.length },
      invoices: { unpaid: unpaidInvoices.length, outstanding_usd: outstandingUSD, created_24h: auditInvoices.length },
      compliance: { blocks_24h: auditBlocks.length },
      agent: { actions_24h: agentActions.length, pending_escalations: escalations.length, last_run: lastRun ? { status: lastRun.status, summary: lastRun.summary } : null },
      notifications_24h: notifications.length,
    }

    // ── Generate briefing via Claude ──
    let briefing = null
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (anthropicKey) {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: 'You are the Qivori AI CEO Briefing Generator. Create a concise daily briefing for Mohamed, the CEO. Be direct, data-driven, actionable. Include: 1) Overnight summary 2) Revenue update 3) Top 3 priorities for today 4) What the AI fixed overnight 5) What needs Mohamed\'s attention 6) One interesting insight from the data. Return as JSON: { overnight_summary, revenue_update, priorities: [string x3], ai_fixes: [string], needs_attention: [string], insight }',
          messages: [{ role: 'user', content: `Here are today's platform metrics for ${dateStr}:\n\n${JSON.stringify(metrics, null, 2)}\n\nGenerate the CEO daily briefing as JSON.` }],
        }),
      })
      if (aiRes.ok) {
        const aiData = await aiRes.json()
        const text = aiData.content?.[0]?.text || ''
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          briefing = jsonMatch ? JSON.parse(jsonMatch[0]) : null
        } catch { briefing = null }
      }
    }

    // ── Fallback if Claude unavailable ──
    if (!briefing) {
      briefing = {
        overnight_summary: `${metrics.profiles.new_24h} new users signed up. ${metrics.loads.total} total loads tracked. ${metrics.agent.actions_24h} AI actions taken.`,
        revenue_update: `$${revenueUSD} in revenue from ${paymentCount} payments. ${unpaidInvoices.length} unpaid invoices ($${outstandingUSD} outstanding).`,
        priorities: ['Review pending escalations', 'Check stuck loads', 'Monitor new user onboarding'],
        ai_fixes: agentActions.length > 0 ? [`${agentActions.length} autonomous actions completed`] : ['No autonomous actions overnight'],
        needs_attention: escalations.length > 0 ? [`${escalations.length} pending escalations need review`] : ['No urgent items'],
        insight: `Platform has ${metrics.profiles.total} total users with ${metrics.profiles.active} active subscribers.`,
      }
    }

    // ── Build HTML email ──
    const kpiCard = (label, value, color) =>
      `<div style="flex:1;text-align:center;background:#1e1e2a;border-radius:10px;padding:12px 8px;min-width:100px;">
        <div style="color:${color};font-size:22px;font-weight:800;">${value}</div>
        <div style="color:#8a8a9a;font-size:10px;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
      </div>`

    const section = (title, content, icon = '') =>
      `<div style="margin-bottom:20px;">
        <h3 style="color:#f0a500;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;font-weight:700;">${icon} ${title}</h3>
        <div style="color:#c8c8d0;font-size:13px;line-height:1.7;">${content}</div>
      </div>`

    const listItems = (items) => items.map(i => `<div style="padding:4px 0;border-bottom:1px solid #1e1e2a;">• ${i}</div>`).join('')

    const mrr = (metrics.profiles.active * 99).toLocaleString()

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
    <span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
    <div style="color:#8a8a9a;font-size:11px;margin-top:8px;text-transform:uppercase;letter-spacing:2px;">Daily CEO Briefing</div>
    <div style="color:#555;font-size:11px;margin-top:4px;">${dateStr}</div>
  </div>

  <div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:24px 20px;margin-bottom:16px;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:20px;">
      ${kpiCard('Est. MRR', `$${mrr}`, '#22c55e')}
      ${kpiCard('New Users', metrics.profiles.new_24h, '#4d8ef0')}
      ${kpiCard('Active Loads', metrics.loads.total, '#f0a500')}
      ${kpiCard('Escalations', metrics.agent.pending_escalations, metrics.agent.pending_escalations > 0 ? '#ef4444' : '#22c55e')}
    </div>

    ${section('Overnight Summary', briefing.overnight_summary)}
    ${section('Revenue Update', briefing.revenue_update)}
    ${section('Top 3 Priorities', listItems(briefing.priorities || []))}
    ${section('AI Fixes Overnight', listItems(briefing.ai_fixes || []))}
    ${section('Needs Your Attention', listItems(briefing.needs_attention || []))}

    <div style="margin-top:20px;background:rgba(77,142,240,0.06);border:1px solid rgba(77,142,240,0.15);border-radius:10px;padding:14px 16px;">
      <h3 style="color:#4d8ef0;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;font-weight:700;">Insight</h3>
      <div style="color:#c8c8d0;font-size:13px;line-height:1.6;">${briefing.insight}</div>
    </div>
  </div>

  <div style="background:#16161e;border:1px solid #2a2a35;border-radius:12px;padding:16px 20px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div style="color:#8a8a9a;font-size:11px;">Total Users: <strong style="color:#fff;">${metrics.profiles.total}</strong></div>
      <div style="color:#8a8a9a;font-size:11px;">Active: <strong style="color:#22c55e;">${metrics.profiles.active}</strong></div>
      <div style="color:#8a8a9a;font-size:11px;">Trial: <strong style="color:#4d8ef0;">${metrics.profiles.trial}</strong></div>
      <div style="color:#8a8a9a;font-size:11px;">Churned: <strong style="color:#ef4444;">${metrics.profiles.churned}</strong></div>
      <div style="color:#8a8a9a;font-size:11px;">Stuck Loads: <strong style="color:${metrics.loads.stuck > 0 ? '#ef4444' : '#22c55e'};">${metrics.loads.stuck}</strong></div>
      <div style="color:#8a8a9a;font-size:11px;">Unpaid Invoices: <strong style="color:#f0a500;">${metrics.invoices.unpaid} ($${outstandingUSD})</strong></div>
    </div>
  </div>

  <div style="text-align:center;padding-top:12px;">
    <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:13px;padding:12px 32px;border-radius:10px;text-decoration:none;">Open Dashboard →</a>
  </div>
  <div style="text-align:center;padding-top:16px;">
    <p style="color:#555;font-size:11px;margin:0;">Qivori AI — Daily Briefing</p>
  </div>
</div></body></html>`

    // ── Send email ──
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@qivori.com'
    const emailResult = await sendEmail(adminEmail, `☀️ Qivori Daily Briefing — ${dateStr}`, html)

    // ── Send SMS summary ──
    await sendAdminSMS(`Qivori Daily: ${metrics.profiles.new_24h} new users, $${revenueUSD} rev, ${metrics.agent.pending_escalations} pending. Check email for full briefing.`)

    return Response.json({
      success: true,
      email_sent: emailResult?.ok ?? false,
      date: dateStr,
      metrics,
    })
  } catch (err) {
    return Response.json({ error: 'Briefing failed', detail: err.message }, { status: 500 })
  }
}
