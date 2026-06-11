/* Staffig service worker — Web Push only.
 *
 * Deliberately no fetch/caching layer: Next.js + Clerk own their own caching,
 * and a stale app-shell cache is the classic PWA footgun. Installability no
 * longer requires an offline handler.
 *
 * Push payload contract (see backend notification_dispatcher._push_*):
 *   { title: string, body: string, url: string, tag?: string }
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Staffig";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: payload.tag || undefined,
      data: { url: payload.url || "/worker" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/worker";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // An open Staffig tab/app window: navigate it instead of stacking windows.
        if ("focus" in client && "navigate" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
