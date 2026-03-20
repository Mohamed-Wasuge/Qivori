/**
 * Shared email templates and sending utilities for the Qivori business system.
 * All emails use Resend API with Qivori branding.
 // v2.1 — autonomous agent email utilities
 */

// ── Send email via Resend ──
export async function sendEmail(to, subject, html) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { ok: false, error: 'RESEND_API_KEY not configured' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Qivori AI <hello@qivori.com>', reply_to: 'qivori@sheamjan.resend.app', to: [to], subject, html }),
  })
  return { ok: res.ok }
}

// ── Send SMS to admin ──
export async function sendAdminSMS(message) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  const adminPhone = process.env.ADMIN_PHONE
  if (!sid || !token || !from || !adminPhone) return
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: adminPhone, From: from, Body: message }).toString(),
  }).catch(() => {})
}

// ── Send email to admin ──
export async function sendAdminEmail(subject, body) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@qivori.com'
  return sendEmail(adminEmail, subject, wrap(body))
}

// ── Log email to Supabase to prevent duplicates ──
export async function logEmail(userId, email, template, metadata = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return
  await fetch(`${url}/rest/v1/email_logs`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ user_id: userId, email, template, metadata }),
  }).catch(() => {})
}

// ── Check if email was already sent ──
export async function wasEmailSent(userId, template) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/email_logs?user_id=eq.${userId}&template=eq.${template}&select=id&limit=1`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
  })
  if (!res.ok) return false
  const data = await res.json()
  return data.length > 0
}

// ── Log revenue event ──
export async function logRevenueEvent(userId, eventType, amountCents = 0, plan = null, metadata = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return
  await fetch(`${url}/rest/v1/revenue_events`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ user_id: userId, event_type: eventType, amount_cents: amountCents, plan, metadata }),
  }).catch(() => {})
}

// ── Wrap content in Qivori email template ──
function wrap(content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:24px;">
${content}
</div>
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Qivori AI - AI-Powered TMS for Trucking</p>
<p style="color:#555;font-size:11px;margin:4px 0 0;">Questions? Reply to this email · hello@qivori.com</p>
</div></div></body></html>`
}

// ── Email Templates ──

export const TEMPLATES = {
  day3_checkin: (firstName) => ({
    subject: `${firstName}, have you connected your load board yet?`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Hey ${firstName}!</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Quick check-in — have you connected your load board yet?</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Connecting DAT, 123Loadboard, or Truckstop unlocks the full power of Qivori's AI:</p>
      <ul style="color:#c8c8d0;font-size:13px;line-height:1.8;padding-left:20px;">
        <li><strong style="color:#f0a500;">AI Load Scoring</strong> — we rate every load 0-99 based on RPM, deadhead, lane trends</li>
        <li><strong style="color:#f0a500;">Proactive Load Finding</strong> — we auto-find loads as you approach delivery</li>
        <li><strong style="color:#f0a500;">One-tap booking</strong> — book loads right from the AI chat</li>
      </ul>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Connect Load Board →</a>
      </div>
    `),
  }),

  day7_value: (firstName) => ({
    subject: `${firstName}, here's what Qivori saved drivers this week`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">This Week on Qivori</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Here's what other owner-operators achieved with Qivori AI this week:</p>
      <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin:16px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <div style="text-align:center;flex:1;"><div style="color:#f0a500;font-size:24px;font-weight:800;">$2,400</div><div style="color:#8a8a9a;font-size:11px;">avg saved/month</div></div>
          <div style="text-align:center;flex:1;"><div style="color:#22c55e;font-size:24px;font-weight:800;">40+</div><div style="color:#8a8a9a;font-size:11px;">hours saved/week</div></div>
          <div style="text-align:center;flex:1;"><div style="color:#4d8ef0;font-size:24px;font-weight:800;">89/99</div><div style="color:#8a8a9a;font-size:11px;">avg AI load score</div></div>
        </div>
      </div>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">${firstName}, are you getting the most out of your trial? Open Qivori and try asking the AI to find you the best loads right now.</p>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Find Loads Now →</a>
      </div>
    `),
  }),

  day12_trial_ending: (firstName, daysLeft = 2) => ({
    subject: `⚠️ ${firstName}, your free trial ends in ${daysLeft} days`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Your Trial Ends in ${daysLeft} Days</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, your 14-day Qivori AI trial is almost over.</p>
      <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-radius:12px;padding:16px 20px;margin:16px 0;">
        <p style="color:#f0a500;font-size:14px;font-weight:700;margin:0 0 8px;">Lock in founder pricing now:</p>
        <p style="color:#c8c8d0;font-size:13px;margin:0;line-height:1.6;">
          <strong>Autonomous Fleet AI</strong> — $399/truck/mo (founder pricing, normally $599) · AI finds loads, calls brokers, negotiates rates, handles compliance. Replaces your dispatcher.
        </p>
      </div>
      <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-radius:12px;padding:12px 16px;margin:12px 0;text-align:center;">
        <p style="color:#f0a500;font-size:13px;font-weight:700;margin:0;">Save $200/truck vs regular pricing ($599). AI dispatcher works 24/7.</p>
      </div>
      <p style="color:#ef4444;font-size:13px;">After your trial ends, you'll lose access to all features and data.</p>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Upgrade Now →</a>
      </div>
    `),
  }),

  trial_expired: (firstName) => ({
    subject: `${firstName}, your Qivori trial has ended`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Your Trial Has Ended</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, your 14-day free trial is over. Your account is now inactive.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">But your data is still here — upgrade anytime to pick up right where you left off.</p>
      <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:16px;margin:16px 0;text-align:center;">
        <p style="color:#f0a500;font-size:16px;font-weight:700;margin:0;">Autonomous Fleet AI — $399/truck/mo</p>
        <p style="color:#8a8a9a;font-size:12px;margin:6px 0 0;">Founder pricing (normally $599). AI dispatcher works 24/7.</p>
      </div>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Upgrade & Keep Your Data →</a>
      </div>
    `),
  }),

  payment_failed: (firstName) => ({
    subject: `⚠️ ${firstName}, your payment failed`,
    html: wrap(`
      <h2 style="color:#ef4444;font-size:20px;margin:0 0 12px;">Payment Failed</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, we couldn't process your latest payment.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Please update your payment method to keep your Qivori account active. We'll retry automatically, but updating your card ensures no interruption.</p>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#ef4444;color:#fff;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Update Payment Method →</a>
      </div>
    `),
  }),

  payment_succeeded: (firstName, amount, plan) => ({
    subject: `✅ Payment received — ${plan} plan active`,
    html: wrap(`
      <h2 style="color:#22c55e;font-size:20px;margin:0 0 12px;">Payment Received!</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, your payment of <strong style="color:#fff;">$${(amount / 100).toFixed(2)}</strong> for the <strong style="color:#f0a500;">${plan}</strong> plan has been processed.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Your account is fully active. Keep hauling!</p>
    `),
  }),

  upgrade_congrats: (firstName, plan) => {
    return {
      subject: `Welcome to Autonomous Fleet AI!`,
      html: wrap(`
        <h2 style="color:#f0a500;font-size:20px;margin:0 0 12px;">Welcome to Autonomous Fleet AI!</h2>
        <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, your <strong style="color:#f0a500;">Autonomous Fleet AI</strong> plan is now active. All features are unlocked.</p>
        <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Here's what's included:</p>
        <ul style="color:#c8c8d0;font-size:13px;line-height:1.8;padding-left:20px;">
          <li>Full AI-powered dispatching — replaces your dispatcher entirely</li>
          <li>AI finds loads, calls brokers, negotiates rates</li>
          <li>Unlimited loads, drivers, and AI queries</li>
          <li>Compliance, IFTA, invoicing — all automated</li>
          <li>Priority support & dedicated account manager</li>
        </ul>
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:16px 20px;margin:16px 0;text-align:center;">
          <p style="color:#22c55e;font-size:16px;font-weight:800;margin:0;">Save $200/truck vs regular pricing ($599). AI dispatcher works 24/7.</p>
        </div>
        <div style="text-align:center;margin-top:24px;">
          <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Open Qivori →</a>
        </div>
      `),
    }
  },

  win_back_day3: (firstName) => ({
    subject: `We miss you, ${firstName} — here's 20% off`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">We Miss You, ${firstName}</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">We noticed you cancelled your Qivori subscription. We'd love to have you back.</p>
      <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:16px 20px;margin:16px 0;">
        <p style="color:#22c55e;font-size:18px;font-weight:800;margin:0 0 12px;text-align:center;">20% OFF for 3 months</p>
        <p style="color:#c8c8d0;font-size:13px;margin:0;line-height:1.8;">
          <strong>Autonomous Fleet AI</strong> — <span style="text-decoration:line-through;color:#8a8a9a;">$399/truck</span> <strong style="color:#22c55e;">$319/truck/mo</strong>
        </p>
        <p style="color:#8a8a9a;font-size:11px;margin:8px 0 0;text-align:center;">Use code <strong style="color:#fff;">COMEBACK20</strong> at checkout</p>
      </div>
      <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-radius:12px;padding:12px 16px;margin:12px 0;text-align:center;">
        <p style="color:#f0a500;font-size:13px;font-weight:700;margin:0;">Autonomous Fleet AI replaces your dispatcher — AI finds loads, calls brokers, negotiates rates, handles compliance. Works 24/7.</p>
      </div>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Come Back →</a>
      </div>
    `),
  }),

  win_back_day7: (firstName) => ({
    subject: `Last chance, ${firstName} — 30 extra trial days`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Last Chance, ${firstName}</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">We'll extend your trial by 30 days — completely free — if you come back now.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">No commitment, no credit card. Just 30 more days to see how Qivori can save you time and money.</p>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Restart My Trial →</a>
      </div>
    `),
  }),

  win_back_day30: (firstName) => ({
    subject: `${firstName}, one last thing before we go`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">We'd Love Your Feedback</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, it's been 30 days since you left Qivori. We respect your decision, but we'd love to know why.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Your feedback helps us build a better platform for owner-operators like you.</p>
      <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:16px;margin:16px 0;">
        <p style="color:#c8c8d0;font-size:13px;margin:0;">Just reply to this email with your thoughts — Mohamed reads every response personally.</p>
      </div>
      <p style="color:#8a8a9a;font-size:13px;">Your account data is still saved. You can reactivate anytime at <a href="https://qivori.com" style="color:#f0a500;">qivori.com</a>.</p>
    `),
  }),

  churn_no_login: (firstName) => ({
    subject: `${firstName}, we haven't seen you in a while`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">We Miss You!</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, it's been a week since your last login. Everything okay?</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">While you were away, Qivori has been tracking new loads on your lanes. Come back and see what's available.</p>
      <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-radius:12px;padding:12px 16px;margin:16px 0;text-align:center;">
        <p style="color:#f0a500;font-size:13px;font-weight:700;margin:0;">Did you know? Autonomous Fleet AI replaces your dispatcher — $399/truck/mo. AI finds loads, calls brokers, negotiates rates. Works 24/7.</p>
      </div>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Check New Loads →</a>
      </div>
    `),
  }),

  churn_no_search: (firstName) => ({
    subject: `${firstName}, need help finding loads?`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Need Help Finding Loads?</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, we noticed you haven't searched for loads in a few days.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Just open Qivori and say <strong style="color:#f0a500;">"Find me the best loads right now"</strong> — the AI will do the rest.</p>
      <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-radius:12px;padding:12px 16px;margin:16px 0;text-align:center;">
        <p style="color:#f0a500;font-size:13px;font-weight:700;margin:0;">Autonomous Fleet AI — $399/truck/mo. AI finds loads, calls brokers, negotiates rates, handles compliance. Replaces your dispatcher.</p>
      </div>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Find Loads →</a>
      </div>
    `),
  }),

  churn_no_loadboard: (firstName) => ({
    subject: `${firstName}, connect your load board to unlock AI`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Unlock the Full Power of Qivori</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, you haven't connected a load board yet. Without it, Qivori's AI can't find and score loads for you.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">It takes 60 seconds — just go to Settings → Load Board Connections.</p>
      <p style="color:#8a8a9a;font-size:13px;">We support <strong style="color:#22c55e;">DAT</strong>, <strong style="color:#3b82f6;">123Loadboard</strong>, and <strong style="color:#f0a500;">Truckstop</strong>.</p>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Connect Now →</a>
      </div>
    `),
  }),

  churn_high_risk: (firstName, signals) => ({
    subject: `A personal note from Mohamed — ${firstName}`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Hey ${firstName},</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">This is Mohamed, the founder of Qivori. I noticed you might not be getting the most out of the platform.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">I built Qivori specifically for owner-operators like you, and I want to make sure it's working for you. Can I help with anything?</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">If dispatching is your biggest pain point, our <strong style="color:#f0a500;">Autonomous Fleet AI</strong> plan ($399/truck/mo) replaces your dispatcher entirely — AI finds loads, calls brokers, negotiates rates, handles compliance. Works 24/7.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Just reply to this email — I read and respond to every single one.</p>
      <p style="color:#f0a500;font-size:14px;font-weight:700;margin-top:24px;">— Mohamed Wasuge, Founder</p>
    `),
  }),

  referral_reward: (firstName) => ({
    subject: `🎉 ${firstName}, you earned a free month!`,
    html: wrap(`
      <h2 style="color:#f0a500;font-size:20px;margin:0 0 12px;">Free Month Earned!</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, someone you referred just paid their first invoice!</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Your reward: <strong style="color:#22c55e;">1 month free</strong> on your Autonomous Fleet AI plan. It'll be applied to your next billing cycle automatically.</p>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Keep sharing your referral link to earn more free months!</p>
      <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-radius:12px;padding:12px 16px;margin:16px 0;text-align:center;">
        <p style="color:#f0a500;font-size:13px;font-weight:700;margin:0;">Autonomous Fleet AI — $399/truck/mo. AI finds loads, calls brokers, negotiates rates, handles compliance. Works 24/7.</p>
      </div>
    `),
  }),
}
