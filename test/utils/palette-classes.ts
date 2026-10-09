// Tailwind のパレット色を直書きしたクラス（bg-blue-100、border-l-green-500 など）と、
// 任意値の色（bg-[#55C500]、[background:#55C500]）・インライン style の色を探す。
// 一覧の彩色はトークン（ブランド色・状態色）だけにする方針（issue #702）を、テストで確かめるために使う
const PALETTES =
  'slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PALETTE_CLASS = new RegExp(
  `^[a-z-]+-(?:${PALETTES})-(?:50|[1-9]00|950)(?:/(?:\\d+|\\[[^\\]]+\\]))?$`
);
// v4 のパレット変数を直接参照するもの（bg-(--color-blue-500)）
const PALETTE_VARIABLE = new RegExp(
  `^[a-z-]+-\\((?:color:)?--color-(?:${PALETTES})-(?:50|[1-9]00|950)\\)`
);
const COLOR_VALUE =
  '(?:#|rgba?\\(|hsla?\\(|hwb\\(|(?:ok)?lab\\(|(?:ok)?lch\\(|color-mix\\(|color\\()';
// bg-[#55C500]、bg-[color:#55C500]
const ARBITRARY_COLOR = new RegExp(`^[a-z-]+-\\[(?:color:)?${COLOR_VALUE}`);
// [background:#55C500]、[border-left-color:rgb(...)]
const COLOR_PROPERTY =
  /^(?:color|background(?:-color)?|border(?:-[a-z]+)*-color|fill|stroke|outline-color)$/;
const ARBITRARY_PROPERTY = /^\[([a-z-]+):(.+)\]$/;

// 先頭の variant（hover:、[@media(hover:hover)]: など）と重要度の ! を外す。
// 角括弧・丸括弧の中のコロンは variant の区切りではない
function utilityOf(cls: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i];
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (ch === ':' && depth === 0) start = i + 1;
  }
  return cls.slice(start).replace(/^!/, '').replace(/!$/, '');
}

function isColorUtility(utility: string): boolean {
  if (
    PALETTE_CLASS.test(utility) ||
    PALETTE_VARIABLE.test(utility) ||
    ARBITRARY_COLOR.test(utility)
  )
    return true;
  const property = ARBITRARY_PROPERTY.exec(utility);
  return !!property && COLOR_PROPERTY.test(property[1]);
}

function inlineColorDeclarations(style: string): string[] {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const [property, ...rest] = declaration.split(':');
      const value = rest.join(':').trim();
      return (
        !!value &&
        COLOR_PROPERTY.test(property.trim()) &&
        value !== 'transparent'
      );
    });
}

export function findPaletteColorClasses(root: Element): string[] {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  return elements.flatMap((el) => {
    const classes = (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((cls) => cls && isColorUtility(utilityOf(cls)));
    const styles = inlineColorDeclarations(el.getAttribute('style') ?? '').map(
      (declaration) => `style="${declaration}"`
    );
    return [...classes, ...styles];
  });
}
