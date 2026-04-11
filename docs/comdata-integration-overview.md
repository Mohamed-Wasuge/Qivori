# Qivori AI x Comdata — Integration Overview

## About Qivori AI
Qivori is an AI-powered Transportation Management System (TMS) built for owner-operators and small carriers (1–10 trucks). We provide dispatch, load management, invoicing, compliance, and financial intelligence — all from one platform with a mobile-first AI assistant.

**Website:** qivori.com
**Contact:** Mohamed Wasuge, Founder & CEO — mwasuge@qivori.com

---

## Integration Vision

Comdata fuel cards embedded natively inside Qivori, giving carriers seamless fuel expense tracking, IFTA automation, and fleet payment controls — without leaving the platform.

---

## Data Architecture — Per-Carrier Isolation

Each Qivori carrier connects their **own individual Comdata account**. There is no shared data pool.

**How it works:**
- Carrier signs up for Qivori → gets their own isolated account
- Carrier connects their Comdata account via OAuth or API credentials
- Each carrier's Comdata credentials are stored securely, tied to their account only
- Qivori pulls transaction data **only for that specific carrier's account**
- No carrier can see another carrier's data — enforced at the database level (Row Level Security)

**Per-carrier flow:**
1. Carrier logs into Qivori
2. Goes to Settings → Integrations → "Connect Comdata"
3. Authenticates with their own Comdata credentials
4. Qivori stores their token securely and begins syncing their transactions

This means **every carrier has individual credentials** — Qivori never shares a single API connection across multiple customers.

---

## How We Would Use Comdata

### 1. Automatic Fuel Expense Tracking
- Pull fuel card transactions via API per carrier account
- Auto-categorize each purchase: amount, gallons, price/gallon, merchant, location, state
- Eliminate manual expense entry — driver swipes card, Qivori records it instantly
- Link transactions to specific loads for per-trip P&L accuracy

### 2. IFTA Tax Automation
- Every fuel purchase includes state + gallons — the two data points IFTA requires
- Qivori auto-generates quarterly IFTA reports (Q1–Q4) with zero manual input
- Saves carriers 4–8 hours per quarter of manual tax prep

### 3. Fleet Spending Controls
- Owner-operators set per-driver spending limits and fuel-only restrictions
- Real-time alerts on unusual transactions (high amounts, non-fuel purchases, out-of-route locations)
- Dashboard view: fuel spend by driver, truck, state, and time period

### 4. Financial Intelligence
- Fuel is 30–40% of carrier operating costs — the single largest expense
- Real-time fuel data powers accurate P&L dashboards, cash flow forecasting, and profit-per-load calculations
- AI-powered insights: "Your fuel cost per mile is $0.62 — 12% above fleet average. Consider fueling in TX where diesel is $0.15/gal cheaper."

### 5. Driver Mobile Experience
- Drivers see fuel transactions in Qivori's mobile app instantly
- AI assistant (Q) auto-logs fuel: "Filled 52 gal at Love's in Dallas — $198.12 logged to QV-5012"
- Find cheapest nearby diesel using Comdata network + real-time pricing

---

## Data Sync Method — Polling (No Webhooks Required)

Since webhooks are not yet available, Qivori will use **scheduled polling** to sync transaction data:

- A cron job runs every **15–60 minutes** (based on Comdata's rate limit recommendations)
- For each connected carrier, we call the Comdata Transaction API: "give me transactions since last sync"
- New transactions are saved to the carrier's account and auto-categorized
- Drivers see new fuel purchases in their app within minutes

**No real-time webhook dependency.** Polling is production-ready and reliable.

---

## What We Need from Comdata

| Capability | Purpose |
|---|---|
| Transaction API | Pull card transactions (amount, merchant, location, gallons, state, timestamp) |
| Card Management API | Issue/activate/deactivate cards, set spending limits |
| Rate Limit Guidance | Recommended polling frequency (per carrier, per minute/hour) |
| Fuel Pricing Data | Show drivers cheapest nearby fuel within Comdata network |
| Sandbox / Test Environment | Build and test integration before going live |
| OAuth or Per-Carrier Auth | Each carrier authenticates individually |

---

## What Comdata Gets

**Distribution Channel**
- Every Qivori carrier is a potential Comdata cardholder
- Embedded integration = frictionless onboarding ("Activate Comdata Card" button inside Qivori)

**Sticky Customers**
- When fuel data powers a carrier's entire financial stack (P&L, IFTA, cash flow), switching cards means breaking their workflow
- Higher retention vs. standalone card programs

**Data-Driven Engagement**
- Carriers who see fuel analytics are more engaged with their card
- Higher transaction volume per cardholder

**Growing Market**
- Owner-operator segment is 350,000+ carriers in the US
- Qivori targets the underserved 1–10 truck market that big TMS platforms ignore

---

## Technical Summary

| Component | Detail |
|---|---|
| Platform | React + Vercel Edge Functions + Supabase (PostgreSQL) |
| Auth Model | Per-carrier OAuth or API credentials (individual, not shared) |
| Data Sync | Scheduled polling via cron (every 15–60 min) |
| Data Isolation | Row Level Security — each carrier sees only their own data |
| Security | Encrypted at rest, no card numbers stored client-side, SOC 2 practices |
| Timeline | 2–4 weeks from API access to production-ready |

---

## Next Steps

1. Comdata provides API documentation + sandbox credentials
2. Qivori builds integration in test environment
3. Joint review and testing
4. Production rollout to Qivori carrier base

---

*Qivori AI — The dispatch engine that thinks ahead.*
