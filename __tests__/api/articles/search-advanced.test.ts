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
    expect(findManyWhere).not.toHaveProperty('difficulty');
    expect(countWhere).not.toHaveProperty('difficulty');
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

  it('facets.difficulty はレスポンスの形を保つため空配列で返す', async () => {
    const res = await GET(request('?difficulty=advanced'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.facets).toEqual({ tags: [], sources: [], difficulty: [] });
  });
});
