const CACHE_NAME = 'qivori-v2'
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
]
const OFFLINE_QUEUE_KEY = 'qivori-offline-queue'

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Push notification received
self.addEventListener('push', (event) => {
  let data = { title: 'Qivori AI', body: 'You have a new notification', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-192.png',
      tag: data.tag || 'qivori-notification',
      data: data.url || '/',
      actions: data.actions || [],
      vibrate: [200, 100, 200],
    })
  )
})

// Notification click — open app or focus existing tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if found
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Open new tab
      return self.clients.openWindow(url)
    })
  )
})

// Fetch — network first, fallback to cache; queue POST requests when offline
self.addEventListener('fetch', (event) => {
  const { request } = event
  const isAPI = request.url.includes('/api/')

  // Handle POST API requests — queue when offline
  if (request.method === 'POST' && isAPI) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        // Offline — queue the request for later
        try {
          const body = await request.clone().text()
          const queueItem = {
            url: request.url,
            body,
            headers: { 'Content-Type': 'application/json' },
            timestamp: Date.now(),
          }

          // Open IndexedDB to store queued requests
          const db = await openDB()
          const tx = db.transaction('queue', 'readwrite')
          tx.objectStore('queue').add(queueItem)
        } catch {}

        return new Response(JSON.stringify({
          success: true,
          offline: true,
          message: 'Saved offline — will sync when back online',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
    )
    return
  }

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip API GET requests (don't cache them)
  if (isAPI) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  )
})

// Sync queued requests when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'qivori-sync') {
    event.waitUntil(replayQueue())
  }
})

// Also replay on activation / when online
self.addEventListener('message', (event) => {
  if (event.data === 'replay-queue') {
    replayQueue()
  }
})

async function replayQueue() {
  try {
    const db = await openDB()
    const tx = db.transaction('queue', 'readwrite')
    const store = tx.objectStore('queue')
    const all = await storeGetAll(store)

    for (const item of all) {
      try {
        await fetch(item.url, {
          method: 'POST',
          headers: item.headers,
          body: item.body,
        })
        // Delete from queue on success
        const delTx = db.transaction('queue', 'readwrite')
        delTx.objectStore('queue').delete(item.id)
      } catch {
        // Still offline — leave in queue
        break
      }
    }
  } catch {}
}

// Simple IndexedDB helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('qivori-offline', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function storeGetAll(store) {
  return new Promise((resolve) => {
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => resolve([])
  })
}
