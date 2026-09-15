# ---- deps ------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# ---- build -----------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, so the API origin must be
# known here. Pass it as a build arg from docker compose.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd -r next && useradd -r -g next -m next

# `output: "standalone"` bundles only the files actually needed at runtime.
# All copies use --chown so nothing is left owned by root: the container runs
# as user `next`, and root-owned files break asset reads and healthcheck writes.
COPY --from=builder --chown=next:next /app/public ./public
COPY --from=builder --chown=next:next /app/.next/standalone ./
COPY --from=builder --chown=next:next /app/.next/static ./.next/static

USER next
EXPOSE 3000

# Uses node's built-in fetch rather than curl/wget, which are not present in
# node:bookworm-slim. A missing binary here would make the container report
# "unhealthy" forever while serving traffic perfectly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
