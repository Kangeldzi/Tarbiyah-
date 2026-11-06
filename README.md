# TARBIYAH — Tahap 1: Fondasi Aplikasi

## Isi tahap
- Splash screen animatif dan welcome overlay berbahasa Indonesia.
- Pemeriksaan sesi Supabase Auth (fondasi; halaman autentikasi dibuat pada Tahap 2).
- Tema global terang/gelap/sistem.
- Manifest dan service worker PWA dasar.
- Struktur aset dan ikon SVG awal.

## Cara menjalankan
1. Ekstrak folder proyek.
2. Buka folder menggunakan server lokal (contoh: VS Code Live Server) atau hosting HTTPS.
3. Buat proyek Supabase.
4. Buka `js/config.js`, isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` dengan Project URL dan anon/public key.
5. Jangan pernah menaruh `service_role` key di frontend.
6. Buka `index.html` melalui server lokal/HTTPS, bukan mengandalkan `file://`.

## Catatan
- Tombol "Masuk Sekarang" sengaja menahan navigasi bila Supabase belum dikonfigurasi. Tahap 2 akan membuat `login-register.html`.
- Branding dinamis (logo dan nama aplikasi yang dapat diubah admin) akan dibangun sebagai pengaturan identitas aplikasi di Tahap Admin, lalu diterapkan lintas halaman.
- Data pribadi, data Supabase, dan bukti transaksi tidak dimasukkan ke cache service worker.
- Service worker ini adalah fondasi cache shell, belum merupakan implementasi offline penuh atau push notification.
- Galeri album foto/video, feed media dashboard, ekspor Excel/CSV, peta agenda Google Maps, serta riwayat anggota merupakan persyaratan tetap pada tahap modul terkait.
