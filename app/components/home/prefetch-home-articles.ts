/**
 * ホームの記事一覧の1ページ目をサーバーで取り、クライアントへ渡す状態を作る（issue #714）。
 *
 * これまでは HTML → JS → セッション判定 →（ログイン時は設定の取得）→ 記事の取得と
 * 直列に待っていた。サーバーで同じ条件の1ページ目を取り、HTML に記事を入れる。
 *
 * - 取得条件と queryKey は lib/articles/home-articles-query.ts でクライアントと同じ関数で作る
 * - 取得は一覧 API のハンドラをそのまま呼ぶ。キャッシュ・ユーザーデータの重ね合わせ・
 *   パーソナライズの経路まで、クライアントが API から受け取る応答と同じにするため
 * - 取得に失敗したら先読みを諦める（クライアントがこれまでどおり取る）
 * - QueryClient はリクエストごとに作る（ユーザーのデータが他のリクエストに混ざらないように）
 */

import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import {
  QueryClient,
  dehydrate,
  type DehydratedState,
} from '@tanstack/react-query';
import { GET as getArticleList } from '@/app/api/articles/list/route';
import { handleGet as getArticles } from '@/app/api/articles/handlers';
import { GET as getCategoryPreferences } from '@/app/api/user/preferences/categories/route';
import type { getSession } from '@/lib/auth/get-session';
import {
  buildArticlesRequest,
  buildHomeArticleFilters,
  infiniteArticlesQueryKey,
  isMobileUserAgent,
  normalizeArticleFilters,
} from '@/lib/articles/home-articles-query';
import {
  fromPreferencesResponse,
  toHomePersonalization,
  type HomePersonalization,
} from '@/lib/personalization/preferences-state';
import type { UserCategoryPreferences } from '@/lib/personalization/types';
import type { ArticlesResponse } from '@/app/hooks/use-infinite-articles';
import logger from '@/lib/logger';

type Session = Awaited<ReturnType<typeof getSession>>;

/** ハンドラに渡す要求の URL の起点。ハンドラは URL から検索条件だけを読む */
const INTERNAL_ORIGIN = 'http://localhost';

export interface PrefetchHomeArticlesInput {
  searchParams: URLSearchParams;
  initialSortBy?: string;
  initialSourceIds?: string[];
  excludeSources?: string;
  session: Session;
}

export interface PrefetchHomeArticlesResult {
  dehydratedState: DehydratedState;
  /**
   * 先読みに使ったパーソナライズ設定。クライアントが設定を判定し終えるまで使う。
   * 先読みしなかったときは undefined（クライアントは設定の判定を待って取る）
   */
  initialPersonalization: HomePersonalization | undefined;
}

async function fetchHomePreferences(
  session: Session,
  cookie: string | null
): Promise<UserCategoryPreferences | null> {
  try {
    const request = new NextRequest(
      `${INTERNAL_ORIGIN}/api/user/preferences/categories?scope=home`,
      { headers: cookie ? { cookie } : undefined }
    );
    // ページで判定済みのセッションを渡し、もう一度判定しない
    const response = await getCategoryPreferences(request, { session });
    if (!response.ok) return null;
    return fromPreferencesResponse(await response.json());
  } catch (error) {
    logger.warn(
      { err: error },
      'Home SSR: failed to load personalization preferences'
    );
    return null;
  }
}

export async function prefetchHomeArticles({
  searchParams,
  initialSortBy,
  initialSourceIds,
  excludeSources,
  session,
}: PrefetchHomeArticlesInput): Promise<PrefetchHomeArticlesResult> {
  const queryClient = new QueryClient();
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const userId = session?.user?.id;

  // ログイン時はホームのパーソナライズ設定で取得条件を作る
  const preferences = userId
    ? await fetchHomePreferences(session, cookie)
    : null;
  if (userId && !preferences) {
    // 設定が分からないまま取ると、パーソナライズしていない一覧を出した後に、
    // クライアントが設定を読んでから一覧を差し替えることになる。先読みしない
    return {
      dehydratedState: dehydrate(queryClient),
      initialPersonalization: undefined,
    };
  }
  const initialPersonalization = toHomePersonalization(
    preferences ?? undefined
  );

  const normalizedFilters = normalizeArticleFilters({
    ...buildHomeArticleFilters({
      searchParams,
      initialSortBy,
      initialSourceIds,
      personalization: initialPersonalization,
      excludeSources,
    }),
    // HomeClientInfinite と同じく、お気に入りと既読を含める
    includeUserData: true,
  });
  const { endpoint, searchParams: requestParams } = buildArticlesRequest(
    normalizedFilters,
    {
      page: 1,
      // クライアントと同じ判定（回線の速さはサーバーでは分からない）
      lightweight: isMobileUserAgent(requestHeaders.get('user-agent') ?? ''),
    }
  );

  const queryKey = infiniteArticlesQueryKey(normalizedFilters);
  await queryClient.prefetchInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: async (): Promise<ArticlesResponse> => {
      const requestedAt = Date.now();
      const request = new NextRequest(
        `${INTERNAL_ORIGIN}${endpoint}?${requestParams.toString()}`,
        { headers: cookie ? { cookie } : undefined }
      );
      const response =
        endpoint === '/api/articles/list'
          ? await getArticleList(request)
          : await getArticles(request);
      if (!response.ok) {
        // 失敗の応答はキャッシュに置かない（クライアントが取り直す）
        logger.warn(
          { endpoint, status: response.status },
          'Home SSR: failed to prefetch the first page of articles'
        );
        throw new Error(`Failed to prefetch articles: ${response.status}`);
      }
      const data = await response.json();
      return { ...data, fetchedAt: Date.now(), requestedAt };
    },
  });

  // prefetchInfiniteQuery は例外を握り潰す。失敗の応答（上の警告）以外の失敗もログに残す
  const queryState = queryClient.getQueryState(queryKey);
  if (queryState?.status !== 'success') {
    logger.warn(
      {
        endpoint,
        status: queryState?.status ?? 'missing',
        err: queryState?.error,
      },
      'Home SSR: the first page of articles is not available'
    );
  }

  return {
    dehydratedState: dehydrate(queryClient),
    initialPersonalization,
  };
}
