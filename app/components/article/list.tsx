'use client';

import { ArticleCard } from './card';
import { ArticleListItem } from './list-item';
import { CompactCard } from './compact-card';
import { StoryMembers } from './story-members';
import { groupArticlesByStory, type StoryGroup } from './story-grouping';
import type { ArticleListProps } from '@/types/components';
import type { ArticleWithUserData } from '@/types/models';
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { authClient } from '@/lib/auth/auth-client';
import { cn } from '@/lib/utils';
// useToast は全トーストの状態を購読して一覧全体を再描画させるため、関数だけを使う
import { toast } from '@/hooks/use-toast';

// 既読状態変更イベントの型定義
interface ArticleReadStatusChangedDetail {
  articleIds: string[];
  isRead: boolean;
}

const GRID_CLASS =
  'grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4 2xl:grid-cols-5';

export function ArticleList({
  articles: initialArticles,
  viewMode = 'card',
  onArticleClick,
  className,
  groupStories = false,
  thumbnailPlaceholder = true,
}: ArticleListProps) {
  // 認証状態を取得（お気に入り切り替え用）
  const { data: session } = authClient.useSession();

  // ローカルで記事データを管理
  const [articles, setArticles] = useState(initialArticles);

  // 競合状態を防ぐため、最新のarticles状態をrefで保持
  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  // initialArticlesの変更を反映
  useEffect(() => {
    // 楽観的更新でローカル管理しているarticlesをサーバーの最新データにリセットする
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArticles(initialArticles);
  }, [initialArticles]);

  // お気に入り切り替え処理
  const handleToggleFavorite = useCallback(
    async (articleId: string) => {
      if (!session?.user) {
        return;
      }

      // 現在のお気に入り状態を確認（楽観的更新前にrefから取得）
      const article = articlesRef.current.find((a) => a.id === articleId);
      if (!article) return;
      const currentlyFavorited = article.isFavorited ?? false;

      // 失敗したら表示を戻し、戻した理由を通知する（黙って戻すと、押せなかったように見えるため。issue #701）
      const revertFavorite = () => {
        setArticles((prev) =>
          prev.map((a) =>
            a.id === articleId ? { ...a, isFavorited: currentlyFavorited } : a
          )
        );
        toast({
          title: 'エラー',
          description:
            'お気に入りの更新に失敗しました。もう一度お試しください。',
          variant: 'destructive',
        });
      };

      // 楽観的更新 - ローカル状態を即座に更新
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId ? { ...a, isFavorited: !currentlyFavorited } : a
        )
      );

      try {
        // お気に入り状態に応じてPOSTまたはDELETEを送信
        const response = await fetch(`/api/favorites/${articleId}`, {
          method: currentlyFavorited ? 'DELETE' : 'POST',
        });

        // 409 = 既に登録済み / 404 = 既に未登録。サーバーの状態は望む状態と一致して
        // いるので成功と同じ扱いにする（favorite-button.tsx と同じ判定）
        const alreadyInDesiredState =
          (!currentlyFavorited && response.status === 409) ||
          (currentlyFavorited && response.status === 404);

        if (response.ok || alreadyInDesiredState) {
          // API成功時にイベント発火（React Queryキャッシュ同期用）
          window.dispatchEvent(
            new CustomEvent('article-favorite-changed', {
              detail: {
                articleId,
                isFavorited: !currentlyFavorited,
                timestamp: Date.now(),
                userId: session.user.id,
              },
            })
          );
        } else {
          revertFavorite();
        }
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
        revertFavorite();
      }
    },
    [session]
  );

  // 既読状態変更イベントをリッスンして記事データを更新
  useEffect(() => {
    const handleReadStatusChanged = (event: Event) => {
      const customEvent = event as CustomEvent<ArticleReadStatusChangedDetail>;
      if (customEvent.detail?.articleIds) {
        // 既読状態が変更された記事のIDリストを取得
        const { articleIds, isRead } = customEvent.detail;
        setArticles((prev) =>
          prev.map((a) => (articleIds.includes(a.id) ? { ...a, isRead } : a))
        );
      }
    };

    window.addEventListener(
      'articles-read-status-changed',
      handleReadStatusChanged
    );

    return () => {
      window.removeEventListener(
        'articles-read-status-changed',
        handleReadStatusChanged
      );
    };
  }, []);

  // 一括既読イベントをリッスン
  useEffect(() => {
    const handleBulkRead = (event: Event) => {
      const customEvent = event as CustomEvent<{ isRead: boolean }>;
      if (customEvent.detail?.isRead) {
        // 全記事を既読に更新
        setArticles((prev) => prev.map((a) => ({ ...a, isRead: true })));
      }
    };

    window.addEventListener('articles-bulk-read', handleBulkRead);

    return () => {
      window.removeEventListener('articles-bulk-read', handleBulkRead);
    };
  }, []);

  // 同じストーリーの記事を1枚にまとめる（issue #723。ホームの一覧だけ）
  const groups = useMemo<StoryGroup<ArticleWithUserData>[]>(
    () =>
      groupStories
        ? groupArticlesByStory(articles)
        : articles.map((article) => ({
            article,
            storyId: null,
            storySize: 1,
          })),
    [articles, groupStories]
  );

  // まとめた記事は、代表の下に「ほか N 件」を付ける。カードの下端と帯をつなげる
  const withStory = (
    group: StoryGroup<ArticleWithUserData>,
    item: ReactNode
  ) =>
    group.storyId ? (
      <div
        // 代表が後のページで届いて入れ替わっても、開いた状態を保つ
        key={`story-${group.storyId}`}
        className="flex flex-col [&>*:first-child]:rounded-b-none"
        data-testid="story-group"
        data-story-id={group.storyId}
      >
        {item}
        <StoryMembers
          storyId={group.storyId}
          storySize={group.storySize}
          shownArticleId={group.article.id}
          onArticleClick={onArticleClick}
        />
      </div>
    ) : (
      item
    );

  if (articles.length === 0) {
    return (
      <div
        data-testid="empty-state"
        className={cn('py-12 text-center', className)}
      >
        <p className="text-muted-foreground">記事が見つかりませんでした</p>
      </div>
    );
  }

  // リスト形式の場合
  if (viewMode === 'list') {
    return (
      <div className={cn('space-y-2', className)} data-testid="article-list">
        {groups.map((group, index) =>
          withStory(
            group,
            <ArticleListItem
              key={group.article.id}
              article={group.article}
              articleIndex={index}
              totalArticleCount={groups.length}
              onArticleClick={onArticleClick}
              isRead={group.article.isRead ?? true}
              isFavorited={group.article.isFavorited ?? false}
              onToggleFavorite={() => handleToggleFavorite(group.article.id)}
            />
          )
        )}
      </div>
    );
  }

  // コンパクト形式の場合
  if (viewMode === 'compact') {
    return (
      <div className={cn(GRID_CLASS, className)} data-testid="article-list">
        {groups.map((group) =>
          withStory(
            group,
            <CompactCard
              key={group.article.id}
              article={group.article}
              onArticleClick={onArticleClick}
              isRead={group.article.isRead ?? true}
              isFavorited={group.article.isFavorited ?? false}
              onToggleFavorite={() => handleToggleFavorite(group.article.id)}
            />
          )
        )}
      </div>
    );
  }

  // カード形式の場合
  return (
    <div className={cn(GRID_CLASS, className)} data-testid="article-list">
      {groups.map((group) =>
        withStory(
          group,
          <ArticleCard
            key={group.article.id}
            article={group.article}
            onArticleClick={onArticleClick}
            isRead={group.article.isRead ?? true}
            isFavorited={group.article.isFavorited ?? false}
            onToggleFavorite={() => handleToggleFavorite(group.article.id)}
            layout="grid"
            thumbnailPlaceholder={thumbnailPlaceholder}
          />
        )
      )}
    </div>
  );
}
