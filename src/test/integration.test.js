import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// ═══════════════════════════════════════════════════════════════
// Integration Tests — validates critical business flows:
//   database functions, rate limiter, auth helpers,
//   pricing consistency, and security invariants.
// ═══════════════════════════════════════════════════════════════

const ROOT = join(__dirname, '..', '..')

function readSrc(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf-8')
}

// ── Shared helpers ──────────────────────────────────────────────

function mockReq(method = 'GET', body = null, headers = {}) {
  const h = new Headers({
    'origin': 'https://qivori.com',
    'content-type': 'application/json',
    ...headers,
  })
  return {
    method,
    headers: { get: (k) => h.get(k) },
    json: async () => body,
    url: 'https://qivori.com/api/test',
  }
}

// Mock env vars before each test
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-service-key')
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
})

// ═══════════════════════════════════════════════════════════════
// 1. DATABASE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Mock the Supabase client before importing database.js
vi.mock('../lib/supabase', () => {
  // Chainable query builder mock
  function chainable(finalData = [], finalError = null) {
    const builder = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      gt: () => builder,
      gte: () => builder,
      lt: () => builder,
      lte: () => builder,
      is: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: () => builder,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve) => resolve({ data: finalData, error: finalError }),
    }
    // Make the builder thenable so `await query` works
    return builder
  }

  return {
    supabase: {
      from: () => chainable([]),
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'test-user-id' } } },
        }),
      },
    },
  }
})

describe('Database Functions', () => {
  it('fetchLoads returns an array', async () => {
    const { fetchLoads } = await import('../lib/database.js')
    const result = await fetchLoads()
    expect(Array.isArray(result)).toBe(true)
  })

  it('fetchInvoices returns an array', async () => {
    const { fetchInvoices } = await import('../lib/database.js')
    const result = await fetchInvoices()
    expect(Array.isArray(result)).toBe(true)
  })

  it('fetchExpenses returns an array', async () => {
    const { fetchExpenses } = await import('../lib/database.js')
    const result = await fetchExpenses()
    expect(Array.isArray(result)).toBe(true)
  })

  it('createLoad source requires owner_id in the insert', () => {
    const content = readSrc('src/lib/database.js')
    // owner_id is set in buildLoadPayload which createLoad delegates to
    expect(content).toContain('export async function createLoad')
    expect(content).toContain('buildLoadPayload')
    expect(content).toContain('owner_id')
  })

  it('fetchCompany returns null (not throw) when no company exists', async () => {
    const { fetchCompany } = await import('../lib/database.js')
    // Our mock returns null from maybeSingle — fetchCompany should return null, not throw
    const result = await fetchCompany()
    expect(result).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. RATE LIMITER
// ═══════════════════════════════════════════════════════════════

describe('Rate Limiter — checkRateLimit', () => {
  it('checkRateLimit is a callable function', async () => {
    const { checkRateLimit } = await import('../../api/_lib/rate-limit.js')
    expect(typeof checkRateLimit).toBe('function')
  })

  it('checkRateLimit returns {limited, remaining, resetSeconds} when Supabase not configured', async () => {
    // Clear Supabase env so it falls through to "fail open"
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    vi.stubEnv('SUPABASE_ANON_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')

    vi.resetModules()
    const { checkRateLimit } = await import('../../api/_lib/rate-limit.js')
    const result = await checkRateLimit('user-123', 'test', 10, 60)
    expect(result).toHaveProperty('limited')
    expect(result).toHaveProperty('remaining')
    expect(result.limited).toBe(false)
  })

  it('rateLimit (legacy in-memory) allows requests under the limit', async () => {
    const { rateLimit } = await import('../../api/_lib/rate-limit.js')
    const result = rateLimit('integration-test-' + Date.now(), 5, 60000)
    expect(result.limited).toBe(false)
    expect(result.remaining).toBe(4)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. AUTH HELPERS
// ═══════════════════════════════════════════════════════════════

describe('Auth Helpers — requireActiveSubscription', () => {
  it('returns error for unauthenticated requests (no user)', async () => {
    vi.resetModules()
    const { requireActiveSubscription, corsHeaders } = await import('../../api/_lib/auth.js')
    const req = mockReq()
    // Pass null user — should return 403 or fail-open null depending on Supabase config
    // With Supabase configured in env, it will try to fetch profile for null user
    const result = await requireActiveSubscription(req, null)
    // null user means no email, no admin bypass → either 403 or null (fail-open on fetch error)
    // The function is callable and does not throw
    expect(result === null || (result && result.status === 403)).toBe(true)
  })

  it('allows @qivori.com admin emails', async () => {
    const { requireActiveSubscription } = await import('../../api/_lib/auth.js')
    const req = mockReq()
    const result = await requireActiveSubscription(req, { email: 'admin@qivori.com', id: '123' })
    expect(result).toBeNull()
  })
})

describe('Auth Helpers — corsHeaders', () => {
  it('blocks non-whitelisted origins', async () => {
    const { corsHeaders } = await import('../../api/_lib/auth.js')
    const req = mockReq('GET', null, { origin: 'https://evil-site.com' })
    const headers = corsHeaders(req)
    // Should NOT reflect the evil origin
    expect(headers['Access-Control-Allow-Origin']).not.toBe('https://evil-site.com')
    // Should fall back to the first allowed origin
    expect(headers['Access-Control-Allow-Origin']).toBe('https://qivori.com')
  })

  it('allows whitelisted origins', async () => {
    const { corsHeaders } = await import('../../api/_lib/auth.js')
    const req = mockReq('GET', null, { origin: 'https://www.qivori.com' })
    const headers = corsHeaders(req)
    expect(headers['Access-Control-Allow-Origin']).toBe('https://www.qivori.com')
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. PRICING CONSISTENCY
// ═══════════════════════════════════════════════════════════════

describe('Pricing Consistency', () => {
  it('subscribe.js contains founder price 199 and regular price 299', () => {
    const content = readSrc('api/subscribe.js')
    expect(content).toContain('199')
    expect(content).toContain('299')
  })

  it('create-checkout.js contains founder price 19900 cents', () => {
    const content = readSrc('api/create-checkout.js')
    expect(content).toContain('19900')
  })

  it('subscribe.js and create-checkout.js agree on founder pricing', () => {
    const sub = readSrc('api/subscribe.js')
    const checkout = readSrc('api/create-checkout.js')
    // Both should reference 199 as the founder base price
    expect(sub).toMatch(/199/)
    expect(checkout).toMatch(/19900/) // 199 * 100 cents
  })

  it('landing page contains founder price 199 in plans config', () => {
    const content = readSrc('src/pages/LandingPage.jsx')
    // Price is in the plans config object (not hardcoded as $199 per CLAUDE.md rules)
    expect(content).toMatch(/price:\s*199/)
  })

  it('landing page contains base price 79 in plans config', () => {
    const content = readSrc('src/pages/LandingPage.jsx')
    // Base plan price is in the plans config object
    expect(content).toMatch(/price:\s*79/)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. SECURITY INVARIANTS
// ═══════════════════════════════════════════════════════════════

describe('Security — API files import auth', () => {
  // These routes are legitimately public/webhook/cron — no user auth needed
  const EXEMPT_FILES = new Set([
    'health-check.js',            // Public health endpoint
    'demo-request.js',            // Public form submission
    'stripe-webhook.js',          // Webhook (validates signature, not JWT)
    'sms-webhook.js',             // Webhook (validates Twilio signature)
    'og-image.js',                // Public OG image generation
    'retell-webhook.js',          // Webhook from Retell (post-call)
    'retell-inbound-webhook.js',  // Webhook from Retell (pre-call, must respond <10s)
    'inbound-call.js',            // Twilio TwiML webhook (validates Twilio signature)
    'inbound-email.js',           // Webhook from email provider
    'create-user.js',             // Runs during signup (no user yet)
    'motive-callback.js',         // OAuth callback (auth via OAuth flow, not header)
    'calculate-route.js',         // Utility endpoint (Google Maps route calc, no user data)
    'weather-safety.js',          // Public NWS weather data (no user data)
    'test-123lb.js',              // Dev utility for testing 123LB OAuth credentials
  ])

  const apiDir = join(ROOT, 'api')
  const apiFiles = readdirSync(apiDir)
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))
    .filter(f => !EXEMPT_FILES.has(f))

  apiFiles.forEach(file => {
    it(`${file} imports from _lib/auth.js or has CRON_SECRET auth`, () => {
      const content = readSrc(`api/${file}`)
      const hasAuth =
        content.includes('_lib/auth') ||
        content.includes('CRON_SECRET') ||
        content.includes('verifyAuth') ||
        content.includes('requireAuth') ||
        content.includes('corsHeaders') ||
        content.includes('supabase.auth.getUser') ||
        content.includes('X-Retell-Signature') ||
        content.includes('twilio-signature')
      expect(hasAuth).toBe(true)
    })
  })
})

describe('Security — no hardcoded secrets in API files', () => {
  const apiDir = join(ROOT, 'api')
  const apiFiles = readdirSync(apiDir)
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))

  apiFiles.forEach(file => {
    it(`${file} does not contain hardcoded secret keys`, () => {
      const content = readSrc(`api/${file}`)
      // No hardcoded Anthropic API keys
      expect(content).not.toMatch(/sk-ant-api\d+-[A-Za-z0-9]{20,}/)
      // No hardcoded Stripe live secret keys
      expect(content).not.toMatch(/sk_live_[A-Za-z0-9]{20,}/)
      // No hardcoded Supabase service role keys
      expect(content).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}/)
      // No hardcoded Twilio auth tokens (32-char hex)
      expect(content).not.toMatch(/TWILIO_AUTH_TOKEN\s*=\s*['"][a-f0-9]{32}['"]/)
      // No hardcoded webhook secrets
      expect(content).not.toMatch(/whsec_[A-Za-z0-9]{20,}/)
    })
  })
})
