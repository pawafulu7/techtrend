import { Prisma } from '@/lib/prisma-exports';
import { enabledSourceSql, enabledSourceWhere } from './enabled-source-filter';

export interface ArticlePeriod {
  from?: Date;
  to?: Date;
}

/** 公開集計は、有効なソースの非表示でない記事だけを数える。期間は [from, to)。 */
export function articleAggregationWhere({
  from,
  to,
}: ArticlePeriod = {}): Prisma.ArticleWhereInput {
  return {
    AND: [
      { isHidden: false },
      enabledSourceWhere(),
      ...(from || to
        ? [
            {
              publishedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lt: to } : {}),
              },
            },
          ]
        : []),
    ],
  };
}

export function articleAggregationSql(
  alias: 'a' | 'a2' = 'a',
  { from, to }: ArticlePeriod = {}
): Prisma.Sql {
  if (alias !== 'a' && alias !== 'a2')
    throw new Error('Unsupported article alias');
  return Prisma.sql`${Prisma.raw(`${alias}."isHidden"`)} = false
    AND ${enabledSourceSql(alias === 'a' ? 'a."sourceId"' : 'a2."sourceId"')}
    ${from || to ? Prisma.sql`AND ${publishedAtPeriodSql(alias, { from, to })}` : Prisma.empty}`;
}

/**
 * 公開日時の期間 [from, to) だけの条件（非表示・ソースの条件は付けない）。from・to のどちらかは必須。
 * Z 付きの ISO 文字列を ::timestamptz で読み、セッションのタイムゾーンに左右されない
 * （Date のまま渡すと pg アダプターはオフセット無しで送り、セッションのタイムゾーンで読まれる）
 */
export function publishedAtPeriodSql(
  alias: 'a' | 'a2',
  { from, to }: ArticlePeriod
): Prisma.Sql {
  if (alias !== 'a' && alias !== 'a2')
    throw new Error('Unsupported article alias');
  if (!from && !to) throw new Error('from or to is required');
  const publishedAt = Prisma.raw(`${alias}."publishedAt"`);
  return Prisma.join(
    [
      ...(from
        ? [Prisma.sql`${publishedAt} >= ${from.toISOString()}::timestamptz`]
        : []),
      ...(to
        ? [Prisma.sql`${publishedAt} < ${to.toISOString()}::timestamptz`]
        : []),
    ],
    ' AND '
  );
}

export function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
