#!/usr/bin/env bash
#
# Deploy WA Gateway ke VPS. Satu perintah, dengan verifikasi di setiap langkah.
#
#   ./deploy.sh              # deploy / update
#   ./deploy.sh --first-time # deploy pertama kali (termasuk DB & admin)
#   ./deploy.sh --check      # hanya periksa konfigurasi, tidak mengubah apa pun
#
# Skrip ini sengaja berhenti pada error pertama (set -e) supaya masalah tidak
# menumpuk seperti yang terjadi saat langkah dijalankan manual satu per satu.

set -Eeuo pipefail

# ---------------------------------------------------------------- konfigurasi
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
FRONTEND_PORT_DEFAULT=3100
API_PORT_DEFAULT=4000
DATA_DIR="/var/lib/wa-gateway"

# --------------------------------------------------------------------- warna
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'
  BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; NC=""
fi

STEP=0
step()  { STEP=$((STEP + 1)); printf '\n%s[%d] %s%s\n' "$BOLD$BLUE" "$STEP" "$*" "$NC"; }
ok()    { printf '    %s✔%s %s\n' "$GREEN" "$NC" "$*"; }
warn()  { printf '    %s!%s %s\n' "$YELLOW" "$NC" "$*"; }
note()  { printf '    %sℹ%s %s\n' "$BLUE" "$NC" "$*"; }

# Exits with a clear message. Disables the ERR trap first so the failure is
# reported once instead of twice.
die() {
  trap - ERR
  printf '\n    %s✘ %s%s\n\n' "$RED" "$*" "$NC" >&2
  exit 1
}

# Only unexpected command failures reach this trap.
on_error() {
  local exit_code=$?
  trap - ERR
  printf '\n    %s✘ Gagal di langkah %d (exit %d)%s\n' "$RED" "$STEP" "$exit_code" "$NC" >&2
  printf '\n    Lihat log untuk detail:\n' >&2
  printf '      docker compose -f %s --env-file %s logs --tail=60\n\n' "$COMPOSE_FILE" "$ENV_FILE" >&2
  exit "$exit_code"
}
trap on_error ERR

read_env() {
  # Read one value from .env.production without sourcing (executing) the file.
  # Returns empty when the key is absent; never fails the script.
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi
  awk -v k="$key" '
    $0 ~ "^" k "=" { sub("^" k "=", ""); value = $0 }
    END { if (value != "") print value }
  ' "$ENV_FILE" || true
}

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

usage() {
  cat <<'USAGE'

WA Gateway — Deploy

  ./deploy.sh                Deploy atau update
  ./deploy.sh --first-time   Deploy pertama kali (termasuk DB & akun admin)
  ./deploy.sh --check        Periksa konfigurasi saja, tanpa mengubah apa pun
  ./deploy.sh --help         Tampilkan bantuan ini

USAGE
}

FIRST_TIME=0
CHECK_ONLY=0

case "${1:-deploy}" in
  deploy)       : ;;
  --first-time) FIRST_TIME=1 ;;
  --check)      CHECK_ONLY=1 ;;
  -h|--help)    usage; exit 0 ;;
  *)            printf '\nArgumen tidak dikenal: %s\n' "$1" >&2; usage; exit 1 ;;
esac


# =========================================================== 1. prasyarat
step "Memeriksa prasyarat"
cd "$(dirname "$0")"

command -v docker >/dev/null 2>&1 || die "docker tidak terinstall. Lihat https://get.docker.com"
ok "docker tersedia"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  die "$COMPOSE_FILE tidak ditemukan. Jalankan skrip ini dari root project."
fi
ok "$COMPOSE_FILE ditemukan"

if ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose plugin tidak tersedia. Install: https://docs.docker.com/compose/install/"
fi
ok "Docker Compose tersedia ($(docker compose version --short 2>/dev/null || echo '?'))"

# =========================================================== 2. env file
step "Memeriksa $ENV_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f ".env.production.example" ]]; then
    warn "$ENV_FILE belum ada — menyalin dari contoh"
    cp .env.production.example "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    die "$ENV_FILE baru dibuat. Isi JWT_SECRET, API_KEY_ENCRYPTION_SECRET, POSTGRES_PASSWORD, dan domain, lalu jalankan ulang."
  fi
  die "$ENV_FILE tidak ditemukan"
fi
ok "$ENV_FILE ada"

# Reject placeholders now rather than discovering them as a 500 in production.
# Matches both the full example value and any prefix of it, so a partially
# edited value is still caught.
PLACEHOLDER_PREFIXES=(
  "ganti-dengan"
  "ganti-password"
  "change-me"
  "dev-only"
)
missing=()
for key in JWT_SECRET API_KEY_ENCRYPTION_SECRET POSTGRES_PASSWORD PUBLIC_FRONTEND_URL PUBLIC_API_URL; do
  val="$(read_env "$key")"
  if [[ -z "$val" ]]; then
    missing+=("$key (kosong)")
    continue
  fi
  for ph in "${PLACEHOLDER_PREFIXES[@]}"; do
    if [[ "$val" == "$ph"* ]]; then
      missing+=("$key (masih placeholder)")
      break
    fi
  done
done

if (( ${#missing[@]} > 0 )); then
  printf '    %s✘ Variabel berikut belum diisi dengan benar:%s\n' "$RED" "$NC"
  for item in "${missing[@]}"; do
    printf '        - %s\n' "$item"
  done
  cat <<EOF

    Generate secret acak (jalankan dua kali, nilainya harus BERBEDA):
      node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

    Lalu isi di $ENV_FILE
EOF
  die "Konfigurasi belum lengkap"
fi
ok "Kelima variabel wajib terisi dan bukan placeholder"

# Domains must be public; the backend refuses to start with localhost
for key in PUBLIC_FRONTEND_URL PUBLIC_API_URL; do
  val="$(read_env "$key")"
  if [[ "$val" == *localhost* || "$val" == *127.0.0.1* ]]; then
    die "$key masih '$val'. Harus domain publik, mis. https://app.domain.com"
  fi
  if [[ "$val" != https://* ]]; then
    warn "$key bukan https ($val). Certbot + HTTPS sangat disarankan."
  fi
done
ok "Domain publik terkonfigurasi"

jwt_val="$(read_env JWT_SECRET)"
aes_val="$(read_env API_KEY_ENCRYPTION_SECRET)"
if [[ "$jwt_val" == "$aes_val" ]]; then
  die "JWT_SECRET dan API_KEY_ENCRYPTION_SECRET tidak boleh sama"
fi
ok "Kedua secret berbeda"

# Port
FRONTEND_PORT="$(read_env FRONTEND_PORT)"
FRONTEND_PORT="${FRONTEND_PORT:-$FRONTEND_PORT_DEFAULT}"
API_PORT="$(read_env API_PORT)"
API_PORT="${API_PORT:-$API_PORT_DEFAULT}"

if [[ ! "$FRONTEND_PORT" =~ ^[0-9]+$ ]]; then
  die "FRONTEND_PORT tidak valid: '$FRONTEND_PORT'"
fi
ok "Port frontend: $FRONTEND_PORT (host) -> 3000 (container)"
ok "Port API: $API_PORT (host) -> 4000 (container)"

# Validate that compose can parse everything, without changing anything.
# `|| true` keeps `set -e` and the ERR trap from firing on an expected failure.
if ! compose config >/dev/null 2>&1; then
  printf '\n    %sOutput docker compose config:%s\n' "$YELLOW" "$NC" >&2
  compose config >&2 || true
  die "docker compose config gagal. Periksa sintaks $COMPOSE_FILE dan $ENV_FILE"
fi
ok "Konfigurasi compose valid"

if [[ "$CHECK_ONLY" == "1" ]]; then
  printf '\n%s%s%s\n\n' "$GREEN" "Pemeriksaan selesai — konfigurasi siap." "$NC"
  exit 0
fi

# =========================================================== 3. data dir
step "Menyiapkan direktori persisten"
if [[ ! -d "$DATA_DIR" ]]; then
  if [[ $EUID -eq 0 ]]; then
    mkdir -p "$DATA_DIR/wa-sessions" "$DATA_DIR/uploads"
  else
    sudo mkdir -p "$DATA_DIR/wa-sessions" "$DATA_DIR/uploads" || die "Gagal membuat $DATA_DIR"
  fi
  ok "$DATA_DIR dibuat"
else
  ok "$DATA_DIR sudah ada"
fi

# Container berjalan sebagai uid 999 (user 'wa' di image)
if [[ $EUID -eq 0 ]]; then
  chown -R 999:999 "$DATA_DIR" 2>/dev/null || warn "chown gagal (abaikan bila sudah benar)"
else
  sudo chown -R 999:999 "$DATA_DIR" 2>/dev/null || warn "chown gagal (abaikan bila sudah benar)"
fi
ok "Kepemilikan $DATA_DIR diatur ke uid 999"

# =========================================================== 4. build
step "Build image"
warn "Frontend di-build tanpa cache: NEXT_PUBLIC_* di-inline saat build,"
warn "jadi cache lama akan mempertahankan URL API yang salah."
compose build --no-cache frontend
compose build api worker
ok "Semua image berhasil di-build"

# =========================================================== 5. up
step "Menjalankan container"
# --force-recreate on worker: its healthcheck is defined in compose, and an
# existing container keeps the OLD healthcheck until it is recreated. Without
# this, the worker shows "unhealthy" forever even though it works fine.
compose up -d --remove-orphans --force-recreate worker
compose up -d --remove-orphans
ok "Container dijalankan"

# Helper: read a container's health by service name (avoids hardcoding the
# generated "project-service-1" container name, which depends on folder name).
# Never fails the script: returns "missing"/"unknown" instead.
service_health() {
  local svc="$1" cid
  cid="$(compose ps -q "$svc" 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then
    echo "missing"
    return 0
  fi
  docker inspect --format \
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$cid" 2>/dev/null || echo "unknown"
}

# =========================================================== 6. tunggu sehat
step "Menunggu layanan siap"
deadline=$((SECONDS + 180))
pg_ready=""
redis_ready=""
while (( SECONDS < deadline )); do
  pg_ready="$(service_health postgres)"
  redis_ready="$(service_health redis)"
  if [[ "$pg_ready" == "healthy" && "$redis_ready" == "healthy" ]]; then
    break
  fi
  sleep 3
done

if [[ "$pg_ready" != "healthy" ]]; then
  compose logs --tail=40 postgres || true
  die "PostgreSQL tidak sehat (status: $pg_ready)"
fi
if [[ "$redis_ready" != "healthy" ]]; then
  compose logs --tail=40 redis || true
  die "Redis tidak sehat (status: $redis_ready)"
fi
ok "PostgreSQL & Redis sehat"

# API harus bisa menjawab /health
api_ok=0
for (( _try = 0; _try < 40; _try++ )); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    api_ok=1; break
  fi
  sleep 2
done
if (( ! api_ok )); then
  printf '\n    %sLog API:%s\n' "$YELLOW" "$NC"
  compose logs --tail=40 api || true
  die "API tidak merespons di http://127.0.0.1:${API_PORT}/health"
fi
ok "API sehat di port $API_PORT"

# The worker runs no HTTP server, so verify it via its own heartbeat check.
# An unhealthy worker is not fatal: broadcasts still run inline in the API.
worker_state="$(service_health worker)"
if [[ "$worker_state" == "missing" ]]; then
  warn "worker tidak berjalan — broadcast akan dijalankan inline di proses API"
elif [[ "$worker_state" == "unhealthy" ]]; then
  worker_cid="$(compose ps -q worker 2>/dev/null || true)"
  worker_hc="$(docker inspect --format '{{json .Config.Healthcheck}}' "$worker_cid" 2>/dev/null || echo '')"
  worker_restarts="$(docker inspect --format '{{.RestartCount}}' "$worker_cid" 2>/dev/null || echo '?')"

  if [[ "$worker_hc" == *"/health"* && "$worker_hc" != *"healthcheck.js"* ]]; then
    # Old image: inherited the API's HTTP healthcheck, which can never pass
    warn "worker unhealthy karena healthcheck HTTP warisan image lama"
    compose up -d --build --force-recreate worker >/dev/null 2>&1 || true
    ok "worker di-rebuild dengan healthcheck yang benar"
  elif [[ "$worker_hc" == *pgrep* ]]; then
    # pgrep does not exist in node:bookworm-slim
    warn "worker unhealthy karena healthcheck pgrep (tidak tersedia di image)"
    compose up -d --build --force-recreate worker >/dev/null 2>&1 || true
    ok "worker di-rebuild dengan healthcheck heartbeat"
  else
    # Heartbeat is genuine: the worker really did stop updating it
    compose logs --tail=40 worker || true
    warn "worker tidak sehat (restarts=$worker_restarts) — broadcast akan jalan inline"
    warn "Lihat log di atas; API tetap melayani."
  fi
else
  ok "worker sehat"
fi

# =========================================================== 7. database
step "Menyinkronkan schema database"
compose exec -T api npx prisma db push --skip-generate
ok "Schema database tersinkron"

# =========================================================== 8. frontend
step "Memverifikasi frontend"
fe_ok=0
fe_code=""
for (( _try = 0; _try < 40; _try++ )); do
  fe_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${FRONTEND_PORT}/" 2>/dev/null || echo "000")
  if [[ "$fe_code" == "200" ]]; then
    fe_ok=1; break
  fi
  sleep 2
done

if (( ! fe_ok )); then
  printf '\n    %sLog frontend:%s\n' "$YELLOW" "$NC"
  compose logs --tail=60 frontend || true
  die "Frontend mengembalikan HTTP $fe_code di http://127.0.0.1:${FRONTEND_PORT}/"
fi
ok "Frontend mengembalikan 200 di port $FRONTEND_PORT"

# Halaman kunci harus ikut 200 (bug Server Component dulu hanya muncul di sini)
for path in /login /register /icon.svg /brand/logo.svg; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${FRONTEND_PORT}${path}" || echo "000")
  if [[ "$code" != "200" ]]; then
    compose logs --tail=40 frontend || true
    die "$path mengembalikan HTTP $code (harus 200)"
  fi
done
ok "Halaman /login, /register, dan aset brand semuanya 200"

# =========================================================== 9. admin
if [[ "$FIRST_TIME" == "1" ]]; then
  step "Membuat akun admin"
  ADMIN_EMAIL="$(read_env ADMIN_EMAIL)"
  ADMIN_PASSWORD="$(read_env ADMIN_PASSWORD)"

  if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
    warn "ADMIN_EMAIL / ADMIN_PASSWORD belum diisi di $ENV_FILE — dilewati."
    warn "Isi keduanya lalu jalankan './deploy.sh --first-time' lagi, atau buat manual:"
    printf '      docker compose -f %s --env-file %s exec -e ADMIN_EMAIL=admin@domain.com -e ADMIN_PASSWORD=%s api node prisma/seed-admin.js\n' \
      "$COMPOSE_FILE" "$ENV_FILE" "'passwordkuat'" >&2
  else
    compose exec -T \
      -e ADMIN_EMAIL="$ADMIN_EMAIL" \
      -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      api node prisma/seed-admin.js
    ok "Akun admin dibuat: $ADMIN_EMAIL"
  fi
fi

# =========================================================== 10. ringkasan
step "Ringkasan"
compose ps

FRONTEND_HOST="$(read_env PUBLIC_FRONTEND_URL)"
API_HOST="$(read_env PUBLIC_API_URL)"

cat <<EOF

    ${BOLD}Deploy selesai.${NC}

    Lokal   : frontend http://127.0.0.1:${FRONTEND_PORT} | api http://127.0.0.1:${API_PORT}/health
    Publik  : ${FRONTEND_HOST} | ${API_HOST}
    Docs    : ${API_HOST}/docs

    Nginx harus mengarah ke port host:
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};   # frontend
        proxy_pass http://127.0.0.1:${API_PORT};       # api

    Perintah berguna:
        ./deploy.sh --check      periksa konfigurasi saja
        ./deploy.sh              deploy ulang
        doctor.sh                diagnosa bila ada masalah

EOF
