// Tailwind のパレット色を直書きしたクラス（bg-blue-100、border-l-green-500 など）と、
// 任意値の色（bg-[#55C500]）・インライン style の色を探す。
// 一覧の彩色はトークン（ブランド色・状態色）だけにする方針（issue #702）を、テストで確かめるために使う
const PALETTES =
  'slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
// 先頭の variant（hover: など）と重要度の ! を除いたうえで判定する
const PALETTE_CLASS = new RegExp(
  `^[a-z-]+-(?:${PALETTES})-(?:50|[1-9]00|950)(?:/(?:\\d+|\\[[^\\]]+\\]))?$`
);
const ARBITRARY_COLOR = /^[a-z-]+-\[(?:#|rgba?\(|hsla?\(|oklch\()/;
const INLINE_COLOR =
  /(?:^|;)\s*(?:color|background(?:-color)?|border(?:-[a-z]+)?-color)\s*:\s*(?!transparent\b)/;

function utilityOf(cls: string): string {
  const withoutVariants = cls.slice(cls.lastIndexOf(':') + 1);
  return withoutVariants.replace(/^!/, '').replace(/!$/, '');
}

export function findPaletteColorClasses(root: Element): string[] {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  return elements.flatMap((el) => {
    const classes = (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((cls) => {
        const utility = utilityOf(cls);
        return PALETTE_CLASS.test(utility) || ARBITRARY_COLOR.test(utility);
      });
    const style = el.getAttribute('style') ?? '';
    return INLINE_COLOR.test(style)
      ? [...classes, `style="${style}"`]
      : classes;
  });
}
