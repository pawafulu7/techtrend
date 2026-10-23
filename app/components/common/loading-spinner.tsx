import { cn } from '@/lib/utils';
import { SITE_NAME } from '@/lib/constants';
import { LiveStatus } from '@/components/ui-v2/live-status';
import { ObservatoryMark } from '@/components/icons/observatory-mark';

interface LoadingSpinnerProps {
  message?: string;
  fullPage?: boolean;
}

export function LoadingSpinner({
  message = '読み込み中...',
  fullPage = true,
}: LoadingSpinnerProps) {
  return (
    <div
      data-testid="loading-spinner"
      className={cn(
        'flex flex-col items-center justify-center gap-6',
        fullPage ? 'h-full min-h-[400px]' : 'py-12'
      )}
    >
      {/* Brand mark: ヘッダーのロゴと同じ印と書体にする */}
      <div className="flex items-center gap-2" aria-hidden="true">
        <ObservatoryMark className="h-[22px] w-[22px] shrink-0" />
        <span className="font-heading text-foreground text-lg font-bold tracking-[-0.01em] [font-stretch:88%]">
          {SITE_NAME}
        </span>
      </div>

      {/* Progress bar with shimmer */}
      <div
        className="bg-primary/15 relative h-[3px] w-[280px] overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <div className="animate-shimmer via-primary/30 absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent to-transparent motion-reduce:animate-none" />
      </div>

      {/* Context message */}
      {/* 読み上げは LiveStatus が受け持つ（領域を先に描いてから文言を入れる）。
          ロゴと進捗バーは飾りなので読み上げから外す */}
      <LiveStatus message={message} className="text-muted-foreground text-sm">
        {message}
      </LiveStatus>
    </div>
  );
}
