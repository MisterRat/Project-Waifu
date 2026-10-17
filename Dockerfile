# Multi-stage Dockerfile for Project Waifu App
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests (the lockfile pins every package to the tested version)
COPY package.json package-lock.json ./

# Install all dependencies for build, exactly as locked
RUN npm ci

# Copy source code
COPY . .

# Build Vite SPA and Express server bundle
RUN npm run build

# Production runtime stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests and install runtime dependencies, exactly as locked
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled distribution bundle and assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
