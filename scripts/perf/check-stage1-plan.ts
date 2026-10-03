#!/usr/bin/env -S npx tsx
/**
 * Issue #686: パーソナライズ Stage 1 の実行計画の確認（読み取りのみ）
 *
 * 本番と同じ組み立て（lib/personalization/filters/stage1-knn.ts の buildStage1Plan）で、
 * 関心カテゴリ × 期間 × k の組ごとに EXPLAIN（ANALYZE なし）を取り、
 * `idx_article_embedding_hnsw_summary` の Index Scan を使い、Seq Scan・Bitmap Heap Scan・Sort を
 * 含まないかを判定する。1 つでも外れたら終了コード 1。
 *
 * 判定は「その設定でプランナーがこう選んだ」ことの確認で、HNSW を指定する保証ではない
 * （enable_* は計画を抑えるだけ）。統計や行数が変わったら流し直す。
 *
 * Usage:
 *   npx tsx scripts/perf/check-stage1-plan.ts [--mode iterative|legacy|both] [--category-slug <slug>]
 *
 * 接続先は DATABASE_URL（既定は開発 DB）。
 */

import { Prisma } from '@/lib/prisma-exports';
import { createPrismaClient } from '@/lib/prisma/create-client';
import { getPeriodCutoffDate } from '@/lib/personalization/filters/candidate-extractor';
import { supportsIterativeScan } from '@/lib/personalization/filters/pgvector-capabilities';
import {
  buildStage1Plan,
  type Stage1Mode,
} from '@/lib/personalization/filters/stage1-knn';

const EXPECTED_INDEX = 'idx_article_embedding_hnsw_summary';
const FORBIDDEN_NODES = new Set([
  'Seq Scan',
  'Bitmap Heap Scan',
  'Sort',
  'Incremental Sort',
]);
/** API の期間は整数の月数（UI は 0・3・6・12）。1・2 か月は選択率が低く計画が変わりやすい */
const PERIOD_MONTHS = [0, 1, 2, 3, 6, 12];
/** 記事一覧（単一 200、複数 100〜50）、ダイジェスト（単一 300） */
const LIMITS = [50, 100, 200, 300];

type PlanNode = {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
};

function parseArgs(argv: string[]): {
  modes: Stage1Mode[];
  categorySlug: string | null;
} {
  let mode = 'both';
  let categorySlug: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode') mode = argv[++i] ?? '';
    else if (argv[i] === '--category-slug') categorySlug = argv[++i] ?? null;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (mode !== 'iterative' && mode !== 'legacy' && mode !== 'both') {
    throw new Error('--mode must be iterative, legacy or both');
  }
  return {
    modes: mode === 'both' ? ['iterative', 'legacy'] : [mode],
    categorySlug,
  };
}

function collectNodes(node: PlanNode, acc: PlanNode[] = []): PlanNode[] {
  acc.push(node);
  for (const child of node.Plans ?? []) collectNodes(child, acc);
  return acc;
}

/** 計画が条件に合うか。合わなければ理由を返す */
function judgePlan(nodes: PlanNode[]): string | null {
  const forbidden = nodes.filter((n) => FORBIDDEN_NODES.has(n['Node Type']));
  if (forbidden.length > 0) {
    return `forbidden node: ${forbidden.map((n) => n['Node Type']).join(', ')}`;
  }
  const usesExpectedIndex = nodes.some(
    (n) =>
      n['Node Type'] === 'Index Scan' && n['Index Name'] === EXPECTED_INDEX
  );
  if (!usesExpectedIndex) {
    const indexes = nodes
      .filter((n) => n['Index Name'])
      .map((n) => n['Index Name'])
      .join(', ');
    return `${EXPECTED_INDEX} is not used (indexes: ${indexes || 'none'})`;
  }
  return null;
}

function describePlan(nodes: PlanNode[]): string {
  return nodes
    .map((n) =>
      n['Index Name'] ? `${n['Node Type']}(${n['Index Name']})` : n['Node Type']
    )
    .join(' > ');
}

async function main(): Promise<void> {
  const { modes, categorySlug } = parseArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  try {
    const centroids = await prisma.$queryRaw<
      { slug: string; centroid: string }[]
    >`
      SELECT slug, "centroidEmbedding"::text AS centroid
      FROM "InterestCategory"
      WHERE "centroidEmbedding" IS NOT NULL
        ${categorySlug ? Prisma.sql`AND slug = ${categorySlug}` : Prisma.empty}
      ORDER BY "sortOrder"
    `;
    if (centroids.length === 0) {
      throw new Error('No category centroids found');
    }

    const iterativeSupported = await supportsIterativeScan(prisma);
    let checked = 0;
    let failed = 0;

    for (const mode of modes) {
      if (mode === 'iterative' && !iterativeSupported) {
        console.log(
          'SKIP iterative: pgvector does not support iterative scan (< 0.8.0)'
        );
        continue;
      }
      // legacy 経路は期間を Stage 1 に入れないので、期間の組は 1 つでよい
      const periods = mode === 'iterative' ? PERIOD_MONTHS : [0];

      for (const { slug, centroid } of centroids) {
        for (const periodMonths of periods) {
          for (const limit of LIMITS) {
            const plan = buildStage1Plan({
              mode,
              centroid,
              limit,
              cutoffDate: getPeriodCutoffDate(periodMonths),
            });
            // 設定は同じトランザクション（同じ接続）でないと効かない
            const result = await prisma.$transaction(async (tx) => {
              await tx.$executeRawUnsafe(plan.settingsSql);
              return tx.$queryRaw<{ 'QUERY PLAN': { Plan: PlanNode }[] }[]>(
                Prisma.sql`EXPLAIN (FORMAT JSON) ${plan.query}`
              );
            });
            const nodes = collectNodes(result[0]['QUERY PLAN'][0].Plan);
            const reason = judgePlan(nodes);
            checked++;
            const label = `${mode} ${slug} period=${periodMonths}m k=${limit}`;
            if (reason) {
              failed++;
              console.log(
                `NG ${label}: ${reason} | ${describePlan(nodes)}`
              );
            } else {
              console.log(`OK ${label}: ${describePlan(nodes)}`);
            }
          }
        }
      }
    }

    console.log(`\nchecked=${checked} failed=${failed}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// candidate-extractor の import で Redis クライアントが作られ、接続を保ったままになるので明示的に終える
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
