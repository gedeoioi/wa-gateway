# Deploy ke VPS

WA Gateway memakai **frontend port 3100** (bukan 3000, karena di VPS ini 3000 sudah
dipakai aplikasi lain) dan **API port 4000**.

> Semua langkah di bawah sudah diotomatiskan. Jalankan `./deploy.sh` dan skripnya
> memverifikasi setiap tahap, berhenti pada error pertama, lalu menampilkan log yang
> relevan. Jalur manual ada di bagian akhir sebagai referensi.

---

## Ringkas (3 langkah)

```bash
cd /opt/wa-gateway

# 1. Siapkan konfigurasi sekali saja
cp .env.production.example .env.production
nano .env.production
chmod 600 .env.production

# 2. Periksa konfigurasi tanpa mengubah apa pun
./deploy.sh --check

# 3. Jalankan (tambahkan --first-time saat pertama kali, untuk membuat admin)
./deploy.sh --first-time
```

Setelah itu, update berikutnya cukup:

```bash
git pull && ./deploy.sh
```

Kalau ada masalah:

```bash
./doctor.sh
```

---

## Yang wajib diisi di `.env.production`

Skrip `deploy.sh` menolak berjalan bila salah satu belum benar.

```bash
# Generate dua kali — nilainya HARUS berbeda
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variabel | Keterangan |
| --- | --- |
| `JWT_SECRET` | hex 64 karakter, acak |
| `API_KEY_ENCRYPTION_SECRET` | hex 64 karakter, **berbeda** dari di atas |
| `POSTGRES_PASSWORD` | password database, kuat |
| `PUBLIC_FRONTEND_URL` | `https://wa.domain-anda.com` — **tidak boleh localhost** |
| `PUBLIC_API_URL` | `https://api.domain-anda.com` — **tidak boleh localhost** |
| `FRONTEND_PORT` | `3100` (default) |
| `API_PORT` | `4000` (default) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | opsional, dipakai `--first-time` |

Backend akan **menolak start** bila secret masih placeholder atau `FRONTEND_URL`
berisi `localhost`. Ini disengaja: secret default ada di source publik, jadi token
login bisa dipalsukan bila dibiarkan.

---

## Prasyarat VPS

```bash
# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER    # lalu logout & login lagi
```

Minimal 2 GB RAM (Baileys menahan koneksi terus-menerus).

---

## Nginx

Nginx **wajib** mengarah ke port host, bukan port container:

| Layanan | `proxy_pass` | Catatan |
| --- | --- | --- |
| Frontend | `http://127.0.0.1:3100` | host 3100 → container 3000 |
| API | `http://127.0.0.1:4000` | host 4000 → container 4000 |

Contoh `/etc/nginx/sites-available/wa-gateway`:

```nginx
# ---------- Frontend ----------
server {
    listen 80;
    listen [::]:80;
    server_name wa.domain-anda.com;
    client_max_body_size 20m;          # >= MAX_UPLOAD_MB

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ---------- API ----------
server {
    listen 80;
    listen [::]:80;
    server_name api.domain-anda.com;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        # WAJIB untuk Socket.IO — tanpa ini status device tidak realtime
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan lalu terbitkan sertifikat:

```bash
sudo ln -s /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default     # hindari blok default menangkap domain
sudo nginx -t && sudo systemctl reload nginx

sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d wa.domain-anda.com -d api.domain-anda.com
```

`nginx -t` harus lolos sebelum reload. Certbot akan mengedit file itu sendiri
(menambah blok 443 dan redirect 80→443) — itu normal.

Setelah Certbot, jalankan `./doctor.sh` untuk memastikan `proxy_pass` masih benar.

---

## Cloudflare (bila domain di-proxy)

Bila `dig +short wa.domain-anda.com` mengembalikan IP Cloudflare (bukan IP VPS):

- SSL/TLS mode **wajib `Full (strict)`**. Mode `Flexible` menyebabkan redirect loop
  karena Cloudflare mengirim HTTP ke Nginx, lalu Nginx memantulkan ke HTTPS.
- Pastikan A record `wa` dan `api` menunjuk ke IP VPS Anda.
- **AWS EC2**: buka port 80 & 443 di **Security Group**, bukan hanya `ufw`. Ini
  penyebab **522** yang paling sering — `ufw` di dalam instance tidak membuka
  Security Group, karena keduanya lapisan terpisah.

Aplikasi sudah dikonfigurasi untuk Cloudflare (timeout, `trust proxy`, header
anti-cache, fallback transport Socket.IO). Panduan diagnosa 522 selengkapnya ada di
**[docs/CLOUDFLARE.md](./docs/CLOUDFLARE.md)**.

Ringkas alur diagnosis 522:

```bash
curl -s http://127.0.0.1:4000/health                      # 1. app hidup?
curl -sI -H "Host: api.domain-anda.com" http://127.0.0.1   # 2. Nginx benar?
curl -sI https://api.domain-anda.com/health                # 3. lewat Cloudflare
```

| Langkah 1 | Langkah 2 | Langkah 3 | Artinya |
| --- | --- | --- | --- |
| 200 | 200 | 200 | Semua benar |
| 200 | 200 | 522 | **Security Group / DNS salah** — bukan masalah aplikasi |
| 200 | gagal | 5xx | Konfigurasi Nginx |
| gagal | gagal | 522 | Container mati — jalankan `./doctor.sh` |

---

## Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Port 3100/4000 **tidak** perlu dibuka: keduanya hanya di-bind ke `127.0.0.1` dan
hanya diakses Nginx. Kalau VPS di AWS, buka juga 80/443 di **Security Group**.

---

## Data persisten (WAJIB)

```bash
sudo mkdir -p /var/lib/wa-gateway/wa-sessions /var/lib/wa-gateway/uploads
sudo chown -R 999:999 /var/lib/wa-gateway
```

`deploy.sh` melakukan ini otomatis. Tanpa direktori ini, **setiap redeploy menghapus
pairing WhatsApp** dan semua user harus scan QR ulang.

Backup:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  pg_dump -U postgres wa_gateway | gzip > backup-$(date +%F).sql.gz

sudo tar czf wa-sessions-$(date +%F).tar.gz -C /var/lib/wa-gateway wa-sessions
```

---

## Perintah berguna

```bash
./deploy.sh --check                  # validasi konfigurasi saja
./deploy.sh --first-time             # deploy pertama + buat admin
./deploy.sh                          # deploy/update
./doctor.sh                          # diagnosa menyeluruh

docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
```

---

## Troubleshooting

| Gejala | Penyebab | Tindakan |
| --- | --- | --- |
| Frontend 500 | kode baru, atau build tanpa `--env-file` | `./deploy.sh` (selalu rebuild frontend tanpa cache) |
| Frontend 502 | Nginx salah port | jalankan `./doctor.sh`, cek `proxy_pass` harus 3100 |
| Status device tidak realtime | header `Upgrade` hilang | tambahkan `proxy_set_header Upgrade` di blok API |
| Backend gagal start | secret placeholder / `FRONTEND_URL` localhost | `./deploy.sh --check` akan menunjukkannya |
| Sesi WhatsApp hilang | `/var/lib/wa-gateway` tidak persisten | cek bagian "Data persisten" |
| Redirect loop | Cloudflare mode Flexible | ubah ke `Full (strict)` |
| Upload gagal | `client_max_body_size` < `MAX_UPLOAD_MB` | naikkan di Nginx |
| `worker unhealthy` | healthcheck HTTP warisan image lama | `docker compose ... up -d --force-recreate worker` |
| `publik frontend -> 301` | redirect HTTP→HTTPS (normal) | bukan error; `doctor.sh` sudah mengikuti redirect |

### `frontend unhealthy` padahal halaman bisa diakses

Kalau `curl http://127.0.0.1:3100` mengembalikan 200 tapi status container
`unhealthy`, masalahnya ada di healthcheck, bukan aplikasi.

`doctor.sh` sekarang menampilkan hasil probe terakhir (exit code + output) untuk
setiap container yang unhealthy, jadi penyebabnya terlihat langsung:

```bash
./doctor.sh
```

Penyebab yang sudah pernah terjadi di proyek ini:

| Penyebab | Gejala | Perbaikan |
| --- | --- | --- |
| Healthcheck memakai `curl`/`wget` | `exec: curl: not found` | pakai `node -e "fetch(...)"` (sudah dilakukan) |
| Healthcheck memakai `pgrep` | `pgrep: not found` | `procps` tidak ada di `bookworm-slim` |
| `public/` di-copy tanpa `--chown` | aset 500, container `next` tidak bisa baca | `COPY --chown=next:next` (sudah dilakukan) |
| `start_period` terlalu pendek | unhealthy pada detik-detik awal | sudah 20s |
| Port healthcheck salah | `ECONNREFUSED` | pastikan `PORT` cocok (container 3000) |

Untuk memeriksa manual:

```bash
CID=$(docker compose -f docker-compose.prod.yml --env-file .env.production ps -q frontend)

# Hasil probe terakhir, termasuk pesan errornya
docker inspect --format '{{json .State.Health}}' "$CID" \
  | python3 -m json.tool 2>/dev/null | tail -30 \
  || docker inspect --format '{{json .State.Health}}' "$CID"

# Jalankan perintah healthcheck persis, dari dalam container
docker compose -f docker-compose.prod.yml --env-file .env.production exec frontend \
  node -e "fetch('http://127.0.0.1:3000/').then(r=>{console.log(r.status);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```

**Catatan penting**: `frontend unhealthy` tidak menghalangi trafik. Kalau
`curl http://127.0.0.1:3100` dan `https://wa.domain-anda.com` sudah 200, situs Anda
berjalan normal — status itu murni sinyal monitoring.

### `worker unhealthy` padahal tidak crash

Worker tidak menjalankan HTTP server, sehingga healthcheck HTTP biasa tidak bisa
dipakai. Dua kesalahan sempat terjadi di sini:

1. Worker mewarisi healthcheck HTTP `/health` dari `backend/Dockerfile` → selalu gagal.
2. Penggantinya memakai `pgrep`, padahal **`pgrep` tidak ada** di `node:bookworm-slim`
   (paket `procps` tidak terinstal) → juga selalu gagal.

Keduanya tidak terlihat di `docker ps`: container `running` dengan `restarts=0`.

Solusinya: worker menulis **heartbeat** ke file, dan healthcheck membacanya
(`backend/src/queue/heartbeat.js` + `healthcheck.js`). Ini juga mendeteksi worker
yang hidup tapi event loop-nya macet — sesuatu yang `pgrep` tidak bisa.

Periksa status sebenarnya:

```bash
CID=$(docker compose -f docker-compose.prod.yml --env-file .env.production ps -q worker)

# restarts=0 -> tidak pernah crash
docker inspect --format '{{.RestartCount}}' "$CID"

# Healthcheck harus memuat healthcheck.js, bukan /health atau pgrep
docker inspect --format '{{json .Config.Healthcheck}}' "$CID"

# Heartbeat diperbarui setiap 30 detik
docker compose -f docker-compose.prod.yml --env-file .env.production exec worker \
  node -e "const s=require('fs').statSync('/data/wa-worker-heartbeat');console.log('umur detik:', (Date.now()-s.mtimeMs)/1000)"
```

Perbaikan permanen (rebuild, bukan sekadar recreate — kode healthcheck ada di image):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --force-recreate worker
```

`deploy.sh` menangani ini otomatis dan **tidak pernah gagal hanya karena worker
unhealthy** — broadcast tetap berjalan inline di proses API.

### `301` pada pemeriksaan HTTPS

`doctor.sh` mengikuti redirect (`curl -sIL`), jadi `301` di laporan berarti
**redirect berulang** — hampir selalu Cloudflare mode `Flexible`. Ubah ke
`Full (strict)` lalu jalankan `./doctor.sh` lagi.

### Frontend 500 setelah update kode

`NEXT_PUBLIC_*` di-inline saat build, jadi image lama akan mempertahankan URL API
yang salah. **Wajib rebuild tanpa cache** — sudah ditangani `deploy.sh`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build --no-cache frontend
docker compose -f docker-compose.prod.yml --env-file .env.production up -d frontend
```

Sebelum deploy, jalankan pemeriksaan di lokal:

```bash
cd frontend
npm run check     # boundary + eslint + build + animation check
npm run verify    # jalankan mode PRODUKSI lokal, uji halaman utama
```

`npm run verify` penting: sebagian error Next.js **tidak** muncul saat `next build`
dan hanya tampil sebagai 500 saat halaman dirender.

Dua pemeriksa statis menangkap kelas bug yang lolos dari build:

| Pemeriksa | Menangkap | Gejala kalau lolos |
| --- | --- | --- |
| `check-server-components.mjs` | event handler di Server Component | HTTP 500 saat render |
| `check-animations.mjs` | `@keyframes` hilang untuk animasi lokal | elemen tertahan `opacity: 0`, halaman terlihat kosong |

---

## Jalur manual (referensi)

Bila tidak ingin memakai skrip:

```bash
cd /opt/wa-gateway

# Konfigurasi
cp .env.production.example .env.production
# isi 5 variabel wajib, lalu:
chmod 600 .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production config >/dev/null

# Data persisten
sudo mkdir -p /var/lib/wa-gateway/wa-sessions /var/lib/wa-gateway/uploads
sudo chown -R 999:999 /var/lib/wa-gateway

# Build & jalankan (frontend WAJIB tanpa cache)
docker compose -f docker-compose.prod.yml --env-file .env.production build --no-cache frontend
docker compose -f docker-compose.prod.yml --env-file .env.production build api worker
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Schema + admin
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api npx prisma db push --skip-generate
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T \
  -e ADMIN_EMAIL=admin@domain.com -e ADMIN_PASSWORD='passwordkuat123' \
  api node prisma/seed-admin.js

# Verifikasi
curl -I http://127.0.0.1:4000/health
curl -I http://127.0.0.1:3100
curl -I http://127.0.0.1:3100/login
```

> Perhatikan: `--env-file` wajib di **setiap** perintah Compose, termasuk `exec`.
> Tanpa itu, semua variabel kosong dan Compose berhenti dengan
> `required variable ... is missing a value`.

---

## Alternatif tanpa Docker (PM2)

```bash
cd /opt/wa-gateway/backend
npm ci --omit=dev
npx prisma generate && npx prisma db push

sudo mkdir -p /var/lib/wa-gateway/wa-sessions /var/lib/wa-gateway/uploads /var/log/wa-gateway
sudo chown -R $USER /var/lib/wa-gateway /var/log/wa-gateway

npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Set `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, `DATABASE_URL`, `REDIS_URL`, dan
`FRONTEND_URL` di `backend/.env` (`chmod 600`) sebelum menjalankan PM2. Frontend
tetap perlu dijalankan terpisah di port 3100:

```bash
cd /opt/wa-gateway/frontend
npm ci && npm run build
PORT=3100 npm start
```
