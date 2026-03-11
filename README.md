# Qivori AI — Freight Intelligence Platform

AI-powered TMS for carriers and brokers. Load board, dispatch, fleet tracking, IFTA, P&L, compliance — all in one place.

**Live:** [qivori.com](https://qivori.com)

## Tech Stack
- React 18 + Vite
- Lucide React icons
- jsPDF for document generation
- Dark theme with accessibility modes (colorblind, high-contrast)

## Roles
- **Carrier** — 35+ modules: AI load board, dispatch, fleet map, IFTA, P&L, compliance, factoring, driver management
- **Broker** — Load posting (FTL/LTL/Partial), carrier directory, live tracking, payments
- **Admin** — Platform overview, carrier network, load board, settings

## Setup
```bash
npm install
npm run dev
# → http://localhost:5173
```

## Build
```bash
npm run build
# Output in /dist — deployed on Vercel
```

## Project Structure
```
src/
├── App.jsx                    # Root + routing + lazy loading
├── index.css                  # Global styles + themes
├── context/
│   ├── AppContext.jsx          # Auth, routing, toast
│   └── CarrierContext.jsx     # Carrier data (loads, invoices, fleet)
├── components/
│   ├── CarrierLayout.jsx      # Carrier TMS shell + sidebar
│   ├── Sidebar.jsx            # Admin/broker sidebar
│   ├── Topbar.jsx             # Header bar
│   └── Toast.jsx              # Notifications
├── pages/
│   ├── LandingPage.jsx        # Public marketing page
│   ├── LoginPage.jsx          # Auth
│   ├── CarrierPages.jsx       # All carrier modules
│   ├── BrokerPages.jsx        # Broker portal
│   ├── Dashboard.jsx          # Admin dashboard
│   └── ...                    # Other admin pages
└── utils/
    └── generatePDF.js         # Invoice/settlement/IFTA PDFs
```
