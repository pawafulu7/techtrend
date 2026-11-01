/**
 * TrendReportGenerator が Gemini の SDK（@google/genai）を要約を作るときだけ読み込むことを確かめる
 *
 * daily-report は公開ページと API の読み出しのためにこのクラスを作る。
 * SDK は依存が大きいので、読み出しだけの経路で読み込まない。
 * テストごとにモジュールを読み込み直し、import した時点で SDK が読み込まれないことも見る。
 */

import type { TrendGeminiModel } from '@/lib/trends/report/trend-ai-summary-generator';

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

/** モジュールを読み込み直して、作ったばかりの生成器を返す */
const freshGenerator = async () => {
  let generator: unknown;
  await jest.isolateModulesAsync(async () => {
    const { TrendReportGenerator } =
      await import('@/lib/trends/report/trend-report-generator');
    generator = new TrendReportGenerator({} as never);
  });
  return generator as {
    loadGeminiModel: () => Promise<TrendGeminiModel | null>;
  };
};

describe('TrendReportGenerator の SDK の読み込み', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockSdkLoaded = false;
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

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

  it('API キーが無ければ SDK を読み込まず、要約を作らない', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const generator = await freshGenerator();

    expect(await generator.loadGeminiModel()).toBeNull();
    expect(mockSdkLoaded).toBe(false);
  });
});
