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
