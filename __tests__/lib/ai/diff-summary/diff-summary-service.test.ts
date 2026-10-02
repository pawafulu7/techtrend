import {
  DiffSummaryService,
  getISOWeek,
  getPreviousISOWeek,
  getWeekDateRange,
  resetDiffSummaryService,
} from '@/lib/ai/diff-summary/diff-summary-service';
import { LLMExtractionPipeline } from '@/lib/ai/extraction/llm-extraction-pipeline';

// Mock dependencies
jest.mock('@/lib/ai/extraction/llm-extraction-pipeline', () => ({
  LLMExtractionPipeline: jest.fn(),
  getLLMExtractionPipeline: jest.fn(() => ({
    extract: jest.fn(),
    getModelVersion: jest.fn(() => 'gemini-2.5-flash-lite'),
  })),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
    },
    diffSummary: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Diff Summary Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDiffSummaryService();
  });

  describe('getISOWeek', () => {
    it('should return correct ISO week for a date', () => {
      // January 4, 2026 is in week 1
      const date = new Date('2026-01-04T00:00:00Z');
      expect(getISOWeek(date)).toBe('2026-W01');
    });

    it('should handle end of year correctly', () => {
      // December 28, 2025 is in the last week of 2025
      const date = new Date('2025-12-28T00:00:00Z');
      const result = getISOWeek(date);
      expect(result).toMatch(/^2025-W5[12]$|^2026-W0[01]$/);
    });

    it('should pad single digit weeks', () => {
      const date = new Date('2026-01-10T00:00:00Z');
      const result = getISOWeek(date);
      expect(result).toMatch(/^2026-W0\d$/);
    });
  });

  describe('getPreviousISOWeek', () => {
    it('should return previous week', () => {
      expect(getPreviousISOWeek('2026-W02')).toBe('2026-W01');
      expect(getPreviousISOWeek('2026-W10')).toBe('2026-W09');
    });

    it('should handle year boundary', () => {
      // Week 1 of 2026 should go back to the last week of 2025
      const result = getPreviousISOWeek('2026-W01');
      expect(result).toMatch(/^2025-W5[012]$/);
    });

    it('should throw on invalid format', () => {
      expect(() => getPreviousISOWeek('invalid')).toThrow(
        'Invalid ISO week format'
      );
    });
  });

  describe('getWeekDateRange', () => {
    it('should return valid date range for a week', () => {
      const { start, end } = getWeekDateRange('2026-W01');

      expect(start instanceof Date).toBe(true);
      expect(end instanceof Date).toBe(true);
      expect(end.getTime()).toBeGreaterThan(start.getTime());
    });

    it('should return 7 day range', () => {
      const { start, end } = getWeekDateRange('2026-W01');

      const diffMs = end.getTime() - start.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // Should be close to 7 days (approximately 6.999... due to time)
      expect(diffDays).toBeGreaterThanOrEqual(6);
      expect(diffDays).toBeLessThan(8);
    });

    it('should throw on invalid format', () => {
      expect(() => getWeekDateRange('invalid')).toThrow(
        'Invalid ISO week format'
      );
    });
  });

  describe('DiffSummaryService', () => {
    it('should be constructable with default options', () => {
      const service = new DiffSummaryService();
      expect(service).toBeDefined();
    });

    it('should accept custom options', () => {
      const mockPipeline = {
        extract: jest.fn(),
        getModelVersion: jest.fn(() => 'custom-model'),
      } as unknown as LLMExtractionPipeline;

      const mockPrisma = {} as any;

      const service = new DiffSummaryService({
        pipeline: mockPipeline,
        prisma: mockPrisma,
        concurrency: 5,
      });

      expect(service).toBeDefined();
    });
  });

  describe('期間のトピック集計（issue #655 項目 5）', () => {
    const articles = [
      { id: 'a1', title: 'T1', tags: [{ name: 'js' }, { name: 'JavaScript' }] },
      { id: 'a2', title: 'T2', tags: [{ name: 'JavaScript' }] },
      { id: 'a3', title: 'T3', tags: [{ name: 'Spring' }] },
      { id: 'a4', title: 'T4', tags: [{ name: 'Spring Boot' }] },
      { id: 'a5', title: 'T5', tags: [{ name: 'claude code' }] },
      { id: 'a6', title: 'T6', tags: [{ name: 'Claude Code' }] },
      { id: 'a7', title: 'T7', tags: [{ name: 'Claude Code' }] },
    ];

    const collect = async () => {
      const prisma = { article: { findMany: jest.fn().mockResolvedValue(articles) } };
      const service = new DiffSummaryService({
        pipeline: {} as unknown as LLMExtractionPipeline,
        prisma: prisma as never,
      });
      return (
        service as unknown as {
          getTopicsForPeriod: (
            slug: string,
            week: string
          ) => Promise<Array<{ topic: string; count: number; articleIds: string[] }>>;
        }
      ).getTopicsForPeriod('foreign', '2026-W39');
    };

    it('トピック名は小文字のキーではなく正式名で、同義語は記事単位で数える', async () => {
      const topics = await collect();
      const byTopic = Object.fromEntries(topics.map((t) => [t.topic, t]));

      // a1 の js と JavaScript は 1 記事として数える
      expect(byTopic['JavaScript'].count).toBe(2);
      expect(byTopic['JavaScript'].articleIds).toEqual(['a1', 'a2']);
      // マップに無い大文字小文字の違いは記事数の多い表記
      expect(byTopic['Claude Code'].count).toBe(3);
      expect(topics.map((t) => t.topic)).not.toContain('javascript');
    });

    it('表記の記事数が同じなら、DB の返す順によらず同じ表示名', async () => {
      const tie = async (order: string[]) => {
        const prisma = {
          article: {
            findMany: jest.fn().mockResolvedValue(
              order.map((name, i) => ({ id: `t${i}`, title: name, tags: [{ name }] }))
            ),
          },
        };
        const service = new DiffSummaryService({
          pipeline: {} as unknown as LLMExtractionPipeline,
          prisma: prisma as never,
        });
        const topics = await (
          service as unknown as {
            getTopicsForPeriod: (s: string, w: string) => Promise<Array<{ topic: string }>>;
          }
        ).getTopicsForPeriod('foreign', '2026-W39');
        return topics.map((t) => t.topic);
      };

      expect(await tie(['Claude code', 'Claude Code'])).toEqual(['Claude Code']);
      expect(await tie(['Claude Code', 'Claude code'])).toEqual(['Claude Code']);
    });

    it('Spring と Spring Boot は別トピック', async () => {
      const topics = await collect();
      const names = topics.map((t) => t.topic);
      expect(names).toContain('Spring');
      expect(names).toContain('Spring Boot');
    });
  });
});
