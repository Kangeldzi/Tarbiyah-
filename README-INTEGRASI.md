# TARBIYAH — Pembaruan Profil Anggota

## File
- `profil-anggota.html`
- `css/profil-anggota.css`
- `js/profil-anggota.js`

## Perbaikan yang diterapkan
- Memperbaiki `saveProfile()` yang sebelumnya merujuk variabel `force` yang tidak dideklarasikan.
- Menambahkan tampilan status keanggotaan `suspended`.
- Membersihkan state profil sebelum reload data.
- Menambahkan kartu QR anggota dan tombol buat/perbarui serta unduh QR.
- Menambahkan tampilan riwayat kajian/kehadiran tanpa data palsu.
- Mempertahankan layout refinement CSS dan seluruh fitur profil yang ada.

## Kontrak backend QR yang diperlukan
Frontend memanggil Supabase Edge Function:
- `member-qr-mint`

Request body:
```json
{"purpose":"member_identity"}
```

Response minimal:
```json
{"token":"OPAQUE_ONE_TIME_TOKEN","expires_at":"2026-11-12T00:00:00Z"}
```

Edge Function wajib memverifikasi JWT pemanggil, mengambil identitas dari JWT (bukan user_id kiriman browser), memastikan `members.membership_status = 'active'`, menyimpan hash token saja, membatasi masa berlaku, serta mengembalikan token mentah sementara. Jangan pernah menaruh service-role key di frontend. Nama fungsi/kontrak ini perlu diselaraskan dengan fungsi backend yang benar-benar dideploy.

## Riwayat kajian/kehadiran
Dalam konteks database yang tersedia saat pembaruan ini dibuat, tabel `profiles` dan `members` sudah terkonfirmasi. Belum ada tabel kajian/attendance yang terkonfirmasi. Karena itu halaman menampilkan empty state yang jujur dan tidak menjalankan query ke tabel yang belum dipastikan ada. Setelah skema presensi yang sebenarnya tersedia, bagian ini dapat dihubungkan tanpa mengarang nama kolom/tabel.

## Instalasi
Ganti tiga file pada repository dengan file di paket ini, pertahankan lokasi folder seperti struktur di atas. Pastikan URL CSS/JS tetap sesuai.
