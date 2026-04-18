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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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

function parseArgs(argv: string[]): Args {
  const get = (flag: string, def?: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : def;
  };
  const env = (get('--env', 'local') as Env);
  if (env !== 'local' && env !== 'prod') {
    throw new Error(`--env must be "local" or "prod"`);
  }
  const topK = parseInt(get('--topk', '200') ?? '200', 10);
  const periodMonths = parseInt(get('--period-months', '12') ?? '12', 10);
  const categorySlug = get('--category-slug', undefined) ?? null;
  const minSimilarity = parseFloat(get('--min-similarity', '0.55') ?? '0.55');
  const fresh = argv.includes('--fresh');
  return { env, topK, periodMonths, categorySlug, minSimilarity, fresh };
}

function resolveDatabaseUrl(env: Env): string {
  const url = env === 'prod'
    ? process.env.PROD_DATABASE_URL
    : process.env.DATABASE_URL;
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

type Stage1Row = { articleId: string; sim_emb: number };

async function pickCategory(
  prisma: PrismaClient,
  slug: string | null
): Promise<{ id: string; slug: string; centroid: string }> {
  const slugFilter = slug
    ? Prisma.sql`AND slug = ${slug}`
    : Prisma.empty;
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
  return prisma.$queryRaw<Stage1Row[]>`
    SELECT "articleId", 1 - (embedding <=> ${centroid}::vector) AS sim_emb
    FROM "ArticleEmbedding"
    WHERE "embeddingKey" = 'summary'::"EmbeddingKey"
    ORDER BY embedding <=> ${centroid}::vector
    LIMIT ${topK}
  `;
}

function buildStage2Sql(
  stage1: Stage1Row[],
  periodMonths: number,
  minSimilarity: number
): { sql: string; cutoff: Date | null } {
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
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(sql);
  return rows.map((r) => Object.values(r)[0]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl(args.env);

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });

  const startedAt = new Date().toISOString();
  console.log('='.repeat(80));
  console.log(`Issue #579 Stage2 EXPLAIN baseline`);
  console.log(`env=${args.env} topK=${args.topK} periodMonths=${args.periodMonths} minSim=${args.minSimilarity}`);
  console.log(`startedAt=${startedAt}`);
  console.log('='.repeat(80));

  try {
    // Always guard against long-running queries (prod safety, dev sanity).
    await prisma.$executeRawUnsafe(`SET statement_timeout = '30s'`);

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
      mkdirSync(dirname(cache), { recursive: true });
      writeFileSync(cache, JSON.stringify(stage1));
      console.log(`[stage1] fresh run rows=${stage1.length} time=${ms.toFixed(1)}ms cached=${cache}`);
    }

    if (stage1.length === 0) {
      console.error('[stage1] no rows; abort');
      process.exit(1);
    }

    const { sql, cutoff } = buildStage2Sql(stage1, args.periodMonths, args.minSimilarity);
    console.log(`[stage2] cutoff=${cutoff?.toISOString() ?? 'none'} minSim=${args.minSimilarity}`);
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
