/**
 * 無効化したソース（`Source.enabled = false`）の記事を除く条件（issue #688）。
 *
 * 記事を一覧・検索・集計で返す経路は、この条件を必ず掛ける。ID を指定した単一の記事の取得と、
 * 本人のお気に入り・閲覧履歴は対象外（ユーザーの決定）。
 *
 * - Prisma の where は `enabledSourceWhere()` を AND の配列に足す。毎回新しいオブジェクトを返すので、
 *   呼び出し側が書き換えても他の経路に影響しない
 * - 生 SQL は `enabledSourceSql()` を WHERE に足す。JOIN ではなく IN の形にしているのは、既存の
 *   SQL の別名（`s` など）とぶつからず、GROUP BY も変えずに済むため。開発 DB の EXPLAIN では、
 *   JOIN・EXISTS・IN は同じ計画になる（Source は 76 行で一意キー）
 */
import { Prisma } from '@/lib/prisma-exports';

/**
 * 記事の `sourceId` 列の参照。生 SQL の別名に合わせて選ぶ。
 * 型だけでなく実行時も、この表に無い値は受け付けない（キャストや型チェック外の呼び出しで、
 * 任意の文字列が Prisma.raw に入らないようにするため）
 */
const SOURCE_ID_COLUMNS = {
  'a."sourceId"': Prisma.raw('a."sourceId"'),
  '"sourceId"': Prisma.raw('"sourceId"'),
} as const;

export type ArticleSourceIdColumn = keyof typeof SOURCE_ID_COLUMNS;

/** Prisma の `ArticleWhereInput` 用。AND の配列の要素として使う */
export function enabledSourceWhere(): Prisma.ArticleWhereInput {
  return { source: { is: { enabled: true } } };
}

/** 生 SQL 用。`column` は記事の `sourceId` 列（既定は別名 `a` の付いた形） */
export function enabledSourceSql(
  column: ArticleSourceIdColumn = 'a."sourceId"'
): Prisma.Sql {
  const columnSql = Object.hasOwn(SOURCE_ID_COLUMNS, column)
    ? SOURCE_ID_COLUMNS[column]
    : undefined;
  if (!columnSql) {
    throw new Error(`Unsupported sourceId column: ${String(column)}`);
  }
  return Prisma.sql`${columnSql} IN (SELECT id FROM "Source" WHERE enabled = true)`;
}
