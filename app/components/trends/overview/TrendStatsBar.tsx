interface TrendStatsBarProps {
  /** null は取得に失敗した値。0 と区別して「—」で表す（issue #701） */
  trendingCount: number | null;
  newTagCount: number | null;
  topTagCount: number | null;
  loading?: boolean;
}

function StatValue({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">取得できませんでした</span>
      </>
    );
  }
  return <>{value}</>;
}

const STATS = [
  { key: 'trendingCount', label: '伸びている話題' },
  { key: 'newTagCount', label: '新着タグ' },
  { key: 'topTagCount', label: '人気タグ' },
] as const;

/**
 * トレンド概要の件数の読み出し。数字（字幅を詰めた等幅数字）を主に、何の数かを下に小さく出す。
 * 3 つを細い縦の線で区切る
 */
export function TrendStatsBar({
  trendingCount,
  newTagCount,
  topTagCount,
  loading = false,
}: TrendStatsBarProps) {
  const values = { trendingCount, newTagCount, topTagCount };

  return (
    <dl
      className="bg-background grid grid-cols-3 divide-x divide-(--tt-color-border) rounded-lg border"
      aria-busy={loading || undefined}
      data-testid="trend-stats-bar"
    >
      {STATS.map(({ key, label }) => (
        <div key={key} className="flex flex-col-reverse gap-1 px-4 py-3">
          <dt className="text-xs text-(--tt-color-text-muted)">{label}</dt>
          <dd className="readout text-foreground text-[28px]">
            {loading ? (
              <span className="block h-7 w-12 animate-pulse rounded-sm bg-(--tt-color-surface-muted)" />
            ) : (
              <StatValue value={values[key]} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
