FROM node:22-bookworm-slim

# git — clone repos; docker.io — docker CLI to run containers and for railpack/buildkit
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Railpack binary (uses the socket-mounted Docker + buildkit container to build images)
RUN curl -fsSL https://railpack.com/install.sh | sh

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3001

CMD ["npm", "run", "dev"]
