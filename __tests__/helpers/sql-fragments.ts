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
/**
 * タイムゾーン無しの timestamp へのキャスト（::timestamp、::pg_catalog.timestamp、::"timestamp"、
 * CAST(… AS timestamp)。大文字も）。timestamptz と timestamp with time zone は除く
 */
const TIMESTAMP_WITHOUT_TZ =
  /(?:::|\bAS\s+)\s*(?:pg_catalog\.)?"?timestamp"?(?!tz)(?!\s+with\s+time\s+zone)\b/i;

/** 問い合わせの全文。値が Prisma.Sql の断片ならその SQL を、それ以外の値は ? を埋める */
function fullSqlOf(call: readonly unknown[]): string {
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
 *   to − from は days 日
 * - 断片は WHERE か AND の直後に置く。問い合わせのどこにも OR を書かない（断片は括弧で囲まれていないので、
 *   前後のどこかに OR があると優先順位で期間の外の記事が入る。分析の問い合わせは OR を使わない）
 * - 問い合わせのどこにも、タイムゾーン無しのキャストが無い
 */
export function expectAnalysisPeriodSql(
  call: readonly unknown[],
  { days }: { days: number }
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
  expect(Date.parse(String(to)) - Date.parse(String(from))).toBe(
    days * 24 * 60 * 60 * 1000
  );

  expect(strings[periodIndex]).toMatch(/\b(WHERE|AND)\s*$/i);
  const fullSql = fullSqlOf(call);
  expect(fullSql).not.toMatch(/\bOR\b/i);
  expect(fullSql).not.toMatch(TIMESTAMP_WITHOUT_TZ);
}
