/**
 * pgvector の機能の対応状況（Stage 1 と記事の類似検索（lib/rag/article-knn.ts）の kNN で iterative scan を使えるか）
 *
 * `hnsw.iterative_scan` は pgvector 0.8.0 から。対応状況は SET の成否ではなく
 * `pg_extension.extversion` で判定する。新しい接続で pgvector のライブラリが読み込まれる前は、
 * 存在しない `hnsw.*` の SET もエラーにならずに通るため（Issue #686 の調査）
 */

import type { PrismaClient } from '@/lib/prisma-exports';
import { logger } from '@/lib/logger';

/** iterative scan に対応する pgvector の最小の版 */
export const ITERATIVE_SCAN_MIN_VERSION: readonly [number, number, number] = [
  0, 8, 0,
];

/** `0.8.2` のような版の文字列を数値の組にする。解析できなければ null */
export function parsePgvectorVersion(
  version: string | null | undefined
): [number, number, number] | null {
  if (!version) return null;
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** 版が iterative scan に対応するか（数値で比べる。`0.10.0` は `0.8.0` より新しい） */
export function isIterativeScanSupported(
  version: string | null | undefined
): boolean {
  const parsed = parsePgvectorVersion(version);
  if (!parsed) return false;
  for (let i = 0; i < ITERATIVE_SCAN_MIN_VERSION.length; i++) {
    if (parsed[i] !== ITERATIVE_SCAN_MIN_VERSION[i]) {
      return parsed[i] > ITERATIVE_SCAN_MIN_VERSION[i];
    }
  }
  return true;
}

type VectorExtensionRow = {
  extversion: string;
  default_version: string | null;
};

async function detectIterativeScanSupport(db: PrismaClient): Promise<boolean> {
  const rows = await db.$queryRaw<VectorExtensionRow[]>`
    SELECT e.extversion, a.default_version
    FROM pg_extension e
    LEFT JOIN pg_available_extensions a ON a.name = e.extname
    WHERE e.extname = 'vector'
  `;
  const row = rows[0];
  if (!row) {
    logger.warn(
      'pgvector extension not found; kNN callers fall back (Stage 1: legacy kNN, related articles: exact search)'
    );
    return false;
  }

  // バイナリだけ上げて ALTER EXTENSION UPDATE を忘れた状態に気づくため
  if (row.default_version && row.default_version !== row.extversion) {
    logger.warn(
      { extversion: row.extversion, defaultVersion: row.default_version },
      'pgvector extversion differs from default_version; run ALTER EXTENSION vector UPDATE'
    );
  }

  const supported = isIterativeScanSupported(row.extversion);
  logger.info(
    { extversion: row.extversion, iterativeScan: supported },
    'pgvector capabilities detected'
  );
  return supported;
}

/**
 * 判定の結果。版はデプロイ中に変わらない前提で、プロセスの間保持する（拡張を上げたら再デプロイで反映）。
 * プロセス内で 1 つの DB を使う前提で、渡された db は区別しない（最初に判定した db の結果を使う）
 */
let cachedSupport: Promise<boolean> | null = null;

/**
 * iterative scan を使えるか。1 回だけ引いて保持し、並行呼び出しでも重複して引かない。
 * 判定のクエリが失敗したら、その回は非対応として扱い、保持しない（次の呼び出しで引き直す）
 */
export function supportsIterativeScan(db: PrismaClient): Promise<boolean> {
  if (cachedSupport) return cachedSupport;

  const detection: Promise<boolean> = detectIterativeScanSupport(db).catch(
    (err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'pgvector capability detection failed; kNN callers fall back for this call (Stage 1: legacy kNN, related articles: exact search)'
      );
      if (cachedSupport === detection) cachedSupport = null;
      return false;
    }
  );
  cachedSupport = detection;
  return detection;
}

/** テスト専用: 保持した判定の結果を消す */
export function resetPgvectorCapabilitiesForTest(): void {
  cachedSupport = null;
}
