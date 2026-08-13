# syntax=docker/dockerfile:1.6

# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Native build deps for better-sqlite3 (wave-1 persistence). The package
# normally ships a prebuilt binary, but on alpine/musl we sometimes fall
# back to compiling from source — having python3 + make + g++ ready
# avoids `npm ci` failures in that case.
RUN apk add --no-cache python3 make g++ build-base

# Install ALL deps (incl. dev) so tsc is available.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime

# Drop privileges. The official node image ships a `node` user (uid 1000).
ENV NODE_ENV=production
WORKDIR /app

# Production-only deps. better-sqlite3 may compile against node-gyp on
# alpine/musl when no prebuilt binary matches; keep the toolchain
# available for the install step, then strip it again to keep the image
# slim.
RUN apk add --no-cache --virtual .build-deps python3 make g++ build-base

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

RUN apk del .build-deps

# Compiled JS.
COPY --from=builder /app/dist ./dist

# Recordings + SQLite data dir owned by the non-root user.
RUN mkdir -p /app/recordings /app/data && chown -R node:node /app
USER node

EXPOSE 8787

# Container-native health probe hitting GET /api/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
