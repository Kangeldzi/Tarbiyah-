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
