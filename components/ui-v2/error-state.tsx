'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button-v2';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** 何が読めなかったかを書く（例: 「急上昇キーワードを読み込めませんでした」） */
  title: string;
  /** 補足の文言。生の error.message は渡さない */
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** compact: カードやチャート枠の中に埋め込む。block: ページの中央に置く */
  size?: 'compact' | 'block';
  className?: string;
  /** 再試行以外の操作（ログインへのリンクなど） */
  children?: ReactNode;
}

/**
 * 取得の失敗を表す表示（issue #701）。空状態（灰色の文言だけ）と見分けられるよう、
 * negative 色のアイコンと再試行ボタンを出す。
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retrying = false,
  size = 'compact',
  className,
  children,
}: ErrorStateProps) {
  const isBlock = size === 'block';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        isBlock ? 'px-4 py-12' : 'px-4 py-6',
        className
      )}
    >
      {/* E2E の規約（e2e/testid-naming.md）: エラー表示は error-message と role="alert"。
          live region は文言だけにし、再試行ボタンの「再試行中…」への変化で読み上げ直させない */}
      <div
        role="alert"
        data-testid="error-message"
        className="flex flex-col items-center"
      >
        {isBlock ? (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-(--tt-color-negative-bg)">
            <AlertTriangle
              className="h-7 w-7 text-(--tt-color-negative)"
              aria-hidden="true"
            />
          </div>
        ) : (
          <AlertTriangle
            className="mb-2 h-5 w-5 text-(--tt-color-negative)"
            aria-hidden="true"
          />
        )}
        <p
          className={cn(
            'text-(--tt-color-text)',
            isBlock ? 'mb-2 text-base font-medium' : 'text-sm font-medium'
          )}
        >
          {title}
        </p>
        {description && (
          <p
            className={cn(
              'max-w-md text-(--tt-color-text-muted)',
              isBlock ? 'text-sm' : 'mt-1 text-xs'
            )}
          >
            {description}
          </p>
        )}
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size={isBlock ? 'default' : 'sm'}
          onClick={onRetry}
          disabled={retrying}
          className={cn(isBlock ? 'mt-6 min-h-[44px]' : 'mt-3')}
        >
          <RefreshCw
            className={cn(
              'motion-safe:transition-transform',
              retrying && 'motion-safe:animate-spin'
            )}
            aria-hidden="true"
          />
          {retrying ? '再試行中…' : '再試行'}
        </Button>
      )}
      {children}
    </div>
  );
}
