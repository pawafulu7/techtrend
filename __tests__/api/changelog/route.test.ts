/**
 * /api/changelog エンドポイントのテスト
 */

import { createRedisCacheMock } from '../../helpers/cache-mock-helpers';

// モックの設定
jest.mock('@/lib/database');
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('@/lib/api/error-handler', () => ({
  handleApiError: jest.fn().mockReturnValue(
    new Response(JSON.stringify({ error: { message: 'Internal server error' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  ),
}));
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockImplementation((_key: string, handler: Function) => handler),
}));

// モックインスタンスを保持する変数
let mockCacheInstance: ReturnType<typeof createRedisCacheMock>;

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => {
    const { createRedisCacheMock } = require('../../helpers/cache-mock-helpers');
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
      // getOrSetを追加
      mockCacheInstance.getOrSet = jest.fn().mockImplementation(
        async (_key: string, fetcher: () => Promise<unknown>) => {
          return await fetcher();
        }
      );
    }
    return mockCacheInstance;
  }),
}));

import { GET } from '@/app/api/changelog/route';
import { prisma } from '@/lib/database';
import { NextRequest } from 'next/server';

const prismaMock = prisma as any;

describe('/api/changelog', () => {
  const mockProject = {
    id: 'proj1',
    slug: 'claude-code',
    name: 'Claude Code',
    sourceUrl: 'https://example.com/changelog',
    iconUrl: 'https://example.com/icon.png',
  };

  const mockVersions = [
    {
      id: 'v3',
      version: '1.2.0',
      sortOrder: 3,
      createdAt: new Date('2026-03-01'),
      _count: { entries: 2 },
    },
    {
      id: 'v2',
      version: '1.1.0',
      sortOrder: 2,
      createdAt: new Date('2026-02-15'),
      _count: { entries: 3 },
    },
    {
      id: 'v1',
      version: '1.0.0',
      sortOrder: 1,
      createdAt: new Date('2026-02-01'),
      _count: { entries: 1 },
    },
  ];

  const mockEntriesV3 = [
    {
      id: 'e1',
      content: 'Added new feature X',
      category: 'FEATURE',
      orderIndex: 0,
    },
    {
      id: 'e2',
      content: 'Fixed bug Y',
      category: 'BUGFIX',
      orderIndex: 1,
    },
  ];

  const mockEntriesV2 = [
    {
      id: 'e3',
      content: 'Improved performance',
      category: 'IMPROVEMENT',
      orderIndex: 0,
    },
    {
      id: 'e4',
      content: 'Added feature Z',
      category: 'FEATURE',
      orderIndex: 1,
    },
    {
      id: 'e5',
      content: 'Other change',
      category: 'OTHER',
      orderIndex: 2,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // キャッシュモックのリセット
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
      mockCacheInstance.getOrSet = jest.fn();
    }
    // getOrSetはデフォルトでfetcherを実行する
    mockCacheInstance.getOrSet.mockImplementation(
      async (_key: string, fetcher: () => Promise<unknown>) => {
        return await fetcher();
      }
    );
    mockCacheInstance.generateCacheKey.mockImplementation(
      (base: string, options: any) => {
        const { project, version } = options.params;
        return `${base}:${project}:${version}`;
      }
    );

    // Prismaモックの設定
    prismaMock.changelogProject = {
      findFirst: jest.fn().mockResolvedValue(mockProject),
    };
    prismaMock.changelogVersion = {
      findMany: jest.fn().mockResolvedValue(mockVersions),
    };
    prismaMock.changelogEntry = {
      findMany: jest.fn().mockResolvedValue(mockEntriesV3),
    };
  });

  describe('GET', () => {
    it('プロジェクト情報 + 全バージョン + 最新バージョンのエントリを返す（versionパラメータなし）', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/changelog')
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      // プロジェクト情報
      expect(data.project).toEqual(mockProject);

      // 全バージョン（sortOrder降順）
      expect(data.versions).toHaveLength(3);
      expect(data.versions[0].version).toBe('1.2.0');
      expect(data.versions[0].entryCount).toBe(2);
      expect(data.versions[1].version).toBe('1.1.0');
      expect(data.versions[2].version).toBe('1.0.0');

      // 最新バージョンのエントリ
      expect(data.entries).toHaveLength(2);
      expect(data.entries[0].content).toBe('Added new feature X');
      expect(data.entries[1].content).toBe('Fixed bug Y');

      // カテゴリカウント
      expect(data.categoryCounts).toEqual({
        FEATURE: 1,
        BUGFIX: 1,
        IMPROVEMENT: 0,
        OTHER: 0,
      });

      // 最新バージョン(v3)のエントリを取得
      expect(prismaMock.changelogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { versionId: 'v3' },
          orderBy: { orderIndex: 'asc' },
        })
      );
    });

    it('versionパラメータ指定時に該当バージョンのエントリを返す', async () => {
      prismaMock.changelogEntry.findMany.mockResolvedValue(mockEntriesV2);

      const request = new NextRequest(
        new URL('http://localhost/api/changelog?version=1.1.0')
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      // 指定バージョンのエントリ
      expect(data.entries).toHaveLength(3);
      expect(data.entries[0].content).toBe('Improved performance');

      // カテゴリカウント
      expect(data.categoryCounts).toEqual({
        FEATURE: 1,
        BUGFIX: 0,
        IMPROVEMENT: 1,
        OTHER: 1,
      });

      // v2のエントリを取得
      expect(prismaMock.changelogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { versionId: 'v2' },
        })
      );
    });

    it('vプレフィックス付きのversionパラメータでも該当バージョンのエントリを返す', async () => {
      prismaMock.changelogEntry.findMany.mockResolvedValue(mockEntriesV2);

      const request = new NextRequest(
        new URL('http://localhost/api/changelog?version=v1.1.0')
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.entries).toHaveLength(3);
      expect(data.entries[0].content).toBe('Improved performance');

      // v2のエントリを取得
      expect(prismaMock.changelogEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { versionId: 'v2' },
        })
      );
    });

    it('プロジェクトが見つからない場合に404を返す', async () => {
      prismaMock.changelogProject.findFirst.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost/api/changelog?project=nonexistent')
      );
      const response = await GET(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Project not found');
    });

    it('カテゴリカウントが正しく計算される', async () => {
      const mixedEntries = [
        { id: 'e1', content: 'Feature 1', category: 'FEATURE', orderIndex: 0 },
        { id: 'e2', content: 'Feature 2', category: 'FEATURE', orderIndex: 1 },
        { id: 'e3', content: 'Bugfix 1', category: 'BUGFIX', orderIndex: 2 },
        { id: 'e4', content: 'Improvement 1', category: 'IMPROVEMENT', orderIndex: 3 },
        { id: 'e5', content: 'Improvement 2', category: 'IMPROVEMENT', orderIndex: 4 },
        { id: 'e6', content: 'Improvement 3', category: 'IMPROVEMENT', orderIndex: 5 },
        { id: 'e7', content: 'Other 1', category: 'OTHER', orderIndex: 6 },
      ];
      prismaMock.changelogEntry.findMany.mockResolvedValue(mixedEntries);

      const request = new NextRequest(
        new URL('http://localhost/api/changelog')
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.categoryCounts).toEqual({
        FEATURE: 2,
        BUGFIX: 1,
        IMPROVEMENT: 3,
        OTHER: 1,
      });
    });

    it('バージョンがsortOrder降順でソートされている', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/changelog')
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      // sortOrder降順
      expect(data.versions[0].sortOrder).toBe(3);
      expect(data.versions[1].sortOrder).toBe(2);
      expect(data.versions[2].sortOrder).toBe(1);

      // Prismaクエリでも降順指定
      expect(prismaMock.changelogVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: 'desc' },
        })
      );
    });

    it('キャッシュが使用される（getOrSetが呼ばれる）', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/changelog')
      );
      await GET(request);

      expect(mockCacheInstance.getOrSet).toHaveBeenCalledTimes(1);
      expect(mockCacheInstance.generateCacheKey).toHaveBeenCalledWith(
        'changelog',
        expect.objectContaining({
          params: { project: 'claude-code', version: 'latest' },
        })
      );
    });

    it('versionパラメータ指定時にキャッシュキーにバージョンが含まれる', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/changelog?version=1.1.0')
      );
      await GET(request);

      expect(mockCacheInstance.generateCacheKey).toHaveBeenCalledWith(
        'changelog',
        expect.objectContaining({
          params: { project: 'claude-code', version: '1.1.0' },
        })
      );
    });

    it('キャッシュヒット時にDBクエリが実行されない', async () => {
      const cachedData = {
        project: mockProject,
        versions: mockVersions.map((v) => ({
          id: v.id,
          version: v.version,
          sortOrder: v.sortOrder,
          createdAt: v.createdAt,
          entryCount: v._count.entries,
        })),
        entries: mockEntriesV3,
        categoryCounts: { FEATURE: 1, BUGFIX: 1, IMPROVEMENT: 0, OTHER: 0 },
      };

      mockCacheInstance.getOrSet.mockResolvedValue(cachedData);

      const request = new NextRequest(
        new URL('http://localhost/api/changelog')
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.project).toEqual(mockProject);

      // DBクエリは実行されない
      expect(prismaMock.changelogProject.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.changelogVersion.findMany).not.toHaveBeenCalled();
      expect(prismaMock.changelogEntry.findMany).not.toHaveBeenCalled();
    });

    it('デフォルトのprojectパラメータはclaude-code', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/changelog')
      );
      await GET(request);

      expect(prismaMock.changelogProject.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'claude-code', enabled: true },
        })
      );
    });

    it('projectパラメータでプロジェクトを指定できる', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/changelog?project=other-project')
      );
      await GET(request);

      expect(prismaMock.changelogProject.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'other-project', enabled: true },
        })
      );
    });

    it('バージョンが存在しない場合はentriesが空配列、categoryCountsがゼロ', async () => {
      prismaMock.changelogVersion.findMany.mockResolvedValue([]);

      const request = new NextRequest(
        new URL('http://localhost/api/changelog')
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.versions).toHaveLength(0);
      expect(data.entries).toEqual([]);
      expect(data.categoryCounts).toEqual({
        FEATURE: 0,
        BUGFIX: 0,
        IMPROVEMENT: 0,
        OTHER: 0,
      });
    });

    it('データベースエラー時にhandleApiErrorが呼ばれる', async () => {
      const { handleApiError } = require('@/lib/api/error-handler');
      prismaMock.changelogProject.findFirst.mockRejectedValue(
        new Error('Database error')
      );
      // getOrSetがfetcherを実行し、DBエラーを伝播するように設定
      mockCacheInstance.getOrSet.mockImplementation(
        async (_key: string, fetcher: () => Promise<unknown>) => {
          return await fetcher();
        }
      );

      const request = new NextRequest(
        new URL('http://localhost/api/changelog')
      );
      const response = await GET(request);

      expect(response.status).toBe(500);
      expect(handleApiError).toHaveBeenCalledWith(
        expect.any(Error),
        '/api/changelog'
      );
    });
  });
});
