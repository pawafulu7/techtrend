/**
 * Database connection configuration
 * Optimizes connection pooling for production environments
 */

import { Prisma } from '@prisma/client';

/**
 * Get optimized database URL with connection pool parameters
 */
export function getOptimizedDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || '';
  
  if (!baseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  // Parse the URL to add connection pool parameters
  const url = new URL(baseUrl);
  
  // Add connection pool parameters for PostgreSQL
  // These parameters optimize connection handling in production
  const poolParams = {
    // Maximum number of connections in the pool
    connection_limit: process.env.DB_CONNECTION_LIMIT || '20',
    // Maximum time to wait for a connection from the pool (in seconds)
    pool_timeout: process.env.DB_POOL_TIMEOUT || '10',
    // Statement cache size for prepared statements
    statement_cache_size: process.env.DB_STATEMENT_CACHE_SIZE || '200',
    // Connection timeout in seconds
    connect_timeout: process.env.DB_CONNECT_TIMEOUT || '10',
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
export function getPrismaConfig(): Prisma.PrismaClientOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    log: isProduction 
      ? ['error', 'warn'] 
      : ['query', 'error', 'warn'],
    datasources: {
      db: {
        url: getOptimizedDatabaseUrl(),
      },
    },
    // Error formatting for production
    errorFormat: isProduction ? 'minimal' : 'pretty',
  } as Prisma.PrismaClientOptions;
}