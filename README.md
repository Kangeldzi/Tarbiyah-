# TARBIYAH — Paket Fondasi Revisi

## Standar logo induk
Logo di `dashboard.html` dan `login-register.html` menjadi acuan. Standar bersama berada di `css/brand-logo.css`: 42×42 px, rasio 1:1, `object-fit:contain`, tanpa bingkai/padding/shadow tambahan, jarak 12 px. Semua halaman harus memakai PNG resmi `assets/icons/icon-192.png`; favicon/PWA memakai icon-192 dan icon-512.

## Konfigurasi wajib sebelum uji
Isi `js/config.js` dengan URL proyek Supabase dan anon/publishable key publik milik proyek Anda. Jangan gunakan `service_role` di browser. File konfigurasi saat ini sengaja berisi placeholder karena kredensial proyek tidak tersedia di arsip.

## Aset logo
Salin aset PNG resmi dari repository Anda ke:
- `assets/icons/icon-192.png`
- `assets/icons/icon-512.png`

Kedua file PNG tidak tersedia di ZIP sumber yang diaudit, sehingga tidak dibuat logo pengganti.

## Catatan status
Paket ini memperbarui fondasi tema, jalur dashboard, manifest, dan standar logo. Ini belum berarti 14 modul telah selesai atau backend modul telah tersambung. Skema tabel, Storage, RLS, dan hak akses modul perlu dirancang serta diverifikasi terhadap proyek Supabase yang sudah ada sebelum migrasi produksi. Jangan jalankan SQL perubahan produksi tanpa persetujuan.

## Rute utama
- `index.html` — splash
- `login-register.html` — autentikasi
- `dashboard.html` — dashboard produksi
- `tarbiyah.html` — tidak digunakan sebagai dashboard produksi
