/**
 * Test DataLoader Integration
 * codex推奨: API統合テストによる動作確認
 */

import { prisma } from '@/lib/prisma';
import { createLoaders } from '@/lib/dataloader';
import logger from '@/lib/logger';

async function testDataLoaderIntegration() {
  try {
    // 1. Get test user
    const user = await prisma.user.findFirst({
      where: {
        email: 'test-view-1755435824112@example.com'
      }
    });

    if (!user) {
      throw new Error('Test user not found');
    }

    logger.info(`Testing with user: ${user.id}`);

    // 2. Get some articles
    const articles = await prisma.article.findMany({
      take: 5,
      orderBy: { publishedAt: 'desc' },
      select: { id: true, title: true }
    });

    logger.info(`Found ${articles.length} articles to test`);

    // 3. Create some test data
    // Add a favorite
    await prisma.favorite.upsert({
      where: {
        userId_articleId: {
          userId: user.id,
          articleId: articles[0].id
        }
      },
      update: {},
      create: {
        userId: user.id,
        articleId: articles[0].id
      }
    });

    // Add a view with read status
    await prisma.articleView.upsert({
      where: {
        userId_articleId: {
          userId: user.id,
          articleId: articles[1].id
        }
      },
      update: {
        isRead: true,
        readAt: new Date()
      },
      create: {
        userId: user.id,
        articleId: articles[1].id,
        isRead: true,
        readAt: new Date(),
        viewedAt: new Date()
      }
    });

    logger.info('Test data created');

    // 4. Test DataLoaders
    const loaders = createLoaders({ userId: user.id });

    if (!loaders.favorite || !loaders.view) {
      throw new Error('DataLoaders not created properly');
    }

    // 5. Test batch loading
    const articleIds = articles.map(a => a.id);

    console.time('DataLoader fetch');
    const [favoriteStatuses, viewStatuses] = await Promise.all([
      loaders.favorite.loadMany(articleIds),
      loaders.view.loadMany(articleIds)
    ]);
    console.timeEnd('DataLoader fetch');

    // 6. Verify results
    logger.info('Favorite results:');
    favoriteStatuses.forEach((status, index) => {
      if (status && typeof status === 'object' && 'isFavorited' in status) {
        console.log(`  Article ${index}: ${status.isFavorited ? '❤️' : '○'} (${status.articleId.substring(0, 8)}...)`);
      }
    });

    logger.info('View/Read results:');
    viewStatuses.forEach((status, index) => {
      if (status && typeof status === 'object' && 'isRead' in status) {
        console.log(`  Article ${index}: ${status.isRead ? '✓' : '○'} viewed=${status.isViewed} (${status.articleId.substring(0, 8)}...)`);
      }
    });

    // 7. Test cache performance (second fetch should be faster)
    console.time('DataLoader fetch (cached)');
    const [cachedFavorites, cachedViews] = await Promise.all([
      loaders.favorite.loadMany(articleIds),
      loaders.view.loadMany(articleIds)
    ]);
    console.timeEnd('DataLoader fetch (cached)');

    logger.info('✅ DataLoader integration test completed successfully');

    // 8. Get cache statistics
    const { getFavoriteLoaderStats } = await import('@/lib/dataloader/favorite-loader');
    const { getViewLoaderStats } = await import('@/lib/dataloader/article-view-loader');

    const favStats = getFavoriteLoaderStats();
    const viewStats = getViewLoaderStats();

    logger.info('Cache statistics:');
    console.log('Favorite loader:', favStats);
    console.log('View loader:', viewStats);

  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDataLoaderIntegration();