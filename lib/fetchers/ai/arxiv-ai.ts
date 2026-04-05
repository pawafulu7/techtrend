import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import sanitizeHtml from 'sanitize-html';
import pLimit from 'p-limit';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { parseRSSDate } from '@/lib/utils/date';
import logger from '@/lib/logger';
import { RSSItem } from '@/lib/types/rss';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/config/env';

export class ArxivAIFetcher extends BaseFetcher {
  private parser: Parser;

  // Combined RSS feed (single HTTP request for all categories)
  private readonly RSS_URL = 'https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL';

  // Parallel enrichment concurrency (adjustable via env, minimum 1)
  // Note: Keep at 5 to avoid arXiv rate limiting/IP blocking
  private readonly ENRICHMENT_CONCURRENCY = Math.max(
    1,
    env.ARXIV_ENRICHMENT_CONCURRENCY
  );

  // Maximum articles per fetch to prevent timeout (adjustable via env)
  // Reduced from 200 to 50 to reduce Gemini API costs (2025-12-23)
  private readonly MAX_ARTICLES_PER_FETCH = Math.max(
    1,
    env.ARXIV_MAX_ARTICLES_PER_FETCH
  );

  // Maximum length for arXiv abstracts
  private readonly MAX_ABSTRACT_LENGTH = 500;

  constructor(source: Source) {
    super(source);
    const rawTimeout = env.FETCHER_TIMEOUT_MS;
    const parsedTimeout = rawTimeout ? Number(rawTimeout) : NaN;
    const timeout =
      Number.isFinite(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : 600_000; // 10 min default

    this.parser = new Parser({
      timeout,
    });
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];
    const processedIds = new Set<string>(); // Deduplication by arXiv ID

    // 30 days ago as cutoff (only recent papers)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      logger.info('arXiv AI記事取得開始（統合フィード使用）');

      // Fetch combined RSS feed (single HTTP request)
      const feed = await this.retry(() => this.parser.parseURL(this.RSS_URL));

      if (!feed.items || feed.items.length === 0) {
        logger.warn('arXiv AI: 記事が見つかりませんでした');
        return { articles, errors };
      }

      logger.info(`arXiv AI: RSSフィードから ${feed.items.length} 件取得`);

      // Get existing URLs from database (to skip enrichment for already saved articles)
      const feedUrls = feed.items
        .map((item) => (item as RSSItem).link)
        .filter((url): url is string => !!url);

      const existingArticles = await prisma.article.findMany({
        where: {
          url: { in: feedUrls },
        },
        select: { url: true },
      });
      const existingUrlSet = new Set(existingArticles.map((a) => a.url));

      logger.info(`arXiv AI: DB既存URL ${existingUrlSet.size} 件を除外`);

      // Filter items (date, validity, deduplication, existing URL)
      const validItems: RSSItem[] = [];

      for (const item of feed.items as RSSItem[]) {
        if (!item.title || !item.link) continue;

        // Skip existing URLs (before expensive enrichment)
        if (existingUrlSet.has(item.link)) continue;

        // Extract arXiv ID for deduplication (handles versioning)
        const arxivId = this.extractArxivId(item.link);
        if (arxivId && processedIds.has(arxivId)) continue;

        const publishedAt = item.pubDate
          ? parseRSSDate(item.pubDate)
          : new Date();

        // Only papers from last 30 days
        if (publishedAt < thirtyDaysAgo) continue;

        if (arxivId) processedIds.add(arxivId);
        validItems.push(item);
      }

      logger.info(`arXiv AI: フィルタ後 ${validItems.length} 件（新規のみ）`);

      // Apply limit to prevent timeout
      const limitedItems = validItems.slice(0, this.MAX_ARTICLES_PER_FETCH);
      if (validItems.length > this.MAX_ARTICLES_PER_FETCH) {
        logger.info(
          `arXiv AI: リミット適用 ${validItems.length} -> ${limitedItems.length} 件（残り${validItems.length - limitedItems.length}件は次回取得）`
        );
      }

      // Parallel enrichment with p-limit
      const limit = pLimit(this.ENRICHMENT_CONCURRENCY);

      const enrichmentTasks = limitedItems.map((item) =>
        limit(() => this.enrichSingle(item))
      );

      const results = await Promise.allSettled(enrichmentTasks);

      // Aggregate results
      let successCount = 0;
      let failureCount = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value) {
            articles.push(result.value);
            successCount++;
          } else {
            failureCount++;
            logger.warn(
              'arXiv AI: エンリッチメント結果がnullのため記事を生成せずスキップ'
            );
          }
        } else {
          failureCount++;
          logger.warn(
            { error: result.reason },
            'arXiv AI: エンリッチメント失敗'
          );
        }
      }

      logger.info(
        {
          total: limitedItems.length,
          success: successCount,
          failure: failureCount,
          successRate:
            limitedItems.length > 0
              ? `${((successCount / limitedItems.length) * 100).toFixed(1)}%`
              : 'N/A',
          concurrency: this.ENRICHMENT_CONCURRENCY,
        },
        'arXiv AI: エンリッチメント完了'
      );
    } catch (error) {
      const errorMessage = `arXiv AI取得エラー: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      errors.push(new Error(errorMessage));
    }

    logger.info(`arXiv AI: ${articles.length} 件の記事を取得完了`);

    return { articles, errors };
  }

  /**
   * Enrich a single RSS item with metadata (RSS content only, no HTML fetch)
   * HTML enrichment was disabled on 2025-12-23 to reduce Gemini API costs
   */
  private async enrichSingle(
    item: RSSItem
  ): Promise<CreateArticleInput | null> {
    if (!item.title || !item.link) return null;

    try {
      const publishedAt = item.pubDate
        ? parseRSSDate(item.pubDate)
        : new Date();

      // arXiv-specific processing
      const cleanedTitle = this.cleanArxivTitle(item.title);
      const arxivId = this.extractArxivId(item.link);
      const abstract = this.extractAbstract(item);
      const category = this.detectCategory(item);

      // Use RSS content only (no HTML enrichment to reduce API costs)
      const content = this.generateEnrichedContent(
        item,
        category,
        arxivId,
        abstract
      );

      // Enrich article with metadata
      const enrichedArticle = this.enrichArticle(
        {
          title: cleanedTitle,
          url: item.link,
          content,
          summary: undefined, // Summary generated separately
          publishedAt,
          sourceId: this.source.id,
          thumbnail: undefined, // No thumbnail without HTML enrichment
        },
        category,
        arxivId,
        abstract
      );

      return enrichedArticle;
    } catch (error) {
      logger.warn({ url: item.link, err: error }, 'arXiv AI: 記事処理エラー');
      return null;
    }
  }

  /**
   * Detect category from RSS item's category/categories field
   */
  private detectCategory(item: RSSItem): string {
    const categories = item.categories || item.category || '';
    const categoryStr = Array.isArray(categories)
      ? categories.join(' ')
      : String(categories);

    // Check for specific arXiv categories
    if (/\bcs\.AI\b/i.test(categoryStr)) return 'AI';
    if (/\bcs\.LG\b/i.test(categoryStr)) return 'Machine Learning';
    if (/\bcs\.CL\b/i.test(categoryStr)) return 'NLP';

    // Default to AI
    return 'AI';
  }

  private cleanArxivTitle(title: string): string {
    // Remove arXiv-specific artifacts from title
    return title
      .replace(/\. \(arXiv:.*?\)/g, '') // Remove arXiv ID
      .replace(/^\s*\[.*?\]\s*/g, '') // Remove category tags
      .replace(/\s+/g, ' ') // Remove extra whitespace
      .trim();
  }

  private extractArxivId(url: string): string | undefined {
    // Extract arXiv ID from URL (e.g., 2312.12345)
    const match = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
    return match ? match[1] : undefined;
  }

  private extractAbstract(item: RSSItem): string {
    // Extract abstract from description or content
    const content = item.description || item.content || '';

    // Remove HTML tags
    const cleanContent = sanitizeHtml(content, {
      allowedTags: [],
      allowedAttributes: {},
    });

    // Limit abstract length
    return cleanContent.length > this.MAX_ABSTRACT_LENGTH
      ? cleanContent.substring(0, this.MAX_ABSTRACT_LENGTH - 3) + '...'
      : cleanContent;
  }

  private enrichArticle(
    article: CreateArticleInput,
    category: string,
    arxivId?: string,
    abstract?: string
  ): CreateArticleInput {
    // Detect AI/ML/NLP keywords
    const aiKeywords = this.detectKeywords(article.title, abstract);

    // Category-specific tags
    const categoryTags: Record<string, string[]> = {
      AI: ['Artificial Intelligence', 'AI Research', 'arXiv'],
      'Machine Learning': ['Machine Learning', 'ML Research', 'arXiv'],
      NLP: ['Natural Language Processing', 'NLP Research', 'arXiv'],
    };

    // Add metadata
    const enrichedArticle: CreateArticleInput = {
      ...article,
      metadata: {
        source: 'arXiv',
        category: category,
        arxivId: arxivId,
        abstract: abstract,
        type: 'research_paper',
        keywords: aiKeywords,
        tags: categoryTags[category] || [],
        fetchedAt: new Date().toISOString(),
      },
    };

    return enrichedArticle;
  }

  private detectKeywords(title: string, abstract?: string): string[] {
    const text = `${title} ${abstract || ''}`.toLowerCase();

    const keywordGroups = {
      Transformer: ['transformer', 'attention', 'self-attention'],
      LLM: ['llm', 'large language model', 'language model'],
      GPT: ['gpt', 'generative pre-train'],
      BERT: ['bert', 'bidirectional encoder'],
      Diffusion: ['diffusion', 'ddpm', 'ddim'],
      GAN: ['gan', 'generative adversarial'],
      VAE: ['vae', 'variational autoencoder'],
      Vision: ['vision', 'visual', 'image', 'cv'],
      'Reinforcement Learning': ['reinforcement', 'rl', 'policy gradient'],
      'Fine-tuning': ['fine-tun', 'finetun', 'adaptation'],
      Prompt: ['prompt', 'in-context', 'few-shot', 'zero-shot'],
      'Multi-modal': ['multi-modal', 'multimodal', 'cross-modal'],
      Embedding: ['embedding', 'representation', 'encode'],
      'Neural Network': ['neural', 'deep learning', 'convolution'],
      Optimization: ['optimi', 'gradient', 'loss function'],
      Benchmark: ['benchmark', 'evaluation', 'dataset', 'sota'],
    };

    const detectedKeywords = new Set<string>();

    for (const [keyword, patterns] of Object.entries(keywordGroups)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          detectedKeywords.add(keyword);
          break;
        }
      }
    }

    return Array.from(detectedKeywords);
  }

  private generateEnrichedContent(
    item: RSSItem,
    categoryName: string,
    arxivId?: string,
    abstract?: string
  ): string {
    // Build enriched content with metadata for better summary generation
    const enrichedParts: string[] = [];

    // Title
    enrichedParts.push(`Title: ${item.title || 'Untitled'}`);
    enrichedParts.push(`Category: ${categoryName}`);
    enrichedParts.push('Source: arXiv');

    // arXiv ID
    if (arxivId) {
      enrichedParts.push(`arXiv ID: ${arxivId}`);
    }

    // Author info
    if (item.author) {
      enrichedParts.push(`Authors: ${item.author}`);
    }

    // Category info
    const rawCategories = item.categories ?? item.category;
    if (rawCategories) {
      const categories = Array.isArray(rawCategories)
        ? rawCategories
        : [rawCategories];
      if (categories.length > 0) {
        enrichedParts.push(`Subject Areas: ${categories.join(', ')}`);
      }
    }

    // Abstract
    enrichedParts.push('');
    enrichedParts.push('Abstract:');
    enrichedParts.push(abstract || item.content || item.contentSnippet || '');

    // Additional content (only if description and content are both present and different)
    if (item.content && item.description && item.content !== item.description) {
      enrichedParts.push('');
      enrichedParts.push('Additional Content:');
      enrichedParts.push(item.content);
    }

    return enrichedParts.join('\n');
  }
}
