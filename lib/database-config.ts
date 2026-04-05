/**
 * Database connection configuration
 * Optimizes connection pooling for production environments
 */

import { Prisma } from '@prisma/client';
import { env } from '@/lib/config/env';

/**
 * Get optimized database URL with connection pool parameters
 */
export function getOptimizedDatabaseUrl(): string | undefined {
  const baseUrl = env.DATABASE_URL;

  // Return undefined if DATABASE_URL is not set (for build time)
  if (!baseUrl) {
    return undefined;
  }

  // Parse the URL to add connection pool parameters
  const url = new URL(baseUrl);

  // Add connection pool parameters for PostgreSQL with validation
  // These parameters optimize connection handling in production
  const poolParams = {
    // Maximum number of connections in the pool
    connection_limit: String(env.DB_CONNECTION_LIMIT),
    // Maximum time to wait for a connection from the pool (in seconds)
    pool_timeout: String(env.DB_POOL_TIMEOUT),
    // Statement cache size for prepared statements
    statement_cache_size: String(env.DB_STATEMENT_CACHE_SIZE ?? 200),
    // Connection timeout in seconds
    connect_timeout: String(env.DB_CONNECT_TIMEOUT),
  };

  // Add parameters to the URL
  for (const [key, value] of Object.entries(poolParams)) {
    url.searchParams.set(key, value);
  }

  // Add pgbouncer mode if using connection pooler
  if (env.PGBOUNCER_MODE) {
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('statement_cache_size', '0'); // Disable statement cache with pgbouncer
  }

  return url.toString();
}

/**
 * Get Prisma client configuration optimized for production
 */
export function getPrismaConfig(): Prisma.PrismaClientOptions | undefined {
  const isProduction = process.env.NODE_ENV === 'production';
  const databaseUrl = getOptimizedDatabaseUrl();

  // Return undefined if no DATABASE_URL (for build time)
  if (!databaseUrl) {
    return undefined;
  }

  return {
    log:
      env.PRISMA_QUERY_LOG === 'true'
        ? ['query', 'error', 'warn']
        : ['error', 'warn'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    // Error formatting for production
    errorFormat: isProduction ? 'minimal' : 'pretty',
    // Interactive transaction timeout (default: 5000ms, override: DB_TRANSACTION_TIMEOUT)
    // Extended to 10s for summary generation transactions with multiple tag operations
    transactionOptions: {
      timeout: env.DB_TRANSACTION_TIMEOUT,
    },
  } as Prisma.PrismaClientOptions;
}
