# syntax=docker/dockerfile:1
#
# x-loc-cache — SQLite backend, containerised.
#
# An alternative to the bare-metal systemd deploy in README.md. Same code, same
# XLOC_* configuration; the container just replaces the service unit and the
# manual Node install. Everything the process needs is one directory (/data) and
# one TCP port.
#
#   docker build -t x-loc-cache .
#   docker run -d --name x-loc-cache -p 127.0.0.1:8787:8787 \
#     -v x-loc-data:/data --restart unless-stopped x-loc-cache
#
# Or `docker compose up -d` — see compose.yaml.

# --- builder -----------------------------------------------------------------
# better-sqlite3 is a native module, so its binary must be built against the
# same Node ABI and libc that will run it. Doing that in a separate stage keeps
# the compiler out of the shipped image while guaranteeing the match: both
# stages are the same base.
#
# npm's prebuild-install downloads a ready binary when one exists for this
# platform. The toolchain below is the fallback for when it doesn't (a new Node
# ABI, arm64, a musl base) — without it that case fails the build outright
# instead of quietly compiling.
FROM node:24-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# --- runtime -----------------------------------------------------------------
FROM node:24-slim

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
# schema.sql sits beside src/ because openDatabase() reads it at
# `import.meta.dirname/../schema.sql`. Keep this layout.
COPY package.json schema.sql ./
COPY src ./src

# Two defaults differ from the bare-metal ones, both forced by the container:
#   XLOC_HOST — 127.0.0.1 is loopback *inside the network namespace*, so a
#               published port would reach nothing. Bind all interfaces and let
#               Docker's port mapping (or a compose network) do the confining.
#   XLOC_DB   — under /data, the one path that outlives the container.
# Everything else keeps its code default; override with -e or compose.
ENV XLOC_HOST=0.0.0.0 \
    XLOC_PORT=8787 \
    XLOC_DB=/data/x-loc-cache.db

# Created here, before USER, so a *named* volume inherits node:node ownership.
# A bind mount does not — it keeps the host directory's owner, so mounting one
# needs `chown 1000:1000` on the host side first.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
EXPOSE 8787

# Uses Node's own global fetch rather than curl/wget, neither of which is in the
# slim base — no extra layer just to answer a health probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.XLOC_PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so node is PID 1 and receives SIGTERM directly — node-server.ts
# installs its own handler to drain connections and checkpoint WAL, which is
# exactly what `docker stop` needs. No init shim required.
#
# --experimental-strip-types is accepted silently on Node 24 (stripping is
# already the default); it is kept so this line stays identical to the systemd
# unit's ExecStart, which must support 22.6+.
CMD ["node", "--experimental-strip-types", "src/node-server.ts"]
