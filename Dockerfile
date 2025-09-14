# Multi-stage build for TechTrend application

# Base stage - common dependencies
FROM node:20-alpine AS base
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache libc6-compat

# Dependencies stage - install npm packages
FROM base AS deps
COPY package*.json ./
# Copy prisma schema for postinstall script
COPY prisma ./prisma
# Install dependencies with cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

# Development dependencies stage
FROM base AS dev-deps
COPY package*.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Development stage - for local development
FROM base AS dev
# Copy node_modules from dev-deps stage
COPY --from=dev-deps /app/node_modules ./node_modules
# Copy application code
COPY . .
# Generate Prisma Client
RUN npx prisma generate
# Expose port
EXPOSE 3000
# Development command
CMD ["npm", "run", "dev"]

# Builder stage - build the application
FROM base AS builder
# Copy node_modules from dev-deps stage
COPY --from=dev-deps /app/node_modules ./node_modules
# Copy application code
COPY . .
# Generate Prisma Client
RUN npx prisma generate
# Build the application
RUN npm run build

# Production stage - optimized for production
FROM base AS production
ENV NODE_ENV=production
# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# Copy necessary files
COPY package*.json ./
COPY next.config.ts ./
COPY tsconfig.json ./
# Generate Prisma Client
RUN npx prisma generate
# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001
# Change ownership
RUN chown -R nextjs:nodejs /app
# Switch to non-root user
USER nextjs
# Expose port
EXPOSE 3000
# Production command
CMD ["npm", "start"]