const CACHE_NAME = "tarbiyah-shell-v1";
const APP_SHELL = [
  "./", "./index.html", "./manifest.json",
  "./css/variables.css", "./css/global.css", "./css/theme.css", "./css/splash.css",
  "./js/config.js", "./js/supabase-client.js", "./js/theme-manager.js",
  "./js/auth.js", "./js/splash.js", "./js/pwa.js",
  "./assets/icons/tarbiyah-mark.svg"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("tarbiyah-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))
  )));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Hanya aset shell statis yang dicache. Data akun/API Supabase tidak dicache oleh service worker ini.
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && (request.destination === "style" || request.destination === "script" ||
        request.destination === "image" || url.pathname.endsWith(".html"))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => {
    if (request.mode === "navigate") return caches.match("./index.html");
    throw new Error("Sumber daya tidak tersedia saat offline.");
  })));
});
