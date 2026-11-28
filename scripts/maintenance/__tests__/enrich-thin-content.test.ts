import { isThinContentCandidate, parseArgs, thinContentWhere } from '../enrich-thin-content';

function makeArticle(overrides: {
  url?: string;
  content?: string | null;
  thumbnail?: string | null;
  sourceName?: string;
}) {
  return {
    url: overrides.url ?? 'https://example.com/articles/1',
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

    it('はてなブックマーク経由で集めた Speaker Deck も、サムネイルがあっても対象に含める', () => {
      const article = makeArticle({
        url: 'https://speakerdeck.com/someone/some-talk',
        content: 'x'.repeat(200),
        thumbnail: 'https://files.speakerdeck.com/presentations/abc/slide_0.jpg',
        sourceName: 'はてなブックマーク',
      });
      expect(isThinContentCandidate(article)).toBe(true);
    });

    it('Speaker Deck 以外のスライド（Docswell）は、サムネイルがあれば処理済みとみなし除外する', () => {
      const article = makeArticle({
        url: 'https://www.docswell.com/s/someone/ABC123-talk',
        content: 'x'.repeat(200),
        thumbnail: 'https://bcdn.docswell.com/page/ABC123.jpg',
        sourceName: 'Docswell',
      });
      expect(isThinContentCandidate(article)).toBe(false);
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

describe('thinContentWhere', () => {
  const lengthCondition = {
    OR: [{ contentLength: null }, { contentLength: { lt: 500 } }],
  };

  it('指定が無ければ、本文の長さだけで絞る', () => {
    expect(thinContentWhere({})).toEqual({ AND: [lengthCondition] });
  });

  it('ソースと Speaker Deck の指定を、本文の長さの条件に AND で足す（Speaker Deck はソース名か URL で見る）', () => {
    expect(thinContentWhere({ source: 'はてなブックマーク', speakerDeck: true })).toEqual({
      AND: [
        lengthCondition,
        { source: { name: 'はてなブックマーク' } },
        {
          OR: [
            { source: { name: 'Speaker Deck' } },
            { url: { startsWith: 'https://speakerdeck.com/' } },
            { url: { startsWith: 'https://www.speakerdeck.com/' } },
            { url: { startsWith: 'http://speakerdeck.com/' } },
            { url: { startsWith: 'http://www.speakerdeck.com/' } },
          ],
        },
      ],
    });
  });
});

describe('parseArgs', () => {
  it('本番で使う組み合わせを読む', () => {
    expect(
      parseArgs(['--speakerdeck', '--skip-summary', '--limit=400', '--skip=12', '--dry-run'])
    ).toEqual({
      dryRun: true,
      skipSummary: true,
      speakerDeck: true,
      limit: 400,
      skip: 12,
    });
    expect(parseArgs(['--source=企業技術ブログ'])).toEqual({
      dryRun: false,
      skipSummary: false,
      speakerDeck: false,
      source: '企業技術ブログ',
    });
  });

  // 打ち間違えたまま書き込みありで全件を処理しないよう、何もせずに失敗させる
  it.each([
    ['--dryrun'],
    ['--slides'],
    ['--limit=abc'],
    ['--limit=0'],
    ['--limit=1.5'],
    ['--limit='],
    ['--skip=-1'],
    ['--source='],
  ])('読めない引数 %s は失敗にする', (arg) => {
    expect(() => parseArgs([arg])).toThrow();
  });
});
