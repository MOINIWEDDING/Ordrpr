// Service worker: recibe los avisos push del local y los muestra aunque la página esté cerrada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
  event.waitUntil((async () => {
    // si el cliente está mirando la página, ya ve el aviso dentro de la app: no se duplica
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible')) return;
    await self.registration.showNotification(d.title || 'Tu pedido', {
      body: d.body || '',
      icon: d.icon || undefined,
      badge: d.badge || undefined,
      tag: d.tag || 'pedido',
      renotify: true,
      data: { url: d.url || '/pedidos' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/pedidos';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); if ('navigate' in w) { try { await w.navigate(url); } catch (e) { /* ignore */ } } return; }
    }
    await self.clients.openWindow(url);
  })());
});
