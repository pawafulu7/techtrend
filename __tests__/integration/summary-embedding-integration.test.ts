import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { UnifiedSummaryServiceImpl } from '@/lib/ai/service/unified-summary-service';
import { GeminiSummaryAdapter } from '@/lib/ai/adapter/gemini-summary-adapter';
import { GeminiTransportImpl } from '@/lib/ai/transport/gemini-transport';
import { PromptBuilder } from '@/lib/ai/adapter/prompt-builder';
import { SummaryQualityChecker } from '@/lib/ai/service/quality-checker';
import { SummaryPostProcessor } from '@/lib/ai/service/post-processor';
import { GeminiTitleTranslator } from '@/lib/ai/translator/gemini-title-translator';
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

    // Setup real summary service (for integration testing)
    const apiKey = process.env.GEMINI_API_KEY || 'test-key';
    const transport = new GeminiTransportImpl(apiKey, 'https://generativelanguage.googleapis.com/v1beta', 3, 3);
    const promptBuilder = new PromptBuilder();
    const adapter = new GeminiSummaryAdapter(transport, promptBuilder, 'gemini-2.5-flash-lite');
    const qualityChecker = new SummaryQualityChecker();
    const postProcessor = new SummaryPostProcessor();
    const translator = new GeminiTitleTranslator(transport, {
      enabled: false,
      model: 'gemini-2.5-flash-lite',
      temperature: 0.3,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 256,
    });
    const embeddingScheduler = new EmbeddingScheduler();

    summaryService = new UnifiedSummaryServiceImpl(
      adapter,
      qualityChecker,
      postProcessor,
      translator,
      embeddingScheduler,
      {
        qualityThreshold: 50, // Lower threshold for testing
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

  it('should NOT throw error if summary generation fails', async () => {
    // Test with extremely short content that will fail quality check
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
