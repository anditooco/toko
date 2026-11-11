# Dapur Nusantara - toko dengan admin langsung di situs

Isi folder:
- public/index.html            halaman toko
- netlify/functions/store.mjs  penyimpanan data produk (Netlify Blobs)
- netlify.toml, package.json   pengaturan Netlify

Login admin awal: username admin, password 12345.
Setelah masuk, ganti di Pengaturan toko, bagian Login admin.

Langkah ada di jawaban Claude. Ringkasnya:
1. Unggah semua isi folder ini ke repositori GitHub baru.
2. Di Netlify: Add new project, Import an existing project, pilih GitHub, pilih repositori itu, lalu Deploy.
