import { Prisma } from '@/lib/prisma-exports';
import { PAPER_SOURCE_IDS } from '@/lib/constants/source-categories';
import {
  SLIDE_SOURCE_NAME_LIST,
  SLIDE_URL_PREFIXES,
} from '@/lib/utils/source/slide-source';
import {
  articleAggregationSql,
  type ArticlePeriod,
} from './article-aggregation-filter';

/**
 * 本文が無いとみなす値。Prisma の where では trim() を使えないので、空と空白だけの代表的な形を
 * この一覧で外す（一覧 API の buildWhereClause と、下の homeArticleSql で同じ値を使う）
 */
export const BLANK_CONTENT_VALUES: readonly string[] = [
  '',
  ' ',
  '\n',
  '\r\n',
  '\t',
  '  ',
  '\n\n',
];

function startsWithAnySql(column: Prisma.Sql, prefixes: readonly string[]) {
  return Prisma.sql`(${Prisma.join(
    prefixes.map((prefix) => Prisma.sql`starts_with(${column}, ${prefix})`),
    ' OR '
  )})`;
}

/**
 * 要約が無く、スライドの画像がある記事（slideWithoutSummaryWhere と同じ条件）。
 * 一覧はこの記事を要約の無い記事の除外から外す
 */
function slideWithoutSummarySql(): Prisma.Sql {
  return Prisma.sql`(
    (a."sourceId" IN (SELECT id FROM "Source" WHERE name IN (${Prisma.join(SLIDE_SOURCE_NAME_LIST)}))
      OR ${startsWithAnySql(Prisma.raw('a.url'), SLIDE_URL_PREFIXES)})
    AND a."summaryComputedAt" IS NULL
    AND ${startsWithAnySql(Prisma.raw('a.thumbnail'), ['https://', 'http://'])}
  )`;
}

/**
 * 絞り込みの無いホームの一覧に出る記事の条件（生 SQL、記事の別名は a）。期間は [from, to)。
 *
 * 一覧 API（app/api/articles/list/query-helpers.ts の buildWhereClause に、ホームが渡す
 * excludeUnprocessed と論文のソースの excludeSources を足したもの）と同じ記事を数える。
 * 公開集計の条件（非表示でない・有効なソース）に、本文がある・要約がある（要約の無いスライドは
 * 画像があれば残す）・技術者向け（isOffTopic = false）・論文のソースでない、を足す。
 * 一覧と件数がずれないことは結合テスト（__tests__/integration/lib/home-article-filter.test.ts）で確かめる
 */
export function homeArticleSql(period: ArticlePeriod = {}): Prisma.Sql {
  return Prisma.sql`${articleAggregationSql('a', period)}
    AND a.content IS NOT NULL
    AND a.content NOT IN (${Prisma.join(BLANK_CONTENT_VALUES)})
    AND (a."summaryComputedAt" IS NOT NULL OR ${slideWithoutSummarySql()})
    AND a."isOffTopic" = false
    ${
      PAPER_SOURCE_IDS.length > 0
        ? Prisma.sql`AND a."sourceId" NOT IN (${Prisma.join(PAPER_SOURCE_IDS)})`
        : Prisma.empty
    }`;
}
