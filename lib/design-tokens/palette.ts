/**
 * 色の元になるパレット
 *
 * 画面のニュートラル（地・面・文字・線）は、藍みのある独自の2系統を使う。
 * ink はライト、night はダーク。ブランド色の藍と地の色温度をそろえるため、slate から替えた。
 * ブランド色は藍1色。橙などの第2のアクセント色は置かない。データの強さだけを表す
 * 熱の色（colors.ts の heat1〜heat4）は、帯とトレンドの図の中だけで使う。
 * 例外はロゴの印の中心点だけで、観測している点として熱の一番強い色を置く（components/icons/observatory-mark.tsx）。
 *
 * slate（Tailwind の同名パレットと同じ値）は、状態・カテゴリ・図表のトークンが使う。
 */
export const ink = {
  50: '#F5F7FC',
  100: '#F0F2F8',
  150: '#EBEEF6',
  200: '#D6DBE8',
  300: '#B9C0D4',
  400: '#98A1C2',
  600: '#525B78',
  900: '#111633',
} as const;

export const night = {
  100: '#E3E7F5',
  700: '#333F68',
  800: '#222C4E',
  850: '#18213F',
  900: '#10172F',
  925: '#0C1228',
  950: '#090E22',
} as const;

export const slate = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
  950: '#020617',
} as const;

export const white = '#FFFFFF';

/** `#RRGGBB` を指定の不透明度の rgba() にする（淡い塗り・枠線を基準色から作るため） */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
