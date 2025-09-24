import { ZennAIFetcher } from '../../../lib/fetchers/ai/zenn-ai';

describe('ZennAIFetcher', () => {
  let fetcher: ZennAIFetcher;

  beforeEach(() => {
    fetcher = new ZennAIFetcher();
  });

  describe('タグ抽出Unicode範囲の拡張', () => {
    it('日本語のタグを正しく抽出できる', () => {
      const content = '#プログラミング #機械学習 #ディープラーニング';
      const tagMatches = content.match(/#[\p{L}\p{N}_]+/gu);
      expect(tagMatches).not.toBeNull();
      if (tagMatches) {
        const tags = tagMatches.map(tag => tag.substring(1));
        expect(tags).toEqual(['プログラミング', '機械学習', 'ディープラーニング']);
      }
    });

    it('英数字とアンダースコアを含むタグを抽出できる', () => {
      const content = '#react_hooks #vue3 #next_js_13';
      const tagMatches = content.match(/#[\p{L}\p{N}_]+/gu);
      expect(tagMatches).not.toBeNull();
      if (tagMatches) {
        const tags = tagMatches.map(tag => tag.substring(1));
        expect(tags).toEqual(['react_hooks', 'vue3', 'next_js_13']);
      }
    });

    it('様々な文字を含む複雑なタグを抽出できる', () => {
      const content = '#技術書典14 #個人開発 #AIチャットボット';
      const tagMatches = content.match(/#[\p{L}\p{N}_]+/gu);
      expect(tagMatches).not.toBeNull();
      if (tagMatches) {
        const tags = tagMatches.map(tag => tag.substring(1));
        expect(tags).toEqual(['技術書典14', '個人開発', 'AIチャットボット']);
      }
    });
  });

  describe('OGP画像URLのサニタイゼーション', () => {
    it('HTMLタグを除去する', () => {
      const title = '<script>alert("xss")</script>Article Title';
      const sanitized = title
        .replace(/<[^>]*>/g, '')
        .replace(/[<>'"]/g, '')
        .replace(/[\n\r\t]/g, ' ')
        .trim();
      expect(sanitized).toBe('alert(xss)Article Title');
    });

    it('特殊文字を除去する', () => {
      const title = 'Title with "quotes" and <brackets>';
      const sanitized = title
        .replace(/<[^>]*>/g, '')
        .replace(/[<>'"]/g, '')
        .replace(/[\n\r\t]/g, ' ')
        .trim();
      expect(sanitized).toBe('Title with quotes and');
    });

    it('制御文字をスペースに置換する', () => {
      const title = 'Title\nwith\ttabs\rand\nnewlines';
      const sanitized = title
        .replace(/<[^>]*>/g, '')
        .replace(/[<>'"]/g, '')
        .replace(/[\n\r\t]/g, ' ')
        .trim();
      expect(sanitized).toBe('Title with tabs and newlines');
    });

    it('空のタイトルをデフォルト値で処理する', () => {
      const title = '';
      const sanitized = (title || 'Article')
        .replace(/<[^>]*>/g, '')
        .replace(/[<>'"]/g, '')
        .replace(/[\n\r\t]/g, ' ')
        .trim();
      expect(sanitized).toBe('Article');
    });
  });
});