import { sendEmail, logEmail, sendAdminEmail } from './_lib/emails.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!anthropicKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const payload = await req.json()

    // Parse Resend webhook payload
    const d = payload.data || payload
    const fromEmail = d.from || payload.from || ''
    const subject = d.subject || payload.subject || '(no subject)'
    const textBody = d.text || d.body || payload.text || payload.body || ''
    const htmlBody = d.html || payload.html || ''
    const emailId = d.email_id || d.id || payload.email_id || ''

    const senderEmail = extractEmail(fromEmail)
    if (!senderEmail) return Response.json({ error: 'No sender email' }, { status: 400 })

    // ── SMART SPAM FILTER ──
    if (isSpamOrMarketing(senderEmail, subject, textBody || stripHtml(htmlBody))) {
      return Response.json({ skipped: true, reason: 'spam/marketing' })
    }

    // Clean email body
    const rawBody = textBody || stripHtml(htmlBody)
    const cleanBody = stripQuotedReplies(rawBody) || subject
    if (!cleanBody || cleanBody.trim().length < 2) {
      return Response.json({ skipped: true, reason: 'empty body' })
    }

    // ── DEEP CONTEXT GATHERING ──
    const context = await gatherIntelligence(senderEmail, supabaseUrl, serviceKey)

    // ── INTENT DETECTION (pre-AI) ──
    const intent = detectIntent(subject, cleanBody)

    // ── AI BRAIN ──
    const systemPrompt = buildSuperSmartPrompt(context, intent)

    const aiReply = await callClaude(anthropicKey, systemPrompt, senderEmail, subject, cleanBody)
    if (!aiReply) {
      await notifyAdmin(supabaseUrl, serviceKey, senderEmail, subject, 'AI generation failed')
      return Response.json({ error: 'AI unavailable' }, { status: 502 })
    }

    // ── POST-AI ACTIONS ──
    // Auto-escalate if AI says so or intent requires it
    const shouldEscalate = intent.escalate || aiReply.includes('[ESCALATE]')
    const cleanReply = aiReply.replace('[ESCALATE]', '').trim()

    // Detect sentiment from AI's analysis
    const sentiment = aiReply.includes('[SENTIMENT')
      ? (aiReply.match(/\[SENTIMENT:?\s*(\w+)\]/i)?.[1] || 'neutral')
      : 'neutral'
    const finalReply = cleanReply.replace(/\[SENTIMENT:?\s*\w+\]/gi, '').trim()

    // Format and send reply
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
    const replyHtml = formatReplyHtml(finalReply, intent.category)
    const sendResult = await sendEmail(senderEmail, replySubject, replyHtml)

    // ── SMART LOGGING ──
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
            user_id: context.userId,
            subject,
            sender_message: cleanBody.substring(0, 5000),
            ai_reply: finalReply.substring(0, 5000),
            status: shouldEscalate ? 'escalated' : sendResult.ok ? 'sent' : 'failed',
            escalated: shouldEscalate,
            inbound_email_id: emailId || null,
            admin_notes: JSON.stringify({
              intent: intent.category,
              sentiment,
              isCustomer: !!context.userId,
              leadScore: context.leadScore,
              autoActions: intent.actions,
            }),
          }),
        })
      } catch (e) { /* non-critical */ }

      // ── AUTO-ESCALATION: notify admin for critical emails ──
      if (shouldEscalate || sentiment === 'angry' || intent.category === 'legal') {
        await notifyAdmin(supabaseUrl, serviceKey, senderEmail, subject,
          `Auto-escalated: ${intent.category} | Sentiment: ${sentiment} | Customer: ${context.userId ? 'Yes' : 'No'}`)
        // Send admin a direct email alert for urgent ones
        if (intent.priority === 'urgent') {
          await sendAdminEmail(
            `🔴 Urgent Email: ${subject}`,
            `<p style="color:#ef4444;font-weight:700;">Urgent email requires attention</p>
            <p style="color:#c8c8d0;">From: ${senderEmail}</p>
            <p style="color:#c8c8d0;">Subject: ${subject}</p>
            <p style="color:#c8c8d0;">Intent: ${intent.category}</p>
            <p style="color:#c8c8d0;">Message: ${cleanBody.substring(0, 500)}</p>
            <p style="color:#c8c8d0;">AI Reply: ${finalReply.substring(0, 300)}</p>`
          )
        }
      }

      // ── AUTO-ACTIONS based on intent ──
      if (intent.actions.includes('create_lead') && !context.userId) {
        // Auto-create lead in demo_requests if new prospect
        try {
          await fetch(`${supabaseUrl}/rest/v1/demo_requests`, {
            method: 'POST',
            headers: {
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              email: senderEmail,
              name: fromEmail.split('<')[0]?.trim() || senderEmail.split('@')[0],
              source: 'email_inbound',
              notes: `Auto-captured from email: "${subject}"`,
            }),
          })
        } catch (e) { /* non-critical */ }
      }

      // Auto-log follow-up reminder for high-value leads
      if (intent.actions.includes('follow_up') && context.leadScore >= 7) {
        await notifyAdmin(supabaseUrl, serviceKey, senderEmail, subject,
          `High-value lead (score: ${context.leadScore}/10) needs follow-up within 24hrs`)
      }
    }

    await logEmail(context.userId, senderEmail, 'ai_auto_reply', {
      subject: replySubject, intent: intent.category, sentiment, leadScore: context.leadScore,
    })

    return Response.json({
      success: true,
      from: senderEmail,
      subject: replySubject,
      replied: sendResult.ok,
      intent: intent.category,
      sentiment,
      escalated: shouldEscalate,
      leadScore: context.leadScore,
    })
  } catch (err) {
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// ═══════════════════════════════════════════════════════════════
// INTELLIGENCE ENGINE
// ═══════════════════════════════════════════════════════════════

function detectIntent(subject, body) {
  const text = `${subject} ${body}`.toLowerCase()

  const intents = {
    // Sales & Leads
    pricing:    { keywords: ['pricing', 'price', 'cost', 'how much', 'plans', 'subscription', 'rate', 'afford'], category: 'sales', priority: 'high', actions: ['create_lead', 'follow_up'] },
    demo:       { keywords: ['demo', 'trial', 'try', 'test', 'sign up', 'get started', 'interested', 'learn more'], category: 'sales', priority: 'high', actions: ['create_lead', 'follow_up'] },
    compare:    { keywords: ['vs', 'versus', 'compared to', 'better than', 'switch from', 'alternative'], category: 'sales', priority: 'high', actions: ['create_lead'] },

    // Support
    bug:        { keywords: ['bug', 'error', 'broken', 'not working', 'issue', 'problem', 'crash', 'glitch', "can't", 'unable'], category: 'support', priority: 'medium', actions: [] },
    howto:      { keywords: ['how do i', 'how to', 'where is', 'can i', 'help me', 'tutorial', 'guide'], category: 'support', priority: 'low', actions: [] },
    feature:    { keywords: ['feature request', 'wish', 'would be nice', 'suggestion', 'add', 'missing'], category: 'feedback', priority: 'low', actions: [] },

    // Account & Billing
    cancel:     { keywords: ['cancel', 'unsubscribe', 'stop', 'end subscription', 'close account', 'delete account'], category: 'churn', priority: 'urgent', actions: ['follow_up'], escalate: true },
    refund:     { keywords: ['refund', 'money back', 'charge', 'overcharged', 'billing issue', 'dispute'], category: 'billing', priority: 'urgent', actions: ['follow_up'], escalate: true },
    upgrade:    { keywords: ['upgrade', 'autonomous fleet', 'enterprise', 'more trucks', 'scale', 'grow'], category: 'upsell', priority: 'high', actions: ['follow_up'] },

    // Trucking-specific
    loadboard:  { keywords: ['load board', 'dat', '123loadboard', 'truckstop', 'find loads', 'search loads'], category: 'product', priority: 'medium', actions: [] },
    compliance: { keywords: ['eld', 'hos', 'fmcsa', 'dot', 'compliance', 'inspection', 'violation', 'csa', 'ifta'], category: 'product', priority: 'medium', actions: [] },
    dispatch:   { keywords: ['dispatch', 'driver', 'fleet', 'truck', 'route', 'delivery', 'pickup'], category: 'product', priority: 'medium', actions: [] },
    invoice:    { keywords: ['invoice', 'payment', 'factoring', 'quickbooks', 'receivable', 'broker pay'], category: 'product', priority: 'medium', actions: [] },

    // Critical
    legal:      { keywords: ['lawyer', 'attorney', 'sue', 'lawsuit', 'legal', 'subpoena', 'court'], category: 'legal', priority: 'urgent', actions: [], escalate: true },
    partner:    { keywords: ['partnership', 'integrate', 'api access', 'reseller', 'white label', 'b2b'], category: 'partnership', priority: 'high', actions: ['create_lead', 'follow_up'], escalate: true },
    media:      { keywords: ['press', 'journalist', 'interview', 'article', 'media', 'publication', 'podcast'], category: 'media', priority: 'high', actions: [], escalate: true },
    investor:   { keywords: ['invest', 'funding', 'venture', 'capital', 'series', 'valuation', 'pitch'], category: 'investor', priority: 'urgent', actions: [], escalate: true },
    human:      { keywords: ['speak to', 'talk to', 'real person', 'human', 'team member', 'manager', 'supervisor'], category: 'escalation', priority: 'urgent', actions: [], escalate: true },
  }

  for (const [key, intent] of Object.entries(intents)) {
    if (intent.keywords.some(kw => text.includes(kw))) {
      return { ...intent, detected: key }
    }
  }

  return { category: 'general', priority: 'low', actions: [], detected: 'unknown', escalate: false }
}

async function gatherIntelligence(senderEmail, supabaseUrl, serviceKey) {
  const ctx = { userId: null, profile: null, loads: [], invoices: [], threads: [], leadScore: 5, summary: '' }
  if (!supabaseUrl || !serviceKey) return ctx

  const headers = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }

  try {
    // Profile lookup
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(senderEmail)}&select=id,full_name,company_name,role,plan,truck_count,mc_number,dot_number,subscription_status,created_at,last_login`,
      { headers }
    )
    const profiles = await profileRes.json()
    if (profiles?.[0]) {
      const p = profiles[0]
      ctx.userId = p.id
      ctx.profile = p
      ctx.summary += `\n👤 CUSTOMER PROFILE:\n- Name: ${p.full_name || 'Unknown'}\n- Company: ${p.company_name || 'N/A'}\n- Role: ${p.role || 'carrier'}\n- Plan: ${p.plan || 'trial'} (${p.subscription_status || 'unknown'})\n- Fleet: ${p.truck_count || 1} truck(s)\n- MC#: ${p.mc_number || 'N/A'} | DOT#: ${p.dot_number || 'N/A'}\n- Member since: ${p.created_at?.split('T')[0] || 'N/A'}\n- Last login: ${p.last_login?.split('T')[0] || 'N/A'}`

      // Lead scoring for existing customers
      ctx.leadScore = 8
      if (p.plan === 'autonomous_fleet') ctx.leadScore = 10
      else if (p.subscription_status === 'trialing') ctx.leadScore = 7
    }

    // Loads — recent activity
    if (ctx.userId) {
      const [loadsRes, invoicesRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/loads?user_id=eq.${ctx.userId}&select=load_number,status,origin,destination,gross_pay,rate_per_mile,broker_name,pickup_date,delivery_date&order=created_at.desc&limit=10`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/invoices?user_id=eq.${ctx.userId}&select=invoice_number,status,amount,broker_name,due_date&order=created_at.desc&limit=5`, { headers }),
      ])

      const loads = await loadsRes.json()
      if (loads?.length > 0) {
        ctx.loads = loads
        const activeLoads = loads.filter(l => !['Delivered', 'Invoiced', 'Paid'].includes(l.status))
        const deliveredLoads = loads.filter(l => l.status === 'Delivered')
        const totalRevenue = loads.reduce((sum, l) => sum + (l.gross_pay || 0), 0)
        const avgRpm = loads.filter(l => l.rate_per_mile).reduce((sum, l, _, a) => sum + l.rate_per_mile / a.length, 0)

        ctx.summary += `\n\n📦 LOAD ACTIVITY (last 10):\n- Active loads: ${activeLoads.length}\n- Delivered (pending invoice): ${deliveredLoads.length}\n- Total revenue: $${totalRevenue.toLocaleString()}\n- Avg RPM: $${avgRpm.toFixed(2)}/mi`
        ctx.summary += `\n- Recent: ${loads.slice(0, 3).map(l => `${l.load_number}: ${l.origin}→${l.destination} $${l.gross_pay || 0} [${l.status}]`).join(' | ')}`
      }

      const invoices = await invoicesRes.json()
      if (invoices?.length > 0) {
        ctx.invoices = invoices
        const unpaid = invoices.filter(i => i.status !== 'paid')
        const totalUnpaid = unpaid.reduce((sum, i) => sum + (i.amount || 0), 0)
        if (unpaid.length > 0) {
          ctx.summary += `\n\n💰 OUTSTANDING INVOICES: ${unpaid.length} unpaid ($${totalUnpaid.toLocaleString()})`
        }
      }
    }

    // Previous email threads
    const threadRes = await fetch(
      `${supabaseUrl}/rest/v1/ai_email_threads?sender_email=eq.${encodeURIComponent(senderEmail)}&select=subject,sender_message,ai_reply,admin_notes,created_at&order=created_at.desc&limit=5`,
      { headers }
    )
    const threads = await threadRes.json()
    if (threads?.length > 0) {
      ctx.threads = threads
      ctx.summary += `\n\n📧 CONVERSATION HISTORY (${threads.length} previous):\n${threads.map(t => {
        const notes = t.admin_notes ? JSON.parse(t.admin_notes) : {}
        return `[${t.created_at?.split('T')[0]}] ${t.subject} (${notes.intent || 'general'})\nThem: ${t.sender_message?.substring(0, 150)}...\nUs: ${t.ai_reply?.substring(0, 150)}...`
      }).join('\n---\n')}`
    }

    // Check demo_requests for lead info
    if (!ctx.userId) {
      const demoRes = await fetch(
        `${supabaseUrl}/rest/v1/demo_requests?email=eq.${encodeURIComponent(senderEmail)}&select=name,company,phone,truck_count,created_at&limit=1`,
        { headers }
      )
      const demos = await demoRes.json()
      if (demos?.[0]) {
        const dm = demos[0]
        ctx.summary += `\n\n🎯 LEAD INFO (from demo request):\n- Name: ${dm.name || 'N/A'}\n- Company: ${dm.company || 'N/A'}\n- Trucks: ${dm.truck_count || 'N/A'}\n- Requested demo: ${dm.created_at?.split('T')[0]}`
        ctx.leadScore = 8
      } else {
        ctx.summary += `\n\n❓ UNKNOWN SENDER — not in our system. Could be a new lead, cold outreach, or general inquiry.`
        ctx.leadScore = 5
      }
    }
  } catch (e) { /* context failed, continue */ }

  return ctx
}

// ═══════════════════════════════════════════════════════════════
// SUPER-SMART PROMPT
// ═══════════════════════════════════════════════════════════════

function buildSuperSmartPrompt(context, intent) {
  return `You are Qivori AI — a helpful, knowledgeable assistant for Qivori, a trucking TMS built for owner-operators and small fleets.

YOUR #1 RULE: MATCH THE ENERGY AND LENGTH OF THE INCOMING EMAIL.
- Short/casual email ("test", "hey", "thanks") → short/casual reply (1-3 sentences max)
- Medium question → medium answer (1-2 short paragraphs)
- Detailed inquiry → detailed but concise response (2-3 paragraphs max)
- NEVER write a 4-paragraph sales pitch to a one-word email
- If someone says "test" or "hello", just acknowledge warmly and let them know you're here if they need anything. That's it.

You understand trucking: RPM, deadhead, fuel costs, FMCSA regs, ELD/HOS, IFTA, load boards, broker dynamics, factoring, fleet management.

ABOUT QIVORI:
- AI-powered TMS for owner-operators and small fleets (1-10 trucks)
- Features: AI Load Board (scores loads 0-99), Smart Dispatch, Fleet GPS, IFTA, P&L, Compliance, Driver Management, Invoicing
- Pricing: Autonomous Fleet AI $399/truck/mo (founder pricing). AI finds loads, calls brokers, negotiates rates, handles compliance.
- 14-day free trial, no credit card required
- Website: www.qivori.com

${context.summary || 'SENDER: Unknown — new contact, not in our system.'}

EMAIL INTENT: ${intent.category} (${intent.priority} priority)
${intent.escalate ? '⚠️ ESCALATION REQUIRED — acknowledge and confirm a team member will follow up.' : ''}

RESPONSE RULES:

1. BE HELPFUL FIRST, SELL SECOND
   - Answer their actual question before anything else
   - Only mention pricing/features if relevant to what they asked
   - Don't pitch unless they're clearly interested or asking about the product
   - For support questions from existing customers: just help them, don't upsell

2. TONE & LENGTH
   - Sound like a real person, not a marketing email
   - Conversational, warm, knowledgeable — like a friend in the industry
   - Mirror their language (if they say "rig" say "rig", not "vehicle")
   - Use their name if you have it from context
   - End with a question ONLY if it's natural — don't force it on short exchanges
   - Sign as "— Qivori AI"

3. WHEN TO SELL (only when appropriate)
   - They ask about pricing, features, or comparisons → give specifics
   - They describe a pain point (bad dispatcher, can't find loads, compliance stress) → show how Qivori solves it
   - They're a trial user asking about features → guide them, mention upgrade naturally
   - They're exploring/shopping → qualify gently: fleet size, lanes, pain points
   - NEVER dump all features at once. Pick the 1-2 most relevant to their situation.

4. COMPETITOR KNOWLEDGE (use ONLY when they ask or mention a competitor)
   - KeepTruckin/Motive: ELD-focused, no AI dispatch
   - Rose Rocket: Enterprise, overkill for small fleets
   - TruckingOffice: Basic, no AI
   - DAT/123Loadboard: Load boards only — Qivori integrates with them

5. EXISTING CUSTOMERS (use context data)
   - Reference their loads, fleet size, plan if available
   - Trial users: help them get value, mention upgrade naturally
   - Paying customers: make them feel valued, solve their problem
   - Churning: empathize, offer COMEBACK20 code if relevant

6. ONBOARDING (if they're new and asking how to start)
   - Keep it simple: MC/DOT → Add truck → Add driver → Find loads
   - Don't dump all 4 steps unless they ask "how do I get started"

7. ESCALATION — include [ESCALATE] if:
   - They ask for a human
   - Legal, investor, media, or partnership inquiry
   - Refund/cancellation request
   - They're ready to buy and need a human to close

8. SENTIMENT — include [SENTIMENT:word] at the very end (this gets stripped):
   - happy, neutral, frustrated, angry, excited

9. NEVER:
   - Make up data you don't have
   - Promise features that don't exist
   - Give legal or medical advice
   - Write more than 3 paragraphs for any email
   - Pitch pricing to someone who didn't ask about it
   - Mention referral program unless they're already a happy customer asking about it`
}

// ═══════════════════════════════════════════════════════════════
// AI CALLING
// ═══════════════════════════════════════════════════════════════

async function callClaude(apiKey, systemPrompt, senderEmail, subject, body) {
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
          max_tokens: 1500,
          system: systemPrompt,
          messages: [
            { role: 'user', content: `From: ${senderEmail}\nSubject: ${subject}\n\n${body}` }
          ],
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
// SPAM DETECTION
// ═══════════════════════════════════════════════════════════════

function isSpamOrMarketing(email, subject, body) {
  const e = email.toLowerCase()
  const s = subject.toLowerCase()
  const b = (body || '').toLowerCase()

  // Sender domain blacklist
  const spamDomains = [
    'ccsend.com', 'mailchimp.com', 'constantcontact.com', 'sendgrid.net',
    'amazonses.com', 'mailgun.net', 'sendinblue.com', 'hubspot.com',
    'aliexpress', 'xfinity', 'comcast', 'usps.com', 'ups.com', 'fedex.com',
    'teamsnap', 'optionstrat', 'mvpschools', 'mobyfund', 'taylorandmartin',
    'informeddelivery', '.cub.com', 'facebook.com', 'facebookmail.com',
    'twitter.com', 'linkedin.com', 'instagram.com', 'tiktok.com',
    'youtube.com', 'google.com', 'apple.com', 'microsoft.com',
    'amazon.com', 'paypal.com', 'stripe.com', 'squarespace.com',
    'shopify.com', 'wix.com', 'godaddy.com', 'namecheap.com',
    'indeed.com', 'glassdoor.com', 'yelp.com', 'nextdoor.com',
    'doordash.com', 'uber.com', 'lyft.com', 'grubhub.com',
    '123loadboard.com', 'dat.com', 'truckstop.com', 'calendly.com',
  ]

  // Sender prefix blacklist
  const spamPrefixes = [
    'noreply@', 'no-reply@', 'mailer-daemon@', 'postmaster@',
    'newsletter@', 'marketing@', 'promo@', 'promotions@', 'bulk@',
    'notify@', 'notification@', 'notifications@', 'alerts@',
    'info@', 'support@', 'billing@', 'account@', 'updates@',
    'news@', 'digest@', 'automated@', 'system@', 'donotreply@',
  ]

  // Subject spam signals
  const spamSubjects = [
    'unsubscribe', 'seasonal', 'sale', 'discount', 'promo', 'off today',
    'just landed', 'new arrivals', 'daily digest', 'newsletter',
    'your payment is overdue', 'register now', 'auction', 'limited time',
    'act now', 'exclusive offer', 'free shipping', 'order confirmation',
    'shipping notification', 'tracking number', 'delivery notification',
    'verify your', 'confirm your', 'security alert', 'password reset',
    'weekly report', 'monthly summary', 'your receipt', 'your statement',
  ]

  if (e.includes('@qivori.com')) return true
  if (spamDomains.some(d => e.includes(d))) return true
  if (spamPrefixes.some(p => e.startsWith(p))) return true
  if (spamSubjects.some(p => s.includes(p))) return true

  // Body spam signals — if body contains unsubscribe link, it's marketing
  if (b.includes('unsubscribe') || b.includes('opt out') || b.includes('email preferences')) return true
  if (b.includes('view in browser') || b.includes('view this email')) return true

  return false
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function extractEmail(str) {
  if (!str) return null
  const match = str.match(/<([^>]+)>/)
  if (match) return match[1].trim().toLowerCase()
  const emailMatch = str.match(/[\w.-]+@[\w.-]+\.\w+/)
  return emailMatch ? emailMatch[0].trim().toLowerCase() : null
}

function stripQuotedReplies(text) {
  if (!text) return ''
  const lines = text.split('\n')
  const cleanLines = []
  for (const line of lines) {
    if (line.startsWith('>')) continue
    if (/^On .+ wrote:$/i.test(line.trim())) break
    if (/^-{3,}/.test(line.trim())) break
    if (/^_{3,}/.test(line.trim())) break
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

function formatReplyHtml(text, intentCategory) {
  const paragraphs = text.split('\n\n').filter(Boolean)
  const bodyHtml = paragraphs
    .map(p => `<p style="color:#c8c8d0;font-size:14px;line-height:1.7;margin:0 0 12px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

  // Dynamic CTA based on intent
  let ctaHtml = ''
  if (['sales', 'upsell'].includes(intentCategory)) {
    ctaHtml = `<div style="text-align:center;margin:20px 0 8px;">
      <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:13px;padding:12px 32px;border-radius:10px;text-decoration:none;">Start Free Trial &rarr;</a>
    </div>`
  } else if (intentCategory === 'churn') {
    ctaHtml = `<div style="text-align:center;margin:20px 0 8px;">
      <a href="https://qivori.com" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:13px;padding:12px 32px;border-radius:10px;text-decoration:none;">Keep My Account &rarr;</a>
    </div>`
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
${ctaHtml}
</div>
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Powered by Qivori AI &mdash; The Operating System for Modern Carriers</p>
<p style="color:#555;font-size:11px;margin:4px 0 0;">Need a human? Just reply "speak to a team member" &middot; hello@qivori.com</p>
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
        title: 'Email Bot Alert',
        body: `[info] ${reason} — from ${senderEmail} (${subject})`,
        user_id: 'system',
        read: false,
      }),
    })
  } catch (e) { /* non-critical */ }
}
