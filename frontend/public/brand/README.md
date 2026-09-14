# Brand Assets

Ganti logo dan favicon di sini. Tidak perlu mengubah kode.

## File

| File | Dipakai di | Ukuran disarankan |
| --- | --- | --- |
| `logo.svg` | Header landing, sidebar dashboard, halaman login | persegi (1:1), mis. 64x64 |
| `logo-full.svg` | Opsional, logo + tulisan (via `shape="full"`) | horizontal, mis. 240x64 |
| `../src/app/icon.svg` | Favicon tab browser | persegi (1:1) |
| `../src/app/apple-icon.png` | Ikon iOS home screen (opsional) | 180x180 |
| `../src/app/opengraph-image.png` | Preview saat link dibagikan (opsional) | 1200x630 |

## Cara ganti

1. Timpa `logo.svg` dengan file Anda (nama harus sama), atau
2. Simpan dengan nama lain lalu sesuaikan `ASSETS` di `frontend/src/components/Logo.tsx`.

Format yang didukung: `.svg` (paling tajam), `.png`, `.webp`, `.jpg`.

## Catatan

- Logo tampil di atas chip hijau (`bg-brand-600`), jadi pakai artwork berwarna terang
  atau transparan agar kontras. Untuk logo berwarna gelap, ubah kelas chip di
  `Logo.tsx`.
- `logo.svg` dan `icon.svg` sengaja terpisah: favicon tidak boleh bergantung pada
  folder `public/` agar Next.js dapat meng-hash dan meng-cache-nya otomatis.
- Warna brand didefinisikan di `frontend/tailwind.config.ts` (`brand.500 = #10b981`,
  `brand.600 = #059669`). Sesuaikan di sana bila palet ikut berubah.
