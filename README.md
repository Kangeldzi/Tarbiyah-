# TARBIYAH — Tahap 2: Login & Register

## File yang ditambahkan
- `login-register.html` — halaman masuk, daftar, lupa kata sandi, dan atur ulang kata sandi.
- `css/authentication.css` — tampilan responsif autentikasi.
- `js/auth-page.js` — validasi form dan alur autentikasi.
- `tarbiyah.html` — dashboard sementara untuk pengujian login.
- `js/auth.js` — diperbarui dengan fungsi sign-in, sign-up, reset password, update password, get session, dan sign-out.

## Integrasi ke repository Tahap 1
Salin file/folder dari paket Tahap 2 ke repository Tahap 1 dengan mempertahankan struktur folder. File `js/auth.js` harus menggantikan file lama. Jangan menghapus file Tahap 1 yang tidak disebutkan.

## Konfigurasi Supabase
Di `js/config.js`, isi:
- `SUPABASE_URL`: Project URL dari Supabase.
- `SUPABASE_ANON_KEY`: anon/public key dari Supabase.

Jangan pernah memasukkan `service_role` key ke kode frontend.

Di Supabase Dashboard:
1. Buka Authentication → URL Configuration.
2. Site URL isi alamat GitHub Pages aplikasi, misalnya `https://username.github.io/nama-repository/`.
3. Tambahkan alamat yang sama ke Redirect URLs.
4. Tambahkan URL halaman callback/recovery, misalnya `https://username.github.io/nama-repository/login-register.html`.
5. Untuk uji email, pastikan pengaturan email/SMTP sesuai. Supabase menyediakan layanan email bawaan dengan batasan pengiriman.

## Cara menguji
1. Buka `login-register.html` melalui GitHub Pages/HTTPS.
2. Daftar dengan email yang dapat diakses dan kata sandi minimal 8 karakter.
3. Jika verifikasi email aktif, buka email dan klik tautan verifikasi.
4. Kembali ke halaman masuk dan login.
5. Pastikan diarahkan ke `tarbiyah.html` sementara.
6. Klik Keluar dari akun dan pastikan kembali ke halaman masuk.
7. Uji Lupa kata sandi setelah Redirect URLs dikonfigurasi.

## Catatan
- Tahap ini membutuhkan project Supabase aktif agar autentikasi sungguhan bekerja.
- Tanpa konfigurasi Supabase, halaman tetap bisa dibuka untuk memeriksa UI, tetapi login/daftar tidak akan berhasil.
- `tarbiyah.html` hanya halaman sementara untuk uji alur. Akan digantikan oleh dashboard lengkap pada Tahap 3.
- Pastikan deployment memakai HTTPS; jangan menguji dengan membuka file HTML melalui `file://`.

# TARBIYAH — Fondasi Aplikasi

Paket ini menggabungkan fondasi Tahap 1 dan autentikasi Tahap 2, lalu menambahkan kerangka Dashboard Utama Tahap 3. Baca `README-INTEGRASI-TAHAP-3.md` sebelum deployment.

Halaman produksi setelah login adalah `dashboard.html`. File `tarbiyah.html` tidak disertakan karena hanya halaman uji sementara.
