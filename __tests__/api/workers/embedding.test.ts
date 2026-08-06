import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import type { Article, PrismaClient } from '@/lib/prisma-exports';

// Mock withEmbeddingWorkerAuth to pass through (auth middleware is tested separately below).
// jest.fn でラップしているのは配線テスト（末尾の describe）で呼び出し引数を検証するため。
jest.mock('@/app/api/workers/embedding/with-embedding-worker-auth', () => ({
  withEmbeddingWorkerAuth: jest.fn((handler: any) => handler),
}));

// route.ts は withEmbeddingWorkerAuth の内側に withRateLimit を挟む構成のため、
// 上記のパススルーモックだけでは実レートリミッタ（Redis 依存）が走ってしまう。
// ハンドラのテストはレート制限の検証が目的ではないのでパススルーにする
// （__tests__/api/admin/articles-actions.test.ts と同じ方針）。
// ただしパススルーのままだと「レート制限が外れた」「設定キーを間違えた」変更を
// 検出できないため、jest.fn でラップして末尾の配線テストで引数を検証する。
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: any) => handler),
}));

// Ensure Next.js server APIs are mocked in Jest (Node env)
jest.mock('next/server');
// Unmock Prisma client to use real implementation (overrides jest.setup.node.js global mock)
jest.mock('@/lib/prisma-exports', () => jest.requireActual('@/lib/prisma-exports'));
// Mock @/lib/prisma to use real Prisma client instead of mock
jest.mock('@/lib/prisma', () => jest.requireActual('../../../lib/prisma'));

// Import route handler AFTER mock setup
import { GET } from '@/app/api/workers/embedding/route';

// Use real Prisma client (bypass all mocks)
// jest.requireActual bypasses jest.mock('@/lib/prisma-exports') from jest.setup.node.js
const { PrismaClient: RealPrismaClient } = jest.requireActual('@/lib/prisma-exports');
const { PrismaPg } = jest.requireActual('@prisma/adapter-pg');
const DB_URL = process.env.DATABASE_URL;
const isSafeTestDb = !!DB_URL && /(localhost|127\.0\.0\.1|test|_test)/i.test(DB_URL);
const describeIf = isSafeTestDb ? describe : describe.skip;
let prisma: PrismaClient;

describeIf('GET /api/workers/embedding', () => {
  let testArticles: Article[] = [];
  let testSource: { id: string };

  beforeAll(async () => {
    // Lazily create client when tests actually run
    const adapter = new PrismaPg({ connectionString: DB_URL! });
    prisma = new RealPrismaClient({ adapter });
    await prisma.$connect();

    // Always create an isolated test source
    testSource = await prisma.source.create({
      data: {
        name: `Test Source for Worker ${Date.now()}`,
        url: `https://example.com/test-source-${Date.now()}`,
        type: 'RSS',
        enabled: true,
      },
    });

    // Create test articles with jobs
    for (let i = 0; i < 3; i++) {
      const article = await prisma.article.create({
        data: {
          title: `Worker Test Article ${i}`,
          url: `https://example.com/worker-test-${i}-${Date.now()}`,
          summary: `Worker test summary ${i}`,
          sourceId: testSource.id,
          publishedAt: new Date(),
        },
      });

      await prisma.embeddingJob.create({
        data: {
          articleId: article.id,
          status: 'PENDING',
        },
      });

      testArticles.push(article);
    }
  });

  afterAll(async () => {
    // Cleanup - jobs cascade when articles deleted
    const articleIds = testArticles.map((a) => a.id);
    await prisma.article.deleteMany({
      where: { id: { in: articleIds } },
    });

    // Delete test source
    await prisma.source.delete({
      where: { id: testSource.id },
    });

    // Disconnect from database
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset jobs to PENDING before each test
    const articleIds = testArticles.map((a) => a.id);
    await prisma.embeddingJob.updateMany({
      where: { articleId: { in: articleIds } },
      data: {
        status: 'PENDING',
        attempts: 0,
        error: null,
        processedAt: null,
      },
    });
  });

  it('should process pending jobs', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/workers/embedding?skip_embedding=true'
    );

    const response = await GET(request);
    const data = await response.json();

    // Debug: log error if status is not 200
    if (response.status !== 200) {
      console.error('Worker failed with status:', response.status);
      console.error('Error data:', data);
    }

    expect(response.status).toBe(200);
    expect(data.status).toMatch(/completed|idle/);
    expect(data.processed).toBeGreaterThanOrEqual(0);

    if (data.status === 'completed') {
      expect(data.succeeded).toBeGreaterThan(0);
      expect(data.durationMs).toBeGreaterThan(0);
    }

    // Verify DB state (jobs marked COMPLETED)
    const ids = testArticles.map((a) => a.id);
    const jobs = await prisma.embeddingJob.findMany({
      where: { articleId: { in: ids } },
      select: { status: true, processedAt: true },
    });

    // At least some jobs should be COMPLETED
    expect(jobs.some((j) => j.status === 'COMPLETED')).toBe(true);

    // COMPLETED jobs should have processedAt
    jobs
      .filter((j) => j.status === 'COMPLETED')
      .forEach((j) => expect(j.processedAt).not.toBeNull());
  });

  it('should return idle status when no jobs', async () => {
    // Mark ALL pending jobs as completed (not just test articles)
    await prisma.embeddingJob.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'COMPLETED' },
    });

    const request = new NextRequest('http://localhost:3000/api/workers/embedding');

    const response = await GET(request);
    const data = await response.json();

    // Debug: log error if status is not 200
    if (response.status !== 200) {
      console.error('Worker failed with status:', response.status);
      console.error('Error data:', data);
    }

    expect(response.status).toBe(200);
    expect(data.status).toBe('idle');
    expect(data.processed).toBe(0);
    expect(data.message).toBe('No pending jobs');
  });

  it('should not crash when jobs are cascade-deleted with articles', async () => {
    // Create article with job using the same test source
    const article = await prisma.article.create({
      data: {
        title: 'To Be Deleted',
        url: `https://example.com/to-delete-${Date.now()}`,
        summary: 'Will be deleted',
        sourceId: testSource.id,
        publishedAt: new Date(),
      },
    });

    await prisma.embeddingJob.create({
      data: {
        articleId: article.id,
        status: 'PENDING',
      },
    });

    // Delete article (cascade deletes job)
    await prisma.article.delete({
      where: { id: article.id },
    });

    // Worker should handle gracefully
    const request = new NextRequest(
      'http://localhost:3000/api/workers/embedding?skip_embedding=true'
    );

    const response = await GET(request);
    const data = await response.json();

    // Debug: log error if status is not 200
    if (response.status !== 200) {
      console.error('Worker failed with status:', response.status);
      console.error('Error data:', data);
    }

    expect(response.status).toBe(200);
    // Should complete without errors
    expect(data.status).toMatch(/completed|idle/);
  });
});

// withEmbeddingWorkerAuth is mocked as a pass-through above for the handler
// tests. Here we bypass that mock via jest.requireActual to verify the real
// authentication logic (Bearer-only, no admin session).
describe('withEmbeddingWorkerAuth', () => {
  // '@/app/api/workers/embedding/with-embedding-worker-auth' is mocked as a
  // pass-through above; jest.requireActual bypasses that mock here so we
  // exercise the real authentication logic. 'next/server' is left as the
  // manually-mocked module (__mocks__/next/server.ts) for consistency with
  // the rest of this test file — do NOT requireActual it here.
  const { withEmbeddingWorkerAuth: realWithEmbeddingWorkerAuth } =
    jest.requireActual('@/app/api/workers/embedding/with-embedding-worker-auth');
  const { resetEnvCache } = jest.requireActual('@/lib/config/env');

  const mockHandler = jest.fn().mockImplementation(async () => {
    return NextResponse.json({ success: true });
  });

  beforeEach(() => {
    mockHandler.mockClear();
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TOKEN;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TOKEN;
    resetEnvCache();
  });

  it.each(['CRON_SECRET', 'CRON_TOKEN'] as const)(
    'should return 200 with a valid Bearer token (%s)',
    async (envVar) => {
      process.env[envVar] = 'valid-embedding-secret';
      resetEnvCache();

      const handler = realWithEmbeddingWorkerAuth(mockHandler);
      const request = new NextRequest('http://localhost:3000/api/workers/embedding', {
        headers: { Authorization: 'Bearer valid-embedding-secret' },
      });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    }
  );

  it('should return 401 (fail-closed) with a Bearer token when neither CRON_SECRET nor CRON_TOKEN is set', async () => {
    // Both env vars are deleted in beforeEach; do not set either here.
    resetEnvCache();

    const handler = realWithEmbeddingWorkerAuth(mockHandler);
    const request = new NextRequest('http://localhost:3000/api/workers/embedding', {
      headers: { Authorization: 'Bearer some-token' },
    });

    const response = await handler(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should return 401 without a Bearer token', async () => {
    process.env.CRON_SECRET = 'valid-embedding-secret';
    resetEnvCache();

    const handler = realWithEmbeddingWorkerAuth(mockHandler);
    const request = new NextRequest('http://localhost:3000/api/workers/embedding');

    const response = await handler(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should return 401 for admin-session-equivalent requests (no Authorization header)', async () => {
    process.env.CRON_SECRET = 'valid-embedding-secret';
    resetEnvCache();

    const handler = realWithEmbeddingWorkerAuth(mockHandler);
    // Simulates an admin session cookie request: no Authorization header,
    // just a Cookie header (session auth is intentionally not supported here).
    const request = new NextRequest('http://localhost:3000/api/workers/embedding', {
      headers: { Cookie: 'better-auth.session_token=fake-admin-session' },
    });

    const response = await handler(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockHandler).not.toHaveBeenCalled();
  });
});

// route.ts のミドルウェア配線そのものを検証する。
// 上の2つのモックはパススルーなので、これがないと「withRateLimit が外れた」
// 「設定キーを間違えた」「合成順が入れ替わった」変更をテストが素通りさせてしまう。
//
// withRateLimit / withEmbeddingWorkerAuth は route.ts のトップレベルで
// 呼ばれる（module load 時）ため、`import { GET }` の時点で記録済み。
// このファイルには clearAllMocks / resetMocks がないので記録は保持される。
// DB を使わないため describeIf ではなく通常の describe に置く。
describe('GET /api/workers/embedding のミドルウェア配線', () => {
  const { withRateLimit } = jest.requireMock(
    '@/lib/middleware/with-rate-limit'
  ) as { withRateLimit: jest.Mock };
  const { withEmbeddingWorkerAuth } = jest.requireMock(
    '@/app/api/workers/embedding/with-embedding-worker-auth'
  ) as { withEmbeddingWorkerAuth: jest.Mock };

  it('専用の cron:embedding-worker ポリシーでレート制限されること', () => {
    expect(withRateLimit).toHaveBeenCalledWith(
      'cron:embedding-worker',
      expect.any(Function)
    );
  });

  it('レート制限されたハンドラが withEmbeddingWorkerAuth で包まれていること（認証が外側）', () => {
    const rateLimitedHandler = withRateLimit.mock.results[0].value;

    expect(withEmbeddingWorkerAuth).toHaveBeenCalledWith(rateLimitedHandler);
    expect(GET).toBe(withEmbeddingWorkerAuth.mock.results[0].value);
  });
});
