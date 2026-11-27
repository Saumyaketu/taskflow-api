# ==============================================================================
# Multi-stage Dockerfile for TaskFlow REST API
# Base: Node.js 22 Alpine (Optimized lightweight production container)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency specifications and Prisma schema first for layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Generate Prisma Client based on schema.prisma
RUN npx prisma generate

# Copy application source code and configuration
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to production JavaScript in dist/
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

LABEL maintainer="Axionix Internship Evaluation"
LABEL description="Production-minded Team Task Tracker REST API"

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install wget for lightweight container healthcheck
RUN apk add --no-cache wget

# Copy package manifests and Prisma migrations
COPY package*.json ./
COPY prisma ./prisma/

# Copy compiled JavaScript output and pre-built node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy postman collection for in-container API verification if needed
COPY postman_collection.json ./

# Ensure appropriate file ownership for standard non-root user 'node'
RUN chown -R node:node /app

# Switch to non-root security context
USER node

# Expose REST API application port
EXPOSE 3000

# Built-in container health check probe hitting /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Launch production server
CMD ["node", "dist/server.js"]
