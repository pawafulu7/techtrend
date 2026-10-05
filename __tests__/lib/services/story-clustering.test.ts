/**
 * @jest-environment node
 */
import {
  assignStories,
  chooseStoryId,
  groupStoryPairs,
  isJapaneseTitle,
  pickStoryRepresentative,
  type StoryCandidate,
} from '@/lib/services/story-clustering';

const NOW = new Date('2026-09-30T00:00:00Z');
// 期間（7日）の内側と、期間の直前（組の相手にするが書き換えない）
const IN_WINDOW = '2026-09-28T00:00:00Z';
const BEFORE_WINDOW = '2026-09-22T12:00:00Z';

const candidate = (
  id: string,
  title: string,
  qualityScore = 50,
  publishedAt = IN_WINDOW
): StoryCandidate => ({
  id,
  title,
  qualityScore,
  publishedAt: new Date(publishedAt),
});

const row = (
  id: string,
  title: string,
  storyId: string | null,
  options: { qualityScore?: number; publishedAt?: string } = {}
) => ({
  ...candidate(id, title, options.qualityScore, options.publishedAt),
  storyId,
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

describe('chooseStoryId', () => {
  it('期間の外の記事が持つストーリーに合わせる（境界をまたぐストーリーを割らない）', () => {
    expect(
      chooseStoryId(
        [row('b', '発表B', null, { qualityScore: 90 })],
        [row('a', 'Announcement', 'a', { publishedAt: BEFORE_WINDOW })]
      )
    ).toBe('a');
  });

  it('今の代表がグループにいれば、品質スコアが上の記事が加わっても据え置く', () => {
    expect(
      chooseStoryId(
        [
          row('a', '発表A', 'a', { qualityScore: 40 }),
          row('b', '発表B', 'a', { qualityScore: 40 }),
          row('c', '発表C', null, { qualityScore: 90 }),
        ],
        []
      )
    ).toBe('a');
  });

  it('今の代表が英語で、日本語の記事が加わったら日本語の記事に替える', () => {
    expect(
      chooseStoryId(
        [
          row('en', 'Sonnet 5.5 launches', 'en'),
          row('en2', 'Sonnet 5.5 is here', 'en'),
          row('ja', 'Sonnet 5.5を発表', null),
        ],
        []
      )
    ).toBe('ja');
  });

  it('今の代表がグループにいなければ、規則で選び直す', () => {
    expect(
      chooseStoryId(
        [
          row('a', '発表A', 'gone'),
          row('b', '発表B', null, { qualityScore: 80 }),
        ],
        []
      )
    ).toBe('b');
  });
});

describe('assignStories', () => {
  function createDb(options: {
    rows: Array<ReturnType<typeof row>>;
    pairs: Array<{ a: string; b: string }>;
    embedded?: string[];
    locked?: boolean;
  }) {
    const executeRaw = jest.fn().mockResolvedValue(0);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ locked: options.locked ?? true }])
      .mockResolvedValueOnce(
        (options.embedded ?? options.rows.map((r) => r.id)).map((id) => ({
          articleId: id,
        }))
      )
      .mockResolvedValueOnce(options.pairs);
    const findMany = jest.fn().mockResolvedValue(options.rows);
    const tx = {
      article: { findMany },
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
    };
    const db = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx)
      ),
    };
    return { db, tx, executeRaw };
  }

  // unnest で書き込んだ ID と storyId の組（タグ付きテンプレートの値を取り出す）
  const writes = (executeRaw: jest.Mock) =>
    executeRaw.mock.calls
      .filter(([strings]) => String(strings.join('?')).includes('unnest'))
      .flatMap(([, ids, storyIds]) =>
        (ids as string[]).map((id, i) => [id, (storyIds as string[])[i]])
      );

  it('組になった記事に代表の ID を書き、まとめから外れた記事の storyId を消す', async () => {
    const { db, executeRaw } = createDb({
      rows: [
        row('en', 'Sonnet 5.5 launches', null, { qualityScore: 90 }),
        row('ja', 'Sonnet 5.5を発表', null, { qualityScore: 40 }),
        row('old', '前のまとめ', 'gone'),
        row('solo', '単独の記事', null),
      ],
      pairs: [{ a: 'en', b: 'ja' }],
    });

    const result = await assignStories(db as never, { now: NOW });

    expect(result).toMatchObject({
      candidates: 4,
      pairs: 1,
      stories: 1,
      groupedArticles: 2,
      changed: 3,
      dryRun: false,
      skipped: false,
    });
    expect(result.groups[0].storyId).toBe('ja');
    expect(writes(executeRaw)).toEqual(
      expect.arrayContaining([
        ['en', 'ja'],
        ['ja', 'ja'],
        ['old', null],
      ])
    );
    // 書き込み（1文）と件数の数え直し
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('既に同じ値なら書き込まない（件数の数え直しだけ流す）', async () => {
    const { db, executeRaw } = createDb({
      rows: [row('a', '発表A', 'a'), row('b', '発表B', 'a')],
      pairs: [{ a: 'a', b: 'b' }],
    });

    const result = await assignStories(db as never, { now: NOW });

    expect(result.changed).toBe(0);
    expect(writes(executeRaw)).toEqual([]);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('期間の外の記事が持つストーリーに期間内の記事を合わせ、期間の外の記事は書き換えない', async () => {
    const { db, executeRaw } = createDb({
      rows: [
        row('a', 'Announcement', 'a', { publishedAt: BEFORE_WINDOW }),
        row('b', '発表B', null, { qualityScore: 90 }),
      ],
      pairs: [{ a: 'a', b: 'b' }],
    });

    const result = await assignStories(db as never, { now: NOW });

    expect(result.candidates).toBe(1);
    expect(writes(executeRaw)).toEqual([['b', 'a']]);
  });

  it('埋め込みがまだ無い記事は、組が無くてもまとめを消さない', async () => {
    const { db, executeRaw } = createDb({
      rows: [row('a', '発表A', 'a'), row('b', '発表B', 'a')],
      pairs: [],
      embedded: ['a'],
    });

    await assignStories(db as never, { now: NOW });

    expect(writes(executeRaw)).toEqual([['a', null]]);
  });

  it('dryRun では書き込まず、まとまるグループを返す', async () => {
    const { db, executeRaw } = createDb({
      rows: [row('a', '発表A', null), row('b', '発表B', null)],
      pairs: [{ a: 'a', b: 'b' }],
    });

    const result = await assignStories(db as never, {
      now: NOW,
      dryRun: true,
    });

    expect(result.changed).toBe(2);
    expect(result.groups).toHaveLength(1);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('別の実行がロックを持っていれば、何も読まずに終える', async () => {
    const { db, tx, executeRaw } = createDb({
      rows: [],
      pairs: [],
      locked: false,
    });

    const result = await assignStories(db as never, { now: NOW });

    expect(result.skipped).toBe(true);
    expect(tx.article.findMany).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('now までの7日と、その直前72時間の記事を読む', async () => {
    const { db, tx } = createDb({ rows: [], pairs: [] });

    await assignStories(db as never, { now: NOW });

    expect(tx.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publishedAt: {
            gte: new Date('2026-09-20T00:00:00Z'),
            lte: NOW,
          },
        },
      })
    );
  });
});
