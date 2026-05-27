# Memshare — production image for Fly.io / any container host.
# No build step (vanilla JS client, no bundling). Single-stage build.

FROM node:20-alpine

WORKDIR /app

# Install deps from the lockfile for reproducibility
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# App source
COPY server/ ./server/
COPY public/ ./public/

ENV NODE_ENV=production
ENV MEMSHARE_HOST=0.0.0.0
ENV MEMSHARE_PORT=8080
ENV MEMSHARE_LOG=info

EXPOSE 8080
USER node

CMD ["node", "server/index.js"]
