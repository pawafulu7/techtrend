import { ZennAIFetcher } from '../../../lib/fetchers/ai/zenn-ai';
import { Source } from '@/lib/prisma-exports';

// テスト用のモックSourceオブジェクト
const mockSource: Source = {
  id: 'test-source-id',
  name: 'Zenn AI Test',
  url: 'https://zenn.dev',
  feedUrl: 'https://zenn.dev/feed',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('ZennAIFetcher', () => {
  let fetcher: ZennAIFetcher;

  beforeEach(() => {
    fetcher = new ZennAIFetcher(mockSource);
  });

  describe('extractTagsメソッドのテスト', () => {
    it('content内の日本語タグを正しく抽出する', () => {
      const item = {
        content: '#プログラミング #機械学習 #ディープラーニング テストコンテンツです',
        categories: ['existing-category']
      };
      const tags = (fetcher as any).extractTags(item);
      expect(tags).toContain('プログラミング');
      expect(tags).toContain('機械学習');
      expect(tags).toContain('ディープラーニング');
      expect(tags).toContain('existing-category');
    });

    it('英数字とアンダースコアを含むタグを抽出する', () => {
      const item = {
        content: '#react_hooks #vue3 #next_js_13 これはテスト記事です',
        categories: []
      };
      const tags = (fetcher as any).extractTags(item);
      expect(tags).toContain('react_hooks');
      expect(tags).toContain('vue3');
      expect(tags).toContain('next_js_13');
    });

    it('複雑なタグと数字を含むタグを抽出する', () => {
      const item = {
        content: '#技術書典14 #個人開発 #AIチャットボット #GPT4 のテスト',
        categories: []
      };
      const tags = (fetcher as any).extractTags(item);
      expect(tags).toContain('技術書典14');
      expect(tags).toContain('個人開発');
      expect(tags).toContain('AIチャットボット');
      expect(tags).toContain('GPT4');
    });

    it('categoriesとcontentの両方からタグを抽出し重複を除去する', () => {
      const item = {
        content: '#React #TypeScript #Next_js テスト',
        categories: ['React', 'JavaScript', 'Web開発']
      };
      const tags = (fetcher as any).extractTags(item);
      // Reactは重複しているので1回のみ含まれるはず
      expect(tags).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Next_js', 'JavaScript', 'Web開発']));
      // 重複チェック: Reactがtagsのarrayにおいてユニークかチェック
      const reactCount = tags.filter((tag: string) => tag === 'React').length;
      expect(reactCount).toBe(1);
    });

    it('contentがない場合でもcategoriesからタグを抽出する', () => {
      const item = {
        categories: ['Python', 'データ分析', '機械学習']
      };
      const tags = (fetcher as any).extractTags(item);
      expect(tags).toEqual(['Python', 'データ分析', '機械学習']);
    });

    it('contentもcategoriesもない場合は空配列を返す', () => {
      const item = {};
      const tags = (fetcher as any).extractTags(item);
      expect(tags).toEqual([]);
    });
  });

  describe('OGP画像URLのサニタイゼーション', () => {
    it('extractThumbnailFromItemメソッドがXSS攻撃を防ぐ', () => {
      const item = {
        title: '<script>alert("xss")</script>Article Title',
        link: 'https://zenn.dev/author/articles/test-article',
        content: ''
      };
      const thumbnail = (fetcher as any).extractThumbnailFromItem(item);
      expect(thumbnail).toBeDefined();
      // スクリプトタグが完全に除去されていることを確認
      expect(thumbnail).not.toContain('<script>');
      expect(thumbnail).not.toContain('alert');
      expect(thumbnail).toContain('Article%20Title');
    });

    it('完全なスクリプトタグを除去する', () => {
      const item = {
        title: '<script src="evil.js"></script>正常なタイトル',
        link: 'https://zenn.dev/author/articles/test-article'
      };
      const thumbnail = (fetcher as any).extractThumbnailFromItem(item);
      expect(thumbnail).toBeDefined();
      // スクリプトタグとその内容が完全に除去されている
      expect(thumbnail).not.toContain('script');
      expect(thumbnail).not.toContain('evil.js');
      expect(thumbnail).toContain(encodeURIComponent('正常なタイトル'));
    });

    it('複雑なHTMLインジェクション攻撃を防ぐ', () => {
      const item = {
        title: '<img src=x onerror="alert(1)"><svg onload="alert(2)">Safe Title',
        link: 'https://zenn.dev/author/articles/test-article'
      };
      const thumbnail = (fetcher as any).extractThumbnailFromItem(item);
      expect(thumbnail).toBeDefined();
      expect(thumbnail).not.toContain('onerror');
      expect(thumbnail).not.toContain('onload');
      expect(thumbnail).not.toContain('alert');
      expect(thumbnail).toContain('Safe%20Title');
    });

    it('特殊文字とHTMLエンティティを適切に処理する', () => {
      const item = {
        title: 'Title with "quotes" & <brackets> and &lt;entities&gt;',
        link: 'https://zenn.dev/author/articles/test-article'
      };
      const thumbnail = (fetcher as any).extractThumbnailFromItem(item);
      expect(thumbnail).toBeDefined();
      // sanitizeHtmlの結果を確認（HTMLタグとエンティティが適切に処理される）
      // sanitizeHtmlはタグを除去し、エンティティをデコードする
      expect(thumbnail).toContain(encodeURIComponent('Title with "quotes" & and <entities>'));
    });

    it('空のタイトルをデフォルト値で処理する', () => {
      const item = {
        title: '',
        link: 'https://zenn.dev/author/articles/test-article'
      };
      const thumbnail = (fetcher as any).extractThumbnailFromItem(item);
      expect(thumbnail).toBeDefined();
      expect(thumbnail).toContain('Article');
    });

    it('undefinedタイトルをデフォルト値で処理する', () => {
      const item = {
        link: 'https://zenn.dev/author/articles/test-article'
      };
      const thumbnail = (fetcher as any).extractThumbnailFromItem(item);
      expect(thumbnail).toBeDefined();
      expect(thumbnail).toContain('Article');
    });
  });
});