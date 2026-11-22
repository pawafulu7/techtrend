import type { Query } from '@tanstack/react-query';

/**
 * 記事の一覧（['infinite-articles']）の取得の失敗。
 * siteGate は、サイトの入口（Google ログイン）が切れた・取り消されたとき（401・403 の本文で見分ける）
 */
export class ArticlesFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly siteGate = false
  ) {
    super(message);
    this.name = 'ArticlesFetchError';
  }
}

export function isSiteGateArticlesError(error: unknown): boolean {
  return error instanceof ArticlesFetchError && error.siteGate;
}

/**
 * 記事の一覧のキャッシュを書き換えてよいか。サイトの入口に拒否されている間は書き換えない。
 * setQueryData は（同じデータを返しても）error を消して success にするため、入り直していないのに
 * 案内が消えて一覧が戻ってしまう。setQueriesData の predicate と findAll の絞り込みに使う
 */
export function isWritableArticlesQuery(query: Query): boolean {
  return !isSiteGateArticlesError(query.state.error);
}
