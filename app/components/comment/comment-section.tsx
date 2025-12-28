'use client';

/**
 * CommentSection Component
 *
 * Task 4.1: CommentSection コンテナコンポーネント実装
 * - 認証状態に応じた表示切り替え
 * - sessionStatus === 'loading' 時の Skeleton 表示
 * - コメント状態管理
 * - 記事詳細画面（ArticleQADialog 下）への配置
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StickyNote, Lock, LogIn } from 'lucide-react';
import { CommentForm } from './comment-form';
import { CommentList } from './comment-list';
import { CommentSectionSkeleton } from './comment-skeletons';
import type {
  CommentResponse,
  PaginatedCommentsResponse,
  CreateCommentInput,
  UpdateCommentInput,
} from './types';

const DEFAULT_LIMIT = 10;

interface CommentSectionProps {
  articleId: string;
  className?: string;
}

export function CommentSection({ articleId, className }: CommentSectionProps) {
  const { data: session, status: sessionStatus } = useSession();
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 楽観的更新用のロールバックデータ（comments と totalCount を両方保存）
  const rollbackRef = useRef<{ comments: CommentResponse[]; totalCount: number } | null>(null);

  const isAuthenticated = sessionStatus === 'authenticated' && !!session?.user;
  const currentUserId = session?.user?.id || '';

  // コメント一覧を取得
  const fetchComments = useCallback(
    async (cursor?: string) => {
      if (!isAuthenticated) return;

      setIsLoading(true);

      try {
        const params = new URLSearchParams({
          articleId,
          limit: String(DEFAULT_LIMIT),
        });
        if (cursor) {
          params.set('cursor', cursor);
        }

        const response = await fetch(`/api/comments?${params.toString()}`, {
          credentials: 'include',
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch comments');
        }

        const data: PaginatedCommentsResponse = await response.json();

        if (cursor) {
          // 追加読み込み
          setComments((prev) => [...prev, ...data.comments]);
        } else {
          // 初回読み込み
          setComments(data.comments);
        }

        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
        setTotalCount(data.totalCount);
      } catch (err) {
        // 取得エラーをユーザーに通知
        const message = err instanceof Error ? err.message : 'コメントの取得に失敗しました';
        setFetchError(message);
        console.warn('Comment fetch error:', message);
      } finally {
        setIsLoading(false);
      }
    },
    [articleId, isAuthenticated]
  );

  // 初回読み込み
  useEffect(() => {
    if (isAuthenticated) {
      fetchComments();
    }
  }, [isAuthenticated, fetchComments]);

  // コメント作成
  const handleCreate = useCallback(
    async (input: CreateCommentInput): Promise<CommentResponse> => {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'コメントの投稿に失敗しました');
      }

      return response.json();
    },
    []
  );

  // コメント作成成功時
  const handleCreateSuccess = useCallback((comment: CommentResponse) => {
    setComments((prev) => [comment, ...prev]);
    setTotalCount((prev) => prev + 1);
  }, []);

  // コメント更新
  const handleUpdate = useCallback(
    async (id: string, input: UpdateCommentInput): Promise<CommentResponse> => {
      const response = await fetch(`/api/comments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update comment');
      }

      const updated = await response.json();

      // 状態を更新
      setComments((prev) =>
        prev.map((c) => (c.id === id ? updated : c))
      );

      return updated;
    },
    []
  );

  // コメント削除
  const handleDelete = useCallback(async (id: string): Promise<void> => {
    const response = await fetch(`/api/comments/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete comment');
    }

    // 状態から削除
    setComments((prev) => prev.filter((c) => c.id !== id));
    setTotalCount((prev) => Math.max(0, prev - 1));
  }, []);

  // 楽観的更新: コメント更新
  const handleUpdateOptimistic = useCallback(
    (id: string, partial: Partial<CommentResponse>) => {
      rollbackRef.current = { comments: [...comments], totalCount };
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...partial } : c))
      );
    },
    [comments, totalCount]
  );

  // 楽観的更新: コメント削除
  const handleRemoveOptimistic = useCallback(
    (id: string) => {
      rollbackRef.current = { comments: [...comments], totalCount };
      setComments((prev) => prev.filter((c) => c.id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
    },
    [comments, totalCount]
  );

  // ロールバック
  const handleRollback = useCallback(() => {
    if (rollbackRef.current) {
      setComments(rollbackRef.current.comments);
      setTotalCount(rollbackRef.current.totalCount);
      rollbackRef.current = null;
    }
  }, []);

  // もっと読み込む
  const handleLoadMore = useCallback(async () => {
    if (nextCursor) {
      await fetchComments(nextCursor);
    }
  }, [nextCursor, fetchComments]);

  // セッションローディング中
  if (sessionStatus === 'loading') {
    return <CommentSectionSkeleton />;
  }

  return (
    <Card className={className} data-testid="comment-section">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <StickyNote className="h-5 w-5" aria-hidden="true" />
          <span>個人メモ</span>
          <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" />
            自分のみ表示
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 認証チェック */}
        {!isAuthenticated ? (
          <div className="flex flex-col items-center py-6 text-center">
            <LogIn className="h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              ログインしてメモを残しましょう
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/auth/signin">ログイン</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* セクションのアクセシビリティ */}
            <section
              aria-labelledby="comments-heading"
              aria-describedby="comments-description"
            >
              <h2 id="comments-heading" className="sr-only">
                コメント
              </h2>
              <p id="comments-description" className="sr-only">
                この記事へのプライベートメモ一覧
              </p>

              {/* フェッチエラー表示 */}
              {fetchError && (
                <div
                  className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3"
                  role="alert"
                >
                  <p className="text-sm text-destructive">{fetchError}</p>
                </div>
              )}

              {/* コメントフォーム */}
              <CommentForm
                articleId={articleId}
                onSubmit={handleCreate}
                onSuccess={handleCreateSuccess}
              />

              {/* コメント一覧 */}
              <div className="mt-4">
                <CommentList
                  comments={comments}
                  currentUserId={currentUserId}
                  isLoading={isLoading}
                  hasMore={hasMore}
                  totalCount={totalCount}
                  onLoadMore={handleLoadMore}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onUpdateOptimistic={handleUpdateOptimistic}
                  onRemoveOptimistic={handleRemoveOptimistic}
                  onRollback={handleRollback}
                />
              </div>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
