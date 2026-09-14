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
        ├── components/                         # StatusBadge, ProgressBar, Toast
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
npm run dev                          # http://localhost:3000
```

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
npm test              # 3 suite, 102 skenario (tanpa perlu PostgreSQL/Redis)
```

Test memakai Prisma double in-memory sehingga bisa dijalankan tanpa database:
- `_e2e.mjs` — auth, device, API key + scope, single chat, broadcast, kuota, isolasi data
- `_worker-quota.test.mjs` — worker broadcast berhenti saat kuota habis
- `_admin.test.mjs` — otorisasi admin, perubahan paket, batas device, privasi data

---

## 4. Alur Pakai

1. Buka `http://localhost:3000` → **Daftar gratis**
2. Menu **Koneksi Device** → **Tambah device** → scan QR dari WhatsApp
   (WhatsApp → Perangkat tertaut → Tautkan perangkat)
3. **Single Chat** untuk kirim ke satu nomor, atau **Broadcast** untuk massal
4. **API Keys** → buat key → pakai di aplikasi Anda
5. **Riwayat** untuk audit semua pesan

---

## 5. Contoh Integrasi API

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

## 6. Keamanan

| Aspek | Implementasi |
| --- | --- |
| Password | bcrypt (10 rounds) |
| API key | `sha256` untuk lookup + AES-256-GCM untuk reveal; plaintext tidak pernah disimpan |
| Auth dashboard | JWT (`Authorization: Bearer`) |
| Auth API | Header `X-API-Key` + scope `send`/`read` |
| Rate limiting | Global per IP/API key + limiter ketat pada login/register |
| Upload | Batas ukuran (`MAX_UPLOAD_MB`), file temp dihapus setelah dikirim |
| HTTP | Helmet, CORS dibatasi `FRONTEND_URL`, body limit 2 MB |

---

## 7. Catatan Operasional

- **Session WhatsApp** tersimpan di `backend/.wa-sessions/<sessionId>`. Jangan pernah
  commit folder ini dan backup bila ingin survive tanpa scan ulang.
- **Anti-blokir**: naikkan `delayMs` (4–8 detik) untuk daftar nomor besar, dan gunakan
  `batchPauseMs` 1–5 menit. Kirim hanya ke nomor yang relevan.
- **Kuota**: `monthlyQuota` dihitung dari pesan terkirim dan otomatis direset setiap 30 hari.
- **Skalabilitas**: jalankan API dan worker sebagai proses terpisah, dan pertimbangkan
  memisahkan device aktif ke node berbeda bila jumlah koneksi sangat besar.
- **Reset total**: hapus tabel lewat `npx prisma migrate reset`, lalu hapus `.wa-sessions`.
