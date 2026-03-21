import { sendEmail } from './_lib/emails.js'
import { handleCors, corsHeaders } from './_lib/auth.js'
import { rateLimit, getClientIP } from './_lib/rate-limit.js'
import { sanitizeString, sanitizeEmail } from './_lib/sanitize.js'

export const config = { runtime: 'edge' }

/* ── Disposable / throwaway email domains ─────────────────────── */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','tempmail.com','guerrillamail.com','guerrillamail.net',
  'sharklasers.com','grr.la','guerrillamailblock.com','throwaway.email',
  'yopmail.com','trashmail.com','10minutemail.com','tempail.com',
  'fakeinbox.com','dispostable.com','maildrop.cc','mailnesia.com',
  'temp-mail.org','getnada.com','mohmal.com','burnermail.io',
  'mailsac.com','harakirimail.com','discard.email','33mail.com',
  'mytemp.email','tempinbox.com','spamgourmet.com','mailcatch.com',
  'mintemail.com','inboxkitten.com','tempr.email','anonymousemail.me',
])

/* ── Email validation ─────────────────────────────────────────── */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email required'
  const trimmed = email.trim().toLowerCase()

  // Basic format
  const emailRe = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/
  if (!emailRe.test(trimmed)) return 'Please enter a valid business email address'

  const [local, domain] = trimmed.split('@')

  // Reject disposable domains
  if (DISPOSABLE_DOMAINS.has(domain)) return 'Please enter a valid business email address'

  // Reject suspiciously long random-looking local parts (8+ consecutive digits)
  if (/\d{8,}/.test(local)) return 'Please enter a valid business email address'

  // Reject local parts that are mostly random chars (>20 chars with <3 vowels)
  if (local.length > 20) {
    const vowels = (local.match(/[aeiou]/gi) || []).length
    if (vowels < 3) return 'Please enter a valid business email address'
  }

  // Domain must have a dot and reasonable TLD
  const parts = domain.split('.')
  if (parts.length < 2 || parts[parts.length - 1].length < 2) {
    return 'Please enter a valid business email address'
  }

  return null // valid
}

/* ── MX record check via DNS-over-HTTPS ───────────────────────── */
async function hasMxRecords(domain) {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
      signal: AbortSignal.timeout(3000),
    })
    const data = await res.json()
    return data.Answer && data.Answer.length > 0
  } catch {
    return true // allow on DNS failure (don't block real users)
  }
}

/* ── reCAPTCHA v3 verification ────────────────────────────────── */
async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) return true // skip if not configured
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    })
    const data = await res.json()
    return data.success && (data.score || 0) >= 0.3
  } catch {
    return true // allow on verification failure
  }
}

/**
 * Demo Request — captures lead info, sends welcome email, grants instant demo access.
 * POST { name, email, phone?, company?, _hp?, recaptchaToken? }
 * Saves to demo_requests table in Supabase for admin tracking.
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  try {
    const raw = await req.json()

    // Honeypot — if hidden field is filled, silently accept (bot thinks it worked)
    if (raw._hp) {
      return Response.json({ success: true, firstName: 'Thanks' }, { headers: corsHeaders(req) })
    }

    const name = sanitizeString(raw.name, 200)
    const email = sanitizeEmail(raw.email) || String(raw.email || '').trim().toLowerCase()
    const phone = sanitizeString(raw.phone, 30)
    const company = sanitizeString(raw.company, 200)
    const truckCount = sanitizeString(raw.truckCount, 20)
    const currentELD = sanitizeString(raw.currentELD, 100)
    const factoringCompany = sanitizeString(raw.factoringCompany, 200)
    const loadBoards = sanitizeString(raw.loadBoards, 500)
    const painPoints = sanitizeString(raw.painPoints, 2000)
    const recaptchaToken = raw.recaptchaToken

    // Rate limit — 3 requests per IP per day (86400s)
    const ip = getClientIP(req)
    const { limited } = rateLimit(`demo_${ip}`, 3, 86400000)
    if (limited) {
      return Response.json({ error: 'Too many requests. Please try again tomorrow.' }, { status: 429, headers: corsHeaders(req) })
    }

    // Email validation
    const emailError = validateEmail(email)
    if (emailError) {
      return Response.json({ error: emailError }, { status: 400, headers: corsHeaders(req) })
    }

    // MX record check
    const domain = email.trim().toLowerCase().split('@')[1]
    const hasMx = await hasMxRecords(domain)
    if (!hasMx) {
      return Response.json({ error: 'Please enter a valid business email address' }, { status: 400, headers: corsHeaders(req) })
    }

    // reCAPTCHA v3 verification
    const captchaOk = await verifyRecaptcha(recaptchaToken || '')
    if (!captchaOk) {
      return Response.json({ error: 'Verification failed. Please try again.' }, { status: 400, headers: corsHeaders(req) })
    }

    const firstName = (name || email.split('@')[0]).split(' ')[0]
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY

    // Save to demo_requests table
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/rest/v1/demo_requests`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          name: name || '',
          email,
          phone: phone || '',
          company: company || '',
          truck_count: truckCount || '',
          current_eld: currentELD || '',
          factoring_company: factoringCompany || '',
          load_boards: loadBoards || '',
          pain_points: painPoints || '',
          source: 'landing_page',
          created_at: new Date().toISOString(),
        }),
      }).catch(() => {})
    }

    // Send welcome email with demo link
    const demoUrl = 'https://www.qivori.com/?demo=true'
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:24px;">
<span style="font-size:28px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;">
<h2 style="color:#f0a500;font-size:20px;margin:0 0 12px;">Hey ${firstName}, your demo is ready!</h2>
<p style="color:#8a8a9a;font-size:14px;line-height:1.7;">You now have full access to explore Qivori AI — the AI-powered TMS built for owner-operators and small fleets.</p>
<div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:16px;margin:20px 0;">
<div style="font-size:13px;color:#fff;font-weight:600;margin-bottom:8px;">What you'll see:</div>
<div style="font-size:12px;color:#8a8a9a;line-height:1.8;">
• Kanban load pipeline with drag-and-drop<br/>
• AI dashboard with revenue insights<br/>
• Fleet management & GPS tracking<br/>
• Invoice generation & factoring<br/>
• IFTA, CSA, compliance tools<br/>
• Voice-first AI dispatch on mobile
</div>
</div>
<div style="text-align:center;margin-top:24px;">
<a href="${demoUrl}" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">Launch Demo →</a>
</div>
<p style="color:#8a8a9a;font-size:12px;margin-top:20px;line-height:1.6;">When you're ready to go live, your 14-day free trial includes everything — no credit card needed.</p>
</div>
<p style="text-align:center;font-size:11px;color:#4a5570;margin-top:20px;">
Qivori AI · Replaces your dispatcher — save $1,036/month<br/>
<a href="https://www.qivori.com" style="color:#f0a500;text-decoration:none;">qivori.com</a>
</p>
</div></body></html>`

    await sendEmail(email, `${firstName}, your Qivori demo is ready`, html).catch(() => {})

    // Notify admin
    const adminEmail = process.env.ADMIN_EMAIL
    if (adminEmail) {
      await sendEmail(adminEmail, `New Demo Request — ${name || email}`,
        `<div style="font-family:sans-serif;padding:20px;">
          <h3>New Demo Request</h3>
          <p><strong>Name:</strong> ${name || '—'}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || '—'}</p>
          <p><strong>Company:</strong> ${company || '—'}</p>
          <p><strong>Trucks:</strong> ${truckCount || '—'}</p>
          <p><strong>ELD:</strong> ${currentELD || '—'}</p>
          <p><strong>Factoring:</strong> ${factoringCompany || '—'}</p>
          <p><strong>Load Boards:</strong> ${loadBoards || '—'}</p>
          <p><strong>Pain Points:</strong> ${painPoints || '—'}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        </div>`
      ).catch(() => {})
    }

    return Response.json({ success: true, firstName }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
