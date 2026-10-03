/**
 * 記事検索の検索語の上限（#684）
 *
 * 検索語は語ごとに title・summary などへの ILIKE 条件になる。レート制限の掛かっていない
 * 一覧 API で、長い検索語や大量の語で重いクエリを組み立てさせないための歯止め。
 */

/**
 * 検索語全体の長さ（前後の空白を除いたコードポイントの数）。値はソース一覧の search と
 * 同じだが、あちらは Zod の max で UTF-16 の単位で数える
 */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/** 空白で区切った語の数 */
export const MAX_SEARCH_KEYWORDS = 10;
