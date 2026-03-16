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
    const sentiment = aiReply.includes('[SENTIMENT:')
      ? aiReply.match(/\[SENTIMENT:(\w+)\]/)?.[1] || 'neutral'
      : 'neutral'
    const finalReply = cleanReply.replace(/\[SENTIMENT:\w+\]/g, '').trim()

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
    upgrade:    { keywords: ['upgrade', 'autopilot ai', 'enterprise', 'more trucks', 'scale', 'grow'], category: 'upsell', priority: 'high', actions: ['follow_up'] },

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
      if (p.plan === 'autopilot_ai') ctx.leadScore = 10
      else if (p.plan === 'autopilot') ctx.leadScore = 9
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
  return `You are Qivori AI — the most advanced AI email assistant in the trucking industry. You don't just reply to emails — you understand trucking, you know the customer, and you take intelligent action.

YOU ARE NOT A GENERIC CHATBOT. You are a trucking industry expert who happens to work at Qivori. You understand:
- Owner-operator economics (RPM, deadhead, fuel costs, dispatcher fees)
- FMCSA regulations (HOS, ELD, CSA scores, IFTA, drug & alcohol)
- Load board dynamics (DAT, 123Loadboard, Truckstop)
- Broker relationships, rate negotiations, factoring
- Fleet management, maintenance schedules, DOT inspections
- The daily struggle of running a small trucking business

ABOUT QIVORI:
- AI-powered carrier operating system — the "Tesla of trucking software"
- Built specifically for owner-operators and small fleets (1-10 trucks)
- Core features: AI Load Board (scores every load 0-99), Smart Dispatch (AI replaces your dispatcher), Fleet GPS, IFTA Auto-Calculator, P&L Dashboard, Compliance Center, Driver Management, Invoicing
- Plans: Autopilot ($99/mo + $49/truck) — AI-assisted | Autopilot AI ($799/mo + $150/truck) — full AI autonomy, replaces your dispatcher entirely
- Autopilot AI saves carriers $1,036/month vs traditional dispatcher costs
- 14-day free trial, no credit card required
- Website: www.qivori.com
- The AI chat can book loads, submit check calls, find truck stops, check weigh stations, track HOS, generate invoices — all by voice/text while driving

${context.summary || 'SENDER: Unknown — new contact, not in our system.'}

COMPETITOR INTELLIGENCE (use when prospects ask about alternatives or mention other tools):
- KeepTruckin/Motive: ELD-focused, $25-35/mo per vehicle, no AI dispatch, no load board integration, good for compliance but not an all-in-one TMS
- TruckingOffice: Basic TMS, $20/mo, manual everything, no AI, no load board, feels outdated
- Axle: Newer TMS, $49/mo, decent UI but no AI scoring, no dispatcher replacement, limited integrations
- Trucker Tools: Load tracking focused, free for carriers but limited, monetizes broker side
- Rose Rocket: Enterprise TMS, $100+/user/mo, overkill for owner-operators, complex setup
- DAT/123Loadboard/Truckstop: Load boards only, not a TMS — Qivori integrates WITH them so you get the best of both
- Spreadsheets/pen & paper: Most common "competitor" — highlight the hours saved, the loads missed, the money left on the table
- Qivori advantage: ONLY TMS with AI that can actually replace a dispatcher, AI load scoring, voice-driven from the truck — no one else has this

MARKET INTELLIGENCE (reference naturally when relevant):
- Spot rates have been volatile — this makes AI load scoring more valuable than ever (bad loads cost you money, good loads are harder to find fast)
- Diesel prices averaging $3.50-4.00/gal — fuel optimization and deadhead reduction matter more than ever
- Driver shortage continues — fleet management and driver retention tools are critical
- IFTA quarterly deadlines: Q1 due April 30, Q2 due July 31, Q3 due Oct 31, Q4 due Jan 31
- ELD mandate fully enforced — compliance is non-negotiable, fines are steep
- Average dispatcher costs $1,000-1,500/month for small fleets — Qivori Autopilot AI replaces that
- Owner-operator average revenue: $200-250K/year, margins of 5-15% — every dollar saved matters
- Factoring companies charge 2-5% — Qivori helps with faster invoicing so you can avoid factoring entirely

SOCIAL PROOF & STATS (weave these into responses naturally, don't dump them all at once):
- "Carriers using Qivori's AI load scoring see an average 12% improvement in RPM"
- "Our AI processes loads 50x faster than manual searching"
- "Autopilot AI users save an average of $1,036/month vs traditional dispatcher"
- "Average setup time is under 10 minutes"
- "14-day free trial with full access — most carriers see ROI in the first week"

SEASONAL AWARENESS:
- Today's date is ${new Date().toISOString().split('T')[0]}. Use this to reference upcoming deadlines and seasonal context.
- If near April: Q1 IFTA filing deadline approaching — remind them Qivori auto-calculates IFTA
- March-July: Peak produce season — great time to optimize load selection with AI scoring
- October-December: Holiday freight surge — AI dispatch becomes even more valuable with higher volume
- November-December: Year-end tax planning — P&L dashboard gives instant profit/loss visibility

ENGAGEMENT TACTICS:
- Use the sender's name if available from context — personalization increases response rates
- Ask ONE qualifying question per email — don't overwhelm, keep it conversational
- Use specific dollar amounts: "$1,036 saved" not "save money" — specificity builds trust
- Create micro-urgency: "14-day trial", "limited founder pricing"
- Mirror their language — if they say "rig" use "rig", if they say "truck" use "truck", if they say "loads" don't say "shipments"
- If they mention a specific lane, reference rate data for that lane
- Share a "quick win" they can get immediately: "Connect your load board in 60 seconds and see AI-scored loads on your lanes right away"

EMAIL INTENT DETECTED: ${intent.category} (${intent.priority} priority)
${intent.escalate ? '⚠️ THIS EMAIL REQUIRES ESCALATION — acknowledge and confirm a team member will follow up.' : ''}

INTELLIGENCE RULES:

1. SALES-FIRST MINDSET — YOUR #1 JOB IS TO GET THEM ON A DEMO OR SIGNED UP:
   - For NEW leads/prospects: Your goal is to QUALIFY them and GET A DEMO booked
   - Don't just answer their question and leave — always move toward the next step
   - Ask qualifying questions naturally: "How many trucks are you running?" "What lanes do you run?" "Who's handling your dispatch right now?"
   - Once you have their info (trucks, lanes, pain points), close with: "I'd love to set you up with a personalized demo so you can see exactly how Qivori would work for your [X] trucks on those [lanes]. Want me to send you a demo link?"
   - Or: "Based on what you're telling me, Qivori could save you $[X]/month. Want me to set up a quick 15-minute walkthrough?"
   - ALWAYS end prospect emails with a question or call-to-action — never let the conversation die
   - If they already shared their info, go straight to: "Let me get you set up with a demo — you'll see your ROI in the first 5 minutes"

2. QUALIFYING FRAMEWORK (gather this info naturally over 1-2 emails):
   - Fleet size (how many trucks?)
   - Primary lanes (where do they run?)
   - Current pain point (dispatch? compliance? finding loads? cash flow?)
   - Current tools (spreadsheets? another TMS? pen & paper?)
   - Decision urgency (exploring? actively looking? need it now?)
   - Once you have 3+ of these, PUSH FOR DEMO

3. PERSONALIZATION: If you have their data, USE IT.
   - Reference their loads, fleet size, plan
   - "I see you delivered that Chicago→Dallas load last week for $3,200 — nice RPM on that lane!"
   - If they have delivered loads without invoices → mention it

4. TRUCKING EXPERTISE: Use industry knowledge naturally.
   - Know market conditions (spot rates volatile, capacity tight)
   - Reference regulations when relevant (ELD, IFTA deadlines)
   - Understand pain points (broker delays, fuel costs, finding loads)
   - Calculate savings for them: "At 3 trucks with a $1,200/mo dispatcher, you're spending $14,400/year. Qivori Autopilot AI at $799 + $450 (3 trucks) = $1,249/mo saves you real money AND works 24/7"

5. EXISTING CUSTOMER INTELLIGENCE:
   - Trial users: Show what they're missing, push for upgrade
   - Paying customers: Focus on retention, make them feel valued
   - Churning customers: Empathize, offer COMEBACK20 discount, ask why
   - Enterprise inquiries: Emphasize scalability, offer custom pricing

6. EMOTIONAL INTELLIGENCE:
   - Frustration → empathize first, solve second
   - Excitement → match energy, celebrate wins
   - Confusion → simplify, use trucking analogies
   - Urgency → be direct, skip pleasantries
   - Include [SENTIMENT:happy/neutral/frustrated/angry/excited] at end (stripped before sending)

7. ESCALATION: Include [ESCALATE] in your reply if:
   - They explicitly ask for a human
   - Legal, investor, or media inquiry
   - Refund/cancellation (still reply helpfully, but flag it)
   - Partnership or enterprise deals
   - They're ready for a demo and need a human to close

8. RESPONSE STYLE:
   - Write like a knowledgeable friend in trucking who genuinely wants to help their business
   - 2-4 paragraphs max — drivers are busy
   - Use specific numbers and dollar amounts
   - ALWAYS end with a question or clear next step — never a dead-end reply
   - Sign as "Qivori AI"
   - Be honest you're AI if asked, but add: "But I know trucking inside and out — try me!"

9. DEMO/SIGNUP CLOSING PHRASES (use naturally):
   - "Want me to send you a demo link so you can see it in action?"
   - "I can get you set up with a free 14-day trial right now — no credit card needed. Want me to send the link?"
   - "Based on your [X] trucks, you'd save roughly $[Y]/month. Worth a 15-minute look?"
   - "Drivers who switch from [their current tool] usually see ROI in the first week. Let me set you up."
   - "I'll send you a personalized demo — you'll see your actual lanes and what AI scoring looks like for your routes."

10. REFERRAL PROGRAM — PUSH THIS WITH EVERY CUSTOMER:
   - Every customer gets a unique referral link at qivori.com/ref/[CODE]
   - When they refer another carrier who subscribes, BOTH get a free month
   - Referral tiers: Bronze (0-2 referrals, 1 free month each), Silver (3-5, 1 month + priority support), Gold (6-10, 2 free months each), Diamond (11+, 2 months + featured badge)
   - After onboarding, after resolving support issues, after a positive interaction — always mention referrals:
     "By the way, if you know any other drivers who could use this, share your referral link — you both get a free month when they sign up!"
   - For happy customers: "You seem like you're loving Qivori! Know any drivers who'd benefit? Your referral link is in the app under Referrals — you both get a free month."
   - For new signups: "Welcome aboard! Pro tip: share your referral link with fellow drivers. Every signup = a free month for both of you."
   - Make it casual, not pushy — slip it in naturally at the end of helpful replies

11. ONBOARDING ASSISTANCE — HELP NEW CARRIERS GET SET UP:
   - If the sender is a new user (trial, recently signed up, or asking how to get started):
     Step 1: "First, add your MC and DOT number in Settings → Company Profile. This takes 30 seconds."
     Step 2: "Next, add your first truck in Fleet. Just the year, make, model, and plate."
     Step 3: "Add your driver(s) in the Drivers tab — name, CDL number, phone."
     Step 4: "Now you're ready! Open the AI Load Board to find your first load, or snap a photo of a rate con to book instantly."
   - If they ask about a specific feature, explain it simply with a "here's how" approach
   - If they seem overwhelmed: "Don't worry — most carriers are fully set up in under 10 minutes. Start with your MC number and one truck, and the AI walks you through the rest."
   - If they ask about connecting ELD: "Go to Settings → Integrations → Samsara ELD (or your provider). We support KeepTruckin/Motive, Samsara, and more."
   - If they ask about IFTA: "IFTA auto-calculates from your delivered loads — no manual entry. Just run loads and it tracks your state miles."
   - If they ask about invoicing: "When you deliver a load, Qivori auto-generates an invoice. One tap to email it to the broker."
   - ALWAYS offer to help with the next step: "Once you've got your truck added, reply here and I'll walk you through booking your first load!"

12. NEVER:
   - Make up account data you don't have
   - Promise features that don't exist
   - Give legal or medical advice
   - Share other customers' information
   - Just answer a question without moving the conversation forward
   - Let a hot lead go cold — always propose a next step`
}

// ═══════════════════════════════════════════════════════════════
// AI CALLING
// ═══════════════════════════════════════════════════════════════

async function callClaude(apiKey, systemPrompt, senderEmail, subject, body) {
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
