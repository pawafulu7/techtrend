import { headers } from 'next/headers';
import type { ComponentProps } from 'react';
import type { DehydratedState } from '@tanstack/react-query';
import { HydrateNewQueries } from '@/app/providers/hydrate-new-queries';
import {
  prefetchReaderArticles,
  type PrefetchReaderArticlesInput,
} from '../_data/prefetch-reader-articles';
import { ReaderClient } from '../reader-client';

const EMPTY_STATE: DehydratedState = { queries: [], mutations: [] };

type ReaderArticlesProps = Omit<
  ComponentProps<typeof ReaderClient>,
  'initialPersonalization'
> &
  Pick<PrefetchReaderArticlesInput, 'searchParams' | 'session'>;

/**
 * リーダーの一覧と本文。文書の要求（初回表示・再読み込み）では、サーバーで一覧の1ページ目と
 * 最初に開く記事の本文を取って HTML に入れる（ホームの app/components/home/home-articles.tsx と同じ形）。
 *
 * クライアント遷移（リーダーの中で条件を変えた・別の画面から来た）の RSC の要求では先読みしない。
 * 先読みすると遷移がサーバーの取得を待つため。文書の要求かどうかは、ブラウザが付ける
 * Sec-Fetch-Dest で見分ける（RSC の要求は fetch なので empty）。送らないクライアントは文書として扱う
 */
export async function ReaderArticles({
  searchParams,
  session,
  ...props
}: ReaderArticlesProps) {
  const fetchDest = (await headers()).get('sec-fetch-dest');
  const isDocumentRequest = fetchDest === null || fetchDest === 'document';

  const { dehydratedState, initialPersonalization } = isDocumentRequest
    ? await prefetchReaderArticles({
        searchParams,
        session,
        initialSortBy: props.initialSortBy,
        initialSourceIds: props.initialSourceIds,
      })
    : { dehydratedState: EMPTY_STATE, initialPersonalization: undefined };

  return (
    <HydrateNewQueries
      state={dehydratedState}
      principal={isDocumentRequest ? (session?.user?.id ?? null) : undefined}
    >
      <ReaderClient
        {...props}
        initialPersonalization={initialPersonalization}
      />
    </HydrateNewQueries>
  );
}
