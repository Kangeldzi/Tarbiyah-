
/* =========================================================
   TARBIYAH — SERVICE WORKER
   PWA Cache & Application Asset Manager
   Version: 1.0.0
   ========================================================= */

'use strict';

/* ---------------------------------------------------------
   1. KONFIGURASI CACHE
--------------------------------------------------------- */

const SW_VERSION = '1.0.0';

const CACHE_PREFIX = 'tarbiyah-pwa-';
const STATIC_CACHE = `${CACHE_PREFIX}static-${SW_VERSION}`;

/*
  Hanya aset statis yang dimasukkan ke daftar cache.

  Jangan masukkan:
  - Halaman dashboard anggota
  - Halaman profil
  - Halaman administrasi
  - Data pribadi pengguna
  - Respons API Supabase
*/

const STATIC_ASSETS = [
  './manifest.json',

  // CSS
  './css/variables.css',
  './css/global.css',
  './css/theme.css',
  './css/authentication.css',
  './css/splash.css',
  './css/brand-logo.css',
  './css/dashboard.css',
  './css/module.css',
  './css/module-shell.css',
  './css/profil-anggota.css',

  // JavaScript
  './js/supabase-client.js',
  './js/auth.js',
  './js/auth-page.js',
  './js/auth-guard.js',
  './js/theme-manager.js',
  './js/splash.js',
  './js/pwa.js',
  './js/dashboard.js',
  './js/module.js',
  './js/module-shell.js',
  './js/profil-anggota.js',

  // Ikon aplikasi
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];


/* ---------------------------------------------------------
   2. INSTALL SERVICE WORKER
--------------------------------------------------------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);

        /*
          Cache satu per satu.
          Jika satu aset belum tersedia, aset lain tetap
          dapat dimasukkan ke cache.
        */

        await Promise.all(
          STATIC_ASSETS.map(async (asset) => {
            try {
              const response = await fetch(asset, {
                cache: 'reload'
              });

              if (
                response &&
                response.ok &&
                response.type === 'basic'
              ) {
                await cache.put(asset, response);
              }
            } catch (error) {
              console.warn(
                '[TARBIYAH SW] Aset tidak dapat di-cache:',
                asset
              );
            }
          })
        );

        console.info(
          '[TARBIYAH SW] Instalasi selesai.'
        );

      } catch (error) {
        console.error(
          '[TARBIYAH SW] Instalasi gagal:',
          error
        );
      }
    })()
  );
});


/* ---------------------------------------------------------
   3. AKTIVASI SERVICE WORKER
--------------------------------------------------------- */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();

        await Promise.all(
          cacheNames.map(async (cacheName) => {
            const isOldTarbiyahCache =
              cacheName.startsWith(CACHE_PREFIX) &&
              cacheName !== STATIC_CACHE;

            if (isOldTarbiyahCache) {
              await caches.delete(cacheName);
            }
          })
        );

        /*
          Mengaktifkan Service Worker terbaru
          untuk seluruh halaman dalam scope.
        */

        await self.clients.claim();

        console.info(
          '[TARBIYAH SW] Aktivasi berhasil.'
        );

      } catch (error) {
        console.error(
          '[TARBIYAH SW] Aktivasi gagal:',
          error
        );
      }
    })()
  );
});


/* ---------------------------------------------------------
   4. PESAN DARI HALAMAN APLIKASI
--------------------------------------------------------- */

self.addEventListener('message', (event) => {
  const message = event.data;

  if (!message || typeof message !== 'object') {
    return;
  }

  /*
    Digunakan oleh js/pwa.js untuk mengaktifkan
    versi Service Worker yang baru.
  */

  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


/* ---------------------------------------------------------
   5. PEMERIKSAAN PERMINTAAN YANG BOLEH DI-CACHE
--------------------------------------------------------- */

function isSafeStaticRequest(request, url) {
  if (!request || request.method !== 'GET') {
    return false;
  }

  // Hanya domain aplikasi sendiri.
  if (url.origin !== self.location.origin) {
    return false;
  }

  // Jangan cache halaman HTML atau navigasi.
  if (
    request.mode === 'navigate' ||
    request.destination === 'document'
  ) {
    return false;
  }

  // Jangan cache endpoint backend atau autentikasi.
  const blockedPaths = [
    '/rest/v1/',
    '/auth/v1/',
    '/storage/v1/',
    '/functions/v1/',
    '/realtime/v1/'
  ];

  if (
    blockedPaths.some((path) =>
      url.pathname.includes(path)
    )
  ) {
    return false;
  }

  // Jangan cache URL yang memiliki parameter query.
  if (url.search) {
    return false;
  }

  // Hanya tipe aset statis yang diizinkan.
  const allowedExtensions = [
    '.css',
    '.js',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.json'
  ];

  return allowedExtensions.some((extension) =>
    url.pathname.toLowerCase().endsWith(extension)
  );
}


/* ---------------------------------------------------------
   6. PEMERIKSAAN RESPONS
--------------------------------------------------------- */

function isSafeResponse(response) {
  if (!response || !response.ok) {
    return false;
  }

  /*
    Hanya respons dari origin sendiri.
    Respons opaque dan respons lintas domain
    tidak disimpan.
  */

  if (response.type !== 'basic') {
    return false;
  }

  const cacheControl =
    response.headers.get('Cache-Control') || '';

  if (
    /no-store/i.test(cacheControl) ||
    /private/i.test(cacheControl)
  ) {
    return false;
  }

  return true;
}


/* ---------------------------------------------------------
   7. FETCH HANDLER
--------------------------------------------------------- */

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (!request) {
    return;
  }

  let url;

  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  /*
    Permintaan yang tidak memenuhi syarat
    dibiarkan berjalan langsung melalui browser.

    Dengan demikian, halaman anggota, login,
    profil, administrasi, dan API Supabase
    tidak ditangani oleh cache Service Worker.
  */

  if (!isSafeStaticRequest(request, url)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);

      /*
        Cache-first:
        1. Cari aset dalam cache.
        2. Jika tersedia, gunakan cache.
        3. Jika tidak tersedia, ambil dari jaringan.
        4. Simpan respons aman ke cache.
      */

      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);

        if (isSafeResponse(networkResponse)) {
          await cache.put(
            request,
            networkResponse.clone()
          );
        }

        return networkResponse;

      } catch (error) {
        console.warn(
          '[TARBIYAH SW] Aset tidak tersedia:',
          request.url
        );

        /*
          Tidak ada fallback halaman HTML.
          Jika aset belum pernah di-cache dan
          jaringan terputus, browser akan menerima
          respons gagal dari permintaan jaringan.
        */

        return new Response(
          'Aset TARBIYAH tidak tersedia. Periksa koneksi internet.',
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          }
        );
      }
    })()
  );
});


/* ---------------------------------------------------------
   8. NOTIFIKASI ERROR
--------------------------------------------------------- */

self.addEventListener('error', (event) => {
  console.error(
    '[TARBIYAH SW] Kesalahan:',
    event.message || event
  );
});


/* ---------------------------------------------------------
   9. NOTIFIKASI UNHANDLED REJECTION
--------------------------------------------------------- */

self.addEventListener(
  'unhandledrejection',
  (event) => {
    console.error(
      '[TARBIYAH SW] Promise gagal:',
      event.reason
    );
  }
);

console.info(
  `[TARBIYAH SW] Service Worker ${SW_VERSION} aktif.`
);
