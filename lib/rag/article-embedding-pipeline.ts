import { PrismaClient, Article } from '@prisma/client';
import { EmbeddingService } from './embedding-service';
import { logger } from '@/lib/logger';
import { env } from '@/lib/config/env';

/**
 * Article Embedding Pipeline
 *
 * Orchestrates embedding generation for articles with:
 * - Secure UPSERT using Prisma.sql (SQL injection防止)
 * - Batch processing support
 * - Automatic detection of articles without embeddings
 * - Idempotent operations (safe to run multiple times)
 *
 * @see .claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md:765-912
 */

export interface EmbeddingJobResult {
  articleId: string;
  embeddingsCreated: string[];
  success: boolean;
  error?: string;
}

export class ArticleEmbeddingPipeline {
  private prisma: PrismaClient;
  private embeddingService: EmbeddingService;
  private activeModel: string;
  private activeVersion: number;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.embeddingService = new EmbeddingService();
    this.activeModel = env.RAG_ACTIVE_MODEL || 'text-embedding-3-small';
    this.activeVersion = env.RAG_ACTIVE_VERSION;
  }

  /**
   * Generate embeddings for a single article
   *
   * Creates embeddings for title and summary (if available)
   * Uses UPSERT to handle re-processing (idempotent)
   *
   * @param article - Article to embed
   * @returns Job result with success status and created embedding keys
   */
  async embedArticle(article: Article): Promise<EmbeddingJobResult> {
    const embeddingsCreated: string[] = [];

    try {
      const embeddings: Array<{ key: string; vector: number[] }> = [];

      // Generate embeddings for available fields
      if (article.title) {
        const titleVector = await this.embeddingService.embedText(
          article.title
        );
        embeddings.push({ key: 'title', vector: titleVector });
      }

      if (article.summary) {
        const summaryVector = await this.embeddingService.embedText(
          article.summary
        );
        embeddings.push({ key: 'summary', vector: summaryVector });
      }

      // UPSERT embeddings using Prisma.sql (SECURE - no SQL injection)
      // Uses parameterized queries for all user inputs
      for (const { key, vector } of embeddings) {
        // Serialize vector with toFixed for consistency
        // Prevents scientific notation and NaN issues
        const vectorString = `[${vector.map((v) => v.toFixed(8)).join(',')}]`;

        // SECURE: Prisma.sql template literals with parameter binding
        await this.prisma.$executeRaw`
          INSERT INTO "ArticleEmbedding" (
            id,
            "articleId",
            "embeddingKey",
            embedding,
            model,
            version,
            "computedAt"
          )
          VALUES (
            gen_random_uuid()::text,
            ${article.id},
            ${key}::"EmbeddingKey",
            ${vectorString}::vector,
            ${this.activeModel},
            ${this.activeVersion},
            CURRENT_TIMESTAMP
          )
          ON CONFLICT ("articleId", "embeddingKey", model, version)
          DO UPDATE SET
            embedding = EXCLUDED.embedding,
            "computedAt" = CURRENT_TIMESTAMP
        `;

        embeddingsCreated.push(key);
      }

      logger.info(
        {
          articleId: article.id,
          keys: embeddingsCreated,
          model: this.activeModel,
          version: this.activeVersion,
        },
        'Article embeddings created'
      );

      return {
        articleId: article.id,
        embeddingsCreated,
        success: true,
      };
    } catch (error) {
      logger.error(
        {
          articleId: article.id,
          err: error,
        },
        'Article embedding failed'
      );

      return {
        articleId: article.id,
        embeddingsCreated,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate embeddings for multiple articles (sequential)
   *
   * Processes articles one by one to avoid overwhelming OpenAI API
   * Progress logging every 10 articles
   *
   * @param articles - Articles to embed
   * @returns Array of job results
   */
  async embedBatch(articles: Article[]): Promise<EmbeddingJobResult[]> {
    const results: EmbeddingJobResult[] = [];

    logger.info(`Starting batch embedding for ${articles.length} articles`);

    for (const article of articles) {
      const result = await this.embedArticle(article);
      results.push(result);

      // Progress logging every 10 articles
      if (results.length % 10 === 0) {
        const successCount = results.filter((r) => r.success).length;
        logger.info(
          `Embedding progress: ${results.length}/${articles.length} (${successCount} success)`
        );
      }
    }

    // Final summary
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    logger.info(
      {
        total: results.length,
        success: successCount,
        failure: failureCount,
        successRate: ((successCount / results.length) * 100).toFixed(2) + '%',
      },
      'Batch embedding completed'
    );

    return results;
  }

  /**
   * Auto-detect and embed articles without embeddings
   *
   * Finds articles that:
   * - Have summary (not null)
   * - Do NOT have embeddings for current model+version
   *
   * Uses Prisma.sql for safe query (no injection risk)
   *
   * @param limit - Maximum number of articles to process
   * @returns Array of job results
   */
  async embedArticlesWithoutEmbeddings(
    limit: number = 100
  ): Promise<EmbeddingJobResult[]> {
    // SECURE: Use Prisma.sql for parameterized query
    const articlesWithoutEmbeddings = await this.prisma.$queryRaw<Article[]>`
      SELECT a.*
      FROM "Article" a
      WHERE NOT EXISTS (
        SELECT 1 FROM "ArticleEmbedding" e
        WHERE e."articleId" = a.id
          AND e.model = ${this.activeModel}
          AND e.version = ${this.activeVersion}
          AND e."embeddingKey" = 'summary'
      )
      AND a.summary IS NOT NULL
      ORDER BY a."publishedAt" DESC
      LIMIT ${limit}
    `;

    logger.info(
      {
        count: articlesWithoutEmbeddings.length,
        model: this.activeModel,
        version: this.activeVersion,
        limit,
      },
      `Found ${articlesWithoutEmbeddings.length} articles without embeddings`
    );

    if (articlesWithoutEmbeddings.length === 0) {
      logger.info('No articles to embed');
      return [];
    }

    return this.embedBatch(articlesWithoutEmbeddings);
  }
}
