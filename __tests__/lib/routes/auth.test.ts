import { loginWithCallback, sanitizeCallbackUrl } from '@/lib/routes/auth';

describe('sanitizeCallbackUrl', () => {
  it.each([
    ['/favorites', '/favorites'],
    ['/search?q=react#top', '/search?q=react#top'],
    ['/articles/abc', '/articles/abc'],
  ])('keeps the internal path %s', (raw, expected) => {
    expect(sanitizeCallbackUrl(raw)).toBe(expected);
  });

  it.each([
    [undefined],
    [''],
    ['https://evil.example/'],
    ['//evil.example'],
    // ブラウザは `\` を `/` と読み、タブや改行を取り除くので、どれも外部のサイトに解決される
    ['/\\evil.example'],
    ['/\\/evil.example'],
    ['/\t/evil.example'],
    ['/\n/evil.example'],
    // ドットセグメントを除くと `//evil.example` になる
    ['/.//evil.example'],
    ['/a/..//evil.example'],
    ['/%2e//evil.example'],
    ['/auth/login'],
    ['/auth/verify?success=true'],
  ])('falls back to / for %j', (raw) => {
    expect(sanitizeCallbackUrl(raw)).toBe('/');
  });
});

describe('loginWithCallback', () => {
  it('does not carry an external callback URL to the login page', () => {
    expect(loginWithCallback('/\\evil.example')).toBe(
      '/auth/login?callbackUrl=%2F'
    );
    expect(loginWithCallback('/favorites')).toBe(
      '/auth/login?callbackUrl=%2Ffavorites'
    );
  });
});
