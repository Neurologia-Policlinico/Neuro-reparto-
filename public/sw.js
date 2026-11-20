// Service worker: notifiche push + installabilità
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Neuro Reparto', body: event.data?.text() } }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Neuro Reparto', {
      body: d.body || 'Nuova attività',
      icon: new URL('icon-192.png', self.registration.scope).href,
      badge: new URL('badge-96.png', self.registration.scope).href,
      tag: d.tag,
      data: { url: d.url || '' },
      vibrate: [120, 60, 120],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  const url = new URL(event.notification.data?.url || '', scope).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(scope)) {
        await c.focus()
        c.postMessage({ tipo: 'apri', url })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
