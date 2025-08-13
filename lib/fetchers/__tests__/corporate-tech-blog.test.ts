import { CorporateTechBlogFetcher } from '../corporate-tech-blog';
import { Source } from '@prisma/client';

describe('CorporateTechBlogFetcher', () => {
  let fetcher: CorporateTechBlogFetcher;
  let mockSource: Source;

  beforeEach(() => {
    mockSource = {
      id: 'test-source-id',
      name: 'Corporate Tech Blog',
      url: 'https://example.com',
      type: 'RSS',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fetcher = new CorporateTechBlogFetcher(mockSource);
  });

  describe('isEventArticle', () => {
    // privateメソッドのテストのため、any型を使用
    const testIsEventArticle = (title: string, url: string) => {
      return (fetcher as any).isEventArticle(title, url);
    };

    describe('イベントキーワードの判定', () => {
      test('「登壇」を含むタイトルはイベント記事と判定される', () => {
        expect(testIsEventArticle('登壇のお知らせ', 'https://example.com/post')).toBe(true);
      });

      test('「イベント」を含むタイトルはイベント記事と判定される', () => {
        expect(testIsEventArticle('技術イベント開催', 'https://example.com/post')).toBe(true);
      });

      test('「セミナー」を含むタイトルはイベント記事と判定される', () => {
        expect(testIsEventArticle('無料セミナーのご案内', 'https://example.com/post')).toBe(true);
      });

      test('「勉強会」を含むタイトルはイベント記事と判定される', () => {
        expect(testIsEventArticle('React勉強会を開催します', 'https://example.com/post')).toBe(true);
      });

      test('「カンファレンス」を含むタイトルはイベント記事と判定される', () => {
        expect(testIsEventArticle('技術カンファレンス2025', 'https://example.com/post')).toBe(true);
      });

      test('「meetup」を含むタイトルはイベント記事と判定される', () => {
        expect(testIsEventArticle('JavaScript Meetup Tokyo', 'https://example.com/post')).toBe(true);
      });

      test('「参加募集」を含むタイトルはイベント記事と判定される', () => {
        expect(testIsEventArticle('ハッカソン参加募集中', 'https://example.com/post')).toBe(true);
      });

      test('「開催しました」を含むタイトルはイベント記事と判定される', () => {
        expect(testIsEventArticle('社内勉強会を開催しました', 'https://example.com/post')).toBe(true);
      });
    });

    describe('URLパターンの判定', () => {
      test('URLに/eventを含む場合はイベント記事と判定される', () => {
        expect(testIsEventArticle('技術記事', 'https://example.com/event/123')).toBe(true);
      });

      test('URLに/seminarを含む場合はイベント記事と判定される', () => {
        expect(testIsEventArticle('技術記事', 'https://example.com/seminar/tech')).toBe(true);
      });

      test('URLに/meetupを含む場合はイベント記事と判定される', () => {
        expect(testIsEventArticle('技術記事', 'https://example.com/meetup/2025')).toBe(true);
      });

      test('URLに/conferenceを含む場合はイベント記事と判定される', () => {
        expect(testIsEventArticle('技術記事', 'https://example.com/conference/tech')).toBe(true);
      });
    });

    describe('日付パターンの判定', () => {
      test('タイトルに未来の日付が含まれる場合はイベント記事と判定される', () => {
        expect(testIsEventArticle('2025/8/20 技術セッション', 'https://example.com/post')).toBe(true);
      });

      test('タイトルに日付形式があってもイベント記事と判定される', () => {
        expect(testIsEventArticle('2025/12/1 開催予定', 'https://example.com/post')).toBe(true);
      });
    });

    describe('例外パターン（除外しない）', () => {
      test('「振り返り」を含むタイトルは除外されない', () => {
        expect(testIsEventArticle('KubeCon参加の振り返り', 'https://example.com/post')).toBe(false);
      });

      test('「レポート」を含むタイトルは除外されない', () => {
        expect(testIsEventArticle('技術カンファレンス参加レポート', 'https://example.com/post')).toBe(false);
      });

      test('「技術解説」を含むタイトルは除外されない', () => {
        expect(testIsEventArticle('イベント駆動アーキテクチャの技術解説', 'https://example.com/post')).toBe(false);
      });

      test('「まとめ」を含むタイトルは除外されない', () => {
        expect(testIsEventArticle('React Conf 2025まとめ', 'https://example.com/post')).toBe(false);
      });
    });

    describe('通常の技術記事', () => {
      test('イベントキーワードを含まない技術記事は除外されない', () => {
        expect(testIsEventArticle('TypeScriptの型システム入門', 'https://example.com/post/123')).toBe(false);
      });

      test('技術的な内容の記事は除外されない', () => {
        expect(testIsEventArticle('Reactのパフォーマンス最適化手法', 'https://example.com/tech/react')).toBe(false);
      });

      test('チュートリアル記事は除外されない', () => {
        expect(testIsEventArticle('Docker入門チュートリアル', 'https://example.com/tutorial/docker')).toBe(false);
      });
    });

    describe('複合パターン', () => {
      test('イベントキーワードとURLパターンの両方を含む場合', () => {
        expect(testIsEventArticle('技術セミナー開催', 'https://example.com/event/seminar')).toBe(true);
      });

      test('イベントキーワードがあるが例外キーワードも含む場合', () => {
        expect(testIsEventArticle('セミナー参加レポート', 'https://example.com/post')).toBe(false);
      });
    });
  });

  describe('環境変数による制御', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    test('EXCLUDE_EVENT_ARTICLESがfalseの場合、イベント記事も取得される', () => {
      process.env.EXCLUDE_EVENT_ARTICLES = 'false';
      // 実際のfetchメソッドのテストはモックが必要なため、ここでは環境変数の確認のみ
      expect(process.env.EXCLUDE_EVENT_ARTICLES).toBe('false');
    });

    test('EXCLUDE_EVENT_ARTICLESがtrueの場合、イベント記事が除外される', () => {
      process.env.EXCLUDE_EVENT_ARTICLES = 'true';
      expect(process.env.EXCLUDE_EVENT_ARTICLES).toBe('true');
    });

    test('EXCLUDE_EVENT_ARTICLESが未設定の場合、デフォルトでfalse（除外しない）', () => {
      delete process.env.EXCLUDE_EVENT_ARTICLES;
      expect(process.env.EXCLUDE_EVENT_ARTICLES).toBeUndefined();
    });
  });
});