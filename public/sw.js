/*
 * Service Worker: zeigt Web-Push-Benachrichtigungen an (send-reminders) und
 * öffnet beim Antippen die App. Kein Caching — die App bleibt online-first.
 */

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
