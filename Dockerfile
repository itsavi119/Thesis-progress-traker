# Multi-stage Dockerfile for Thesis Progress Tracker
# Compatible with Google Cloud Run, AWS ECS, Azure, Fly.io, Railway, Render, DigitalOcean, and standard Docker VPS

# 1. Builder stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies with cached layers
COPY package*.json ./
RUN npm ci

# Copy application source code
COPY . .

# Build Vite frontend and bundled Express server.js
RUN npm run build

# 2. Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dumb-init or use node directly for proper signal handling
RUN apk add --no-cache dumb-init

# Create persistent data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Copy built artifacts and production dependencies
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server.js ./server.js
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Persist data across container restarts
VOLUME ["/app/data"]

USER node

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
