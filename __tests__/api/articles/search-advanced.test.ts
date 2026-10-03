/**
 * @jest-environment node
 */
import { GET } from '@/app/api/articles/search/advanced/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/prisma');

const prismaMock = prisma as any;

const ARTICLES = [
  {
    id: 'a-beginner',
    title: 'Beginner article',
    difficulty: 'beginner',
    userVotes: 0,
    tags: [{ name: 'react' }],
    source: { id: 's1', name: 'Zenn' },
    _count: { favorites: 0, articleViews: 0 },
  },
  {
    id: 'a-advanced',
    title: 'Advanced article',
    difficulty: 'advanced',
    userVotes: 0,
    tags: [],
    source: { id: 's1', name: 'Zenn' },
    _count: { favorites: 0, articleViews: 0 },
  },
  {
    id: 'a-null',
    title: 'Unrated article',
    difficulty: null,
    userVotes: 0,
    tags: [],
    source: { id: 's1', name: 'Zenn' },
    _count: { favorites: 0, articleViews: 0 },
  },
];

function request(query: string) {
  return new NextRequest(
    `http://localhost:3000/api/articles/search/advanced${query}`
  );
}

describe('GET /api/articles/search/advanced', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.article.count.mockResolvedValue(ARTICLES.length);
    prismaMock.article.findMany.mockResolvedValue(ARTICLES);
  });

  // issue #688: 無効化したソースの記事を除く。ソースの指定（where.source）とぶつからないこと
  it('無効化したソースの記事を除き、ソースの指定も残す', async () => {
    await GET(request('?q=react&sources=Zenn'));

    for (const mock of [prismaMock.article.findMany, prismaMock.article.count]) {
      const where = mock.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({ source: { is: { enabled: true } } });
      expect(where.source).toEqual({ is: { name: { in: ['Zenn'] } } });
    }
  });

  it('difficulty パラメータを渡しても where 条件に difficulty を含めない', async () => {
    await GET(request('?q=react&difficulty=beginner&difficulty=advanced'));

    const findManyWhere = prismaMock.article.findMany.mock.calls[0][0].where;
    const countWhere = prismaMock.article.count.mock.calls[0][0].where;
    // AND / OR の入れ子に紛れ込んでも検出できるよう、where 全体を文字列で調べる
    expect(JSON.stringify(findManyWhere)).not.toContain('"difficulty"');
    expect(JSON.stringify(countWhere)).not.toContain('"difficulty"');
  });

  it('difficulty パラメータの有無で where 条件と結果が変わらない', async () => {
    const withoutParam = await GET(request('?q=react'));
    const withParam = await GET(request('?q=react&difficulty=beginner'));

    const [callWithout, callWith] = prismaMock.article.findMany.mock.calls;
    expect(callWith[0].where).toEqual(callWithout[0].where);

    const bodyWithout = await withoutParam.json();
    const bodyWith = await withParam.json();
    expect(withParam.status).toBe(200);
    expect(bodyWith.totalCount).toBe(bodyWithout.totalCount);
    expect(bodyWith.articles.map((a: { id: string }) => a.id)).toEqual(
      bodyWithout.articles.map((a: { id: string }) => a.id)
    );
  });

  it('タグの包含・除外は lower(name) で引いたタグの ID で絞る（#672）', async () => {
    // findTagIdsByNames の SQL（lower() での照合）は結合テストで確かめる
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ id: 'tag-mcp' }, { id: 'tag-rust' }])
      .mockResolvedValueOnce([{ id: 'tag-go' }]);

    await GET(request('?tags=mcp&tags=Rust&excludeTags=GO'));

    const [includeCall, excludeCall] = prismaMock.$queryRaw.mock.calls;
    expect(includeCall).toContainEqual(['mcp', 'Rust']);
    expect(excludeCall).toContainEqual(['GO']);
    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    expect(where.tags).toEqual({
      some: { id: { in: ['tag-mcp', 'tag-rust'] } },
    });
    expect(where.AND).toContainEqual({
      NOT: { tags: { some: { id: { in: ['tag-go'] } } } },
    });
    // ILIKE（_ や % がワイルドカードになる）を使っていない
    expect(JSON.stringify(where)).not.toContain('insensitive');
  });

  it('包含のタグが見つからなければ 0 件になる条件にする', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await GET(request('?tags=no-such-tag'));

    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    expect(where.tags).toEqual({ some: { id: { in: [] } } });
  });

  it('含む語・除く語の LIKE のワイルドカードをエスケープする（#684）', async () => {
    await GET(request('?q=a_b%20-100%25'));

    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { title: { contains: 'a\\_b', mode: 'insensitive' } },
            { translatedTitle: { contains: 'a\\_b', mode: 'insensitive' } },
            { summary: { contains: 'a\\_b', mode: 'insensitive' } },
          ],
        },
        { NOT: { title: { contains: '100\\%', mode: 'insensitive' } } },
      ])
    );
  });

  it('除外語は translatedTitle・summary が NULL の記事を落とさない（#684）', async () => {
    await GET(request('?q=-foo'));

    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    // NOT (a OR b OR c) は NULL の列で NULL になり記事ごと落ちるので、列ごとに
    // 「NULL か、含まない」にする
    expect(where.AND).toEqual([
      // 無効化したソースの記事を除く（issue #688）
      { source: { is: { enabled: true } } },
      { NOT: { title: { contains: 'foo', mode: 'insensitive' } } },
      {
        OR: [
          { translatedTitle: null },
          {
            NOT: { translatedTitle: { contains: 'foo', mode: 'insensitive' } },
          },
        ],
      },
      {
        OR: [
          { summary: null },
          { NOT: { summary: { contains: 'foo', mode: 'insensitive' } } },
        ],
      },
    ]);
  });

  it.each([
    ['201 文字', 'a'.repeat(201)],
    ['11 語', Array.from({ length: 11 }, (_, i) => `w${i}`).join(' ')],
    // タブだけの語を半角スペースで挟んでも、語数の上限をすり抜けられない
    [
      'タブで区切った 11 語',
      Array.from({ length: 11 }, (_, i) => `w${i}`).join(' \t '),
    ],
  ])('%sの検索語は 400 を返し、クエリしない（#684）', async (_label, q) => {
    const response = await GET(request(`?q=${encodeURIComponent(q)}`));

    expect(response.status).toBe(400);
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('タブや全角スペースも語の区切りとして扱う（#684）', async () => {
    await GET(request(`?q=${encodeURIComponent('foo\tbar\u3000baz')}`));

    const where = prismaMock.article.findMany.mock.calls[0][0].where;
    // 先頭は無効化したソースを除く条件（issue #688）。その後ろに語ごとの条件が並ぶ
    expect(where.AND[0]).toEqual({ source: { is: { enabled: true } } });
    expect((where.AND as any[]).slice(1).map((c) => c.OR[0].title.contains)).toEqual([
      'foo',
      'bar',
      'baz',
    ]);
  });

  it('facets.difficulty はレスポンスの形を保つため空配列で返す', async () => {
    const res = await GET(request('?difficulty=advanced'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.facets).toEqual({ tags: [], sources: [], difficulty: [] });
  });
});
