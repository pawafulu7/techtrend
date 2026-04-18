#!/usr/bin/env npx tsx
/**
 * Issue #579: Stage2 EXPLAIN ANALYZE baseline tool.
 *
 * Mirrors `lib/personalization/filters/candidate-extractor.ts` Stage1 (pgvector kNN)
 * + Stage2 (VALUES-driven bounded join) and prints EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
 * for Stage2 so we can judge composite index requirements.
 *
 * READ-ONLY: never runs CREATE/DROP INDEX. A/B is performed via psql between runs.
 *
 * Usage:
 *   npx tsx scripts/perf/explain-stage2.ts [--env local|prod] [--topk 200|5000]
 *                                          [--period-months 12] [--category-slug <slug>]
 *                                          [--min-similarity 0.55] [--fresh]
 *
 * Cache: Stage1 output is cached at .workflow/tmp/stage1-<env>-topk<N>-<categoryId>.json
 * so Before/After Stage2 EXPLAIN share identical VALUES inputs.
 */

import { PrismaClient, Prisma } from '../../prisma/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';

type Env = 'local' | 'prod';

type Args = {
  env: Env;
  topK: number;
  periodMonths: number;
  categorySlug: string | null;
  minSimilarity: number;
  fresh: boolean;
};

/** pgvector HNSW ef_search valid range (1..1000 per pgvector docs). */
const HNSW_EF_SEARCH_MIN = 40;
const HNSW_EF_SEARCH_MAX = 1000;

/** Article/cuid identifier shape: [a-z0-9]+ only. Guards VALUES clause interpolation. */
const ID_PATTERN = /^[a-z0-9]+$/i;

function parsePositiveInt(raw: string | undefined, flag: string, def: number): number {
  if (raw === undefined) return def;
  const v = parseInt(raw, 10);
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error(`--${flag} must be a positive integer (got: ${raw})`);
  }
  return v;
}

function parseFiniteFloat(
  raw: string | undefined,
  flag: string,
  def: number,
  min: number,
  max: number
): number {
  if (raw === undefined) return def;
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || v < min || v > max) {
    throw new Error(
      `--${flag} must be a finite number in [${min}, ${max}] (got: ${raw})`
    );
  }
  return v;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const env = (get('--env') ?? 'local') as Env;
  if (env !== 'local' && env !== 'prod') {
    throw new Error(`--env must be "local" or "prod" (got: ${env})`);
  }
  const topK = parsePositiveInt(get('--topk'), 'topk', 200);
  const periodMonths = parsePositiveInt(
    get('--period-months'),
    'period-months',
    12
  );
  const categorySlug = get('--category-slug') ?? null;
  const minSimilarity = parseFiniteFloat(
    get('--min-similarity'),
    'min-similarity',
    0.55,
    0,
    1
  );
  const fresh = argv.includes('--fresh');
  return { env, topK, periodMonths, categorySlug, minSimilarity, fresh };
}

function resolveDatabaseUrl(env: Env): string {
  const url =
    env === 'prod' ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      env === 'prod'
        ? 'PROD_DATABASE_URL not set. source .env.local first.'
        : 'DATABASE_URL not set.'
    );
  }
  return url;
}

function cachePath(env: Env, topK: number, categoryId: string): string {
  return `.workflow/tmp/stage1-${env}-topk${topK}-${categoryId}.json`;
}

/** Write JSON atomically (tmp file + rename). Prevents corrupted cache on crash. */
function writeJsonAtomic(filepath: string, data: unknown): void {
  const dir = dirname(filepath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${filepath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, filepath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore cleanup failure */
    }
    throw err;
  }
}

type Stage1Row = { articleId: string; sim_emb: number };

async function pickCategory(
  prisma: PrismaClient,
  slug: string | null
): Promise<{ id: string; slug: string; centroid: string }> {
  const slugFilter = slug ? Prisma.sql`AND slug = ${slug}` : Prisma.empty;
  const rows = await prisma.$queryRaw<
    Array<{ id: string; slug: string; centroid_embedding: string | null }>
  >`
    SELECT id, slug, "centroidEmbedding"::text AS centroid_embedding
    FROM "InterestCategory"
    WHERE "centroidEmbedding" IS NOT NULL
      AND "isActive" = true
      ${slugFilter}
    ORDER BY "sortOrder" ASC, id ASC
    LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].centroid_embedding) {
    throw new Error(
      slug
        ? `No active category found with slug="${slug}" and centroid`
        : 'No active category with centroid found'
    );
  }
  return {
    id: rows[0].id,
    slug: rows[0].slug,
    centroid: rows[0].centroid_embedding,
  };
}

async function runStage1(
  prisma: PrismaClient,
  centroid: string,
  topK: number
): Promise<Stage1Row[]> {
  // Mirror production behavior: raise hnsw.ef_search to match LIMIT so HNSW
  // returns topK candidates instead of capping at the default (40).
  // SET LOCAL only takes effect within a transaction; wrap both statements.
  const efSearch = Math.min(
    Math.max(Math.floor(topK), HNSW_EF_SEARCH_MIN),
    HNSW_EF_SEARCH_MAX
  );
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '30s'`);
    await tx.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = ${efSearch}`);
    return tx.$queryRaw<Stage1Row[]>`
      SELECT "articleId", 1 - (embedding <=> ${centroid}::vector) AS sim_emb
      FROM "ArticleEmbedding"
      WHERE "embeddingKey" = 'summary'::"EmbeddingKey"
      ORDER BY embedding <=> ${centroid}::vector
      LIMIT ${topK}
    `;
  });
}

function buildStage2Sql(
  stage1: Stage1Row[],
  periodMonths: number,
  minSimilarity: number
): { sql: string; cutoff: Date | null } {
  // Validate every articleId before inlining into the VALUES clause.
  // Prisma's tagged-template ($queryRaw) cannot parameterize an EXPLAIN query
  // because EXPLAIN's output shape differs from the prepared-statement plan,
  // so we keep $queryRawUnsafe but sanitize inputs strictly.
  for (const r of stage1) {
    if (!ID_PATTERN.test(r.articleId)) {
      throw new Error(
        `Invalid articleId in Stage1 cache: ${JSON.stringify(r.articleId)}`
      );
    }
    if (!Number.isFinite(r.sim_emb)) {
      throw new Error(`Invalid sim_emb in Stage1 cache: ${r.sim_emb}`);
    }
  }
  if (!Number.isFinite(minSimilarity)) {
    throw new Error(`minSimilarity must be finite, got: ${minSimilarity}`);
  }

  const cutoff =
    periodMonths > 0
      ? new Date(Date.now() - periodMonths * 30 * 24 * 60 * 60 * 1000)
      : null;

  const valuesLines = stage1
    .map((r) => `('${r.articleId}'::text, ${r.sim_emb}::float8)`)
    .join(',\n        ');

  const cutoffPredicate = cutoff
    ? `          AND a."publishedAt" >= '${cutoff.toISOString()}'::timestamptz`
    : '';

  const sql = `
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, VERBOSE, FORMAT TEXT)
SELECT
  a.id,
  a.title,
  a.url,
  a."publishedAt" as published_at,
  a."createdAt" as created_at,
  a."qualityScore" as quality_score,
  a."bookmarks" as bookmarks,
  a."userVotes" as user_votes,
  a."sourceId" as source_id,
  a.summary,
  a.thumbnail as thumbnail_url,
  s1.sim_emb
FROM (VALUES
        ${valuesLines}
     ) AS s1("articleId", sim_emb)
INNER JOIN "Article" a ON a.id = s1."articleId"
WHERE a."summaryComputedAt" IS NOT NULL
  AND a."isHidden" = false
${cutoffPredicate}
  AND s1.sim_emb >= ${minSimilarity};
`;
  return { sql, cutoff };
}

async function runExplain(
  prisma: PrismaClient,
  sql: string
): Promise<string[]> {
  // Per-transaction statement_timeout via SET LOCAL so the limit applies
  // even if the underlying connection is swapped by the pool.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '30s'`);
    const rows = await tx.$queryRawUnsafe<Array<Record<string, string>>>(sql);
    return rows.map((r) => Object.values(r)[0]);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl(args.env);

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });

  const startedAt = new Date().toISOString();
  console.log('='.repeat(80));
  console.log(`Issue #579 Stage2 EXPLAIN baseline`);
  console.log(
    `env=${args.env} topK=${args.topK} periodMonths=${args.periodMonths} minSim=${args.minSimilarity}`
  );
  console.log(`startedAt=${startedAt}`);
  console.log('='.repeat(80));

  try {
    const category = await pickCategory(prisma, args.categorySlug);
    console.log(`[category] id=${category.id} slug=${category.slug}`);

    const cache = cachePath(args.env, args.topK, category.id);
    let stage1: Stage1Row[];

    if (!args.fresh && existsSync(cache)) {
      stage1 = JSON.parse(readFileSync(cache, 'utf8'));
      console.log(`[stage1] loaded cache ${cache} rows=${stage1.length}`);
    } else {
      const t0 = process.hrtime.bigint();
      stage1 = await runStage1(prisma, category.centroid, args.topK);
      const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
      writeJsonAtomic(cache, stage1);
      console.log(
        `[stage1] fresh run rows=${stage1.length} time=${ms.toFixed(1)}ms cached=${cache}`
      );
    }

    if (stage1.length === 0) {
      console.error('[stage1] no rows; abort');
      process.exit(1);
    }

    const { sql, cutoff } = buildStage2Sql(
      stage1,
      args.periodMonths,
      args.minSimilarity
    );
    console.log(
      `[stage2] cutoff=${cutoff?.toISOString() ?? 'none'} minSim=${args.minSimilarity}`
    );
    console.log(`[stage2] EXPLAIN length=${sql.length} chars`);

    // Run EXPLAIN three times and print all (caller selects median from logs).
    for (let i = 1; i <= 3; i++) {
      console.log('-'.repeat(80));
      console.log(`[stage2 EXPLAIN run ${i}/3]`);
      console.log('-'.repeat(80));
      const lines = await runExplain(prisma, sql);
      for (const line of lines) console.log(line);
    }

    console.log('='.repeat(80));
    console.log(`finishedAt=${new Date().toISOString()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
