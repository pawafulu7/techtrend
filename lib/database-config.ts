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
 *
 * pgbouncer note:
 *   PGBOUNCER_MODE handling is deferred (OQ3 in plan). When pgbouncer support
 *   is added, set `preparedStatements: false` in PrismaPg options to disable
 *   prepared statements (incompatible with pgbouncer transaction pooling).
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
    // 本番の関数（東京）と DB（シンガポール）の間は、接続し直すと約 0.45 秒かかる（TLS と認証で
    // 数往復。/api/health の実測で、間を 2 秒空けると 0.22〜0.27 秒、15 秒空けると 0.66〜0.74 秒）。
    // 画面を行き来する間は接続を使い回せるよう、既定は 60 秒。Vercel では lib/prisma.ts の
    // attachDatabasePool が、この時間だけ関数を起こしておき、閉じてから一時停止させる（その間は
    // メモリが課金される）
    idleTimeoutMillis: env.DB_IDLE_TIMEOUT * 1000,
    connectionTimeoutMillis: env.DB_POOL_TIMEOUT * 1000,
  };
}
