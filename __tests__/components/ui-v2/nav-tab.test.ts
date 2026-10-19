/**
 * ナビの選ばれている項目の判定（components/ui-v2/nav-tab.ts）
 *
 * ヘッダーとトレンドのサブナビが同じ判定を使う。`/` は完全一致、ほかは `/` で区切った前方一致。
 */

import {
  isNavActive,
  navAriaCurrent,
  navTabClass,
} from '@/components/ui-v2/nav-tab';

describe('isNavActive', () => {
  it.each([
    ['/', '/', true],
    ['/trends', '/', false],
    ['/trends', '/trends', true],
    ['/trends/daily', '/trends', true],
    ['/trends/daily/2026-10-18', '/trends', true],
    ['/tagsx', '/tags', false],
    ['/tag', '/tags', false],
    ['/reader', '/trends', false],
  ])('%s で %s は %s', (pathname, href, expected) => {
    expect(isNavActive(pathname, href)).toBe(expected);
  });

  it('exact を付けると完全一致だけにする（トレンドのサブナビの「概要」）', () => {
    expect(isNavActive('/trends', '/trends', { exact: true })).toBe(true);
    expect(isNavActive('/trends/daily', '/trends', { exact: true })).toBe(
      false
    );
  });
});

describe('navAriaCurrent', () => {
  it('今のページそのものには page、下のページを開いている親の項目には true を返す', () => {
    expect(navAriaCurrent('/trends', '/trends')).toBe('page');
    expect(navAriaCurrent('/trends/daily', '/trends')).toBe('true');
    expect(navAriaCurrent('/trends/daily', '/trends/daily')).toBe('page');
    expect(navAriaCurrent('/tags', '/trends')).toBeUndefined();
  });

  it('exact の項目は下のページで何も付けない', () => {
    expect(
      navAriaCurrent('/trends/daily', '/trends', { exact: true })
    ).toBeUndefined();
  });
});

describe('navTabClass', () => {
  it('選ばれている項目だけ文字を濃くし、下に藍の線を引く', () => {
    expect(navTabClass(true)).toContain('after:bg-(--tt-color-primary)');
    expect(navTabClass(true)).toContain('font-semibold');
    expect(navTabClass(false)).toContain('after:bg-transparent');
    expect(navTabClass(false)).toContain('text-(--tt-color-text-muted)');
  });

  it('呼び出し側の class を後ろに足し、ぶつかる既定の class は消す', () => {
    expect(navTabClass(false, 'gap-1')).toMatch(/gap-1$/);
    expect(navTabClass(false, 'gap-1')).not.toContain('gap-1.5');
  });
});
