import { v4 as uuidv4 } from 'uuid';
import { performance } from 'node:perf_hooks';
import { buildAppDependencies } from '@/lib/di/bootstrap';
import { EmbeddingService } from '@/lib/rag/embedding-service';
import { cosineSimilarity } from '@/lib/utils/vector-math';
import { percentiles } from './stats';
import { loadGoldenExamples, loadGoldenMetadata } from './golden-set-loader';
import type { GoldenExample, RegressionResult, RegressionReport } from './types';

export interface RegressionConfig {
  parallel?: boolean;
  concurrency?: number;
  timeout?: number;
  limit?: number;
}

class PromisePool<T> {
  private readonly tasks: Array<() => Promise<T>>;
  private readonly concurrency: number;

  constructor(tasks: Array<() => Promise<T>>, concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error(`Invalid concurrency value: ${concurrency}`);
    }
    this.tasks = tasks;
    this.concurrency = concurrency;
  }

  async run(): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];
    let rejection: Error | null = null;

    for (const task of this.tasks) {
      if (rejection) {
        break;
      }

      const taskRunner = async (): Promise<void> => {
        try {
          const result = await task();
          results.push(result);
        } catch (error) {
          if (!rejection) {
            rejection = error as Error;
          }
          throw error;
        }
      };

      const trackedPromise: Promise<void> = taskRunner().finally(() => {
        const index = executing.indexOf(trackedPromise);
        if (index >= 0) {
          executing.splice(index, 1);
        }
      });

      executing.push(trackedPromise);

      if (executing.length >= this.concurrency) {
        try {
          await Promise.race(executing);
        } catch {
          // Failure handled via rejection flag
        }
      }
    }

    try {
      await Promise.allSettled(executing);
    } catch {
      // Individual errors handled
    }

    if (rejection) {
      throw rejection;
    }

    return results;
  }
}

function withTimeout<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    task()
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

export class GoldenSetRegressionTester {
  private config: Required<RegressionConfig>;

  constructor(config: RegressionConfig = {}) {
    this.config = {
      parallel: config.parallel ?? true,
      concurrency: config.concurrency ?? 5,
      timeout: config.timeout ?? 60000,
      limit: config.limit ?? Number.MAX_SAFE_INTEGER,
    };
  }

  async runRegression(): Promise<RegressionReport> {
    const examples = await loadGoldenExamples();
    const metadata = await loadGoldenMetadata();
    const targetExamples = examples.slice(0, this.config.limit);

    console.log(`Running regression test on ${targetExamples.length} examples...`);
    console.log(`Mode: ${this.config.parallel ? 'parallel' : 'sequential'}`);
    console.log(`Concurrency: ${this.config.concurrency}`);
    console.log(`Timeout: ${this.config.timeout}ms\n`);

    const { service: summaryService } = buildAppDependencies({
      translation: { enabled: false },
    });
    const embeddingService = new EmbeddingService();

    const results: RegressionResult[] = [];

    if (this.config.parallel) {
      const tasks = targetExamples.map(
        (example) => () => this.testExample(example, summaryService, embeddingService)
      );

      const pool = new PromisePool(tasks, this.config.concurrency);
      results.push(...(await pool.run()));
    } else {
      for (const example of targetExamples) {
        const result = await this.testExample(example, summaryService, embeddingService);
        results.push(result);

        console.log(
          `[${result.passed ? 'PASS' : 'FAIL'}] ${example.id} ` +
            `(similarity: ${result.semanticSimilarity.toFixed(3)}, quality: ${result.qualityScore.toFixed(3)})`
        );
      }
    }

    return this.generateReport(results, metadata.version);
  }

  private async testExample(
    example: GoldenExample,
    summaryService: any,
    embeddingService: EmbeddingService
  ): Promise<RegressionResult> {
    const startTime = performance.now();

    try {
      const actual: any = await withTimeout(
        () =>
          summaryService.generateSummary({
            title: example.article.title,
            content: example.article.content,
            url: example.article.url,
            qualityThreshold: undefined,
          }),
        this.config.timeout
      );

      const sanitize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
      const expectedText = [example.expectedOutput.summary, example.expectedOutput.detailedSummary]
        .map(sanitize)
        .filter(Boolean)
        .join(' ');
      const actualText = [actual.summary, actual.detailedSummary].map(sanitize).filter(Boolean).join(' ');

      let semanticSimilarity = 0;
      if (expectedText && actualText) {
        const [expectedEmbedding, actualEmbedding] = await Promise.all([
          embeddingService.embedText(expectedText),
          embeddingService.embedText(actualText),
        ]);
        semanticSimilarity = cosineSimilarity(expectedEmbedding, actualEmbedding);
      }

      const qualityScore = actual.qualityScore;

      const similarityPassed =
        semanticSimilarity >= example.acceptanceThreshold.semanticSimilarity;
      const qualityPassed = qualityScore >= example.acceptanceThreshold.minimumQuality;
      const passed = similarityPassed && qualityPassed;

      const issues: string[] = [];
      if (!similarityPassed) {
        issues.push(
          `Semantic similarity too low: ${semanticSimilarity.toFixed(3)} < ${example.acceptanceThreshold.semanticSimilarity.toFixed(3)}`
        );
      }
      if (!qualityPassed) {
        issues.push(
          `Quality score too low: ${qualityScore.toFixed(3)} < ${example.acceptanceThreshold.minimumQuality.toFixed(3)}`
        );
      }

      const executionTime = performance.now() - startTime;

      return {
        exampleId: example.id,
        passed,
        semanticSimilarity,
        qualityScore,
        issues,
        actualOutput: {
          summary: actual.summary,
          detailedSummary: actual.detailedSummary,
          tags: actual.tags || [],
        },
        metadata: {
          category: example.metadata.category,
          difficulty: example.metadata.difficulty,
          executionTimeMs: executionTime,
        },
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;

      return {
        exampleId: example.id,
        passed: false,
        semanticSimilarity: 0,
        qualityScore: 0,
        issues: [`Execution error: ${(error as Error).message}`],
        actualOutput: {
          summary: '',
          detailedSummary: '',
          tags: [],
        },
        metadata: {
          category: example.metadata.category,
          difficulty: example.metadata.difficulty,
          executionTimeMs: executionTime,
        },
      };
    }
  }

  private generateReport(results: RegressionResult[], goldenSetVersion: string): RegressionReport {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const passRate = (passed / results.length) * 100;

    const similarities = results.map((r) => r.semanticSimilarity);
    const similarityDist = percentiles(similarities, [50, 75, 90, 95, 99]);

    const categoryData = results.map((r) => ({
      category: r.metadata.category,
      similarity: r.semanticSimilarity,
      passed: r.passed,
    }));

    const byCategory: Record<
      string,
      { total: number; passed: number; avgSimilarity: number }
    > = {};
    for (const category of ['general', 'technical', 'thin_content', 'multilingual']) {
      const categoryResults = categoryData.filter((d) => d.category === category);
      if (categoryResults.length > 0) {
        const catPassed = categoryResults.filter((d) => d.passed).length;
        const avgSim =
          categoryResults.reduce((sum, d) => sum + d.similarity, 0) / categoryResults.length;
        byCategory[category] = {
          total: categoryResults.length,
          passed: catPassed,
          avgSimilarity: avgSim,
        };
      }
    }

    const degradations = results.filter((r) => !r.passed);

    return {
      runId: uuidv4(),
      timestamp: new Date().toISOString(),
      goldenSetVersion,
      totalExamples: results.length,
      passed,
      failed,
      passRate,
      results,
      statistics: {
        byCategory,
        similarityDistribution: {
          p50: similarityDist.p50,
          p75: similarityDist.p75,
          p90: similarityDist.p90,
          p95: similarityDist.p95,
          p99: similarityDist.p99,
        },
      },
      degradations,
    };
  }

  generateMarkdownReport(report: RegressionReport): string {
    const lines: string[] = [];

    lines.push('# AI Golden Set Regression Test Report');
    lines.push('');
    lines.push(`Run ID: ${report.runId}`);
    lines.push(`Timestamp: ${report.timestamp}`);
    lines.push(`Golden Set Version: ${report.goldenSetVersion}`);
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push(`- Total: ${report.totalExamples}`);
    lines.push(`- Passed: ${report.passed} (${report.passRate.toFixed(1)}%)`);
    lines.push(`- Failed: ${report.failed}`);
    lines.push('');

    lines.push('## Similarity Distribution');
    lines.push('');
    lines.push(`- P50: ${report.statistics.similarityDistribution.p50.toFixed(3)}`);
    lines.push(`- P75: ${report.statistics.similarityDistribution.p75.toFixed(3)}`);
    lines.push(`- P90: ${report.statistics.similarityDistribution.p90.toFixed(3)}`);
    lines.push(`- P95: ${report.statistics.similarityDistribution.p95.toFixed(3)}`);
    lines.push(`- P99: ${report.statistics.similarityDistribution.p99.toFixed(3)}`);
    lines.push('');

    lines.push('## By Category');
    lines.push('');
    for (const [category, stats] of Object.entries(report.statistics.byCategory)) {
      lines.push(`### ${category}`);
      lines.push(`- Total: ${stats.total}`);
      lines.push(
        `- Passed: ${stats.passed}/${stats.total} (${((stats.passed / stats.total) * 100).toFixed(1)}%)`
      );
      lines.push(`- Avg Similarity: ${stats.avgSimilarity.toFixed(3)}`);
      lines.push('');
    }

    if (report.degradations.length > 0) {
      lines.push('## Degradations');
      lines.push('');
      for (const deg of report.degradations) {
        lines.push(`### ${deg.exampleId}`);
        lines.push(`- Category: ${deg.metadata.category}`);
        lines.push(`- Similarity: ${deg.semanticSimilarity.toFixed(3)}`);
        lines.push(`- Quality: ${deg.qualityScore.toFixed(3)}`);
        lines.push(`- Issues:`);
        for (const issue of deg.issues) {
          lines.push(`  - ${issue}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
