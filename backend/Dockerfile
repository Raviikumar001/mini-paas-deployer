
FROM docker:27-cli AS docker-cli


FROM node:22-bookworm-slim


COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker


RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*


RUN curl -fsSL https://railpack.com/install.sh | sh

WORKDIR /app


COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3001

CMD ["npm", "run", "dev"]
