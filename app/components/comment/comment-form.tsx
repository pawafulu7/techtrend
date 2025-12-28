'use client';

/**
 * CommentForm Component
 *
 * Task 4.2: CommentForm コンポーネント実装
 * - コメント入力テキストエリア（1000文字制限）
 * - 文字数カウンター表示（900文字超で警告色）
 * - プライベートコメント表示（Lock アイコン）
 * - 送信ボタンと 400ms 以内のUIフィードバック
 */

import { useState, useCallback, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommentResponse, CreateCommentInput } from './types';

const MAX_LENGTH = 1000;
const WARNING_THRESHOLD = 900;

interface CommentFormProps {
  articleId: string;
  onSubmit: (input: CreateCommentInput) => Promise<CommentResponse>;
  onSuccess?: (comment: CommentResponse) => void;
  className?: string;
}

export function CommentForm({
  articleId,
  onSubmit,
  onSuccess,
  className,
}: CommentFormProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = content.length;
  const isOverLimit = charCount > MAX_LENGTH;
  const isWarning = charCount > WARNING_THRESHOLD && charCount <= MAX_LENGTH;
  const isEmpty = content.trim().length === 0;
  const canSubmit = !isEmpty && !isOverLimit && !isSubmitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const comment = await onSubmit({
        articleId,
        content: content.trim(),
        visibility: 'PRIVATE',
      });

      // 成功: フォームをクリア
      setContent('');
      onSuccess?.(comment);

      // フォーカスをテキストエリアに戻す
      textareaRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'コメントの投稿に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  }, [articleId, content, canSubmit, onSubmit, onSuccess]);

  // Ctrl+Enter で送信
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [canSubmit, handleSubmit]
  );

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="この記事についてメモを残す..."
          className={cn(
            'min-h-[100px] resize-none',
            isOverLimit && 'border-destructive focus-visible:ring-destructive'
          )}
          disabled={isSubmitting}
          aria-label="コメント入力"
          aria-describedby="comment-char-count comment-privacy-notice"
          aria-invalid={isOverLimit}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* 文字数カウンター */}
          <span
            id="comment-char-count"
            className={cn(
              'text-sm tabular-nums',
              isOverLimit
                ? 'text-destructive font-medium'
                : isWarning
                  ? 'text-amber-600 dark:text-amber-500'
                  : 'text-muted-foreground'
            )}
          >
            {charCount} / {MAX_LENGTH}
          </span>

          {/* プライベート表示 */}
          <span
            id="comment-privacy-notice"
            className="flex items-center gap-1 text-sm text-muted-foreground"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>自分のみ閲覧可</span>
          </span>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="sm"
          className="min-w-[80px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              投稿中
            </>
          ) : (
            '投稿'
          )}
        </Button>
      </div>

      {/* キーボードショートカットヒント */}
      <p className="text-xs text-muted-foreground">
        Ctrl+Enter で送信
      </p>
    </div>
  );
}
