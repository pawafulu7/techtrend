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

import { useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const isAuthenticated = sessionStatus === 'authenticated' && !!session?.user;
  const currentUserId = session?.user?.id || '';

  const queryKey = useMemo(
    () => ['comments', { articleId }] as const,
    [articleId]
  );

  // コメント一覧をuseInfiniteQueryで取得
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error: queryError,
  } = useInfiniteQuery<PaginatedCommentsResponse>({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        articleId,
        limit: String(DEFAULT_LIMIT),
      });
      if (pageParam) {
        params.set('cursor', pageParam as string);
      }
      const response = await fetch(`/api/comments?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to fetch comments');
      }
      return response.json() as Promise<PaginatedCommentsResponse>;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    enabled: isAuthenticated,
  });

  // 全ページのコメントをフラットに展開
  const comments = data?.pages.flatMap((page) => page.comments) ?? [];
  const totalCount = data?.pages[data.pages.length - 1]?.totalCount ?? 0;
  const fetchError = queryError instanceof Error ? queryError.message : null;

  // コメント作成 mutation
  const createMutation = useMutation<
    CommentResponse,
    Error,
    CreateCommentInput
  >({
    mutationFn: async (input) => {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'コメントの投稿に失敗しました');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // コメント更新 mutation
  const updateMutation = useMutation<
    CommentResponse,
    Error,
    { id: string; input: UpdateCommentInput }
  >({
    mutationFn: async ({ id, input }) => {
      const response = await fetch(`/api/comments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to update comment');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // コメント削除 mutation
  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/comments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete comment');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // コメント作成ハンドラ（CommentFormのonSubmitシグネチャに合わせてPromise<CommentResponse>を返す）
  const handleCreate = useCallback(
    async (input: CreateCommentInput): Promise<CommentResponse> => {
      return createMutation.mutateAsync(input);
    },
    [createMutation]
  );

  // コメント更新ハンドラ
  const handleUpdate = useCallback(
    async (id: string, input: UpdateCommentInput): Promise<CommentResponse> => {
      return updateMutation.mutateAsync({ id, input });
    },
    [updateMutation]
  );

  // コメント削除ハンドラ
  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      return deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  // 楽観的更新: コメント更新
  const handleUpdateOptimistic = useCallback(
    (id: string, partial: Partial<CommentResponse>) => {
      queryClient.setQueryData(queryKey, (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            comments: page.comments.map((c) =>
              c.id === id ? { ...c, ...partial } : c
            ),
          })),
        };
      });
    },
    [queryClient, queryKey]
  );

  // 楽観的更新: コメント削除
  const handleRemoveOptimistic = useCallback(
    (id: string) => {
      queryClient.setQueryData(queryKey, (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            comments: page.comments.filter((c) => c.id !== id),
            totalCount: Math.max(0, page.totalCount - 1),
          })),
        };
      });
    },
    [queryClient, queryKey]
  );

  // ロールバック
  const handleRollback = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // もっと読み込む
  const handleLoadMore = useCallback(async () => {
    if (hasNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage]);

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
          <span className="text-muted-foreground flex items-center gap-1 text-sm font-normal">
            <Lock className="h-3 w-3" aria-hidden="true" />
            自分のみ表示
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 認証チェック */}
        {!isAuthenticated ? (
          <div className="flex flex-col items-center py-6 text-center">
            <LogIn className="text-muted-foreground/50 mb-3 h-8 w-8" />
            <p className="text-muted-foreground mb-3 text-sm">
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
                  className="bg-destructive/10 border-destructive/20 mb-4 rounded-md border p-3"
                  role="alert"
                >
                  <p className="text-destructive text-sm">{fetchError}</p>
                </div>
              )}

              {/* コメントフォーム */}
              <CommentForm articleId={articleId} onSubmit={handleCreate} />

              {/* コメント一覧 */}
              <div className="mt-4">
                <CommentList
                  comments={comments}
                  currentUserId={currentUserId}
                  isLoading={isLoading || isFetchingNextPage}
                  hasMore={!!hasNextPage}
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
