'use client';

import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
              <LogIn className="h-4 w-4 mr-2" />
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
              <RefreshCw className="h-4 w-4 mr-2" />
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
              <RefreshCw className="h-4 w-4 mr-2" />
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
              <RefreshCw className="h-4 w-4 mr-2" />
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
              <RefreshCw className="h-4 w-4 mr-2" />
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
              <RefreshCw className="h-4 w-4 mr-2" />
              再試行
            </Button>
          ),
        };
    }
  };

  const { title, message, action } = getErrorMessage();

  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-destructive mb-2">{title}</h3>
          <p className="text-sm text-destructive/80 mb-4">{message}</p>
          {error.details && (
            <details className="text-xs text-muted-foreground mb-4">
              <summary className="cursor-pointer">詳細を表示</summary>
              <pre className="mt-2 p-2 bg-muted rounded overflow-auto">
                {JSON.stringify(error.details, null, 2)}
              </pre>
            </details>
          )}
          {action && <div>{action}</div>}
        </div>
      </div>
    </div>
  );
}
