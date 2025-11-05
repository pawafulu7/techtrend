import { GoldenSetRegressionTester } from '@/lib/ai/testing/regression-tester';
import type { GoldenExample } from '@/lib/ai/testing/types';

jest.mock('@/lib/ai/testing/golden-set-loader', () => ({
  loadGoldenExamples: jest.fn().mockResolvedValue([
    {
      id: 'test-001',
      article: {
        title: 'Test Article',
        content: 'Test content for regression testing.',
        url: 'https://example.com/test',
      },
      expectedOutput: {
        summary: 'Test summary',
        detailedSummary: 'Detailed test summary',
        tags: ['Testing', 'AI'],
      },
      metadata: {
        category: 'general',
        difficulty: 'easy',
        categoryConfidence: 0.9,
        needsHumanReview: false,
        categoryReason: 'Test data',
        createdAt: '2025-11-05T00:00:00.000Z',
        updatedAt: '2025-11-05T00:00:00.000Z',
      },
      acceptanceThreshold: {
        semanticSimilarity: 0.95,
        minimumQuality: 0.9,
      },
      sourceArticleId: 'source-001',
    },
  ]),
  loadGoldenMetadata: jest.fn().mockResolvedValue({
    version: '1.0.0',
    createdAt: '2025-11-05T00:00:00.000Z',
    totalExamples: 1,
    categoryDistribution: {
      general: 1,
      technical: 0,
      thin_content: 0,
      multilingual: 0,
    },
    qualityScoreRange: {
      min: 90,
      max: 100,
      avg: 95,
    },
    thresholdCalibration: {
      percentile95: 0.95,
      byCategory: {},
    },
  }),
}));

jest.mock('@/lib/di/bootstrap', () => ({
  buildAppDependencies: jest.fn().mockReturnValue({
    service: {
      generateSummary: jest.fn().mockResolvedValue({
        summary: 'Test summary',
        detailedSummary: 'Detailed test summary',
        tags: ['Testing', 'AI'],
        qualityScore: 0.95,
      }),
    },
  }),
}));

jest.mock('@/lib/rag/embedding-service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    embedText: jest.fn().mockResolvedValue(Array(1536).fill(0.1)),
  })),
}));

describe('GoldenSetRegressionTester', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should run regression test', async () => {
    const tester = new GoldenSetRegressionTester({ limit: 1 });
    const report = await tester.runRegression();

    expect(report.totalExamples).toBe(1);
    expect(report.passed).toBeGreaterThanOrEqual(0);
    expect(report.failed).toBeGreaterThanOrEqual(0);
    expect(report.passRate).toBeGreaterThanOrEqual(0);
    expect(report.passRate).toBeLessThanOrEqual(100);
    expect(report.goldenSetVersion).toBe('1.0.0');
  });

  it('should generate markdown report', () => {
    const tester = new GoldenSetRegressionTester();
    const mockReport = {
      runId: 'test-run',
      timestamp: new Date().toISOString(),
      goldenSetVersion: '1.0.0',
      totalExamples: 1,
      passed: 1,
      failed: 0,
      passRate: 100,
      results: [],
      statistics: {
        byCategory: {},
        similarityDistribution: {
          p50: 0.96,
          p75: 0.97,
          p90: 0.98,
          p95: 0.99,
          p99: 0.99,
        },
      },
      degradations: [],
    };

    const markdown = tester.generateMarkdownReport(mockReport);
    expect(markdown).toContain('# AI Golden Set Regression Test Report');
    expect(markdown).toContain('Run ID: test-run');
    expect(markdown).toContain('Passed: 1');
  });

  it('should handle parallel execution', async () => {
    const tester = new GoldenSetRegressionTester({ parallel: true, concurrency: 2 });
    const report = await tester.runRegression();

    expect(report.totalExamples).toBe(1);
  });

  it('should handle sequential execution', async () => {
    const tester = new GoldenSetRegressionTester({ parallel: false });
    const report = await tester.runRegression();

    expect(report.totalExamples).toBe(1);
  });

  it('should calculate category statistics', async () => {
    const tester = new GoldenSetRegressionTester();
    const report = await tester.runRegression();

    expect(report.statistics.byCategory).toBeDefined();
    expect(report.statistics.similarityDistribution).toBeDefined();
  });
});
