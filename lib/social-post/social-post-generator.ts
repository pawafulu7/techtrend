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

import type { GeneratedContent, GenerationContext } from './types';
import { SocialPostSelector } from './social-post-selector';
import {
  buildArticlePrompt,
  buildDailyTrendPrompt,
  buildDiffSummaryPrompt,
  createXPostExtractionConfig,
  getCategoryHashtag,
  X_POST_PROMPT_VERSION,
} from './prompts/x-post-prompt';
import { validateGeneratedContent } from './social-post-validator';

// =============================================================================
// Generator Class
// =============================================================================

export class SocialPostGenerator {
  constructor(private selector: SocialPostSelector) {}

  /**
   * 記事からX投稿を生成
   */
  async generateFromArticle(
    article: Article,
    context?: GenerationContext
  ): Promise<GeneratedContent> {
    // 関連情報の収集
    const relatedTrends =
      context?.relatedTrends ||
      (await this.selector.getRelatedTrends(article.category));
    const recentArticles =
      context?.recentArticles ||
      (await this.selector.getRecentArticleTitles(
        article.category,
        article.id
      ));

    // プロンプト構築
    const prompt = buildArticlePrompt({
      article: {
        title: article.translatedTitle || article.title,
        summary: article.summary || '',
        url: article.url,
        category: article.category || 'tech',
      },
      relatedTrends,
      recentArticles,
    });

    // 入力のサニタイズ
    const sanitizedPrompt = this.sanitizeForPrompt(prompt);

    // AI生成
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

    // 出力検証
    const validation = validateGeneratedContent(result.data.comment);
    if (!validation.valid) {
      logger.warn(
        { articleId: article.id, errors: validation.errors },
        'Generated content validation warnings'
      );
      // 警告のみでエラーにはしない（管理者がレビューで修正可能）
    }

    return {
      comment: result.data.comment,
      hashtag: this.normalizeHashtag(result.data.hashtag, article.category),
      sourceUrls: [article.url],
      modelVersion: result.modelVersion || 'unknown',
      promptVersion: X_POST_PROMPT_VERSION,
      contextSummary: this.summarizeContext(article, relatedTrends),
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
      hashtag: '#TechTrend',
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
    const changes =
      (diff.changes as Array<{
        topic: string;
        trend: string;
        change?: number;
      }>) || [];
    const risingTopics = changes
      .filter((c) => c.trend === 'rising')
      .slice(0, 3)
      .map((c) => ({ topic: c.topic, change: c.change || 0 }));

    const unchanged = (diff.unchanged as string[]) || [];

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
      hashtag: getCategoryHashtag(diff.categorySlug),
      sourceUrls: [], // Diff Summaryは特定記事URLなし
      modelVersion: result.modelVersion || 'unknown',
      promptVersion: X_POST_PROMPT_VERSION,
      contextSummary: `Diff Summary: ${diff.categorySlug} ${diff.currentPeriod}`,
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
          throw new Error(`Article not found: ${sourceId}`);
        }
        return this.generateFromArticle(article);
      }
      case 'DAILY_TREND': {
        const trend = await this.selector.getTrendReportById(sourceId);
        if (!trend) {
          throw new Error(`TrendReport not found: ${sourceId}`);
        }
        return this.generateFromDailyTrend(trend);
      }
      case 'DIFF_SUMMARY': {
        const diff = await this.selector.getDiffSummaryById(sourceId);
        if (!diff) {
          throw new Error(`DiffSummary not found: ${sourceId}`);
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
      throw new Error('Potential prompt injection detected');
    }

    // HTMLタグを除去
    return sanitizeHtml(input);
  }

  /**
   * ハッシュタグを正規化
   */
  private normalizeHashtag(hashtag: string, category?: string | null): string {
    // AI生成のハッシュタグが有効ならそれを使用
    if (hashtag && hashtag.startsWith('#') && hashtag.length > 1) {
      return hashtag;
    }
    // カテゴリから取得
    return getCategoryHashtag(category);
  }

  /**
   * 文脈情報を安全な形式で要約
   */
  private summarizeContext(article: Article, relatedTrends: string[]): string {
    return JSON.stringify({
      articleTitle: article.title.slice(0, 100),
      category: article.category,
      trendsCount: relatedTrends.length,
    });
  }
}
