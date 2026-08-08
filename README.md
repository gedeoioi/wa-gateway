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
- Pencarian kontan
- Import/export

### Manajemen User & Keamanan
- Multi-user dengan role (Admin, Operator, Viewer)
- Admin dapat menambah/menghapus user
- Data per-user terisolasi (setiap user hanya melihat data miliknya)
- Ganti password
- Account lockout setelah 5x gagal login (15 menit)
- Login history tracking
- Revoke sessions

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
| WhatsApp | Baileys (whatsapp-web.js alternative) |
| Auth | JWT (access + refresh token) |

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

Segera ganti password setelah login pertama kali.

## Struktur Project

```
wa-gateway/
├── apps/
│   ├── backend/          # Express.js API
│   │   ├── src/
│   │   │   ├── controllers/   # Route handlers
│   │   │   ├── middleware/     # Auth, validation, error handler
│   │   │   ├── routes/        # API routes
│   │   │   ├── services/      # WhatsApp service
│   │   │   ├── lib/           # Prisma, Redis, Socket, Queue
│   │   │   └── utils/         # Helper functions
│   │   └── package.json
│   └── frontend/         # Next.js dashboard
│       ├── src/
│       │   ├── app/           # Pages (login, dashboard, devices, etc)
│       │   ├── components/    # Reusable components
│       │   ├── hooks/         # Custom hooks
│       │   ├── lib/           # API client, Socket
│       │   └── providers/     # Auth provider
│       └── package.json
├── prisma/
│   ├── schema.prisma     # Database schema
│   ├── migrations/       # Database migrations
│   └── seed.ts           # Seed data
├── docker/               # Docker configs
├── docker-compose.yml
└── package.json          # Monorepo root
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register user baru |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/profile` | Get profile |
| PUT | `/api/v1/auth/change-password` | Ganti password |
| GET | `/api/v1/auth/login-history` | Login history |
| GET | `/api/v1/auth/session` | Active session info |
| POST | `/api/v1/auth/revoke-sessions` | Revoke all sessions |

### Devices
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/devices` | List devices |
| POST | `/api/v1/devices` | Tambah device |
| POST | `/api/v1/devices/:id/connect` | Connect device |
| POST | `/api/v1/devices/:id/disconnect` | Disconnect device |
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

### Admin (Admin only)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/auth/users` | List semua user |
| POST | `/api/v1/auth/users` | Buat user baru |
| PUT | `/api/v1/auth/users/:id` | Update user |
| DELETE | `/api/v1/auth/users/:id` | Hapus user |

## Role Permissions

| Feature | Admin | Operator | Viewer |
|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ |
| Devices (CRUD) | ✅ | ✅ | Read only |
| Messages (send) | ✅ | ✅ | Read only |
| Broadcasts (CRUD) | ✅ | ✅ | Read only |
| Contacts (CRUD) | ✅ | ✅ | Read only |
| Manage Users | ✅ | ❌ | ❌ |
| Delete Users | ✅ | ❌ | ❌ |
| Change Password | ✅ | ✅ | ✅ |

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
| `NEXT_PUBLIC_API_URL` | API URL (frontend) | `http://localhost:3001` |

## License

MIT
