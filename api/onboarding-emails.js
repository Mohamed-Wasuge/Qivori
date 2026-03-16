import { sendEmail, wasEmailSent, logEmail } from './_lib/emails.js'
import { handleCors, corsHeaders } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// ── Onboarding email templates (Qivori dark theme) ──

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
<p style="color:#555;font-size:11px;margin:4px 0 0;">Questions? Reply to this email &middot; hello@qivori.com</p>
</div></div></body></html>`
}

const ONBOARDING_TEMPLATES = {
  onboarding_day3: (firstName) => ({
    subject: `${firstName}, 3 tips to get the most from Qivori`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Hey ${firstName}, here are 3 quick tips</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;margin:0 0 20px;">You've been on Qivori for a few days now. Here's how to unlock the full power of the platform:</p>

      <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:flex-start;">
            <span style="color:#f0a500;font-size:20px;font-weight:800;margin-right:12px;line-height:1;">1</span>
            <div>
              <strong style="color:#fff;font-size:14px;">Upload a rate con to auto-create loads</strong>
              <p style="color:#8a8a9a;font-size:13px;line-height:1.5;margin:4px 0 0;">Snap a photo or upload a PDF of your rate confirmation. Qivori's AI will extract all the details and create the load for you automatically.</p>
            </div>
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:flex-start;">
            <span style="color:#f0a500;font-size:20px;font-weight:800;margin-right:12px;line-height:1;">2</span>
            <div>
              <strong style="color:#fff;font-size:14px;">Set up fleet tracking for real-time GPS</strong>
              <p style="color:#8a8a9a;font-size:13px;line-height:1.5;margin:4px 0 0;">Connect your ELD or enable GPS tracking to see your trucks in real time. Brokers love live tracking updates, and it helps with IFTA calculations.</p>
            </div>
          </div>
        </div>

        <div>
          <div style="display:flex;align-items:flex-start;">
            <span style="color:#f0a500;font-size:20px;font-weight:800;margin-right:12px;line-height:1;">3</span>
            <div>
              <strong style="color:#fff;font-size:14px;">Use AI chat to analyze your P&amp;L</strong>
              <p style="color:#8a8a9a;font-size:13px;line-height:1.5;margin:4px 0 0;">Just ask Qivori: "How's my P&amp;L this month?" or "What's my cost per mile?" The AI crunches your numbers instantly.</p>
            </div>
          </div>
        </div>
      </div>

      <div style="text-align:center;margin-top:24px;">
        <a href="https://www.qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Open Qivori</a>
      </div>
    `),
  }),

  onboarding_day7: (firstName) => ({
    subject: `${firstName}, your trial ends in 7 days`,
    html: wrap(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Your Trial Is Halfway Through</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;margin:0 0 20px;">Hey ${firstName}, you have <strong style="color:#f0a500;">7 days left</strong> on your free trial. Here's a reminder of everything Qivori does for you:</p>

      <div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="font-size:12px;color:#f0a500;font-weight:700;letter-spacing:1px;margin-bottom:12px;">FEATURES AT YOUR FINGERTIPS</div>
        <ul style="color:#c8c8d0;font-size:13px;line-height:1.8;padding-left:20px;margin:0;">
          <li><strong style="color:#fff;">AI-Powered Dispatching</strong> — find, score, and book the best loads automatically</li>
          <li><strong style="color:#fff;">Rate Con Scanning</strong> — upload a PDF and let AI create your loads</li>
          <li><strong style="color:#fff;">Real-Time Fleet Tracking</strong> — GPS tracking with ETA updates</li>
          <li><strong style="color:#fff;">IFTA Auto-Calculation</strong> — state mileage computed from your deliveries</li>
          <li><strong style="color:#fff;">AI Chat Assistant</strong> — ask anything about your business, anytime</li>
          <li><strong style="color:#fff;">Invoicing &amp; Payments</strong> — generate and send invoices in seconds</li>
        </ul>
      </div>

      <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-radius:12px;padding:16px 20px;margin:16px 0;">
        <p style="color:#f0a500;font-size:14px;font-weight:700;margin:0 0 8px;">Ready to keep going?</p>
        <p style="color:#c8c8d0;font-size:13px;margin:0;line-height:1.6;">
          <strong>Autopilot</strong> — $99/mo &middot; AI-assisted dispatching, load scoring, IFTA, compliance<br>
          <strong>Autopilot AI</strong> — $799/mo &middot; Full AI autonomy, auto-dispatch, proactive load finding
        </p>
      </div>

      <div style="text-align:center;margin-top:24px;">
        <a href="https://www.qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Upgrade Now</a>
      </div>
    `),
  }),

  onboarding_day13: (firstName) => ({
    subject: `Last day of your free trial`,
    html: wrap(`
      <h2 style="color:#ef4444;font-size:20px;margin:0 0 12px;">Your Free Trial Ends Tomorrow</h2>
      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;margin:0 0 20px;">Hey ${firstName}, this is your last day to use Qivori with full access. After today, you'll lose:</p>

      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:20px;margin-bottom:16px;">
        <ul style="color:#c8c8d0;font-size:13px;line-height:1.8;padding-left:20px;margin:0;">
          <li><span style="color:#ef4444;">&#10005;</span> AI load finding and scoring</li>
          <li><span style="color:#ef4444;">&#10005;</span> Fleet tracking and GPS updates</li>
          <li><span style="color:#ef4444;">&#10005;</span> IFTA calculations and compliance tools</li>
          <li><span style="color:#ef4444;">&#10005;</span> AI chat assistant</li>
          <li><span style="color:#ef4444;">&#10005;</span> Invoicing and payment tools</li>
          <li><span style="color:#ef4444;">&#10005;</span> All dispatch and load management features</li>
        </ul>
      </div>

      <div style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.2);border-radius:12px;padding:12px 16px;margin:12px 0;text-align:center;">
        <p style="color:#f0a500;font-size:14px;font-weight:700;margin:0;">Your data will be saved — upgrade anytime to pick up where you left off.</p>
      </div>

      <p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Plans start at just <strong style="color:#fff;">$99/month</strong> — less than one load's broker fee. Autopilot AI at $799/mo replaces your dispatcher entirely, saving you $1,036/month.</p>

      <div style="text-align:center;margin-top:24px;">
        <a href="https://www.qivori.com" style="display:inline-block;background:#ef4444;color:#fff;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Keep My Account</a>
      </div>
    `),
  }),
}

// ── Map day ranges to template keys ──
const ONBOARDING_SCHEDULE = [
  { day: 3, template: 'onboarding_day3' },
  { day: 7, template: 'onboarding_day7' },
  { day: 13, template: 'onboarding_day13' },
]

// ── Fetch trial/pending profiles from Supabase ──
async function fetchTrialProfiles() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase not configured')

  const res = await fetch(
    `${url}/rest/v1/profiles?status=in.(pending,trial)&select=id,email,full_name,status,plan,created_at`,
    {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to fetch profiles: ${res.status} ${text}`)
  }

  return res.json()
}

// ── Main handler ──
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Verify cron secret or admin auth to prevent unauthorized triggers
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const reqUrl = new URL(req.url)
  const dryRun = reqUrl.searchParams.get('dry_run') === 'true'

  try {
    const profiles = await fetchTrialProfiles()
    const now = new Date()
    const results = { sent: [], skipped: [], errors: [], dry_run: dryRun }

    for (const profile of profiles) {
      const createdAt = new Date(profile.created_at)
      const daysSinceSignup = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24))
      const firstName = (profile.full_name || 'there').split(' ')[0].replace(/[<>"'&]/g, '').substring(0, 50)

      for (const { day, template } of ONBOARDING_SCHEDULE) {
        // Only send if user is on or past the scheduled day
        if (daysSinceSignup < day) continue

        // Allow a 2-day window so we don't miss someone if the cron skips a day
        if (daysSinceSignup > day + 2) continue

        // Check if already sent
        const alreadySent = await wasEmailSent(profile.id, template)
        if (alreadySent) {
          results.skipped.push({ email: profile.email, template, reason: 'already_sent' })
          continue
        }

        const templateFn = ONBOARDING_TEMPLATES[template]
        if (!templateFn) continue

        const { subject, html } = templateFn(firstName)

        if (dryRun) {
          results.sent.push({
            email: profile.email,
            template,
            subject,
            days_since_signup: daysSinceSignup,
            preview: true,
          })
          continue
        }

        // Send the email
        const sendResult = await sendEmail(profile.email, subject, html)

        if (sendResult.ok) {
          // Log to prevent duplicates
          await logEmail(profile.id, profile.email, template, {
            days_since_signup: daysSinceSignup,
            plan: profile.plan,
          })
          results.sent.push({
            email: profile.email,
            template,
            subject,
            days_since_signup: daysSinceSignup,
          })
        } else {
          results.errors.push({
            email: profile.email,
            template,
            error: sendResult.error || 'Send failed',
          })
        }
      }
    }

    results.total_profiles_checked = profiles.length
    results.summary = {
      sent: results.sent.length,
      skipped: results.skipped.length,
      errors: results.errors.length,
    }

    return Response.json(results, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json(
      { error: err.message || 'Server error' },
      { status: 500, headers: corsHeaders(req) }
    )
  }
}
