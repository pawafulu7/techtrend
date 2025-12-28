'use client';

/**
 * CommentItem Component
 *
 * Task 4.3, 4.4: CommentItem と編集・削除UI実装
 * - ユーザー名、投稿日時、本文を表示
 * - 自分のコメントに編集・削除ボタン表示
 * - インライン編集モード
 * - 削除確認ダイアログ
 * - 楽観的UI更新
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Trash2, X, Check, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { CommentResponse, UpdateCommentInput } from './types';

const MAX_LENGTH = 1000;
const WARNING_THRESHOLD = 900;

interface CommentItemProps {
  comment: CommentResponse;
  isOwner: boolean;
  onUpdate: (id: string, input: UpdateCommentInput) => Promise<CommentResponse>;
  onDelete: (id: string) => Promise<void>;
  onUpdateOptimistic?: (id: string, comment: Partial<CommentResponse>) => void;
  onRemoveOptimistic?: (id: string) => void;
  onRollback?: () => void;
}

export function CommentItem({
  comment,
  isOwner,
  onUpdate,
  onDelete,
  onUpdateOptimistic,
  onRemoveOptimistic,
  onRollback,
}: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = editContent.length;
  const isOverLimit = charCount > MAX_LENGTH;
  const isWarning = charCount > WARNING_THRESHOLD && charCount <= MAX_LENGTH;
  const isEmpty = editContent.trim().length === 0;
  const hasChanges = editContent.trim() !== comment.content;
  const canSave = !isEmpty && !isOverLimit && hasChanges && !isUpdating;

  // 編集モード開始時にフォーカス
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditContent(comment.content);
    setIsEditing(true);
    setError(null);
  }, [comment.content]);

  const handleCancelEdit = useCallback(() => {
    setEditContent(comment.content);
    setIsEditing(false);
    setError(null);
  }, [comment.content]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    const trimmedContent = editContent.trim();
    setIsUpdating(true);
    setError(null);

    // 楽観的更新
    onUpdateOptimistic?.(comment.id, { content: trimmedContent });

    try {
      await onUpdate(comment.id, { content: trimmedContent });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
      onRollback?.();
    } finally {
      setIsUpdating(false);
    }
  }, [comment.id, editContent, canSave, onUpdate, onUpdateOptimistic, onRollback]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setError(null);

    // 楽観的削除
    onRemoveOptimistic?.(comment.id);

    try {
      await onDelete(comment.id);
      setShowDeleteConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
      onRollback?.();
      setIsDeleting(false);
    }
  }, [comment.id, onDelete, onRemoveOptimistic, onRollback]);

  // Esc で編集キャンセル
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEdit();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSave) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleCancelEdit, handleSave, canSave]
  );

  const formattedDate = formatDistanceToNow(new Date(comment.createdAt), {
    addSuffix: true,
    locale: ja,
  });

  return (
    <article
      className={cn(
        'p-3 rounded-lg bg-muted/50 space-y-2',
        isDeleting && 'opacity-50 pointer-events-none'
      )}
      aria-label={`コメント（${formattedDate}）`}
    >
      {/* ヘッダー: 日時とアクションボタン */}
      <div className="flex items-center justify-between">
        <time
          dateTime={comment.createdAt}
          className="text-xs text-muted-foreground"
        >
          {formattedDate}
        </time>

        {isOwner && !isEditing && !showDeleteConfirm && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleStartEdit}
              aria-label="編集"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="削除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* 本文または編集フォーム */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              'min-h-[80px] resize-none text-sm',
              isOverLimit && 'border-destructive focus-visible:ring-destructive'
            )}
            disabled={isUpdating}
            aria-label="コメント編集"
            aria-invalid={isOverLimit}
          />

          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-xs tabular-nums',
                isOverLimit
                  ? 'text-destructive font-medium'
                  : isWarning
                    ? 'text-amber-600 dark:text-amber-500'
                    : 'text-muted-foreground'
              )}
            >
              {charCount} / {MAX_LENGTH}
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
                disabled={isUpdating}
                className="h-7"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                キャンセル
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!canSave}
                className="h-7"
              >
                {isUpdating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                保存
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
      )}

      {/* 削除確認 */}
      {showDeleteConfirm && (
        <div className="border border-destructive/50 bg-destructive/10 p-3 rounded-md space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm">このコメントを削除しますか？</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="h-7"
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="h-7"
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : null}
              削除
            </Button>
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
