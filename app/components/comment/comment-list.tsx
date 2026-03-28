'use client';

/**
 * CommentList Component
 *
 * Task 4.3: CommentList コンポーネント実装
 * - コメント一覧表示（新着順）
 * - 0件時のプレースホルダー
 * - 「もっと見る」ボタンによるページネーション
 * - aria-live でコメント数変更を通知
 */

import { Button } from '@/components/ui-v2/button-v2';
import { Loader2, StickyNote } from 'lucide-react';
import { CommentItem } from './comment-item';
import { CommentListSkeleton } from './comment-skeletons';
import type { CommentResponse, UpdateCommentInput } from './types';

interface CommentListProps {
  comments: CommentResponse[];
  currentUserId: string;
  isLoading: boolean;
  hasMore: boolean;
  totalCount: number;
  onLoadMore: () => Promise<void>;
  onUpdate: (id: string, input: UpdateCommentInput) => Promise<CommentResponse>;
  onDelete: (id: string) => Promise<void>;
}

export function CommentList({
  comments,
  currentUserId,
  isLoading,
  hasMore,
  totalCount,
  onLoadMore,
  onUpdate,
  onDelete,
}: CommentListProps) {
  // ローディング中（初回）
  if (isLoading && comments.length === 0) {
    return <CommentListSkeleton count={3} />;
  }

  // 0件
  if (comments.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-center"
        role="status"
        aria-label="コメントなし"
      >
        <StickyNote className="text-muted-foreground/50 mb-3 h-10 w-10" />
        <p className="text-muted-foreground text-sm">まだメモはありません</p>
        <p className="text-muted-foreground mt-1 text-xs">
          この記事についてメモを残してみましょう
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* コメント数の読み上げ通知 */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {totalCount}件のメモ
      </div>

      {/* コメント一覧 */}
      <div className="space-y-3">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            isOwner={comment.userId === currentUserId}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* もっと見る */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                読み込み中
              </>
            ) : (
              'もっと見る'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
