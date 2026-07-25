/*
 * Service Worker: (1) zeigt Web-Push-Benachrichtigungen an (send-reminders) und
 * öffnet beim Antippen die App, (2) cacht die App-Shell, damit die installierte
 * App offline startet statt eine Browser-Fehlerseite zu zeigen.
 *
 * Nicht gecacht werden Supabase-Aufrufe (fremder Origin, dynamisch) — die
 * Daten selbst hält src/lib/snapshot.ts als Momentaufnahme im localStorage.
 *
 * Im Dev-Server ist das Caching aus (Registrierung mit `?dev=1`, siehe
 * src/lib/push.ts) — es würde Vites HMR abfangen. Push funktioniert trotzdem.
 */

const CACHE = 'shell-v1'
const DEV = new URL(self.location.href).searchParams.has('dev')

// Relative URLs lösen gegen den SW-Pfad auf, also den App-Basispfad
// (/jw-congregation-planner/ auf GitHub Pages, / im Dev).
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'logo.svg', 'icon-192.png']
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (event) => {
  if (DEV) return
  // Fehlt eine Datei, soll die Installation nicht komplett scheitern.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
})

/** Aus dem Netz holen und (nur erfolgreiche Antworten) in den Cache legen. */
async function fromNetwork(request) {
  const res = await fetch(request)
  if (res && (res.ok || res.type === 'opaque')) {
    const cache = await caches.open(CACHE)
    void cache.put(request, res.clone())
  }
  return res
}

/** Cache zuerst — für unveränderliche Dateien (gehashte Assets, Schriften). */
async function cacheFirst(request) {
  const hit = await caches.match(request)
  if (hit) return hit
  return fromNetwork(request)
}

/** Netz zuerst, Cache als Rückfall — für HTML und selten geänderte Dateien. */
async function networkFirst(request, fallbackUrl) {
  try {
    return await fromNetwork(request)
  } catch (err) {
    const hit = await caches.match(request)
    if (hit) return hit
    if (fallbackUrl) {
      const shell = await caches.match(fallbackUrl)
      if (shell) return shell
    }
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  if (DEV) return
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // Seitenaufruf (auch der Start der installierten App): immer die aktuelle
  // Fassung versuchen, offline die gecachte Shell ausliefern.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, new URL('index.html', self.registration.scope).href))
    return
  }

  if (url.origin === self.location.origin) {
    // Vite-Assets tragen einen Inhalts-Hash im Namen → unveränderlich.
    if (url.pathname.includes('/assets/')) {
      event.respondWith(cacheFirst(request))
    } else {
      event.respondWith(networkFirst(request))
    }
    return
  }

  // Schriften (Google Fonts) offline verfügbar halten; ohne sie fällt die
  // Typografie auf System-Schriften zurück. Alles andere (Supabase!) läuft
  // ungefiltert durch — kein respondWith.
  if (FONT_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(request))
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* kein JSON-Payload → Standardtexte */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'JW Congregation Planner', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: data.url || '.' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '.'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    }),
  )
})
