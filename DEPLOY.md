# Deploy ke VPS

Panduan ini untuk VPS **Ubuntu/Debian** dengan domain. Total waktu ± 20 menit.

> **Penting:** backend akan **menolak start** bila `NODE_ENV=production` tetapi
> `JWT_SECRET` / `API_KEY_ENCRYPTION_SECRET` masih placeholder atau `FRONTEND_URL`
> masih berisi `localhost`. Ini disengaja: secret default ada di source code publik,
> jadi siapa pun bisa memalsukan token login bila dibiarkan.

---

## 0. Yang perlu disiapkan

- VPS Ubuntu 22.04+ (minimal 2 GB RAM; Baileys menahan koneksi terus-menerus)
- Domain, mis. `app.domain.com` (frontend) dan `api.domain.com` (backend)
- Docker + Docker Compose plugin

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # lalu logout & login lagi
```

---

## 1. Ambil kode

```bash
sudo mkdir -p /opt/wa-gateway && sudo chown $USER /opt/wa-gateway
cd /opt/wa-gateway
# clone repo atau upload lewat rsync/scp
```

---

## 2. Generate secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # API_KEY_ENCRYPTION_SECRET
```

Keduanya **harus berbeda**. Jangan pakai nilai contoh.

---

## 3. Konfigurasi

```bash
cp .env.production.example .env.production
nano .env.production
```

Isi minimal:

```env
JWT_SECRET=<hex 64 karakter>
API_KEY_ENCRYPTION_SECRET=<hex 64 karakter berbeda>
POSTGRES_PASSWORD=<password kuat>
PUBLIC_FRONTEND_URL=https://app.domain.com
PUBLIC_API_URL=https://api.domain.com
```

Kunci `.env.production` agar tidak terbaca proses lain:

```bash
chmod 600 .env.production
```

---

## 4. Direktori persisten (WAJIB)

Sesi WhatsApp dan lampiran disimpan di luar container. **Tanpa langkah ini, setiap
redeploy menghapus pairing dan semua user harus scan QR ulang.**

```bash
sudo mkdir -p /var/lib/wa-gateway/wa-sessions /var/lib/wa-gateway/uploads
# Container berjalan sebagai user non-root (uid 999)
sudo chown -R 999:999 /var/lib/wa-gateway
sudo chmod 750 /var/lib/wa-gateway
```

---

## 5. Jalankan

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
atau
```bash
cd /opt/wa-gateway
docker compose -f docker-compose.prod.yml --env-file .env.production exec api npx prisma db push
```

Cek status dan log:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
curl -s localhost:4000/health
```

---

## 6. Migrasi database & akun admin

Jalankan sekali setelah container hidup:

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma db push

# Buat admin; tentukan password sendiri agar tidak perlu mencatat output acak
docker compose -f docker-compose.prod.yml exec \
  -e ADMIN_EMAIL=admin@domain.com \
  -e ADMIN_PASSWORD='passwordkuat123' \
  api node prisma/seed-admin.js
```

---

## 7. Reverse proxy + HTTPS

Backend dan frontend tidak boleh diakses langsung; letakkan di belakang Nginx.
Contoh `/etc/nginx/sites-available/wa-gateway`:

```nginx
server {
    listen 80;
    server_name app.domain.com;
    client_max_body_size 20m;   # harus >= MAX_UPLOAD_MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.domain.com;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        # Socket.IO butuh upgrade header, kalau tidak, status realtime mati
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;   # koneksi WhatsApp berumur panjang
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan dan pasang sertifikat:

```bash
sudo ln -s /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d app.domain.com -d api.domain.com
```

**Wajib**: `API_PORT`/`FRONTEND_PORT` sebaiknya hanya di-bind ke localhost. Ubah di
`docker-compose.prod.yml` menjadi `"127.0.0.1:4000:4000"` agar tidak bisa diakses
langsung dari internet.

---

## 8. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Port 4000/3000 tidak perlu dibuka bila Nginx sudah di depan.

---

## 9. Backup

Yang wajib di-backup: **database** dan **sesi WhatsApp**.

```bash
# Database
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres wa_gateway | gzip > backup-$(date +%F).sql.gz

# Sesi WhatsApp (agar tidak perlu scan QR ulang setelah restore)
sudo tar czf wa-sessions-$(date +%F).tar.gz -C /var/lib/wa-gateway wa-sessions
```

---

## 10. Update versi

```bash
cd /opt/wa-gateway
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma db push
```

Karena `/var/lib/wa-gateway` adalah volume terpisah, sesi WhatsApp **tidak** hilang.

### Setelah mengubah kode frontend

Frontend **wajib di-rebuild tanpa cache**, karena `NEXT_PUBLIC_*` di-inline saat
build. `up -d` saja tidak cukup bila image lama sudah ada:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build --no-cache frontend
docker compose -f docker-compose.prod.yml --env-file .env.production up -d frontend
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=50 frontend
```

Pastikan tidak ada `Error:` di log. Verifikasi:

```bash
curl -I http://127.0.0.1:3100        # harus 200, bukan 500
```

### Selalu jalankan pemeriksaan sebelum deploy

```bash
cd frontend
npm run check     # boundary check + eslint + build
```

Beberapa error Next.js **tidak** muncul saat `next build` dan hanya tampil sebagai
**HTTP 500 saat runtime**. `scripts/check-server-components.mjs` menangkap kelas bug
tersebut secara statis — mis. event handler (`onError`, `onClick`) di Server Component,
yang pernah menyebabkan landing page 500 di produksi meski build sukses.

Untuk uji penuh sebelum naik ke VPS:

```bash
npm run verify    # build lalu jalankan mode produksi lokal, uji halaman utama
```


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
pm2 save && pm2 startup    # ikuti perintah yang dicetak
```

Set `JWT_SECRET`, `API_KEY_ENCRYPTION_SECRET`, `DATABASE_URL`, `REDIS_URL`, dan
`FRONTEND_URL` di `backend/.env` (mode `chmod 600`) sebelum menjalankan PM2.

---

## Checklist sebelum go-live

- [ ] `JWT_SECRET` dan `API_KEY_ENCRYPTION_SECRET` di-generate acak dan berbeda
- [ ] `FRONTEND_URL` dan `PUBLIC_BASE_URL` memakai domain HTTPS, bukan localhost
- [ ] `.env.production` ber-permission `600` dan tidak ikut ter-commit
- [ ] `/var/lib/wa-gateway` persisten dan di-backup
- [ ] Redis jalan (kalau mati, broadcast hilang saat server restart)
- [ ] Nginx meneruskan header `Upgrade` (kalau tidak, status realtime tidak jalan)
- [ ] `client_max_body_size` Nginx >= `MAX_UPLOAD_MB`
- [ ] Akun admin dibuat dengan password kuat
- [ ] Backup database terjadwal (cron)
- [ ] Log rotation aktif agar disk tidak penuh
