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
/** タイムゾーン無しの timestamp へのキャスト（::timestamp、CAST(… AS timestamp)。大文字も） */
const TIMESTAMP_WITHOUT_TZ = /::\s*timestamp(?!tz)\b|\bAS\s+timestamp(?!tz)\b/i;

/**
 * トレンドの分析（lib/services/trend-analysis.ts）の問い合わせの期間の条件を確かめる。
 * - 期間は 1 つの断片で、非表示でない・有効なソース・[from, to) を、すべて AND でつなぐ
 * - from・to は Z 付きの ISO 文字列を ::timestamptz で読む（Date のまま渡すと pg アダプターはオフセット無しで送り、
 *   ::timestamp はオフセットを捨てる。どちらもセッションのタイムゾーンが UTC でないと時差の分ずれる）。from < to
 * - 断片は WHERE か AND の直後に置き、前後を OR でつながない（断片は括弧で囲まれていないので、優先順位が崩れる）
 * - 外側のテンプレートにも、タイムゾーン無しのキャストが無い
 */
export function expectAnalysisPeriodSql(call: readonly unknown[]): void {
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
  expect(period.values).toHaveLength(2);
  expect(from).toMatch(ISO_UTC);
  expect(to).toMatch(ISO_UTC);
  expect(Date.parse(String(from))).toBeLessThan(Date.parse(String(to)));

  const before = strings[periodIndex];
  expect(before).toMatch(/\b(WHERE|AND)\s*$/);
  // 直前の WHERE から断片までに OR が無い（WHERE x OR y AND 期間 の形にしない）
  expect(before.slice(before.lastIndexOf('WHERE'))).not.toMatch(/\bOR\b/i);
  expect(strings[periodIndex + 1] ?? '').not.toMatch(/^\s*OR\b/i);

  for (const text of [sqlFragmentsOf(call).join(' '), strings.join('')]) {
    expect(text).not.toMatch(TIMESTAMP_WITHOUT_TZ);
  }
}
