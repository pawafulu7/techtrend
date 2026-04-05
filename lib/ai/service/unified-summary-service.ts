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
import { logger } from '@/lib/logger';

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

  async generateSummary(
    params: SummaryServiceParams
  ): Promise<SummaryServiceResult> {
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

        const summary = this.postProcessor.cleanupSummary(
          providerOutput.headline
        );
        const detailedSummary = this.postProcessor.cleanupDetailedSummary(
          providerOutput.detailedSummary
        );
        const tags = this.postProcessor.formatTags(providerOutput.tags || []);

        // Build contentAnalysis for quality checker to enable strict bin enforcement
        const contentLength = params.content.length;
        const contentAnalysis = {
          totalLength: contentLength,
          contentLength,
          isThinContent: contentLength < 400,
        };

        const qualityResult = this.qualityChecker.checkQuality(
          summary,
          detailedSummary,
          contentAnalysis
        );

        const threshold =
          params.qualityThreshold ?? this.config.qualityThreshold;
        if (qualityResult.score >= threshold) {
          let translatedTitle: string | undefined;

          if (this.config.translationEnabled) {
            const MAX_TRANSLATION_RETRIES = 3;

            for (
              let translationAttempt = 0;
              translationAttempt < MAX_TRANSLATION_RETRIES;
              translationAttempt++
            ) {
              try {
                const attemptSuffix =
                  translationAttempt > 0 ? `-retry${translationAttempt}` : '';
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
                    logger.info(
                      { requestId, attempt: translationAttempt + 1 },
                      'Title translation succeeded on retry'
                    );
                  }
                  break;
                } else {
                  logger.warn(
                    { requestId, attempt: translationAttempt + 1 },
                    'Title translation returned empty, retrying'
                  );
                }
              } catch (translationError) {
                const err = translationError as Error;

                if (translationAttempt >= MAX_TRANSLATION_RETRIES - 1) {
                  logger.error(
                    {
                      requestId,
                      maxAttempts: MAX_TRANSLATION_RETRIES,
                      err,
                    },
                    'Title translation failed after max attempts'
                  );
                } else {
                  logger.warn(
                    {
                      requestId,
                      attempt: translationAttempt + 1,
                      err,
                    },
                    'Title translation attempt failed, retrying'
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
            summaryVersion: SUMMARY_VERSION.CURRENT,
          };

          // Schedule embedding job (fire-and-forget)
          if (params.articleId) {
            this.embeddingScheduler.enqueue(params.articleId).catch((err) =>
              logger.error(
                {
                  articleId: params.articleId,
                  err,
                },
                'Embedding job enqueue failed'
              )
            );
          } else {
            logger.debug(
              'Summary generated without articleId, skipping embedding job'
            );
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
