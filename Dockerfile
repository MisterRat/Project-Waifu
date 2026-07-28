# Multi-stage Dockerfile for Project Waifu App
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json ./

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
COPY package.json ./
RUN npm install --only=production

# Copy compiled distribution bundle
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
