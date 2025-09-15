# Multi-stage build for TechTrend application

# Base stage - common dependencies
FROM node:20-alpine AS base
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache libc6-compat curl

# Dependencies stage - install npm packages
FROM base AS deps
COPY package*.json ./
# Copy prisma schema for postinstall script
COPY prisma ./prisma
# Install dependencies with cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# Development dependencies stage
FROM base AS dev-deps
COPY package*.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Development stage - for local development
FROM base AS dev
# Create non-root user with UID 1000 (matches host user)
# Check if group/user already exists before creating
RUN getent group 1000 || addgroup -g 1000 -S techtrend && \
    getent passwd 1000 || adduser -S techtrend -u 1000 -G techtrend || \
    adduser -S techtrend -u 1000 -G node
# Copy node_modules from dev-deps stage with correct ownership
COPY --from=dev-deps --chown=1000:1000 /app/node_modules ./node_modules
# Copy application code
COPY . .
# Generate Prisma Client as root
RUN npx prisma generate
# Create .next directory with proper permissions
RUN mkdir -p /app/.next && chmod 777 /app/.next
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
# Use client generated in builder
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
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