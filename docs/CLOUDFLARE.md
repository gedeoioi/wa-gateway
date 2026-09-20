# Cloudflare + WA Gateway

Panduan agar API tetap dapat diakses saat domain di-proxy Cloudflare.
Bagian 1 adalah penyebab **522** yang paling sering; bagian 2 konfigurasi wajib;
bagian 3 hal yang sudah ditangani aplikasi.

---

## 1. Penyebab 522 (Cloudflare tidak bisa menjangkau origin)

522 artinya Cloudflare **gagal menghubungi server Anda**. Aplikasi bisa 100% sehat
sementara pengguna tetap melihat 522. Periksa berurutan dari atas.

### Sudah diverifikasi di VPS Anda (semua benar)

```
✔ Nginx listen 80 & 443 di 0.0.0.0 dan [::]
✔ curl http://127.0.0.1  -H "Host: wa.deoioi.my.id"  -> 301
✔ curl https://127.0.0.1 -H "Host: wa.deoioi.my.id"  -> 200
✔ nginx -t lolos, service running
✔ ufw: 80/tcp, 443/tcp ALLOW
```

Karena semua di dalam VPS benar, penyebabnya ada di **luar** VPS.

### AWS Security Group (paling mungkin pada EC2)

Hostname `ip-172-26-…` menandakan EC2. `ufw` di dalam instance **tidak** membuka
Security Group — itu lapisan terpisah.

**EC2 → Instances → pilih instance → Security → Security groups → Edit inbound rules**

| Type | Protocol | Port | Source |
| --- | --- | --- | --- |
| HTTP | TCP | 80 | `0.0.0.0/0` |
| HTTPS | TCP | 443 | `0.0.0.0/0` |

Verifikasi dari luar VPS (bukan dari dalam):

```bash
curl -sI --max-time 10 http://$(curl -s ifconfig.me)/health -H "Host: api.deoioi.my.id"
```

### DNS mengarah ke IP yang benar

Kalau instance pernah stop/start tanpa Elastic IP, IP publiknya berubah dan DNS
jadi menunjuk ke alamat lama → 522.

```bash
dig +short api.deoioi.my.id          # dari luar
curl -s ifconfig.me                  # IP publik VPS sekarang
```

Samakan nilai A record di Cloudflare DNS. Untuk permanen: pasang **Elastic IP**.

### Cloudflare SSL mode harus Full (strict)

Mode **Flexible** membuat Cloudflare mengirim HTTP ke origin, lalu Nginx
mengalihkan ke HTTPS, lalu Cloudflare mengalihkan lagi → **redirect loop**, sering
tampil sebagai error. Cek: **Cloudflare → SSL/TLS → Overview → Full (strict)**.

Pastikan juga **Always Use HTTPS** menyala, dan origin punya sertifikat valid
(Certbot sudah memasangnya).

---

## 2. Konfigurasi wajib di Cloudflare

### WebSocket harus aktif

Cloudflare mengaktifkan WebSocket secara default, tapi bila pernah dimatikan,
status realtime (koneksi device, progres broadcast) tidak akan jalan.

**Cloudflare → Network → WebSockets → On**

Aplikasi sudah punya fallback: bila WebSocket gagal, Socket.IO otomatis turun ke
HTTP long-polling. Jadi fitur tetap bekerja, hanya lebih lambat.

### Jangan cache endpoint API

Sudah ditangani aplikasi lewat header, tapi pastikan tidak ada **Page Rule** atau
**Cache Rule** yang memaksa cache pada `/api/*`. Buat rule eksplisit bila perlu:

**Cloudflare → Rules → Cache Rules → Create**

```
When: URI Path starts with /api/
Then: Bypass cache
```

Lakukan hal sama untuk `/socket.io/*`, `/health`, dan `/docs`.

### Body upload

Cloudflare Free membatasi **100 MB** per request. `MAX_UPLOAD_MB` di aplikasi
default 16 MB, jadi aman. Cloudflare juga menolak request >100s — broadcast tetap
aman karena berjalan **asinkron** di queue (respons `202` langsung dikembalikan).

### Timeout

Cloudflare Free memutus koneksi setelah **100 detik**. Operasi berat di aplikasi ini
sudah asinkron (broadcast masuk queue), jadi tidak ada request yang menunggu lama.

---

## 3. Yang sudah ditangani aplikasi

Setelah perubahan di commit terakhir, ini tidak perlu Anda konfigurasi:

| Masalah | Penanganan |
| --- | --- |
| **522 karena keep-alive mismatch** | `keepAliveTimeout` 120s (> idle 100s Cloudflare), `headersTimeout` 125s. Default Node 5s menutup socket lebih dulu → Cloudflare mengirim request ke koneksi mati → 522. |
| **IP klien salah di balik proxy** | `trust proxy` = `TRUST_PROXY_HOPS` (default 2: Cloudflare → Nginx). Salah nilai membuat rate limit salah sasaran atau bisa dipalsukan. |
| **Respons API ter-cache** | Middleware menambahkan `Cache-Control: no-store`, `CDN-Cache-Control: no-store`, dan `Cloudflare-CDN-Cache-Control: no-store` untuk `/api`, `/socket.io`, `/health`, `/openapi.json`. |
| **WebSocket gagal total** | Frontend tidak lagi memaksa `["websocket"]`, tapi `["websocket", "polling"]` dengan `tryAllTransports`. |
| **Koneksi realtime idle diputus** | `pingInterval` 25s dan `pingTimeout` 30s, jauh di dalam jendela 100s Cloudflare. |
| **Upload ter-cache** | `/uploads` memakai `maxAge: 1h` eksplisit — aman di-cache karena isinya statis. |

### Variabel yang perlu diset

```env
# .env.production
TRUST_PROXY_HOPS=2          # 1 = hanya Nginx, 2 = Cloudflare -> Nginx
PUBLIC_API_URL=https://api.deoioi.my.id        # tanpa /api
PUBLIC_FRONTEND_URL=https://wa.deoioi.my.id
```

Kalau Cloudflare dilewati (DNS-only) dan hanya Nginx di depan, set
`TRUST_PROXY_HOPS=1`. Salah nilai tidak fatal, tapi rate limit akan salah membaca IP.

---

## 4. Nginx di belakang Cloudflare

Tambahkan header agar log Nginx mencatat IP asli (bukan IP Cloudflare):

```nginx
server {
    listen 80;
    server_name api.deoioi.my.id;

    # Percayai Cloudflare sebagai sumber X-Forwarded-For
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 104.16.0.0/13;
    # ... daftar lengkap: https://www.cloudflare.com/ips-v4
    real_ip_header CF-Connecting-IP;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        # Wajib untuk WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Harus LEBIH BESAR dari keepAliveTimeout Node (120s),
        # kalau tidak Nginx menutup koneksi lebih dulu.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aturan selaras timeout (jangan diubah sembarangan):

```
Cloudflare (100s)  <  Nginx proxy_read_timeout (300s)  >  Node keepAliveTimeout (120s)
```

Nginx harus **lebih panjang** dari Node, kalau tidak Nginx memutus koneksi yang
masih hidup dan Cloudflare menerima koneksi mati.

---

## 5. Diagnosa

```bash
# 1. Dari dalam VPS — membuktikan aplikasi sehat
curl -s http://127.0.0.1:4000/health
curl -sI http://127.0.0.1:3100 | head -2

# 2. Lewat Nginx lokal
curl -sI -H "Host: api.deoioi.my.id" http://127.0.0.1/health | head -2

# 3. Lewat Cloudflare
curl -sI https://api.deoioi.my.id/health | head -5
```

| Langkah 1 | Langkah 2 | Langkah 3 | Artinya |
| --- | --- | --- | --- |
| 200 | 200 | 200 | Semua benar |
| 200 | 200 | 522 | **Security Group / firewall**, atau DNS salah |
| 200 | gagal | 5xx | Konfigurasi Nginx |
| gagal | gagal | 522 | Container mati — cek `./doctor.sh` |

Bila langkah 1 dan 2 berhasil tapi 3 tidak, **tidak ada yang bisa diperbaiki di
aplikasi** — periksa Security Group, DNS, dan mode SSL Cloudflare.

---

## 6. Alternatif: bypass Cloudflare untuk API

Kalau 522 terus berulang dan Anda butuh API segera jalan, set record `api` ke
**DNS only** (awan abu-abu) di Cloudflare. Origin tetap terlindungi karena Nginx
sudah memasang HTTPS via Certbot.

Konsekuensinya:

- Kehilangan proteksi DDoS dan WAF Cloudflare untuk subdomain itu
- IP VPS terekspos publik
- Perlu membuka 443 di Security Group (sudah perlu sebelumnya)

Cara ini sah sebagai solusi sementara; perbaiki Security Group tetap disarankan
supaya bisa kembali memakai proxy Cloudflare.
