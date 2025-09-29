import { SummaryProvider } from '../adapter/summary-provider.interface';
import { QualityChecker } from './quality-checker.interface';
import { PostProcessor } from './post-processor.interface';
import {
  UnifiedSummaryService,
  SummaryServiceParams,
  SummaryServiceResult,
} from './unified-summary-service.interface';

import { SUMMARY_VERSION } from '@/types/article';

export class UnifiedSummaryServiceImpl implements UnifiedSummaryService {
  constructor(
    private readonly summaryProvider: SummaryProvider,
    private readonly qualityChecker: QualityChecker,
    private readonly postProcessor: PostProcessor,
    private readonly config: {
      qualityThreshold: number;
      maxRetries: number;
    }
  ) {}

  async generateSummary(params: SummaryServiceParams): Promise<SummaryServiceResult> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.config.maxRetries) {
      try {
        const providerOutput = await this.summaryProvider.summarize({
          title: params.title,
          content: params.content,
          articleType: params.articleType,
          constraints: {
            maxHeadlineChars: 200,
            detailPolicy: 'medium',
          },
          requestId: `${Date.now()}-${attempt}`,
        });

        const summary = this.postProcessor.cleanupSummary(providerOutput.headline);
        const detailedSummary = this.postProcessor.cleanupDetailedSummary(
          providerOutput.detailedSummary
        );
        const tags = this.postProcessor.formatTags(providerOutput.tags || []);

        const qualityResult = this.qualityChecker.checkQuality(summary, detailedSummary);

        const threshold = params.qualityThreshold ?? this.config.qualityThreshold;
        if (qualityResult.score >= threshold) {
          return {
            summary,
            detailedSummary,
            category: providerOutput.category,
            tags,
            qualityScore: qualityResult.score,
            processingTimeMs: Date.now() - startTime,
            summaryVersion: SUMMARY_VERSION.UNIFIED,
          };
        }

        attempt++;
        lastError = new Error(
          `Quality too low: ${qualityResult.score} < ${threshold}. Issues: ${qualityResult.issues.map((i) => i.message).join(', ')}`
        );
      } catch (error) {
        attempt++;
        lastError = error as Error;
      }
    }

    throw new Error(
      `Failed to generate quality summary after ${this.config.maxRetries} attempts: ${lastError?.message}`
    );
  }
}