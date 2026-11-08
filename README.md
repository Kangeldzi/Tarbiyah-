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

# TARBIYAH — Fondasi Aplikasi

Paket ini menggabungkan fondasi Tahap 1 dan autentikasi Tahap 2, lalu menambahkan kerangka Dashboard Utama Tahap 3. Baca `README-INTEGRASI-TAHAP-3.md` sebelum deployment.

Halaman produksi setelah login adalah `dashboard.html`. File `tarbiyah.html` tidak disertakan karena hanya halaman uji sementara.

# TARBIYAH — Paket Integrasi Fondasi + Dashboard Tahap 3

## Penetapan file
- Halaman produksi setelah login: `dashboard.html`.
- `tarbiyah.html` Tahap 2 adalah halaman uji sementara dan tidak disalin ke paket produksi.
- `js/auth-guard.js` ditambahkan untuk melindungi dashboard dari sesi yang tidak valid.
- `css/dashboard.css` dan `js/dashboard.js` ditambahkan untuk UI dashboard.
- Logo lama `tarbiyah-mark.svg` tidak lagi dipakai oleh halaman produksi; file lama dipertahankan sementara untuk rollback/audit.

## Sebelum deploy
1. Pastikan file logo resmi tersedia di `assets/icons/icon-192.png` dan `assets/icons/icon-512.png` pada repository. Paket ZIP sumber Tahap 1/2 yang diaudit tidak menyertakan kedua PNG tersebut; file tersebut sebelumnya dinyatakan sudah ada di repository GitHub.
2. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `js/config.js` dengan Project URL dan anon/publishable key. Jangan pernah gunakan `service_role` atau secret key di frontend.
3. Di Supabase Authentication → URL Configuration, tambahkan URL produksi `https://<domain-anda>/dashboard.html` dan `https://<domain-anda>/login-register.html?mode=recovery` ke Redirect URLs. Sesuaikan Site URL dengan domain deployment.
4. Pastikan Google Fonts dan CDN Supabase dapat diakses, atau siapkan strategi self-host jika nanti diperlukan.
5. Deploy melalui HTTPS. Setelah update service worker, lakukan reload dan bila perlu hapus cache lama aplikasi dari browser.

## Batas integrasi saat ini
- Dashboard Tahap 3 merupakan kerangka UI yang sudah memiliki navigasi responsif, tema, carousel, identitas sesi, dan logout.
- Kartu Agenda, Anggota, Materi, Berita, dan Dokumentasi saat ini menampilkan status kosong yang jujur; belum ada query data karena skema tabel untuk modul-modul tersebut belum diaudit. Tidak ada data contoh palsu.
- Tidak ada SQL baru, perubahan RLS, perubahan role, atau mutasi akun dalam paket ini.
- `manifest.json` menggunakan ikon PNG dengan purpose `any`; tidak mengklaim `maskable` karena safe-zone gambar belum diperiksa.
- Service worker hanya menyimpan aset shell eksplisit. Dokumen navigasi, halaman login/dashboard, dan respons API tidak disimpan ke cache.

## File produksi utama
`index.html`, `login-register.html`, `dashboard.html`, `manifest.json`, `service-worker.js`, `css/*`, `js/*`, `assets/icons/*`.
