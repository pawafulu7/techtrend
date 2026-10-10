/**
 * LIKE / ILIKE のパターンに入れる値をエスケープする
 *
 * Prisma の `contains`・`equals` は値をエスケープせずに `LIKE ('%' || $1 || '%')`・`LIKE $1`
 * （`mode: 'insensitive'` なら `ILIKE`）を組み立てるので、利用者の入力の `%`・`_` が
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

/**
 * 大文字小文字の区別が検索結果を変える語か（#717）。かな・漢字・数字・記号だけの語は
 * 小文字化しても変わらないので、ILIKE（大文字小文字を区別しない）と LIKE の結果が同じになる。
 */
export function hasCaseVariants(keyword: string): boolean {
  return keyword.toLowerCase() !== keyword.toUpperCase();
}

/**
 * Prisma の `contains` 条件を作る（#717）。`%`・`_`・`\` をエスケープし、大文字小文字の区別が
 * 要る語だけ `mode: 'insensitive'`（ILIKE）にする。ILIKE は行ごとに対象の文字列を小文字化するので、
 * 全件走査では LIKE の約 3 倍かかる（Article 12 万件で 130ms と 47ms）。かな・漢字・数字だけの語は
 * 結果が同じ LIKE にする。
 *
 * 結合文字（\p{M}）を含む語は ILIKE のままにする。ICU の照合（full case mapping）では
 * İ（U+0130）が i + U+0307 に小文字化され、記事側にだけ結合文字が現れるため、LIKE と ILIKE の
 * 結果が変わり得る。dev（libc ja_JP.UTF-8）と本番（builtin C.UTF-8、simple case mapping）は
 * ICU ではないが、照合の設定に依存しないようにしておく。
 */
export function containsFilter(keyword: string): {
  contains: string;
  mode?: 'insensitive';
} {
  const pattern = escapeLikePattern(keyword);
  return hasCaseVariants(keyword) || /\p{M}/u.test(keyword)
    ? { contains: pattern, mode: 'insensitive' }
    : { contains: pattern };
}
