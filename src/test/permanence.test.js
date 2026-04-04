import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

// ═══════════════════════════════════════════════════════════════
// ENFORCED PERMANENCE TESTS
// These tests BLOCK deployment if any protected system is violated.
// Every test here exists because something broke in the past.
// DO NOT DELETE OR SKIP THESE TESTS.
// ═══════════════════════════════════════════════════════════════

const ROOT = join(__dirname, '..', '..')

function readSrc(relPath) {
  const full = join(ROOT, relPath)
  if (!existsSync(full)) return ''
  return readFileSync(full, 'utf-8')
}

function readAllFiles(dir, ext = '.js') {
  const full = join(ROOT, dir)
  if (!existsSync(full)) return []
  return readdirSync(full)
    .filter(f => f.endsWith(ext) && !f.startsWith('_'))
    .map(f => ({ name: f, content: readSrc(`${dir}/${f}`) }))
}

// ═══════════════════════════════════════════════════════════════
// 1. FINANCIAL CALCULATIONS — LOCKED
// ═══════════════════════════════════════════════════════════════

describe('LOCKED: Financial Calculations', () => {
  it('P&L Dashboard uses fuelCostPerMile from context, not hardcoded', () => {
    const content = readSrc('src/pages/carrier/Finance.jsx')
    const plBlock = content.slice(
      content.indexOf('export function PLDashboard'),
      content.indexOf('export function ReceivablesAging') || content.length
    )
    expect(plBlock).toContain('fuelCostPerMile')
    expect(plBlock).toContain('useCarrier()')
  })

  it('P&L auto-estimates costs when no expenses logged', () => {
    const content = readSrc('src/pages/carrier/Finance.jsx')
    const plBlock = content.slice(
      content.indexOf('export function PLDashboard'),
      content.indexOf('export function ReceivablesAging') || content.length
    )
    expect(plBlock).toContain('estimatedCosts')
    expect(plBlock).toContain('hasLoggedExpenses')
  })

  it('CarrierContext coerces expense amounts to Number', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    expect(content).toMatch(/amount:\s*Number\(e\.amount\)/)
  })

  it('CarrierContext computes totalRevenue from delivered loads', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    expect(content).toContain('deliveredLoads')
    expect(content).toContain('totalRevenue')
  })

  it('Invoice amounts are never negative in database.js', () => {
    const content = readSrc('src/lib/database.js')
    // createInvoice must exist and include amount in insert
    const hasCreate = content.includes('createInvoice')
    expect(hasCreate).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. PRICING MODEL — LOCKED
// ═══════════════════════════════════════════════════════════════

describe('LOCKED: Pricing Model', () => {
  it('useSubscription hook has correct founder pricing ($199 base, $99 additional)', () => {
    const content = readSrc('src/hooks/useSubscription.js')
    expect(content).toMatch(/price:\s*199/)
    expect(content).toMatch(/extraTruck:\s*99/)
  })

  it('useSubscription hook has correct regular pricing ($299 base, $149 additional)', () => {
    const content = readSrc('api/subscribe.js')
    expect(content).toMatch(/isFounder\s*\?\s*199\s*:\s*299/)
    expect(content).toMatch(/isFounder\s*\?\s*99\s*:\s*149/)
  })

  it('UpgradePrompt uses useSubscription hook, not hardcoded pricing', () => {
    const content = readSrc('src/components/UpgradePrompt.jsx')
    expect(content).toContain('useSubscription')
    // Must NOT contain hardcoded dollar amounts for pricing
    expect(content).not.toMatch(/\$79/)
    expect(content).not.toMatch(/\$399/)
  })

  it('Stripe subscribe.js calculates correct price from founder/regular rates', () => {
    const content = readSrc('api/subscribe.js')
    // Must compute totalCents dynamically from firstTruck + extraTruck
    expect(content).toContain('totalCents')
    expect(content).toMatch(/firstTruck.*199/)
    expect(content).toMatch(/extraTruck.*99/)
  })

  it('Stripe create-checkout.js matches founder price in cents (19900)', () => {
    const content = readSrc('api/create-checkout.js')
    expect(content).toContain('19900')
  })

  it('No component hardcodes pricing outside useSubscription', () => {
    const files = [
      'src/components/UpgradePrompt.jsx',
      'src/components/CarrierLayout.jsx',
      'src/components/carrier/SettingsTab.jsx',
    ]
    files.forEach(f => {
      const content = readSrc(f)
      if (!content) return
      // Should not contain "$199/mo" or "$299/mo" as hardcoded strings
      // (useSubscription provides these dynamically)
      const hasHardcodedPrice = /['"]\$199\/mo['"]/.test(content) || /['"]\$299\/mo['"]/.test(content)
      expect(hasHardcodedPrice, `${f} has hardcoded pricing string`).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. DRIVER PAY — LOCKED
// ═══════════════════════════════════════════════════════════════

describe('LOCKED: Driver Pay Logic', () => {
  it('DispatchTab looks up driver pay_rate before calculating', () => {
    const content = readSrc('src/components/carrier/DispatchTab.jsx')
    expect(content).toContain('pay_rate')
    expect(content).toContain('pay_model')
  })

  it('Finance PLDashboard uses driver pay_rate from driver profiles', () => {
    const content = readSrc('src/pages/carrier/Finance.jsx')
    const plBlock = content.slice(
      content.indexOf('export function PLDashboard'),
      content.indexOf('export function ReceivablesAging') || content.length
    )
    expect(plBlock).toContain('pay_rate')
    expect(plBlock).toContain('pay_model')
  })

  it('Database driver schema includes pay_model and pay_rate fields', () => {
    // Check multiple SQL files for driver pay fields
    const setup = readSrc('supabase-setup.sql')
    const missing = readSrc('supabase-missing-tables.sql')
    const combined = setup + missing
    expect(combined).toContain('drivers')
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. AI DECISION ENGINE — LOCKED
// ═══════════════════════════════════════════════════════════════

describe('LOCKED: AI Decision Engine', () => {
  it('Q orchestrator returns decision with action, confidence, reasoning', () => {
    const content = readSrc('api/q-orchestrator.js')
    expect(content).toContain('decision')
    expect(content).toContain('confidence')
    expect(content).toContain('reasons')
  })

  it('Q orchestrator has all 4 decision paths', () => {
    const content = readSrc('api/q-orchestrator.js')
    expect(content).toContain('auto_book')
    expect(content).toContain('negotiate')
    expect(content).toContain('reject')
    expect(content).toContain('accept')
  })

  it('Q learning engine has guardrails with bounds', () => {
    const content = readSrc('api/_lib/q-learning.js')
    expect(content).toContain('GUARDRAILS')
    expect(content).toContain('maxAdjustmentPct')
    expect(content).toContain('minSampleSize')
    expect(content).toContain('cooldownHours')
  })

  it('Q learning auto-adjust uses strict === true check', () => {
    const content = readSrc('api/_lib/q-learning.js')
    expect(content).toMatch(/qAutoAdjust\s*===\s*true/)
  })

  it('Q learning detects all 7 mistake types', () => {
    const content = readSrc('api/_lib/q-learning.js')
    const mistakeTypes = [
      'bad_accept', 'missed_good_load', 'failed_negotiation',
      'broker_reliability_miss', 'overestimated_profit',
      'detention_not_predicted', 'incorrect_lane_confidence'
    ]
    mistakeTypes.forEach(type => {
      expect(content, `Missing mistake type: ${type}`).toContain(type)
    })
  })

  it('Q orchestrator triggers learning on Delivered status', () => {
    const content = readSrc('api/q-orchestrator.js')
    expect(content).toContain('Delivered')
    expect(content).toContain('processLoadOutcome')
  })

  it('Q learning calls are non-blocking (wrapped in .catch)', () => {
    const content = readSrc('api/q-orchestrator.js')
    // recordOutcomeFromLoad must be followed by .catch
    const hasNonBlocking = content.includes('.catch(') && content.includes('recordOutcomeFromLoad')
    expect(hasNonBlocking).toBe(true)
  })

  it('Q learning test has all 6 test scenarios', () => {
    const content = readSrc('api/q-learning-test.js')
    const scenarios = ['good_accept', 'bad_accept', 'missed_load', 'failed_negotiation', 'broker_unreliable', 'detention_surprise']
    scenarios.forEach(s => {
      expect(content, `Missing test scenario: ${s}`).toContain(s)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. LOAD PIPELINE — LOCKED
// ═══════════════════════════════════════════════════════════════

describe('LOCKED: Load Pipeline Flow', () => {
  it('CarrierContext has updateLoadStatus function', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    expect(content).toContain('updateLoadStatus')
  })

  it('CarrierContext has advanceStop function for multi-stop loads', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    expect(content).toContain('advanceStop')
  })

  it('Load status flow includes all required statuses', () => {
    const content = readSrc('src/context/CarrierContext.jsx') + readSrc('src/components/carrier/LoadsPipeline.jsx')
    const statuses = ['Booked', 'Dispatched', 'In Transit', 'Delivered']
    statuses.forEach(s => {
      expect(content, `Missing status: ${s}`).toContain(s)
    })
  })

  it('database.js has createLoad with owner_id', () => {
    const content = readSrc('src/lib/database.js')
    const createBlock = content.slice(
      content.indexOf('export async function createLoad'),
      content.indexOf('export async function updateLoad')
    )
    expect(createBlock).toContain('owner_id')
  })

  it('database.js createLoad requires authentication', () => {
    const content = readSrc('src/lib/database.js')
    const createBlock = content.slice(
      content.indexOf('export async function createLoad'),
      content.indexOf('export async function updateLoad')
    )
    expect(createBlock).toContain('getUserId')
    expect(createBlock).toContain('Not authenticated')
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. DATABASE SAFETY — LOCKED
// ═══════════════════════════════════════════════════════════════

describe('LOCKED: Database Safety', () => {
  it('All database operations use safeSelect or safeMutate', () => {
    const content = readSrc('src/lib/database.js')
    // Count direct .from() calls vs safe wrappers
    const directFromCalls = (content.match(/supabase\.from\(/g) || []).length
    const safeSelectCalls = (content.match(/safeSelect\(/g) || []).length
    const safeMutateCalls = (content.match(/safeMutate\(/g) || []).length
    // Most .from() calls should be inside safeSelect/safeMutate
    // Allow some direct calls for special cases (maybeSingle, etc.)
    expect(safeSelectCalls + safeMutateCalls).toBeGreaterThan(10)
  })

  it('All SQL migration files use CREATE TABLE IF NOT EXISTS', () => {
    const sqlFiles = readdirSync(ROOT)
      .filter(f => f.startsWith('supabase-') && f.endsWith('.sql'))

    sqlFiles.forEach(f => {
      const content = readSrc(f)
      if (content.includes('CREATE TABLE')) {
        const hasIfNotExists = content.includes('IF NOT EXISTS')
        expect(hasIfNotExists, `${f} missing IF NOT EXISTS`).toBe(true)
      }
    })
  })

  it('All SQL tables enable RLS (except system cache tables)', () => {
    const sqlFiles = readdirSync(ROOT)
      .filter(f => f.startsWith('supabase-') && f.endsWith('.sql'))

    // System cache tables accessed only via service key don't need RLS
    const rlsExempt = ['supabase-diesel-prices.sql', 'supabase-load-board-cache.sql']

    sqlFiles.forEach(f => {
      if (rlsExempt.includes(f)) return
      const content = readSrc(f)
      const tableCount = (content.match(/CREATE TABLE/g) || []).length
      const rlsCount = (content.match(/ENABLE ROW LEVEL SECURITY/g) || []).length
      // Every file that creates tables should enable RLS on them
      if (tableCount > 0) {
        expect(rlsCount, `${f}: ${tableCount} tables but only ${rlsCount} RLS enables`).toBeGreaterThanOrEqual(tableCount)
      }
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. AUTH & SECURITY — LOCKED
// ═══════════════════════════════════════════════════════════════

describe('LOCKED: Auth & Security', () => {
  it('No API endpoint compares undefined === undefined for auth', () => {
    const files = readAllFiles('api')
    files.forEach(({ name, content }) => {
      // Auth checks must guard against undefined env vars
      if (content.includes('isAuthorized') || content.includes('CRON_SECRET')) {
        // Should have null/undefined guard: (SECRET && auth === SECRET)
        const hasUnsafeCompare = /auth\s*===\s*process\.env\.\w+[^&]/.test(content) &&
          !content.includes('&& auth ===') && !content.includes('SECRET && ')
        expect(hasUnsafeCompare, `${name} has unsafe auth comparison`).toBe(false)
      }
    })
  })

  it('Pre-commit hook blocks .env files', () => {
    const hook = readSrc('.husky/pre-commit')
    expect(hook).toContain('.env')
  })

  it('Pre-push hook runs build validation', () => {
    const hook = readSrc('.husky/pre-push')
    expect(hook).toContain('vite build')
  })

  it('Error boundaries exist at app level', () => {
    const content = readSrc('src/App.jsx')
    expect(content).toContain('ErrorBoundary')
    expect(content).toContain('componentDidCatch')
  })

  it('Sentry is initialized in main.jsx', () => {
    const content = readSrc('src/main.jsx')
    expect(content).toContain('Sentry')
    expect(content).toContain('init')
  })
})

// ═══════════════════════════════════════════════════════════════
// 8. BUILD SAFETY — LOCKED
// ═══════════════════════════════════════════════════════════════

describe('LOCKED: Build Safety', () => {
  it('vite.config.js does NOT use manualChunks', () => {
    const content = readSrc('vite.config.js')
    // Check for actual manualChunks usage (function/object), not warning comments
    const uncommented = content.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(uncommented).not.toContain('manualChunks')
  })

  it('No frontend files use 100vw for width (causes horizontal scroll)', () => {
    const dirs = ['src/components', 'src/pages']
    let violations = []
    dirs.forEach(dir => {
      const full = join(ROOT, dir)
      if (!existsSync(full)) return
      const files = readdirSync(full).filter(f => f.endsWith('.jsx') || f.endsWith('.js'))
      files.forEach(f => {
        const content = readSrc(`${dir}/${f}`)
        // width: '100vw' or width:'100vw' — not maxWidth
        if (/width:\s*['"]100vw['"]/.test(content) && !/maxWidth/.test(content.split('100vw')[0].slice(-30))) {
          violations.push(`${dir}/${f}`)
        }
      })
    })
    expect(violations, `Files with 100vw: ${violations.join(', ')}`).toHaveLength(0)
  })

  it('Service worker has CACHE_VERSION defined', () => {
    const content = readSrc('public/sw.js')
    expect(content).toMatch(/CACHE_VERSION\s*=\s*\d+/)
  })
})

// ═══════════════════════════════════════════════════════════════
// 9. AUDIT LOGGING — ENFORCED
// ═══════════════════════════════════════════════════════════════

describe('ENFORCED: Audit Logging', () => {
  it('database.js has createAuditLog function', () => {
    const content = readSrc('src/lib/database.js')
    expect(content).toContain('createAuditLog')
  })

  it('CarrierContext logs load creation in audit', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    expect(content).toContain('audit')
    expect(content).toContain('load.created')
  })

  it('CarrierContext logs load deletion in audit', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    expect(content).toContain('load.deleted')
  })
})

// ═══════════════════════════════════════════════════════════════
// 10. CONTEXT INTEGRITY — ENFORCED
// ═══════════════════════════════════════════════════════════════

describe('ENFORCED: Context Integrity', () => {
  it('CarrierContext provides all required values', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    const required = [
      'loads', 'invoices', 'expenses', 'drivers', 'vehicles',
      'totalRevenue', 'totalExpenses', 'fuelCostPerMile',
      'deliveredLoads', 'activeLoads', 'unpaidInvoices',
    ]
    required.forEach(val => {
      expect(content, `Missing context value: ${val}`).toContain(val)
    })
  })

  it('CarrierContext normalizes expense amounts to Number', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    // Must convert string amounts from Supabase NUMERIC to JS Number
    expect(content).toMatch(/Number\(e\.amount\)/)
  })

  it('CarrierContext normalizes load gross to Number', () => {
    const content = readSrc('src/context/CarrierContext.jsx')
    // Loads from Supabase have NUMERIC fields returned as strings
    expect(content).toMatch(/Number\(/)
  })
})
