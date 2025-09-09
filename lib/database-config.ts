/**
 * Database connection configuration
 * Optimizes connection pooling for production environments
 */

import { Prisma } from '@prisma/client';
import logger from '@/lib/logger';

/**
 * Parse numeric environment variable with fallback
 */
function parseNumericEnv(value: string | undefined, defaultValue: number): string {
  if (!value) return String(defaultValue);
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.warn(`Invalid numeric environment variable: ${value}, using default: ${defaultValue}`);
    return String(defaultValue);
  }
  
  return String(parsed);
}

/**
 * Get optimized database URL with connection pool parameters
 */
export function getOptimizedDatabaseUrl(): string | undefined {
  const baseUrl = process.env.DATABASE_URL;
  
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
    connection_limit: parseNumericEnv(process.env.DB_CONNECTION_LIMIT, 20),
    // Maximum time to wait for a connection from the pool (in seconds)
    pool_timeout: parseNumericEnv(process.env.DB_POOL_TIMEOUT, 10),
    // Statement cache size for prepared statements
    statement_cache_size: parseNumericEnv(process.env.DB_STATEMENT_CACHE_SIZE, 200),
    // Connection timeout in seconds
    connect_timeout: parseNumericEnv(process.env.DB_CONNECT_TIMEOUT, 10),
  };
  
  // Add parameters to the URL
  for (const [key, value] of Object.entries(poolParams)) {
    url.searchParams.set(key, value);
  }
  
  // Add pgbouncer mode if using connection pooler
  if (process.env.PGBOUNCER_MODE) {
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
    log: isProduction 
      ? ['error', 'warn'] 
      : ['query', 'error', 'warn'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    // Error formatting for production
    errorFormat: isProduction ? 'minimal' : 'pretty',
  } as Prisma.PrismaClientOptions;
}