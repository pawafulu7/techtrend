/**
 * TechTrend のロゴの印。観測所の同心円と、中心の熱の点（帯の疑似カラーの一番強い色）
 *
 * 色は CSS 変数から取るので、ライト・ダークで自動で切り替わる。
 */
export function ObservatoryMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="var(--tt-color-primary)"
        strokeWidth="1.6"
        opacity="0.35"
      />
      <circle
        cx="12"
        cy="12"
        r="6"
        stroke="var(--tt-color-primary)"
        strokeWidth="1.6"
        opacity="0.65"
      />
      <circle cx="12" cy="12" r="2.2" fill="var(--tt-color-heat4)" />
    </svg>
  );
}
