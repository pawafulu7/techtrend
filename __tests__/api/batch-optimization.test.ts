import { batchGetFavorites, batchGetViews, batchGetUserStates, batchGetDetailedFavorites, batchGetDetailedViews } from '@/lib/batch/batch-utils';
import { BatchProcessor, ArticleBatchProcessor, QueryBatchProcessor } from '@/lib/batch/batch-processor';
import { prisma } from '@/lib/prisma';

describe('Batch Optimization Tests', () => {
  const userId = 'test-user-123';
  const articleIds = ['article-1', 'article-2', 'article-3', 'article-4', 'article-5'];

  describe('batch-utils functions', () => {
    describe('batchGetFavorites', () => {
      it('should return boolean array for favorite status', async () => {
        const findManySpy = jest.spyOn(prisma.favorite, 'findMany');
        findManySpy.mockResolvedValue([
          { id: '1', userId, articleId: articleIds[0], createdAt: new Date() },
          { id: '2', userId, articleId: articleIds[2], createdAt: new Date() }
        ]);

        const results = await batchGetFavorites(userId, articleIds);

        expect(results).toEqual([true, false, true, false, false]);
        expect(findManySpy).toHaveBeenCalledTimes(1);
        expect(findManySpy).toHaveBeenCalledWith({
          where: {
            userId,
            articleId: { in: articleIds }
          },
          select: { articleId: true }
        });

        findManySpy.mockRestore();
      });

      it('should handle empty article IDs', async () => {
        const results = await batchGetFavorites(userId, []);
        expect(results).toEqual([]);
      });
    });

    describe('batchGetViews', () => {
      it('should return boolean array for view status', async () => {
        const findManySpy = jest.spyOn(prisma.articleView, 'findMany');
        findManySpy.mockResolvedValue([
          {
            id: '1',
            userId,
            articleId: articleIds[1],
            isRead: true,
            viewedAt: new Date(),
            readAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]);

        const results = await batchGetViews(userId, articleIds);

        expect(results).toEqual([false, true, false, false, false]);
        expect(findManySpy).toHaveBeenCalledTimes(1);
        expect(findManySpy).toHaveBeenCalledWith({
          where: {
            userId,
            articleId: { in: articleIds },
            isRead: true
          },
          select: { articleId: true }
        });

        findManySpy.mockRestore();
      });
    });

    describe('batchGetUserStates', () => {
      it('should fetch favorites and views in parallel', async () => {
        const favoriteSpy = jest.spyOn(prisma.favorite, 'findMany');
        favoriteSpy.mockResolvedValue([
          { id: '1', userId, articleId: articleIds[0], createdAt: new Date() }
        ]);

        const viewSpy = jest.spyOn(prisma.articleView, 'findMany');
        viewSpy.mockResolvedValue([
          {
            id: '1',
            userId,
            articleId: articleIds[1],
            isRead: true,
            viewedAt: new Date(),
            readAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]);

        const { favorites, views } = await batchGetUserStates(userId, articleIds);

        expect(favorites.size).toBe(1);
        expect(favorites.has(articleIds[0])).toBe(true);
        expect(views.size).toBe(1);
        expect(views.has(articleIds[1])).toBe(true);

        // Verify parallel execution
        expect(favoriteSpy).toHaveBeenCalledTimes(1);
        expect(viewSpy).toHaveBeenCalledTimes(1);

        favoriteSpy.mockRestore();
        viewSpy.mockRestore();
      });
    });
  });

  describe('BatchProcessor', () => {
    it('should process items in batches', async () => {
      const items = Array.from({ length: 250 }, (_, i) => `item-${i}`);
      const processor = new BatchProcessor<string>({ batchSize: 100 });

      const processFunction = jest.fn().mockResolvedValue('processed');

      const results = await processor.process(items, processFunction);

      // Should be called 3 times (100, 100, 50)
      expect(processFunction).toHaveBeenCalledTimes(3);
      expect(processFunction).toHaveBeenNthCalledWith(1, items.slice(0, 100));
      expect(processFunction).toHaveBeenNthCalledWith(2, items.slice(100, 200));
      expect(processFunction).toHaveBeenNthCalledWith(3, items.slice(200, 250));
      expect(results).toHaveLength(3);
    });

    it('should handle errors with retry', async () => {
      const processor = new BatchProcessor<string>({
        maxRetries: 2,
        retryDelay: 10
      });

      let attempts = 0;
      const processFunction = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts <= 2) {
          throw new Error('Temporary error');
        }
        return 'success';
      });

      const results = await processor.process(['item-1'], processFunction);

      expect(attempts).toBe(3); // Initial + 2 retries
      expect(results).toEqual(['success']);
    });

    it('should call progress callback', async () => {
      const onProgress = jest.fn();
      const processor = new BatchProcessor<string>({
        batchSize: 2,
        onProgress
      });

      const items = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'];
      await processor.process(items, async () => 'processed');

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, 2, 5);
      expect(onProgress).toHaveBeenNthCalledWith(2, 4, 5);
      expect(onProgress).toHaveBeenNthCalledWith(3, 5, 5);
    });

    describe('parallel processing', () => {
      it('should process batches in parallel', async () => {
        const processor = new BatchProcessor<string>({ batchSize: 100 });
        const items = Array.from({ length: 300 }, (_, i) => `item-${i}`);

        let processingOrder: number[] = [];
        const processFunction = jest.fn().mockImplementation(async (batch: string[]) => {
          const batchNumber = Math.floor(parseInt(batch[0].split('-')[1]) / 100);
          processingOrder.push(batchNumber);
          // Simulate varying processing times
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
          return `batch-${batchNumber}`;
        });

        const results = await processor.processParallel(items, processFunction, 3);

        expect(processFunction).toHaveBeenCalledTimes(3);
        expect(results).toHaveLength(3);
        // All batches should be processed (order may vary due to parallel execution)
        expect(processingOrder.sort()).toEqual([0, 1, 2]);
      });
    });
  });

  describe('ArticleBatchProcessor', () => {
    it('should batch update favorites', async () => {
      const processor = new ArticleBatchProcessor({ batchSize: 2 });
      const createManySpy = jest.spyOn(prisma.favorite, 'createMany');
      createManySpy.mockResolvedValue({ count: 2 });

      await processor.batchUpdateFavorites(userId, articleIds, true);

      // Should be called 3 times (2, 2, 1)
      expect(createManySpy).toHaveBeenCalledTimes(3);
      expect(createManySpy).toHaveBeenNthCalledWith(1, {
        data: [
          { userId, articleId: articleIds[0] },
          { userId, articleId: articleIds[1] }
        ],
        skipDuplicates: true
      });

      createManySpy.mockRestore();
    });

    it('should batch delete favorites', async () => {
      const processor = new ArticleBatchProcessor({ batchSize: 2 });
      const deleteManySpy = jest.spyOn(prisma.favorite, 'deleteMany');
      deleteManySpy.mockResolvedValue({ count: 2 });

      await processor.batchUpdateFavorites(userId, articleIds, false);

      expect(deleteManySpy).toHaveBeenCalledTimes(3);
      expect(deleteManySpy).toHaveBeenNthCalledWith(1, {
        where: {
          userId,
          articleId: { in: [articleIds[0], articleIds[1]] }
        }
      });

      deleteManySpy.mockRestore();
    });

    it('should batch update read status', async () => {
      const processor = new ArticleBatchProcessor({ batchSize: 2 });
      const transactionSpy = jest.spyOn(prisma, '$transaction');
      transactionSpy.mockResolvedValue([]);

      const upsertSpy = jest.spyOn(prisma.articleView, 'upsert');
      upsertSpy.mockResolvedValue({
        id: '1',
        userId,
        articleId: articleIds[0],
        isRead: true,
        viewedAt: null,
        readAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await processor.batchUpdateReadStatus(userId, articleIds, true);

      // Transaction should be called for each batch
      expect(transactionSpy).toHaveBeenCalledTimes(3);

      transactionSpy.mockRestore();
      upsertSpy.mockRestore();
    });
  });

  describe('QueryBatchProcessor', () => {
    it('should execute queries in batches', async () => {
      const transactionSpy = jest.spyOn(prisma, '$transaction');
      transactionSpy.mockResolvedValue([]);

      const queries = Array.from({ length: 250 }, (_, i) =>
        prisma.article.findUnique({ where: { id: `article-${i}` } })
      );

      await QueryBatchProcessor.executeQueries(queries, 100);

      // Should be called 3 times (100, 100, 50)
      expect(transactionSpy).toHaveBeenCalledTimes(3);

      transactionSpy.mockRestore();
    });

    it('should execute conditional queries', async () => {
      const transactionSpy = jest.spyOn(prisma, '$transaction');
      transactionSpy.mockResolvedValue([]);

      const items = [
        {
          condition: true,
          query: prisma.article.findUnique({ where: { id: '1' } })
        },
        {
          condition: false,
          query: prisma.article.findUnique({ where: { id: '2' } })
        },
        {
          condition: true,
          query: prisma.article.findUnique({ where: { id: '3' } })
        }
      ];

      await QueryBatchProcessor.executeConditionalQueries(items);

      // Only queries with condition=true should be executed
      expect(transactionSpy).toHaveBeenCalledTimes(1);
      expect(transactionSpy).toHaveBeenCalledWith([items[0].query, items[2].query]);

      transactionSpy.mockRestore();
    });
  });
});