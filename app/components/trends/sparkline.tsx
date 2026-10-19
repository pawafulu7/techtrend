import { cn } from '@/lib/utils';

interface SparklineProps {
  /** 件数の並び（古い順）。2 点以上 */
  values: readonly number[];
  /** 線の色（CSS の色。熱の段の変数など） */
  color: string;
  /** 描き始めを遅らせる順番（一覧の上から 0, 1, 2…。40ms ずつずらす） */
  index?: number;
  /** 左から右へ一度だけ描く（画面を開いたときに一度だけ） */
  animate?: boolean;
  className?: string;
}

// 座標系。幅は親に合わせて伸ばす（preserveAspectRatio="none"）ので、線の太さは
// vector-effect で画面上の太さに固定する
const WIDTH = 100;
const HEIGHT = 32;
const PAD_Y = 3;

/**
 * 件数の推移の小さな折れ線（SVG、JS 不要）。読み上げでは件数を別の文字で伝えるので、図は隠す。
 * 開いたときに左から右へ一度だけ描く動きは `.sparkline-reveal`（globals.css）で、
 * `prefers-reduced-motion: no-preference` のときだけ付く。何も付かない状態が描き終わった形
 */
export function Sparkline({
  values,
  color,
  index = 0,
  animate = false,
  className,
}: SparklineProps) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = WIDTH / (values.length - 1);
  const points = values.map((value, i) => {
    const x = i * step;
    const y = HEIGHT - PAD_Y - (value / max) * (HEIGHT - PAD_Y * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(' L')}`;
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn(
        'block overflow-visible',
        animate && 'sparkline-reveal',
        className
      )}
      style={{ ['--sparkline-index' as string]: index }}
      data-testid="sparkline"
    >
      <path d={area} fill={color} fillOpacity={0.12} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
