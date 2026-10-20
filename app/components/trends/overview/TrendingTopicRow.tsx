import Link from 'next/link';
import { getTagDisplayName } from '@/lib/constants/tag-labels';
import type { TrendingKeywordWithSeries } from '@/lib/services/trending-series';
import { cn } from '@/lib/utils';
import { Sparkline } from '../sparkline';
import { heatColorVar, heatLevel } from '../trend-heat';

/** 話題を押した先。ホームの一覧をそのタグで絞り込む */
export function trendingTopicHref(name: string): string {
  return `/?tags=${encodeURIComponent(name)}`;
}

export function formatGrowthRate(growthRate: number): string {
  return `${growthRate > 0 ? '+' : ''}${growthRate}%`;
}

/**
 * 比べている前の 6 日（7 日前〜24 時間前）の1日平均。成長率の分母は 1.0 に切り上げるが、
 * ここは切り上げる前の値を出す。「前週」とは書かない（比べているのは 6 日）
 */
export function formatPreviousAverage(weeklyAverage: number): string {
  return weeklyAverage === 0
    ? '前の6日は0件'
    : `前の6日は1日平均${weeklyAverage}件`;
}

/** 7 区間の件数を読み上げる文（図は読み上げから隠す） */
export function seriesDescription(series: readonly number[]): string {
  return `24時間ごとの件数（7日前から直近まで）: ${series.join('、')}`;
}

interface TrendingTopicRowProps {
  topic: TrendingKeywordWithSeries;
  /** 順位（1 から） */
  rank: number;
  /** 折れ線を描き始めるのを遅らせる順番（列の上から 0, 1, 2…。40ms ずつずらす） */
  revealIndex?: number;
  /** 折れ線を左から右へ一度だけ描く */
  animate?: boolean;
  className?: string;
}

/**
 * トレンド概要の「いま伸びている話題」の順位表の1行。順位・話題名・直近 24 時間の件数（大きく）・
 * 7 区間の折れ線と、成長率（熱の段の色）と前の 6 日の1日平均（小さく）。
 * 熱の色は色だけで伝えないよう、成長率の文字を必ず添える。
 * hooks も server-only も使わないので、サーバーとクライアントのどちらでも描ける
 */
export function TrendingTopicRow({
  topic,
  rank,
  revealIndex = rank - 1,
  animate = false,
  className,
}: TrendingTopicRowProps) {
  const color = heatColorVar(heatLevel(topic.growthRate));
  return (
    <li
      className={cn(
        'group relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto_5rem] items-center gap-x-3 border-b border-(--tt-color-border) py-2.5 pr-2 transition-colors duration-150',
        'hover:bg-(--tt-color-surface-hover)',
        // リンクの擬似要素が行全体を覆うので、フォーカスの輪は行に出す
        'focus-within:ring-2 focus-within:ring-(--tt-color-primary) focus-within:ring-inset',
        className
      )}
      data-testid="trending-topic"
    >
      {/* 順位は並びそのものなので、読み上げは ol の順番に任せる */}
      <span
        className="readout row-span-2 self-start pt-0.5 text-right text-lg text-(--tt-color-text-muted)"
        aria-hidden="true"
      >
        {rank}
      </span>
      <Link
        href={trendingTopicHref(topic.name)}
        // 押せることが分かるよう、話題名はリンクの色にし、行のホバーで下線を引く
        className="truncate text-[15px] leading-5 font-semibold text-(--tt-color-primary) underline-offset-2 group-hover:underline after:absolute after:inset-0 after:content-[''] focus:outline-none"
      >
        {getTagDisplayName(topic.name)}
      </Link>
      <p className="row-span-2 flex items-baseline gap-0.5 self-center">
        <span className="readout text-foreground text-[26px]">
          {topic.recentCount}
        </span>
        <span className="text-xs text-(--tt-color-text-muted)">件</span>
      </p>
      <Sparkline
        values={topic.series}
        color={color}
        index={revealIndex}
        animate={animate}
        className="row-span-2 h-8 w-20 self-center"
      />
      <p className="col-start-2 flex min-w-0 flex-wrap gap-x-1.5 text-xs leading-4">
        <span className="font-semibold tabular-nums" style={{ color }}>
          {formatGrowthRate(topic.growthRate)}
        </span>
        <span className="text-(--tt-color-text-muted)">
          {formatPreviousAverage(topic.weeklyAverage)}
        </span>
      </p>
      <span className="sr-only">{seriesDescription(topic.series)}</span>
    </li>
  );
}
