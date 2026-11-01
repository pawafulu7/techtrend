/**
 * WCAG 2.x のコントラスト比の計算
 *
 * デザイントークンの組み合わせの検査（__tests__/lib/design-tokens/contrast.test.ts）と、
 * 塗りの色が実行時に決まる箇所（チャートのラベルなど）の文字色選びに使う。
 */

export type RGB = [number, number, number];

/** WCAG AA の通常の文字に必要なコントラスト比 */
export const AA_TEXT_CONTRAST = 4.5;

/** `#RRGGBB` または `rgb()` / `rgba()` を RGB（0〜255）と不透明度に分解する */
export function parseColor(value: string): { rgb: RGB; alpha: number } {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = value.trim().match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(',').map((p) => parseFloat(p));
    return { rgb: [r, g, b], alpha: a };
  }
  throw new Error(`unsupported color: ${value}`);
}

/** 半透明の色を不透明な下地に重ねた結果 */
export function composite(value: string, base: RGB): RGB {
  const { rgb, alpha } = parseColor(value);
  return rgb.map((c, i) => c * alpha + base[i] * (1 - alpha)) as RGB;
}

export function relativeLuminance([r, g, b]: RGB): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  );
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 不透明な塗り background の上で、candidates のうち最もコントラストが高い文字色を返す
 *
 * 描画中に呼ぶため、解釈できない色（#fff や oklch() など）では例外にせず先頭の候補を返す。
 */
export function readableTextColor(
  background: string,
  candidates: readonly [string, ...string[]]
): string {
  try {
    const bg = parseColor(background).rgb;
    return candidates.reduce((best, c) =>
      contrastRatio(parseColor(c).rgb, bg) >
      contrastRatio(parseColor(best).rgb, bg)
        ? c
        : best
    );
  } catch {
    return candidates[0];
  }
}
