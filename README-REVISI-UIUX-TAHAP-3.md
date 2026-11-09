# TARBIYAH — Revisi UI/UX Tahap 3

## Isi pembaruan
- Dashboard umum dengan sapaan netral, carousel utama, grid akses cepat, carousel/feature kedua, dan layout responsif.
- 14 modul tambahan memakai route `module.html?m=...` dengan hero, warna aksen, simbol, dan susunan kartu yang berbeda sesuai fungsi.
- Tema gelap/terang mengikuti fondasi tema yang sudah ada; identitas emerald tetap dipakai sebagai aksen, dipadukan deep teal, navy, ivory, dan gold.
- Logo PNG resmi dirujuk dari `assets/icons/icon-192.png` dan `icon-512.png`; file PNG tidak disertakan di ZIP ini karena aset tersebut sudah berada di Repository pengguna menurut konfirmasi sebelumnya.

## PENTING sebelum deploy
1. Periksa `js/config.js` dan masukkan Project URL serta anon/publishable key milik proyek Supabase TARBIYAH. Jangan pernah memasukkan service_role key ke frontend.
2. Pastikan `assets/icons/icon-192.png` dan `assets/icons/icon-512.png` tetap ada di Repository.
3. Login dan redirect menggunakan `dashboard.html`. `tarbiyah.html` tetap halaman uji Tahap 2 dan tidak digunakan sebagai dashboard produksi.
4. ZIP ini menyiapkan kerangka UI dan navigasi 15 menu. Kartu modul yang menyebut data akan aktif setelah skema tabel, Storage, dan RLS tiap modul diverifikasi. Jangan menganggap fitur transaksi, absensi, unggah media, atau diskusi sudah terhubung ke backend.
5. RBAC backend untuk super_admin/admin/member belum diaktifkan dalam paket ini. Semua sesi login yang valid masih dapat membuka dashboard umum. Menu Administrasi perlu dilindungi di backend sebelum digunakan.
6. Eruda tidak digunakan dalam file produksi pada paket ini.

## Rute
- `dashboard.html` — beranda umum
- `module.html?m=profil|agenda|pembelajaran|materi|kajian|berita|galeri|diskusi|donasi|kehadiran|catatan|notifikasi|riwayat|administrasi` — halaman modul.

## Pengujian yang dilakukan
Pemeriksaan sintaks JavaScript, validitas JSON manifest, referensi rute, dan pemindaian string Eruda dilakukan saat pengemasan. Belum dilakukan browser test di perangkat pengguna, uji end-to-end Supabase, uji RLS, atau deploy Vercel.
