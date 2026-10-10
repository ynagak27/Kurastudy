// Kura service worker: shows notifications and opens the right lesson when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(self.registration.showNotification(d.title || "Kura", {
    body: d.body || "A new lesson is ready.", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    tag: d.tag || "kura", data: { url: d.url || "/#home" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/#home";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        c.postMessage({ kuraGo: url.split("#")[1] || "home" });
        try { await c.focus(); return; } catch (e) {}
      }
    }
    await self.clients.openWindow(url);
  })());
});
