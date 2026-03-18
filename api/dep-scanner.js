/**
 * Qivori Dependency Vulnerability Scanner
 * Runs weekly via Vercel cron.
 * 1. Reads package.json from GitHub repo
 * 2. Checks each dependency against the OSV (Open Source Vulnerabilities) API
 * 3. Reports found vulnerabilities with severity levels
 * 4. Alerts admin via SMS/email if critical or high vulnerabilities found
 * 5. Logs scan results to Supabase
 */
import { sendAdminEmail, sendAdminSMS } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = () => process.env.SUPABASE_SERVICE_KEY
const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN
const GITHUB_REPO = 'Mohamed-Wasuge/Qivori'
const GITHUB_BRANCH = 'main'

function supabaseHeaders(method = 'GET') {
  const key = supabaseKey()
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['Prefer'] = 'return=minimal'
  }
  return headers
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders('POST'),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed: ${res.status}`)
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

// ── Fetch package.json from GitHub ──
async function getPackageJson() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/package.json?ref=${GITHUB_BRANCH}`,
    {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN()}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Qivori-Dep-Scanner',
      },
    }
  )
  if (!res.ok) throw new Error(`Failed to fetch package.json: ${res.status}`)
  const data = await res.json()
  const content = atob(data.content.replace(/\n/g, ''))
  return JSON.parse(content)
}

// ── Check a package for vulnerabilities using OSV API ──
async function checkVulnerabilities(packageName, version) {
  try {
    // Clean version string — remove ^ ~ >= etc
    const cleanVersion = version.replace(/^[\^~>=<]+/, '')

    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem: 'npm' },
        version: cleanVersion,
      }),
    })

    if (!res.ok) return []
    const data = await res.json()
    return (data.vulns || []).map(v => ({
      id: v.id,
      summary: v.summary || v.details?.slice(0, 200) || 'No description',
      severity: extractSeverity(v),
      aliases: v.aliases || [],
      published: v.published,
      link: `https://osv.dev/vulnerability/${v.id}`,
    }))
  } catch {
    return []
  }
}

function extractSeverity(vuln) {
  // Try to get CVSS severity
  if (vuln.severity) {
    for (const s of vuln.severity) {
      if (s.type === 'CVSS_V3') {
        const score = parseFloat(s.score?.match(/[\d.]+/)?.[0] || '0')
        if (score >= 9.0) return 'CRITICAL'
        if (score >= 7.0) return 'HIGH'
        if (score >= 4.0) return 'MEDIUM'
        return 'LOW'
      }
    }
  }
  // Check database_specific severity
  if (vuln.database_specific?.severity) {
    return vuln.database_specific.severity.toUpperCase()
  }
  return 'UNKNOWN'
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
    return new Response(JSON.stringify({ error: 'GITHUB_TOKEN not configured' }), {
      status: 500, headers: corsHeaders,
    })
  }

  try {
    // 1. Fetch package.json
    const pkg = await getPackageJson()
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }

    const depNames = Object.keys(allDeps)
    const results = {
      scanned: depNames.length,
      vulnerable: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      vulnerabilities: [],
    }

    // 2. Check each dependency (batch in groups of 10 for performance)
    const batchSize = 10
    for (let i = 0; i < depNames.length; i += batchSize) {
      const batch = depNames.slice(i, i + batchSize)
      const checks = batch.map(async (name) => {
        const version = allDeps[name]
        const vulns = await checkVulnerabilities(name, version)
        return { name, version, vulns }
      })

      const batchResults = await Promise.all(checks)

      for (const { name, version, vulns } of batchResults) {
        if (vulns.length > 0) {
          results.vulnerable++
          for (const v of vulns) {
            if (v.severity === 'CRITICAL') results.critical++
            else if (v.severity === 'HIGH') results.high++
            else if (v.severity === 'MEDIUM') results.medium++
            else results.low++

            results.vulnerabilities.push({
              package: name,
              version,
              ...v,
            })
          }
        }
      }
    }

    // 3. Log scan results to Supabase
    await supabaseInsert('dep_scan_log', {
      scanned_count: results.scanned,
      vulnerable_count: results.vulnerable,
      critical_count: results.critical,
      high_count: results.high,
      medium_count: results.medium,
      low_count: results.low,
      details: results.vulnerabilities.slice(0, 50), // limit stored details
      scanned_at: new Date().toISOString(),
    }).catch(() => {})

    // 4. Alert admin if critical or high vulnerabilities found
    if (results.critical > 0 || results.high > 0) {
      const topVulns = results.vulnerabilities
        .filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH')
        .slice(0, 10)
        .map(v => `  - [${v.severity}] ${v.package}@${v.version}: ${v.summary?.slice(0, 80)}`)
        .join('\n')

      await sendAdminSMS(
        `[Qivori Security] ${results.critical} critical, ${results.high} high vulnerabilities found in ${results.scanned} dependencies!`
      ).catch(() => {})

      await sendAdminEmail(
        `Security Alert: ${results.critical + results.high} Critical/High Vulnerabilities Found`,
        `The dependency vulnerability scanner found issues:\n\nScanned: ${results.scanned} packages\nCritical: ${results.critical}\nHigh: ${results.high}\nMedium: ${results.medium}\nLow: ${results.low}\n\nTop vulnerabilities:\n${topVulns}\n\nAction required: Update affected packages or review for mitigations.\n\nFull details are logged in the dep_scan_log table.`
      ).catch(() => {})
    }

    return new Response(JSON.stringify({
      status: 'completed',
      ...results,
      vulnerabilities: results.vulnerabilities.slice(0, 20), // limit response size
    }), { status: 200, headers: corsHeaders })

  } catch (err) {
    await sendAdminSMS(`[Qivori DepScan] Error: ${err.message?.slice(0, 80)}`).catch(() => {})
    return new Response(JSON.stringify({ status: 'error', error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
}
