/**
 * Stage 1: 関心カテゴリの重心に近い記事の kNN（pgvector の HNSW）
 *
 * - iterative 経路（pgvector 0.8.0 以上）: Article と結合し、期間・非表示・要約済み・除外ソースの
 *   条件を Stage 1 で掛ける。HNSW の iterative scan で、条件に合う行を LIMIT 件まで読み進める
 * - legacy 経路（0.8 未満）: 期間を見ない全体の kNN（期間は Stage 2 で掛ける）
 *
 * どちらも、プランナーが HNSW 以外を選ばないよう seq・bitmap・sort の計画を止める。
 * 止めないと、k=200 で Parallel Seq Scan（ef_search に比例して HNSW の見積もりが上がるため）、
 * 期間の選択率が低いと btree の全件走査＋Sort に逃げ、どちらも 230〜400ms かかる（Issue #686）。
 * 設定とクエリは必ず同じトランザクション（同じ接続）で実行する
 */

import { PrismaClient, Prisma } from '@/lib/prisma-exports';
import { supportsIterativeScan } from './pgvector-capabilities';

/**
 * iterative 経路の hnsw.ef_search（精度のための定数で、k からは計算しない。iterative scan は
 * 足りなければ読み進むので LIMIT 以上にする必要はない）。開発 DB の全期間・公開日順の 1 ページ目
 * （20 件）の厳密解との一致は、ef=40 で平均 18.4・最低 16、ef=400 で平均 19.7・最低 19。
 * 3 か月の Stage 1（warm の中央値）は ef=40 で 27〜37ms、ef=400 で 27〜44ms。
 * title を含む全体の HNSW を削除し sort の計画を止めた後は、
 * ef=400 でも全期間・全 k で部分 HNSW の計画になる（scripts/perf/check-stage1-plan.ts で確認）
 */
export const STAGE1_ITERATIVE_EF_SEARCH = 400;

/**
 * iterative scan のメモリ上限（work_mem × この倍率）。上限に当たると件数は LIMIT のまま
 * 一致率だけが落ちる（開発 DB の 30 日で work_mem 2MB なら 87.6%）ので、既定の 1 から余裕を持たせる
 */
export const STAGE1_SCAN_MEM_MULTIPLIER = 2;

/**
 * legacy 経路の hnsw.ef_search の範囲。iterative scan が無いと HNSW は最大 ef_search 件しか
 * 返さないので、ef_search を LIMIT 以上にする。pgvector の有効範囲は 1..1000
 */
const LEGACY_EF_SEARCH_MIN = 40;
const LEGACY_EF_SEARCH_MAX = 1000;

export type Stage1Mode = 'iterative' | 'legacy';

export type Stage1Row = { articleId: string; sim_emb: number };

export type Stage1Plan = {
  mode: Stage1Mode;
  efSearch: number;
  periodApplied: boolean;
  /** トランザクションに閉じた設定（set_config(..., true)）。値は定数か整数に丸めた値だけ */
  settingsSql: string;
  query: Prisma.Sql;
};

/** legacy 経路の ef_search（LIMIT 以上、範囲内に丸める） */
export function getLegacyEfSearch(limit: number): number {
  return Math.min(
    Math.max(Math.floor(limit), LEGACY_EF_SEARCH_MIN),
    LEGACY_EF_SEARCH_MAX
  );
}

/** Stage 1 で掛ける設定の名前（値は定数か整数に丸めた値だけを渡す） */
type Stage1SettingName =
  | 'hnsw.ef_search'
  | 'hnsw.iterative_scan'
  | 'hnsw.scan_mem_multiplier'
  | 'enable_seqscan'
  | 'enable_bitmapscan'
  | 'enable_sort';
type Stage1Setting = readonly [Stage1SettingName, string];

function buildSettingsSql(settings: readonly Stage1Setting[]): string {
  const calls = settings.map(
    ([name, value]) => `set_config('${name}', '${value}', true)`
  );
  return `SELECT ${calls.join(', ')}`;
}

const PLANNER_PINNING: readonly Stage1Setting[] = [
  ['enable_seqscan', 'off'],
  ['enable_bitmapscan', 'off'],
  ['enable_sort', 'off'],
];

/**
 * Stage 1 の設定とクエリを組み立てる（実行はしない。計画確認スクリプトも同じ組み立てを使う）
 */
export function buildStage1Plan(params: {
  mode: Stage1Mode;
  centroid: string;
  limit: number;
  cutoffDate: Date | null;
  /** iterative 経路だけで使う（legacy 経路は Stage 2 で除く） */
  excludeSourceIds?: string[];
}): Stage1Plan {
  const { mode, centroid, limit, cutoffDate, excludeSourceIds } = params;

  if (mode === 'iterative') {
    const periodFilter = cutoffDate
      ? Prisma.sql`AND a."publishedAt" >= ${cutoffDate}`
      : Prisma.empty;
    const sourceExcludeFilter =
      excludeSourceIds && excludeSourceIds.length > 0
        ? Prisma.sql`AND a."sourceId" != ALL(${excludeSourceIds}::text[])`
        : Prisma.empty;
    return {
      mode,
      efSearch: STAGE1_ITERATIVE_EF_SEARCH,
      periodApplied: cutoffDate !== null,
      settingsSql: buildSettingsSql([
        ['hnsw.ef_search', String(STAGE1_ITERATIVE_EF_SEARCH)],
        ['hnsw.iterative_scan', 'relaxed_order'],
        ['hnsw.scan_mem_multiplier', String(STAGE1_SCAN_MEM_MULTIPLIER)],
        ...PLANNER_PINNING,
      ]),
      query: Prisma.sql`
        SELECT e."articleId", 1 - (e.embedding <=> ${centroid}::vector) AS sim_emb
        FROM "ArticleEmbedding" e
        INNER JOIN "Article" a ON a.id = e."articleId"
        WHERE e."embeddingKey" = 'summary'::"EmbeddingKey"
          AND a."isHidden" = false
          AND a."summaryComputedAt" IS NOT NULL
          ${periodFilter}
          ${sourceExcludeFilter}
        ORDER BY e.embedding <=> ${centroid}::vector
        LIMIT ${limit}
      `,
    };
  }

  // legacy: iterative scan の設定は掛けない（0.8 未満でライブラリが読み込まれた後に掛けるとエラーになる）
  const efSearch = getLegacyEfSearch(limit);
  return {
    mode,
    efSearch,
    periodApplied: false,
    settingsSql: buildSettingsSql([
      ['hnsw.ef_search', String(efSearch)],
      ...PLANNER_PINNING,
    ]),
    query: Prisma.sql`
      SELECT "articleId", 1 - (embedding <=> ${centroid}::vector) AS sim_emb
      FROM "ArticleEmbedding"
      WHERE "embeddingKey" = 'summary'::"EmbeddingKey"
      ORDER BY embedding <=> ${centroid}::vector
      LIMIT ${limit}
    `,
  };
}

/**
 * Stage 1 を実行する。設定やクエリのエラーは投げる（旧経路に落とすと新しいクエリの不具合を隠すため）
 */
export async function runStage1Knn(
  db: PrismaClient,
  params: {
    centroid: string;
    limit: number;
    cutoffDate: Date | null;
    excludeSourceIds?: string[];
  }
): Promise<{ rows: Stage1Row[]; plan: Stage1Plan }> {
  const mode: Stage1Mode = (await supportsIterativeScan(db))
    ? 'iterative'
    : 'legacy';
  const plan = buildStage1Plan({ mode, ...params });

  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(plan.settingsSql);
    return tx.$queryRaw<Stage1Row[]>(plan.query);
  });

  return { rows, plan };
}
