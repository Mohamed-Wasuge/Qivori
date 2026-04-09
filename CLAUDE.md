# Qivori AI — Development Rules

## Working Style — read first, build once

These rules exist because following them saves hours every day.

### Before editing ANY file
1. **Grep for the file first.** Don't guess paths. Don't assume which page renders what.
2. **Read 30 lines around the section you'll edit** before writing.
3. **If you'll touch more than 2 files, spawn parallel Explore agents first** to map the existing code. Don't go serial when parallel works.

### Before claiming a feature is missing
1. **Grep for it.** Most features the user mentions already exist in the codebase.
2. **Check `src/components/`, `src/pages/`, `api/`** before declaring "we need to build X."
3. **Don't build parallel solutions** to features that already exist. Reuse, don't rewrite.

### Before calling an API endpoint
1. **Read the existing endpoint file** to confirm method (GET vs POST) and param shape.
2. **Check the env var name** referenced in the endpoint (e.g. `FMCSA_WEBKEY` not `FMCSA_WEB_KEY`).
3. **Don't create duplicate endpoints** when one already exists.

### One feature at a time
- Build one feature **all the way to verified working on the user's phone** before starting the next.
- Don't ship code that needs prerequisites the user hasn't run yet (migrations, Retell config, env vars). If it needs setup, give the user the EXACT steps and wait for confirmation before moving on.
- "Pushed to main" ≠ "shipped." Shipped = user has tested it and confirmed it works.

### Stop me when I'm wrong
- If I read more than 3 files trying to find something, stop me and give me the path.
- If I write a long explanation instead of code, say "less talking, more code."
- If I start building a "new" thing, ask "does that already exist?" and force a grep.

## File Path Cheat Sheet (don't guess)

| Feature | File path |
|---|---|
| Admin "Manage Users" page (the one with "+ Invite User") | `src/pages/admin/UserManagement.jsx` |
| Admin Carriers (legacy) | `src/pages/Carriers.jsx` |
| Carrier signup form | `src/pages/LoginPage.jsx` |
| Carrier desktop shell | `src/components/CarrierLayout.jsx` |
| Carrier mobile shell | `src/components/mobile/MobileShell.jsx` (wrapped by `src/components/MobileLayout.jsx`) |
| Mobile More tab | `src/components/mobile/MobileMoreTab.jsx` |
| Carrier Settings (Company Profile, Equipment, Lanes, etc.) | `src/components/carrier/settingstab/SettingsTab.jsx` |
| Carrier Pages (modules) | `src/pages/CarrierPages.jsx` (~8800 lines) |
| Topbar with "+ Invite User" button | `src/components/Topbar.jsx` (handlePrimary fires AdminCarrierOnboarding) |
| Carrier onboarding wizard (admin side) | `src/components/AdminCarrierOnboarding.jsx` |
| Q dispatching components | `src/components/auto/` (AutoHome, AutoNegotiation, AutoActiveLoad, AutoLoopOffer, AutoCardOnFile, etc.) |
| FMCSA lookup | `api/fmcsa-lookup.js` — **GET** with `?dot=` or `?mc=` query params, env var `FMCSA_WEBKEY` |
| Create user (admin) | `api/create-user.js` — POST, accepts email/password/full_name/company_name/role + carrier extras (mc_number, dot_number, phone, address, city, state, zip, equipment, home_base_city, home_base_state, subscription_plan) |
| Charge AI fee | `api/charge-ai-fee.js` — POST, charges 3% via Stripe Charges |
| Retell broker call | `api/retell-broker-call.js` — POST, kicks off real Retell outbound call. Honors `body.target_rate` over default markup. |
| Retell webhook | `api/retell-webhook.js` — receives call_started/call_ended/call_analyzed. Reads `agreed_rate` from `call.call_analysis.custom_analysis_data`. Skips legacy TMS pipeline when `metadata.experience === 'auto'`. |
| Q live broker messages endpoint | `api/q-notify.js` — POST, writes to `negotiation_messages` table |
| Stripe Checkout | `api/create-checkout.js` — POST with planId. autonomous_fleet plan = $0 base + 3% metered. |

## Solo OO Carrier Conventions

When creating a carrier (admin wizard or carrier signup):
1. Insert `profiles` row with `role='carrier'`, `company_id = auth.users.id` (the user's own id)
2. Insert `companies` row with `owner_id = user.id`, `name = company_name`, plus any FMCSA fields
3. Insert `company_members` row with `company_id = user.id`, `user_id = user.id`, `role='owner'`, `status='active'`
4. Insert `drivers` row with `owner_id = user.id`, `full_name`, `email`, `status='Active'`
5. Default `subscription_plan = 'autonomous_fleet'`, `subscription_status = 'trialing'`

Without ALL FIVE rows the carrier will:
- See "Only owner can invite team members" (missing #3)
- Find Company Profile won't save (missing #2)
- Be invisible in HR/Drivers (missing #4)
- Get bounced from app after 14 days (missing #5)

## Parallel work — default to sub-agents

For any task that touches more than 2 files, spawn parallel Explore agents FIRST to map the existing code before writing anything new. The Explore agent runs in parallel and doesn't pollute the main context. Use Plan agent for big features. Default to parallel sub-agents over serial file reads.

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
- Service worker cache version is currently in the 310s range (as of 2026-04-09)
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
