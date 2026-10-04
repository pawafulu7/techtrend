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
  const publishedAt = Prisma.raw(`${alias}."publishedAt"`);
  return Prisma.sql`${Prisma.raw(`${alias}."isHidden"`)} = false
    AND ${enabledSourceSql(alias === 'a' ? 'a."sourceId"' : 'a2."sourceId"')}
    ${from ? Prisma.sql`AND ${publishedAt} >= ${from.toISOString()}::timestamptz` : Prisma.empty}
    ${to ? Prisma.sql`AND ${publishedAt} < ${to.toISOString()}::timestamptz` : Prisma.empty}`;
}

export function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
