import { QiitaAIFetcher } from '../../../lib/fetchers/ai/qiita-ai';
import { Source } from '@/lib/prisma-exports';
import axios from 'axios';
import { resetEnvCache } from '@/lib/config/env';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// テスト用のモックSourceオブジェクト
const mockSource: Source = {
  id: 'test-source-id',
  name: 'Qiita AI Test',
  url: 'https://qiita.com',
  feedUrl: 'https://qiita.com/feed',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('QiitaAIFetcher', () => {
  let fetcher: QiitaAIFetcher;

  beforeEach(() => {
    fetcher = new QiitaAIFetcher(mockSource);
    jest.clearAllMocks();
  });

  describe('タグ抽出パターンの改善', () => {
    it('extractTagsメソッドが正しくタグを抽出できる', () => {
      const item = {
        content: 'タグ：AI, LLM, ChatGPT\n本文内容',
        categories: ['機械学習']
      };
      // privateメソッドをテストする場合は、as anyでアクセス
      const tags = (fetcher as any).extractTags(item);
      expect(tags).toContain('AI');
      expect(tags).toContain('LLM');
      expect(tags).toContain('ChatGPT');
      expect(tags).toContain('機械学習');
    });

    it('全角コロンを含むタグを抽出できる', () => {
      const content = 'タグ：AI, LLM, ChatGPT';
      const matches = content.match(/タグ[:：]\s*([^<\n]+)/);
      expect(matches).not.toBeNull();
      if (matches) {
        const tags = matches[1].split(/[,、\s]+/)
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0);
        expect(tags).toEqual(['AI', 'LLM', 'ChatGPT']);
      }
    });

    it('スペース区切りのタグを抽出できる', () => {
      const content = 'タグ: AI LLM  ChatGPT';
      const matches = content.match(/タグ[:：]\s*([^<\n]+)/);
      expect(matches).not.toBeNull();
      if (matches) {
        const tags = matches[1].split(/[,、\s]+/)
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0);
        expect(tags).toEqual(['AI', 'LLM', 'ChatGPT']);
      }
    });

    it('空のタグをフィルタリングする', () => {
      const content = 'タグ: AI,, LLM,  , ChatGPT';
      const matches = content.match(/タグ[:：]\s*([^<\n]+)/);
      expect(matches).not.toBeNull();
      if (matches) {
        const tags = matches[1].split(/[,、\s]+/)
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0);
        expect(tags).toEqual(['AI', 'LLM', 'ChatGPT']);
      }
    });
  });

  describe('APIレート制限対応', () => {
    // TODO: Fix timing flakiness - see GitHub issue #141
    it.skip('API呼び出し間隔を1秒以上空ける', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { likes_count: 10 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: { likes_count: 20 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      const startTime = Date.now();

      // 最初の呼び出し
      await (fetcher as any).fetchLikesCount('https://qiita.com/user/items/abc123');

      // 2回目の呼び出し
      await (fetcher as any).fetchLikesCount('https://qiita.com/user/items/def456');

      const elapsedTime = Date.now() - startTime;

      // 2回目の呼び出しは約1秒後になるはず（タイミングの誤差を考慮して990ms以上）
      expect(elapsedTime).toBeGreaterThanOrEqual(990);
    });

    it('環境変数からAPIトークンを使用する', async () => {
      process.env.QIITA_API_TOKEN = 'test-token';
      resetEnvCache();

      mockedAxios.get.mockResolvedValueOnce({
        data: { likes_count: 10 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

      await (fetcher as any).fetchLikesCount('https://qiita.com/user/items/abc123');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );

      delete process.env.QIITA_API_TOKEN;
      resetEnvCache();
    });

    it('429エラーを適切に処理する', async () => {
      const error = {
        isAxiosError: true,
        response: { status: 429 }
      };
      mockedAxios.get.mockRejectedValueOnce(error);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);

      const result = await (fetcher as any).fetchLikesCount('https://qiita.com/user/items/abc123');

      expect(result).toBe(0);
    });
  });
});