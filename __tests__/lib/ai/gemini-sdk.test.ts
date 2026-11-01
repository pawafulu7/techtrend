/**
 * @google/genai を使う経路の共通処理を確かめる
 * - getGeminiResponseText: 旧 SDK（@google/generative-ai）の response.text() と
 *   同じ条件で本文を返し、止まった応答を例外にする
 * - generateGeminiText: 旧 SDK と同じリクエストを 1 回だけ送る
 */

import {
  BlockedReason,
  FinishReason,
  GenerateContentResponse,
} from '@google/genai';
import { resetEnvCache } from '@/lib/config/env';
import { resetGeminiConfigCache } from '@/lib/ai/gemini-config';
import {
  createGeminiClient,
  generateGeminiText,
  generateGeminiTextResult,
  isCompleteFinish,
  getGeminiResponseText,
} from '@/lib/ai/gemini-sdk';

// text などは getter だけなので、代入できるフィールドに絞る
const responseOf = (
  fields: Partial<
    Pick<GenerateContentResponse, 'candidates' | 'promptFeedback'>
  >
) => Object.assign(new GenerateContentResponse(), fields);

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('generateGeminiText', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.GEMINI_BASE_URL;
    delete process.env.GOOGLE_GEMINI_BASE_URL;
    delete process.env.GOOGLE_GENAI_USE_VERTEXAI;
    delete process.env.GOOGLE_GENAI_USE_ENTERPRISE;
    resetEnvCache();
    resetGeminiConfigCache();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockImplementation(async () =>
      jsonResponse({
        candidates: [
          { content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' },
        ],
      })
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    resetEnvCache();
    resetGeminiConfigCache();
  });

  const requestOf = (call: number) => {
    const [url, init] = mockFetch.mock.calls[call] as [string, RequestInit];
    return { url, init, body: JSON.parse(String(init.body)) };
  };

  it.each([
    ['JSON 指定あり', 'application/json'],
    ['JSON 指定なし', undefined],
  ])(
    '旧 SDK と同じ本文を 1 回だけ送る（%s）',
    async (_label, responseMimeType) => {
      const text = await generateGeminiText(createGeminiClient('k1'), {
        model: 'm1',
        prompt: 'プロンプト',
        maxOutputTokens: 600,
        temperature: 0.5,
        responseMimeType,
        timeoutMs: 1000,
      });

      expect(text).toBe('ok');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const { url, init, body } = requestOf(0);
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent'
      );
      // タイムアウト（1000ms）は中断のシグナルと、サーバーへの秒数のヘッダーで渡る
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init.headers).get('x-server-timeout')).toBe('1');
      // SDK だけが使う設定（automaticContinuation・httpOptions）は本文に出ない
      expect(body).toEqual({
        contents: [{ role: 'user', parts: [{ text: 'プロンプト' }] }],
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.5,
          ...(responseMimeType ? { responseMimeType } : {}),
        },
      });
    }
  );

  it('generateGeminiTextResult は本文と終了理由を返す', async () => {
    mockFetch.mockImplementationOnce(async () =>
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: '上限で切れた本文' }] },
            finishReason: 'MAX_TOKENS',
          },
        ],
      })
    );

    const result = await generateGeminiTextResult(createGeminiClient('k1'), {
      model: 'm1',
      prompt: 'p',
      maxOutputTokens: 10,
      temperature: 0,
      timeoutMs: 1000,
    });

    expect(result).toEqual({
      text: '上限で切れた本文',
      finishReason: FinishReason.MAX_TOKENS,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('応答が CONTINUATION で終わっても送り直さず、届いた分を返す', async () => {
    // 2 回目以降は beforeEach の通常の応答（送り直すと 2 回目が呼ばれて失敗する）
    mockFetch.mockImplementationOnce(async () =>
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: '途中まで' }] },
            finishReason: 'CONTINUATION',
            continuationToken: 'dG9rZW4=',
          },
        ],
      })
    );

    const text = await generateGeminiText(createGeminiClient('k1'), {
      model: 'm1',
      prompt: 'p',
      maxOutputTokens: 10,
      temperature: 0,
      timeoutMs: 1000,
    });

    expect(text).toBe('途中まで');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each(['GOOGLE_GENAI_USE_VERTEXAI', 'GOOGLE_GENAI_USE_ENTERPRISE'])(
    '%s=true があっても Gemini API のパスを呼ぶ',
    async (envName) => {
      process.env[envName] = 'true';

      await generateGeminiText(createGeminiClient('k1'), {
        model: 'm1',
        prompt: 'p',
        maxOutputTokens: 10,
        temperature: 0,
        timeoutMs: 1000,
      });

      expect(requestOf(0).url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent'
      );
    }
  );
});

describe('isCompleteFinish', () => {
  it.each([
    [FinishReason.STOP, true],
    [undefined, true],
    [FinishReason.MAX_TOKENS, false],
    [FinishReason.CONTINUATION, false],
    [FinishReason.BLOCKLIST, false],
    [FinishReason.OTHER, false],
  ])('終了理由 %s は完了=%s', (finishReason, expected) => {
    expect(isCompleteFinish(finishReason)).toBe(expected);
  });
});

describe('getGeminiResponseText', () => {
  it('最初の候補のテキストをつないで返す', () => {
    const response = responseOf({
      candidates: [
        {
          content: { parts: [{ text: 'こんにちは' }, { text: '世界' }] },
          finishReason: FinishReason.STOP,
        },
      ],
    });

    expect(getGeminiResponseText(response)).toBe('こんにちは世界');
  });

  it('出力の上限で切れた応答は、途中までの本文を返す', () => {
    const response = responseOf({
      candidates: [
        {
          content: { parts: [{ text: '{"summary":' }] },
          finishReason: FinishReason.MAX_TOKENS,
        },
      ],
    });

    expect(getGeminiResponseText(response)).toBe('{"summary":');
  });

  it('候補に本文が無ければ空文字を返す', () => {
    const response = responseOf({
      candidates: [{ content: { parts: [] }, finishReason: FinishReason.STOP }],
    });

    expect(getGeminiResponseText(response)).toBe('');
  });

  it('候補もプロンプトの判定も無ければ空文字を返す', () => {
    expect(getGeminiResponseText(responseOf({}))).toBe('');
  });

  it.each([
    FinishReason.SAFETY,
    FinishReason.RECITATION,
    FinishReason.LANGUAGE,
  ])('終了理由が %s なら例外にする', (finishReason) => {
    const response = responseOf({ candidates: [{ finishReason }] });

    expect(() => getGeminiResponseText(response)).toThrow(
      `Gemini stopped the response: ${finishReason}`
    );
  });

  it('プロンプトが拒否されて候補が無ければ、拒否の理由を添えて例外にする', () => {
    const response = responseOf({
      promptFeedback: { blockReason: BlockedReason.SAFETY },
    });

    expect(() => getGeminiResponseText(response)).toThrow(
      'Gemini blocked the prompt: SAFETY'
    );
  });
});
