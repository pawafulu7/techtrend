/**
 * リーダー（/reader）の一覧と記事詳細の取得条件・queryKey・要求。
 * サーバーの先読み（app/reader/_data/prefetch-reader-articles.ts）とクライアント（app/reader/reader-client.tsx）が
 * 同じ関数で作る。食い違うと、サーバーで取ったデータがクライアントのキーに当たらず、取り直しになる。
 * 'use client' のファイルに置くと、サーバーからは値として読めないので、ここに置く
 */

import {
  buildArticlesRequest,
  buildHomeArticleFilters,
  normalizeArticleFilters,
} from '@/lib/articles/home-articles-query';
import type { HomePersonalization } from '@/lib/personalization/preferences-state';
import type { ArticleType } from '@/lib/summary/article-type-prompts';
import { PAPER_SOURCE_IDS_PARAM } from '@/lib/sources/paper-source';

// リーダーには既読・未読の絞り込みの操作が無い。ホームの URL から引き継いでも条件にしない
// （付けると一覧がユーザーごとの結果になり、ユーザーを区別しないキャッシュに載る）
const READER_IGNORED_FILTERS = ['readFilter', 'includeUserData'];

interface BuildReaderFilterParamsInput {
  searchParams: URLSearchParams;
  /** URL に sortBy が無いときの並び順（ホームと同じ Cookie から） */
  initialSortBy?: string;
  /** URL に sources/sourceId が無いときのソース（ホームと同じ Cookie から） */
  initialSourceIds?: string[];
  personalization: HomePersonalization;
}

/**
 * 一覧の条件。ホームと同じ関数で組み立てる（Issue #709）。URL に無いソース・並び順は Cookie の値、
 * 論文のソースと要約の無い記事は除く。選んでいる記事（article）は条件に入れない
 */
export function buildReaderFilterParams({
  searchParams,
  initialSortBy,
  initialSourceIds,
  personalization,
}: BuildReaderFilterParamsInput): Record<string, string> {
  const params = buildHomeArticleFilters({
    searchParams,
    initialSortBy,
    initialSourceIds,
    personalization,
    // 論文のソースを除外（ホームと同じ。専用の/papersページで表示するため）
    excludeSources: PAPER_SOURCE_IDS_PARAM,
  });
  READER_IGNORED_FILTERS.forEach((key) => delete params[key]);
  return params;
}

/** リーダーの本文で使う記事の項目（/api/articles/[id] の応答のうち、本文の表示に使うもの） */
export interface ReaderDetailArticle {
  id: string;
  title: string;
  translatedTitle: string | null;
  url: string;
  summary: string | null;
  detailedSummary: string | null;
  thumbnail: string | null;
  publishedAt: string;
  summaryVersion: number | null;
  articleType: ArticleType | null;
  source: { id: string; name: string; url: string } | null;
  tags: { id: string; name: string }[];
}

export function readerListQueryKey(filterParams: Record<string, string>) {
  return ['reader-articles', filterParams] as const;
}

export function readerDetailQueryKey(id: string | null) {
  return ['reader-article-detail', id] as const;
}

/**
 * 一覧の要求。パーソナライズしているときは /api/articles（関連つき）、それ以外は軽量版の
 * /api/articles/list。どちらも { success, data: { items, page, totalPages } } を返す
 */
export function buildReaderListRequest(
  filterParams: Record<string, string>,
  page: number
) {
  return buildArticlesRequest(
    normalizeArticleFilters({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
      ...filterParams,
    }),
    { page }
  );
}

/**
 * リーダーの本文で使う項目だけを残す（ReaderDetailArticle）。API は記事の全項目（全文の content など）を
 * 返すが、サーバーの先読みで HTML に入れると表示しない分まで送ることになる。クライアントで取ったときも
 * 同じ形にして、どちらから入ってもキャッシュの中身をそろえる
 */
export function toReaderDetailArticle(raw: ReaderDetailArticle): ReaderDetailArticle {
  return {
    id: raw.id,
    title: raw.title,
    translatedTitle: raw.translatedTitle,
    url: raw.url,
    summary: raw.summary,
    detailedSummary: raw.detailedSummary,
    thumbnail: raw.thumbnail,
    publishedAt: raw.publishedAt,
    summaryVersion: raw.summaryVersion,
    articleType: raw.articleType,
    source: raw.source
      ? { id: raw.source.id, name: raw.source.name, url: raw.source.url }
      : null,
    tags: (raw.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name })),
  };
}
