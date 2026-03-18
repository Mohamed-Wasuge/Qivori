/**
 * Qivori Self-Repair AI Agent
 * Runs every 30 minutes via Vercel cron (or manually).
 * 1. Reads unresolved error reports from Supabase
 * 2. Fetches the broken source file from GitHub
 * 3. Sends the error + source code to Claude for diagnosis & fix
 * 4. Creates a GitHub commit with the fix
 * 5. Vercel auto-deploys the fix
 * 6. Marks the error as fixed
 *
 * This is the self-healing loop — no human needed.
 */
import { sendAdminEmail, sendAdminSMS } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = () => process.env.SUPABASE_SERVICE_KEY
const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN
const GITHUB_REPO = 'Mohamed-Wasuge/Qivori'
const GITHUB_BRANCH = 'main'

// ── Supabase helpers ──
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

// ── Auth ──
function isAuthorized(req) {
  const authHeader = req.headers.get('authorization') || ''
  const serviceKey = req.headers.get('x-service-key') || ''
  const cronSecret = process.env.CRON_SECRET
  const svcKey = process.env.SUPABASE_SERVICE_KEY
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  if (svcKey && serviceKey === svcKey) return true
  return false
}

// ── GitHub helpers ──
async function githubGet(path) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/${path}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN()}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Qivori-Self-Repair',
    },
  })
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`)
  return res.json()
}

async function githubGetFileContent(filePath) {
  const data = await githubGet(`contents/${filePath}?ref=${GITHUB_BRANCH}`)
  const content = atob(data.content.replace(/\n/g, ''))
  return { content, sha: data.sha }
}

async function githubUpdateFile(filePath, content, sha, message) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN()}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Qivori-Self-Repair',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: btoa(content),
      sha,
      branch: GITHUB_BRANCH,
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    throw new Error(`GitHub PUT ${filePath} failed: ${res.status} — ${errText}`)
  }
  return res.json()
}

// ── Claude AI diagnosis ──
async function askClaudeToFix(errorMessage, errorStack, componentStack, sourceCode, filePath) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const systemPrompt = `You are Qivori's Self-Repair AI Agent. Your job is to diagnose and fix runtime JavaScript/React errors in a production web application.

You will receive:
1. An error message and stack trace from the browser
2. The component stack showing which React component crashed
3. The source code of the file that likely contains the bug

Your job:
- Diagnose the ROOT CAUSE of the error
- Generate the FIXED version of the entire source file
- Explain what you changed and why

RULES:
- ONLY fix the specific bug causing the error. Do NOT refactor or change unrelated code.
- If the error is about an undefined variable (like a missing import), add the import.
- If the error is about calling .map() on undefined, add null guards like (variable || []).map()
- If the error is about reading properties of null/undefined, add optional chaining or null checks.
- NEVER remove functionality. Only add safety guards or missing imports.
- If you cannot confidently fix the bug, return { "can_fix": false, "reason": "..." }

Return ONLY valid JSON (no markdown, no code fences):
{
  "can_fix": true,
  "diagnosis": "Brief explanation of what is wrong",
  "fix_description": "Brief explanation of what you changed",
  "fixed_code": "The entire fixed source file contents",
  "confidence": 0.0-1.0,
  "risk": "low" | "medium" | "high"
}`

  const userMessage = `ERROR: ${errorMessage}

STACK TRACE:
${errorStack || 'Not available'}

COMPONENT STACK:
${componentStack || 'Not available'}

FILE: ${filePath}

SOURCE CODE:
\`\`\`
${sourceCode}
\`\`\``

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    throw new Error(`Claude API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const cleaned = text.replace(/^\`\`\`json?\s*/m, '').replace(/\`\`\`\s*$/m, '').trim()
  return JSON.parse(cleaned)
}

// ── Guess the file path from error stack ──
function guessFilePath(errorStack, componentStack) {
  const patterns = [
    /\/src\/(pages\/\w+\.jsx)/,
    /\/src\/(components\/\w+\.jsx)/,
    /\/src\/(context\/\w+\.jsx)/,
    /\/src\/(pages\/carrier\/\w+\.jsx)/,
    /\/src\/(pages\/\w+\.js)/,
    /\/(api\/[\w-]+\.js)/,
  ]

  const fullStack = `${errorStack || ''}\n${componentStack || ''}`

  for (const pattern of patterns) {
    const match = fullStack.match(pattern)
    if (match) return `src/${match[1]}`
  }

  const componentMappings = {
    'MasterAgent': 'src/pages/AdminPages.jsx',
    'WaitlistManager': 'src/pages/AdminPages.jsx',
    'Analytics': 'src/pages/AdminPages.jsx',
    'RevenueDashboard': 'src/pages/AdminPages.jsx',
    'Dashboard': 'src/pages/Dashboard.jsx',
    'LoadBoard': 'src/pages/LoadBoard.jsx',
    'Carriers': 'src/pages/Carriers.jsx',
    'Settings': 'src/pages/ExtraPages.jsx',
    'DriverSettlement': 'src/pages/carrier/DriverScorecard.jsx',
    'DriverScorecard': 'src/pages/carrier/DriverScorecard.jsx',
    'SmartDispatch': 'src/pages/CarrierPages.jsx',
    'CarrierDashboard': 'src/pages/CarrierPages.jsx',
    'BrokerDashboard': 'src/pages/BrokerPages.jsx',
  }

  for (const [component, file] of Object.entries(componentMappings)) {
    if (fullStack.includes(component)) return file
  }

  return null
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

  if (!GITHUB_TOKEN()) {
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured — self-repair disabled' }), {
      status: 500, headers: corsHeaders,
    })
  }

  try {
    const errors = await supabaseGet(
      'error_reports?status=in.(new,diagnosing)&order=reported_at.desc&limit=5'
    )

    if (!errors.length) {
      return new Response(JSON.stringify({
        status: 'idle',
        message: 'No unresolved errors to fix',
      }), { status: 200, headers: corsHeaders })
    }

    const results = []

    for (const error of errors) {
      const result = { error_id: error.id, error_message: error.error_message, status: 'skipped' }

      try {
        await supabaseUpdate('error_reports', `id=eq.${error.id}`, { status: 'diagnosing' })

        const filePath = guessFilePath(error.error_stack, error.component_stack)
        if (!filePath) {
          result.status = 'skipped'
          result.reason = 'Could not determine source file from stack trace'
          await supabaseUpdate('error_reports', `id=eq.${error.id}`, {
            status: 'ignored',
            repair_notes: 'Self-repair could not determine which file to fix',
          })
          results.push(result)
          continue
        }

        let fileData
        try {
          fileData = await githubGetFileContent(filePath)
        } catch (e) {
          result.status = 'skipped'
          result.reason = `File not found on GitHub: ${filePath}`
          await supabaseUpdate('error_reports', `id=eq.${error.id}`, {
            status: 'ignored',
            repair_notes: `File ${filePath} not found in repo`,
          })
          results.push(result)
          continue
        }

        const fix = await askClaudeToFix(
          error.error_message,
          error.error_stack,
          error.component_stack,
          fileData.content,
          filePath
        )

        if (!fix.can_fix) {
          result.status = 'cannot_fix'
          result.reason = fix.reason || 'Claude determined fix is not possible'
          await supabaseUpdate('error_reports', `id=eq.${error.id}`, {
            status: 'ignored',
            repair_notes: `AI could not fix: ${fix.reason || 'unknown reason'}`,
          })
          await sendAdminSMS(`[Qivori Self-Repair] Cannot auto-fix: ${error.error_message?.slice(0, 80)}`).catch(() => {})
          results.push(result)
          continue
        }

        if (fix.risk === 'high' || fix.confidence < 0.7) {
          result.status = 'escalated'
          result.reason = `Fix is ${fix.risk} risk with ${fix.confidence} confidence — needs human review`
          await supabaseUpdate('error_reports', `id=eq.${error.id}`, {
            status: 'escalated',
            repair_notes: `AI diagnosis: ${fix.diagnosis}\nFix: ${fix.fix_description}\nRisk: ${fix.risk}, Confidence: ${fix.confidence}`,
          })
          await sendAdminSMS(`[Qivori Self-Repair] Needs review: ${error.error_message?.slice(0, 60)} — ${fix.diagnosis?.slice(0, 60)}`).catch(() => {})
          await sendAdminEmail(
            `Self-Repair: Manual Review Needed — ${error.error_message?.slice(0, 60)}`,
            `Error: ${error.error_message}\n\nDiagnosis: ${fix.diagnosis}\n\nProposed Fix: ${fix.fix_description}\n\nRisk: ${fix.risk}\nConfidence: ${fix.confidence}\n\nFile: ${filePath}\n\nPlease review and apply manually if appropriate.`
          ).catch(() => {})
          results.push(result)
          continue
        }

        const commitMessage = `fix(self-repair): ${fix.fix_description?.slice(0, 70) || 'Auto-fix runtime error'}\n\nError: ${error.error_message?.slice(0, 100)}\nDiagnosis: ${fix.diagnosis?.slice(0, 200)}\nConfidence: ${fix.confidence}\nAuto-applied by Qivori Self-Repair AI Agent`

        await githubUpdateFile(filePath, fix.fixed_code, fileData.sha, commitMessage)

        await supabaseUpdate('error_reports', `id=eq.${error.id}`, {
          status: 'fixed',
          fixed_at: new Date().toISOString(),
          repair_notes: `Auto-fixed by AI. Diagnosis: ${fix.diagnosis}. Fix: ${fix.fix_description}. Confidence: ${fix.confidence}`,
        })

        await supabaseInsert('self_repair_log', {
          error_id: error.id,
          file_path: filePath,
          diagnosis: fix.diagnosis,
          fix_description: fix.fix_description,
          confidence: fix.confidence,
          risk: fix.risk,
          status: 'deployed',
          committed_at: new Date().toISOString(),
        }).catch(() => {})

        await sendAdminSMS(`[Qivori Self-Repair] Auto-fixed: ${fix.fix_description?.slice(0, 80)}`).catch(() => {})
        await sendAdminEmail(
          `Self-Repair: Auto-Fixed — ${fix.fix_description?.slice(0, 60)}`,
          `The self-repair AI automatically fixed an error:\n\nError: ${error.error_message}\nFile: ${filePath}\nDiagnosis: ${fix.diagnosis}\nFix: ${fix.fix_description}\nConfidence: ${fix.confidence}\n\nThe fix has been committed and deployed. Vercel will auto-deploy the new version.`
        ).catch(() => {})

        result.status = 'fixed'
        result.file = filePath
        result.diagnosis = fix.diagnosis
        result.fix = fix.fix_description
        result.confidence = fix.confidence

      } catch (err) {
        result.status = 'error'
        result.reason = err.message
        await supabaseUpdate('error_reports', `id=eq.${error.id}`, {
          status: 'new',
          repair_notes: `Self-repair attempt failed: ${err.message}`,
        }).catch(() => {})
      }

      results.push(result)
    }

    return new Response(JSON.stringify({
      status: 'completed',
      processed: results.length,
      fixed: results.filter(r => r.status === 'fixed').length,
      escalated: results.filter(r => r.status === 'escalated').length,
      skipped: results.filter(r => r.status === 'skipped' || r.status === 'cannot_fix').length,
      results,
    }), { status: 200, headers: corsHeaders })

  } catch (err) {
    await sendAdminSMS(`[Qivori Self-Repair] Agent error: ${err.message?.slice(0, 80)}`).catch(() => {})
    return new Response(JSON.stringify({ status: 'error', error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
}
