import { cn } from '@/lib/utils';
import { formatDateWithTime } from '@/lib/utils/date';

/** 本文の字数から読む時間（分）を出す。1 分 500 字で、1 分未満は 1 分にする */
export function readingMinutes(contentLength: number): number {
  return Math.max(1, Math.ceil(contentLength / 500));
}

function dateCellClass(belowReadouts: boolean): string | undefined {
  return belowReadouts ? 'border-t border-(--tt-color-border) pt-4' : undefined;
}

interface ObservationDataProps {
  /** 本文の字数。本文が無い記事（0）は読む時間と字数を出さない */
  contentLength: number;
  publishedAt: Date | string;
  createdAt: Date | string;
  className?: string;
}

/**
 * 記事詳細の右の列の「観測データ」。読む時間・字数・公開と収集の時刻を数値の読み出しで並べる。
 * 右の列が本文の横に来る lg 以上だけで使う（lg 未満は右の列が本文の下へ回るので、読む時間と字数は見出しの近くに出す）
 */
export function ObservationData({
  contentLength,
  publishedAt,
  createdAt,
  className,
}: ObservationDataProps) {
  return (
    <section
      aria-labelledby="observation-data-heading"
      className={cn(
        'rounded-lg border border-(--tt-color-border) bg-(--tt-color-surface) p-5',
        className
      )}
      data-testid="observation-data"
    >
      <h2 id="observation-data-heading" className="text-h3">
        観測データ
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        {contentLength > 0 && (
          <>
            <div>
              <dt className="text-xs text-(--tt-color-text-muted)">読む時間</dt>
              <dd className="mt-1 flex items-baseline gap-0.5">
                <span className="readout text-[28px]">
                  {readingMinutes(contentLength)}
                </span>
                <span className="text-xs text-(--tt-color-text-muted)">分</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-(--tt-color-text-muted)">字数</dt>
              <dd className="mt-1 flex items-baseline gap-0.5">
                <span className="readout text-[28px]">
                  {contentLength.toLocaleString('ja-JP')}
                </span>
                <span className="text-xs text-(--tt-color-text-muted)">字</span>
              </dd>
            </div>
          </>
        )}
        {/* dl の子の div は dt・dd を直接持つ形にする（入れ子の div は HTML の内容モデルに反する）ので、
            時刻の 2 つの区切りの線はそれぞれに引く */}
        <div className={dateCellClass(contentLength > 0)}>
          <dt className="text-xs text-(--tt-color-text-muted)">公開</dt>
          <dd className="mt-1 text-sm tabular-nums">
            {formatDateWithTime(publishedAt)}
          </dd>
        </div>
        <div className={dateCellClass(contentLength > 0)}>
          <dt className="text-xs text-(--tt-color-text-muted)">収集</dt>
          <dd className="mt-1 text-sm tabular-nums">
            {formatDateWithTime(createdAt)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
