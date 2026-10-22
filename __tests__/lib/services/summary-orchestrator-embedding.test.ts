/**
 * 要約の再生成・未作成の生成（summary-orchestrator）が、要約を保存した後に埋め込みのジョブを積むこと。
 * ワーカーは保存済みの要約を埋め込むので、保存より先に積むと、要約の無い記事のジョブは失敗し、
 * 作り直した記事には古い要約が埋め込まれる。
 */
import {
  generateMissingSummaries,
  regenerateSummaries,
} from '@/lib/services/summary/summary-orchestrator';
import { SummaryManager } from '@/lib/services/summary/summary-manager';

jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: jest.fn(() => ({ service: {} })),
}));

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onBulkImport: jest.fn().mockResolvedValue(undefined),
    onArticleUpdated: jest.fn().mockResolvedValue(undefined),
  },
}));

const article = {
  id: 'a1',
  title: 'タイトル',
  content: '本文'.repeat(500),
  source: { name: 'Zenn' },
};

const generated = {
  summary: '要約',
  detailedSummary: '・詳細',
  translatedTitle: undefined,
  tags: [],
};

function createPrismaMock() {
  const articleUpdate = jest.fn().mockResolvedValue({});
  const prisma = {
    article: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([article]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: articleUpdate,
    },
    source: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({ article: { update: articleUpdate } })
    ),
  };
  return { prisma, articleUpdate };
}

/** 記事ごとの待ち（sleep）を進めながら流す */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

describe('summary-orchestrator の埋め込みのジョブ', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  type Run = (
    prisma: ReturnType<typeof createPrismaMock>['prisma'],
    generateSummaryAndTags: jest.Mock,
    scheduleEmbedding: jest.Mock
  ) => Promise<unknown>;

  it.each<[string, Run]>([
    [
      '再生成（記事 ID を指定）',
      (prisma, generate, schedule) =>
        regenerateSummaries(
          prisma as never,
          { articleIds: ['a1'] },
          generate,
          schedule
        ),
    ],
    [
      '再生成（条件で選ぶ）',
      (prisma, generate, schedule) =>
        regenerateSummaries(
          prisma as never,
          { force: true },
          generate,
          schedule
        ),
    ],
    [
      '未作成の生成',
      (prisma, generate, schedule) =>
        generateMissingSummaries(prisma as never, {}, generate, schedule),
    ],
  ])('%s: 要約を保存した後にジョブを積む', async (_label, run) => {
    const { prisma, articleUpdate } = createPrismaMock();
    const generate = jest.fn().mockResolvedValue(generated);
    const schedule = jest.fn().mockResolvedValue(undefined);

    await runWithTimers(run(prisma, generate, schedule));

    // 要約の生成には記事の ID を渡さない（生成の時点ではジョブを積まない）
    expect(generate).toHaveBeenCalledWith('タイトル', article.content);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith('a1');
    expect(schedule.mock.invocationCallOrder[0]).toBeGreaterThan(
      articleUpdate.mock.invocationCallOrder[0]
    );
  });

  it('要約の保存に失敗したら、ジョブを積まない', async () => {
    const { prisma } = createPrismaMock();
    prisma.$transaction.mockRejectedValueOnce(new Error('DB error'));
    const generate = jest.fn().mockResolvedValue(generated);
    const schedule = jest.fn().mockResolvedValue(undefined);

    await runWithTimers(
      regenerateSummaries(
        prisma as never,
        { articleIds: ['a1'] },
        generate,
        schedule
      )
    );

    expect(schedule).not.toHaveBeenCalled();
  });

  it('SummaryManager は、要約サービスの scheduleEmbedding で積む', async () => {
    const { prisma } = createPrismaMock();
    const service = {
      generateSummary: jest.fn().mockResolvedValue({
        summary: '要約',
        detailedSummary: '・詳細',
        tags: [],
        qualityScore: 80,
        processingTimeMs: 1,
        summaryVersion: 9,
      }),
      scheduleEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    const manager = new SummaryManager(prisma as never, service as never);

    await runWithTimers(manager.regenerateSummaries({ articleIds: ['a1'] }));

    expect(service.generateSummary.mock.calls[0][0]).not.toHaveProperty(
      'articleId'
    );
    expect(service.scheduleEmbedding).toHaveBeenCalledWith('a1');
  });
});
