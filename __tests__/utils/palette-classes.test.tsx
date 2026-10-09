import {
  findPaletteColorClasses,
  isColorClass,
} from '@/test/utils/palette-classes';

// カードのテストは「検出結果が空」で合格するので、ヘルパーが色を見逃すとテストが素通りする。
// 検出できること・トークンを誤検出しないことを、ここで固定する
describe('isColorClass', () => {
  it.each([
    'bg-blue-100',
    'border-l-green-500',
    'hover:bg-amber-200',
    'hover:shadow-blue-200',
    'dark:text-sky-400/80',
    'text-mauve-500',
    '!bg-blue-100',
    'bg-blue-100!',
    'bg-blue-500/[0.3]',
    'bg-blue-500/(--alpha)',
    'sm:[@media(hover:hover)]:bg-rose-50',
    'bg-black',
    'text-white/80',
    'bg-[#55C500]',
    'bg-[#55C500]/50',
    'hover:bg-[#55C500]/50',
    'bg-[color:#55C500]',
    'text-[rgb(1,2,3)]',
    'text-[oklch(0.7_0.1_200)]',
    'bg-[lab(50%_40_20)]',
    'bg-[color-mix(in_oklab,red,blue)]',
    'bg-[red]',
    'bg-[rebeccapurple]',
    'bg-[linear-gradient(red,blue)]',
    'shadow-[0_0_0_1px_#ff0000]',
    'bg-(--color-blue-500)',
    'bg-(--color-blue-500)/50',
    'bg-(--color-white)',
    'bg-[var(--color-blue-500)]',
    'bg-[var(--color-white)]',
    '[background:#55C500]',
    '[color:rebeccapurple]',
    '[background:linear-gradient(red,blue)]',
    'hover:[color:#fff]',
    '[border-left-color:rgb(1,2,3)]',
  ])('detects %s', (cls) => {
    expect(isColorClass(cls)).toBe(true);
  });

  it.each([
    'bg-(--tt-color-primary)',
    'bg-(--tt-color-surface)/85',
    'sm:[@media(hover:hover)]:bg-(--tt-color-surface)/85',
    'text-(--tt-color-text-muted)',
    'bg-[var(--tt-color-primary)]',
    '[color:var(--tt-color-primary)]',
    'bg-[color-mix(in_oklab,var(--tt-color-primary)_10%,transparent)]',
    'bg-tt-primary-bg',
    'text-tt-primary',
    'border-tt-primary-border',
    'text-muted-foreground',
    'bg-background/30',
    'border-l-4',
    'font-black',
    'text-h3',
    'max-w-48',
    'h-48',
    'aspect-video',
    'line-clamp-2',
    'w-[120px]',
    'grid-cols-[1fr_2fr]',
    'bg-[url(/images/red.png)]',
    '[background:url(x.png)]',
    "after:content-['']",
    "content-['red']",
    '[@media(hover:hover)]:opacity-0',
    'sm:[@media(hover:hover)]:pointer-events-none',
    '[&>*:first-child]:flex-1',
    'focus-within:ring-(--tt-color-primary)',
  ])('allows %s', (cls) => {
    expect(isColorClass(cls)).toBe(false);
  });
});

describe('findPaletteColorClasses', () => {
  const build = (html: string) => {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
  };

  it('finds colors on nested elements and in inline styles', () => {
    const root = build(
      '<div><span class="flex bg-blue-100"></span>' +
        '<p style="position: absolute; color: hotpink"></p>' +
        '<i style="box-shadow: 0 0 0 1px #f00"></i></div>'
    );

    expect(findPaletteColorClasses(root)).toEqual([
      'bg-blue-100',
      'style="color: hotpink"',
      'style="box-shadow: 0 0 0 1px #f00"',
    ]);
  });

  it('allows tokens and the transparent color that next/image sets', () => {
    const root = build(
      '<span class="bg-(--tt-color-primary) text-muted-foreground"></span>' +
        '<img style="position:absolute;height:100%;color:transparent">' +
        '<b style="color: var(--tt-color-primary); background: url(x.png)"></b>' +
        '<u style="color: currentColor"></u>'
    );

    expect(findPaletteColorClasses(root)).toEqual([]);
  });
});
