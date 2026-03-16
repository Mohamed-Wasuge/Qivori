/**
 * Lightweight conversion funnel tracking for Qivori AI.
 *
 * Funnel steps: Visit → Signup → Onboard → FirstLoad → Subscribe
 *
 * Persists step completions in localStorage and forwards to GA4.
 */

import { trackFeatureUsed } from './analytics'

// ---------------------------------------------------------------------------
// Funnel Definition
// ---------------------------------------------------------------------------

export const FUNNEL_STEPS = ['visit', 'signup', 'onboard', 'first_load', 'subscribe']

const STORAGE_KEY = 'qivori_funnel'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read the funnel store from localStorage. */
function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { steps: {}, users: {} }
  } catch {
    return { steps: {}, users: {} }
  }
}

/** Persist the funnel store. */
function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record that a user completed a funnel step.
 * Deduplicates by userId + step so the same step is only counted once per user.
 *
 * @param {string} userId - Unique user identifier (or 'anonymous').
 * @param {string} step   - One of FUNNEL_STEPS.
 */
export function recordStep(userId, step) {
  if (!FUNNEL_STEPS.includes(step)) {
    console.warn(`[Funnel] Unknown step: ${step}`)
    return
  }

  const store = readStore()
  const userKey = userId || 'anonymous'

  // Deduplicate: skip if this user already completed this step
  if (!store.users[userKey]) store.users[userKey] = []
  if (store.users[userKey].includes(step)) return

  // Record
  store.users[userKey].push(step)
  store.steps[step] = (store.steps[step] || 0) + 1
  writeStore(store)

  // Forward to GA4
  trackFeatureUsed(`funnel_${step}`)
}

/**
 * Get aggregated funnel data — completion counts per step.
 * @returns {{ [step: string]: number }}
 */
export function getFunnelData() {
  const store = readStore()
  const data = {}
  for (const step of FUNNEL_STEPS) {
    data[step] = store.steps[step] || 0
  }
  return data
}

/**
 * Calculate the dropoff rate between two consecutive funnel steps.
 *
 * @param {string} step1 - The earlier step.
 * @param {string} step2 - The later step.
 * @returns {number} Dropoff rate as a decimal (0–1). Returns 0 if step1 has no completions.
 */
export function getDropoffRate(step1, step2) {
  const data = getFunnelData()
  const count1 = data[step1] || 0
  const count2 = data[step2] || 0

  if (count1 === 0) return 0
  return Math.max(0, Math.min(1, 1 - count2 / count1))
}
