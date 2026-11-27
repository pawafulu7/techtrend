import {
  GeminiTitleTranslator,
  TitleTranslationRequestError,
  TitleTranslationUnchangedError,
} from '../gemini-title-translator';
import { GeminiTransport } from '../../transport/gemini-transport.interface';

describe('GeminiTitleTranslator', () => {
  let translator: GeminiTitleTranslator;
  let mockTransport: jest.Mocked<GeminiTransport>;

  beforeEach(() => {
    mockTransport = {
      invoke: jest.fn(),
    } as jest.Mocked<GeminiTransport>;

    translator = new GeminiTitleTranslator(mockTransport, {
      enabled: true,
      model: 'gemini-2.5-flash-lite',
      temperature: 0.3,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 100,
    });
  });

  describe('translateTitle', () => {
    it('should return null when translation is disabled', async () => {
      const disabledTranslator = new GeminiTitleTranslator(mockTransport, {
        enabled: false,
        model: 'gemini-2.5-flash-lite',
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 100,
      });

      const result = await disabledTranslator.translateTitle({
        title: 'Test Title',
        requestId: 'test-1',
      });

      expect(result).toBeNull();
      expect(mockTransport.invoke).not.toHaveBeenCalled();
    });

    it('should return null for Japanese title (single character)', async () => {
      const result = await translator.translateTitle({
        title: 'Rancher と Terraform',
        requestId: 'test-2',
      });

      expect(result).toBeNull();
      expect(mockTransport.invoke).not.toHaveBeenCalled();
    });

    it('should return null for Japanese title (multiple characters)', async () => {
      const result = await translator.translateTitle({
        title: 'builderscon 2025 開催中止のお知らせ - builderscon::blog',
        requestId: 'test-3',
      });

      expect(result).toBeNull();
      expect(mockTransport.invoke).not.toHaveBeenCalled();
    });

    it('英語のタイトルでも、本文が日本語の記事は翻訳しない（issue #725）', async () => {
      const result = await translator.translateTitle({
        title: 'Reinforcement Learning with Verifiable Rewards',
        content:
          '近年のLLMはSFTと呼ばれる教師あり学習を行った後、RLVRと呼ばれる強化学習を行っています。',
        requestId: 'test-japanese-body',
      });

      expect(result).toBeNull();
      expect(mockTransport.invoke).not.toHaveBeenCalled();
    });

    it('本文が英語なら、日本語の UI の文字を含んでいても翻訳する（issue #725）', async () => {
      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Codeberg が30万プロジェクトに到達' }],
              },
            },
          ],
        },
      });

      const result = await translator.translateTitle({
        title: 'Codeberg Reaches 300k Projects',
        content:
          'エクスプローラー About FAQ ヘルプ Donate 登録 サインイン NON-PROFIT Codeberg is maintained by the non-profit organization Codeberg e.V. and hosts over 300,000 projects.',
        requestId: 'test-english-body',
      });

      expect(result).toBe('Codeberg が30万プロジェクトに到達');
      expect(mockTransport.invoke).toHaveBeenCalledTimes(1);
    });

    it('should translate English title successfully', async () => {
      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: {
          candidates: [
            {
              content: {
                parts: [{ text: 'テストタイトル' }],
              },
            },
          ],
        },
      });

      const result = await translator.translateTitle({
        title: 'Test Title',
        requestId: 'test-4',
      });

      expect(result).toBe('テストタイトル');
      expect(mockTransport.invoke).toHaveBeenCalledTimes(1);
    });

    it('should throw error when API returns empty text', async () => {
      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: {
          candidates: [
            {
              content: {
                parts: [{ text: '   ' }],
              },
            },
          ],
        },
      });

      await expect(
        translator.translateTitle({
          title: 'Test Title',
          requestId: 'test-5',
        })
      ).rejects.toThrow('Translation API returned empty result');
    });

    it('should throw error when API returns UNCHANGED', async () => {
      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: {
          candidates: [
            {
              content: {
                parts: [{ text: 'UNCHANGED' }],
              },
            },
          ],
        },
      });

      const promise = translator.translateTitle({
        title: 'Test Title',
        requestId: 'test-6',
      });
      await expect(promise).rejects.toThrow(
        'Translation API returned invalid result'
      );
      await expect(promise).rejects.toBeInstanceOf(
        TitleTranslationUnchangedError
      );
    });

    it('should return null when API returns original Japanese title', async () => {
      const japaneseTitle =
        'builderscon 2025 開催中止のお知らせ - builderscon::blog';

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: {
          candidates: [
            {
              content: {
                parts: [{ text: japaneseTitle }],
              },
            },
          ],
        },
      });

      const result = await translator.translateTitle({
        title: japaneseTitle,
        requestId: 'test-7',
      });

      expect(result).toBeNull();
    });

    it('should throw error when API returns original English title unchanged', async () => {
      const englishTitle = 'Test Title';

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: {
          candidates: [
            {
              content: {
                parts: [{ text: englishTitle }],
              },
            },
          ],
        },
      });

      const promise = translator.translateTitle({
        title: englishTitle,
        requestId: 'test-8',
      });
      await expect(promise).rejects.toThrow(
        'Translation API returned invalid result'
      );
      await expect(promise).rejects.toBeInstanceOf(
        TitleTranslationUnchangedError
      );
    });

    it('タイムアウトなど HTTP の状態が無い失敗では、status が無く cause に元の例外を持つ', async () => {
      const abortError = Object.assign(new Error('The operation was aborted'), {
        name: 'AbortError',
      });
      mockTransport.invoke.mockResolvedValue({
        status: 'retryable_error',
        error: abortError,
        latencyMs: 20000,
        headers: {},
      });

      const promise = translator.translateTitle({
        title: 'Test Title',
        requestId: 'test-9',
      });

      await expect(promise).rejects.toBeInstanceOf(
        TitleTranslationRequestError
      );
      await expect(promise).rejects.toMatchObject({
        status: undefined,
        cause: abortError,
      });
    });

    it('API の呼び出しが失敗したら、HTTP の状態を持つ TitleTranslationRequestError を投げる', async () => {
      const httpError = new Error('HTTP 404: model is no longer available');
      mockTransport.invoke.mockResolvedValue({
        status: 'fatal_error',
        httpStatus: 404,
        error: httpError,
        latencyMs: 10,
        headers: {},
      });

      const promise = translator.translateTitle({
        title: 'Test Title',
        requestId: 'test-10',
      });

      await expect(promise).rejects.toBeInstanceOf(
        TitleTranslationRequestError
      );
      await expect(promise).rejects.toMatchObject({
        name: 'TitleTranslationRequestError',
        status: 404,
        message: 'HTTP 404: model is no longer available',
        cause: httpError,
      });
    });

    it('応答が返ったが原文のままのときは、API の呼び出しの失敗として扱わない', async () => {
      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: {
          candidates: [{ content: { parts: [{ text: 'kitty 0.50.0' }] } }],
        },
        latencyMs: 10,
        headers: {},
      });

      const promise = translator.translateTitle({
        title: 'kitty 0.50.0',
        requestId: 'test-11',
      });

      await expect(promise).rejects.toThrow(
        'Translation API returned invalid result'
      );
      await expect(promise).rejects.not.toBeInstanceOf(
        TitleTranslationRequestError
      );
    });
  });
});
