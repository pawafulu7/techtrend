// Tailwind のパレット色を直書きしたクラス（bg-blue-100、border-l-green-500 など）と、
// 任意値の色（bg-[#55C500]、[background:#55C500]）・インライン style の色を探す。
// トークン（var(--tt-*)）や currentColor など、色を直書きしない値は許可する。
// 一覧の彩色はトークン（ブランド色・状態色）だけにする方針（issue #702）を、テストで確かめるために使う
const PALETTES =
  'slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const SHADES = '(?:50|[1-9]00|950)';
// bg-blue-100、text-sky-400/80、bg-blue-500/[0.3]
const PALETTE_CLASS = new RegExp(
  `^[a-z-]+-(?:${PALETTES})-${SHADES}(?:/(?:\\d+|\\[[^\\]]+\\]))?$`
);
// bg-black、text-white/80
const BLACK_WHITE_CLASS = /^[a-z-]+-(?:black|white)(?:\/(?:\d+|\[[^\]]+\]))?$/;
// v4 のパレット変数を直接参照するもの（bg-(--color-blue-500)）
const PALETTE_VARIABLE_CLASS = new RegExp(
  `^[a-z-]+-\\((?:color:)?--color-(?:${PALETTES})-${SHADES}\\)$`
);
// bg-[#55C500]、bg-[color:red]（任意値。中身は isDirectColor で判定する）
const ARBITRARY_VALUE_CLASS = /^[a-z-]+-\[(?:color:)?(.+)\]$/;
// [background:#55C500]（任意プロパティ）
const ARBITRARY_PROPERTY = /^\[([a-z-]+):(.+)\]$/;
const COLOR_PROPERTY =
  /^(?:color|background(?:-color)?|border(?:-[a-z]+)*-color|fill|stroke|outline-color)$/;

const COLOR_FUNCTION =
  /^(?:#|rgba?\(|hsla?\(|hwb\(|(?:ok)?lab\(|(?:ok)?lch\(|color-mix\(|color\()/i;
const PALETTE_VARIABLE_VALUE = new RegExp(
  `^var\\(--color-(?:${PALETTES})-${SHADES}\\)$`
);
const NAMED_COLOR =
  /^(?:black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|maroon|navy|teal|olive|lime|aqua|fuchsia|cyan|magenta|brown|gold|violet|indigo|coral|salmon|tomato|crimson|khaki|beige|ivory|lavender|turquoise|tan|plum|orchid)$/i;

/** 色を直書きした値か（トークン・currentColor・url() などは false） */
function isDirectColor(value: string): boolean {
  const v = value.trim();
  return (
    COLOR_FUNCTION.test(v) ||
    PALETTE_VARIABLE_VALUE.test(v) ||
    NAMED_COLOR.test(v)
  );
}

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
    BLACK_WHITE_CLASS.test(utility) ||
    PALETTE_VARIABLE_CLASS.test(utility)
  )
    return true;
  const property = ARBITRARY_PROPERTY.exec(utility);
  if (property)
    return COLOR_PROPERTY.test(property[1]) && isDirectColor(property[2]);
  const arbitrary = ARBITRARY_VALUE_CLASS.exec(utility);
  return !!arbitrary && isDirectColor(arbitrary[1]);
}

function inlineColorDeclarations(style: string): string[] {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const [property, ...rest] = declaration.split(':');
      return (
        COLOR_PROPERTY.test(property.trim()) && isDirectColor(rest.join(':'))
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
