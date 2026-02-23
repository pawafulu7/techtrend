import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="from-background to-muted/20 flex min-h-[60vh] flex-col items-center justify-center bg-gradient-to-b px-4">
      <div className="max-w-md text-center">
        <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <FileQuestion
            className="text-muted-foreground h-8 w-8"
            aria-hidden="true"
          />
        </div>
        <h1 className="text-foreground mb-2 text-4xl font-bold">404</h1>
        <h2 className="text-foreground mb-4 text-2xl font-semibold">
          ページが見つかりません
        </h2>
        <p className="text-muted-foreground mx-auto mb-8 max-w-md">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <Link
          href="/"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex min-h-[44px] items-center justify-center rounded-lg px-6 py-3 font-medium transition-colors"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
