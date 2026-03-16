export const config = { runtime: 'edge' }

export default async function handler() {
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f0a500"/>
      <stop offset="50%" stop-color="#4d8ef0"/>
      <stop offset="100%" stop-color="#22c55e"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="rgba(240,165,0,0.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0c0f15"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="4" fill="url(#accent)"/>
  <!-- Logo -->
  <text x="490" y="250" font-family="system-ui,sans-serif" font-size="72" font-weight="800" letter-spacing="8" fill="#ffffff">QI</text>
  <text x="620" y="250" font-family="system-ui,sans-serif" font-size="72" font-weight="800" letter-spacing="8" fill="#f0a500">VORI</text>
  <text x="890" y="240" font-family="system-ui,sans-serif" font-size="36" font-weight="700" letter-spacing="2" fill="#4d8ef0">AI</text>
  <!-- Tagline -->
  <text x="600" y="310" font-family="system-ui,sans-serif" font-size="26" font-weight="500" fill="#c8d0dc" text-anchor="middle" letter-spacing="1">The Operating System for Modern Carriers</text>
  <!-- Feature pills -->
  <rect x="85" y="380" width="150" height="40" rx="20" fill="rgba(240,165,0,0.1)" stroke="rgba(240,165,0,0.2)" stroke-width="1"/>
  <text x="160" y="406" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#f0a500" text-anchor="middle">Load Board</text>
  <rect x="260" y="380" width="140" height="40" rx="20" fill="rgba(77,142,240,0.1)" stroke="rgba(77,142,240,0.2)" stroke-width="1"/>
  <text x="330" y="406" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#4d8ef0" text-anchor="middle">Dispatch</text>
  <rect x="425" y="380" width="140" height="40" rx="20" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.2)" stroke-width="1"/>
  <text x="495" y="406" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#22c55e" text-anchor="middle">Fleet GPS</text>
  <rect x="590" y="380" width="110" height="40" rx="20" fill="rgba(240,165,0,0.1)" stroke="rgba(240,165,0,0.2)" stroke-width="1"/>
  <text x="645" y="406" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#f0a500" text-anchor="middle">IFTA</text>
  <rect x="725" y="380" width="100" height="40" rx="20" fill="rgba(77,142,240,0.1)" stroke="rgba(77,142,240,0.2)" stroke-width="1"/>
  <text x="775" y="406" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#4d8ef0" text-anchor="middle">P&amp;L</text>
  <rect x="850" y="380" width="160" height="40" rx="20" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.2)" stroke-width="1"/>
  <text x="930" y="406" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#22c55e" text-anchor="middle">Compliance</text>
  <!-- Bottom URL -->
  <text x="600" y="580" font-family="system-ui,sans-serif" font-size="16" font-weight="500" fill="#6b7590" text-anchor="middle" letter-spacing="2">www.qivori.com</text>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
