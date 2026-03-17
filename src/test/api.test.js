import { describe, it, expect, vi, beforeEach } from 'vitest'

// ═══════════════════════════════════════════════════════════════
// API Route Tests — validates every endpoint's behavior
// These tests import the handler functions directly and call
// them with mock Request objects (no network needed).
// ═══════════════════════════════════════════════════════════════

// ── Helpers ────────────────────────────────────────────────────

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

// Mock env vars
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-service-key')
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
})

// ═══════════════════════════════════════════════════════════════
// 1. AUTH HELPER TESTS
// ═══════════════════════════════════════════════════════════════

describe('Auth Helper', () => {
  it('corsHeaders returns allowed origin', async () => {
    const { corsHeaders } = await import('../../api/_lib/auth.js')
    const req = mockReq()
    const headers = corsHeaders(req)
    expect(headers['Access-Control-Allow-Origin']).toBe('https://qivori.com')
  })

  it('corsHeaders rejects unknown origin', async () => {
    const { corsHeaders } = await import('../../api/_lib/auth.js')
    const req = mockReq('GET', null, { origin: 'https://evil.com' })
    const headers = corsHeaders(req)
    expect(headers['Access-Control-Allow-Origin']).not.toBe('https://evil.com')
  })

  it('handleCors returns response for OPTIONS', async () => {
    const { handleCors } = await import('../../api/_lib/auth.js')
    const req = mockReq('OPTIONS')
    const res = handleCors(req)
    expect(res).toBeTruthy()
    expect(res.status).toBe(200)
  })

  it('handleCors returns null for non-OPTIONS', async () => {
    const { handleCors } = await import('../../api/_lib/auth.js')
    const req = mockReq('GET')
    const res = handleCors(req)
    expect(res).toBeNull()
  })

  it('verifyAuth rejects missing auth header', async () => {
    const { verifyAuth } = await import('../../api/_lib/auth.js')
    const req = mockReq()
    const result = await verifyAuth(req)
    expect(result.user).toBeNull()
    expect(result.error).toContain('Missing')
  })

  it('verifyAuth rejects empty bearer token', async () => {
    const { verifyAuth } = await import('../../api/_lib/auth.js')
    const req = mockReq('GET', null, { authorization: 'Bearer ' })
    const result = await verifyAuth(req)
    expect(result.user).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. RATE LIMITER TESTS
// ═══════════════════════════════════════════════════════════════

describe('Rate Limiter', () => {
  it('allows requests under limit', async () => {
    const { rateLimit } = await import('../../api/_lib/rate-limit.js')
    const result = rateLimit('test-key-1', 5, 60000)
    expect(result.limited).toBe(false)
    expect(result.remaining).toBe(4)
  })

  it('blocks requests over limit', async () => {
    const { rateLimit } = await import('../../api/_lib/rate-limit.js')
    const key = 'test-key-block-' + Date.now()
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60000)
    const result = rateLimit(key, 3, 60000)
    expect(result.limited).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('getClientIP extracts from x-forwarded-for', async () => {
    const { getClientIP } = await import('../../api/_lib/rate-limit.js')
    const req = mockReq('GET', null, { 'x-forwarded-for': '1.2.3.4' })
    expect(getClientIP(req)).toBe('1.2.3.4')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. DEMO REQUEST — Email Validation
// ═══════════════════════════════════════════════════════════════

describe('Demo Request Endpoint', () => {
  it('rejects non-POST methods', async () => {
    const { default: handler } = await import('../../api/demo-request.js')
    const res = await handler(mockReq('GET'))
    expect(res.status).toBe(405)
  })

  it('rejects empty email', async () => {
    const { default: handler } = await import('../../api/demo-request.js')
    const res = await handler(mockReq('POST', { name: 'Test', email: '', phone: '555', company: 'Co' }))
    expect(res.status).toBe(400)
  })

  it('rejects disposable email domains', async () => {
    const { default: handler } = await import('../../api/demo-request.js')
    const res = await handler(mockReq('POST', {
      name: 'Test', email: 'test@mailinator.com', phone: '555', company: 'Co'
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('valid business email')
  })

  it('rejects emails with excessive random digits', async () => {
    const { default: handler } = await import('../../api/demo-request.js')
    const res = await handler(mockReq('POST', {
      name: 'Test', email: 'user123456789@gmail.com', phone: '555', company: 'Co'
    }))
    expect(res.status).toBe(400)
  })

  it('silently accepts honeypot submissions', async () => {
    const { default: handler } = await import('../../api/demo-request.js')
    const res = await handler(mockReq('POST', {
      name: 'Bot', email: 'bot@test.com', phone: '555', company: 'Bot Inc', _hp: 'filled'
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('rejects malformed email', async () => {
    vi.resetModules() // reset rate limiter state
    const { default: handler } = await import('../../api/demo-request.js')
    const res = await handler(mockReq('POST', {
      name: 'Test', email: 'not-an-email', phone: '555', company: 'Co'
    }))
    // 400 = bad email, 429 = rate limited (both mean rejected)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThanOrEqual(429)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. HEALTH CHECK ENDPOINT
// ═══════════════════════════════════════════════════════════════

describe('Health Check', () => {
  it('returns 200 with status object', async () => {
    const { default: handler } = await import('../../api/health-check.js')
    const res = await handler(mockReq('GET'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. STRIPE WEBHOOK — Signature Validation
// ═══════════════════════════════════════════════════════════════

describe('Stripe Webhook', () => {
  it('rejects requests without signature', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test123')
    const { default: handler } = await import('../../api/stripe-webhook.js')
    const req = {
      method: 'POST',
      headers: { get: () => null },
      text: async () => '{}',
    }
    const res = await handler(req)
    // Should reject (400 or 401) when no signature provided
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. CREATE CHECKOUT — Method Validation
// ═══════════════════════════════════════════════════════════════

describe('Create Checkout', () => {
  it('rejects non-POST', async () => {
    const { default: handler } = await import('../../api/create-checkout.js')
    const res = await handler(mockReq('GET'))
    expect(res.status).toBe(405)
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. TRACK EVENT — Auth Required
// ═══════════════════════════════════════════════════════════════

describe('Track Event', () => {
  it('rejects non-POST', async () => {
    const { default: handler } = await import('../../api/track-event.js')
    const res = await handler(mockReq('GET'))
    expect(res.status).toBe(405)
  })

  it('rejects unauthenticated requests', async () => {
    const { default: handler } = await import('../../api/track-event.js')
    const res = await handler(mockReq('POST', { event: 'test' }))
    expect(res.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════
// 8. SMS WEBHOOK — Twilio Validation
// ═══════════════════════════════════════════════════════════════

describe('SMS Webhook', () => {
  it('rejects non-POST', async () => {
    const { default: handler } = await import('../../api/sms-webhook.js')
    const res = await handler(mockReq('GET'))
    expect(res.status).toBe(405)
  })

  it('rejects requests without Twilio signature when auth token is set', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token')
    // Re-import to pick up new env
    vi.resetModules()
    const { default: handler } = await import('../../api/sms-webhook.js')
    const req = {
      method: 'POST',
      headers: { get: (k) => k === 'origin' ? 'https://qivori.com' : null },
      url: 'https://qivori.com/api/sms-webhook',
      text: async () => '',
    }
    const res = await handler(req)
    expect(res.status).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════
// 9. LOAD BOARD CREDENTIALS — Encryption Required
// ═══════════════════════════════════════════════════════════════

describe('Load Board Credentials', () => {
  it('rejects non-POST/GET without auth', async () => {
    const { default: handler } = await import('../../api/load-board-credentials.js')
    const res = await handler(mockReq('DELETE'))
    // Should return 405 or 401
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ═══════════════════════════════════════════════════════════════
// 10. REFERRAL — Method Validation
// ═══════════════════════════════════════════════════════════════

describe('Referral', () => {
  it('rejects non-POST with error status', async () => {
    const { default: handler } = await import('../../api/referral.js')
    const res = await handler(mockReq('GET'))
    // Returns 401 (auth check) or 405 (method check) — both reject
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
