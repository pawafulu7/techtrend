'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="from-background to-muted/20 flex min-h-[60vh] flex-col items-center justify-center bg-gradient-to-b px-4">
      <div className="max-w-md text-center">
        <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <AlertTriangle
            className="text-muted-foreground h-8 w-8"
            aria-hidden="true"
          />
        </div>
        <h2 className="text-foreground mb-2 text-2xl font-semibold">
          エラーが発生しました
        </h2>
        <div
          data-testid="error-message"
          role="alert"
          aria-live="assertive"
          className="text-muted-foreground mb-6"
        >
          申し訳ございません。予期しないエラーが発生しました。再度お試しください。
        </div>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="bg-foreground text-background hover:bg-foreground/90 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            再試行
          </button>
          <Link
            href="/"
            className="border-border text-foreground hover:bg-muted inline-flex min-h-[44px] items-center justify-center rounded-lg border px-6 py-3 font-medium transition-colors"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
