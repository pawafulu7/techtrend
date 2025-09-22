import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('差分処理の動作確認', () => {
  let testSourceId: string;

  beforeAll(async () => {
    // テスト用ソースを作成
    const source = await prisma.source.create({
      data: {
        name: 'Test Source for Differential',
        type: 'test',
        url: 'https://test.example.com',
        enabled: true
      }
    });
    testSourceId = source.id;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    await prisma.article.deleteMany({
      where: { sourceId: testSourceId }
    });
    await prisma.source.delete({
      where: { id: testSourceId }
    });
    await prisma.processingLog.deleteMany({
      where: {
        processName: {
          in: ['test-summary', 'test-quality', 'test-difficulty']
        }
      }
    });
    await prisma.$disconnect();
  });

  describe('要約生成の差分処理', () => {
    it('初回は全記事を処理対象とする', async () => {
      // テスト記事を作成
      const articles = await Promise.all([
        prisma.article.create({
          data: {
            title: 'Test Article 1',
            url: 'https://test1.example.com',
            publishedAt: new Date(),
            sourceId: testSourceId,
            summary: null
          }
        }),
        prisma.article.create({
          data: {
            title: 'Test Article 2',
            url: 'https://test2.example.com',
            publishedAt: new Date(),
            sourceId: testSourceId,
            summary: null
          }
        })
      ]);

      // 処理対象の記事数を確認
      const targetArticles = await prisma.article.findMany({
        where: {
          sourceId: testSourceId,
          summary: null
        }
      });

      expect(targetArticles.length).toBe(2);

      // クリーンアップ
      await Promise.all(
        articles.map(article =>
          prisma.article.delete({ where: { id: article.id } })
        )
      );
    });

    it('処理済み記事はスキップする', async () => {
      // 処理済み記事を作成
      const processedArticle = await prisma.article.create({
        data: {
          title: 'Processed Article',
          url: 'https://processed.example.com',
          publishedAt: new Date(),
          sourceId: testSourceId,
          summary: '処理済みの要約'
        }
      });

      // 新規記事を作成
      const newArticle = await prisma.article.create({
        data: {
          title: 'New Article',
          url: 'https://new.example.com',
          publishedAt: new Date(),
          sourceId: testSourceId,
          summary: null
        }
      });

      // 処理対象を確認（新規記事のみ）
      const targetArticles = await prisma.article.findMany({
        where: {
          sourceId: testSourceId,
          summary: null
        }
      });

      expect(targetArticles.length).toBe(1);
      expect(targetArticles[0].id).toBe(newArticle.id);

      // クリーンアップ
      await prisma.article.delete({ where: { id: processedArticle.id } });
      await prisma.article.delete({ where: { id: newArticle.id } });
    });
  });

  describe('品質スコアの差分処理', () => {
    it('スコアが0の記事を処理対象とする', async () => {
      const article = await prisma.article.create({
        data: {
          title: 'Zero Score Article',
          url: 'https://zero-score.example.com',
          publishedAt: new Date(),
          sourceId: testSourceId,
          qualityScore: 0
        }
      });

      // 処理対象を確認
      const targetArticles = await prisma.article.findMany({
        where: {
          sourceId: testSourceId,
          OR: [
            { qualityScore: null },
            { qualityScore: 0 }
          ]
        }
      });

      expect(targetArticles.length).toBeGreaterThan(0);
      expect(targetArticles.some(a => a.id === article.id)).toBe(true);

      // クリーンアップ
      await prisma.article.delete({ where: { id: article.id } });
    });
  });

  describe('難易度の差分処理', () => {
    it('難易度未設定の記事を処理対象とする', async () => {
      const articleWithDifficulty = await prisma.article.create({
        data: {
          title: 'Article with Difficulty',
          url: 'https://with-difficulty.example.com',
          publishedAt: new Date(),
          sourceId: testSourceId,
          difficulty: 'intermediate'
        }
      });

      const articleWithoutDifficulty = await prisma.article.create({
        data: {
          title: 'Article without Difficulty',
          url: 'https://without-difficulty.example.com',
          publishedAt: new Date(),
          sourceId: testSourceId,
          difficulty: null
        }
      });

      // 処理対象を確認
      const targetArticles = await prisma.article.findMany({
        where: {
          sourceId: testSourceId,
          difficulty: null
        }
      });

      expect(targetArticles.length).toBe(1);
      expect(targetArticles[0].id).toBe(articleWithoutDifficulty.id);

      // クリーンアップ
      await prisma.article.delete({ where: { id: articleWithDifficulty.id } });
      await prisma.article.delete({ where: { id: articleWithoutDifficulty.id } });
    });
  });

  describe('ProcessingLogの統合テスト', () => {
    it('処理状態が正しく記録される', async () => {
      const processName = 'test-integration-process';

      // 初回処理を記録
      await prisma.processingLog.upsert({
        where: { processName },
        update: {
          lastProcessedAt: new Date(),
          processedCount: 10,
          status: 'success',
          updatedAt: new Date()
        },
        create: {
          processName,
          lastProcessedAt: new Date(),
          processedCount: 10,
          status: 'success'
        }
      });

      // 記録を確認
      const log = await prisma.processingLog.findUnique({
        where: { processName }
      });

      expect(log).toBeTruthy();
      expect(log?.processedCount).toBe(10);
      expect(log?.status).toBe('success');

      // クリーンアップ
      await prisma.processingLog.delete({ where: { processName } });
    });
  });
});