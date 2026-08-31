# Multi-stage Dockerfile for Project Waifu
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies for build
RUN npm install

# Copy source code
COPY . .

# Build Vite SPA and Express server bundle
RUN npm run build

# Production runtime stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests and install runtime dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled distribution bundle and assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets

# Create data directory for SQLite database and Live2D model storage
RUN mkdir -p /app/data

EXPOSE 3000

# Persistent storage volume for Portainer / Docker
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { if (r.statusCode !== 200) process.exit(1); })"

CMD ["node", "dist/server.cjs"]
