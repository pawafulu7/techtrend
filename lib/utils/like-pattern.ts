/**
 * LIKE / ILIKE のパターンに入れる値をエスケープする
 *
 * Prisma の `contains`・`equals`（`mode: 'insensitive'` を含む）は値をエスケープせずに
 * `ILIKE ('%' || $1 || '%')`・`ILIKE $1` を組み立てるので、利用者の入力の `%`・`_` が
 * ワイルドカードとして効く。PostgreSQL の LIKE の既定のエスケープ文字は `\` なので、
 * `\`・`%`・`_` の前に `\` を付けると文字どおりに照合される。
 *
 * 1 回の置換で 3 文字をまとめて扱う。`\` を後からエスケープすると `\%` の `\` が
 * 二重になって壊れ、末尾の `\` を残すとパターンがエスケープ文字で終わって照合できない。
 *
 * 値はバインド変数として渡す前提（`standard_conforming_strings` の影響を受けない）。
 * 生 SQL では `%${escapeLikePattern(value)}%` の形でバインドする。
 *
 * @example escapeLikePattern('a_b%') // => 'a\\_b\\%'
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
