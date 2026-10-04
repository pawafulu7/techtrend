import { cn } from '@/lib/utils';

// 年は省く（鮮度の確認には月日と時刻で足りる）。サーバー描画とクライアントで同じ文字列に
// なるよう、タイムゾーンを固定する
const FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function toValidDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface DataFreshnessProps {
  /** 集計した時刻、または画面が取得した時刻。無い・不正なときは何も出さない */
  at: string | number | Date | null | undefined;
  /** 集計の対象期間（例: 直近7日）。指定すると「〜の記事を…に集計」と出す */
  period?: string;
  /** 集計時刻か、画面の取得時刻か */
  kind?: 'aggregated' | 'fetched';
  className?: string;
}

/**
 * データの鮮度（集計期間と集計時刻、または画面の取得時刻）を控えめに表示する（issue #707）。
 * 新着が無いのか、データが止まっているのかを画面から見分けられるようにするため。
 */
export function DataFreshness({
  at,
  period,
  kind = 'aggregated',
  className,
}: DataFreshnessProps) {
  if (at === null || at === undefined) return null;
  const date = toValidDate(at);
  if (!date) return null;

  const time = (
    <time dateTime={date.toISOString()}>{FORMATTER.format(date)}</time>
  );

  return (
    <p
      className={cn('text-muted-foreground text-xs', className)}
      data-testid="data-freshness"
    >
      {kind === 'fetched' ? (
        <>{time} に取得</>
      ) : period ? (
        <>
          {period}の記事を {time} に集計
        </>
      ) : (
        <>{time} に集計</>
      )}
    </p>
  );
}
