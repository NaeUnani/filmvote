# FilmVote

Website voting film untuk HP, dibuat dengan Next.js, React, dan TypeScript. Proyek berada di `D:\MyApps\FilmVote`.

## Menjalankan

```powershell
cd D:\MyApps\FilmVote
npm install
npm run dev
```

Buka `http://localhost:3000`. Halaman admin: `http://localhost:3000/filmvote/admin` (alias `/admin`). Username dan password admin tersimpan di `.env.local` pada `ADMIN_USERNAME` dan `ADMIN_PASSWORD`.

Untuk menjalankan hasil production build:

```powershell
npm run build
npm start
```

Folder hasil development dan production dipisahkan agar proses preview tidak mengganggu build di Windows.

## Fitur

- Tampilan HP maksimal 480 px, gradient amber glossy, kartu film vertikal.
- Thumbnail dan preview 16:9; hanya trailer yang terlihat yang aktif. Trailer berhenti ketika keluar layar atau tab disembunyikan.
- Autoplay tanpa suara, tombol putar/jeda, suara, maju/mundur 10 detik, dan slider playback. Browser bisa membatasi autoplay; tersedia tombol untuk mulai manual.
- Pilihan playlist, pencarian ketika koleksi bertambah, daftar pilihan sendiri, dan hasil voting yang diperbarui setiap 15 detik.
- Maksimal 3 film berbeda per IP pada setiap periode voting. Satu film hanya bisa dipilih sekali. Kuota diperiksa ketika halaman dibuka dan divalidasi ulang di server ketika memilih.
- IP di-HMAC sebelum disimpan; IP mentah tidak ditulis ke database aplikasi. Pengunjung di Wi-Fi/NAT yang sama berbagi kuota. VPN/IP baru bisa memperoleh kuota baru; identitas berbasis IP memang tidak mengidentifikasi satu manusia secara pasti.
- Admin: login, tambah playlist, masukkan trailer YouTube, ambil metadata OMDb, periksa/edit hasil, simpan/edit/hapus film, serta buka/tutup voting.
- Rating IMDb, Rotten Tomatoes, Metacritic, sinopsis singkat, tahun, durasi, genre, pemeran, sutradara. Rating yang tidak tersedia ditampilkan `—`.

- Admin dapat mengatur tanggal mulai dan selesai, dengan preset 10 hari (WIB).
- Setelah periode selesai, film diarsipkan ke library dan hasil tetap bisa dilihat. Periode baru memakai kuota baru; film bisa dipanggil dari library.

## Konfigurasi

`.env.local` berisi login admin, dua secret, dan OMDb key aktif. Semua variabel hanya digunakan di server dan tidak memakai awalan `NEXT_PUBLIC_`. Jangan commit atau bagikan file ini.

| Variabel                   | Kegunaan                                                                          |
| -------------------------- | --------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD`           | Password login admin                                                  |
| `SESSION_SECRET`           | Menandatangani cookie admin, minimal 24 karakter                                  |
| `IP_HASH_SECRET`           | HMAC identitas IP, minimal 24 karakter; pertahankan nilainya agar kuota konsisten |
| `OMDB_API_KEY`             | Metadata film otomatis                                                            |
| `UPSTASH_REDIS_REST_URL`   | URL REST database Upstash untuk production                                        |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST database Upstash                                                       |

Dalam development/local production, data disimpan di `data/store.json`. Pada Vercel, aplikasi mewajibkan Redis; aplikasi tidak menyimpan vote di filesystem sementara atau hanya di browser.

## Deploy Vercel

1. Login Vercel melalui CLI. Bila direktori konfigurasi Windows bermasalah, gunakan folder konfigurasi di workspace yang dapat ditulis.
2. Buat/hubungkan database **Upstash Redis** melalui Storage / Marketplace Vercel dan pilih paket yang sesuai. Isi dua variabel REST Redis ke `.env.local` jika ingin menggunakan skrip deploy di bawah.
3. Jalankan `npm run deploy`. Skrip memeriksa login dan konfigurasi, menautkan proyek `filmvote`, mengirim secret lewat stdin (bukan argumen), dan menjalankan deploy production. `VERCEL_CONFIG_DIR` dapat diisi jika memakai direktori konfigurasi alternatif.
4. Buka URL production yang dikembalikan CLI. Admin berada di `<URL>/filmvote/admin`.

Alternatif manual: impor proyek ke Vercel sebagai Next.js, masukkan seluruh variabel di atas sebagai environment production, kemudian deploy. `.env.local` tidak ikut diunggah.

Vercel mendeteksi IP dari header proxy miliknya. Mode lokal sengaja memakai satu identitas localhost sehingga header IP buatan tidak bisa dipakai untuk mengakali kuota.

## Pengujian

Dengan server lokal aktif di port 3000:

```powershell
npm test
```

Pengujian API mencakup login/admin, cookie palsu, origin asing, empat vote bersamaan (hanya tiga diterima), duplikasi, kuota setelah reload, penutupan voting, validasi YouTube, pengambilan metadata, pembuatan playlist, serta tambah/hapus film. Data lokal dicadangkan dan dipulihkan setelah tes; jangan menjalankan tes sambil mengedit koleksi lokal.

Jika Redis dikonfigurasi, tes fixture lokal dilewati. Tes Redis menjalankan operasi Lua aplikasi pada key acak terisolasi, menguji permintaan bersamaan, duplikasi, dan voting ditutup, kemudian membersihkan key tes tersebut. Vote asli tidak diubah.

```powershell
npm run check
npm run build
npm run refresh-metadata
```

Perintah terakhir memperbarui rating empat film starter dari OMDb. Di formulir admin, **Cari detail** mengambil metadata OMDb dan mengisi kolom sinopsis dengan terjemahan bahasa Indonesia dari MyMemory. Jika terjemahan gagal dan sinopsis Indonesia belum tersedia, plot OMDb ditampilkan sebagai referensi untuk diisi manual. Periksa judul dan tahun sebelum menyimpan karena pencocokan berdasarkan judul YouTube bisa keliru.

Referensi: [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [OMDb](https://www.omdbapi.com/), [Vercel request headers](https://vercel.com/docs/headers/request-headers), [Upstash REST API](https://upstash.com/docs/redis/features/restapi).
