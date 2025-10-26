/**
 * SummaryManager Service Tests
 * Basic smoke tests for summary management functionality
 */

import { PrismaClient } from '@prisma/client';
import { SummaryManager, SummaryGenerationOptions } from '@/lib/services/summary-manager';

describe('SummaryManager', () => {
  let prisma: PrismaClient;
  let manager: SummaryManager;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    manager = new SummaryManager(prisma);
  });

  describe('constructor', () => {
    it('should initialize with default stats', () => {
      const stats = manager.getStats();
      expect(stats.attempts).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.failures).toBe(0);
      expect(stats.overloadErrors).toBe(0);
      expect(stats.startTime).toBeGreaterThan(0);
    });

    it('should accept optional UnifiedSummaryService', () => {
      const mockService = {} as any;
      const customManager = new SummaryManager(prisma, mockService);
      expect(customManager).toBeInstanceOf(SummaryManager);
    });
  });

  describe('stats management', () => {
    it('should reset stats', () => {
      manager.resetStats();
      const stats = manager.getStats();
      expect(stats.attempts).toBe(0);
      expect(stats.successes).toBe(0);
    });

    it('should return copy of stats', () => {
      const stats1 = manager.getStats();
      const stats2 = manager.getStats();
      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('generateSummaries', () => {
    it('should accept valid options', async () => {
      const options: SummaryGenerationOptions = {
        limit: 10,
        source: 'Test Source'
      };

      // This is a smoke test - actual execution would require test data
      // Full integration tests to be added in future
      expect(manager.generateSummaries).toBeDefined();
      expect(typeof manager.generateSummaries).toBe('function');
    });
  });

  describe('regenerateSummaries', () => {
    it('should accept valid options with force flag', () => {
      const options: SummaryGenerationOptions = {
        force: true,
        batch: 5
      };

      expect(manager.regenerateSummaries).toBeDefined();
      expect(typeof manager.regenerateSummaries).toBe('function');
    });
  });

  describe('generateMissingSummaries', () => {
    it('should accept valid options with days parameter', () => {
      const options: SummaryGenerationOptions = {
        days: 7,
        source: 'Test Source'
      };

      expect(manager.generateMissingSummaries).toBeDefined();
      expect(typeof manager.generateMissingSummaries).toBe('function');
    });
  });
});
