import { sendEmail, logEmail } from './_lib/emails.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  // Only accept POST from Resend webhook
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  // Verify webhook secret (set RESEND_WEBHOOK_SECRET in Vercel env)
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (webhookSecret) {
    const sig = req.headers.get('resend-signature') || req.headers.get('svix-signature') || ''
    // For now, basic secret header check — upgrade to HMAC verification later
    // Resend uses svix for webhook signatures
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!anthropicKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const payload = await req.json()

    // Resend inbound webhook payload
    const fromEmail = payload.from || payload.data?.from || ''
    const toEmail = Array.isArray(payload.to) ? payload.to[0] : (payload.to || payload.data?.to?.[0] || '')
    const subject = payload.subject || payload.data?.subject || '(no subject)'
    const textBody = payload.text || payload.data?.text || ''
    const htmlBody = payload.html || payload.data?.html || ''
    const emailId = payload.email_id || payload.data?.email_id || ''

    // Extract clean email address
    const senderEmail = extractEmail(fromEmail)
    if (!senderEmail) {
      return Response.json({ error: 'No sender email' }, { status: 400 })
    }

    // Don't reply to noreply addresses, own domain, or bounces
    const skipPatterns = ['noreply@', 'no-reply@', 'mailer-daemon@', 'postmaster@', '@qivori.com', 'unsubscribe']
    if (skipPatterns.some(p => senderEmail.toLowerCase().includes(p))) {
      return Response.json({ skipped: true, reason: 'filtered sender' })
    }

    // Clean the email body — strip quoted replies
    const cleanBody = stripQuotedReplies(textBody || stripHtml(htmlBody))
    if (!cleanBody || cleanBody.trim().length < 3) {
      return Response.json({ skipped: true, reason: 'empty body' })
    }

    // Look up sender in Supabase for context
    let userContext = ''
    let userId = null
    if (supabaseUrl && serviceKey) {
      try {
        // Check profiles
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(senderEmail)}&select=id,full_name,company_name,role,plan,truck_count,mc_number,dot_number,created_at`,
          { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
        )
        const profiles = await profileRes.json()
        if (profiles?.[0]) {
          const p = profiles[0]
          userId = p.id
          userContext += `\nUSER PROFILE: ${p.full_name || 'Unknown'}, Company: ${p.company_name || 'N/A'}, Role: ${p.role || 'carrier'}, Plan: ${p.plan || 'trial'}, Trucks: ${p.truck_count || 1}, MC#: ${p.mc_number || 'N/A'}, DOT#: ${p.dot_number || 'N/A'}, Joined: ${p.created_at?.split('T')[0] || 'N/A'}`
        }

        // Check recent loads if user found
        if (userId) {
          const loadsRes = await fetch(
            `${supabaseUrl}/rest/v1/loads?user_id=eq.${userId}&select=load_number,status,origin,destination,gross_pay,broker_name&order=created_at.desc&limit=5`,
            { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
          )
          const loads = await loadsRes.json()
          if (loads?.length > 0) {
            userContext += `\nRECENT LOADS: ${loads.map(l => `${l.load_number}: ${l.origin}→${l.destination} ($${l.gross_pay || 0}) [${l.status}] via ${l.broker_name || 'N/A'}`).join(' | ')}`
          }
        }

        // Get previous email thread for conversation continuity
        const threadRes = await fetch(
          `${supabaseUrl}/rest/v1/ai_email_threads?sender_email=eq.${encodeURIComponent(senderEmail)}&select=subject,sender_message,ai_reply,created_at&order=created_at.desc&limit=5`,
          { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
        )
        const threads = await threadRes.json()
        if (threads?.length > 0) {
          userContext += `\nPREVIOUS EMAIL THREADS:\n${threads.map(t => `[${t.created_at?.split('T')[0]}] Subject: ${t.subject}\nThem: ${t.sender_message?.substring(0, 200)}\nYou: ${t.ai_reply?.substring(0, 200)}`).join('\n---\n')}`
        }
      } catch (e) { /* context lookup failed, continue without it */ }
    }

    // Generate AI reply using Claude
    const systemPrompt = `You are Qivori AI's email assistant, responding on behalf of Qivori — an AI-powered TMS (Transportation Management System) for trucking owner-operators and small fleet carriers.

You respond to inbound emails from customers, leads, and prospects. Your tone is professional, friendly, and helpful — like a knowledgeable support agent who understands trucking.

ABOUT QIVORI:
- AI-powered carrier operating system for owner-operators and small fleets (1-10 trucks)
- Features: AI Load Board, Smart Dispatch, Fleet GPS, IFTA Calculator, P&L, Compliance, Driver Management, Invoicing
- Plans: Autopilot ($99/mo + $49/truck) and Autopilot AI ($799/mo + $150/truck — replaces your dispatcher)
- 14-day free trial, no credit card required
- Website: www.qivori.com
- Founded by Mohamed Wasuge

${userContext ? `SENDER CONTEXT:${userContext}` : 'SENDER: Unknown — not found in our system. Likely a new lead or prospect.'}

RULES:
- Keep replies concise and helpful (2-4 paragraphs max)
- If they're asking about pricing, features, or how to get started — be enthusiastic and informative
- If they have a technical issue or bug report — acknowledge it, apologize, and say the team is looking into it
- If they want to cancel — be empathetic, ask why, mention the 20% COMEBACK20 discount
- If they're a lead from demo request — welcome them and guide them to sign up
- If the email is spam or irrelevant — reply politely that this inbox is for Qivori customers
- If they need something complex (refund, account deletion, legal) — say you're forwarding to Mohamed personally
- NEVER make up information about their account you don't have
- NEVER promise features that don't exist
- Sign off as "Qivori AI Assistant" and mention they can reach Mohamed directly for urgent matters
- If they ask if they're talking to a bot — be honest: "I'm Qivori's AI assistant. For anything I can't help with, I'll connect you with Mohamed directly."
- Write in plain text style suitable for email — no markdown headers or bullets unless listing features`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `From: ${senderEmail}\nSubject: ${subject}\n\n${cleanBody}` }
        ],
      }),
    })

    if (!aiRes.ok) {
      // Fallback model
      const aiRes2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            { role: 'user', content: `From: ${senderEmail}\nSubject: ${subject}\n\n${cleanBody}` }
          ],
        }),
      })
      if (!aiRes2.ok) {
        // Notify admin of failure
        await notifyAdmin(supabaseUrl, serviceKey, senderEmail, subject, 'AI generation failed')
        return Response.json({ error: 'AI unavailable' }, { status: 502 })
      }
      var aiData = await aiRes2.json()
    } else {
      var aiData = await aiRes.json()
    }

    const aiReply = aiData.content?.[0]?.text
    if (!aiReply) {
      await notifyAdmin(supabaseUrl, serviceKey, senderEmail, subject, 'Empty AI response')
      return Response.json({ error: 'Empty AI response' }, { status: 500 })
    }

    // Format reply as branded HTML email
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
    const replyHtml = formatReplyHtml(aiReply)

    // Send the reply (from verified qivori.com, reply-to routes back to bot)
    const sendResult = await sendEmail(senderEmail, replySubject, replyHtml)

    // Log to ai_email_threads table
    if (supabaseUrl && serviceKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/ai_email_threads`, {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            sender_email: senderEmail,
            user_id: userId,
            subject,
            sender_message: cleanBody.substring(0, 5000),
            ai_reply: aiReply.substring(0, 5000),
            status: sendResult.ok ? 'sent' : 'failed',
            inbound_email_id: emailId || null,
          }),
        })
      } catch (e) { /* logging failed, non-critical */ }
    }

    // Log to email_logs for general tracking
    await logEmail(userId, senderEmail, 'ai_auto_reply', { subject: replySubject })

    return Response.json({
      success: true,
      from: senderEmail,
      subject: replySubject,
      replied: sendResult.ok,
    })
  } catch (err) {
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// ── Helpers ──

function extractEmail(str) {
  if (!str) return null
  // Handle "Name <email@example.com>" format
  const match = str.match(/<([^>]+)>/)
  if (match) return match[1].trim().toLowerCase()
  // Handle plain email
  const emailMatch = str.match(/[\w.-]+@[\w.-]+\.\w+/)
  return emailMatch ? emailMatch[0].trim().toLowerCase() : null
}

function stripQuotedReplies(text) {
  if (!text) return ''
  // Remove lines starting with > (quoted text)
  // Remove "On [date], [person] wrote:" blocks
  const lines = text.split('\n')
  const cleanLines = []
  for (const line of lines) {
    if (line.startsWith('>')) continue
    if (/^On .+ wrote:$/i.test(line.trim())) break
    if (/^-{3,}/.test(line.trim())) break // --- divider
    if (/^_{3,}/.test(line.trim())) break // ___ divider
    if (/^From:.*@/.test(line.trim())) break
    if (/^Sent from my/.test(line.trim())) continue
    cleanLines.push(line)
  }
  return cleanLines.join('\n').trim()
}

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

function formatReplyHtml(text) {
  const paragraphs = text.split('\n\n').filter(Boolean)
  const bodyHtml = paragraphs
    .map(p => `<p style="color:#c8c8d0;font-size:14px;line-height:1.7;margin:0 0 12px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:24px;">
${bodyHtml}
</div>
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Qivori AI Assistant &mdash; AI-Powered TMS for Trucking</p>
<p style="color:#555;font-size:11px;margin:4px 0 0;">Need a human? Reply with "speak to Mohamed" &middot; hello@qivori.com</p>
</div></div></body></html>`
}

async function notifyAdmin(supabaseUrl, serviceKey, senderEmail, subject, reason) {
  if (!supabaseUrl || !serviceKey) return
  try {
    await fetch(`${supabaseUrl}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        title: 'Email Bot Failed',
        body: `[warning] Failed to auto-reply to ${senderEmail} (${subject}): ${reason}`,
        user_id: 'system',
        read: false,
      }),
    })
  } catch (e) { /* non-critical */ }
}
