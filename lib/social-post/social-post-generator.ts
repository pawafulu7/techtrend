/**
 * Social Post Generator
 *
 * AI生成ロジック
 */

import type { Article, TrendReport, DiffSummary } from '@prisma/client';
import { getLLMExtractionPipeline } from '@/lib/ai/extraction/llm-extraction-pipeline';
import { detectPromptInjection } from '@/lib/rag/security/prompt-injection-detector';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import logger from '@/lib/logger';

import type { GeneratedContent } from './types';
import { SocialPostSelector } from './social-post-selector';
import {
  buildDailyTrendPrompt,
  buildDiffSummaryPrompt,
  buildOpinionPrompt,
  buildShortenPrompt,
  createXPostExtractionConfig,
  X_POST_PROMPT_VERSION,
} from './prompts/x-post-prompt';
import { validateGeneratedContent } from './social-post-validator';
import {
  NotFoundError,
  PromptInjectionError,
  InsufficientDataError,
} from './errors';

// =============================================================================
// Generator Class
// =============================================================================

export class SocialPostGenerator {
  constructor(private selector: SocialPostSelector) {}

  /** 記事要約の最大文字数 */
  private static readonly MAX_SUMMARY_LENGTH = 120;

  /**
   * 記事からX投稿を生成
   * - 要約をそのまま使用（120字以下の場合）
   * - 120字超の場合はAIで短縮のみ（文体変換なし）
   */
  async generateFromArticle(article: Article): Promise<GeneratedContent> {
    const summary = article.summary || '';
    let comment: string;
    let modelVersion = 'none'; // AI未使用の場合

    if (summary.length <= SocialPostGenerator.MAX_SUMMARY_LENGTH) {
      // 120字以下: そのまま使用
      comment = summary;
      logger.info(
        { articleId: article.id, length: summary.length },
        'Using article summary directly (within limit)'
      );
    } else {
      // 120字超: AIで短縮のみ
      const prompt = buildShortenPrompt(
        summary,
        SocialPostGenerator.MAX_SUMMARY_LENGTH
      );
      const sanitizedPrompt = this.sanitizeForPrompt(prompt);

      const pipeline = getLLMExtractionPipeline();
      const result = await pipeline.extractRaw(sanitizedPrompt, {
        maxOutputTokens: 200,
        temperature: 0.3, // 低めで安定した短縮
      });

      if (!result.success || !result.text) {
        // 短縮失敗時は先頭120字で切る
        comment = summary.slice(0, SocialPostGenerator.MAX_SUMMARY_LENGTH);
        logger.warn(
          { articleId: article.id, error: result.error },
          'AI shortening failed, using truncated summary'
        );
      } else {
        comment = result.text.trim();
        modelVersion = result.modelVersion || 'unknown';
        logger.info(
          {
            articleId: article.id,
            original: summary.length,
            shortened: comment.length,
          },
          'Summary shortened by AI'
        );
      }
    }

    // 出力検証
    const validation = validateGeneratedContent(comment);
    if (!validation.valid) {
      logger.warn(
        { articleId: article.id, errors: validation.errors },
        'Generated content validation warnings'
      );
    }

    return {
      comment,
      sourceUrls: [article.url],
      modelVersion,
      promptVersion: X_POST_PROMPT_VERSION,
      contextSummary: JSON.stringify({
        articleTitle: article.title.slice(0, 100),
        category: article.category,
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
    const pipeline = getLLMExtractionPipeline();
    const config = createXPostExtractionConfig();

    const result = await pipeline.extract(sanitizedPrompt, config, {
      maxOutputTokens: 500,
      temperature: 0.7,
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
    const pipeline = getLLMExtractionPipeline();
    const config = createXPostExtractionConfig();

    const result = await pipeline.extract(sanitizedPrompt, config, {
      maxOutputTokens: 500,
      temperature: 0.7,
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

    const pipeline = getLLMExtractionPipeline();
    const config = createXPostExtractionConfig();

    const result = await pipeline.extract(sanitizedPrompt, config, {
      maxOutputTokens: 500,
      temperature: 0.8, // 少し高めで多様性を出す
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
    source: 'ARTICLE' | 'DAILY_TREND' | 'DIFF_SUMMARY',
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
