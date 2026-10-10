/**
 * JobProcessor の例外時の再試行判定（issue #710 のレビューで発見）。
 *
 * job は取得（attempts を 1 増やす）より前の値なので、最後の試行で例外が起きたら FAILED にする。
 * PENDING に戻すと attempts が上限のまま残り、ワーカー（attempts < maxAttempts だけを拾う）が二度と拾わない。
 */

const mockEmbedArticle = jest.fn();

jest.mock('@/lib/rag/article-embedding-pipeline', () => ({
  ArticleEmbeddingPipeline: jest.fn().mockImplementation(() => ({
    embedArticle: (...args: unknown[]) => mockEmbedArticle(...args),
  })),
}));

import { JobProcessor } from '@/lib/workers/job-processor';
import { prisma } from '@/lib/prisma';

const prismaMock = prisma as any;
const { resetPrismaMock } = require('@/lib/prisma') as {
  resetPrismaMock: () => void;
};

function buildJob(attempts: number) {
  return {
    id: 'job-1',
    articleId: 'article-1',
    status: 'PENDING',
    attempts,
    maxAttempts: 3,
    error: null,
    createdAt: new Date(),
    processedAt: null,
    queuedAt: new Date(),
    article: { id: 'article-1', summary: '要約' },
  } as any;
}

/** 例外時の更新（2回目の updateMany）で付けた status を返す */
async function statusAfterException(attempts: number): Promise<string> {
  prismaMock.embeddingJob.updateMany.mockResolvedValue({ count: 1 });
  mockEmbedArticle.mockRejectedValueOnce(new Error('boom'));

  await expect(
    new JobProcessor().processJob(buildJob(attempts))
  ).rejects.toThrow('boom');

  const calls = prismaMock.embeddingJob.updateMany.mock.calls;
  return calls[calls.length - 1][0].data.status;
}

describe('JobProcessor.processJob の例外時の再試行', () => {
  beforeEach(() => {
    resetPrismaMock();
    mockEmbedArticle.mockReset();
  });

  it('最後の試行（取得前 attempts=2, maxAttempts=3）で例外が起きたら FAILED にする', async () => {
    expect(await statusAfterException(2)).toBe('FAILED');
  });

  it('まだ試行が残っていれば PENDING に戻す', async () => {
    expect(await statusAfterException(1)).toBe('PENDING');
  });
});
