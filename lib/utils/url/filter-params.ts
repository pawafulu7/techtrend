/**
 * 一覧フィルタの URL 更新で共通して落とすパラメータ。
 *
 * - `page`: 条件が変わったら 1 ページ目に戻す
 * - `article`: /reader の選択中記事。残すとフィルタ結果に存在しない記事の詳細が
 *   表示されたままになり、モバイルでは一覧へ戻れなくなる（詳細ペインの表示条件が
 *   `article` の有無のため）
 *
 * フィルタ部品ごとに delete を書くと必ず抜けが出るため、この関数を経由させる。
 */
export function clearTransientFilterParams(params: URLSearchParams): void {
  params.delete('page');
  params.delete('article');
}

/**
 * 現在のパスを保ったままクエリ文字列を組み立てる。
 *
 * フィルタ部品が遷移先を `/?...` と決め打ちすると、/reader や /papers で
 * フィルタを操作した瞬間にホームへ離脱する。
 */
export function buildFilterUrl(
  pathname: string,
  params: URLSearchParams
): string {
  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

/**
 * ページの searchParams（同じ名前が複数あると配列で届く）を、クライアントの useSearchParams と
 * 同じ並びの URLSearchParams にする。一覧の取得条件をサーバーとクライアントで同じに作るため
 * （ホームとリーダーの先読み）
 */
export function toURLSearchParams(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, v));
    } else if (value !== undefined) {
      searchParams.append(key, value);
    }
  }
  return searchParams;
}
