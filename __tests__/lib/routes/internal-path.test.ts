import { toInternalPath } from '@/lib/routes/internal-path';

describe('toInternalPath', () => {
  it.each([
    ['/favorites', '/favorites'],
    ['/search?q=C%2B%2B#top', '/search?q=C%2B%2B#top'],
    // 記事ページの `from` は `/` で始まらない相対パスも受け取る
    ['digest', '/digest'],
  ])('resolves %j to the internal path %j', (raw, expected) => {
    expect(toInternalPath(raw)).toBe(expected);
  });

  it.each([
    ['https://evil.example/'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['/\t/evil.example'],
    ['/.//evil.example'],
    ['/a/..//evil.example'],
    ['/%2e//evil.example'],
    ['/./\\evil.example'],
  ])('rejects %j, which a browser resolves to another site', (raw) => {
    expect(toInternalPath(raw)).toBeNull();
  });
});
