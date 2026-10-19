/**
 * 「いま伸びている話題」の伸び（成長率）の段。トレンド概要の折れ線と成長率の色（熱 1〜4 の疑似カラー）に使う。
 * 熱の色はデータの強さを表すときだけに使い、ボタンや飾りには使わない。色だけで伝えないよう、
 * 成長率の文字（「+300%」）を必ず添える。
 *
 * 区切り（200・300・500%）は、本番のデータ（2026-10-19 に開発 DB へ同期したもの）で、直近 14 日の
 * 各時点の上位 6 件（84 個）の分布を見て決めた。熱 1〜4 は 1・20・35・28 個に分かれる。
 * 計画の仮の値（100・200・300%）では 0・1・20・63 個と熱 4 に偏った。前の 6 日の1日平均が 1 件未満の
 * タグは分母が 1.0 になるので、成長率は直近の件数で決まる（3 件で 200%、4 件で 300%、6 件で 500%）。
 * 急上昇の判定は成長率 50% 超なので、熱 1 の下限は 51%。
 */
export type HeatLevel = 1 | 2 | 3 | 4;

/** 各段の下限の成長率（%）。熱 1 は急上昇の判定（50% 超）そのもの */
export const HEAT_LEVEL_MIN_GROWTH: Record<HeatLevel, number> = {
  1: 51,
  2: 200,
  3: 300,
  4: 500,
};

export function heatLevel(growthRate: number): HeatLevel {
  if (growthRate >= HEAT_LEVEL_MIN_GROWTH[4]) return 4;
  if (growthRate >= HEAT_LEVEL_MIN_GROWTH[3]) return 3;
  if (growthRate >= HEAT_LEVEL_MIN_GROWTH[2]) return 2;
  return 1;
}

/** 段の色（CSS 変数。lib/design-tokens の heat1〜heat4） */
export function heatColorVar(level: HeatLevel): string {
  return `var(--tt-color-heat${level})`;
}
