import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui-v2/card-v2';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

/**
 * ローディング状態コンポーネント
 * データ取得中の表示
 */
export const LoadingState: React.FC = () => {
  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>

      {/* メトリクスカードのスケルトン */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="mb-2 h-8 w-32" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* グラフのスケルトン */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

/**
 * エラー状態コンポーネント
 * エラー発生時の表示
 */
export const ErrorState: React.FC<{
  error: string;
  onRetry?: () => void;
}> = ({ error, onRetry }) => {
  return (
    <div className="container mx-auto p-6">
      <Alert className="border-[var(--tt-color-negative-border)] bg-[var(--tt-color-negative-bg)]">
        <AlertCircle className="h-4 w-4 text-[var(--tt-color-negative)]" />
        <AlertTitle className="text-[var(--tt-color-negative)]">
          エラーが発生しました
        </AlertTitle>
        <AlertDescription className="mt-2 text-[var(--tt-color-negative)]">
          <p>{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-[var(--tt-color-negative)] px-3 py-1.5 text-white transition-opacity hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" />
              再試行
            </button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
};

/**
 * 空状態コンポーネント
 * データがない場合の表示
 */
export const EmptyState: React.FC<{
  title?: string;
  description?: string;
}> = ({
  title = 'データがありません',
  description = 'メトリクスデータが取得できませんでした。しばらくしてからもう一度お試しください。',
}) => {
  return (
    <div className="container mx-auto p-6">
      <Card className="mx-auto max-w-2xl">
        <CardContent className="py-12 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tt-color-surface-muted)]">
              <AlertCircle className="h-6 w-6 text-[var(--tt-color-text-muted)]" />
            </div>
          </div>
          <h3 className="mb-2 text-lg font-semibold">{title}</h3>
          <p className="text-sm text-[var(--tt-color-text-muted)]">
            {description}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * インラインローディングインジケーター
 * 小さな読み込み表示
 */
export const InlineLoader: React.FC<{
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ text = '読み込み中...', size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Loader2
        className={`${sizeClasses[size]} animate-spin text-[var(--tt-color-text-muted)]`}
      />
      <span
        className={`${textSizeClasses[size]} text-[var(--tt-color-text-muted)]`}
      >
        {text}
      </span>
    </div>
  );
};

/**
 * データ更新インジケーター
 * データ更新中の表示
 */
export const UpdateIndicator: React.FC<{
  isUpdating: boolean;
  lastUpdated?: string;
}> = ({ isUpdating, lastUpdated }) => {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--tt-color-text-muted)]">
      {isUpdating ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>更新中...</span>
        </>
      ) : (
        <>
          <span>最終更新:</span>
          <span className="font-mono">{lastUpdated || 'N/A'}</span>
        </>
      )}
    </div>
  );
};

export default LoadingState;
