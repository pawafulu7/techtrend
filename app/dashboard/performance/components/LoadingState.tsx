import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

/**
 * ローディング状態コンポーネント
 * データ取得中の表示
 */
export const LoadingState: React.FC = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>

      {/* メトリクスカードのスケルトン */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* グラフのスケルトン */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      <Alert className="bg-red-50 border-red-200">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertTitle className="text-red-800">エラーが発生しました</AlertTitle>
        <AlertDescription className="text-red-700 mt-2">
          <p>{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
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
  description = 'メトリクスデータが取得できませんでした。しばらくしてからもう一度お試しください。'
}) => {
  return (
    <div className="container mx-auto p-6">
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-gray-400" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-gray-600 text-sm">{description}</p>
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
    lg: 'h-5 w-5'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-gray-500`} />
      <span className={`${textSizeClasses[size]} text-gray-600`}>{text}</span>
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
    <div className="flex items-center gap-2 text-sm text-gray-600">
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