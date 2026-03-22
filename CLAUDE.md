# Qivori AI — Development Rules

## Pricing (single source of truth)
- Plan name: **Qivori AI Dispatch**
- Founder: $199/mo first truck + $99 each additional — locked for life (first 100 carriers)
- Regular: $299/mo first truck + $149 each additional
- Plan ID in code: `autonomous_fleet`
- 14-day free trial, no credit card required
- NEVER hardcode pricing in components. Use `useSubscription()` hook for display values.

## Hooks & Context — Always Use These
- **`useSubscription()`** — plan name, price, trial status, feature access
- **`useCarrier()`** — loads, invoices, expenses, drivers, vehicles, fuelCostPerMile, brokerStats
- **`useApp()`** — user, profile, demoMode, showToast, logout, subscription
- **`fuelCostPerMile`** from CarrierContext — real EIA diesel price. NEVER hardcode $0.22/mi
- **`driver.pay_model`** + **`driver.pay_rate`** — per-driver pay config. NEVER hardcode 28%
- **`apiFetch()`** from `lib/api.js` — always use for API calls (auto-injects auth token)

## Database Rules
- Every table MUST have `owner_id` referencing `auth.users(id)`
- Every table MUST have Row Level Security (RLS) enabled
- Use `db.*` functions from `lib/database.js` for all Supabase operations
- Driver pay fields: `pay_model` (percent|permile|flat), `pay_rate` (numeric)

## Security
- API endpoints that use `isAuthorized()` MUST check that env vars are defined before comparing
- Pattern: `if (!auth) return false; return (SECRET && auth === SECRET)`
- NEVER compare undefined === undefined — this bypasses auth

## Build & Deploy
- Run `npx vite build` before pushing — must be zero errors
- Bump `CACHE_VERSION` in `public/sw.js` after every deploy
- Never push directly to main without testing
- Service worker cache version is currently in the 30s range

## Tech Stack
- React + Vite (SPA, hash-based routing)
- Vercel Edge Functions (API)
- Supabase (database + auth + realtime + storage)
- Stripe (billing — inline pricing, not pre-created Price IDs)
- Resend (transactional email)
- Twilio + Retell AI (SMS + voice)
- Claude AI (chat, document parsing, rate analysis)
