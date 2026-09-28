/* global self */
// Imported by the generated service worker (vite.config.ts → workbox.importScripts).
// Opens the observation when a "results are ready" notification from the offline queue
// is tapped: focuses an open FieldLens window if there is one, else opens a new one.
self.addEventListener('notificationclick', (event) => {
  const url = event.notification.data && event.notification.data.url;
  event.notification.close();
  if (!url) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        open.postMessage({ type: 'fieldlens:open', url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
