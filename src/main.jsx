import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: window.location.hostname === 'www.qivori.com' || window.location.hostname === 'qivori.com' ? 'production' : 'staging',
    release: 'qivori@1.0.0',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// ─── PWA Update Prompt ──────────────────────────────────────
// When a new service worker is waiting, show a non-intrusive update banner
window.addEventListener('sw-update-available', (e) => {
  const reg = e.detail?.registration
  if (!reg) return

  // Create update banner
  const banner = document.createElement('div')
  banner.id = 'sw-update-banner'
  banner.setAttribute('style', [
    'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:100000', 'background:#1a1f2a', 'border:1px solid rgba(240,165,0,0.3)',
    'border-radius:12px', 'padding:12px 20px', 'display:flex', 'align-items:center',
    'gap:12px', 'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
    'font-family:DM Sans,system-ui,sans-serif', 'max-width:360px', 'width:calc(100% - 32px)',
  ].join(';'))

  banner.innerHTML = `
    <div style="flex:1">
      <div style="font-size:13px;font-weight:700;color:#e8ecf2">New version available</div>
      <div style="font-size:11px;color:#6b7590;margin-top:2px">Tap reload to update Qivori</div>
    </div>
    <button id="sw-update-btn" style="padding:8px 16px;font-size:12px;font-weight:700;background:#f0a500;color:#0a0a0e;border:none;border-radius:8px;cursor:pointer;font-family:DM Sans,system-ui,sans-serif;white-space:nowrap">Reload</button>
    <button id="sw-dismiss-btn" style="padding:4px 8px;font-size:16px;background:none;border:none;color:#6b7590;cursor:pointer;line-height:1">&times;</button>
  `

  document.body.appendChild(banner)

  document.getElementById('sw-update-btn').addEventListener('click', () => {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    window.location.reload()
  })

  document.getElementById('sw-dismiss-btn').addEventListener('click', () => {
    banner.remove()
  })
})

// Remove boot loader after React has painted (not just called render)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const boot = document.getElementById('boot-loader')
    if (boot) boot.remove()
  })
})
