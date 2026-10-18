import { cn } from '@/lib/utils';

/**
 * ナビの項目が今のページを指しているか
 *
 * `/` は完全一致だけ。ほかは、そのパスか、その下のパス（`/trends` に対する `/trends/daily`）なら選ばれている。
 * `exact` を付けると完全一致だけにする（トレンドのサブナビの「概要」のように、下のパスに別の項目があるとき）。
 * 前方一致を文字列の startsWith でそのまま比べると `/tags` が `/tagsx` にも当たるので、`/` で区切って比べる。
 */
export function isNavActive(
  pathname: string,
  href: string,
  { exact = false }: { exact?: boolean } = {}
): boolean {
  if (href === '/' || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * ナビの項目の aria-current
 *
 * 今のページそのものには 'page'、その下のページを開いているときの親の項目には 'true' を返す。
 * 親にも 'page' を付けると、`/trends/daily` で「トレンド」と「デイリー」の2つが今のページだと読み上げられる。
 */
export function navAriaCurrent(
  pathname: string,
  href: string,
  options: { exact?: boolean } = {}
): 'page' | 'true' | undefined {
  if (pathname === href) return 'page';
  return isNavActive(pathname, href, options) ? 'true' : undefined;
}

/**
 * 文字のタブ（ヘッダーのナビと「その他」のメニューの入口）の見た目
 *
 * 塗りの pill は使わず、選ばれている項目だけ文字を濃くし、下に 2px の藍の線を引く。
 * ARIA の tab の役割は付けない（中身は別ページへのリンクで、aria-current で伝える）。
 * 線は親の下の線（border-b）に重ねるので、親の高さいっぱいに伸ばして使う。
 */
export function navTabClass(active: boolean, className?: string): string {
  return cn(
    'relative inline-flex shrink-0 items-center gap-1.5 px-3 text-sm whitespace-nowrap transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none focus-visible:ring-inset',
    'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-150',
    active
      ? 'font-semibold text-(--tt-color-text) after:bg-(--tt-color-primary)'
      : 'font-medium text-(--tt-color-text-muted) after:bg-transparent hover:text-(--tt-color-text)',
    className
  );
}
