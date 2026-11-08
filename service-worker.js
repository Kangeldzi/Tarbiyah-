const CACHE_NAME = "tarbiyah-shell-v4";
const SHELL_FILES = [
  "./index.html", "./dashboard.html", "./module.html", "./manifest.json",
  "./css/variables.css", "./css/global.css", "./css/theme.css", "./css/splash.css", "./css/dashboard.css", "./css/module.css",
  "./js/supabase-client.js", "./js/theme-manager.js", "./js/auth.js", "./js/auth-guard.js", "./js/dashboard.js", "./js/module.js", "./js/splash.js", "./js/pwa.js",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("tarbiyah-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Dokumen navigasi (termasuk login dan dashboard) selalu lewat jaringan; tidak disimpan cache.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }
  const allowed = SHELL_FILES.some(path => new URL(path, self.location.href).pathname === url.pathname);
  if (!allowed) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy)); }
    return response;
  })));
});
