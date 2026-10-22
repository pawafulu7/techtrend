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

describe('JobProcessor.processJob と積み直し（取得の後に要約が保存し直された場合）', () => {
  beforeEach(() => {
    resetPrismaMock();
    mockEmbedArticle.mockReset();
  });

  it('取得したときの queuedAt（前後 1ms）のジョブだけを確保する', async () => {
    prismaMock.embeddingJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.embeddingJob.findUnique.mockResolvedValue({ id: 'job-1' });
    mockEmbedArticle.mockResolvedValueOnce({ success: true });
    const job = buildJob(0);

    await new JobProcessor().processJob(job);

    expect(prismaMock.embeddingJob.updateMany.mock.calls[0][0].where).toEqual({
      id: 'job-1',
      status: 'PENDING',
      queuedAt: {
        gte: new Date(job.queuedAt.getTime() - 1),
        lte: new Date(job.queuedAt.getTime() + 1),
      },
    });
  });

  it('取得の後に積み直されていたら（確保できなければ）、古い要約を埋め込まない', async () => {
    prismaMock.embeddingJob.updateMany.mockResolvedValue({ count: 0 });

    await new JobProcessor().processJob(buildJob(0));

    expect(mockEmbedArticle).not.toHaveBeenCalled();
    expect(prismaMock.embeddingJob.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['完了', () => mockEmbedArticle.mockResolvedValueOnce({ success: true })],
    ['失敗', () => mockEmbedArticle.mockResolvedValueOnce({ success: false, error: 'boom' })],
  ])('%s の書き込みは、確保したまま（PROCESSING・取得したときの queuedAt）のときだけにする', async (_label, arrange) => {
    // 処理中に積み直されると PENDING・新しい queuedAt になり、この条件に当たらないので上書きしない
    prismaMock.embeddingJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.embeddingJob.findUnique.mockResolvedValue({ id: 'job-1' });
    arrange();
    const job = buildJob(0);

    await new JobProcessor().processJob(job);

    const calls = prismaMock.embeddingJob.updateMany.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].where).toEqual({
      id: 'job-1',
      status: 'PROCESSING',
      queuedAt: {
        gte: new Date(job.queuedAt.getTime() - 1),
        lte: new Date(job.queuedAt.getTime() + 1),
      },
    });
  });

  it('例外の後の書き込みも、確保したままのときだけにする', async () => {
    prismaMock.embeddingJob.updateMany.mockResolvedValue({ count: 1 });
    mockEmbedArticle.mockRejectedValueOnce(new Error('boom'));
    const job = buildJob(0);

    await expect(new JobProcessor().processJob(job)).rejects.toThrow('boom');

    const calls = prismaMock.embeddingJob.updateMany.mock.calls;
    expect(calls[calls.length - 1][0].where).toEqual({
      id: 'job-1',
      status: 'PROCESSING',
      queuedAt: {
        gte: new Date(job.queuedAt.getTime() - 1),
        lte: new Date(job.queuedAt.getTime() + 1),
      },
    });
  });
});
