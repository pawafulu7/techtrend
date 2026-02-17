/**
 * YouTubeEnricher テスト
 */

import { YouTubeEnricher } from '../../lib/enrichers/youtube';

describe('YouTubeEnricher', () => {
  let enricher: YouTubeEnricher;

  beforeEach(() => {
    enricher = new YouTubeEnricher();
  });

  describe('canHandle', () => {
    it('youtube.comのURLを正しく判定できること', () => {
      expect(enricher.canHandle('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('www.youtube.comのURLを正しく判定できること', () => {
      expect(enricher.canHandle('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('m.youtube.comのURLを正しく判定できること', () => {
      expect(enricher.canHandle('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('youtu.beのURLを正しく判定できること', () => {
      expect(enricher.canHandle('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    });

    it('YouTube以外のURLを拒否すること', () => {
      expect(enricher.canHandle('https://www.google.com/')).toBe(false);
      expect(enricher.canHandle('https://vimeo.com/12345')).toBe(false);
      expect(enricher.canHandle('https://zenn.dev/articles/test')).toBe(false);
      expect(enricher.canHandle('https://example.com/youtube.com')).toBe(false);
    });

    it('不正なURLを安全に処理すること', () => {
      expect(enricher.canHandle('not-a-url')).toBe(false);
      expect(enricher.canHandle('')).toBe(false);
      expect(enricher.canHandle('javascript:alert(1)')).toBe(false);
    });

    it('ホスト名のサブストリング攻撃を防ぐこと', () => {
      expect(enricher.canHandle('https://fakeyoutube.com/watch?v=abc')).toBe(false);
      expect(enricher.canHandle('https://youtube.com.evil.com/watch?v=abc')).toBe(false);
      expect(enricher.canHandle('https://notyoutu.be/abc')).toBe(false);
    });

    it('チャンネルURLではfalseを返すこと', () => {
      expect(enricher.canHandle('https://www.youtube.com/c/channelname')).toBe(false);
      expect(enricher.canHandle('https://www.youtube.com/@username')).toBe(false);
      expect(enricher.canHandle('https://www.youtube.com/channel/UCxxxxxx')).toBe(false);
    });

    it('プレイリスト専用URLではfalseを返すこと', () => {
      expect(enricher.canHandle('https://www.youtube.com/playlist?list=PLxxxxxxx')).toBe(false);
    });

    it('/live/VIDEO_ID パターンを正しく判定できること', () => {
      expect(enricher.canHandle('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(true);
    });
  });

  describe('extractVideoId (via enrich)', () => {
    it('youtube.com/watch?v=VIDEO_ID からIDを抽出できること', async () => {
      const result = await enricher.enrich('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).not.toBeNull();
      expect(result!.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });

    it('youtu.be/VIDEO_ID からIDを抽出できること', async () => {
      const result = await enricher.enrich('https://youtu.be/dQw4w9WgXcQ');
      expect(result).not.toBeNull();
      expect(result!.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });

    it('youtube.com/embed/VIDEO_ID からIDを抽出できること', async () => {
      const result = await enricher.enrich('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(result).not.toBeNull();
      expect(result!.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });

    it('youtube.com/shorts/VIDEO_ID からIDを抽出できること', async () => {
      const result = await enricher.enrich('https://www.youtube.com/shorts/dQw4w9WgXcQ');
      expect(result).not.toBeNull();
      expect(result!.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });

    it('クエリパラメータ付きのwatchURLでもIDを抽出できること', async () => {
      const result = await enricher.enrich('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLtest');
      expect(result).not.toBeNull();
      expect(result!.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });

    it('ハイフン・アンダースコアを含むIDを抽出できること', async () => {
      const result = await enricher.enrich('https://www.youtube.com/watch?v=abc-_def123');
      expect(result).not.toBeNull();
      expect(result!.thumbnail).toBe('https://img.youtube.com/vi/abc-_def123/hqdefault.jpg');
    });

    it('youtube.com/live/VIDEO_ID からIDを抽出できること', async () => {
      const result = await enricher.enrich('https://www.youtube.com/live/dQw4w9WgXcQ');
      expect(result).not.toBeNull();
      expect(result!.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });
  });

  describe('enrich', () => {
    it('content が null であること（サムネイルのみ返す）', async () => {
      const result = await enricher.enrich('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).not.toBeNull();
      expect(result!.content).toBeNull();
      expect(result!.thumbnail).toBeDefined();
    });

    it('ビデオIDが抽出できないURLではnullを返すこと', async () => {
      const result = await enricher.enrich('https://www.youtube.com/');
      expect(result).toBeNull();
    });

    it('youtube.com/channelではnullを返すこと', async () => {
      const result = await enricher.enrich('https://www.youtube.com/channel/UCxxxxxx');
      expect(result).toBeNull();
    });

    it('不正な長さのビデオIDではnullを返すこと', async () => {
      const result = await enricher.enrich('https://www.youtube.com/watch?v=short');
      expect(result).toBeNull();
    });

    it('HTTPリクエストを一切行わないこと', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      await enricher.enrich('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('m.youtube.comからも正しいサムネイルURLを返すこと', async () => {
      const result = await enricher.enrich('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result).not.toBeNull();
      expect(result!.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });
  });
});
