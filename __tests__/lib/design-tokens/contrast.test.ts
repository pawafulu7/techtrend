/**
 * デザイントークンの色の組み合わせが WCAG AA（文字 4.5:1）を満たすことを計算で確かめる
 *
 * 対象（Issue #698）:
 * - 塗り（primary・状態色・順位色）と、その上に載せる on* の文字色
 * - ブランド色・状態色を文字色として、背景・カード・沈んだ面・ホバー面に置いた場合
 * - 淡い塗り（*Bg、半透明）をカード・背景・沈んだ面・ホバー面に重ね、その上に同じ色の文字を置いた場合（バッジ）
 * - 本文・補助文字を、背景・カード・沈んだ面・ホバー面（shadcn の muted）に置いた場合
 * - 順位色を、背景・カード・沈んだ面に置いた場合
 * - チャートの系列色の塗りに、readableTextColor で選んだ文字を載せた場合（円グラフの割合ラベル）
 */

import {
  chartColors,
  chartLabelTextColors,
  colors,
  darkColors,
  lightColors,
  type ColorModeTokens,
} from '@/lib/design-tokens';
import {
  AA_TEXT_CONTRAST as AA_TEXT,
  composite,
  contrastRatio,
  parseColor,
  readableTextColor,
} from '@/lib/utils/design-tokens/contrast';

type ColorKey = keyof ColorModeTokens;

/** fg を bg（半透明なら under に重ねたもの）の上に置いたときのコントラスト比 */
function ratio(
  c: ColorModeTokens,
  fg: ColorKey,
  bg: ColorKey,
  under: ColorKey = 'surface'
): number {
  const base = parseColor(c[under]).rgb;
  const bgRgb = composite(c[bg], base);
  return contrastRatio(composite(c[fg], bgRgb), bgRgb);
}

const FILLS: Array<[fg: ColorKey, bg: ColorKey]> = [
  ['onPrimary', 'primary'],
  ['onPrimary', 'primaryHover'],
  ['onPositive', 'positive'],
  ['onWarning', 'warning'],
  ['onNegative', 'negative'],
  ['onInfo', 'info'],
  ['onRank', 'rankGold'],
  ['onRank', 'rankSilver'],
  ['onRank', 'rankBronze'],
];

const ACCENTS = [
  'primary',
  'positive',
  'warning',
  'negative',
  'info',
] as const satisfies readonly ColorKey[];

const TINTS: Array<[fg: ColorKey, bg: ColorKey]> = [
  ['primary', 'primaryBg'],
  ['positive', 'positiveBg'],
  ['warning', 'warningBg'],
  ['negative', 'negativeBg'],
  ['info', 'infoBg'],
];

const SURFACES = [
  'background',
  'surface',
  'surfaceMuted',
] as const satisfies readonly ColorKey[];

const NEUTRAL_TEXTS = [
  'text',
  'textMuted',
] as const satisfies readonly ColorKey[];

const RANK_TEXTS = [
  'rankGold',
  'rankSilver',
  'rankBronze',
] as const satisfies readonly ColorKey[];

describe.each([
  ['light', colors.light],
  ['dark', colors.dark],
] as const)('%s mode', (_mode, c) => {
  it.each(FILLS)('%s on %s', (fg, bg) => {
    expect(ratio(c, fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(
    ACCENTS.flatMap((fg) =>
      [...SURFACES, 'surfaceHover' as const].map((bg) => [fg, bg] as const)
    )
  )('%s text on %s', (fg, bg) => {
    expect(ratio(c, fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(
    TINTS.flatMap(([fg, bg]) =>
      [...SURFACES, 'surfaceHover' as const].map(
        (under) => [fg, bg, under] as const
      )
    )
  )('%s text on %s over %s', (fg, bg, under) => {
    expect(ratio(c, fg, bg, under)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(
    NEUTRAL_TEXTS.flatMap((fg) =>
      [...SURFACES, 'surfaceHover' as const].map((bg) => [fg, bg] as const)
    )
  )('%s text on %s', (fg, bg) => {
    expect(ratio(c, fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(RANK_TEXTS.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const)))(
    '%s text on %s',
    (fg, bg) => {
      expect(ratio(c, fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  );
});

describe.each([
  ['light', chartColors.light],
  ['dark', chartColors.dark],
] as const)('chart colors (%s mode)', (_mode, list) => {
  it('6桁の hex で書かれている（実行時に readableTextColor で解釈するため）', () => {
    for (const fill of list) expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each([...list])('ラベル文字を選ぶと %s の上で AA を満たす', (fill) => {
    const text = readableTextColor(fill, chartLabelTextColors);
    expect(
      contrastRatio(parseColor(text).rgb, parseColor(fill).rgb)
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('contrast helper', () => {
  it('白と黒は 21:1、同じ色は 1:1 になる', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrastRatio([21, 116, 57], [21, 116, 57])).toBeCloseTo(1, 5);
  });

  it('白文字 × #16A34A（変更前の primary）は AA に届かないと判定する', () => {
    const c = { ...colors.light, primary: '#16A34A' };
    expect(ratio(c, 'onPrimary', 'primary')).toBeLessThan(AA_TEXT);
  });

  it('readableTextColor は明るい塗りに暗い文字、暗い塗りに白を選ぶ', () => {
    expect(readableTextColor('#FBBF24', chartLabelTextColors)).toBe(
      darkColors.onPrimary
    );
    expect(readableTextColor('#1D4ED8', chartLabelTextColors)).toBe(
      lightColors.onPrimary
    );
  });

  it('readableTextColor は解釈できない色では先頭の候補を返す', () => {
    expect(readableTextColor('oklch(0.5 0.1 150)', chartLabelTextColors)).toBe(
      chartLabelTextColors[0]
    );
  });

  it('チャートの系列色はライトとダークで同じ数ある', () => {
    expect(chartColors.dark).toHaveLength(chartColors.light.length);
  });

  it('半透明の塗りは下地に重ねてから計算する', () => {
    expect(composite('rgba(0, 0, 0, 0.5)', [255, 255, 255])).toEqual([
      127.5, 127.5, 127.5,
    ]);
  });
});
