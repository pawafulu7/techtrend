/**
 * Test API DataLoader Integration
 * codex推奨: APIエンドポイント経由での統合テスト
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

// Mock auth to return test user
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn().mockResolvedValue({
    user: {
      id: 'cmefp5z2m0001tem5epun8j6q',
      email: 'test-view-1755435824112@example.com'
    }
  })
}));

async function testApiDataLoader() {
  try {
    // Dynamic import to get mocked version
    const { GET } = await import('@/app/api/articles/list/route');

    // Create test request with includeUserData
    const request = new NextRequest('http://localhost:3000/api/articles/list?page=1&limit=5&includeUserData=true');

    // Call the GET handler
    const response = await GET(request);
    const data = await response.json();

    if (data.success) {
      logger.info('API response successful');

      const items = data.data.items;
      logger.info(`Fetched ${items.length} articles`);

      // Check if user data is included
      const hasUserData = items.some((item: any) =>
        item.isFavorited !== undefined && item.isRead !== undefined
      );

      if (hasUserData) {
        logger.info('✅ User data successfully included via DataLoader');
        items.slice(0, 3).forEach((item: any, index: number) => {
          console.log(`  Article ${index + 1}: ${item.isFavorited ? '❤️' : '○'} ${item.isRead ? '✓' : '○'} ${item.title.substring(0, 50)}...`);
        });
      } else {
        logger.warn('⚠️  User data not included in response');
      }

      // Check cache headers
      const cacheStatus = response.headers.get('X-Cache-Status');
      const responseTime = response.headers.get('X-Response-Time');
      logger.info(`Cache: ${cacheStatus}, Response time: ${responseTime}`);

    } else {
      logger.error('API request failed:', data);
    }

  } catch (error) {
    logger.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testApiDataLoader();