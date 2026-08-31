# Multi-stage Dockerfile for Project Waifu
FROM node:22-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies for compilation (including devDependencies)
RUN npm install

# Copy source code and config files
COPY . .

# Build Vite frontend and Express server bundle
RUN npm run build

# Production runtime stage
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled distribution bundle and static assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/public ./public

# Create data directory for SQLite database and Live2D models
RUN mkdir -p /app/data

EXPOSE 3000

# Persistent storage volume for Portainer / Docker
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', (r) => { if (r.statusCode !== 200) process.exit(1); })"

CMD ["node", "dist/server.cjs"]
