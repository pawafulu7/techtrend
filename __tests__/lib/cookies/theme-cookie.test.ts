import type { NextRequest } from 'next/server';
import { getThemeFromCookie } from '@/lib/cookies/theme-cookie';

const requestWithTheme = (value: string | undefined): NextRequest =>
  ({
    cookies: {
      get: (name: string) =>
        name === 'theme' && value !== undefined ? { value } : undefined,
    },
  }) as unknown as NextRequest;

describe('getThemeFromCookie', () => {
  it.each([['light'], ['dark'], ['system']] as const)(
    '%s はそのまま返す',
    (theme) => {
      expect(getThemeFromCookie(requestWithTheme(theme))).toBe(theme);
    }
  );

  // issue #687 のレビューで発見: proxy は値を x-theme ヘッダに入れるので、NUL・改行が
  // あるとヘッダの値として不正になり、全リクエストが 500 になっていた
  it.each([
    ['NUL を含む値', 'a\u0000b'],
    ['改行を含む値', 'a\nb'],
    ['想定外の値', 'bogus'],
    ['空文字', ''],
  ])('%s は system にする', (_label, value) => {
    expect(getThemeFromCookie(requestWithTheme(value))).toBe('system');
  });

  it('Cookie が無ければ system にする', () => {
    expect(getThemeFromCookie(requestWithTheme(undefined))).toBe('system');
  });
});
