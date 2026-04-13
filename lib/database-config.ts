/**
 * Database connection configuration for Prisma v7 + PrismaPg driver adapter.
 *
 * In v7, connection pooling is handled by PrismaPg (backed by node-postgres Pool),
 * not by Prisma's internal pool. This module provides pool configuration helpers.
 *
 * Migration notes (v6 → v7):
 * - `statement_cache_size` is no longer supported (was a Prisma query engine feature).
 *   The node-postgres driver uses its own prepared statement handling.
 * - `connection_limit` → `max` (pg.PoolConfig)
 * - `pool_timeout` → `connectionTimeoutMillis` (seconds → milliseconds)
 * - `connect_timeout` → connection string parameter (stays in seconds)
 */

import { env } from '@/lib/config/env';

export interface PoolConfig {
  connectionString: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/**
 * Build a pg.PoolConfig from environment variables.
 * Used by lib/prisma.ts for the singleton and lib/prisma/create-client.ts for scripts.
 */
export function getPoolConfig(
  connectionStringOverride?: string
): PoolConfig | undefined {
  const baseUrl = connectionStringOverride ?? env.DATABASE_URL;
  if (!baseUrl) return undefined;

  // Append connect_timeout to connection string if missing
  const url = new URL(baseUrl);
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', String(env.DB_CONNECT_TIMEOUT));
  }

  return {
    connectionString: url.toString(),
    max: env.DB_CONNECTION_LIMIT,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: env.DB_POOL_TIMEOUT * 1000,
  };
}
