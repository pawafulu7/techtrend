import { hasValidThumbnail } from '@/lib/utils/article/thumbnail';
import { isSlideArticle, isSlideSource } from '@/lib/utils/source/slide-source';

describe('hasValidThumbnail', () => {
  it.each([
    ['https://example.com/a.png', true],
    ['http://example.com/a.png', true],
    ['/relative/a.png', false],
    ['javascript:alert(1)', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%p -> %p', (thumbnail, expected) => {
    expect(hasValidThumbnail(thumbnail)).toBe(expected);
  });
});

describe('isSlideSource', () => {
  it.each([
    ['Speaker Deck', true],
    ['Docswell', true],
    ['Qiita', false],
    ['speaker deck', false],
    [null, false],
    [undefined, false],
  ])('%p -> %p', (sourceName, expected) => {
    expect(isSlideSource(sourceName)).toBe(expected);
  });
});

describe('isSlideArticle', () => {
  it.each([
    [{ sourceName: 'Docswell', url: 'https://example.com/x' }, true],
    [
      { sourceName: 'はてなブックマーク', url: 'https://speakerdeck.com/a/b' },
      true,
    ],
    [
      { sourceName: 'はてなブックマーク', url: 'https://www.docswell.com/s/a' },
      true,
    ],
    [{ sourceName: 'はてなブックマーク', url: 'https://example.com/a' }, false],
    [{ sourceName: 'Qiita', url: 'https://notspeakerdeck.com/a' }, false],
    [{ sourceName: null, url: 'not a url' }, false],
    [{}, false],
  ])('%j -> %p', (article, expected) => {
    expect(isSlideArticle(article)).toBe(expected);
  });
});
