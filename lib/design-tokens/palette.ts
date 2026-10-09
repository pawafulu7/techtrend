/**
 * 色の元になるパレット（Tailwind の同名パレットと同じ値）
 *
 * ニュートラルは slate の1系統だけを使う（ライト・ダークとも）。
 * ブランド色は緑1色。橙などの第2のアクセント色は置かない。
 */
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
