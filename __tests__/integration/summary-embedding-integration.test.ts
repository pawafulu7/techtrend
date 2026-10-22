/**
 * 要約の生成（UnifiedSummaryServiceImpl）と、埋め込みのジョブ（EmbeddingScheduler）の結合テスト。
 * 要約が成功し記事の ID があればジョブを積み、無いときや失敗したときは積まないことを、実際の DB で確かめる。
 *
 * 要約の生成（Gemini）と品質の検査は差し替える。ここで確かめるのは、要約の結果を受けてジョブを積むかどうかで、
 * 要約の中身は lib/ai/adapter・lib/ai/service の単体テストが確かめる。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { UnifiedSummaryServiceImpl } from '@/lib/ai/service/unified-summary-service';
import type { SummaryProvider } from '@/lib/ai/adapter/summary-provider.interface';
import type { QualityChecker } from '@/lib/ai/service/quality-checker.interface';
import { SummaryPostProcessor } from '@/lib/ai/service/post-processor';
import type { TitleTranslator } from '@/lib/ai/translator/gemini-title-translator';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';
import type { Article } from '@/lib/prisma-exports';

const EMBEDDING_ENQUEUE_DELAY_MS = 200;
const TIMESTAMP_PRECISION_DELAY_MS = 100;

describe('Summary-Embedding Integration', () => {
  let testArticle: Article;
  let summaryService: UnifiedSummaryServiceImpl;

  beforeAll(async () => {
    // Get first available source
    const source = await prisma.source.findFirst();
    if (!source) {
      throw new Error('No source found in database');
    }

    // Create test article
    testArticle = await prisma.article.create({
      data: {
        title: 'Integration Test Article',
        url: `https://example.com/integration-test-${Date.now()}`,
        sourceId: source.id,
        publishedAt: new Date(),
        content: 'This is a long article content for testing summary generation and embedding job creation. It contains multiple paragraphs with technical information about React, TypeScript, and Next.js development.',
      },
    });

    const summaryProvider: SummaryProvider = {
      summarize: jest.fn<SummaryProvider['summarize']>().mockResolvedValue({
        headline: 'React・TypeScript・Next.js による開発の要点',
        detailedSummary: '・React の基本\n・TypeScript の型\n・Next.js の構成',
        category: 'Frontend',
        tags: ['React', 'TypeScript', 'Next.js'],
        confidence: 0.9,
      }),
    };
    // 点数は 80。要約の閾値（qualityThreshold）を 90 にすると失敗する
    const qualityChecker: QualityChecker = {
      checkQuality: jest.fn<QualityChecker['checkQuality']>().mockReturnValue({
        isValid: true,
        issues: [],
        requiresRegeneration: false,
        score: 80,
      }),
      calculateScore: jest.fn<QualityChecker['calculateScore']>().mockReturnValue(80),
    };
    const translator: TitleTranslator = {
      translateTitle: jest.fn<TitleTranslator['translateTitle']>().mockResolvedValue(null),
    };

    summaryService = new UnifiedSummaryServiceImpl(
      summaryProvider,
      qualityChecker,
      new SummaryPostProcessor(),
      translator,
      new EmbeddingScheduler(),
      {
        qualityThreshold: 50,
        maxRetries: 3,
        translationEnabled: false,
      }
    );
  });

  afterAll(async () => {
    // Cleanup - embeddingJob cascades when article is deleted
    await prisma.article.delete({
      where: { id: testArticle.id },
    });
  });

  beforeEach(async () => {
    // Clean up any existing jobs before each test
    await prisma.embeddingJob.deleteMany({
      where: { articleId: testArticle.id },
    });
  });

  it('should create embedding job after successful summary generation', async () => {
    const result = await summaryService.generateSummary({
      title: testArticle.title,
      content: testArticle.content!,
      articleId: testArticle.id, // Provide articleId
    });

    expect(result.summary).toBeDefined();
    expect(result.detailedSummary).toBeDefined();

    // Wait a bit for async enqueue
    await new Promise((resolve) => setTimeout(resolve, EMBEDDING_ENQUEUE_DELAY_MS));

    // Verify job created
    const job = await prisma.embeddingJob.findUnique({
      where: { articleId: testArticle.id },
    });

    expect(job).not.toBeNull();
    expect(job?.status).toBe('PENDING');
    expect(job?.attempts).toBe(0);
    expect(job?.articleId).toBe(testArticle.id);
  });

  it('should re-queue job if summary regenerated', async () => {
    // First generation
    await summaryService.generateSummary({
      title: testArticle.title,
      content: testArticle.content!,
      articleId: testArticle.id,
    });

    await new Promise((resolve) => setTimeout(resolve, EMBEDDING_ENQUEUE_DELAY_MS));

    const firstJob = await prisma.embeddingJob.findUnique({
      where: { articleId: testArticle.id },
    });

    expect(firstJob).not.toBeNull();
    const firstQueuedAt = firstJob!.queuedAt;

    // Wait to ensure queuedAt timestamp will be different
    await new Promise((resolve) => setTimeout(resolve, TIMESTAMP_PRECISION_DELAY_MS));

    // Second generation (regeneration)
    await summaryService.generateSummary({
      title: testArticle.title,
      content: testArticle.content + ' Updated content.',
      articleId: testArticle.id,
    });

    await new Promise((resolve) => setTimeout(resolve, EMBEDDING_ENQUEUE_DELAY_MS));

    const secondJob = await prisma.embeddingJob.findUnique({
      where: { articleId: testArticle.id },
    });

    // Same job ID, but re-queued
    expect(secondJob?.id).toBe(firstJob?.id);
    expect(secondJob?.status).toBe('PENDING');
    expect(secondJob?.attempts).toBe(0); // Reset
    expect(secondJob?.queuedAt.getTime()).toBeGreaterThan(firstQueuedAt.getTime());
  });

  it('should NOT create job if params.articleId missing', async () => {
    await summaryService.generateSummary({
      title: testArticle.title,
      content: testArticle.content!,
      // articleId NOT provided
    });

    await new Promise((resolve) => setTimeout(resolve, EMBEDDING_ENQUEUE_DELAY_MS));

    // Verify NO job created
    const job = await prisma.embeddingJob.findUnique({
      where: { articleId: testArticle.id },
    });

    expect(job).toBeNull();
  });

  it('should NOT create job if summary generation fails', async () => {
    // 品質の点数（80）が閾値（90）に届かず、やり直しても失敗する
    await expect(
      summaryService.generateSummary({
        title: 'Short',
        content: 'Too short',
        articleId: testArticle.id,
        qualityThreshold: 90, // Very high threshold
      })
    ).rejects.toThrow('Failed to generate quality summary');

    // Verify NO job created (summary generation failed)
    const job = await prisma.embeddingJob.findUnique({
      where: { articleId: testArticle.id },
    });

    expect(job).toBeNull();
  });
});
