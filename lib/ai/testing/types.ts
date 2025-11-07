export interface GoldenExample {
  id: string;
  article: {
    title: string;
    content: string;
    url: string;
  };
  expectedOutput: {
    summary: string;
    detailedSummary: string;
    tags: string[];
  };
  metadata: {
    category: 'general' | 'technical' | 'thin_content' | 'multilingual';
    difficulty: 'easy' | 'medium' | 'hard';
    categoryConfidence: number;
    needsHumanReview: boolean;
    categoryReason: string;
    createdAt: string;
    updatedAt: string;
  };
  acceptanceThreshold: {
    semanticSimilarity: number;
    minimumQuality: number;
  };
  sourceArticleId: string;
}

export interface GoldenSetMetadata {
  version: string;
  createdAt: string;
  totalExamples: number;
  categoryDistribution: {
    general: number;
    technical: number;
    thin_content: number;
    multilingual: number;
  };
  qualityScoreRange: {
    min: number;
    max: number;
    avg: number;
  };
  thresholdCalibration: {
    percentile95: number;
    byCategory: {
      [key: string]: number;
    };
  };
}

export interface RegressionResult {
  exampleId: string;
  passed: boolean;
  semanticSimilarity: number;
  qualityScore: number;
  issues: string[];
  actualOutput: {
    summary: string;
    detailedSummary: string;
    tags: string[];
  };
  metadata: {
    category: string;
    difficulty: string;
    executionTimeMs: number;
    wallClockExecutionTimeMs?: number;
  };
}

export interface RegressionReport {
  runId: string;
  timestamp: string;
  goldenSetVersion: string;
  totalExamples: number;
  passed: number;
  failed: number;
  passRate: number;
  results: RegressionResult[];
  statistics: {
    byCategory: {
      [key: string]: {
        total: number;
        passed: number;
        avgSimilarity: number;
      };
    };
    similarityDistribution: {
      p50: number;
      p75: number;
      p90: number;
      p95: number;
      p99: number;
    };
  };
  degradations: RegressionResult[];
}
