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
- Service worker cache version is currently in the 180s range
- Pre-push hook runs 7 checks: build, missing imports, 100vw, manualChunks, hook ordering, circular imports, secrets

## Permanence Rules — NEVER VIOLATE
These rules exist because features were broken in the past. Every rule has a reason.

### Root Cause Fixes Only
- NEVER patch symptoms. Find and fix the root cause.
- If root cause is unclear, analyze before changing code.
- Every fix must prevent recurrence — not just solve today's instance.

### Regression Prevention
- Before ANY code change: identify all dependencies that could break.
- After ANY code change: `npx vite build` must pass with zero errors.
- NEVER modify financial calculations (P&L, invoicing, driver pay, profit) without verifying the math end-to-end.
- NEVER modify load status flow without verifying the full pipeline (book → assign → pickup → deliver → invoice → pay).
- NEVER modify AI decision logic without verifying all 6 Q learning test scenarios still pass.

### Change Protection
- Before editing a component, READ IT FIRST. Understand what it does.
- Check what other components import or depend on it before changing exports.
- NEVER delete a function/export without searching for all callers first.
- NEVER rename database columns without updating all code that references them.
- NEVER change context provider values without checking all consumers.

### Data Integrity
- All database writes MUST go through `lib/database.js` (safeSelect/safeMutate).
- NEVER write raw Supabase queries in components — always use db.* functions.
- All financial amounts must be `Number()` coerced — Supabase returns NUMERIC as strings.
- NEVER delete user data without explicit user confirmation.
- All tables MUST have RLS + owner_id. No exceptions.

### Error Handling
- All API endpoints MUST have try/catch with meaningful error responses.
- All learning/AI pipeline calls MUST be non-blocking (.catch() wrapped).
- Frontend MUST show loading states (Skeleton components), never blank screens.
- Database operations MUST use safeSelect/safeMutate — never throw on missing tables.

### Testing Requirements
- Pre-push hook (7 checks) MUST pass before any push.
- CI/CD pipeline (test → build → merge gate) MUST pass.
- Sentry captures all runtime errors with session replay.
- Self-repair agent runs daily at 6am to detect and diagnose errors.

### What NEVER to Do
- NEVER use `manualChunks` in vite.config.js (causes TDZ crashes)
- NEVER use `100vw` (causes horizontal scroll — use 100% instead)
- NEVER rewrite entire component files (use incremental edits only)
- NEVER add `console.log` with sensitive data (tokens, passwords, PII)
- NEVER skip the pre-push hook with `--no-verify`
- NEVER compare `undefined === undefined` for auth checks
- NEVER hardcode: pricing, fuel costs, driver pay rates, or plan names

## Tech Stack
- React + Vite (SPA, hash-based routing)
- Vercel Edge Functions (API)
- Supabase (database + auth + realtime + storage)
- Stripe (billing — inline pricing, not pre-created Price IDs)
- Resend (transactional email)
- Twilio + Retell AI (SMS + voice)
- Claude AI (chat, document parsing, rate analysis)
- Sentry (error monitoring + session replay)
- Vitest + Testing Library (unit + integration tests)
- Husky (pre-commit + pre-push hooks)
