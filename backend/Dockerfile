# ---- build stage -----------------------------------------------------------
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Prisma needs openssl at generate time
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund \
    && npx prisma generate

# ---- runtime stage ---------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user; tini reaps zombies from the Baileys socket
RUN groupadd -r wa && useradd -r -g wa -m wa

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package*.json ./
COPY src ./src

# Persistent state must be mounted as volumes, otherwise every redeploy loses
# the WhatsApp pairing and users have to scan the QR again.
RUN mkdir -p /data/wa-sessions /data/uploads && chown -R wa:wa /data /app

USER wa

ENV WA_SESSION_DIR=/data/wa-sessions \
    UPLOAD_DIR=/data/uploads \
    PORT=4000

VOLUME ["/data"]

EXPOSE 4000

# Default healthcheck for the API (see docker-compose.prod.yml, where the worker
# overrides this with a process check because it runs no HTTP server).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
