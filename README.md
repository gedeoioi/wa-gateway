# WA Gateway - WhatsApp Gateway Enterprise

WhatsApp Gateway Enterprise untuk mengirim pesan, broadcast, dan mengelola perangkat WhatsApp secara terpusat melalui web dashboard.

## Fitur

### Manajemen Perangkat
- Koneksikan beberapa nomor WhatsApp
- QR code scanning untuk pairing
- Status real-time (connected, disconnected, connecting)
- Auto-reconnect

### Pesan & Broadcast
- Kirim pesan teks, gambar, video, dokumen, audio
- Broadcast ke ribuan kontak sekaligus
- Penjadwalan broadcast
- Statistik pengiriman (sent, delivered, failed)

### Kontak
- Kelola daftar kontak
- Grup kontak
- Pencarian kontak
- Import/export

### Manajemen User & Keamanan
- Multi-user dengan role (Admin, Operator, Viewer)
- Admin dapat menambah/menghapus user
- Data per-user terisolasi (setiap user hanya melihat data miliknya)
- Ganti password
- Account lockout setelah 5x gagal login (15 menit)
- Login history tracking (IP, user agent, status)
- Revoke all sessions
- Active session monitoring

### API
- RESTful API dengan JWT authentication
- Refresh token rotation
- Swagger API documentation (`/api-docs`)
- WebSocket untuk real-time updates

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind CSS, TypeScript |
| Backend | Express.js, TypeScript, Prisma ORM |
| Database | MySQL 8.0 |
| Queue | Redis + BullMQ |
| WhatsApp | Baileys |
| Auth | JWT (access + refresh token) |
| Process Manager | PM2 |
| Reverse Proxy | Nginx |

## Prerequisites

- Node.js >= 22
- MySQL 8.0
- Redis

## Instalasi

### 1. Clone repository

```bash
git clone https://github.com/yourusername/wa-gateway.git
cd wa-gateway
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment

```bash
cp .env.example .env
```

Edit `.env` dan sesuaikan:

```env
DATABASE_URL="mysql://root:password@localhost:3306/wa_gateway"
REDIS_URL="redis://localhost:6379"
JWT_SECRET=<generate-random-secret>
JWT_REFRESH_SECRET=<generate-random-refresh-secret>
```

Generate secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Setup database

```bash
# Generate Prisma Client
npm run db:generate

# Jalankan migrasi
npm run db:migrate

# Seed database (buat user admin default)
npm run db:seed
```

### 5. Jalankan aplikasi

```bash
# Development (backend + frontend)
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Docs: http://localhost:3001/api-docs

## Docker

```bash
docker-compose up -d
```

Ini akan menjalankan MySQL, Redis, Backend, Frontend, dan Nginx secara bersamaan.

## Default Credentials

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

Segera ganti password setelah login pertama kali melalui menu **Settings > Security > Change Password**.

## Deploy ke VPS

### Spesifikasi Minimum

| Resource | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Storage | 20 GB | 40 GB |

### Install Dependencies di VPS

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# MySQL
sudo apt install -y mysql-server
sudo systemctl start mysql && sudo systemctl enable mysql

# Redis
sudo apt install -y redis-server
sudo systemctl start redis-server && sudo systemctl enable redis-server

# PM2 & Nginx
sudo npm install -g pm2
sudo apt install -y nginx
```

### Setup MySQL

```sql
sudo mysql
CREATE DATABASE wa_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wa_user'@'localhost' IDENTIFIED BY 'PASSWORD_KUAT';
GRANT ALL PRIVILEGES ON wa_gateway.* TO 'wa_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Deploy

```bash
cd /var/www
git clone https://github.com/yourusername/wa-gateway.git
cd wa-gateway
npm install
cp .env.example .env
nano .env  # Edit sesuai kebutuhan

npm run db:generate
npm run db:migrate
npm run db:seed
npm run build

pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### Setup Nginx

```bash
sudo nano /etc/nginx/sites-available/wa-gateway
```

```nginx
server {
    listen 80;
    server_name domain-anda.com www.domain-anda.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    location /api-docs {
        proxy_pass http://127.0.0.1:3001;
    }

    client_max_body_size 10M;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Setup SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d domain-anda.com -d www.domain-anda.com
```

### Menghubungkan Domain

1. Beli domain dari registrar (Niagahoster, Cloudflare, Namecheap, dll)
2. Tambah DNS A record:

| Type | Name | Value |
|---|---|---|
| A | `@` | `IP_VPS` |
| A | `www` | `IP_VPS` |

3. Update `.env` di VPS:
```env
FRONTEND_URL=https://domain-anda.com
```

4. Rebuild dan restart:
```bash
npm run build:frontend
pm2 restart all
```

5. Install SSL dengan Certbot

Panduan lengkap tersedia di file `docs/Deploy_VPS_WA_Gateway.docx`.

## Struktur Project

```
wa-gateway/
+-- apps/
�   +-- backend/          # Express.js API
�   �   +-- src/
�   �   �   +-- controllers/   # Route handlers
�   �   �   +-- middleware/     # Auth, validation, error handler
�   �   �   +-- routes/        # API routes
�   �   �   +-- services/      # WhatsApp service
�   �   �   +-- lib/           # Prisma, Redis, Socket, Queue
�   �   �   +-- utils/         # Helper functions
�   �   +-- package.json
�   +-- frontend/         # Next.js dashboard
�       +-- src/
�       �   +-- app/           # Pages (login, dashboard, devices, etc)
�       �   +-- components/    # Reusable components
�       �   +-- hooks/         # Custom hooks
�       �   +-- lib/           # API client, Socket
�       �   +-- providers/     # Auth provider
�       +-- package.json
+-- prisma/
�   +-- schema.prisma     # Database schema
�   +-- migrations/       # Database migrations
�   +-- seed.ts           # Seed data
+-- docs/
�   +-- Deploy_VPS_WA_Gateway.docx
+-- docker/               # Docker configs
+-- docker-compose.yml
+-- ecosystem.config.js   # PM2 config
+-- package.json          # Monorepo root
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register user baru |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/profile` | Get profile |
| PUT | `/api/v1/auth/profile` | Update profile |
| PUT | `/api/v1/auth/change-password` | Ganti password |
| GET | `/api/v1/auth/login-history` | Login history |
| GET | `/api/v1/auth/session` | Active session info |
| POST | `/api/v1/auth/revoke-sessions` | Revoke all sessions |

### Admin (Admin only)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/auth/users` | List semua user |
| POST | `/api/v1/auth/users` | Buat user baru |
| PUT | `/api/v1/auth/users/:id` | Update user (role, status) |
| DELETE | `/api/v1/auth/users/:id` | Hapus user |

### Devices
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/devices` | List devices |
| POST | `/api/v1/devices` | Tambah device |
| PUT | `/api/v1/devices/:id` | Update device |
| POST | `/api/v1/devices/:id/connect` | Connect device |
| POST | `/api/v1/devices/:id/disconnect` | Disconnect device |
| GET | `/api/v1/devices/:id/qr` | Get QR code |
| DELETE | `/api/v1/devices/:id` | Hapus device |

### Messages
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/messages` | List messages |
| GET | `/api/v1/messages/stats` | Message statistics |
| POST | `/api/v1/messages/send` | Kirim pesan |

### Broadcasts
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/broadcasts` | List broadcasts |
| GET | `/api/v1/broadcasts/:id` | Detail broadcast |
| POST | `/api/v1/broadcasts` | Buat broadcast |
| POST | `/api/v1/broadcasts/:id/start` | Mulai broadcast |
| POST | `/api/v1/broadcasts/:id/cancel` | Batalkan broadcast |
| DELETE | `/api/v1/broadcasts/:id` | Hapus broadcast |

### Contacts
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/contacts` | List contacts |
| POST | `/api/v1/contacts` | Tambah contact |
| PUT | `/api/v1/contacts/:id` | Update contact |
| DELETE | `/api/v1/contacts/:id` | Hapus contact |
| GET | `/api/v1/contacts/groups` | List groups |
| POST | `/api/v1/contacts/groups` | Buat group |
| DELETE | `/api/v1/contacts/groups/:id` | Hapus group |

## Role Permissions

| Feature | Admin | Operator | Viewer |
|---|---|---|---|
| Dashboard | ? | ? | ? |
| Devices (CRUD) | ? | ? | Read only |
| Devices (Delete) | ? | ? | ? |
| Messages (send) | ? | ? | Read only |
| Broadcasts (CRUD) | ? | ? | Read only |
| Broadcasts (Delete) | ? | ? | ? |
| Contacts (CRUD) | ? | ? | Read only |
| Contacts (Delete) | ? | ? | ? |
| Manage Users | ? | ? | ? |
| Change Password | ? | ? | ? |
| Login History | ? | ? | ? |
| Revoke Sessions | ? | ? | ? |

## Fitur Keamanan

| Fitur | Detail |
|---|---|
| Account Lockout | 5x gagal login ? akun terkunci 15 menit |
| Login History | Setiap percobaan login dicatat (IP, user agent, status) |
| Active Session | Monitor session aktif saat ini |
| Revoke Sessions | Paksa logout dari semua device lain |
| Password Tracking | Catat kapan terakhir ganti password |
| Per-User Data Isolation | Setiap user hanya bisa akses data miliknya sendiri |

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | MySQL connection string | - |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_REFRESH_SECRET` | Refresh token secret | - |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |
| `BACKEND_PORT` | Backend port | `3001` |
| `FRONTEND_URL` | Frontend URL (for CORS) | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API URL (frontend, kosongkan untuk relative) | `http://localhost:3001` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket URL (frontend) | `http://localhost:3001` |

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Prisma migrate shadow database error | Grant CREATE permission: `GRANT ALL ON *.* TO 'user'@'localhost'` |
| PM2 backend not running | `npm run build:backend` lalu `pm2 restart wa-gateway-backend` |
| Failed to fetch (deploy) | Rebuild frontend: `npm run build:frontend` lalu `pm2 restart wa-gateway-frontend` |
| Rate limit exceeded | Sudah di-fix, development: 10k req/15min, production: 100 req/15min |
| Nginx 502 Bad Gateway | Cek backend: `pm2 status` dan `curl http://localhost:3001/health` |
| SSL certbot failed | Pastikan DNS A record sudah mengarah ke IP VPS dan port 80 terbuka |

## License

MIT
