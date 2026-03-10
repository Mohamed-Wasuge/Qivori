# FreightMind AI — React App

## Project Structure
```
freightmindai/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx              # Entry point
    ├── App.jsx               # Root component + routing
    ├── index.css             # Global styles
    ├── context/
    │   └── AppContext.jsx    # Global state (role, page, toast)
    ├── components/
    │   ├── Sidebar.jsx       # Left nav with role-based menu
    │   ├── Topbar.jsx        # Top header bar
    │   └── Toast.jsx         # Notification toasts
    └── pages/
        ├── LoginPage.jsx     # Login with 3 role tabs
        ├── Dashboard.jsx     # Admin dashboard
        ├── LoadBoard.jsx     # Live load board
        ├── Carriers.jsx      # Carrier network
        ├── MorePages.jsx     # Shippers, Payments, Documents
        └── ExtraPages.jsx    # Onboarding, AI Engine, Settings,
                              # PostLoad, MyLoads, Tracking
```

## Setup (takes ~2 minutes)

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Install & Run
```bash
# 1. Navigate to project folder
cd freightmindai

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev

# App runs at http://localhost:5173
```

### Build for Production
```bash
npm run build
# Output in /dist folder — deploy to Netlify, Vercel, etc.
```

## Features
- **3 Role Types**: Admin, Shipper, Carrier — each with own nav + pages
- **12 Pages**: Dashboard, Load Board, Carriers, Shippers, Payments, Documents, AI Engine, Carrier Onboarding, Settings, Post Load, My Shipments, Live Tracking
- **Mobile Responsive**: Hamburger menu, collapsible sidebar, responsive grids
- **Toast Notifications**: Action feedback throughout the app
- **iOS Safari Compatible**: No template literals, safe JS

## Next Steps (Backend Integration)
When ready to add real data:

1. **Authentication**: Replace demo login with Clerk or Auth0
2. **Database**: Add Supabase or PostgreSQL for real load/carrier data
3. **API Layer**: Build Express or FastAPI backend
4. **SMS**: Connect Twilio for real carrier notifications
5. **Payments**: Connect Stripe for invoices + payouts
6. **AI**: Connect Anthropic Claude API for matching engine

## Tech Stack
- React 18
- Vite
- Pure CSS (no Tailwind needed — all styles in index.css)
- No external UI library dependencies
