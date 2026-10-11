import { headers } from 'next/headers';
import type { ComponentProps } from 'react';
import type { DehydratedState } from '@tanstack/react-query';
import { HomeClientInfinite } from '@/app/components/home/home-client-infinite';
import { HydrateNewQueries } from '@/app/providers/hydrate-new-queries';
import {
  prefetchHomeArticles,
  type PrefetchHomeArticlesInput,
} from '@/app/components/home/prefetch-home-articles';

const EMPTY_STATE: DehydratedState = { queries: [], mutations: [] };

type HomeArticlesProps = Omit<
  ComponentProps<typeof HomeClientInfinite>,
  'initialPersonalization'
> &
  Pick<PrefetchHomeArticlesInput, 'searchParams' | 'session'>;

/**
 * ホームの記事一覧。文書の要求（初回表示・再読み込み）では、サーバーで1ページ目を取って
 * HTML に入れる（issue #714）。
 *
 * クライアント遷移（フィルターの変更・記事詳細から戻る）の RSC の要求では先読みしない。
 * 先読みすると遷移がサーバーの取得を待ち、その間は前の条件の一覧が出たままになる。
 * 先読みしなければ、これまでどおり新しい条件の一覧をクライアントが取る（キャッシュが
 * あればそれを使う）。
 * 文書の要求かどうかは、ブラウザが付ける Sec-Fetch-Dest で見分ける（RSC の要求は
 * fetch なので empty になる）。Next の 'rsc' ヘッダーは headers() から取り除かれるので
 * 使えない。Sec-Fetch-Dest を送らないクライアント（古いブラウザ・クローラー）は
 * 文書の要求として扱う
 */
export async function HomeArticles({
  searchParams,
  session,
  ...props
}: HomeArticlesProps) {
  const fetchDest = (await headers()).get('sec-fetch-dest');
  const isDocumentRequest = fetchDest === null || fetchDest === 'document';

  // 先読みしないときも同じ要素の並びで描く。並びが変わると一覧が作り直され、
  // 取得中の要求が取り消されて同じ要求をもう一度送るため
  const { dehydratedState, initialPersonalization } = isDocumentRequest
    ? await prefetchHomeArticles({
        searchParams,
        session,
        initialSortBy: props.initialSortBy,
        initialSourceIds: props.initialSourceIds,
        excludeSources: props.excludeSources,
      })
    : { dehydratedState: EMPTY_STATE, initialPersonalization: undefined };

  return (
    <HydrateNewQueries
      state={dehydratedState}
      principal={isDocumentRequest ? (session?.user?.id ?? null) : undefined}
    >
      <HomeClientInfinite
        {...props}
        initialPersonalization={initialPersonalization}
      />
    </HydrateNewQueries>
  );
}
