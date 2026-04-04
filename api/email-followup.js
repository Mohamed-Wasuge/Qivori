import { sendEmail, logEmail } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const MAX_FOLLOWUPS_PER_RUN = 20

export default async function handler(req) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

  // Time windows for each follow-up tier
  const tiers = [
    { name: 'followup_1', label: 'Follow-up #1 (24h)', minHours: 24, maxHours: 48, tone: 'friendly_checkin' },
    { name: 'followup_2', label: 'Follow-up #2 (3d)', minHours: 72, maxHours: 96, tone: 'value_urgency' },
    { name: 'followup_3', label: 'Follow-up #3 (7d)', minHours: 144, maxHours: 168, tone: 'last_chance' },
  ]

  const results = { sent: [], skipped: [], errors: [] }
  let totalSent = 0

  try {
    for (const tier of tiers) {
      if (totalSent >= MAX_FOLLOWUPS_PER_RUN) break

      const minDate = new Date(now.getTime() - tier.maxHours * 60 * 60 * 1000).toISOString()
      const maxDate = new Date(now.getTime() - tier.minHours * 60 * 60 * 1000).toISOString()

      // Query threads where bot replied but customer hasn't responded
      const threadsRes = await fetch(
        `${supabaseUrl}/rest/v1/ai_email_threads?status=eq.sent&created_at=gte.${minDate}&created_at=lte.${maxDate}&select=id,sender_email,subject,sender_message,ai_reply,user_id,created_at&order=created_at.asc&limit=${MAX_FOLLOWUPS_PER_RUN - totalSent}`,
        { headers }
      )

      if (!threadsRes.ok) {
        results.errors.push({ tier: tier.name, error: `Query failed: ${threadsRes.status}` })
        continue
      }

      const threads = await threadsRes.json()
      if (!threads?.length) continue

      for (const thread of threads) {
        if (totalSent >= MAX_FOLLOWUPS_PER_RUN) break

        const senderEmail = thread.sender_email
        const originalSubject = thread.subject

        // Skip if sender has replied since (newer inbound thread from same sender)
        const replyCheckRes = await fetch(
          `${supabaseUrl}/rest/v1/ai_email_threads?sender_email=eq.${encodeURIComponent(senderEmail)}&created_at=gt.${thread.created_at}&select=id&limit=1`,
          { headers }
        )
        const replyCheck = await replyCheckRes.json()
        if (replyCheck?.length > 0) {
          results.skipped.push({ email: senderEmail, subject: originalSubject, reason: 'sender_replied' })
          continue
        }

        // Skip if we already sent a follow-up for this thread (check for Follow-up: subject)
        const followupSubjectPrefix = `Follow-up: ${originalSubject}`
        const dupeCheckRes = await fetch(
          `${supabaseUrl}/rest/v1/ai_email_threads?sender_email=eq.${encodeURIComponent(senderEmail)}&subject=like.Follow-up*&created_at=gt.${thread.created_at}&select=id,subject&limit=5`,
          { headers }
        )
        const dupeCheck = await dupeCheckRes.json()
        // Count how many follow-ups already sent for this sender+subject combo
        const existingFollowups = (dupeCheck || []).filter(d =>
          d.subject && d.subject.includes(originalSubject)
        )

        // Determine which follow-up number this would be
        const followupNumber = existingFollowups.length + 1
        if (tier.name === 'followup_1' && followupNumber > 1) {
          results.skipped.push({ email: senderEmail, subject: originalSubject, reason: 'followup_1_already_sent' })
          continue
        }
        if (tier.name === 'followup_2' && followupNumber > 2) {
          results.skipped.push({ email: senderEmail, subject: originalSubject, reason: 'followup_2_already_sent' })
          continue
        }
        if (tier.name === 'followup_3' && followupNumber > 3) {
          results.skipped.push({ email: senderEmail, subject: originalSubject, reason: 'followup_3_already_sent' })
          continue
        }

        // Generate contextual follow-up via Claude
        const followupBody = await generateFollowup(
          anthropicKey,
          tier.tone,
          followupNumber,
          senderEmail,
          originalSubject,
          thread.sender_message,
          thread.ai_reply
        )

        if (!followupBody) {
          results.errors.push({ email: senderEmail, subject: originalSubject, error: 'AI generation failed' })
          continue
        }

        // Send the follow-up email
        const followupSubject = `Follow-up: ${originalSubject}`
        const followupHtml = formatFollowupHtml(followupBody, followupNumber)
        const sendResult = await sendEmail(senderEmail, followupSubject, followupHtml)

        if (!sendResult.ok) {
          results.errors.push({ email: senderEmail, subject: followupSubject, error: 'Send failed' })
          continue
        }

        // Log to ai_email_threads
        try {
          await fetch(`${supabaseUrl}/rest/v1/ai_email_threads`, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              sender_email: senderEmail,
              user_id: thread.user_id,
              subject: followupSubject,
              sender_message: `[Auto follow-up #${followupNumber} for thread ${thread.id}]`,
              ai_reply: followupBody.substring(0, 5000),
              status: 'sent',
              escalated: false,
              admin_notes: JSON.stringify({
                intent: 'auto_followup',
                followup_number: followupNumber,
                tier: tier.name,
                original_thread_id: thread.id,
              }),
            }),
          })
        } catch (e) { /* non-critical */ }

        // Log to email_logs
        await logEmail(thread.user_id, senderEmail, `auto_followup_${followupNumber}`, {
          tier: tier.name,
          original_subject: originalSubject,
          original_thread_id: thread.id,
        })

        totalSent++
        results.sent.push({
          email: senderEmail,
          subject: followupSubject,
          tier: tier.name,
          followup_number: followupNumber,
        })
      }
    }

    results.summary = {
      sent: results.sent.length,
      skipped: results.skipped.length,
      errors: results.errors.length,
    }

    return Response.json(results)
  } catch (err) {
    return Response.json({ error: err.message || 'Followup cron failed' }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════════
// AI FOLLOW-UP GENERATION
// ═══════════════════════════════════════════════════════════════

async function generateFollowup(apiKey, tone, followupNumber, senderEmail, subject, originalMessage, originalReply) {
  const toneInstructions = {
    friendly_checkin: `This is follow-up #1 (sent ~24 hours after our initial reply). Be warm and conversational.
- Reference what they originally asked about
- Add ONE new value proposition they haven't heard yet
- Keep it brief (2-3 paragraphs)
- End with a simple question to re-engage ("Did you get a chance to look into this?" or "Any questions I can help with?")
- Tone: helpful friend checking in, not pushy`,

    value_urgency: `This is follow-up #2 (sent ~3 days after our initial reply). Be more direct and value-driven.
- Briefly reference the original conversation
- Share a SPECIFIC benefit, stat, or case study (e.g., "Carriers using Qivori save an average of $2,400/month" or "Our AI scores loads 0-99 so you never take a bad load again")
- Create mild urgency ("Spot rates are shifting — having AI on your side matters now more than ever")
- Push toward a concrete next step: free trial signup or demo booking
- Tone: knowledgeable advisor with a time-sensitive opportunity`,

    last_chance: `This is follow-up #3 and FINAL follow-up (sent ~7 days after our initial reply). Make it count.
- Acknowledge this is your last outreach ("I don't want to keep filling your inbox...")
- Offer something concrete: a direct demo booking link or a limited-time extended trial
- Mention the 14-day free trial with no credit card required
- Make it easy: "Just reply 'demo' and I'll set everything up for you"
- Include a soft close: "If timing isn't right, no worries at all — we'll be here when you're ready"
- Tone: respectful, direct, last-chance energy without being desperate`,
  }

  const systemPrompt = `You are Qivori AI's automated follow-up system. You write personalized follow-up emails for the trucking industry SaaS platform Qivori.

ABOUT QIVORI:
- AI-powered carrier operating system for owner-operators and small fleets (1-10 trucks)
- Core features: AI Load Board (scores loads 0-99), Smart Dispatch (AI replaces dispatcher), Fleet GPS, IFTA Auto-Calculator, P&L Dashboard, Compliance Center, Invoicing
- One plan: Qivori AI Dispatch ($199/mo + $99/truck founder pricing, normally $299 + $149/truck) — AI finds loads, calls brokers, negotiates rates, handles compliance. Replaces your dispatcher.
- 14-day free trial, no credit card required
- Website: www.qivori.com

FOLLOW-UP TONE: ${toneInstructions[tone]}

RULES:
- Write ONLY the email body text (no subject line, no HTML)
- Use plain text with paragraph breaks
- Sign as "Qivori AI"
- Keep it under 200 words
- Be sales-driven but genuinely helpful
- Reference the original conversation naturally
- NEVER be generic — tailor to what they asked about
- Include a clear call-to-action`

  const userMessage = `Original email from ${senderEmail}:
Subject: ${subject}
Message: ${(originalMessage || '').substring(0, 1000)}

Our previous reply:
${(originalReply || '').substring(0, 1000)}

Write follow-up #${followupNumber} for this conversation.`

  const models = ['claude-sonnet-4-20250514', 'claude-sonnet-4-20250514']

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
        const data = await res.json()
        return data.content?.[0]?.text || null
      }
    } catch (e) { continue }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
// EMAIL FORMATTING
// ═══════════════════════════════════════════════════════════════

function formatFollowupHtml(text, followupNumber) {
  const paragraphs = text.split('\n\n').filter(Boolean)
  const bodyHtml = paragraphs
    .map(p => `<p style="color:#c8c8d0;font-size:14px;line-height:1.7;margin:0 0 12px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

  // CTA varies by follow-up number
  let ctaText = 'Start Free Trial'
  let ctaColor = '#f0a500'
  if (followupNumber === 2) {
    ctaText = 'See How It Works'
    ctaColor = '#f0a500'
  } else if (followupNumber === 3) {
    ctaText = 'Book a Demo'
    ctaColor = '#22c55e'
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:24px;">
${bodyHtml}
<div style="text-align:center;margin:20px 0 8px;">
<a href="https://qivori.com" style="display:inline-block;background:${ctaColor};color:#000;font-weight:700;font-size:13px;padding:12px 32px;border-radius:10px;text-decoration:none;">${ctaText} &rarr;</a>
</div>
</div>
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Powered by Qivori AI &mdash; The Operating System for Modern Carriers</p>
<p style="color:#555;font-size:11px;margin:4px 0 0;">Need a human? Just reply "speak to a team member" &middot; hello@qivori.com</p>
</div></div></body></html>`
}
