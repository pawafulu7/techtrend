/**
 * GEMINI_BASE_URL・GEMINI_MODEL が全経路の Gemini 呼び出しに反映されることを検証する（issue #655 項目 3・4）
 *
 * DI の主経路（GeminiTransportImpl）は以前から設定の base URL を使っている。
 * ここでは直書きが残っていた経路（週次差分要約・トレンドレポート）を見る。
 */

jest.mock('@/lib/rag/embedding-scheduler', () => ({
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
} from '@/lib/ai/gemini-config';
import { LLMExtractionPipeline } from '@/lib/ai/extraction/llm-extraction-pipeline';
import { generateGeminiText } from '@/lib/ai/gemini-sdk';
import { TrendReportGenerator } from '@/lib/trends/report/trend-report-generator';
import type { TrendGeminiModel } from '@/lib/trends/report/trend-ai-summary-generator';
import { GEMINI_API } from '@/lib/constants';
import { loadConfig } from '@/lib/di/config';

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

/** SDK（@google/genai）は本物の Response を読むので、呼ばれるたびに作り直す */
const sdkOkResponse = () =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

/** トレンドレポートが要約を作るときに読み込む SDK のクライアントとモデル（private） */
const trendModelOf = (generator: TrendReportGenerator) =>
  (
    generator as unknown as {
      loadGeminiModel: () => Promise<TrendGeminiModel | null>;
    }
  ).loadGeminiModel();

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

  it('トレンドレポート（SDK）がその base URL を、要約と別のモデルで呼ぶ', async () => {
    mockFetch.mockImplementation(async () => sdkOkResponse());
    const trendModel = await trendModelOf(
      new TrendReportGenerator({} as never)
    );
    if (!trendModel)
      throw new Error('API キーがあるのに SDK のクライアントが無い');

    // 生成時と同じ関数で呼ぶ（リクエストごとの httpOptions を渡しても base URL が残ることも見る）
    const text = await generateGeminiText(trendModel.client, {
      model: trendModel.model,
      prompt: 'prompt',
      maxOutputTokens: 10,
      temperature: 0,
      timeoutMs: 1000,
    });

    expect(text).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${expectedBaseUrl}/v1beta/models/${GEMINI_API.TREND_MODEL}:generateContent`
    );
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe(
      'test-api-key'
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

  it('週次差分要約が設定のモデルを使う', () => {
    expect(getGeminiModel()).toBe('gemini-custom');
    expect(new LLMExtractionPipeline().getModelVersion()).toBe('gemini-custom');
  });

  it('トレンドレポートのモデルは GEMINI_MODEL で変わらない', async () => {
    expect(getGeminiTrendModel()).toBe(GEMINI_API.TREND_MODEL);
    const trendModel = await trendModelOf(
      new TrendReportGenerator({} as never)
    );
    expect(trendModel?.model).toBe(GEMINI_API.TREND_MODEL);
  });
});

describe('GEMINI_BASE_URL の末尾のスラッシュ', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
    resetGeminiConfigCache();
  });

  it('設定の読み込み時に除く（DI の主経路も同じ値を使う）', () => {
    process.env = { ...originalEnv, GEMINI_BASE_URL: `${PROXY_BASE_URL}/` };
    resetEnvCache();

    expect(loadConfig().gemini.baseUrl).toBe(PROXY_BASE_URL);
  });

  it('末尾のスラッシュを除いてパスをつなぐ', () => {
    process.env = { ...originalEnv, GEMINI_BASE_URL: `${PROXY_BASE_URL}/` };
    resetEnvCache();
    resetGeminiConfigCache();

    expect(getGeminiBaseUrl()).toBe(PROXY_BASE_URL);
    expect(buildGeminiModelUrl('m1')).toBe(
      `${PROXY_BASE_URL}/v1beta/models/m1:generateContent`
    );
  });
});
