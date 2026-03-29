/**
 * Comment Skeleton Components
 *
 * Task 4.5: Skeleton とアクセシビリティ対応
 * Labor Illusion 原則に基づくローディング表示
 */

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui-v2/card-v2';

/**
 * CommentSectionSkeleton
 * 認証状態ロード中の表示
 */
export function CommentSectionSkeleton() {
  return (
    <Card className="bg-[var(--tt-color-surface-muted)]" data-testid="comment-section-skeleton">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        {/* Comments list skeleton */}
        <CommentListSkeleton count={2} />
      </CardContent>
    </Card>
  );
}

/**
 * CommentListSkeleton
 * コメント一覧ロード中の表示
 */
export function CommentListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="コメントを読み込み中">
      {Array.from({ length: count }).map((_, i) => (
        <CommentItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * CommentItemSkeleton
 * 単一コメントのスケルトン
 */
export function CommentItemSkeleton() {
  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-6 w-12" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

/**
 * CommentFormSkeleton
 * フォームのスケルトン
 */
export function CommentFormSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-20 w-full" />
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
