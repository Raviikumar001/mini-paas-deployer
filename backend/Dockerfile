# ── Stage 1: grab the Docker CLI binary from the official image ───────────────
# Avoids installing docker.io (full daemon + postinstall scripts) on a slim base.
FROM docker:27-cli AS docker-cli

# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM node:22-bookworm-slim

# Docker CLI — needed to run deployed containers and for railpack → buildkit
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

# git for cloning repos; curl + ca-certificates for railpack installer
# python3 + make + g++ are required by better-sqlite3's native node-gyp build
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Railpack binary — builds container images via BuildKit, no Dockerfile required
RUN curl -fsSL https://railpack.com/install.sh | sh

WORKDIR /app

# Dependency layer first — only rebuilds when package.json changes
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3001

CMD ["npm", "run", "dev"]
