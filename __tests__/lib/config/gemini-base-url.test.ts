/**
 * GEMINI_BASE_URL・GEMINI_MODEL が全経路の Gemini 呼び出しに反映されることを検証する（issue #655 項目 3・4）
 *
 * DI の主経路（GeminiTransportImpl）は以前から設定の base URL を使っている。
 * ここでは直書きが残っていた経路（週次差分要約・旧要約サービス・GeminiClient・トレンドレポート）を見る。
 */

const mockGetGenerativeModel = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: (...args: unknown[]) => mockGetGenerativeModel(...args),
  })),
}));

const mockNodeFetch = jest.fn();
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockNodeFetch(...args),
}));

jest.mock('@/lib/services/embedding-scheduler', () => ({
  EmbeddingScheduler: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/lib/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return { __esModule: true, default: mockLogger, logger: mockLogger };
});

import { resetEnvCache } from '@/lib/config/env';
import {
  buildGeminiEndpoint,
  buildGeminiModelUrl,
  getGeminiBaseUrl,
  getGeminiModel,
  getGeminiTrendModel,
  resetGeminiConfigCache,
} from '@/lib/config/gemini';
import { LLMExtractionPipeline } from '@/lib/ai/extraction/llm-extraction-pipeline';
import { UnifiedSummaryService } from '@/lib/ai/unified-summary-service';
import { GeminiClient } from '@/lib/ai/gemini';
import { TrendReportGenerator } from '@/lib/services/trend-report/trend-report-generator';
import { GEMINI_API } from '@/lib/constants';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const PROXY_BASE_URL = 'https://gemini-proxy.example.test';

const okResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: 'ok' }] } }],
  }),
  text: async () => 'ok',
});

describe.each([
  ['未設定', undefined, DEFAULT_BASE_URL],
  ['設定あり', PROXY_BASE_URL, PROXY_BASE_URL],
])('GEMINI_BASE_URL %s', (_label, baseUrlEnv, expectedBaseUrl) => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };
    delete process.env.GEMINI_MODEL;
    if (baseUrlEnv) {
      process.env.GEMINI_BASE_URL = baseUrlEnv;
    } else {
      delete process.env.GEMINI_BASE_URL;
    }
    resetEnvCache();
    resetGeminiConfigCache();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValue(okResponse());
    mockNodeFetch.mockResolvedValue(okResponse());
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    resetEnvCache();
    resetGeminiConfigCache();
  });

  it('共有設定が base URL を返す', () => {
    expect(getGeminiBaseUrl()).toBe(expectedBaseUrl);
    expect(buildGeminiModelUrl('m1')).toBe(
      `${expectedBaseUrl}/v1beta/models/m1:generateContent`
    );
    expect(buildGeminiEndpoint('k1')).toBe(
      `${expectedBaseUrl}/v1beta/models/gemini-2.5-flash-lite:generateContent?key=k1`
    );
  });

  it('週次差分要約（LLMExtractionPipeline）がその URL を呼ぶ', async () => {
    const pipeline = new LLMExtractionPipeline();
    await (
      pipeline as unknown as {
        callAPI: (prompt: string, opts: unknown) => Promise<string>;
      }
    ).callAPI('prompt', { temperature: 0, maxOutputTokens: 10 });

    expect(mockFetch).toHaveBeenCalledWith(
      `${expectedBaseUrl}/v1beta/models/gemini-2.5-flash-lite:generateContent`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('旧要約サービス（UnifiedSummaryService）がその URL を呼ぶ', async () => {
    const service = new UnifiedSummaryService();
    await (
      service as unknown as {
        callGeminiAPI: (prompt: string) => Promise<string>;
      }
    ).callGeminiAPI('prompt');

    expect(mockNodeFetch).toHaveBeenCalledWith(
      `${expectedBaseUrl}/v1beta/models/gemini-2.5-flash-lite:generateContent?key=test-api-key`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('GeminiClient（SDK）に base URL を渡す', () => {
    new GeminiClient('test-api-key');

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      { model: 'gemini-2.5-flash-lite' },
      { baseUrl: expectedBaseUrl }
    );
  });

  it('トレンドレポート（SDK）に base URL を渡し、モデルは要約と別のまま', () => {
    new TrendReportGenerator({} as never);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      { model: GEMINI_API.TREND_MODEL },
      { baseUrl: expectedBaseUrl }
    );
  });
});

describe('GEMINI_MODEL', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'test-api-key',
      GEMINI_MODEL: 'gemini-custom',
    };
    delete process.env.GEMINI_BASE_URL;
    resetEnvCache();
    resetGeminiConfigCache();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValue(okResponse());
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    resetEnvCache();
    resetGeminiConfigCache();
  });

  it('週次差分要約・旧要約サービスが設定のモデルを使う', () => {
    expect(getGeminiModel()).toBe('gemini-custom');
    expect(new LLMExtractionPipeline().getModelVersion()).toBe('gemini-custom');
    expect(
      (new UnifiedSummaryService() as unknown as { apiUrl: string }).apiUrl
    ).toContain('/models/gemini-custom:generateContent');
  });

  it('トレンドレポートのモデルは GEMINI_MODEL で変わらない', () => {
    expect(getGeminiTrendModel()).toBe(GEMINI_API.TREND_MODEL);
    new TrendReportGenerator({} as never);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      { model: GEMINI_API.TREND_MODEL },
      expect.anything()
    );
  });
});
