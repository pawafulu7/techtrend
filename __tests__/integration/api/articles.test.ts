import { prismaMock, createMockArticle, createMockSource, createMockTag } from '../../__mocks__/prisma';

// Next.js環境のモック
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url) => ({
    url,
    nextUrl: new URL(url),
  })),
  NextResponse: {
    json: jest.fn((data, init) => ({
      json: async () => data,
      status: init?.status || 200,
    })),
  },
}));

// 統合テストは環境設定後に実装
describe.skip('Articles API', () => {
  describe('GET /api/articles', () => {
    it('記事一覧を正しく返す', async () => {
      const mockArticles = [
        {
          ...createMockArticle({ id: '1', title: 'Article 1' }),
          source: createMockSource({ name: 'Qiita' }),
          tags: [createMockTag({ name: 'React' })],
        },
        {
          ...createMockArticle({ id: '2', title: 'Article 2' }),
          source: createMockSource({ name: 'Zenn' }),
          tags: [createMockTag({ name: 'TypeScript' })],
        },
      ];

      prismaMock.article.count.mockResolvedValue(2);
      prismaMock.article.findMany.mockResolvedValue(mockArticles);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.articles).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.page).toBe(1);
    });

    it('ページネーションが正しく動作する', async () => {
      prismaMock.article.count.mockResolvedValue(50);
      prismaMock.article.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/articles?page=2&limit=20');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.page).toBe(2);
      expect(data.limit).toBe(20);
      expect(data.totalPages).toBe(3); // 50 / 20 = 2.5 → 3
    });

    it('フィルタリングが正しく動作する', async () => {
      prismaMock.article.count.mockResolvedValue(5);
      prismaMock.article.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/articles?sourceId=source-1&tags=React,TypeScript');
      await GET(request);

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'source-1',
            tags: {
              some: {
                name: {
                  in: ['React', 'TypeScript'],
                },
              },
            },
          }),
        })
      );
    });

    it('検索クエリが正しく動作する', async () => {
      prismaMock.article.count.mockResolvedValue(3);
      prismaMock.article.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/articles?search=Next.js');
      await GET(request);

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'Next.js' } },
              { summary: { contains: 'Next.js' } },
            ],
          }),
        })
      );
    });

    it('ソート順が正しく適用される', async () => {
      prismaMock.article.count.mockResolvedValue(10);
      prismaMock.article.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/articles?sortBy=qualityScore&sortOrder=desc');
      await GET(request);

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            qualityScore: 'desc',
          },
        })
      );
    });
  });
});