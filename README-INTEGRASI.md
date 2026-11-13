
# TARBIYAH — Pembelajaran Muslim

**Belajar, Bertumbuh, dan Berukhuwah.**

TARBIYAH adalah aplikasi pembelajaran dan komunitas Muslim berbasis Progressive Web App (PWA), dengan Supabase sebagai backend.

---

## 1. Teknologi

- HTML5
- CSS3
- JavaScript
- Supabase Authentication
- Supabase Database
- Supabase Storage
- Progressive Web App (PWA)
- Service Worker
- Responsive Mobile-First Design

## 2. Struktur Folder Proyek

```text
TARBIYAH/
│
├── index.html
├── login-register.html
├── tarbiyah.html
├── dashboard.html
├── module.html
├── profil-anggota.html
│
├── agenda-tarbiyah.html
├── pembelajaran.html
├── materi-pembelajaran.html
├── berita-pengumuman.html
├── presensi-tarbiyah.html
├── galeri-foto-video.html
├── diskusi-tarbiyah.html
├── donasi-infaq.html
├── kehadiran.html
├── catatan-refleksi.html
├── notifikasi.html
├── riwayat-aktivitas.html
├── administrasi-pengaturan.html
│
├── manifest.json
├── service-worker.js
├── README-INTEGRASI.md
│
├── css/
│   ├── variables.css
│   ├── global.css
│   ├── theme.css
│   ├── authentication.css
│   ├── splash.css
│   ├── brand-logo.css
│   ├── dashboard.css
│   ├── module.css
│   ├── module-shell.css
│   └── profil-anggota.css
│
├── js/
│   ├── config.js
│   ├── supabase-client.js
│   ├── auth.js
│   ├── auth-page.js
│   ├── auth-guard.js
│   ├── theme-manager.js
│   ├── splash.js
│   ├── pwa.js
│   ├── dashboard.js
│   ├── module.js
│   ├── module-shell.js
│   └── profil-anggota.js
│
└── assets/
    └── icons/
        ├── icon-192.png
        └── icon-512.png
```

Catatan:
- Struktur di atas merupakan susunan target integrasi.
- File yang belum tersedia harus dibuat sebelum halaman yang menggunakannya dinyatakan selesai.
- Jangan menghapus file lama yang sudah terbukti berfungsi tanpa pemeriksaan terlebih dahulu.

---

## 3. Fungsi File Utama

| File | Fungsi |
|---|---|
| index.html | Halaman pembuka aplikasi |
| login-register.html | Masuk dan pendaftaran anggota |
| tarbiyah.html | Halaman utama setelah login |
| dashboard.html | Dashboard aplikasi |
| profil-anggota.html | Profil dan informasi anggota |
| module.html | Halaman modul dinamis |
| manifest.json | Konfigurasi PWA |
| service-worker.js | Cache aset statis PWA |

## 4. Fungsi Folder CSS

| File | Tanggung Jawab |
|---|---|
| variables.css | Variabel warna, ukuran, dan desain |
| global.css | Reset dan komponen dasar |
| theme.css | Tampilan tema gelap dan terang |
| authentication.css | Tampilan autentikasi |
| splash.css | Tampilan splash screen |
| brand-logo.css | Logo dan identitas aplikasi |
| dashboard.css | Tampilan dashboard |
| module.css | Tampilan isi modul |
| module-shell.css | Sidebar, header, dan navigasi |
| profil-anggota.css | Tampilan profil anggota |

## 5. Fungsi Folder JavaScript

| File | Tanggung Jawab |
|---|---|
| config.js | Konfigurasi Supabase |
| supabase-client.js | Inisialisasi Supabase Client |
| auth.js | Fungsi autentikasi |
| auth-page.js | Interaksi halaman login/register |
| auth-guard.js | Pemeriksaan sesi dan perlindungan halaman |
| theme-manager.js | Pengaturan tema aplikasi |
| splash.js | Animasi dan navigasi splash screen |
| pwa.js | Registrasi dan pengelolaan PWA |
| dashboard.js | Interaksi dashboard |
| module.js | Registry dan pengelolaan modul |
| module-shell.js | Sidebar dan navigasi |
| profil-anggota.js | Pengelolaan profil anggota |

---

## 6. Urutan Pemuatan Script

### A. Halaman Splash

Urutan yang direkomendasikan:

1. Supabase SDK CDN apabila dibutuhkan halaman.
2. `js/config.js`
3. `js/supabase-client.js`
4. `js/theme-manager.js`
5. `js/splash.js`
6. `js/pwa.js`

### B. Halaman Login dan Register

Urutan yang direkomendasikan:

1. Supabase SDK CDN.
2. `js/config.js`
3. `js/supabase-client.js`
4. `js/theme-manager.js`
5. `js/auth.js`
6. `js/auth-page.js`
7. `js/pwa.js`

### C. Halaman Anggota yang Memerlukan Login

Urutan yang direkomendasikan:

1. Supabase SDK CDN.
2. `js/config.js`
3. `js/supabase-client.js`
4. `js/auth.js`
5. `js/auth-guard.js`
6. `js/theme-manager.js`
7. `js/module.js`
8. `js/module-shell.js`
9. Script khusus halaman.
10. `js/pwa.js`

**Penting:** Pastikan nama file dan urutan pemuatan sesuai dengan file HTML yang sebenarnya. Jangan memasukkan script yang sama dua kali.

---

## 7. Alur Aplikasi

```text
PENGGUNA MEMBUKA APLIKASI
            |
            v
       index.html
            |
            v
       Splash Screen
            |
            v
      Masuk Sekarang
            |
            v
   login-register.html
            |
            v
    Supabase Authentication
            |
       +----+----+
       |         |
       v         v
   Berhasil    Gagal
       |         |
       v         v
  tarbiyah.html  Pesan Error
       |
       v
  Pemeriksaan Sesi
       |
       v
  Dashboard Anggota
       |
       +--------------------+
       |         |          |
       v         v          v
     Profil   Agenda     Pembelajaran
       |         |          |
       v         v          v
   Kehadiran  Presensi    Materi
       |
       v
   Riwayat Anggota
```

Diagram tersebut merupakan alur target. Perilaku aktual setiap halaman harus diverifikasi setelah seluruh file terintegrasi.

---

## 8. Konfigurasi Supabase

Konfigurasi frontend disimpan di:

`js/config.js`

Contoh struktur konfigurasi:

```javascript
window.TARBIYAH_CONFIG = {
  SUPABASE_URL: 'https://PROJECT_ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_PUBLISHABLE_KEY'
};
```

Gunakan URL dan publishable key milik proyek TARBIYAH sendiri.

**Larangan keamanan:**

- Jangan menaruh `service_role` key di HTML.
- Jangan menaruh `service_role` key di JavaScript frontend.
- Jangan menyimpan password pengguna di localStorage.
- Jangan menonaktifkan RLS untuk mengatasi masalah akses.
- Jangan menjadikan data anggota dapat dibaca publik tanpa kebutuhan dan kebijakan akses yang jelas.

File `config.js` boleh berisi konfigurasi publik untuk aplikasi browser, bukan kredensial rahasia backend.

---

## 9. Prinsip Keamanan Database

Setiap tabel Supabase harus memiliki kebijakan Row Level Security (RLS) sesuai kebutuhan.

Contoh pembagian akses:

| Data | Anggota | Admin |
|---|---|---|
| Profil sendiri | Baca dan ubah sesuai kebijakan | Kelola sesuai kewenangan |
| Profil anggota lain | Akses terbatas | Kelola sesuai kewenangan |
| Agenda | Baca sesuai kebijakan | Kelola |
| Presensi | Lihat riwayat sendiri | Kelola sesuai kewenangan |
| Materi | Baca sesuai hak akses | Kelola |
| Berita | Baca sesuai hak akses | Kelola |
| Galeri | Baca sesuai hak akses | Unggah dan kelola |
| Administrasi | Tidak otomatis mendapat akses | Akses berdasarkan role |

Kebijakan di atas merupakan rancangan akses, bukan pengganti SQL RLS yang harus diterapkan dan diuji pada setiap tabel.

---

## 10. Pengelolaan PWA

File yang mengatur PWA:

- `manifest.json`
- `service-worker.js`
- `js/pwa.js`

Service Worker hanya menyimpan aset statis yang telah diizinkan.

Hal-hal yang tidak boleh dimasukkan ke cache publik:

- Respons Supabase Auth.
- Data profil pribadi.
- Data presensi anggota.
- Data administrasi.
- File privat.
- Respons database yang mengandung informasi pengguna.

PWA tidak otomatis berarti seluruh fitur dapat digunakan tanpa internet. Fitur yang membutuhkan Supabase tetap memerlukan koneksi.

---

## 11. Identitas dan Tema Aplikasi

Tema utama TARBIYAH menggunakan warna emerald.

Pengelolaan tema dilakukan melalui:

`js/theme-manager.js`

Tema yang direncanakan:

- Dark Mode
- Light Mode
- System Mode

Identitas logo dan nama aplikasi harus menggunakan satu sumber konfigurasi agar perubahan identitas dapat diterapkan secara konsisten pada halaman-halaman aplikasi.

---

## 12. Fitur Utama yang Dikembangkan

### A. Dashboard
- Ringkasan aktivitas.
- Carousel informasi.
- Anggota Tarbiyah.
- Jadwal agenda.
- Daftar judul tema.
- Berita dan pengumuman.
- Dokumentasi foto dan video.

### B. Profil Anggota
- Identitas anggota.
- Foto profil.
- Status keanggotaan.
- QR anggota.
- Riwayat kehadiran.
- Riwayat kajian.

### C. Agenda dan Jadwal
- Daftar agenda.
- Tanggal dan waktu.
- Lokasi kegiatan.
- Google Maps.
- Informasi penyelenggara.

### D. Presensi
- Input kehadiran.
- Riwayat presensi.
- Rekap kehadiran.
- Pengelolaan oleh petugas yang berwenang.

### E. Galeri
- Dokumentasi foto.
- Dokumentasi video.
- Pengelompokan album.
- Pengelolaan unggahan.

### F. Administrasi
- Pengaturan aplikasi.
- Pengelolaan anggota.
- Pengelolaan data kegiatan.
- Ekspor data sesuai hak akses.

Fitur yang tercantum di sini merupakan ruang lingkup pengembangan. Setiap fitur harus dihubungkan ke database dan diuji sebelum dinyatakan berfungsi.

---

## 13. Standar Pengembangan

Setiap file yang ditambahkan atau diperbarui harus memenuhi ketentuan berikut:

1. Responsif pada HP, tablet, laptop, dan desktop.
2. Menggunakan bahasa Indonesia untuk antarmuka.
3. Menggunakan tema emerald yang konsisten.
4. Tidak menggunakan data dummy sebagai data produksi.
5. Tidak menampilkan data privat kepada pengguna yang tidak berwenang.
6. Menangani loading, data kosong, dan error.
7. Menggunakan validasi input.
8. Tidak membuat fungsi JavaScript ganda.
9. Tidak mengubah fungsi autentikasi yang telah berjalan tanpa alasan teknis.
10. Memeriksa konsol browser dan respons Supabase saat pengujian.

---

## 14. Prosedur Integrasi dan Pengujian

Pengujian dilakukan setelah semua file tersedia.

Urutan pemeriksaan:

1. Periksa struktur folder.
2. Periksa nama dan lokasi seluruh file.
3. Periksa semua referensi CSS dan JavaScript.
4. Periksa urutan pemuatan script.
5. Periksa koneksi Supabase.
6. Uji pendaftaran akun.
7. Uji verifikasi email.
8. Uji login.
9. Uji logout.
10. Uji perlindungan halaman anggota.
11. Uji dashboard.
12. Uji tema gelap dan terang.
13. Uji navigasi sidebar.
14. Uji profil dan unggah avatar.
15. Uji fitur modul.
16. Uji PWA dan pembaruan Service Worker.
17. Uji RLS dengan akun yang memiliki role berbeda.

Pengujian dilakukan secara bertahap. Jika terjadi error, periksa pesan konsol dan respons jaringan sebelum mengubah kode.

---

## 15. Deployment

Target deployment:

- GitHub sebagai repository kode.
- Vercel sebagai hosting frontend.
- Supabase sebagai backend.

Alamat deployment TARBIYAH:

https://tarbiyah-tauhid.vercel.app/

Setelah perubahan kode:

1. Simpan file.
2. Periksa perubahan.
3. Commit dan push ke GitHub.
4. Tunggu deployment Vercel selesai.
5. Buka aplikasi melalui browser.
6. Periksa hasil perubahan pada perangkat mobile.

---

## 16. Catatan Integrasi Akhir

Dokumen ini menjadi panduan struktur dan integrasi proyek TARBIYAH.

Tidak semua halaman dan fitur otomatis aktif hanya karena file pendukung sudah tersedia.

Integrasi akhir tetap harus memastikan:

- Setiap halaman menggunakan selector yang benar.
- Setiap script terhubung ke elemen HTML yang sesuai.
- Nama tabel dan kolom sesuai dengan database Supabase.
- Kebijakan RLS sesuai dengan role pengguna.
- Seluruh fitur diuji dengan akun yang sesuai.
- Tidak ada data contoh yang tertukar dengan data produksi.

**TARBIYAH — Pembelajaran Muslim**

*Belajar, Bertumbuh, dan Berukhuwah.*
```
