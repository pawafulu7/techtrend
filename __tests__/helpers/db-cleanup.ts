import { PrismaClient } from '@prisma/client';

/**
 * データベースの全データを削除
 */
export async function cleanupDatabase(prisma: PrismaClient) {
  // トランザクションで全データを削除
  // 削除順序は参照整合性を考慮
  await prisma.$transaction([
    // 中間テーブルから削除
    prisma.$executeRawUnsafe('DELETE FROM "_ArticleToTag"'),
    // メインテーブルを削除
    prisma.article.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.source.deleteMany(),
  ]);
}

/**
 * データベースをリセット（全データ削除）
 */
export async function resetDatabase(prisma: PrismaClient) {
  await cleanupDatabase(prisma);
}

/**
 * テスト用のソースを作成
 */
export async function createTestSource(prisma: PrismaClient, data?: Partial<any>) {
  return prisma.source.create({
    data: {
      id: data?.id || 'test-source',
      name: data?.name || 'Test Source',
      type: data?.type || 'test',
      url: data?.url || 'https://test.example.com',
      enabled: data?.enabled ?? true,
      ...data,
    },
  });
}

/**
 * テスト用の記事を作成
 */
export async function createTestArticle(prisma: PrismaClient, sourceId: string, data?: Partial<any>) {
  return prisma.article.create({
    data: {
      title: data?.title || 'Test Article',
      url: data?.url || `https://test.example.com/article-${Date.now()}`,
      summary: data?.summary || 'Test summary',
      publishedAt: data?.publishedAt || new Date(),
      sourceId: sourceId,
      ...data,
    },
  });
}