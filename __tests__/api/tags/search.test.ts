/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import logger from '@/lib/logger';

// 件数の集計（有効なソースの記事だけを数える生 SQL）と LIKE のエスケープは
// tag-article-counts のテスト DB のテストで確かめる。ここでは route が渡す条件を見る
const mockFindTopTags = jest.fn();
// 第 1 引数の prisma は jest-mock-extended の Proxy で、expect.anything() が使えないので、条件（第 2 引数）だけを見る
const lastOptions = () => mockFindTopTags.mock.calls.at(-1)?.[1];
const lastClient = () => mockFindTopTags.mock.calls.at(-1)?.[0];
// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  prismaMock: sharedPrismaMock,
} = require('../../../test/utils/prisma-mock');
jest.mock('@/lib/database/tag-article-counts', () => ({
  findTopTags: (...args: unknown[]) => mockFindTopTags(...args),
}));
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_key: unknown, fn: unknown) => fn,
}));

import { GET } from '@/app/api/tags/search/route';

function request(query: string) {
  return new NextRequest(`http://localhost:3000/api/tags/search${query}`);
}

describe('GET /api/tags/search', () => {
  beforeEach(() => {
    mockFindTopTags.mockReset();
    mockFindTopTags.mockResolvedValue([
      { id: 't1', name: 'a_b%', category: null, count: 3 },
    ]);
  });

  it('検索語をそのまま部分一致の条件として渡し、件数の多い順に最大 100 件を返す', async () => {
    const response = await GET(request('?q=a_b%25'));

    expect(response.status).toBe(200);
    // エスケープは findTopTags が行う（#684）
    expect(lastClient()).toBe(sharedPrismaMock);
    expect(lastOptions()).toEqual({
      limit: 100,
      nameContains: 'a_b%',
    });
    expect(await response.json()).toEqual([
      { id: 't1', name: 'a_b%', count: 3, category: null },
    ]);
  });

  it('201 文字の検索語は先頭 200 文字に切り詰めて検索する（#684）', async () => {
    const response = await GET(request(`?q=${'a'.repeat(201)}`));

    expect(response.status).toBe(200);
    expect(lastOptions()).toEqual({
      limit: 100,
      nameContains: 'a'.repeat(200),
    });
  });

  it('切り詰めた位置の直前が空白なら、その空白も除く', async () => {
    await GET(request(`?q=${'a'.repeat(199)}%20b`));

    expect(lastOptions()).toEqual({
      limit: 100,
      nameContains: 'a'.repeat(199),
    });
  });

  it('検索語の前後の空白を除いて検索する', async () => {
    await GET(request('?q=%20%20React%20'));

    expect(lastOptions()).toEqual({
      limit: 100,
      nameContains: 'React',
    });
  });

  it('検索語がなければ名前の条件を付けずに人気順で 50 件を返す', async () => {
    const response = await GET(request(''));

    expect(response.status).toBe(200);
    expect(lastOptions()).toEqual({
      limit: 50,
    });
  });

  it('集計に失敗したら 500 を返す', async () => {
    const error = new Error('db down');
    mockFindTopTags.mockRejectedValueOnce(error);
    const logError = jest.spyOn(logger, 'error');
    try {
      const response = await GET(request('?q=react'));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to search tags' });
      expect(logError).toHaveBeenCalledWith(
        { err: error },
        'Tags search failed'
      );
    } finally {
      logError.mockRestore();
    }
  });
  it('日本語の別名でも正式名のタグを検索する', async () => {
    await GET(request(`?q=${encodeURIComponent('サイバーセキュリティ')}`));
    expect(lastOptions()).toEqual({
      limit: 100,
      nameContains: 'サイバーセキュリティ',
      canonicalNames: ['Cybersecurity'],
    });
  });
});
