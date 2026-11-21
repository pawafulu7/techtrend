/**
 * リーダーの一覧の1ページ目と、最初に開く記事の本文をサーバーで取り、クライアントへ渡す状態を作る
 * （ホームの prefetch-home-articles.ts と同じ形。issue #714）。
 *
 * これまでは HTML → JS → セッション判定 →（ログイン時は設定の取得）→ 一覧 → 本文と直列に待ち、
 * その間は一覧の欄が空だった。サーバーで同じ条件の1ページ目と本文を取り、HTML に入れる。
 *
 * - 条件・queryKey・要求は lib/articles/reader-articles-query.ts でクライアントと同じ関数で作る
 * - 取得は API のハンドラをそのまま呼ぶ（クライアントが API から受け取る応答と同じにするため）
 * - 取得に失敗したら、その部分の先読みを諦める（クライアントがこれまでどおり取る）
 * - 本文はリーダーで使う項目だけを渡す（記事の全文は HTML に入れない）
 * - QueryClient はリクエストごとに作る（ユーザーのデータが他のリクエストに混ざらないように）
 */

import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import {
  QueryClient,
  dehydrate,
  type DehydratedState,
  type InfiniteData,
} from '@tanstack/react-query';
import { GET as getArticleList } from '@/app/api/articles/list/route';
import { handleGet as getArticles } from '@/app/api/articles/handlers';
import { GET as getArticleDetail } from '@/app/api/articles/[id]/route';
import {
  fetchHomePreferences,
  INTERNAL_ORIGIN,
  type Session,
} from '@/app/components/home/prefetch-home-articles';
import {
  buildReaderFilterParams,
  buildReaderListRequest,
  readerDetailQueryKey,
  readerListQueryKey,
  toReaderDetailArticle,
} from '@/lib/articles/reader-articles-query';
import {
  toHomePersonalization,
  type HomePersonalization,
} from '@/lib/personalization/preferences-state';
import type {
  ArticleDetailResponse,
  ArticleListResponse,
} from '@/app/reader/types';
import logger from '@/lib/logger';

type ArticleListPage = Extract<ArticleListResponse, { success: true }>;
type ArticleDetail = Extract<ArticleDetailResponse, { success: true }>;

export interface PrefetchReaderArticlesInput {
  searchParams: URLSearchParams;
  initialSortBy?: string;
  initialSourceIds?: string[];
  session: Session;
}

export interface PrefetchReaderArticlesResult {
  dehydratedState: DehydratedState;
  /**
   * 先読みに使ったパーソナライズ設定。クライアントが設定を判定し終えるまで使う。
   * 先読みしなかったときは undefined（クライアントは設定の判定を待って取る）
   */
  initialPersonalization: HomePersonalization | undefined;
}

/** 取得の失敗。HTTP の状態を持たせ、見つからない記事（404）をログから外すのに使う */
class PrefetchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** 記事の本文を取ってキャッシュに置く。失敗したら置かない（クライアントが取る） */
async function prefetchDetail(queryClient: QueryClient, id: string) {
  const detailKey = readerDetailQueryKey(id);
  await queryClient.prefetchQuery({
    queryKey: detailKey,
    queryFn: async (): Promise<ArticleDetail> => {
      const request = new NextRequest(
        `${INTERNAL_ORIGIN}/api/articles/${encodeURIComponent(id)}`
      );
      const response = await getArticleDetail(request, {
        params: Promise.resolve({ id }),
      });
      const json = (await response.json()) as ArticleDetailResponse;
      if (!response.ok || !json.success) {
        throw new PrefetchError(
          `Failed to prefetch the reader article: ${response.status}`,
          response.status
        );
      }
      return { success: true, data: toReaderDetailArticle(json.data) };
    },
  });
  // 見つからない・本文の無い記事（404）は珍しくないので、ログは 404 以外だけ残す
  const detailState = queryClient.getQueryState(detailKey);
  const status =
    detailState?.error instanceof PrefetchError
      ? detailState.error.status
      : undefined;
  if (detailState?.status !== 'success' && status !== 404) {
    logger.warn(
      { status: detailState?.status ?? 'missing', err: detailState?.error },
      'Reader SSR: the first article is not available'
    );
  }
}

export async function prefetchReaderArticles({
  searchParams,
  initialSortBy,
  initialSourceIds,
  session,
}: PrefetchReaderArticlesInput): Promise<PrefetchReaderArticlesResult> {
  const queryClient = new QueryClient();
  const cookie = (await headers()).get('cookie');
  const userId = session?.user?.id;
  // URL で記事を選んでいるときは、本文を最初に取り始める（本文は設定にも一覧にもよらない）。
  // 選んでいる記事の扱いはクライアント（reader-client.tsx の effectiveSelectedId）と同じにする。
  // article が空の値（?article=）なら、クライアントは本文を取らないので、ここでも取らない
  const articleParam = searchParams.get('article');
  const articleDetail = articleParam
    ? prefetchDetail(queryClient, articleParam)
    : undefined;

  // ログイン時はホームのパーソナライズ設定で条件を作る（リーダーはホームと同じ設定を使う）
  const preferences = userId
    ? await fetchHomePreferences(session, cookie, 'Reader SSR')
    : null;
  if (userId && !preferences) {
    // 設定が分からないまま取ると、パーソナライズしていない一覧を出した後に差し替えることになる。
    // 一覧は渡さない（本文は条件によらないので渡す）
    await articleDetail;
    return {
      dehydratedState: dehydrate(queryClient),
      initialPersonalization: undefined,
    };
  }
  const initialPersonalization = toHomePersonalization(
    preferences ?? undefined
  );

  const filterParams = buildReaderFilterParams({
    searchParams,
    initialSortBy,
    initialSourceIds,
    personalization: initialPersonalization,
  });
  const listKey = readerListQueryKey(filterParams);
  const { endpoint, searchParams: requestParams } = buildReaderListRequest(
    filterParams,
    1
  );

  await Promise.all([
    queryClient.prefetchInfiniteQuery({
      queryKey: listKey,
      initialPageParam: 1,
      queryFn: async (): Promise<ArticleListPage> => {
        const request = new NextRequest(
          `${INTERNAL_ORIGIN}${endpoint}?${requestParams.toString()}`,
          { headers: cookie ? { cookie } : undefined }
        );
        const response =
          endpoint === '/api/articles/list'
            ? await getArticleList(request)
            : await getArticles(request);
        const json = (await response.json()) as ArticleListResponse;
        if (!response.ok || !json.success) {
          throw new Error(
            `Failed to prefetch reader articles: ${response.status}`
          );
        }
        return json;
      },
    }),
    articleDetail,
  ]);

  // prefetchInfiniteQuery は例外を握り潰す。失敗はログに残し、一覧を渡さない
  const listState = queryClient.getQueryState(listKey);
  if (listState?.status !== 'success') {
    logger.warn(
      {
        endpoint,
        status: listState?.status ?? 'missing',
        err: listState?.error,
      },
      'Reader SSR: the first page of articles is not available'
    );
    return {
      dehydratedState: dehydrate(queryClient),
      initialPersonalization,
    };
  }

  // 記事を選んでいないときに開くのは、クライアントと同じく一覧の先頭
  if (articleParam === null) {
    const firstId =
      queryClient.getQueryData<InfiniteData<ArticleListPage>>(listKey)
        ?.pages[0]?.data.items[0]?.id;
    if (firstId) await prefetchDetail(queryClient, firstId);
  }

  return {
    dehydratedState: dehydrate(queryClient),
    initialPersonalization,
  };
}
