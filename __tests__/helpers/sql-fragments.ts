/**
 * タグ付きテンプレートで呼ばれた `$queryRaw` / `$executeRaw` のモックの呼び出しから、
 * 値として埋め込まれた SQL の断片（Prisma.Sql）の文字列を取り出す。
 *
 * `afterAnd: true` のときは、直前のテンプレートの文字列が `AND` で終わる断片だけを返す
 * （`OR ${...}` や、前の `AND` が抜けた形を見逃さないため）。
 * Prisma.Sql は `instanceof` ではなく `.sql` の有無で見分ける（モジュールの読み込み経路により
 * クラスが別物になることがあるため）。
 */
export function sqlFragmentsOf(
  call: readonly unknown[] | undefined,
  options: { afterAnd?: boolean } = {}
): string[] {
  if (!call || call.length === 0) return [];
  const [strings, ...values] = call as [readonly string[], ...unknown[]];
  return values.flatMap((value, index) => {
    const sql = (value as { sql?: unknown } | null)?.sql;
    if (typeof sql !== 'string') return [];
    if (options.afterAnd && !/\bAND\s*$/.test(strings[index] ?? '')) return [];
    return [sql];
  });
}

/**
 * /stats の 7 日の件数の問い合わせ（lib/services/dashboard-stats.ts の countPublishedBetween）か。
 * GROUP BY の無い COUNT(*) は必ず 1 行を返すので、$queryRaw のモックはこの問い合わせに [{ count }] を返す。
 * 書き方の違い（AS の大文字など）で外れないよう、SELECT の直後が COUNT(*) かだけを見る
 * （COUNT(*) で始まる生 SQL はこの問い合わせだけ）
 */
export function isStatsPeriodCountQuery(call: readonly unknown[]): boolean {
  const [strings] = call as [readonly string[] | undefined];
  return /^\s*SELECT\s+COUNT\(\*\)/i.test(strings?.[0] ?? '');
}

/** 無効化したソースの記事を除く断片（lib/database/enabled-source-filter.ts）の本体 */
export const ENABLED_SOURCE_SQL =
  'IN (SELECT id FROM "Source" WHERE enabled = true)';

/** 期間の断片（lib/database/article-aggregation-filter.ts の articleAggregationSql に from・to を渡したもの）の形 */
const ANALYSIS_PERIOD_SQL = new RegExp(
  '^a\\."isHidden" = false AND a\\."sourceId" ' +
    ENABLED_SOURCE_SQL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    ' AND a\\."publishedAt" >= \\?::timestamptz AND a\\."publishedAt" < \\?::timestamptz$'
);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * タイムゾーン無しの timestamp へのキャスト（::timestamp、::pg_catalog.timestamp、::"timestamp"、
 * CAST(… AS timestamp)。大文字も）。timestamptz と timestamp with time zone は除く
 */
const TIMESTAMP_WITHOUT_TZ =
  /(?:::|\bAS\s+)\s*(?:"?pg_catalog"?\s*\.\s*)?"?timestamp"?(?!tz)(?!(?:\s*\(\s*\d+\s*\))?\s+with\s+time\s+zone)\b/i;

/** 問い合わせの全文。値が Prisma.Sql の断片ならその SQL を、それ以外の値は ? を埋める */
export function fullSqlOf(call: readonly unknown[]): string {
  const [strings, ...values] = call as [readonly string[], ...unknown[]];
  return strings
    .map((text, index) => {
      if (index >= values.length) return text;
      const sql = (values[index] as { sql?: unknown } | null)?.sql;
      return text + (typeof sql === 'string' ? sql : '?');
    })
    .join('');
}

/**
 * トレンドの分析（lib/services/trend-analysis.ts）の問い合わせの期間の条件を確かめる。
 * - 期間は 1 つの断片で、非表示でない・有効なソース・[from, to) を、すべて AND でつなぐ
 * - from・to は Z 付きの ISO 文字列を ::timestamptz で読む（Date のまま渡すと pg アダプターはオフセット無しで送り、
 *   ::timestamp はオフセットを捨てる。どちらもセッションのタイムゾーンが UTC でないと時差の分ずれる）。
 *   to は集計の時刻（呼び出しの前後の時刻 calledBetween の間）で、from は to の days 日前
 * - 断片は WHERE か AND の直後に置き、後ろには AND・GROUP BY・ORDER BY・LIMIT・閉じ括弧・終わりだけが来る。
 *   問い合わせのどこにも OR を書かない（断片は括弧で囲まれていないので、前後のどこかに OR や IS・= があると、
 *   優先順位で期間の外の記事が入る。分析の問い合わせは OR を使わない）
 * - 問い合わせのどこにも、タイムゾーン無しのキャストが無い
 */
export function expectAnalysisPeriodSql(
  call: readonly unknown[],
  {
    days,
    calledBetween,
  }: { days: number; calledBetween: readonly [number, number] }
): void {
  const [strings, ...values] = call as [readonly string[], ...unknown[]];
  const periodIndexes = values.flatMap((value, index) =>
    String((value as { sql?: unknown } | null)?.sql ?? '').includes(
      'a."isHidden" = false'
    )
      ? [index]
      : []
  );
  expect({ periodFragments: periodIndexes.length }).toEqual({
    periodFragments: 1,
  });
  const [periodIndex] = periodIndexes;
  const period = values[periodIndex] as { sql: string; values: unknown[] };

  expect(period.sql.replace(/\s+/g, ' ').trim()).toMatch(ANALYSIS_PERIOD_SQL);
  const [from, to] = period.values;
  expect({
    count: period.values.length,
    from: typeof from,
    to: typeof to,
  }).toEqual({ count: 2, from: 'string', to: 'string' });
  expect(from).toMatch(ISO_UTC);
  expect(to).toMatch(ISO_UTC);
  const toMs = Date.parse(String(to));
  expect({ from, to }).toEqual({
    from: new Date(toMs - days * DAY_MS).toISOString(),
    to,
  });
  expect({
    toIsBetweenCall: toMs >= calledBetween[0] && toMs <= calledBetween[1],
  }).toEqual({ toIsBetweenCall: true });

  expect(strings[periodIndex]).toMatch(/\b(WHERE|AND)\s*$/i);
  expect(strings[periodIndex + 1] ?? '').toMatch(
    /^\s*(?:AND\b|GROUP\s+BY\b|ORDER\s+BY\b|LIMIT\b|\)|$)/i
  );
  const fullSql = fullSqlOf(call);
  expect(fullSql).not.toMatch(/\bOR\b/i);
  expect(fullSql).not.toMatch(TIMESTAMP_WITHOUT_TZ);
}
