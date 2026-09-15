#!/usr/bin/env bash
#
# Diagnosa WA Gateway. Tidak mengubah apa pun — hanya melaporkan.
#
#   ./doctor.sh
#
# Jalankan ini saat ada masalah, lalu kirimkan keluarannya.

set -uo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'
  BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; NC=""
fi

pass() { printf '  %s✔%s %s\n' "$GREEN" "$NC" "$1"; }
fail() { printf '  %s✘%s %s\n' "$RED" "$NC" "$1"; FAILED=$((FAILED + 1)); }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$NC" "$1"; }
info() { printf '  %sℹ%s %s\n' "$BLUE" "$NC" "$1"; }
# Named section() rather than head() so it does not shadow the `head` binary.
section() { printf '\n%s%s%s\n' "$BOLD" "$1" "$NC"; }

FAILED=0
WORKER_HC_STALE=0
read_env() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  awk -v k="$key" '
    $0 ~ "^" k "=" { sub("^" k "=", ""); value = $0 }
    END { if (value != "") print value }
  ' "$ENV_FILE" || true
}
compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@" 2>/dev/null || true; }

cd "$(dirname "$0")" || exit 1

printf '\n%sWA Gateway — Diagnosa%s\n' "$BOLD" "$NC"

# ------------------------------------------------------------------ berkas
section "Berkas"
[[ -f "$COMPOSE_FILE" ]] && pass "$COMPOSE_FILE ada" || fail "$COMPOSE_FILE tidak ditemukan"
[[ -f "$ENV_FILE" ]] && pass "$ENV_FILE ada" || fail "$ENV_FILE tidak ditemukan"

if [[ ! -f "$ENV_FILE" ]]; then
  printf '\n  Isi %s dulu, lalu jalankan lagi.\n\n' "$ENV_FILE"
  exit 1
fi

# ------------------------------------------------------------------- secret
section "Konfigurasi ($ENV_FILE)"
for key in JWT_SECRET API_KEY_ENCRYPTION_SECRET POSTGRES_PASSWORD PUBLIC_FRONTEND_URL PUBLIC_API_URL; do
  val="$(read_env "$key")"
  if [[ -z "$val" ]]; then
    fail "$key kosong"
  elif [[ "$val" == change-me* || "$val" == ganti-* ]]; then
    fail "$key masih placeholder"
  else
    pass "$key terisi"
  fi
done

jwt="$(read_env JWT_SECRET)"
aes="$(read_env API_KEY_ENCRYPTION_SECRET)"
if [[ -n "$jwt" && "$jwt" == "$aes" ]]; then
  fail "JWT_SECRET dan API_KEY_ENCRYPTION_SECRET sama (harus berbeda)"
else
  pass "Kedua secret berbeda"
fi

for key in PUBLIC_FRONTEND_URL PUBLIC_API_URL; do
  val="$(read_env "$key")"
  if [[ "$val" == *localhost* || "$val" == *127.0.0.1* ]]; then
    fail "$key masih localhost — backend akan menolak start"
  elif [[ "$val" != https://* ]]; then
    warn "$key bukan https"
  fi
done

FE_PORT="$(read_env FRONTEND_PORT)"; FE_PORT="${FE_PORT:-3100}"
API_PORT="$(read_env API_PORT)"; API_PORT="${API_PORT:-4000}"
printf '  %sℹ%s frontend port=%s (host) | api port=%s (host)\n' "$BLUE" "$NC" "$FE_PORT" "$API_PORT"

if ! compose config >/dev/null 2>&1; then
  fail "docker compose config gagal — periksa sintaks"
else
  pass "docker compose config valid"
fi

# ------------------------------------------------------------------- server
section "Container"
if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose tidak tersedia"
else
  pass "Docker Compose tersedia"
fi

for name in api frontend worker postgres redis; do
  cid="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q "$name" 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then
    if [[ "$name" == "worker" ]]; then
      warn "$name tidak berjalan (tidak wajib bila Redis dipakai inline)"
    else
      fail "$name tidak berjalan"
    fi
    continue
  fi

  state="$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null)"
  restarting="$(docker inspect --format '{{.RestartCount}}' "$cid" 2>/dev/null)"

  if [[ "$state" != "running" ]]; then
    fail "$name status=$state (restarts=$restarting)"
  elif [[ "$health" == "unhealthy" ]]; then
    if [[ "$name" == "worker" ]]; then
      # The worker ships its own heartbeat-based check. Distinguish the three
      # causes that look identical in `docker ps`.
      hc="$(docker inspect --format '{{json .Config.Healthcheck}}' "$cid" 2>/dev/null || echo '')"
      if [[ "$hc" == *"/health"* && "$hc" != *"healthcheck.js"* ]]; then
        fail "$name healthcheck masih memakai HTTP /health (warisan image lama, bukan kerusakan)"
        info "Perbaiki: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --force-recreate worker"
        WORKER_HC_STALE=1
      elif [[ "$hc" == *pgrep* ]]; then
        fail "$name healthcheck memakai pgrep, yang TIDAK ADA di node:bookworm-slim"
        info "Perbaiki: git pull, lalu docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --build --force-recreate worker"
        WORKER_HC_STALE=1
      else
        # Real problem: heartbeat stopped. Check whether it ever started.
        if compose logs --tail=200 worker 2>/dev/null | grep -q "worker heartbeat started"; then
          fail "$name unhealthy: heartbeat berhenti (worker macet atau crash)"
        else
          fail "$name unhealthy: worker gagal start (heartbeat tidak pernah jalan)"
        fi
        info "Cek: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs --tail=60 worker"
      fi
    else
      fail "$name running tapi UNHEALTHY (restarts=$restarting)"
    fi
  elif [[ "$health" == "healthy" ]]; then
    pass "$name running & healthy"
  else
    pass "$name running (health: $health)"
  fi
done

# --------------------------------------------------------------------- port
section "Port & endpoint lokal"
check_http() {
  local label="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "$expect" ]]; then
    pass "$label -> $code ($url)"
  else
    fail "$label -> $code (harus $expect) ($url)"
  fi
}

check_http "API health" "http://127.0.0.1:${API_PORT}/health"
check_http "Frontend /" "http://127.0.0.1:${FE_PORT}/"

# Halaman ini pernah 500 karena bug Server Component
for path in /login /register; do
  check_http "Frontend $path" "http://127.0.0.1:${FE_PORT}${path}"
done
for path in /icon.svg /brand/logo.svg; do
  check_http "Aset $path" "http://127.0.0.1:${FE_PORT}${path}"
done
check_http "Swagger docs" "http://127.0.0.1:${API_PORT}/docs/" "200"

# ------------------------------------------------------------------- nginx
section "Nginx"
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    pass "nginx -t lolos"
  else
    fail "nginx -t gagal — jalankan 'sudo nginx -t' untuk detail"
  fi

  conf="/etc/nginx/sites-available/wa-gateway"
  if [[ -f "$conf" ]]; then
    pass "$conf ada"

    if grep -q "127.0.0.1:${FE_PORT}" "$conf"; then
      pass "proxy_pass frontend menunjuk port $FE_PORT"
    else
      found=$(grep -oE 'proxy_pass http://127\.0\.0\.1:[0-9]+' "$conf" | head -n1 || true)
      fail "proxy_pass frontend TIDAK menunjuk $FE_PORT (ditemukan: ${found:-tidak ada})"
    fi

    if grep -q "127.0.0.1:${API_PORT}" "$conf"; then
      pass "proxy_pass API menunjuk port $API_PORT"
    else
      fail "proxy_pass API tidak menunjuk port $API_PORT"
    fi

    if grep -qE 'proxy_set_header\s+Upgrade' "$conf"; then
      pass "header Upgrade ada (Socket.IO / status realtime)"
    else
      fail "header Upgrade HILANG — status device tidak akan realtime"
    fi

    if grep -qE 'server_name[^;]*\s+wa\.' "$conf"; then
      pass "server_name frontend memakai subdomain (wa.*)"
    fi
  else
    warn "$conf tidak ditemukan"
  fi
else
  warn "nginx tidak terinstall (lewati bila pakai reverse proxy lain)"
fi

# --------------------------------------------------------------------- TLS
section "HTTPS"
FE_HOST="$(read_env PUBLIC_FRONTEND_URL)"
API_HOST="$(read_env PUBLIC_API_URL)"

# A 301/302 from http->https is correct behaviour, so follow redirects before
# judging the status code. Without this, a properly secured site looks broken.
check_public() {
  local label="$1" url="$2"
  if [[ -z "$url" ]]; then
    warn "$label dilewati (URL belum diisi)"
    return 0
  fi

  local effective code
  effective=$(curl -sIL -o /dev/null -w '%{http_code} %{url_effective}' --max-time 20 "$url" 2>/dev/null || echo "000 -")
  code="${effective%% *}"
  effective="${effective#* }"

  case "$code" in
    200) pass "$label -> 200 ($effective)" ;;
    000) fail "$label tidak dapat dijangkau ($url)" ;;
    301|302|307|308) fail "$label terlalu banyak redirect ($code) — cek mode SSL Cloudflare (harus Full strict)" ;;
    5*)  fail "$label -> $code ($effective)" ;;
    *)   warn "$label -> $code ($effective)" ;;
  esac
}

check_public "publik frontend" "$FE_HOST"
check_public "publik API health" "${API_HOST}/health"

# Cloudflare in Flexible mode sends HTTP to origin while Nginx redirects to
# HTTPS, producing an infinite loop. Detect it explicitly.
if command -v dig >/dev/null 2>&1 && [[ -n "$FE_HOST" ]]; then
  fe_domain="${FE_HOST#https://}"
  fe_domain="${fe_domain%%/*}"
  resolved="$(dig +short "$fe_domain" 2>/dev/null | head -n1 || true)"
  if [[ "$resolved" =~ ^(104\.|172\.6[4-9]\.|172\.7[0-1]\.) ]]; then
    info "$fe_domain via Cloudflare ($resolved) — pastikan SSL/TLS mode = Full (strict)"
  fi
fi

# -------------------------------------------------------------------- data
section "Data persisten"
if [[ -d /var/lib/wa-gateway ]]; then
  pass "/var/lib/wa-gateway ada"
  sess=$(find /var/lib/wa-gateway/wa-sessions -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)
  printf '  %sℹ%s sesi WhatsApp tersimpan: %s\n' "$BLUE" "$NC" "$sess"
else
  fail "/var/lib/wa-gateway tidak ada — sesi WhatsApp akan hilang saat redeploy"
fi

# ------------------------------------------------------------------ ringkas
section "Ringkasan"
if (( FAILED == 0 )); then
  printf '  %sSemua pemeriksaan lolos.%s\n\n' "$GREEN" "$NC"
else
  printf '  %s%d pemeriksaan gagal.%s\n' "$RED" "$FAILED" "$NC"
  printf '\n  Perintah bantu:\n'
  printf '    docker compose -f %s --env-file %s logs --tail=60 api\n' "$COMPOSE_FILE" "$ENV_FILE"
  printf '    docker compose -f %s --env-file %s logs --tail=60 frontend\n\n' "$COMPOSE_FILE" "$ENV_FILE"
fi

exit $(( FAILED > 0 ? 1 : 0 ))
