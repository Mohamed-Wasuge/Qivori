/**
 * Google Analytics 4 + Facebook Pixel — event tracking for Qivori AI
 *
 * All functions gracefully no-op if the tracker is not loaded.
 * GA Measurement ID is set in index.html (G-XXXXXXXXXX).
 */

// ---------------------------------------------------------------------------
// GA4 Measurement ID (also configured in index.html <script> tag)
// Replace with your actual GA4 ID if it changes.
// ---------------------------------------------------------------------------
export const GA_MEASUREMENT_ID = 'G-6B577V205M'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe wrapper around window.gtag — no-ops when GA is not loaded. */
function gtag() {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag(...arguments)
  }
}

/** Safe wrapper around Facebook Pixel fbq — no-ops when pixel is not loaded. */
function fbq() {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq(...arguments)
  }
}

// ---------------------------------------------------------------------------
// Page Views
// ---------------------------------------------------------------------------

/** Track a virtual page view (for SPA hash routing). */
export const trackPageView = (page) => {
  gtag('event', 'page_view', { page_title: page, page_location: window.location.href })
  fbq('track', 'PageView')
}

// ---------------------------------------------------------------------------
// Auth Events
// ---------------------------------------------------------------------------

/** Track new account creation. */
export const trackSignup = (method = 'email', role = 'carrier') => {
  gtag('event', 'sign_up', { method, role })
  fbq('track', 'CompleteRegistration', { content_name: role })
}

/** Track user login. */
export const trackLogin = (method = 'email') => {
  gtag('event', 'login', { method })
}

/** Track session start when a user authenticates (page load with existing session). */
export const trackSessionStart = (role) => {
  gtag('event', 'session_start_auth', { role })
}

// ---------------------------------------------------------------------------
// Monetization Funnel
// ---------------------------------------------------------------------------

/** Track trial started. */
export const trackTrialStart = (plan) => {
  gtag('event', 'trial_start', { plan })
  fbq('track', 'StartTrial', { content_name: plan })
}

/** Track checkout initiated. */
export const trackCheckout = (plan, truckCount, amount) => {
  gtag('event', 'begin_checkout', {
    currency: 'USD',
    value: amount,
    items: [{ item_name: plan, quantity: truckCount }],
  })
  fbq('track', 'InitiateCheckout', { value: amount, currency: 'USD', content_name: plan })
}

/** Track subscription completed. */
export const trackSubscription = (plan, amount, interval = 'monthly') => {
  gtag('event', 'purchase', {
    currency: 'USD',
    value: amount,
    items: [{ item_name: plan }],
    interval,
  })
  fbq('track', 'Subscribe', { value: amount, currency: 'USD', predicted_ltv: amount * 12 })
}

// ---------------------------------------------------------------------------
// Product Engagement
// ---------------------------------------------------------------------------

/** Track a load being booked. */
export const trackLoadBooked = (loadId, rate, miles) => {
  gtag('event', 'load_booked', { load_id: loadId, rate, miles })
}

/** Track OCR document scanning. */
export const trackDocumentScanned = (docType) => {
  gtag('event', 'document_scanned', { doc_type: docType })
}

/** Track AI chat message sent. */
export const trackChatMessage = () => {
  gtag('event', 'chat_message')
}

/** Track rate analysis / rate check. */
export const trackRateAnalysis = (origin, dest, verdict) => {
  gtag('event', 'rate_analysis', { origin, destination: dest, verdict })
}

/** Track referral shared. */
export const trackReferralSent = () => {
  gtag('event', 'referral_sent')
  fbq('track', 'Contact')
}

/** Track generic feature usage. */
export const trackFeatureUsed = (feature) => {
  gtag('event', 'feature_use', { feature_name: feature })
}

// ---------------------------------------------------------------------------
// Demo / Landing
// ---------------------------------------------------------------------------

/** Track demo request from landing page. */
export const trackDemoRequest = (email) =>
  gtag('event', 'demo_request', { method: 'landing_page', email_domain: email?.split('@')[1] })

/** Track demo enter from email link. */
export const trackDemoEnter = () =>
  gtag('event', 'demo_enter', { method: 'email_link' })
