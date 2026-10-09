// 色を直書きしたクラスとインライン style を探す。一覧の彩色はトークン（ブランド色・状態色）だけに
// する方針（issue #702）を、テストで確かめるために使う。検出の範囲は __tests__/utils/palette-classes.test.tsx。
// （Tailwind はこのファイルのクラス名らしい文字列からも本番の CSS を作るので、ここには例を書かない）
//
// 検出するもの:
// - Tailwind のパレット色クラス（色名-濃さ、黒・白。variant・! ・不透明度付きも）
// - 任意値・変数参照・任意プロパティ・インライン style のうち、値のどこかに色リテラル
//   （#hex、rgb() などの色関数、CSS の名前色、パレット変数 --color-*）を含むもの
// 許可するもの: トークン（var(--tt-*) と --tt-* の変数参照）、currentColor、transparent、url()
const PALETTES =
  'slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const SHADES = '(?:50|[1-9]00|950)';
// 不透明度の接尾辞（/50、/[0.3]、/(--alpha)）
const OPACITY = '(?:/(?:\\d+|\\[[^\\]]+\\]|\\([^)]+\\)))?';

// font-black（font-weight）は色ではないので除く
const PALETTE_CLASS = new RegExp(
  `^(?!font-)[a-z-]+-(?:(?:${PALETTES})-${SHADES}|black|white)${OPACITY}$`
);
// bg-[...]、bg-(...)（任意値・変数参照）。中身は containsColorLiteral で判定する
const VALUE_CLASS = new RegExp(`^[a-z-]+-(?:\\[(.+)\\]|\\((.+)\\))${OPACITY}$`);
// [background:...]（任意プロパティ）
const ARBITRARY_PROPERTY = /^\[[a-z-]+:(.+)\]$/;

// CSS の名前色（transparent・currentColor は色を直書きしないので含めない）
const NAMED_COLORS =
  'aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen';
const COLOR_LITERALS = [
  /#[0-9a-f]{3,8}(?![0-9a-z])/i,
  // 色関数。中身がトークンだけ（rgb(var(--tt-x))）なら、トークンを除いた後に数字が続かないので外れる
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[-\d.]/i,
  /\bcolor\(\s*[a-z0-9-]+\s+[-\d.]/i,
  new RegExp(`--color-(?:(?:${PALETTES})-${SHADES}|black|white)(?![\\w-])`),
  new RegExp(`(?<![\\w-])(?:${NAMED_COLORS})(?![\\w-])`, 'i'),
];

/** 値のどこかに色リテラルがあるか。トークン・url()・引用符の中身は見ない */
function containsColorLiteral(value: string): boolean {
  const v = value
    .replace(/_/g, ' ') // Tailwind の任意値では _ が空白
    .replace(/var\(--tt-[a-z0-9-]+\)/gi, '')
    .replace(/--tt-[a-z0-9-]+/gi, '')
    .replace(/url\([^)]*\)/gi, '')
    .replace(/'[^']*'|"[^"]*"/g, '');
  return COLOR_LITERALS.some((pattern) => pattern.test(v));
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

export function isColorClass(cls: string): boolean {
  const utility = utilityOf(cls);
  if (PALETTE_CLASS.test(utility)) return true;
  const property = ARBITRARY_PROPERTY.exec(utility);
  if (property) return containsColorLiteral(property[1]);
  const value = VALUE_CLASS.exec(utility);
  return !!value && containsColorLiteral(value[1] ?? value[2]);
}

function inlineColorDeclarations(style: string): string[] {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const [, ...rest] = declaration.split(':');
      return rest.length > 0 && containsColorLiteral(rest.join(':'));
    });
}

export function findPaletteColorClasses(root: Element): string[] {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  return elements.flatMap((el) => {
    const classes = (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((cls) => cls && isColorClass(cls));
    const styles = inlineColorDeclarations(el.getAttribute('style') ?? '').map(
      (declaration) => `style="${declaration}"`
    );
    return [...classes, ...styles];
  });
}
