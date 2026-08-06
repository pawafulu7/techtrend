/**
 * POST /api/articles APIテスト
 *
 * 既存の __tests__/api/articles/articles.test.ts は GET のみをカバーしており、
 * POST は一件もテストされていなかった（セキュリティ P0 対応で新規追加）。
 *
 * ミドルウェア方針:
 * - メインの describe では withAdminAuth / withRateLimit / withCSRFProtection を
 *   すべてパススルーにモックし、ビジネスロジック（Zod 検証・記事作成）のみを検証する
 *   （__tests__/api/admin/articles-actions.test.ts:44-62 の方式を踏襲）。
 * - 「ミドルウェアをモックしない」検証は別 describe ブロックで1件だけ行う
 *   （jest.requireActual で実装をバイパスし、CSRF が最外層であることを確認する）。
 */

import { NextRequest } from 'next/server';

// ---- ロガーモック ----
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ---- Prisma モック (@/lib/prisma) ----
// handlers/post.ts は @/lib/database ではなく @/lib/prisma から prisma を import している
jest.mock('@/lib/prisma', () => ({
  prisma: {
    source: {
      findUnique: jest.fn(),
    },
    article: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// ---- キャッシュモック ----
// post.ts は singleton の cacheInvalidator ではなく `new CacheInvalidator()` を
// ローカルで生成して使うため、クラスのモック実装が必要
jest.mock('@/lib/cache/cache-invalidator', () => ({
  CacheInvalidator: jest.fn().mockImplementation(() => ({
    onArticleCreated: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ---- ミドルウェアモック（認証済みadminとして通す） ----
jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: jest.fn((handler: any) => {
    return (request: any, context: any) => {
      return handler(request, {
        ...context,
        session: { user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' } },
      });
    };
  }),
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: any) => handler),
}));

jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: jest.fn((handler: any) => handler),
}));

// ---- インポート（モック定義後） ----
import { POST } from '@/app/api/articles/route';
import { prisma } from '@/lib/prisma';

const mockPrisma = prisma as any;

const VALID_SOURCE = { id: 'source-1' };

const validPayload = () => ({
  title: 'Valid Article Title',
  url: 'https://example.com/article',
  sourceId: 'source-1',
  summary: 'A short summary',
  content: 'Some content body',
  tagNames: ['TypeScript', 'React'],
});

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/articles (middleware mocked)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma.source.findUnique.mockResolvedValue(VALID_SOURCE);
    mockPrisma.article.findUnique.mockResolvedValue(null); // 重複なし
    mockPrisma.article.create.mockResolvedValue({
      id: 'article-1',
      title: 'Valid Article Title',
      url: 'https://example.com/article',
      summary: 'A short summary',
      content: 'Some content body',
      thumbnail: null,
      publishedAt: new Date('2026-08-05'),
      sourceId: 'source-1',
      source: { id: 'source-1', name: 'Test Source' },
      tags: [{ id: 'tag-1', name: 'TypeScript' }, { id: 'tag-2', name: 'React' }],
      createdAt: new Date('2026-08-05'),
      updatedAt: new Date('2026-08-05'),
    });
  });

  it('有効なペイロードで201を返し、prisma.article.createが呼ばれること', async () => {
    const request = buildRequest(validPayload());
    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('article-1');
    expect(mockPrisma.article.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Valid Article Title',
          url: 'https://example.com/article',
          sourceId: 'source-1',
        }),
      })
    );
  });

  it('titleが501文字の場合400を返すこと', async () => {
    const payload = { ...validPayload(), title: 'a'.repeat(501) };
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it('urlがjavascript:プロトコルの場合400を返すこと', async () => {
    const payload = { ...validPayload(), url: 'javascript:alert(1)' };
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it('tagNamesが21要素の場合400を返すこと', async () => {
    const payload = {
      ...validPayload(),
      tagNames: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
    };
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it('tagNamesの要素が31文字の場合400を返すこと', async () => {
    const payload = { ...validPayload(), tagNames: ['a'.repeat(31)] };
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it('titleが欠落している場合400を返すこと', async () => {
    const { title: _title, ...payload } = validPayload();
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it('urlが欠落している場合400を返すこと', async () => {
    const { url: _url, ...payload } = validPayload();
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it('sourceIdが欠落している場合400を返すこと', async () => {
    const { sourceId: _sourceId, ...payload } = validPayload();
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it('不正なJSONボディの場合400を返すこと', async () => {
    const request = new NextRequest('http://localhost:3000/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-valid-json',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it('存在しないsourceIdの場合400を返すこと', async () => {
    mockPrisma.source.findUnique.mockResolvedValue(null);

    const request = buildRequest(validPayload());
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it('publishedAtが暦上存在しない日付(2026-02-30)の場合400を返すこと', async () => {
    // new Date('2026-02-30') はNaNにならず2026-03-02に正規化されてしまうため、
    // 暦日として存在しない日付を明示的に拒否できているかを確認する回帰テスト。
    const payload = { ...validPayload(), publishedAt: '2026-02-30' };
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it('publishedAtが閏年でない年の2/29(2025-02-29)の場合400を返すこと', async () => {
    const payload = { ...validPayload(), publishedAt: '2025-02-29' };
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it('publishedAtが正常な日付(2026-08-05)の場合201を返すこと', async () => {
    const payload = { ...validPayload(), publishedAt: '2026-08-05' };
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(mockPrisma.article.create).toHaveBeenCalled();
  });

  it('publishedAtが時刻付きISO8601(2026-08-05T12:34:56Z)の場合201を返すこと', async () => {
    const payload = { ...validPayload(), publishedAt: '2026-08-05T12:34:56Z' };
    const request = buildRequest(payload);
    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(mockPrisma.article.create).toHaveBeenCalled();
  });

  it('urlが重複している場合409を返すこと', async () => {
    // DuplicateError は lib/errors/index.ts で statusCode: 409 (DUPLICATE_ERROR) として定義されている
    mockPrisma.article.findUnique.mockResolvedValue({
      id: 'existing-article',
      url: validPayload().url,
    });

    const request = buildRequest(validPayload());
    const response = await POST(request);

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });
});

describe('withCSRFProtection の単体挙動（POST /api/articles の最外層）', () => {
  // 注意: このテストは withCSRFProtection を**単体で**検証するものであり、
  // route.ts の実際の合成チェーン（withCSRFProtection > withRateLimit >
  // withAdminAuth）を実行しているわけではない。ファイル冒頭でミドルウェアを
  // パススルーにモックしているため、実チェーンはこのファイルでは検証できない。
  // 合成順そのものは app/api/admin/articles/[id]/route.ts:221 と同一パターンで
  // あることをコードレビューで担保している。
  //
  // ここで確認したいのは「POST /api/articles の最外層が CSRF であるため、
  // 未認証リクエストは 401 ではなく 403 で拒否される」という**到達順の帰結**で、
  // テストを書く側が 401 を期待して混乱しないための回帰的なドキュメントを兼ねる。
  it('Origin/Refererなしの未認証リクエストは403を返すこと（401ではない）', async () => {
    // jest.mock('@/lib/middleware/csrf-protection', ...) をこのテストだけバイパスし、
    // 実際の CSRF 検証ロジックを通す。
    // 前例: __tests__/api/workers/embedding.test.ts 末尾の withEmbeddingWorkerAuth テスト。
    const { withCSRFProtection: realWithCSRFProtection } = jest.requireActual(
      '@/lib/middleware/csrf-protection'
    );

    const dummyHandler = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 201 })
    );
    const handler = realWithCSRFProtection(dummyHandler);

    // Origin/Referer/sec-fetch-site のいずれも付与しない素の POST。
    // 認証済みセッションも存在しない（jest.setup.node.js のグローバル auth モックが
    // デフォルトで null を返すため、csrf-protection.ts の
    // 「Authorization header or no Origin/Referer」経路も未認証として扱われる）。
    const request = new NextRequest('http://localhost:3000/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });

    const response = await handler(request);

    expect(response.status).toBe(403);
    expect(dummyHandler).not.toHaveBeenCalled();
  });
});
