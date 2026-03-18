/**
 * Qivori Churn Prediction Alert Agent
 * Runs daily via Vercel cron.
 * 1. Analyzes user activity patterns from Supabase
 * 2. Identifies users showing churn signals (inactivity, declining usage)
 * 3. Sends proactive retention emails using Claude AI
 * 4. Alerts admin of high-risk accounts
 *
 * Churn signals:
 * - No login in 7+ days
 * - Declining feature usage (fewer loads posted, fewer searches)
 * - Payment failures or downgrades
 * - Support tickets without resolution
 */
import { sendEmail, sendAdminEmail, sendAdminSMS, logEmail, wasEmailSent } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = () => process.env.SUPABASE_SERVICE_KEY

function supabaseHeaders(method = 'GET') {
  const key = supabaseKey()
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['Prefer'] = 'return=minimal'
  }
  return headers
}

async function supabaseGet(path) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, { headers: supabaseHeaders() })
  if (!res.ok) throw new Error(`Supabase GET ${path} failed: ${res.status}`)
  return res.json()
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders('POST'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed: ${res.status}`)
}

async function supabaseUpdate(table, filters, data) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${table}?${filters}`, {
    method: 'PATCH',
    headers: supabaseHeaders('PATCH'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase UPDATE ${table} failed: ${res.status}`)
}

function isAuthorized(req) {
  const authHeader = req.headers.get('authorization') || ''
  const serviceKey = req.headers.get('x-service-key') || ''
  const cronSecret = process.env.CRON_SECRET
  const svcKey = process.env.SUPABASE_SERVICE_KEY
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  if (svcKey && serviceKey === svcKey) return true
  return false
}

// ── Churn risk scoring ──
function calculateChurnRisk(user) {
  let score = 0
  const reasons = []
  const now = Date.now()

  // Days since last login
  if (user.last_sign_in_at) {
    const daysSinceLogin = (now - new Date(user.last_sign_in_at).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceLogin > 30) {
      score += 40
      reasons.push(`No login in ${Math.floor(daysSinceLogin)} days`)
    } else if (daysSinceLogin > 14) {
      score += 25
      reasons.push(`Last login ${Math.floor(daysSinceLogin)} days ago`)
    } else if (daysSinceLogin > 7) {
      score += 10
      reasons.push(`Last login ${Math.floor(daysSinceLogin)} days ago`)
    }
  } else {
    score += 30
    reasons.push('Never logged in after signup')
  }

  // Account age vs activity
  if (user.created_at) {
    const accountAgeDays = (now - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    if (accountAgeDays < 7 && !user.last_sign_in_at) {
      score += 20
      reasons.push('New account with no engagement')
    }
  }

  // Subscription status
  if (user.subscription_status === 'past_due') {
    score += 30
    reasons.push('Payment is past due')
  } else if (user.subscription_status === 'canceled') {
    score += 50
    reasons.push('Subscription canceled')
  }

  // Role-based signals
  if (user.role === 'carrier' && user.fleet_size && user.fleet_size > 5) {
    // High-value carrier accounts get extra weight
    score = Math.min(score * 1.2, 100)
    reasons.push(`High-value carrier (fleet: ${user.fleet_size})`)
  }

  return {
    score: Math.min(Math.round(score), 100),
    risk: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
    reasons,
  }
}

// ── Claude AI for retention email ──
async function generateRetentionEmail(user, churnData) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are a customer success specialist for Qivori, an AI-powered freight intelligence platform for trucking companies, brokers, and carriers. Write warm, helpful retention emails that provide genuine value — not salesy messages. Keep emails short (3-4 paragraphs max). Always sign as "The Qivori Team".`,
      messages: [{
        role: 'user',
        content: `Write a retention email for this user:
Name: ${user.full_name || user.company_name || 'Valued Customer'}
Company: ${user.company_name || 'N/A'}
Role: ${user.role || 'user'}
Churn Risk: ${churnData.risk} (${churnData.score}/100)
Reasons: ${churnData.reasons.join(', ')}
Plan: ${user.subscription_tier || 'free'}

Return ONLY valid JSON:
{
  "subject": "email subject line",
  "body": "plain text email body"
}`
      }],
    }),
  })

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const cleaned = text.replace(/^\`\`\`json?\s*/m, '').replace(/\`\`\`\s*$/m, '').trim()
  return JSON.parse(cleaned)
}

// ── Main handler ──
export default async function handler(req) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  try {
    // 1. Get all users with their activity data
    const users = await supabaseGet(
      'profiles?select=id,email,full_name,company_name,role,fleet_size,subscription_status,subscription_tier,last_sign_in_at,created_at&order=created_at.desc&limit=200'
    )

    if (!users.length) {
      return new Response(JSON.stringify({ status: 'idle', message: 'No users to analyze' }), {
        status: 200, headers: corsHeaders,
      })
    }

    const results = { analyzed: 0, high_risk: 0, medium_risk: 0, emails_sent: 0, errors: [] }
    const highRiskUsers = []

    for (const user of users) {
      results.analyzed++
      const churnData = calculateChurnRisk(user)

      if (churnData.risk === 'low') continue

      if (churnData.risk === 'high') {
        results.high_risk++
        highRiskUsers.push({ name: user.full_name || user.email, score: churnData.score, reasons: churnData.reasons })
      } else {
        results.medium_risk++
      }

      // Only send retention emails for medium+ risk users
      // Don't send if we already emailed them in the last 7 days
      if (!user.email) continue

      const alreadySent = await wasEmailSent(user.email, 'churn_retention', 7).catch(() => false)
      if (alreadySent) continue

      try {
        // Generate personalized retention email with Claude
        const email = await generateRetentionEmail(user, churnData)

        // Send the email
        await sendEmail(user.email, email.subject, email.body)
        await logEmail(user.email, email.subject, 'churn_retention')

        results.emails_sent++
      } catch (err) {
        results.errors.push(`Failed email for ${user.email}: ${err.message}`)
      }

      // Log churn prediction
      await supabaseInsert('churn_predictions', {
        user_id: user.id,
        risk_score: churnData.score,
        risk_level: churnData.risk,
        reasons: churnData.reasons,
        email_sent: results.emails_sent > 0,
        predicted_at: new Date().toISOString(),
      }).catch(() => {})
    }

    // 2. Alert admin about high-risk users
    if (highRiskUsers.length > 0) {
      const summary = highRiskUsers
        .slice(0, 10)
        .map(u => `  - ${u.name} (score: ${u.score}) — ${u.reasons.join(', ')}`)
        .join('\n')

      await sendAdminSMS(
        `[Qivori Churn Alert] ${highRiskUsers.length} high-risk users detected. Top: ${highRiskUsers[0]?.name} (score: ${highRiskUsers[0]?.score})`
      ).catch(() => {})

      await sendAdminEmail(
        `Churn Alert: ${highRiskUsers.length} High-Risk Users Detected`,
        `The churn prediction agent identified ${highRiskUsers.length} high-risk users:\n\n${summary}\n\nTotal analyzed: ${results.analyzed}\nMedium risk: ${results.medium_risk}\nRetention emails sent: ${results.emails_sent}\n\nReview these accounts and consider personal outreach.`
      ).catch(() => {})
    }

    return new Response(JSON.stringify({
      status: 'completed',
      ...results,
    }), { status: 200, headers: corsHeaders })

  } catch (err) {
    await sendAdminSMS(`[Qivori Churn] Agent error: ${err.message?.slice(0, 80)}`).catch(() => {})
    return new Response(JSON.stringify({ status: 'error', error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
}
