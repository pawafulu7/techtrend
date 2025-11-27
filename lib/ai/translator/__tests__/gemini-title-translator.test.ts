import { GeminiTitleTranslator } from '../gemini-title-translator';
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

      await expect(
        translator.translateTitle({
          title: 'Test Title',
          requestId: 'test-6',
        })
      ).rejects.toThrow('Translation API returned invalid result');
    });

    it('should return null when API returns original Japanese title', async () => {
      const japaneseTitle = 'builderscon 2025 開催中止のお知らせ - builderscon::blog';

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

      await expect(
        translator.translateTitle({
          title: englishTitle,
          requestId: 'test-8',
        })
      ).rejects.toThrow('Translation API returned invalid result');
    });

    it('should throw error when API fails', async () => {
      mockTransport.invoke.mockResolvedValue({
        status: 'error',
        error: {
          message: 'API Error',
          code: 500,
        },
      });

      await expect(
        translator.translateTitle({
          title: 'Test Title',
          requestId: 'test-9',
        })
      ).rejects.toThrow('API Error');
    });
  });
});
