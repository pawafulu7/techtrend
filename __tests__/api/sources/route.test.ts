/**
 * /api/sources エンドポイントのテスト
 */

// モックの設定
jest.mock('@/lib/database');
jest.mock('@/lib/cache/source-cache');

import { GET } from '@/app/api/sources/route';
import { prisma } from '@/lib/database';
import { sourceCache } from '@/lib/cache/source-cache';
import { NextRequest } from 'next/server';

const prismaMock = prisma as any;
const sourceCacheMock = sourceCache as any;

describe('/api/sources', () => {
  const mockSources = [
    {
      id: 'qiita',
      name: 'Qiita',
      type: 'api',
      url: 'https://qiita.com',
      enabled: true,
      category: 'tech_blog',
      description: 'Japanese tech blog',
      stats: {
        totalArticles: 150,
        avgQualityScore: 85,
        lastUpdated: new Date('2025-01-01'),
      },
    },
    {
      id: 'zenn',
      name: 'Zenn',
      type: 'rss',
      url: 'https://zenn.dev',
      enabled: true,
      category: 'tech_blog',
      description: 'Developer community',
      stats: {
        totalArticles: 100,
        avgQualityScore: 90,
        lastUpdated: new Date('2025-01-02'),
      },
    },
    {
      id: 'devto',
      name: 'Dev.to',
      type: 'api',
      url: 'https://dev.to',
      enabled: true,
      category: 'community',
      description: 'International dev community',
      stats: {
        totalArticles: 200,
        avgQualityScore: 80,
        lastUpdated: new Date('2025-01-03'),
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // デフォルトのPrismaモック設定
    prismaMock.source = {
      findMany: jest.fn().mockResolvedValue(mockSources),
    };
    
    // sourceCacheのモック設定
    if (!sourceCacheMock.getAllSourcesWithStats || typeof sourceCacheMock.getAllSourcesWithStats.mockClear !== 'function') {
      sourceCacheMock.getAllSourcesWithStats = jest.fn();
    }
    if (!sourceCacheMock.setAllSourcesWithStats || typeof sourceCacheMock.setAllSourcesWithStats.mockClear !== 'function') {
      sourceCacheMock.setAllSourcesWithStats = jest.fn();
    }
    sourceCacheMock.getAllSourcesWithStats.mockClear();
    sourceCacheMock.getAllSourcesWithStats.mockResolvedValue(mockSources);
    sourceCacheMock.setAllSourcesWithStats.mockClear();
    sourceCacheMock.setAllSourcesWithStats.mockResolvedValue(undefined);
  });

  describe('GET', () => {
    it('全ソースと統計情報を返す（キャッシュ使用）', async () => {
      const request = new NextRequest('http://localhost/api/sources');
      const response = await GET(request);

      // Debug: エラーの内容を確認
      if (response.status !== 200) {
        const errorData = await response.json();
        console.error('Response error:', errorData);
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources).toHaveLength(3);
      expect(data.totalCount).toBe(3);
      expect(data.sources[0].name).toBe('Qiita');
      
      // キャッシュヒットヘッダーの確認
      expect(response.headers.get('X-Cache-Status')).toBe('HIT');
      expect(response.headers.get('X-Response-Time')).toMatch(/\d+ms/);
      
      expect(sourceCacheMock.getAllSourcesWithStats).toHaveBeenCalled();
      expect(prismaMock.source.findMany).not.toHaveBeenCalled();
    });

    it('カテゴリーでフィルタリングする', async () => {
      const request = new NextRequest('http://localhost/api/sources?category=tech_blog');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources).toHaveLength(2);
      expect(data.sources.every(s => s.category === 'tech_blog')).toBe(true);
    });

    it('検索クエリでフィルタリングする', async () => {
      const request = new NextRequest('http://localhost/api/sources?search=zenn');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0].name).toBe('Zenn');
    });

    it('記事数でソート（降順）', async () => {
      const request = new NextRequest('http://localhost/api/sources?sortBy=articles&order=desc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources[0].stats.totalArticles).toBe(200); // Dev.to
      expect(data.sources[1].stats.totalArticles).toBe(150); // Qiita
      expect(data.sources[2].stats.totalArticles).toBe(100); // Zenn
    });

    it('記事数でソート（昇順）', async () => {
      const request = new NextRequest('http://localhost/api/sources?sortBy=articles&order=asc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources[0].stats.totalArticles).toBe(100); // Zenn
      expect(data.sources[1].stats.totalArticles).toBe(150); // Qiita
      expect(data.sources[2].stats.totalArticles).toBe(200); // Dev.to
    });

    it('名前でソート（昇順）', async () => {
      const request = new NextRequest('http://localhost/api/sources?sortBy=name&order=asc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources[0].name).toBe('Dev.to');
      expect(data.sources[1].name).toBe('Qiita');
      expect(data.sources[2].name).toBe('Zenn');
    });

    it('名前でソート（降順）', async () => {
      const request = new NextRequest('http://localhost/api/sources?sortBy=name&order=desc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources[0].name).toBe('Zenn');
      expect(data.sources[1].name).toBe('Qiita');
      expect(data.sources[2].name).toBe('Dev.to');
    });

    it('特定のIDsでソースを取得（キャッシュ未使用）', async () => {
      const filteredSources = [mockSources[0], mockSources[2]];
      prismaMock.source.findMany.mockResolvedValue(filteredSources);

      const request = new NextRequest('http://localhost/api/sources?ids=qiita,devto');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources).toHaveLength(2);
      expect(data.sources[0].id).toBe('qiita');
      expect(data.sources[1].id).toBe('devto');
      
      // IDsパラメータありの場合はキャッシュを使わない
      expect(sourceCacheMock.getAllSourcesWithStats).not.toHaveBeenCalled();
      expect(prismaMock.source.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            enabled: true,
            id: {
              in: ['qiita', 'devto']
            }
          })
        })
      );
    });

    it('複数のフィルタを組み合わせる', async () => {
      const request = new NextRequest('http://localhost/api/sources?category=tech_blog&search=qi&sortBy=name&order=asc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0].name).toBe('Qiita');
    });

    it('空の結果を正しく処理する', async () => {
      sourceCacheMock.getAllSourcesWithStats.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/sources');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources).toHaveLength(0);
      expect(data.totalCount).toBe(0);
    });

    it('大文字小文字を区別しない検索', async () => {
      const request = new NextRequest('http://localhost/api/sources?search=ZENN');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0].name).toBe('Zenn');
    });

    it('無効なカテゴリーで空の結果を返す', async () => {
      const request = new NextRequest('http://localhost/api/sources?category=invalid_category');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sources).toHaveLength(0);
      expect(data.totalCount).toBe(0);
    });

    it('デフォルトのソート順を使用', async () => {
      const request = new NextRequest('http://localhost/api/sources');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      // デフォルトは記事数降順
      expect(data.sources[0].stats.totalArticles).toBe(200);
      expect(data.sources[1].stats.totalArticles).toBe(150);
      expect(data.sources[2].stats.totalArticles).toBe(100);
    });
  });
});