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

  it('201 文字の検索語は 400 を返し、クエリしない（#684）', async () => {
    const response = await GET(request(`?q=${'a'.repeat(201)}`));

    expect(response.status).toBe(400);
    expect(prismaMock.article.findMany).not.toHaveBeenCalled();
  });

  it('facets.difficulty はレスポンスの形を保つため空配列で返す', async () => {
    const res = await GET(request('?difficulty=advanced'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.facets).toEqual({ tags: [], sources: [], difficulty: [] });
  });
});
