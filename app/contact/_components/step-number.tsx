interface StepNumberProps {
  step: number;
}

/**
 * 上から順に埋めればよいことを示す番号。読み上げは項目の名前だけで足りるので隠す
 */
export function StepNumber({ step }: StepNumberProps) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--tt-color-primary-bg) text-xs font-semibold text-(--tt-color-primary) tabular-nums"
    >
      {step}
    </span>
  );
}
