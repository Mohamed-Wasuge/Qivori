const CACHE_NAME = 'qivori-v1'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
]

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — network first, fall back to cache (SPA)
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET and API calls
  if (request.method !== 'GET') return
  if (request.url.includes('/api/')) return
  if (request.url.includes('/rest/v1/')) return
  if (request.url.includes('/auth/v1/')) return

  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses for static assets
        if (response.ok && (request.url.endsWith('.js') || request.url.endsWith('.css') || request.url.endsWith('.woff2'))) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(request).then(cached => {
          if (cached) return cached
          // For navigation requests, serve the cached index page (SPA)
          if (request.mode === 'navigate') {
            return caches.match('/')
          }
          return new Response('Offline', { status: 503 })
        })
      })
  )
})

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Qivori AI'
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: data.url || '/',
    vibrate: [200, 100, 200],
    actions: data.actions || [],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes('qivori') && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url)
    })
  )
})
