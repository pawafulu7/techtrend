import { isThinContentCandidate } from '../enrich-thin-content';

function makeArticle(overrides: {
  content?: string | null;
  thumbnail?: string | null;
  sourceName?: string;
}) {
  return {
    content: overrides.content ?? null,
    thumbnail: overrides.thumbnail ?? null,
    source: { name: overrides.sourceName ?? 'Some Source' },
  };
}

describe('isThinContentCandidate', () => {
  describe('本文が完全に空（Issue #629 項目5）', () => {
    it('content が null かつサムネイルなしの場合は対象に含める', () => {
      const article = makeArticle({ content: null, thumbnail: null });
      expect(isThinContentCandidate(article)).toBe(true);
    });

    it('content が空文字かつサムネイルなしの場合は対象に含める', () => {
      const article = makeArticle({ content: '', thumbnail: null });
      expect(isThinContentCandidate(article)).toBe(true);
    });

    it('content が null でもサムネイルが既にある場合は対象に含める（旧ロジックからの変更点）', () => {
      const article = makeArticle({
        content: null,
        thumbnail: 'https://example.com/thumb.png',
        sourceName: 'Some Source',
      });
      expect(isThinContentCandidate(article)).toBe(true);
    });

    it('content が空文字でもサムネイルが既にある場合は対象に含める（旧ロジックからの変更点）', () => {
      const article = makeArticle({
        content: '',
        thumbnail: 'https://example.com/thumb.png',
        sourceName: 'Some Source',
      });
      expect(isThinContentCandidate(article)).toBe(true);
    });
  });

  describe('本文はあるが薄い（1〜499文字）', () => {
    it('サムネイルがない場合は対象に含める', () => {
      const article = makeArticle({ content: 'x'.repeat(200), thumbnail: null });
      expect(isThinContentCandidate(article)).toBe(true);
    });

    it('サムネイルが既にあり Speaker Deck 以外の場合は処理済みとみなし除外する', () => {
      const article = makeArticle({
        content: 'x'.repeat(200),
        thumbnail: 'https://example.com/thumb.png',
        sourceName: 'Some Source',
      });
      expect(isThinContentCandidate(article)).toBe(false);
    });

    it('サムネイルが既にあっても Speaker Deck の場合は対象に含める（従来の例外を維持）', () => {
      const article = makeArticle({
        content: 'x'.repeat(200),
        thumbnail: 'https://example.com/thumb.png',
        sourceName: 'Speaker Deck',
      });
      expect(isThinContentCandidate(article)).toBe(true);
    });

    it('境界値: 499文字は薄いコンテンツとして扱う', () => {
      const article = makeArticle({ content: 'x'.repeat(499), thumbnail: null });
      expect(isThinContentCandidate(article)).toBe(true);
    });
  });

  describe('本文が十分にある（500文字以上）', () => {
    it('境界値: 500文字は対象外', () => {
      const article = makeArticle({ content: 'x'.repeat(500), thumbnail: null });
      expect(isThinContentCandidate(article)).toBe(false);
    });

    it('サムネイルの有無に関わらず対象外', () => {
      const article = makeArticle({
        content: 'x'.repeat(600),
        thumbnail: 'https://example.com/thumb.png',
        sourceName: 'Some Source',
      });
      expect(isThinContentCandidate(article)).toBe(false);
    });
  });
});
