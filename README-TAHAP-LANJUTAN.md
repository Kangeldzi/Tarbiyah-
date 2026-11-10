# TARBIYAH — Tahap Lanjutan UI & Navigasi

## Yang dibangun pada paket ini
- Tema Teal/Toska Premium sebagai token global light/dark.
- Standar logo bersama melalui `css/brand-logo.css` (42×42 px, rasio contain, tanpa wadah tambahan, drop-shadow halus), mengikuti kontrak logo induk.
- 14 halaman modul dengan struktur khusus, navigasi konsisten, responsive sidebar, status integrasi, dan empty state yang jujur.
- Dashboard diarahkan ke modul final; menu Kajian duplikat dihapus sebagai halaman tersendiri.
- Manifest PWA memakai warna Teal/Toska.

## Batasan yang harus diketahui
- Data modul belum tersambung ke tabel Supabase karena skema tabel/kolom untuk modul-modul tersebut belum diverifikasi.
- Tombol aksi modul saat ini memberi status bahwa penyimpanan belum aktif; tidak menulis data palsu ke LocalStorage.
- Profil & Anggota tetap perlu dikembalikan ke palet teal asli spesifiknya saat modul final dibangun; token global tidak dimaksudkan untuk mengganti palet aslinya.
- `js/config.js` masih berisi placeholder. Isi URL dan anon/publishable key milik proyek Anda. Jangan pernah gunakan service_role key di frontend.
- Pastikan `assets/icons/icon-192.png` dan `icon-512.png` tersedia dari repository asli.
- Belum dilakukan pengujian runtime pada proyek Supabase maupun browser perangkat pengguna.

## Struktur
File inti: `index.html`, `login-register.html`, `dashboard.html`.
Modul: `profil-anggota.html`, `agenda-tarbiyah.html`, `materi-pembelajaran.html`, `berita-pengumuman.html`, `presensi-tarbiyah.html`, `pembelajaran.html`, `galeri-foto-video.html`, `diskusi-tarbiyah.html`, `donasi-infaq.html`, `kehadiran.html`, `catatan-refleksi.html`, `notifikasi.html`, `riwayat-aktivitas.html`, `administrasi-pengaturan.html`.
