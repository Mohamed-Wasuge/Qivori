/**
 * Qivori Demo Request Auto-Follow-Up Agent
 * Runs daily. Checks for unanswered demo requests older than 24h.
 * Generates a personalized follow-up email using Claude AI and sends it.
 * Never sends more than one follow-up per demo request.
 */
import { sendEmail, sendAdminEmail, logEmail, wasEmailSent } from './_lib/emails.js'

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
  if (!res.ok) return []
  return res.json()
}

async function supabaseUpdate(table, filters, data) {
  await fetch(`${supabaseUrl()}/rest/v1/${table}?${filters}`, {
    method: 'PATCH',
    headers: supabaseHeaders('PATCH'),
    body: JSON.stringify(data),
  })
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

async function generateFollowUpEmail(name, company, message) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are writing a follow-up email for Qivori, an AI-powered freight intelligence platform. Be warm, professional, and brief. The email should:
1. Thank them for their interest
2. Reference their specific needs if mentioned
3. Offer to schedule a personalized demo call
4. Keep it under 150 words
5. Sign off as "Mohamed Wasuge, Founder — Qivori"
Return ONLY the email body text, no subject line.`,
      messages: [{ role: 'user', content: `Write a follow-up email to:
Name: ${name}
Company: ${company || 'Not provided'}
Their message: ${message || 'Requested a demo'}

They submitted a demo request 24+ hours ago and haven't heard back.` }],
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.content?.[0]?.text || null
}

export default async function handler(req) {
  const corsHeaders = { 'Content-Type': 'application/json' }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  try {
    // Get demo requests older than 24h that haven't been followed up
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const demoRequests = await supabaseGet(
      `demo_requests?created_at=lt.${cutoff}&followed_up=is.null&select=*&order=created_at.desc&limit=10`
    )

    // Fallback: try without followed_up filter if column doesn't exist
    let requests = demoRequests
    if (!Array.isArray(requests) || requests.length === 0) {
      requests = await supabaseGet(
        `demo_requests?created_at=lt.${cutoff}&status=eq.pending&select=*&order=created_at.desc&limit=10`
      )
    }

    if (!requests || requests.length === 0) {
      return new Response(JSON.stringify({
        status: 'idle',
        message: 'No pending demo requests need follow-up',
      }), { status: 200, headers: corsHeaders })
    }

    const results = []

    for (const demo of requests) {
      const email = demo.email
      if (!email) continue

      // Check if we already sent a follow-up
      const alreadySent = await wasEmailSent?.(`demo-followup-${demo.id}`).catch(() => false)
      if (alreadySent) {
        results.push({ id: demo.id, status: 'already_sent' })
        continue
      }

      // Generate personalized email with AI
      const emailBody = await generateFollowUpEmail(
        demo.name || demo.full_name || 'there',
        demo.company || demo.company_name || '',
        demo.message || demo.notes || ''
      )

      if (!emailBody) {
        results.push({ id: demo.id, status: 'ai_failed' })
        continue
      }

      // Send the follow-up
      try {
        await sendEmail({
          to: email,
          subject: `Following up on your Qivori demo request`,
          text: emailBody,
          replyTo: 'mohamed@qivori.com',
        })

        // Log it
        await logEmail?.(`demo-followup-${demo.id}`, email, 'demo-followup').catch(() => {})

        // Mark as followed up
        await supabaseUpdate('demo_requests', `id=eq.${demo.id}`, {
          status: 'followed_up',
          followed_up_at: new Date().toISOString(),
        }).catch(() => {})

        results.push({ id: demo.id, email, status: 'sent' })
      } catch (err) {
        results.push({ id: demo.id, status: 'send_failed', error: err.message })
      }
    }

    const sent = results.filter(r => r.status === 'sent').length

    if (sent > 0) {
      await sendAdminEmail(
        `Demo Follow-Up: ${sent} email(s) sent automatically`,
        `The demo follow-up agent sent ${sent} personalized follow-up emails:\n\n${results.filter(r => r.status === 'sent').map(r => `  - ${r.email}`).join('\n')}\n\nTotal processed: ${results.length}`
      ).catch(() => {})
    }

    return new Response(JSON.stringify({
      status: 'completed',
      processed: results.length,
      sent,
      results,
    }), { status: 200, headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({ status: 'error', error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
}
