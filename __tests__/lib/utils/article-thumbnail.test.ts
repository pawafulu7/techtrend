import { hasValidThumbnail } from '@/lib/utils/article/thumbnail';
import { isSlideSource } from '@/lib/utils/source/slide-source';

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
