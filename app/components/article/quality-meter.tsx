import { cn } from '@/lib/utils';

/** 目盛りの段の数。品質（0〜100）を 25 点ごとに区切る */
const SEGMENTS = 4;

/** 塗る段の数（0〜4）。25 点ごとに 1 段（75 点なら 3 段）。表示する点数と同じく四捨五入した点で決める */
export function qualityMeterLevel(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(SEGMENTS, Math.floor(Math.round(score) / 25)));
}

/**
 * 記事の品質の目盛り（4 段）と点数。段は飾りで、読み上げは「品質 75」の文字で伝える
 */
export function QualityMeter({
  score,
  label = true,
  className,
}: {
  score: number;
  /** 「品質」の語を見せる（狭いメタの行では数字だけにし、語は読み上げにだけ残す） */
  label?: boolean;
  className?: string;
}) {
  const level = qualityMeterLevel(score);
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1.5', className)}
      data-testid="quality-meter"
      data-level={level}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-1.5 rounded-[1px]',
              i < level
                ? 'bg-(--tt-color-primary)'
                : 'bg-(--tt-color-border-hover)'
            )}
          />
        ))}
      </span>
      <span className="text-(--tt-color-text-muted)">
        <span className={label ? undefined : 'sr-only'}>品質 </span>
        <span className="tabular-nums">{Math.round(score)}</span>
      </span>
    </span>
  );
}
