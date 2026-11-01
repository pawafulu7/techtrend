/**
 * TrendReportGenerator の AI 要約まわりを確かめる
 * - Gemini の SDK（@google/genai）は要約を作るときだけ読み込む。daily-report は公開ページと API の
 *   読み出しのためにこのクラスを作るので、読み出しだけの経路で依存の大きい SDK を読み込まない。
 *   テストごとにモジュールを読み込み直し、import した時点で SDK が読み込まれないことも見る
 * - 構造化要約に失敗したときの legacy 要約は、出力の上限で切れた本文を保存しない
 */

import type { PrismaClient } from '@/lib/prisma-exports';
import type { TrendGeminiModel } from '@/lib/trends/report/trend-ai-summary-generator';
import {
  createTrendReportPrismaMock,
  savedAiFields,
} from '../../../helpers/trend-report-prisma-mock';

let mockSdkLoaded = false;
jest.mock('@google/genai', () => {
  mockSdkLoaded = true;
  return jest.requireActual('@google/genai');
});

jest.mock('@/lib/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return { __esModule: true, default: mockLogger, logger: mockLogger };
});

type GeneratorUnderTest = {
  loadGeminiModel: () => Promise<TrendGeminiModel | null>;
  generateDailyReport: (targetDate?: Date) => Promise<string>;
};

/** モジュールを読み込み直して、作ったばかりの生成器を返す */
const freshGenerator = async (prisma: PrismaClient = {} as never) => {
  let generator: unknown;
  await jest.isolateModulesAsync(async () => {
    const { TrendReportGenerator } =
      await import('@/lib/trends/report/trend-report-generator');
    generator = new TrendReportGenerator(prisma);
  });
  return generator as GeneratorUnderTest;
};

const TARGET_DATE = new Date('2026-10-23T03:00:00Z');

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const textResponse = (text: string, finishReason: string) =>
  jsonResponse({
    candidates: [{ content: { parts: [{ text }] }, finishReason }],
  });

describe('TrendReportGenerator の AI 要約', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // 前のテストが読み込んだ SDK を捨てる（残ると次の読み込みでモックのファクトリが呼ばれず、
    // mockSdkLoaded で「読み込まない」を確かめられない）
    jest.resetModules();
    mockFetch.mockReset();
    mockSdkLoaded = false;
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };
    delete process.env.GEMINI_BASE_URL;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('SDK の読み込み', () => {
    it('import して作っただけでは SDK を読み込まず、要約に使うときに読み込む', async () => {
      const generator = await freshGenerator();
      expect(mockSdkLoaded).toBe(false);

      const model = await generator.loadGeminiModel();

      expect(mockSdkLoaded).toBe(true);
      const { GEMINI_API } = jest.requireActual('@/lib/constants');
      expect(model?.model).toBe(GEMINI_API.TREND_MODEL);
      // 2 回目は同じクライアントを使い回す
      expect(await generator.loadGeminiModel()).toBe(model);
    });

    it('API キーが無ければ、記事があってもレポートを AI 要約なしで保存し、SDK を読み込まない', async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      const { prisma, create } = createTrendReportPrismaMock();

      const generator = await freshGenerator(prisma);
      await generator.generateDailyReport(TARGET_DATE);

      expect(savedAiFields(create)).toEqual({
        aiSummary: undefined,
        aiModel: undefined,
        promptVersion: undefined,
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSdkLoaded).toBe(false);
    });
  });

  describe('legacy 要約', () => {
    // 構造化要約（JSON 指定のリクエスト）は JSON にならない本文を返して 4 回とも失敗させ、
    // legacy 要約（JSON 指定なし）に legacyResponse を返す
    const isJsonRequest = (init: RequestInit) =>
      JSON.parse(String(init.body)).generationConfig?.responseMimeType ===
      'application/json';
    const routeFetch = (legacyResponse: () => Response) => {
      mockFetch.mockImplementation(async (_url: string, init: RequestInit) =>
        isJsonRequest(init)
          ? textResponse('JSON ではない本文', 'STOP')
          : legacyResponse()
      );
    };
    /** legacy 要約（JSON 指定なし）のリクエストの数 */
    const legacyRequestCount = () =>
      (mockFetch.mock.calls as [string, RequestInit][]).filter(
        ([, init]) => !isJsonRequest(init)
      ).length;
    const LEGACY_TEXT =
      '[注目トピック]\n(1) TypeScript: 型推論の改善が公開された。'.repeat(5);

    it.each(['MAX_TOKENS', 'CONTINUATION', 'OTHER'])(
      '最後まで出力されなかった本文（%s）は、長さが足りても保存しない',
      async (finishReason) => {
        routeFetch(() => textResponse(LEGACY_TEXT, finishReason));
        const { prisma, create } = createTrendReportPrismaMock();

        await (await freshGenerator(prisma)).generateDailyReport(TARGET_DATE);

        expect(legacyRequestCount()).toBe(1);
        expect(LEGACY_TEXT.length).toBeGreaterThanOrEqual(100);
        expect(savedAiFields(create).aiSummary).toBeUndefined();
      }
    );

    it('最後まで出力された本文は、プレーンテキストの要約として保存する', async () => {
      routeFetch(() => textResponse(LEGACY_TEXT, 'STOP'));
      const { prisma, create } = createTrendReportPrismaMock();

      await (await freshGenerator(prisma)).generateDailyReport(TARGET_DATE);

      const { GEMINI_API } = jest.requireActual('@/lib/constants');
      expect(savedAiFields(create)).toEqual({
        aiSummary: LEGACY_TEXT,
        aiModel: GEMINI_API.TREND_MODEL,
        promptVersion: undefined,
      });
    });
  });
});
