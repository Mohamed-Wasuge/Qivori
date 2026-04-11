# Q — Product Guide
### The AI Dispatch Engine Inside Qivori

---

## What is Q?

Q is your AI dispatcher. It runs inside Qivori and handles everything a human dispatcher does — finding loads, scoring rates, calling brokers, tracking shipments, invoicing, and keeping you FMCSA compliant. You talk to Q like you'd talk to dispatch. Q talks back like a veteran who's been in freight 15 years.

Q is not a chatbot. Q is an operating system for your trucking business.

---

## Getting Started

### Step 1: Sign Up
Go to **qivori.com** and tap **Activate Q**. Enter your email and create a password. You get 14 days free, no credit card.

### Step 2: Onboarding Wizard
Q walks you through setup:
- **Company Info** — Enter your MC or DOT number. Q auto-fills your company details from FMCSA.
- **Add Your Truck** — Year, make, model, VIN, unit number. Takes 30 seconds.
- **Add a Driver** — If you're the owner-operator, check "I'm the driver." Q pulls your name from your profile.
- **Activate Q** — Q scans the market and shows your first load recommendation.

### Step 3: Book Your First Load
Drop a rate confirmation image or PDF into Qivori. Q reads it instantly — origin, destination, rate, broker, pickup/delivery dates — all auto-filled. Or type "find loads Dallas to Atlanta" in the Q chatbot and Q searches for you.

---

## The Dashboard

When you log in, you see the **Q Load Intelligence** dashboard. This is your command center.

### Pipeline View
Your loads organized in columns:
- **Booked** — Rate con received, waiting for dispatch
- **Dispatched** — Driver assigned, heading to pickup
- **In Transit** — Loaded and rolling
- **Delivered** — At destination, POD pending
- **Invoiced** — Invoice sent to broker
- **Paid** — Money received

Every load card shows:
- **Q Decision Badge** — ACCEPT (green), REJECT (red), or NEGOTIATE (gold)
- **Estimated Profit** — After fuel, driver pay, and operating costs
- **Rate Per Mile** — Compared to market average
- **Broker Score** — A, B, or C based on payment history
- **One-line AI Reason** — Why Q made that decision

Drag loads between columns to update status. Q auto-triggers actions — delivered loads get invoiced automatically.

---

## Q Chatbot

Tap the lightning bolt icon (bottom right) to open Q. Ask anything:

### What You Can Say
| You Say | Q Does |
|---------|--------|
| "Find truck stops near me" | Returns real truck stops with addresses, distance, tap-to-call |
| "What's diesel running?" | Shows regional diesel prices from EIA data |
| "Weather on my route" | Current conditions + 3-day forecast + safety alerts |
| "I have a flat tire" | Lists roadside service providers with tap-to-call buttons |
| "How's the Dallas to Atlanta lane?" | Lane rate trend, predicted RPM, confidence %, sparkline chart |
| "Find loads from Memphis" | Searches available loads, shows rate and RPM |
| "What's my profit this month?" | Pulls your real revenue, expenses, net profit |
| "Fuel $85 at Loves 52 gallons Texas" | Logs the expense with IFTA fields auto-filled |
| "Delivered" | Updates load status + auto-generates invoice + asks about next load |
| "How long until pickup?" | Countdown timer to your next pickup appointment |
| "Pre-trip" | Opens FMCSA DVIR inspection checklist |

Q never says "I don't have that info." It searches instead. Phone numbers are tap-to-call. Addresses open Maps.

---

## AI Load Scoring

Every load that enters Qivori gets scored automatically. You never need to manually check a rate.

### How Q Scores
Q evaluates every load on:
- **Profit per mile** — After fuel and operating costs
- **Profit per day** — Factors in transit time and multi-day holds
- **Market rate comparison** — Is this above or below the lane average?
- **Seasonality** — Is this peak or slow season for this region?
- **Weight** — Light loads (under 37K) get a bonus. Heavy loads get flagged.
- **Broker history** — Does this broker pay on time?
- **Equipment match** — Right truck for this load?

### Decision Thresholds
| Decision | Criteria |
|----------|----------|
| **ACCEPT** | Profit > $1,200, RPM > $1.00, profit/day > $400 |
| **NEGOTIATE** | Profit $800-$1,200 — Q gives you a counter-offer script |
| **REJECT** | Profit < $800 or RPM below minimum |

Q shows the negotiation script you can text to the broker: *"Load at $2.40/mi. Market shows $2.85. Can you get closer?"*

---

## Q Dispatch (AI Broker Calling)

On the **Q Dispatch** tab, select a load and tap **Activate Q — Call Broker**.

Q calls the broker's phone with a real AI voice:
1. Introduces itself as Q from Qivori Dispatch
2. References the load (origin, destination, load number)
3. Confirms pickup and delivery details
4. Negotiates the rate based on your targets
5. You see the live transcript on screen in real-time

After the call, Q saves the recording, transcript, and outcome (agreed rate, notes) to your load.

---

## EDI System

Qivori supports X12 EDI for enterprise shippers and brokers:

| Transaction | Direction | What It Does |
|-------------|-----------|-------------|
| **204** | Inbound | Load tender received → Q auto-scores → creates load |
| **990** | Outbound | Accept/reject response sent automatically |
| **214** | Outbound | Shipment status updates sent at each milestone |
| **210** | Outbound | Freight invoice sent on delivery |

### How It Works
1. Broker sends a 204 load tender
2. Q parses it, runs AI evaluation
3. If accepted: Q sends 990 accept, assigns driver, dispatches
4. As driver updates status (pickup, in transit, delivered): Q sends 214 automatically
5. On delivery: Q generates invoice + sends 210

The **EDI Hub** tab shows all transactions, exceptions, and trading partner management.

---

## Pre-Trip Inspection

Before every dispatch, Q walks you through a FMCSA §396.11 compliant DVIR.

### 32-Item Checklist
**Tractor:** Brakes, parking brake, steering, horn, wipers, mirrors, headlights, tail lights, turn signals, clearance lights, front tires, rear tires, wheels/lug nuts, fuel system, exhaust, fluids, belts/hoses, air lines, suspension, frame

**Safety:** Fire extinguisher, warning triangles, seat belt, first aid kit

**Trailer:** Brakes, tires, lights, coupling devices, doors, floor/walls, landing gear, mud flaps

### AI Photo Inspection
Take a photo of any component. Q Vision analyzes it:
- **Tire** → Checks tread depth, sidewall cracks, inflation, exposed cords
- **Brakes** → Checks pad thickness, drum condition, air leaks
- **Lights** → Checks for burned bulbs, cracked lenses
- **Coupling** → Checks fifth wheel, kingpin, safety chains

Q cites specific FMCSA regulations. Critical defects block dispatch. Photos are saved for DOT audit trail.

---

## Invoicing & Factoring

### Auto-Invoice
When you mark a load as Delivered, Q creates the invoice automatically:
- Invoice number (INV-XXXX)
- Broker name and contact
- Route, rate, line items
- Due date (Net 30)

### Factoring
Click Factor on any unpaid invoice:
1. Choose payment terms: **Same Day Pay**, **Next Day**, or **Standard**
2. Q validates all documents (BOL, rate con, POD) with AI before sending
3. Q emails the factoring company with:
   - Invoice details
   - All supporting documents (clickable links)
   - Payment terms
   - Carrier info (MC, DOT)

Q catches bad paperwork before the factoring company does — wrong BOL, unsigned POD, mismatched rate con.

Pre-loaded factoring companies: OTR Solutions, RTS Financial, Triumph, Apex Capital, TAFS, TBS, Thunder Funding, Riviera, Fleet One, and more. Or add your own.

---

## Compliance

### FMCSA Compliance Dashboard
- **Compliance Score** — AI-calculated score based on CSA BASICs
- **Driver Qualification** — CDL expiry, medical card, drug test tracking
- **DVIR History** — Every pre-trip inspection with results
- **Clearinghouse** — Drug & alcohol compliance checks
- **Expiry Alerts** — Auto-notifies before documents expire
- **Audit Ready** — One-click DOT audit package

### HOS Tracking
Tell Q: "Start driving" → Q tracks your 11-hour drive clock.
Tell Q: "How many hours?" → Q tells you remaining drive time.
Tell Q: "Parked" → Q stops the clock and logs the session.
Under 2 hours remaining → Q finds nearby parking and reminds you to shut down.

---

## Lane Intelligence

### Predictive Lane Pricing
Q builds rate intelligence from your load history:
- **Weekly RPM tracking** per lane (origin state → destination state)
- **Trend detection** — rising, falling, or stable
- **Confidence %** — based on how much data Q has
- **Seasonality adjustments** — peak vs slow periods
- **Predicted RPM** — what Q thinks the lane will pay next week

Ask Q: "How's the TX to GA lane?" → Get a card with predicted RPM, trend arrow, sparkline chart, and season note.

The more loads you run, the smarter Q gets on your lanes.

---

## Fleet Management

- **Vehicle Registry** — Year, make, model, VIN, unit number, status
- **Fleet Map** — Real-time GPS tracking
- **Fuel Optimizer** — Find cheapest diesel on your route with loyalty discounts
- **Maintenance Scheduling** — Track service intervals
- **Equipment Manager** — Trailer assignments, inspection history

---

## Driver Management

- **Driver Profiles** — CDL, medical card, pay model, equipment experience
- **Onboarding** — Invite drivers, collect documents, set pay rates
- **Settlement** — Per-load pay calculation (percentage, per-mile, or flat)
- **Performance** — Loads run, revenue, on-time delivery, utilization
- **Contracts** — Digital contract signing

---

## Settings

- **Company Profile** — MC, DOT, address, logo
- **Carrier Settings** — Minimum profit, RPM thresholds, auto-book toggle, SCAC code, truck MPG
- **Factoring Setup** — Select company, set rate, enable/disable
- **Notification Preferences** — SMS, email, push notifications
- **Team Management** — Invite dispatchers, assign roles

---

## Mobile

Qivori automatically switches to the mobile layout on phones. Everything works — pipeline, Q chatbot, load management, invoicing, expenses, compliance. Optimized for one-hand use while on the road.

---

## Plans

| Plan | What You Get |
|------|-------------|
| **TMS Pro** | Full platform — loads, fleet, compliance, invoicing |
| **AI Dispatch** | Q assists — scores loads, negotiates rates, you approve |
| **Autonomous Fleet** | Fully hands-free — Q books, dispatches, calls brokers, invoices |

14-day free trial. No credit card required. Cancel anytime.

---

## Support

- **Q chatbot** — Ask Q anything, 24/7
- **Email** — hello@qivori.com
- **Website** — qivori.com

---

*Q runs your trucking business so you can focus on driving.*
