import { createPrismaClient } from '@/lib/prisma/create-client';
import {
  getLastProcessedTime,
  saveProcessingStatus,
  shouldProcess,
  hasUpdatedArticlesSince
} from '../../../scripts/utils/processing-status';

const prisma = createPrismaClient({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres_dev_password@localhost:5434/techtrend_test',
});

describe('ProcessingStatus', () => {
  const testProcessName = 'test-process';

  beforeAll(async () => {
    // データベース接続を確認
    await prisma.$connect();
  });

  beforeEach(async () => {
    // テスト用のProcessingLogをクリア
    await prisma.processingLog.deleteMany({
      where: { processName: testProcessName }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getLastProcessedTime', () => {
    it('初回実行時はnullを返す', async () => {
      const result = await getLastProcessedTime(testProcessName);
      expect(result).toBeNull();
    });

    it('処理記録がある場合は最終処理時刻を返す', async () => {
      const now = new Date();
      await prisma.processingLog.create({
        data: {
          processName: testProcessName,
          lastProcessedAt: now,
          processedCount: 10
        }
      });

      const result = await getLastProcessedTime(testProcessName);
      expect(result).toEqual(now);
    });
  });

  describe('saveProcessingStatus', () => {
    it('初回実行時は新規作成', async () => {
      await saveProcessingStatus(testProcessName, 5, 'success');

      const log = await prisma.processingLog.findUnique({
        where: { processName: testProcessName }
      });

      expect(log).toBeTruthy();
      expect(log?.processedCount).toBe(5);
      expect(log?.status).toBe('success');
    });

    it('2回目以降は更新', async () => {
      // 初回
      await saveProcessingStatus(testProcessName, 5, 'success');

      // 2回目
      await saveProcessingStatus(testProcessName, 10, 'partial', {
        errorCount: 2
      });

      const log = await prisma.processingLog.findUnique({
        where: { processName: testProcessName }
      });

      expect(log?.processedCount).toBe(10);
      expect(log?.status).toBe('partial');
      expect(log?.metadata).toEqual({ errorCount: 2 });
    });
  });

  describe('shouldProcess', () => {
    it('初回実行時はtrueを返す', async () => {
      const result = await shouldProcess(testProcessName);
      expect(result).toBe(true);
    });

    it('インターバル経過前はfalseを返す', async () => {
      const now = new Date();
      await prisma.processingLog.create({
        data: {
          processName: testProcessName,
          lastProcessedAt: now,
          processedCount: 10
        }
      });

      const result = await shouldProcess(testProcessName, 1);
      expect(result).toBe(false);
    });

    it('インターバル経過後はtrueを返す', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await prisma.processingLog.create({
        data: {
          processName: testProcessName,
          lastProcessedAt: twoHoursAgo,
          processedCount: 10
        }
      });

      const result = await shouldProcess(testProcessName, 1);
      expect(result).toBe(true);
    });
  });

  describe('hasUpdatedArticlesSince', () => {
    it('初回実行時はtrueを返す', async () => {
      const result = await hasUpdatedArticlesSince(testProcessName);
      expect(result).toBe(true);
    });

    it('更新された記事がない場合はfalseを返す', async () => {
      const now = new Date();
      await prisma.processingLog.create({
        data: {
          processName: testProcessName,
          lastProcessedAt: now,
          processedCount: 10
        }
      });

      const result = await hasUpdatedArticlesSince(testProcessName);
      expect(result).toBe(false);
    });
  });
});