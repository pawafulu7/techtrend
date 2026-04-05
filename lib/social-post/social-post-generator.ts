/**
 * Social Post Generator
 *
 * AI生成ロジック
 */

import type { Article, TrendReport, DiffSummary } from '@prisma/client';
import { LLMExtractionPipeline } from '@/lib/ai/extraction/llm-extraction-pipeline';
import { detectPromptInjection } from '@/lib/rag/security/prompt-injection-detector';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import logger from '@/lib/logger';

import type { GeneratedContent } from './types';
import { SocialPostSelector } from './social-post-selector';
import {
  buildArticlePostPrompt,
  buildDailyTrendPrompt,
  buildDiffSummaryPrompt,
  buildOpinionPrompt,
  createXPostExtractionConfig,
  extractBalancedJson,
  X_POST_PROMPT_VERSION,
  XPostWithStyleSchema,
} from './prompts/x-post-prompt';
import { validateGeneratedContent } from './social-post-validator';
import {
  NotFoundError,
  PromptInjectionError,
  InsufficientDataError,
} from './errors';
import { env } from '@/lib/config/env';

// =============================================================================
// Generator Class
// =============================================================================

export class SocialPostGenerator {
  constructor(private selector: SocialPostSelector) {}

  /** X投稿の最大文字数 */
  private static readonly MAX_POST_LENGTH = 120;

  /** X投稿生成用モデル */
  private static readonly X_POST_MODEL = 'gemini-2.5-flash';

  /** X投稿生成用パイプラインを取得 */
  private createPipeline(): LLMExtractionPipeline {
    return new LLMExtractionPipeline(
      undefined,
      SocialPostGenerator.X_POST_MODEL
    );
  }

  /**
   * 記事からX投稿を生成
   * - detailedSummaryを優先使用（なければsummaryにフォールバック）
   * - SREエンジニアペルソナで3スタイルから自動選択
   * - 120字以内に収める
   */
  async generateFromArticle(
    article: Article & { tags?: { name: string }[] }
  ): Promise<GeneratedContent> {
    // detailedSummaryを優先、なければsummaryを使用
    const prompt = buildArticlePostPrompt({
      title: article.title,
      detailedSummary: article.detailedSummary || null,
      summary: article.summary || null,
      category: article.category || null,
      tags: article.tags?.map((t) => t.name) || [],
    });

    const sanitizedPrompt = this.sanitizeForPrompt(prompt);
    const pipeline = this.createPipeline();

    // スタイル付きのスキーマを使用
    const config = {
      promptVersion: X_POST_PROMPT_VERSION,
      schema: XPostWithStyleSchema,
      buildPrompt: (input: unknown) => String(input),
      parseResponse: (response: string) => {
        // コードブロックを検出して内容を抽出
        const codeBlockMatch = response.match(
          /```(?:json)?\s*([\s\S]*?)\s*```/
        );
        const textToExtract = codeBlockMatch ? codeBlockMatch[1] : response;

        // バランスブラケット抽出（ネストJSONにも対応）
        const jsonString = extractBalancedJson(textToExtract);
        if (!jsonString) {
          throw new Error('No JSON found in response');
        }

        // JSON解析（エラーハンドリング付き）
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonString);
        } catch (e) {
          throw new Error(
            `Invalid JSON in response: ${e instanceof Error ? e.message : String(e)}`
          );
        }

        const result = XPostWithStyleSchema.safeParse(parsed);
        if (!result.success) {
          throw new Error(
            `Schema validation failed: ${result.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        return result.data;
      },
    };

    const result = await pipeline.extract(sanitizedPrompt, config, {
      maxOutputTokens: 4000,
      temperature: 0.5, // 安定した出力のため低めに設定
    });

    if (!result.success || !result.data) {
      // フォールバック: detailedSummaryを優先、なければsummaryを使用
      const fallbackContent = (
        article.detailedSummary ||
        article.summary ||
        ''
      ).slice(0, SocialPostGenerator.MAX_POST_LENGTH);

      // 空のフォールバックコンテンツは許可しない（ハルシネーション防止）
      if (!fallbackContent.trim()) {
        throw new Error(
          `AI generation failed and no fallback content available: ${result.error || 'Unknown error'}`
        );
      }

      logger.warn(
        {
          articleId: article.id,
          errorMessage: result.error,
          rawResponse:
            env.LOG_LLM_RAW_RESPONSE === 'true'
              ? result.rawResponse?.slice(0, 300)
              : '[REDACTED]',
          modelVersion: result.modelVersion,
        },
        'AI generation failed, using fallback'
      );
      return {
        comment: fallbackContent,
        sourceUrls: [article.url],
        modelVersion: 'none',
        promptVersion: X_POST_PROMPT_VERSION,
        contextSummary: JSON.stringify({
          articleTitle: article.title.slice(0, 100),
          category: article.category,
          fallback: true,
        }),
      };
    }

    const validation = validateGeneratedContent(result.data.comment);
    if (!validation.valid) {
      logger.warn(
        { articleId: article.id, errors: validation.errors },
        'Generated content validation warnings'
      );
    }

    logger.info(
      {
        articleId: article.id,
        style: result.data.style,
        length: result.data.comment.length,
      },
      'X post generated with new prompt'
    );

    return {
      comment: result.data.comment,
      sourceUrls: [article.url],
      modelVersion: result.modelVersion || 'unknown',
      promptVersion: X_POST_PROMPT_VERSION,
      contextSummary: JSON.stringify({
        articleTitle: article.title.slice(0, 100),
        category: article.category,
        style: result.data.style,
      }),
    };
  }

  /**
   * Daily TrendからX投稿を生成
   */
  async generateFromDailyTrend(trend: TrendReport): Promise<GeneratedContent> {
    // Type-safe extraction of JSON fields
    const topArticles = Array.isArray(trend.topArticles)
      ? (trend.topArticles as Array<{ title?: string; url?: string }>).filter(
          (a): a is { title: string; url: string } =>
            typeof a?.title === 'string' && typeof a?.url === 'string'
        )
      : [];
    const categories =
      trend.categories &&
      typeof trend.categories === 'object' &&
      !Array.isArray(trend.categories)
        ? (trend.categories as Record<string, number>)
        : {};

    const prompt = buildDailyTrendPrompt({
      period: trend.periodStart,
      summary: trend.aiSummary || '',
      topArticles: topArticles.slice(0, 3),
      categories,
    });

    const sanitizedPrompt = this.sanitizeForPrompt(prompt);
    const pipeline = this.createPipeline();
    const config = createXPostExtractionConfig();

    const result = await pipeline.extract(sanitizedPrompt, config, {
      maxOutputTokens: 4000,
      temperature: 0.5,
    });

    if (!result.success || !result.data) {
      throw new Error(
        `AI generation failed: ${result.error || 'Unknown error'}`
      );
    }

    const validation = validateGeneratedContent(result.data.comment);
    if (!validation.valid) {
      logger.warn(
        { trendId: trend.id, errors: validation.errors },
        'Generated content validation warnings'
      );
    }

    return {
      comment: result.data.comment,
      sourceUrls: topArticles.slice(0, 3).map((a) => a.url),
      modelVersion: result.modelVersion || 'unknown',
      promptVersion: X_POST_PROMPT_VERSION,
      contextSummary: `Daily Trend: ${trend.periodStart.toISOString().split('T')[0]}`,
    };
  }

  /**
   * Diff SummaryからX投稿を生成
   */
  async generateFromDiffSummary(diff: DiffSummary): Promise<GeneratedContent> {
    // Type-safe extraction of JSON fields with proper validation
    const changes = Array.isArray(diff.changes)
      ? (
          diff.changes as Array<{
            topic?: string;
            trend?: string;
            change?: number;
          }>
        ).filter(
          (c): c is { topic: string; trend: string; change?: number } =>
            typeof c?.topic === 'string' && typeof c?.trend === 'string'
        )
      : [];
    const risingTopics = changes
      .filter((c) => c.trend === 'rising')
      .slice(0, 3)
      .map((c) => ({ topic: c.topic, change: c.change || 0 }));

    const unchanged = Array.isArray(diff.unchanged)
      ? (diff.unchanged as unknown[]).filter(
          (item): item is string => typeof item === 'string'
        )
      : [];

    const prompt = buildDiffSummaryPrompt({
      category: diff.categorySlug,
      period: diff.currentPeriod,
      risingTopics,
      unchanged,
    });

    const sanitizedPrompt = this.sanitizeForPrompt(prompt);
    const pipeline = this.createPipeline();
    const config = createXPostExtractionConfig();

    const result = await pipeline.extract(sanitizedPrompt, config, {
      maxOutputTokens: 4000,
      temperature: 0.5,
    });

    if (!result.success || !result.data) {
      throw new Error(
        `AI generation failed: ${result.error || 'Unknown error'}`
      );
    }

    const validation = validateGeneratedContent(result.data.comment);
    if (!validation.valid) {
      logger.warn(
        { diffId: diff.id, errors: validation.errors },
        'Generated content validation warnings'
      );
    }

    return {
      comment: result.data.comment,
      sourceUrls: [], // Diff Summaryは特定記事URLなし
      modelVersion: result.modelVersion || 'unknown',
      promptVersion: X_POST_PROMPT_VERSION,
      contextSummary: `Diff Summary: ${diff.categorySlug} ${diff.currentPeriod}`,
    };
  }

  /**
   * トレンド分析からOpinion投稿を生成（感想・意見調）
   * @throws InsufficientDataError トレンドデータが不足している場合
   */
  async generateOpinion(): Promise<GeneratedContent> {
    // 最近のトレンドデータを収集
    const opinionData = await this.selector.getOpinionData();

    // トレンドデータが不足している場合はエラー（ハルシネーション防止）
    if (
      opinionData.trendingTopics.length === 0 &&
      opinionData.recentArticles.length === 0
    ) {
      throw new InsufficientDataError(
        'No trending topics or recent articles available for opinion generation'
      );
    }

    const prompt = buildOpinionPrompt(opinionData);
    const sanitizedPrompt = this.sanitizeForPrompt(prompt);
    const pipeline = this.createPipeline();
    const config = createXPostExtractionConfig();

    const result = await pipeline.extract(sanitizedPrompt, config, {
      maxOutputTokens: 4000,
      temperature: 0.5, // 安定した出力のため低めに設定
    });

    if (!result.success || !result.data) {
      throw new Error(
        `AI generation failed: ${result.error || 'Unknown error'}`
      );
    }

    const validation = validateGeneratedContent(result.data.comment);
    if (!validation.valid) {
      logger.warn(
        { errors: validation.errors },
        'Generated opinion content validation warnings'
      );
    }

    return {
      comment: result.data.comment,
      sourceUrls: [],
      modelVersion: result.modelVersion || 'unknown',
      promptVersion: X_POST_PROMPT_VERSION,
      contextSummary: `Opinion: ${opinionData.period}`,
    };
  }

  /**
   * ソースタイプに応じて生成
   */
  async generate(
    source: 'ARTICLE' | 'DAILY_TREND' | 'DIFF_SUMMARY' | 'INSIGHT',
    sourceId: string
  ): Promise<GeneratedContent> {
    switch (source) {
      case 'ARTICLE': {
        const article = await this.selector.getArticleById(sourceId);
        if (!article) {
          throw new NotFoundError('Article', sourceId);
        }
        return this.generateFromArticle(article);
      }
      case 'DAILY_TREND': {
        const trend = await this.selector.getTrendReportById(sourceId);
        if (!trend) {
          throw new NotFoundError('TrendReport', sourceId);
        }
        return this.generateFromDailyTrend(trend);
      }
      case 'DIFF_SUMMARY': {
        const diff = await this.selector.getDiffSummaryById(sourceId);
        if (!diff) {
          throw new NotFoundError('DiffSummary', sourceId);
        }
        return this.generateFromDiffSummary(diff);
      }
      case 'INSIGHT':
        throw new Error(
          'INSIGHT source type generation is not yet implemented'
        );
      default:
        throw new Error(`Unsupported source type: ${source}`);
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * プロンプト用にサニタイズ
   */
  private sanitizeForPrompt(input: string): string {
    // プロンプトインジェクション検出
    if (detectPromptInjection(input)) {
      logger.error(
        { input: input.slice(0, 200) },
        'Potential prompt injection detected'
      );
      throw new PromptInjectionError();
    }

    // HTMLタグを除去
    return sanitizeHtml(input);
  }
}
