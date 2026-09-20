# WA Gateway

WhatsApp Gateway untuk **single chat**, **broadcast massal**, dan **integrasi REST API**.
Dibangun dengan Node.js + Baileys (backend) dan Next.js + Tailwind (frontend).

> Ringan · Mudah · Cepat — backend hanya menyimpan auth state + last QR di memori,
> riwayat pesan langsung dialirkan ke database.

---

## 1. Fitur

### Landing page (public)
- Penjelasan layanan, keunggulan, cara kerja 3 langkah
- Fitur, harga/paket, FAQ, dan CTA daftar/login

### Autentikasi & Dashboard
- Register/login email + password (JWT)
- Dashboard: status koneksi, statistik pesan, tren 7 hari, kuota bulanan

### Koneksi WhatsApp
- Scan QR code (Baileys) langsung dari dashboard
- Status realtime (connected/connecting/disconnected/logged_out) via Socket.IO
- Auto-reconnect dengan exponential backoff, opsi reconnect & logout manual

### Single Chat
- Form nomor tujuan, isi pesan, lampiran gambar/dokumen
- Riwayat log dengan status terkirim/gagal
- Cek apakah nomor terdaftar di WhatsApp

### Broadcast
- Input manual atau import CSV/Excel
- Template dinamis `{{nama}}` dan `{{nomor}}` + tombol sisip variabel
- Pengaturan delay antar pesan, ukuran batch, dan jeda antar batch
- Progress bar realtime + laporan sukses/gagal per nomor
- Pause/continue/retry/hapus broadcast

### REST API
| Endpoint | Method | Scope | Deskripsi |
| --- | --- | --- | --- |
| `/api/send-message` | POST | `send` | Kirim pesan ke satu nomor |
| `/api/send-broadcast` | POST | `send` | Kirim pesan massal (async) |
| `/api/device/status` | GET | `read` | Cek status koneksi device |
| `/api/broadcast/{id}` | GET | `read` | Status & progress broadcast |
| `/api/messages` | GET | `read` | Riwayat pesan |

- Autentikasi API key per user via header `X-API-Key`
- Dokumentasi Swagger/OpenAPI di `/docs`, spec JSON di `/openapi.json`

### Manajemen Device
- Multi-device per user (sampai 5 device)
- Session terisolasi per device di folder `.wa-sessions/<sessionId>`

### Responsive
- Berfungsi dari layar 320px (iPhone SE) hingga desktop lebar
- Tabel `Riwayat` dan daftar penerima broadcast berubah menjadi kartu di mobile
- Sidebar dashboard jadi drawer dengan overlay, header tidak overflow di layar sempit
- QR code dan tombol aksi menyesuaikan lebar layar
- Target sentuh minimal 44px dan input 16px agar iOS tidak auto-zoom
- Breakpoint `xs` (400px) kustom untuk HP kecil, didefinisikan di `tailwind.config.ts`

### Animasi & Motion
Sistem animasi terpusat sebagai design token di `tailwind.config.ts`, bukan nilai
yang ditulis ad-hoc per komponen.

| Token | Nilai | Dipakai untuk |
| --- | --- | --- |
| `duration-fast` | 120ms | hover warna (tombol, link nav) |
| `duration-base` | 200ms | kartu, input, chevron |
| `duration-slow` | 320ms | drawer sidebar, panel |
| `ease-swift` | `cubic-bezier(.22,1,.36,1)` | responsif, berhenti halus |
| `ease-out-soft` | `cubic-bezier(.16,1,.3,1)` | panel & sheet besar |

Kelas siap pakai: `.animate-enter`, `.animate-enter-up`, `.animate-enter-scale`,
`.animate-enter-sheet`, `.stagger-item`, `.card-interactive`, `.row-hover`,
`.scroll-anchor`.

Prinsip yang dipegang:

- **Hanya properti paint/transform yang dianimasikan.** `transition-all` dihindari
  karena ikut menganimasikan properti layout (width/height) yang memaksa reflow
  setiap frame.
- **Progress bar memakai `transform: scaleX()`**, bukan `width`. Ini penting untuk
  broadcast yang nilainya berubah beberapa kali per detik.
- **Stagger untuk daftar.** `.stagger-item` memakai `--stagger-index` dengan delay
  dibatasi 400ms, jadi daftar panjang tidak menunggu lama.
- **`prefers-reduced-motion` dihormati.** Animasi diperpendek jadi ~0ms (bukan
  dihapus) agar perubahan state tetap terbaca. Ini syarat WCAG 2.3.3.

> **Penting**: `@keyframes` untuk animasi lokal dideklarasikan **langsung di
> `globals.css`**, bukan hanya di `tailwind.config.ts`. Tailwind hanya memancarkan
> `@keyframes` untuk utility `animate-*` yang benar-benar dipakai di markup; jika
> keyframes tidak ada tetapi `animation-fill-mode: both` dipakai, elemen akan
> **tertahan di `opacity: 0` alias tidak terlihat**. `npm run check` memverifikasi
> ini otomatis lewat `scripts/check-animations.mjs`.

### Paket & Admin Panel
Satu sumber kebenaran untuk paket ada di `backend/src/config/plans.js`. Paket menentukan
kuota pesan dan batas device, sehingga tabel harga di landing page benar-benar ditegakkan.

| Paket | Harga | Kuota | Device |
| --- | --- | --- | --- |
| Free | Rp0 | 1.000 pesan/bulan | 1 |
| Pro | Rp99rb | 25.000 pesan/bulan | 3 |
| Business | Rp299rb | 100.000 pesan/bulan | 10 |

Admin panel (`/dashboard/admin`, hanya untuk `role=admin`) menyediakan:
- Statistik platform: jumlah member, device, pesan, broadcast, dan distribusi paket
- Daftar member dengan pencarian dan filter paket/status
- Ubah paket member — kuota dan batas device otomatis ikut menyesuaikan
- Override kuota dan batas device per member (dibatasi `globalMaxDevices`)
- Suspend/aktifkan akun, ubah role, reset pemakaian, perpanjang masa kuota
- Lihat dan logout device milik member, serta perintah reconnect semua device

Batasan yang disengaja: admin **tidak** dapat membaca isi pesan atau nomor tujuan
pelanggan member, hanya angka statistik. Admin juga tidak dapat menurunkan role atau
menonaktifkan akunnya sendiri, dan admin terakhir tidak dapat di-demote.

---

## 2. Struktur Project

```
wa-gateway/
├── docker-compose.yml          # PostgreSQL + Redis
├── backend/
│   ├── .env.example
│   ├── prisma/schema.prisma    # User, Device, Message, Broadcast, ApiKey
│   └── src/
│       ├── server.js           # entrypoint: HTTP + Socket.IO + worker + restore device
│       ├── app.js              # Express app & routing
│       ├── config/             # env, logger, plans (kuota & batas device)
│       ├── db/prisma.js
│       ├── lib/                # security (hash/encrypt), phone, openapi
│       ├── middleware/auth.js  # JWT, API key, admin, rate limit, error, upload
│       ├── modules/
│       │   ├── auth/           # register, login, me, stats
│       │   ├── device/         # CRUD device, QR, reconnect, logout
│       │   ├── message/        # single chat, logs, check-number
│       │   ├── broadcast/      # create, preview, start, cancel, detail
│       │   ├── apikey/         # buat, reveal, revoke
│       │   └── admin/          # kelola member, paket, device (role=admin)
│       ├── whatsapp/
│       │   ├── manager.js      # WaSession (Baileys) per device
│       │   └── dispatcher.js   # jalur kirim tunggal + kuota
│       ├── queue/              # BullMQ worker broadcast (+ fallback inline)
│       ├── realtime/socket.js  # Socket.IO: device status & broadcast progress
│       └── routes/public-api.routes.js
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx                        # landing (paket dari API)
        │   ├── (auth)/login, (auth)/register
        │   └── dashboard/                      # layout + 8 halaman (termasuk admin)
        ├── components/                         # StatusBadge, ProgressBar, Toast, Logo
        ├── scripts/                            # check-server-components, check-animations
        └── lib/                                # api client, auth context, socket hook
```

> `backend/_e2e.mjs` adalah test end-to-end yang memakai Prisma double in-memory.

---

## 3. Menjalankan

### Prasyarat
- Node.js >= 20
- PostgreSQL 14+ (atau Docker)
- Redis 6+ (opsional — tanpa Redis, broadcast berjalan inline di proses API)

### 3.1 Infrastruktur

```bash
docker compose up -d
```

Atau pakai PostgreSQL/Redis yang sudah ada dan sesuaikan `DATABASE_URL` / `REDIS_URL`.

### 3.2 Backend

```bash
cd backend
cp .env.example .env      # Windows: copy .env.example .env
npm install
npx prisma generate
npx prisma db push        # atau: npx prisma migrate dev
npm run dev               # http://localhost:4000  (docs: /docs)
```

Generate secret yang kuat:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Isi `JWT_SECRET` dan `API_KEY_ENCRYPTION_SECRET` dengan hasilnya.

### 3.3 Frontend

```bash
cd frontend
copy .env.local.example .env.local   # Windows
npm install
npm run dev                          # http://localhost:3100
```

**Sebelum build/deploy, jalankan pipeline pemeriksaan:**

```bash
npm run check        # boundary + eslint + build + animation check
npm run verify       # build + jalankan mode PRODUKSI lokal di port 3100
```

Pipeline `check` menjalankan dua pemeriksa otomatis yang menangkap kelas bug yang
**tidak terdeteksi oleh `next build`**:

| Pemeriksa | Menangkap |
| --- | --- |
| `scripts/check-server-components.mjs` | event handler di Server Component → HTTP 500 saat render |
| `scripts/check-animations.mjs` | `@keyframes` hilang → elemen tertahan `opacity: 0` (tak terlihat) |

> **Penting**: selalu uji dengan `npm run verify`, bukan hanya `npm run dev`.
> Next.js tidak menangkap sebagian error (mis. event handler di Server Component)
> saat `next build` maupun di dev mode — error itu baru muncul sebagai **500 saat
> halaman dirender di produksi**. `scripts/check-server-components.mjs` menangkap
> kelas bug tersebut secara statis.


### 3.3.1 Mengganti Logo & Favicon

Semua logo dirender lewat satu komponen: `frontend/src/components/Logo.tsx`.
Sebelumnya SVG-nya diduplikasi di 3 file, sehingga rawan tidak sinkron.

**Ganti logo** — timpa file berikut (nama harus sama), tanpa edit kode:

| File | Dipakai di |
| --- | --- |
| `frontend/public/brand/logo.svg` | Header landing, sidebar, halaman login |
| `frontend/public/brand/logo-full.svg` | Logo + tulisan (opsional, `shape="full"`) |

**Ganti favicon** — timpa `frontend/src/app/icon.svg`. Next.js menanganinya otomatis.
Opsional: `apple-icon.png` (180x180) dan `opengraph-image.png` (1200x630) di folder
yang sama.

Kalau memakai nama file lain, sesuaikan `ASSETS` di `Logo.tsx`. Detail lengkap ada di
`frontend/public/brand/README.md`.

> Logo tampil di atas chip hijau, jadi pakai artwork terang atau transparan agar
> kontras. Untuk logo gelap, ubah kelas `bg-brand-600` pada chip di `Logo.tsx`.

### 3.4 Worker (opsional)

```bash
cd backend
npm run worker        # proses queue broadcast di proses terpisah
```

Bila `REDIS_URL` kosong, worker tidak diperlukan dan broadcast dijalankan inline.

> Jika database sudah pernah dibuat sebelum indeks `[deviceId, providerId]` pada
> tabel `Message` ditambahkan, jalankan `npx prisma db push` lagi (atau buat
> migration baru) agar indeks untuk lookup `getMessage` Baileys ikut terpasang.

### 3.5 Akun Admin

Admin panel tidak bisa diakses dari UI biasa — akun admin dibuat lewat seed:

```bash
cd backend
npm run seed:admin
```

Tanpa env var, password acak di-generate dan ditampilkan **sekali**:

```
Admin account created.
  Email    : admin@wagateway.local
  Password : wag-9Pi2SU3FLlUy
```

Untuk menentukan sendiri:

```bash
# Windows PowerShell
$env:ADMIN_EMAIL="admin@domain.com"; $env:ADMIN_PASSWORD="passwordkuat123"; npm run seed:admin

# bash
ADMIN_EMAIL=admin@domain.com ADMIN_PASSWORD=passwordkuat123 npm run seed:admin
```

Seed ini idempoten: menjalankannya lagi akan **mempromosikan** akun yang sudah ada
(bukan menduplikasi). Setelah login, menu **Admin Panel** muncul di sidebar.

Member lain bisa dijadikan admin dari dalam admin panel (tombol "Jadikan admin"),
dengan pengaman: admin terakhir tidak bisa di-demote dan admin tidak bisa
menurunkan atau menonaktifkan akunnya sendiri.

### 3.6 Test

```bash
cd backend

npm test              # 5 suite, 136 skenario — in-memory, tanpa PostgreSQL/Redis
npm run test:api      # 53 skenario API end-to-end — BUTUH PostgreSQL nyata
npm run verify:all    # keduanya
```

**Tanpa database** (memakai Prisma double in-memory):

- `_config.test.mjs` — validasi secret produksi (menolak boot dengan secret default)
- `_healthcheck.test.mjs` — heartbeat worker & healthcheck container
- `_e2e.mjs` — auth, device, API key + scope, single chat, broadcast, kuota, isolasi data
- `_worker-quota.test.mjs` — worker broadcast berhenti saat kuota habis
- `_admin.test.mjs` — otorisasi admin, perubahan paket, batas device, privasi data

**Dengan database** (`npm run test:api`): menjalankan server sungguhan di port sementara
dan memanggil setiap endpoint publik seperti yang dilakukan integrasi eksternal —
termasuk jalur sukses kirim pesan, render variabel template broadcast, filter device,
scope read-only, kuota habis, JSON rusak, dan kesesuaian dengan dokumentasi OpenAPI.
WhatsApp distub hanya di batas socket, jadi tidak perlu device asli.

> Jalankan `npm run test:api` setiap kali mengubah rute atau middleware auth:
> inilah yang menangkap konflik antar-router yang tidak terlihat oleh test in-memory.

---

## 4. Deploy ke VPS

Panduan lengkap ada di **[DEPLOY.md](./DEPLOY.md)** (Docker Compose + Nginx + HTTPS),
termasuk alternatif tanpa Docker memakai PM2.

Ringkasnya:

```bash
cp .env.production.example .env.production
# isi JWT_SECRET, API_KEY_ENCRYPTION_SECRET, POSTGRES_PASSWORD, dan domain
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Poin paling penting:

- **Backend menolak start di produksi** bila `JWT_SECRET`/`API_KEY_ENCRYPTION_SECRET`
  masih placeholder, atau `FRONTEND_URL` masih `localhost`. Ini mencegah deploy
  dengan secret default yang ada di source publik (risiko pemalsuan token).
- **`/var/lib/wa-gateway` adalah volume persisten** untuk sesi WhatsApp dan upload.
  Tanpa itu, setiap redeploy menghapus pairing dan semua user harus scan QR ulang.
- **Nginx wajib meneruskan header `Upgrade`** ke port 4000, kalau tidak status
  realtime (Socket.IO) mati.
- Redis sebaiknya aktif di produksi; tanpa Redis, broadcast hilang bila server restart.


---

## 5. Alur Pakai

1. Buka `http://localhost:3100` → **Daftar gratis**
2. Menu **Koneksi Device** → **Tambah device** → scan QR dari WhatsApp
   (WhatsApp → Perangkat tertaut → Tautkan perangkat)
3. **Single Chat** untuk kirim ke satu nomor, atau **Broadcast** untuk massal
4. **API Keys** → buat key → pakai di aplikasi Anda
5. **Riwayat** untuk audit semua pesan

---

## 6. Contoh Integrasi API

### Kirim pesan tunggal

```bash
curl -X POST http://localhost:4000/api/send-message \
  -H "X-API-Key: wag_xxxxxxxx_yourkey" \
  -H "Content-Type: application/json" \
  -d '{"to":"6281234567890","body":"Halo, pesanan Anda sudah dikirim!"}'
```

```json
{
  "success": true,
  "data": {
    "id": "clr1a2b3c0000",
    "to": "6281234567890@s.whatsapp.net",
    "status": "sent",
    "providerId": "3EB0C8D1F2A4B5",
    "sentAt": "2026-01-20T09:12:44.108Z"
  }
}
```

### Kirim broadcast

```bash
curl -X POST http://localhost:4000/api/send-broadcast \
  -H "X-API-Key: wag_xxxxxxxx_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Promo Januari",
    "template": "Halo {{nama}}, ada promo spesial untuk nomor {{nomor}}!",
    "recipients": "628111111111,Budi\n628222222222,Siti",
    "delayMs": 5000,
    "batchSize": 20,
    "batchPauseMs": 60000
  }'
```

```json
{
  "success": true,
  "data": {
    "broadcastId": "clr9z8y7x0001",
    "status": "queued",
    "total": 2,
    "accepted": 2,
    "rejected": []
  }
}
```

### Cek status device

```bash
curl http://localhost:4000/api/device/status \
  -H "X-API-Key: wag_xxxxxxxx_yourkey"
```

### JavaScript (fetch)

```js
const res = await fetch("http://localhost:4000/api/send-message", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.WA_GATEWAY_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ to: "6281234567890", body: "Ping dari Node.js" }),
});
console.log(await res.json());
```

### PHP (cURL)

```php
$ch = curl_init('http://localhost:4000/api/send-message');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['X-API-Key: wag_xxxxxxxx_yourkey', 'Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['to' => '6281234567890', 'body' => 'Ping dari PHP']),
]);
echo curl_exec($ch);
```

### Lampiran (multipart)

```bash
curl -X POST http://localhost:4000/api/send-message \
  -H "X-API-Key: wag_xxxxxxxx_yourkey" \
  -F "to=6281234567890" \
  -F "body=Berikut invoice Anda" \
  -F "media=@invoice.pdf"
```

---

## 7. Keamanan

| Aspek | Implementasi |
| --- | --- |
| Password | bcrypt (10 rounds) |
| API key | `sha256` untuk lookup + AES-256-GCM untuk reveal; plaintext tidak pernah disimpan |
| Auth dashboard | JWT (`Authorization: Bearer`) |
| Auth API | Header `X-API-Key` + scope `send`/`read` |
| Rate limiting | Global per IP/API key + limiter ketat pada login/register |
| Upload | Batas ukuran (`MAX_UPLOAD_MB`), file temp dihapus setelah dikirim |
| HTTP | Helmet, CORS dibatasi `FRONTEND_URL`, body limit 2 MB |

### Dua klien, satu URL

`GET /api/messages` dan `GET /api/broadcast/:id` dipakai oleh **dua klien berbeda**:
dashboard (JWT) dan API publik (API key). Express mencocokkan rute berdasarkan urutan
pendaftaran, jadi rute yang didaftarkan pertama akan selalu menang dan memutus klien
lainnya — gejalanya `"Token tidak ditemukan"` pada request API key.

Solusinya di `src/app.js`: rute publik didaftarkan **lebih dulu**, dilindungi middleware
`onlyIfApiKey` yang meneruskan request ke router JWT bila tidak ada API key
(`next("route")`). Dengan begitu satu URL terdokumentasi melayani kedua audiens.

> Bila menambah rute baru yang path-nya sama antara dashboard dan API publik, gunakan
> pola `shared()` yang sama. `npm run test:api` akan menangkap konflik semacam ini.

---

## 8. Catatan Operasional

- **Session WhatsApp** tersimpan di `backend/.wa-sessions/<sessionId>`. Jangan pernah
  commit folder ini dan backup bila ingin survive tanpa scan ulang.
- **Anti-blokir**: naikkan `delayMs` (4–8 detik) untuk daftar nomor besar, dan gunakan
  `batchPauseMs` 1–5 menit. Kirim hanya ke nomor yang relevan.
- **Kuota**: `monthlyQuota` dihitung dari pesan terkirim dan otomatis direset setiap 30 hari.
- **Skalabilitas**: jalankan API dan worker sebagai proses terpisah, dan pertimbangkan
  memisahkan device aktif ke node berbeda bila jumlah koneksi sangat besar.
- **Reset total**: hapus tabel lewat `npx prisma migrate reset`, lalu hapus `.wa-sessions`.
