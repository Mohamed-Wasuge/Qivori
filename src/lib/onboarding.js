/**
 * Driver Onboarding Orchestration
 * Auto-advance flow: when one check clears, automatically order the next
 * Auto-email: send consent form when driver is added
 */

import { supabase } from './supabase'
import { orderDrugTest } from './providers/first-advantage'
import { orderClearinghouseQuery, orderPSPReport, verifyCDL } from './providers/fmcsa'
import { orderMVR } from './providers/sambasafety'
import { orderBackgroundCheck, orderEmploymentVerification } from './providers/checkr'

// ─── Check execution order ────────────────────────────────
// These run in phases. Phase 1 starts immediately, phase 2 after consent, etc.
const PHASES = [
  // Phase 1 — Instant checks (no consent needed for query)
  { id: 'cdl',            order: orderFn('cdl'),            auto: true },
  { id: 'clearinghouse',  order: orderFn('clearinghouse'),  auto: true },
  // Phase 2 — Requires written consent (sent via email)
  { id: 'mvr',            order: orderFn('mvr'),            auto: true,  needsConsent: true },
  { id: 'psp',            order: orderFn('psp'),            auto: true,  needsConsent: true },
  { id: 'drug',           order: orderFn('drug'),           auto: true,  needsConsent: true },
  // Phase 3 — Longer checks
  { id: 'employment',     order: orderFn('employment'),     auto: true,  needsConsent: true },
  // Phase 4 — Manual / in-person (cannot auto-order, just track)
  { id: 'medical',        order: null,  auto: false },
  { id: 'road_test',      order: null,  auto: false },
  { id: 'eld',            order: null,  auto: false },
  { id: 'pay',            order: null,  auto: false },
]

function orderFn(checkId) {
  return async (driver) => {
    switch (checkId) {
      case 'cdl':           return verifyCDL(driver)
      case 'clearinghouse': return orderClearinghouseQuery(driver)
      case 'mvr':           return orderMVR(driver)
      case 'psp':           return orderPSPReport(driver)
      case 'drug':          return orderDrugTest(driver)
      case 'employment':    return orderEmploymentVerification(driver)
      default:              return null
    }
  }
}

// ─── Send consent form email ──────────────────────────────
export async function sendConsentEmail(driver) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: {
      action: 'send_consent_email',
      driver: {
        full_name: driver.name || driver.full_name,
        email: driver.email,
        phone: driver.phone,
      },
    },
  })
  if (error) throw error
  return data
}

// ─── Auto-start onboarding ───────────────────────────────
// Called when a new driver is added. Kicks off phase 1 checks immediately.
export async function startOnboarding(driver) {
  const results = { started: [], skipped: [], errors: [] }

  // Send consent email first
  if (driver.email) {
    try {
      await sendConsentEmail(driver)
      results.started.push('consent_email')
    } catch (err) {
      results.errors.push({ check: 'consent_email', error: err.message })
    }
  }

  // Auto-order phase 1 checks (no consent needed)
  for (const phase of PHASES.filter(p => p.auto && !p.needsConsent)) {
    try {
      if (phase.order) {
        await phase.order(driver)
        results.started.push(phase.id)
      }
    } catch (err) {
      results.errors.push({ check: phase.id, error: err.message })
    }
  }

  return results
}

// ─── Auto-advance: order next checks when one clears ─────
// Called after a check status changes to 'cleared'
export async function autoAdvance(driver, clearedCheckId, consentReceived = false) {
  const results = { started: [], skipped: [] }
  const currentIndex = PHASES.findIndex(p => p.id === clearedCheckId)

  // Find next checks that can be auto-ordered
  for (const phase of PHASES.slice(currentIndex + 1)) {
    if (!phase.auto || !phase.order) {
      results.skipped.push(phase.id)
      continue
    }
    // Skip consent-required checks if consent not yet received
    if (phase.needsConsent && !consentReceived) {
      results.skipped.push(phase.id)
      continue
    }
    try {
      await phase.order(driver)
      results.started.push(phase.id)
    } catch (err) {
      // Don't block the chain — log and continue
      // Auto-advance failed for this phase — continue chain
    }
  }

  return results
}

// ─── Get onboarding progress ─────────────────────────────
export function getProgress(checks) {
  const total = PHASES.length
  const cleared = PHASES.filter(p => checks[p.id] === 'cleared' || checks[p.id] === 'waived').length
  const failed = PHASES.filter(p => checks[p.id] === 'failed').length
  const pending = PHASES.filter(p => ['ordered', 'processing'].includes(checks[p.id])).length
  const notStarted = PHASES.filter(p => checks[p.id] === 'idle').length

  return {
    total,
    cleared,
    failed,
    pending,
    notStarted,
    percent: Math.round((cleared / total) * 100),
    canDispatch: PHASES.filter(p => p.id !== 'eld' && p.id !== 'pay')
      .every(p => checks[p.id] === 'cleared' || checks[p.id] === 'waived'),
  }
}

// ─── Check expiry alerts ─────────────────────────────────
export function getExpiryAlerts(driver) {
  const alerts = []
  const now = new Date()
  const warn90 = 90 * 24 * 60 * 60 * 1000  // 90 days
  const warn30 = 30 * 24 * 60 * 60 * 1000   // 30 days

  const checks = [
    { label: 'CDL', date: driver.cdlExpiry || driver.license_expiry },
    { label: 'Medical Card', date: driver.medExpiry || driver.medical_card_expiry },
  ]

  for (const c of checks) {
    if (!c.date) continue
    const exp = new Date(c.date)
    const diff = exp - now
    if (diff < 0) {
      alerts.push({ label: c.label, level: 'expired', color: 'var(--danger)', message: `${c.label} EXPIRED` })
    } else if (diff < warn30) {
      alerts.push({ label: c.label, level: 'critical', color: 'var(--danger)', message: `${c.label} expires in ${Math.ceil(diff / 86400000)} days` })
    } else if (diff < warn90) {
      alerts.push({ label: c.label, level: 'warning', color: 'var(--warning)', message: `${c.label} expires in ${Math.ceil(diff / 86400000)} days` })
    }
  }

  return alerts
}
