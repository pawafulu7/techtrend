/**
 * 要約の生成（UnifiedSummaryServiceImpl）と、埋め込みのジョブ（EmbeddingScheduler）の結合テスト。
 * ワーカーは保存済みの要約を埋め込むので、要約を作っただけではジョブを積まず、呼び出し元が要約を保存した後に
 * scheduleEmbedding で積む。その流れを実際の DB で確かめる。
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

  /** 呼び出し元と同じく、作った要約を記事に保存する */
  async function saveSummary(summary: { summary: string; detailedSummary: string }) {
    await prisma.article.update({
      where: { id: testArticle.id },
      data: { summary: summary.summary, detailedSummary: summary.detailedSummary },
    });
  }

  async function findJob() {
    return prisma.embeddingJob.findUnique({
      where: { articleId: testArticle.id },
    });
  }

  it('should NOT create a job when only the summary is generated', async () => {
    const result = await summaryService.generateSummary({
      title: testArticle.title,
      content: testArticle.content!,
    });

    expect(result.summary).toBeDefined();
    expect(await findJob()).toBeNull();
  });

  it('should create a PENDING job when scheduled after the summary is saved', async () => {
    const result = await summaryService.generateSummary({
      title: testArticle.title,
      content: testArticle.content!,
    });
    await saveSummary(result);

    await summaryService.scheduleEmbedding(testArticle.id);

    const job = await findJob();
    expect(job).not.toBeNull();
    expect(job?.status).toBe('PENDING');
    expect(job?.attempts).toBe(0);
    // ジョブを積んだ時点で、ワーカーが埋め込む要約は保存済み
    const article = await prisma.article.findUnique({
      where: { id: testArticle.id },
      select: { summary: true },
    });
    expect(article?.summary).toBe(result.summary);
  });

  it('should re-queue the same job when the summary is regenerated and saved', async () => {
    const first = await summaryService.generateSummary({
      title: testArticle.title,
      content: testArticle.content!,
    });
    await saveSummary(first);
    await summaryService.scheduleEmbedding(testArticle.id);

    const firstJob = await findJob();
    expect(firstJob).not.toBeNull();
    // ワーカーが処理し終えた状態にする
    await prisma.embeddingJob.update({
      where: { id: firstJob!.id },
      data: { status: 'COMPLETED', attempts: 1 },
    });

    // queuedAt が確実に変わるよう、少し待ってから作り直す
    await new Promise((resolve) => setTimeout(resolve, TIMESTAMP_PRECISION_DELAY_MS));

    const second = await summaryService.generateSummary({
      title: testArticle.title,
      content: testArticle.content + ' Updated content.',
    });
    await saveSummary(second);
    await summaryService.scheduleEmbedding(testArticle.id);

    const secondJob = await findJob();
    expect(secondJob?.id).toBe(firstJob!.id);
    expect(secondJob?.status).toBe('PENDING');
    expect(secondJob?.attempts).toBe(0);
    expect(secondJob!.queuedAt.getTime()).toBeGreaterThan(firstJob!.queuedAt.getTime());
  });
});
