/**
 * POST /api/inquiries
 *
 * 未ログインでも送れる問い合わせの受付。ミドルウェア（CSRF・IP 単位のレート制限）は
 * 素通しにし、withRateLimit が handler に渡すセッションだけを再現する。
 */
let currentSession: unknown = null;

jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (handler: Function) => handler,
}));

jest.mock('@/lib/middleware/with-rate-limit', () => {
  const actual = jest.requireActual('@/lib/middleware/with-rate-limit');
  return {
    ...actual,
    // 実物と同じく、解決したセッションを context.session で handler に渡す
    withRateLimit:
      (_key: string, handler: Function) =>
      (request: unknown, context?: object) =>
        handler(request, { ...context, session: currentSession }),
  };
});

jest.mock('@/lib/rate-limiter', () => {
  const actual = jest.requireActual('@/lib/rate-limiter');
  return {
    ...actual,
    checkRateLimit: jest.fn(),
    createRateLimiterFromConfig: jest.fn(() => ({})),
  };
});

jest.mock('@/lib/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return {
    __esModule: true,
    default: log,
    logger: log,
    hashSensitiveValue: (v: unknown) => `[HASHED:${String(v).length}]`,
  };
});

jest.mock('@/lib/prisma');

import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { Prisma } from '@/lib/prisma-exports';
import { checkRateLimit, RateLimitError } from '@/lib/rate-limiter';
import { POST } from '@/app/api/inquiries/route';
import { INQUIRY_REQUEST_MAX_BYTES } from '@/lib/inquiries/constants';

const prismaMock = prisma as any;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<
  typeof checkRateLimit
>;
const mockLogger = logger as unknown as Record<
  'info' | 'warn' | 'error',
  jest.Mock
>;

const MARKER_MESSAGE = 'マーカー本文-7f3a';
const MARKER_EMAIL = 'marker-7f3a@example.com';

// jest は next/server をモック（__mocks__/next/server.ts）に差し替えていて、その NextRequest は
// 本文を文字列のまま持つ。本文をストリームで読む処理を通すため、本物の Request で作る
function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/inquiries', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

async function send(body: unknown, headers?: Record<string, string>) {
  const response = await (POST as Function)(postRequest(body, headers));
  return { status: response.status, json: await response.json(), response };
}

const validBody = {
  category: 'FEATURE_REQUEST',
  message: MARKER_MESSAGE,
};

function signedIn(overrides: Record<string, unknown> = {}) {
  currentSession = {
    user: {
      id: 'user-1',
      email: 'account@example.com',
      name: 'User One',
      deletedAt: null,
      ...overrides,
    },
    session: { id: 's1', userId: 'user-1' },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  currentSession = null;
  prismaMock.inquiry.create.mockReset();
  prismaMock.inquiry.create.mockResolvedValue({ id: 'inq-1' });
  mockCheckRateLimit.mockResolvedValue({
    limit: 50,
    remaining: 49,
    reset: new Date(),
  });
});

describe('POST /api/inquiries', () => {
  describe('保存', () => {
    it('未ログインの送信を保存する（userId なし）', async () => {
      const { status, json } = await send({
        ...validBody,
        contactEmail: MARKER_EMAIL,
      });

      expect(status).toBe(201);
      expect(json).toEqual({ data: { received: true, linkedToAccount: false } });
      expect(prismaMock.inquiry.create).toHaveBeenCalledWith({
        data: {
          category: 'FEATURE_REQUEST',
          message: MARKER_MESSAGE,
          contactEmail: MARKER_EMAIL,
          userId: null,
        },
        select: { id: true },
      });
    });

    it('未ログインで返信先が空なら null で保存する', async () => {
      await send({ ...validBody, contactEmail: '   ' });

      expect(prismaMock.inquiry.create.mock.calls[0][0].data.contactEmail).toBeNull();
    });

    it('ログイン中はアカウントに紐付け、送信時のアカウントのメールを返信先にする', async () => {
      signedIn();

      const { status, json } = await send({
        ...validBody,
        contactEmail: 'other@example.com',
      });

      expect(status).toBe(201);
      expect(json.data.linkedToAccount).toBe(true);
      expect(prismaMock.inquiry.create.mock.calls[0][0].data).toMatchObject({
        userId: 'user-1',
        contactEmail: 'account@example.com',
      });
    });

    it('退会済み（deletedAt あり）のセッションは未ログイン扱い', async () => {
      signedIn({ deletedAt: new Date() });

      const { json } = await send(validBody);

      expect(json.data.linkedToAccount).toBe(false);
      expect(prismaMock.inquiry.create.mock.calls[0][0].data).toMatchObject({
        userId: null,
        contactEmail: null,
      });
    });

    it('保存までの間に User が消えた（P2003）ら、紐付けを外して保存し直す', async () => {
      signedIn();
      prismaMock.inquiry.create
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('fk', {
            code: 'P2003',
            clientVersion: 'test',
          })
        )
        .mockResolvedValueOnce({ id: 'inq-2' });

      const { status, json } = await send(validBody);

      expect(status).toBe(201);
      expect(json.data.linkedToAccount).toBe(false);
      expect(prismaMock.inquiry.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.inquiry.create.mock.calls[1][0].data).toMatchObject({
        userId: null,
        contactEmail: 'account@example.com',
      });
    });

    it('本文を正規化して保存する（制御文字を除き、改行とタブと HTML タグは残す）', async () => {
      await send({
        ...validBody,
        message: '  <b>一行目</b>\r\n\t二行目\u0000\u202E  ',
      });

      expect(prismaMock.inquiry.create.mock.calls[0][0].data.message).toBe(
        '<b>一行目</b>\n\t二行目'
      );
    });

    it('本文はちょうど 5000 文字なら保存する', async () => {
      const { status } = await send({ ...validBody, message: 'あ'.repeat(5000) });

      expect(status).toBe(201);
    });
  });

  describe('入力の検証（400）', () => {
    it.each([
      ['種別が無い', { message: 'x' }, 'category', '種別を選んでください'],
      ['種別が不正', { category: 'SPAM', message: 'x' }, 'category', '種別を選んでください'],
      ['本文が無い', { category: 'OTHER' }, 'message', '内容を書いてください'],
      ['本文が空白だけ', { category: 'OTHER', message: ' \n\t ' }, 'message', '内容を書いてください'],
      ['本文が制御文字だけ', { category: 'OTHER', message: '\u0000\u0007' }, 'message', '内容を書いてください'],
      ['本文が 5001 文字', { category: 'OTHER', message: 'あ'.repeat(5001) }, 'message', '5000 文字以内で書いてください'],
      ['メールの形式が不正', { ...validBody, contactEmail: 'not-an-email' }, 'contactEmail', 'メールアドレスの形式を確かめてください'],
      ['メールが 254 文字を超える', { ...validBody, contactEmail: `${'a'.repeat(250)}@example.com` }, 'contactEmail', 'メールアドレスの形式を確かめてください'],
    ])('%s', async (_label, body, field, message) => {
      const { status, json } = await send(body);

      expect(status).toBe(400);
      expect(json.error).toMatchObject({ code: 'VALIDATION_ERROR', field, message });
      expect(prismaMock.inquiry.create).not.toHaveBeenCalled();
    });

    it('余分な項目があれば 400', async () => {
      const { status, json } = await send({ ...validBody, userId: 'someone' });

      expect(status).toBe(400);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(prismaMock.inquiry.create).not.toHaveBeenCalled();
    });

    it('JSON として読めなければ 400', async () => {
      const { status, json } = await send('{"category":');

      expect(status).toBe(400);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('本文の大きさ（413）', () => {
    it('Content-Length が上限を超えていれば 413', async () => {
      const { status, json } = await send(validBody, {
        'content-length': String(INQUIRY_REQUEST_MAX_BYTES + 1),
      });

      expect(status).toBe(413);
      expect(json.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(prismaMock.inquiry.create).not.toHaveBeenCalled();
    });

    it('実際の本文が上限を超えていれば 413', async () => {
      const { status } = await send({
        ...validBody,
        message: 'x'.repeat(INQUIRY_REQUEST_MAX_BYTES),
      });

      expect(status).toBe(413);
    });
  });

  describe('bot 避けの隠し項目', () => {
    it('値があれば保存せず、通常と同じ 201 を返す', async () => {
      const { status, json } = await send({ ...validBody, website: 'http://spam.example' });

      expect(status).toBe(201);
      expect(json).toEqual({ data: { received: true, linkedToAccount: false } });
      expect(prismaMock.inquiry.create).not.toHaveBeenCalled();
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { event: 'inquiry.honeypot' },
        expect.any(String)
      );
    });

    it('空文字なら通常どおり保存する', async () => {
      const { status } = await send({ ...validBody, website: '' });

      expect(status).toBe(201);
      expect(prismaMock.inquiry.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('保存件数の全体上限', () => {
    it('超えたら保存せずに 429 と Retry-After を返す', async () => {
      mockCheckRateLimit.mockRejectedValue(
        new RateLimitError('limit', 50, 0, new Date(Date.now() + 120_000))
      );

      const { status, json, response } = await send(validBody);

      expect(status).toBe(429);
      expect(json.error).toBe('rate_limited');
      expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(prismaMock.inquiry.create).not.toHaveBeenCalled();
    });

    it('検証で落ちた要求は全体上限を数えない', async () => {
      await send({ category: 'OTHER', message: '' });

      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });
  });

  describe('個人情報', () => {
    it('応答に本文・返信先・id を含めない', async () => {
      const { json } = await send({ ...validBody, contactEmail: MARKER_EMAIL });

      const text = JSON.stringify(json);
      expect(text).not.toContain(MARKER_MESSAGE);
      expect(text).not.toContain(MARKER_EMAIL);
      expect(text).not.toContain('inq-1');
    });

    it('保存に失敗しても、ログに本文・返信先を渡さない', async () => {
      prismaMock.inquiry.create.mockRejectedValue(
        new Error(`failed with ${MARKER_MESSAGE} ${MARKER_EMAIL}`)
      );

      const { status } = await send({ ...validBody, contactEmail: MARKER_EMAIL });

      expect(status).toBe(500);
      const logged = JSON.stringify([
        ...mockLogger.info.mock.calls,
        ...mockLogger.warn.mock.calls,
        ...mockLogger.error.mock.calls,
      ]);
      expect(logged).not.toContain(MARKER_MESSAGE);
      expect(logged).not.toContain(MARKER_EMAIL);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { errorName: 'Error', errorCode: undefined },
        expect.any(String)
      );
    });
  });
});
