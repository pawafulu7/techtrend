'use client';

import {
  QueryClient,
  QueryClientProvider,
  InfiniteData,
} from '@tanstack/react-query';
import dynamic from 'next/dynamic';

const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then((mod) => ({
      default: mod.ReactQueryDevtools,
    })),
  { ssr: false }
);
import { useEffect, useState, useRef } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import type { ArticleWithUserData } from '@/types/models';

interface FavoriteChangedDetail {
  articleId: string;
  isFavorited: boolean;
  timestamp: number;
}

interface ReadStatusChangedDetail {
  articleId: string;
  isRead: boolean;
}

interface BulkReadDetail {
  isRead: boolean;
}

interface ArticlesResponse {
  data: {
    items: ArticleWithUserData[];
  };
}

type InfiniteArticlesData = InfiniteData<ArticlesResponse, number>;

// principal（ログインユーザー）が変わったときに破棄すべきユーザー依存キャッシュ。
// read-status / personalization-preferences は queryKey に userId を含むため対象外、
// related-articles / interest-categories はユーザー非依存の公開データなので対象外。
// digest は queryKey が ['digest', period] で principal を含まないがパーソナライズ
// 由来のユーザー固有データなので含める。
const USER_SCOPED_QUERY_KEY_PREFIXES = [
  ['infinite-articles'],
  ['infinite-favorites'],
  ['digest'],
] as const;

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5分
            gcTime: 10 * 60 * 1000, // 10分（旧 cacheTime）
            retry: 1,
            refetchOnWindowFocus: false,
            // 未設定だと networkMode !== 'always' により既定 true になり、online
            // イベント（スリープ復帰・WiFi 再接続）で infinite query の読み込み済み
            // 全ページが 1 ページ目から取り直される。ログイン状態に依存しない
            // 唯一の強制再取得経路なのでグローバルに無効化する。
            // app/dashboard/** は refetchInterval を明示指定しており影響を受けない。
            refetchOnReconnect: false,
          },
        },
      })
  );
  const lastFavoriteUpdateRef = useRef<Map<string, number>>(new Map());

  const {
    data: session,
    isPending: isSessionPending,
    error: sessionError,
  } = authClient.useSession();
  const currentUserId = session?.user?.id;
  // better-auth は 401 のときだけ session.data を null にする
  // （node_modules/better-auth/dist/client/session-atom.mjs:90-92 の
  //  `data: isUnauthorized ? null : latest.data`）。
  // ただしセッション失効は 401 にならない。get-session ハンドラは失効を検知すると
  // Cookie を消して `ctx.json(null)` = HTTP 200 + null を返す
  // （node_modules/better-auth/dist/api/routes/session.mjs:182-191）。
  // つまり「失効 → userId が undefined」は sessionError なしで起きるため、
  // この 401 ガードだけでは失効時のキャッシュ破棄を防げない。破棄条件そのものを
  // 「別の非 null principal が現れたときだけ」に狭めることで対処している（下記）。
  const isSessionUnauthorized = sessionError?.status === 401;
  // 「最後に確定した非 null の principal」のみを記録する。
  // null = まだ非 null principal を観測していない、string = 確定ユーザー ID。
  // isPending 中・401 由来の値・null への遷移では上書きしない。null を前回値として
  // 記録しないのが要点で、サインアウト → 別ユーザーログインの経路でも
  // 「前ユーザー X」と「新ユーザー Y」を直接比較できる。
  const lastPrincipalRef = useRef<string | null>(null);

  // 別の principal が現れたらユーザー依存キャッシュを破棄する（別ユーザーに前
  // ユーザーのデータが見えるのを防ぐ）。
  //
  // 遷移ごとの挙動:
  //   isPending 中                        → 破棄しない（identity 不定・前回値も更新しない）
  //   未解決 → X                          → 破棄しない（初回解決。比較対象が無い）
  //   X → X                               → 破棄しない（変化なし）
  //   X → null（失効・サインアウト）      → 破棄しない
  //   null → Y（最後の非 null が X ≠ Y）  → 破棄する
  //   null → Y（最後の非 null が Y）      → 破棄しない（同一ユーザーの再ログイン）
  //   X → Y（両方非 null、X ≠ Y）         → 破棄する
  //   401 由来の data: null               → 破棄しない
  useEffect(() => {
    // isPending 中は identity が不定。前回値の更新も判定も行わない
    if (isSessionPending) return;

    // 401 由来の data: null は principal 変化として扱わない。
    // 下の「null への遷移では破棄しない」で実質カバーされるが、401 を principal の
    // 変化として扱わないという意図を明示するために残す。
    if (isSessionUnauthorized) return;

    const nextPrincipal = currentUserId ?? null;

    // X → null（セッション失効・サインアウト）では破棄しない。
    // 新しい principal が現れていないので privacy リスクは無い。逆にここで破棄すると
    // 読み込み済みの一覧・お気に入り・ダイジェストを全て捨てることになり、この PR で
    // 直している「タブ復帰で内容が失われる」症状を別経路で再現してしまう。
    // better-auth は失効時に 200 + null を返す（上記 session.mjs:182-191）ため、
    // この経路はタブ復帰のたびに現実的に発生する。
    // 前回値も更新しないので、次に非 null principal が現れたときに「前ユーザーとの
    // 差」で判定できる。
    //
    // 残る既知の妥協: サインアウト後・別ユーザーログイン前の窓では、別タブに前
    // ユーザーのお気に入り／既読表示が残る（gcTime 以内）。これは「古い UI が残る」
    // 問題であり、別ユーザーに前ユーザーのデータが見えるという漏洩ではない。次に
    // 別 principal が現れた時点で破棄されるためリスクは受容する。
    if (nextPrincipal === null) return;

    const prevPrincipal = lastPrincipalRef.current;
    lastPrincipalRef.current = nextPrincipal;

    // 初回解決（未観測 → 確定 ID）: 比較対象が無い。ここで破棄すると全画面が
    // 毎ロード 1 回リセットされる
    if (prevPrincipal === null) return;
    // 同一ユーザー（X → X、および null を挟んだ同一ユーザーの再ログイン）
    if (prevPrincipal === nextPrincipal) return;

    // ここに到達するのは prevPrincipal・nextPrincipal がどちらも確定 ID で、かつ
    // 異なる場合のみ（X → Y、または X → null → Y）。別ユーザーが現れた。
    for (const queryKey of USER_SCOPED_QUERY_KEY_PREFIXES) {
      queryClient.removeQueries({ queryKey });
    }
  }, [isSessionPending, isSessionUnauthorized, currentUserId, queryClient]);

  // Global listener for cross-screen cache sync
  useEffect(() => {
    const handleFavoriteChanged = (event: Event) => {
      const customEvent = event as CustomEvent<FavoriteChangedDetail>;
      const detail = customEvent.detail;
      if (!detail?.articleId) {
        return;
      }
      const { articleId, isFavorited } = detail;
      const timestamp = Number.isFinite(detail.timestamp)
        ? detail.timestamp
        : Date.now();

      const lastUpdate = lastFavoriteUpdateRef.current.get(articleId) || 0;
      if (timestamp < lastUpdate) return;
      lastFavoriteUpdateRef.current.set(articleId, timestamp);

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: ['infinite-articles'], exact: false },
        (oldData) => {
          if (!oldData?.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => {
              if (!page?.data?.items) return page;
              return {
                ...page,
                data: {
                  ...page.data,
                  items: page.data.items.map((item) =>
                    item.id === articleId ? { ...item, isFavorited } : item
                  ),
                },
              };
            }),
          };
        }
      );

      // ここで invalidateQueries は行わない。
      // ['infinite-articles'] は直前の setQueriesData による楽観更新で完結して
      // おり完全に冗長だった。invalidateQueries の refetchType 既定は 'active' の
      // ため、お気に入りを 1 クリックするだけで表示中の全ページが再取得され、
      // 記事の並びが変わっていた。
      // ['infinite-favorites'] も無条件 invalidate をやめ、
      // app/hooks/use-infinite-favorites.ts の「削除ならキャッシュ更新／追加なら
      // invalidate」という条件分岐に委ねる（無条件 invalidate はその分岐を
      // 無効化していた）。
      // app/components/article/favorite-button.tsx は成功時のみ event を
      // dispatch し、失敗時は自前でロールバックするため、楽観更新がサーバー状態と
      // 乖離する経路は作られない。
    };

    window.addEventListener('article-favorite-changed', handleFavoriteChanged);
    return () => {
      window.removeEventListener(
        'article-favorite-changed',
        handleFavoriteChanged
      );
    };
  }, [queryClient]);

  useEffect(() => {
    const invalidateReadRelatedQueries = () => {
      queryClient.invalidateQueries({ queryKey: ['read-status'] });
      queryClient.invalidateQueries({ queryKey: ['digest'] });
    };

    const handleReadStatusChanged = (event: Event) => {
      const customEvent = event as CustomEvent<ReadStatusChangedDetail>;
      const detail = customEvent.detail;
      if (!detail?.articleId) {
        return;
      }

      const { articleId, isRead } = detail;

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: ['infinite-articles'], exact: false },
        (oldData) => {
          if (!oldData?.pages) return oldData;
          let changed = false;
          const pages = oldData.pages.map((page) => {
            if (!page?.data?.items) return page;
            let pageChanged = false;
            const items = page.data.items.map((item) => {
              if (item.id !== articleId || item.isRead === isRead) return item;
              pageChanged = true;
              changed = true;
              return { ...item, isRead };
            });
            return pageChanged
              ? { ...page, data: { ...page.data, items } }
              : page;
          });
          return changed ? { ...oldData, pages } : oldData;
        }
      );

      // Read/unread filters may need a refetch to adjust membership
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['infinite-articles'], exact: false })
        .forEach((query) => {
          if (!Array.isArray(query.queryKey)) return;
          const filterKey = query.queryKey[1];
          if (typeof filterKey !== 'string') return;
          try {
            const parsed = JSON.parse(filterKey) as { readFilter?: string };
            if (parsed?.readFilter) {
              queryClient.invalidateQueries({
                queryKey: query.queryKey,
                refetchType: 'active',
              });
            }
          } catch {
            // Ignore non-JSON filter keys
          }
        });

      invalidateReadRelatedQueries();
    };

    const handleBulkRead = (event: Event) => {
      const customEvent = event as CustomEvent<BulkReadDetail>;
      if (!customEvent.detail?.isRead) {
        return;
      }

      queryClient.invalidateQueries({
        queryKey: ['infinite-articles'],
        refetchType: 'active',
      });
      invalidateReadRelatedQueries();
    };

    window.addEventListener(
      'article-read-status-changed',
      handleReadStatusChanged
    );
    window.addEventListener('articles-bulk-read', handleBulkRead);
    return () => {
      window.removeEventListener(
        'article-read-status-changed',
        handleReadStatusChanged
      );
      window.removeEventListener('articles-bulk-read', handleBulkRead);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
