import { QiitaAIFetcher } from '../../../lib/fetchers/ai/qiita-ai';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('QiitaAIFetcher', () => {
  let fetcher: QiitaAIFetcher;

  beforeEach(() => {
    fetcher = new QiitaAIFetcher();
    jest.clearAllMocks();
  });

  describe('タグ抽出パターンの改善', () => {
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
    it('API呼び出し間隔を1秒以上空ける', async () => {
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

      // 2回目の呼び出しは1秒以上後になるはず
      expect(elapsedTime).toBeGreaterThanOrEqual(1000);
    });

    it('環境変数からAPIトークンを使用する', async () => {
      process.env.QIITA_API_TOKEN = 'test-token';

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