import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ═══════════════════════════════════════════════════════════════
// Security Tests — validates data isolation, auth enforcement,
// RLS policies, and no secret leakage.
// ═══════════════════════════════════════════════════════════════

const ROOT = join(__dirname, '..', '..')

// ── Helpers ────────────────────────────────────────────────────

function readSrc(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf-8')
}

// ═══════════════════════════════════════════════════════════════
// 1. NO SECRETS IN FRONTEND CODE
// ═══════════════════════════════════════════════════════════════

describe('No Secrets in Frontend', () => {
  const frontendFiles = [
    'src/lib/supabase.js',
    'src/lib/api.js',
    'src/lib/database.js',
    'src/context/AppContext.jsx',
    'src/context/CarrierContext.jsx',
    'src/App.jsx',
  ]

  frontendFiles.forEach(file => {
    it(`${file} does not contain service key`, () => {
      const content = readSrc(file)
      expect(content).not.toMatch(/SUPABASE_SERVICE_KEY/)
      expect(content).not.toMatch(/sb_secret_/)
      expect(content).not.toMatch(/service_role/)
    })

    it(`${file} does not contain API secret keys`, () => {
      const content = readSrc(file)
      expect(content).not.toMatch(/sk-ant-/)  // Anthropic
      expect(content).not.toMatch(/sk_live_/) // Stripe live
      expect(content).not.toMatch(/whsec_/)   // Stripe webhook secret
      expect(content).not.toMatch(/TWILIO_AUTH_TOKEN/)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. NO SECRETS IN COMPILED OUTPUT
// ═══════════════════════════════════════════════════════════════

describe('No Secrets in index.html', () => {
  it('does not contain service keys', () => {
    const html = readSrc('index.html')
    expect(html).not.toMatch(/sb_secret_/)
    expect(html).not.toMatch(/sk-ant-/)
    expect(html).not.toMatch(/sk_live_/)
    expect(html).not.toMatch(/whsec_/)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. RLS POLICIES — SQL AUDIT
// ═══════════════════════════════════════════════════════════════

describe('RLS Policies in SQL', () => {
  it('security-fixes.sql enforces broker_id ownership on load_stops', () => {
    const sql = readSrc('supabase-security-fixes.sql')
    expect(sql).toContain('loads.broker_id = auth.uid()')
    expect(sql).toContain('load_stops')
  })

  it('security-fixes.sql restricts storage to authenticated owners', () => {
    const sql = readSrc('supabase-security-fixes.sql')
    expect(sql).toContain("public = false")
    expect(sql).toContain('storage.foldername(name)')
  })

  it('security-fixes.sql locks waitlist SELECT to service_role', () => {
    const sql = readSrc('supabase-security-fixes.sql')
    expect(sql).toMatch(/waitlist.*FOR SELECT.*service_role/s)
  })

  it('security-fixes.sql restricts analytics_events to service_role', () => {
    const sql = readSrc('supabase-security-fixes.sql')
    expect(sql).toMatch(/analytics_events.*service_role/s)
  })

  it('security-fixes.sql requires auth for weigh station reports', () => {
    const sql = readSrc('supabase-security-fixes.sql')
    expect(sql).toMatch(/weigh_station_reports.*authenticated/s)
  })

  it('all tables have RLS enabled in setup SQL', () => {
    const sql = readSrc('supabase-missing-tables.sql')
    const tables = ['companies', 'vehicles', 'drivers', 'load_stops', 'check_calls',
      'invoices', 'expenses', 'documents', 'platform_settings', 'weigh_station_reports',
      'waitlist', 'analytics_events']
    tables.forEach(table => {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. API ROUTES ENFORCE AUTH
// ═══════════════════════════════════════════════════════════════

describe('API Routes Require Auth', () => {
  const protectedRoutes = [
    'api/track-event.js',
    'api/send-sms.js',
    'api/send-push.js',
    'api/load-board-credentials.js',
    'api/auto-invoice.js',
  ]

  protectedRoutes.forEach(route => {
    it(`${route} imports verifyAuth or requireAuth`, () => {
      const content = readSrc(route)
      const hasAuth = content.includes('verifyAuth') || content.includes('requireAuth') ||
        content.includes('CRON_SECRET') || content.includes('authorization')
      expect(hasAuth).toBe(true)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. WEBHOOK SIGNATURE VALIDATION
// ═══════════════════════════════════════════════════════════════

describe('Webhook Signature Validation', () => {
  it('stripe-webhook.js validates signatures', () => {
    const content = readSrc('api/stripe-webhook.js')
    expect(content).toContain('STRIPE_WEBHOOK_SECRET')
    expect(content).toMatch(/hmac|crypto|createHmac|subtle/i)
  })

  it('sms-webhook.js validates Twilio signature', () => {
    const content = readSrc('api/sms-webhook.js')
    expect(content).toMatch(/twilio.signature/i)
    expect(content).toMatch(/hmac|crypto|validateTwilio/i)
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. CREDENTIAL ENCRYPTION
// ═══════════════════════════════════════════════════════════════

describe('Credential Encryption', () => {
  it('load-board-credentials.js requires encryption key', () => {
    const content = readSrc('api/load-board-credentials.js')
    // Should throw/error if CREDENTIALS_ENCRYPTION_KEY is missing
    expect(content).toContain('CREDENTIALS_ENCRYPTION_KEY')
    // Should NOT have plaintext fallback
    expect(content).not.toMatch(/encrypted:\s*plaintext/)
    expect(content).not.toMatch(/iv:\s*['"]'?['"]/)
  })

  it('uses AES-GCM encryption', () => {
    const content = readSrc('api/load-board-credentials.js')
    expect(content).toMatch(/AES-GCM|aes-256-gcm/i)
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. CORS CONFIGURATION
// ═══════════════════════════════════════════════════════════════

describe('CORS Configuration', () => {
  it('auth.js restricts origins to qivori.com', () => {
    const content = readSrc('api/_lib/auth.js')
    expect(content).toContain('qivori.com')
    expect(content).not.toMatch(/['"]?\*['"]?\s*$/) // no wildcard
  })

  it('demo-request.js uses shared corsHeaders', () => {
    const content = readSrc('api/demo-request.js')
    expect(content).toContain("from './_lib/auth.js'")
    expect(content).toContain('corsHeaders')
  })
})

// ═══════════════════════════════════════════════════════════════
// 8. ANTI-SPAM PROTECTION
// ═══════════════════════════════════════════════════════════════

describe('Demo Request Anti-Spam', () => {
  it('has disposable email domain blacklist', () => {
    const content = readSrc('api/demo-request.js')
    expect(content).toContain('mailinator.com')
    expect(content).toContain('tempmail.com')
    expect(content).toContain('guerrillamail.com')
  })

  it('has honeypot field check', () => {
    const content = readSrc('api/demo-request.js')
    expect(content).toContain('_hp')
  })

  it('has rate limiting', () => {
    const content = readSrc('api/demo-request.js')
    expect(content).toContain('rateLimit')
  })

  it('has reCAPTCHA verification', () => {
    const content = readSrc('api/demo-request.js')
    expect(content).toContain('recaptcha')
  })

  it('has MX record check', () => {
    const content = readSrc('api/demo-request.js')
    expect(content).toContain('hasMxRecords')
  })
})

// ═══════════════════════════════════════════════════════════════
// 9. PRICING CONSISTENCY
// ═══════════════════════════════════════════════════════════════

describe('Pricing Consistency', () => {
  it('landing page shows $199 pricing', () => {
    const content = readSrc('src/pages/LandingPage.jsx')
    // Should contain correct price
    expect(content).toContain('199')
  })
})

// ═══════════════════════════════════════════════════════════════
// 10. SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════

describe('Security Headers in vercel.json', () => {
  it('has all required security headers', () => {
    const content = readSrc('vercel.json')
    expect(content).toContain('X-Frame-Options')
    expect(content).toContain('X-Content-Type-Options')
    expect(content).toContain('Strict-Transport-Security')
    expect(content).toContain('Referrer-Policy')
  })
})

// ═══════════════════════════════════════════════════════════════
// 11. GITIGNORE — SECRETS PROTECTED
// ═══════════════════════════════════════════════════════════════

describe('Secrets in .gitignore', () => {
  it('.env files are gitignored', () => {
    const content = readSrc('.gitignore')
    expect(content).toContain('.env')
  })

  it('.vercel directory is gitignored', () => {
    const content = readSrc('.gitignore')
    expect(content).toContain('.vercel')
  })
})

// ═══════════════════════════════════════════════════════════════
// 12. NO XSS VULNERABILITIES
// ═══════════════════════════════════════════════════════════════

describe('No XSS Vulnerabilities', () => {
  const pages = [
    'src/pages/LandingPage.jsx',
    'src/pages/LoginPage.jsx',
    'src/pages/CarrierPages.jsx',
    'src/components/CarrierLayout.jsx',
  ]

  pages.forEach(file => {
    it(`${file} does not use dangerouslySetInnerHTML`, () => {
      const content = readSrc(file)
      expect(content).not.toContain('dangerouslySetInnerHTML')
    })
  })
})
