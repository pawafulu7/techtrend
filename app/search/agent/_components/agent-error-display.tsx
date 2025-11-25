'use client';

import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { useRouter } from 'next/navigation';
import type { AgentSearchError } from '@/lib/hooks/useAgentSearch';

interface AgentErrorDisplayProps {
  error: AgentSearchError;
  onRetry?: () => void;
}

export function AgentErrorDisplay({ error, onRetry }: AgentErrorDisplayProps) {
  const router = useRouter();

  const getErrorMessage = () => {
    switch (error.status) {
      case 401:
        return {
          title: '認証が必要です',
          message: 'AI検索を使用するにはログインが必要です。',
          action: (
            <Button onClick={() => router.push('/auth/login?callbackUrl=/search/agent')}>
              <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
              ログイン
            </Button>
          ),
        };
      case 429:
        return {
          title: 'レート制限に達しました',
          message: error.retryAfter
            ? `${error.retryAfter}秒後に再試行できます。`
            : '少し時間を置いてから再試行してください。',
          action: onRetry && (
            <Button onClick={onRetry} disabled={!!error.retryAfter}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              再試行
            </Button>
          ),
        };
      case 400:
        return {
          title: '不正なリクエスト',
          message: '検索クエリを確認して再試行してください。',
          action: null,
        };
      case 500:
        return {
          title: 'サーバーエラー',
          message: 'サーバーで問題が発生しました。しばらくしてから再試行してください。',
          action: onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              再試行
            </Button>
          ),
        };
      case 408:
        return {
          title: 'タイムアウト',
          message: 'リクエストがタイムアウトしました。ネットワーク接続を確認してください。',
          action: onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              再試行
            </Button>
          ),
        };
      case 0:
        return {
          title: 'ネットワークエラー',
          message: 'ネットワーク接続を確認してください。',
          action: onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              再試行
            </Button>
          ),
        };
      default:
        return {
          title: 'エラーが発生しました',
          message: error.message || '不明なエラーが発生しました。',
          action: onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              再試行
            </Button>
          ),
        };
    }
  };

  const { title, message, action } = getErrorMessage();

  return (
    <CardV2
      variant="ghost"
      className="py-6 md:py-8 border-2 border-[var(--tt-color-negative)]"
      role="alert"
      aria-live="assertive"
      data-testid="agent-error-display"
    >
      <div className="mx-auto max-w-xl flex flex-col items-center text-center gap-3">
        <AlertTriangle
          className="h-8 w-8 text-destructive"
          aria-hidden="true"
        />
        <h3 className="text-xl md:text-2xl font-semibold text-destructive">
          {title}
        </h3>
        <p className="text-sm text-destructive/80">
          {message}
        </p>
        {action && (
          <div className="mt-2">
            {action}
          </div>
        )}
      </div>
    </CardV2>
  );
}
