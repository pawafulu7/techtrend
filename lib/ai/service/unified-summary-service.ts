import { SummaryProvider } from '../adapter/summary-provider.interface';
import { QualityChecker } from './quality-checker.interface';
import { PostProcessor } from './post-processor.interface';
import {
  UnifiedSummaryService,
  SummaryServiceParams,
  SummaryServiceResult,
} from './unified-summary-service.interface';
import { TitleTranslator } from '../translator/gemini-title-translator';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';
import { logger, sanitizeError } from '@/lib/logger';

import { SUMMARY_VERSION } from '@/types/article';

export class UnifiedSummaryServiceImpl implements UnifiedSummaryService {
  constructor(
    private readonly summaryProvider: SummaryProvider,
    private readonly qualityChecker: QualityChecker,
    private readonly postProcessor: PostProcessor,
    private readonly titleTranslator: TitleTranslator,
    private readonly embeddingScheduler: EmbeddingScheduler,
    private readonly config: {
      qualityThreshold: number;
      maxRetries: number;
      translationEnabled: boolean;
    }
  ) {}

  async generateSummary(params: SummaryServiceParams): Promise<SummaryServiceResult> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.config.maxRetries) {
      const requestId = `${Date.now()}-${attempt}`;
      try {
        const providerOutput = await this.summaryProvider.summarize({
          title: params.title,
          content: params.content,
          articleType: params.articleType,
          constraints: {
            maxHeadlineChars: 200,
            detailPolicy: 'medium',
          },
          requestId,
        });

        const summary = this.postProcessor.cleanupSummary(providerOutput.headline);
        const detailedSummary = this.postProcessor.cleanupDetailedSummary(
          providerOutput.detailedSummary
        );
        const tags = this.postProcessor.formatTags(providerOutput.tags || []);

        // Process critique if present
        let critique: { contextComparison: string; recommendedAudience: string; valueAssessment: string } | undefined;
        let critiqueVersion: number | undefined;

        if (providerOutput.critique) {
          critique = providerOutput.critique;
          critiqueVersion = 1;
          console.log(`[Service] Critique generated for ${requestId}`);
        }

        const qualityResult = this.qualityChecker.checkQuality(summary, detailedSummary);

        const threshold = params.qualityThreshold ?? this.config.qualityThreshold;
        if (qualityResult.score >= threshold) {
          let translatedTitle: string | undefined;

          if (this.config.translationEnabled) {
            const MAX_TRANSLATION_RETRIES = 3;

            for (let translationAttempt = 0; translationAttempt < MAX_TRANSLATION_RETRIES; translationAttempt++) {
              try {
                const attemptSuffix = translationAttempt > 0 ? `-retry${translationAttempt}` : '';
                const currentRequestId = `${requestId}${attemptSuffix}`;

                // 2回目以降はフォールバック（summaryなし）
                const useSummary = translationAttempt === 0;

                const translated = await this.titleTranslator.translateTitle({
                  title: params.title,
                  summary: useSummary ? summary : undefined,
                  requestId: currentRequestId,
                });

                translatedTitle = translated?.trim() || undefined;

                if (translatedTitle) {
                  if (translationAttempt > 0) {
                    console.log(
                      `[Service] Title translation succeeded on attempt ${translationAttempt + 1} for ${requestId}`
                    );
                  }
                  break;
                } else {
                  console.warn(
                    `[Service] Title translation attempt ${translationAttempt + 1} returned empty for ${requestId}, retrying...`
                  );
                }
              } catch (translationError) {
                const errorMsg = (translationError as Error).message;

                if (translationAttempt >= MAX_TRANSLATION_RETRIES - 1) {
                  console.error(
                    `[Service] Title translation failed after ${MAX_TRANSLATION_RETRIES} attempts for ${requestId}: ${errorMsg}`
                  );
                } else {
                  console.warn(
                    `[Service] Title translation attempt ${translationAttempt + 1} failed for ${requestId}: ${errorMsg}, retrying...`
                  );
                }
              }
            }
          }

          const result = {
            summary,
            detailedSummary,
            translatedTitle,
            category: providerOutput.category,
            tags,
            qualityScore: qualityResult.score,
            processingTimeMs: Date.now() - startTime,
            summaryVersion: SUMMARY_VERSION.UNIFIED,
            critique,
            critiqueVersion,
          };

          // Schedule embedding job (fire-and-forget)
          if (params.articleId) {
            this.embeddingScheduler
              .enqueue(params.articleId)
              .catch((err) =>
                logger.error(
                  {
                    articleId: params.articleId,
                    error: sanitizeError(err),
                  },
                  'Embedding job enqueue failed'
                )
              );
          } else {
            logger.debug('Summary generated without articleId, skipping embedding job');
          }

          return result;
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