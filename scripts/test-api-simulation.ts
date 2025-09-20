/**
 * Simulate API DataLoader Integration
 * codex推奨: API動作のシミュレーションテスト
 */

import { prisma } from '@/lib/prisma';
import { createLoaders } from '@/lib/dataloader';
import logger from '@/lib/logger';

async function simulateApiCall() {
  try {
    // 1. Simulate authenticated user
    const userId = 'cmefp5z2m0001tem5epun8j6q';
    logger.info(`Simulating API call for user: ${userId}`);

    // 2. Fetch articles (like the API does)
    const articles = await prisma.article.findMany({
      select: {
        id: true,
        title: true,
        url: true,
        summary: true,
        thumbnail: true,
        publishedAt: true,
        sourceId: true,
        source: {
          select: {
            id: true,
            name: true,
            type: true,
            url: true,
          }
        },
        category: true,
        qualityScore: true,
        bookmarks: true,
        userVotes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: 5,
    });

    logger.info(`Fetched ${articles.length} articles from database`);

    // 3. Create DataLoader instances (like the API does)
    const loaders = createLoaders({ userId });

    if (loaders.favorite && loaders.view) {
      const articleIds = articles.map(a => a.id);

      // 4. Fetch user-specific data using DataLoaders
      console.time('DataLoader batch fetch');
      const [favoriteStatuses, viewStatuses] = await Promise.all([
        loaders.favorite.loadMany(articleIds),
        loaders.view.loadMany(articleIds)
      ]);
      console.timeEnd('DataLoader batch fetch');

      // 5. Create maps for O(1) lookup (like the API does)
      const favoritesMap = new Map<string, boolean>();
      const readStatusMap = new Map<string, boolean>();

      favoriteStatuses.forEach((status) => {
        if (status && typeof status === 'object' && 'isFavorited' in status) {
          favoritesMap.set(status.articleId, status.isFavorited);
        }
      });

      viewStatuses.forEach((status) => {
        if (status && typeof status === 'object' && 'isRead' in status) {
          readStatusMap.set(status.articleId, status.isRead);
        }
      });

      logger.info(`Created maps: favorites=${favoritesMap.size}, reads=${readStatusMap.size}`);

      // 6. Add user data to articles (like the API does)
      const enrichedArticles = articles.map(article => ({
        ...article,
        isFavorited: favoritesMap.get(article.id) || false,
        isRead: readStatusMap.get(article.id) || false,
      }));

      // 7. Display results
      logger.info('API simulation results:');
      enrichedArticles.forEach((article, index) => {
        console.log(
          `  ${index + 1}. ${article.isFavorited ? '❤️' : '○'} ${article.isRead ? '✓' : '○'} ${article.title.substring(0, 60)}...`
        );
      });

      // 8. Test cache performance (second call should be faster)
      console.time('DataLoader batch fetch (cached)');
      await Promise.all([
        loaders.favorite.loadMany(articleIds),
        loaders.view.loadMany(articleIds)
      ]);
      console.timeEnd('DataLoader batch fetch (cached)');

      logger.info('✅ API simulation completed successfully');

      // 9. Display cache statistics
      const { getFavoriteLoaderStats } = await import('@/lib/dataloader/favorite-loader');
      const { getViewLoaderStats } = await import('@/lib/dataloader/article-view-loader');

      console.log('\nCache Statistics:');
      console.log('Favorite:', getFavoriteLoaderStats());
      console.log('View:', getViewLoaderStats());

    } else {
      logger.error('DataLoaders not created');
    }

  } catch (error) {
    logger.error('Simulation failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

simulateApiCall();