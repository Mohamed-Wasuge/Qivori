// Qivori AI — Service Worker
// Cache versioning: bump CACHE_VERSION to force update
const CACHE_VERSION = 98
const STATIC_CACHE = `qivori-static-v${CACHE_VERSION}`
const RUNTIME_CACHE = `qivori-runtime-v${CACHE_VERSION}`
const OFFLINE_URL = '/offline.html'

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
]

// File extensions that should use cache-first strategy
const CACHE_FIRST_EXTENSIONS = ['.js', '.css', '.woff', '.woff2', '.ttf', '.eot', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico']

// Domains/paths that are API calls (network-first)
const API_PATTERNS = ['/api/', '/rest/v1/', '/auth/v1/', '/storage/v1/', '/functions/v1/']

// ─── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// ─── ACTIVATE ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )

  // Notify all clients that a new version is active
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION })
    })
  })
})

// ─── FETCH ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle GET requests
  if (request.method !== 'GET') return

  // Skip chrome-extension and other non-http(s) schemes
  if (!url.protocol.startsWith('http')) return

  // API calls: network-first with no caching
  if (API_PATTERNS.some(p => url.pathname.includes(p))) {
    event.respondWith(networkFirstForAPI(request))
    return
  }

  // Static assets: cache-first
  if (CACHE_FIRST_EXTENSIONS.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith(cacheFirstForStatic(request))
    return
  }

  // Navigation requests (HTML pages): network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstForNavigation(request))
    return
  }

  // Everything else: network-first, cache fallback
  event.respondWith(networkFirstForAPI(request))
})

// Cache-first for static assets (JS, CSS, images, fonts)
// But always fetch fresh for hashed Vite bundles (they have new hashes on each build)
async function cacheFirstForStatic(request) {
  const url = new URL(request.url)
  const isHashedAsset = url.pathname.includes('/assets/') && /[-_][A-Za-z0-9]{8,}\.(js|css)$/.test(url.pathname)
  if (!isHashedAsset) {
    const cached = await caches.match(request)
    if (cached) return cached
  }

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Network failed — try cache as fallback
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
  }
}

// Network-first for API calls
async function networkFirstForAPI(request) {
  try {
    return await fetch(request)
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Network-first for navigation with offline fallback page
async function networkFirstForNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    // Serve the offline page
    const offlinePage = await caches.match(OFFLINE_URL)
    if (offlinePage) return offlinePage
    return new Response('Offline', { status: 503 })
  }
}

// ─── BACKGROUND SYNC ────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'qivori-sync') {
    event.waitUntil(replayQueuedMessages())
  }
})

// Listen for manual replay trigger from the client
self.addEventListener('message', (event) => {
  if (event.data === 'replay-queue') {
    replayQueuedMessages()
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function replayQueuedMessages() {
  // Open IndexedDB queue and replay pending messages
  try {
    const db = await openQueueDB()
    const tx = db.transaction('outbox', 'readwrite')
    const store = tx.objectStore('outbox')
    const allKeys = await idbGetAllKeys(store)

    for (const key of allKeys) {
      const entry = await idbGet(store, key)
      if (!entry) continue
      try {
        await fetch(entry.url, {
          method: entry.method || 'POST',
          headers: entry.headers || { 'Content-Type': 'application/json' },
          body: entry.body,
        })
        store.delete(key)
      } catch {
        // Still offline, leave in queue
        break
      }
    }
  } catch {
    // IndexedDB not available or empty — nothing to replay
  }
}

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('qivori-offline-queue', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('outbox', { autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGetAllKeys(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Qivori AI'
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 192 192%27%3E%3Crect width=%27192%27 height=%27192%27 rx=%2738%27 fill=%27%230a0a0e%27/%3E%3Ctext x=%2796%27 y=%27130%27 font-size=%27100%27 font-weight=%27bold%27 font-family=%27system-ui%27 fill=%27%23f0a500%27 text-anchor=%27middle%27%3EQ%3C/text%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 96 96%27%3E%3Crect width=%2796%27 height=%2796%27 rx=%2720%27 fill=%27%230a0a0e%27/%3E%3Ctext x=%2748%27 y=%2768%27 font-size=%2752%27 font-weight=%27bold%27 font-family=%27system-ui%27 fill=%27%23f0a500%27 text-anchor=%27middle%27%3EQ%3C/text%3E%3C/svg%3E',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    actions: data.actions || [],
    tag: data.tag || 'qivori-notification',
    renotify: !!data.tag,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ─── NOTIFICATION CLICK ─────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window if open
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url)
    })
  )
})
