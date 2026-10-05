/**
 * @jest-environment node
 */
import {
  assignStories,
  groupStoryPairs,
  isJapaneseTitle,
  pickStoryRepresentative,
  type StoryCandidate,
} from '@/lib/services/story-clustering';

const candidate = (
  id: string,
  title: string,
  qualityScore = 50,
  publishedAt = '2026-09-28T00:00:00Z'
): StoryCandidate => ({
  id,
  title,
  qualityScore,
  publishedAt: new Date(publishedAt),
});

describe('isJapaneseTitle', () => {
  it('かな・漢字を含むタイトルを日本語とみなす', () => {
    expect(isJapaneseTitle('Anthropic、Sonnet 5.5を発表')).toBe(true);
    expect(isJapaneseTitle('漢字のみ')).toBe(true);
    expect(isJapaneseTitle('Introducing Claude Sonnet 5.5')).toBe(false);
  });
});

describe('pickStoryRepresentative', () => {
  it('日本語の記事を、品質スコアの高い英語の記事より優先する', () => {
    const rep = pickStoryRepresentative([
      candidate('en', 'Sonnet 5.5 launches', 90),
      candidate('ja', 'Sonnet 5.5を発表', 40),
    ]);
    expect(rep.id).toBe('ja');
  });

  it('同じ言語なら品質スコアの高い記事、同点なら公開の早い記事を選ぶ', () => {
    expect(
      pickStoryRepresentative([
        candidate('a', '発表A', 40),
        candidate('b', '発表B', 70),
      ]).id
    ).toBe('b');
    expect(
      pickStoryRepresentative([
        candidate('late', '発表', 50, '2026-09-29T00:00:00Z'),
        candidate('early', '発表', 50, '2026-09-28T00:00:00Z'),
      ]).id
    ).toBe('early');
  });
});

describe('groupStoryPairs', () => {
  it('つながった組を1つのグループにまとめる（a-b, b-c は a,b,c）', () => {
    const groups = groupStoryPairs([
      { a: 'a', b: 'b' },
      { a: 'b', b: 'c' },
      { a: 'x', b: 'y' },
    ]);
    expect(groups.map((g) => [...g].sort())).toEqual(
      expect.arrayContaining([
        ['a', 'b', 'c'],
        ['x', 'y'],
      ])
    );
    expect(groups).toHaveLength(2);
  });

  it('組が無ければグループも無い', () => {
    expect(groupStoryPairs([])).toEqual([]);
  });
});

describe('assignStories', () => {
  function createDb(options: {
    candidates: Array<StoryCandidate & { storyId: string | null }>;
    pairs: Array<{ a: string; b: string }>;
  }) {
    const executeRaw = jest.fn().mockResolvedValue(0);
    const db = {
      article: {
        findMany: jest.fn().mockResolvedValue(options.candidates),
      },
      $queryRaw: jest.fn().mockResolvedValue(options.pairs),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
        fn({ $executeRaw: executeRaw })
      ),
    };
    return { db, executeRaw };
  }

  // $executeRaw のタグ付きテンプレートの値（storyId と ID の配列）を取り出す
  const updateCalls = (executeRaw: jest.Mock) =>
    executeRaw.mock.calls
      .filter(([strings]) => String(strings.join('?')).includes('ANY('))
      .map(([, storyId, ids]) => ({ storyId, ids }));

  it('組になった記事に代表の ID を書き、まとめから外れた記事の storyId を消す', async () => {
    const { db, executeRaw } = createDb({
      candidates: [
        { ...candidate('en', 'Sonnet 5.5 launches', 90), storyId: null },
        { ...candidate('ja', 'Sonnet 5.5を発表', 40), storyId: null },
        { ...candidate('old', '前のまとめ', 40), storyId: 'gone' },
        { ...candidate('solo', '単独の記事', 40), storyId: null },
      ],
      pairs: [{ a: 'en', b: 'ja' }],
    });

    const result = await assignStories(db as never, {
      now: new Date('2026-09-30T00:00:00Z'),
    });

    expect(result).toMatchObject({
      candidates: 4,
      pairs: 1,
      stories: 1,
      groupedArticles: 2,
      changed: 3,
      dryRun: false,
    });
    expect(updateCalls(executeRaw)).toEqual(
      expect.arrayContaining([
        { storyId: 'ja', ids: expect.arrayContaining(['en', 'ja']) },
        { storyId: null, ids: ['old'] },
      ])
    );
    // 件数を数え直す SQL も流す
    expect(executeRaw).toHaveBeenCalledTimes(3);
  });

  it('既に同じ値なら書き込まない（件数の数え直しだけ流す）', async () => {
    const { db, executeRaw } = createDb({
      candidates: [
        { ...candidate('a', '発表A'), storyId: 'a' },
        { ...candidate('b', '発表B'), storyId: 'a' },
      ],
      pairs: [{ a: 'a', b: 'b' }],
    });

    const result = await assignStories(db as never);

    expect(result.changed).toBe(0);
    expect(updateCalls(executeRaw)).toEqual([]);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('dryRun では書き込まず、まとまるグループを返す', async () => {
    const { db, executeRaw } = createDb({
      candidates: [
        { ...candidate('a', '発表A'), storyId: null },
        { ...candidate('b', '発表B'), storyId: null },
      ],
      pairs: [{ a: 'a', b: 'b' }],
    });

    const result = await assignStories(db as never, { dryRun: true });

    expect(result.changed).toBe(2);
    expect(result.groups).toHaveLength(1);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('直近7日の記事を対象にする', async () => {
    const { db } = createDb({ candidates: [], pairs: [] });

    await assignStories(db as never, {
      now: new Date('2026-09-30T00:00:00Z'),
    });

    expect(db.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publishedAt: { gte: new Date('2026-09-23T00:00:00Z') } },
      })
    );
  });
});
