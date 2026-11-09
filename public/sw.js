// Deck Kingdom Ops - app shell service worker. Always goes to the network so every change shows
// straight away (no stale copies); only if the phone is offline does it fall back to the last
// copy of the page, so the app at least opens and says it can't connect.
const SHELL = "dk-shell-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.add("/")).catch(() => {})); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || r.mode !== "navigate") return; // data, photos, scripts: straight to the network
  e.respondWith(fetch(r).then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put("/", copy)).catch(() => {}); return res; }).catch(() => caches.match("/")));
});
