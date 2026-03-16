/**
 * Google Analytics 4 — custom event tracking for Qivori AI
 */

function gtag() {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag(...arguments)
  }
}

// Demo
export const trackDemoRequest = (email) =>
  gtag('event', 'demo_request', { method: 'landing_page', email_domain: email?.split('@')[1] })

export const trackDemoEnter = () =>
  gtag('event', 'demo_enter', { method: 'email_link' })

// Auth
export const trackSignup = (method = 'email') =>
  gtag('event', 'sign_up', { method })

export const trackLogin = (method = 'email') =>
  gtag('event', 'login', { method })

// Checkout
export const trackBeginCheckout = (plan) =>
  gtag('event', 'begin_checkout', { currency: 'USD', items: [{ item_name: plan }] })

export const trackPurchase = (plan, value) =>
  gtag('event', 'purchase', { currency: 'USD', value, items: [{ item_name: plan }] })

// Engagement
export const trackPageView = (page) =>
  gtag('event', 'page_view', { page_title: page })

export const trackFeatureUse = (feature) =>
  gtag('event', 'feature_use', { feature_name: feature })
