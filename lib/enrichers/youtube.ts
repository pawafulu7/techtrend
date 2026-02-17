/**
 * YouTube Content Enricher
 * YouTube動画のサムネイルURLをビデオIDから直接生成（HTTPリクエスト不要）
 */

import { IContentEnricher, EnrichedContent } from './base';
import logger from '@/lib/logger';

/**
 * YouTube URLからビデオIDを抽出し、サムネイルURLを生成するエンリッチャー
 * HTTPリクエストを行わないため、タイムアウトの心配がない
 */
export class YouTubeEnricher implements IContentEnricher {
  /**
   * YouTubeのURLパターンにマッチするかチェック
   * 対応ドメイン: youtube.com, www.youtube.com, m.youtube.com, youtu.be
   */
  canHandle(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const isYouTubeDomain =
        hostname === 'youtube.com' ||
        hostname === 'www.youtube.com' ||
        hostname === 'm.youtube.com' ||
        hostname === 'youtu.be';
      if (!isYouTubeDomain) return false;
      // ビデオIDが抽出できるURLのみを対象とする
      // チャンネルURL、プレイリスト専用URL等は除外
      return this.extractVideoId(url) !== null;
    } catch {
      return false;
    }
  }

  /**
   * YouTube URLからサムネイルURLを生成
   * HTTPリクエストは一切行わない
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      logger.debug({ url }, '[YouTubeEnricher] Could not extract video ID');
      return null;
    }

    const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    logger.debug(
      { url, videoId, thumbnail },
      '[YouTubeEnricher] Generated thumbnail URL from video ID'
    );

    return { content: null, thumbnail };
  }

  /**
   * URLからYouTubeビデオIDを抽出
   *
   * 対応パターン:
   * - youtube.com/watch?v=VIDEO_ID
   * - youtu.be/VIDEO_ID
   * - youtube.com/embed/VIDEO_ID
   * - youtube.com/shorts/VIDEO_ID
   * - youtube.com/live/VIDEO_ID
   */
  private extractVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // youtu.be/VIDEO_ID
      if (hostname === 'youtu.be') {
        const videoId = urlObj.pathname.slice(1).split('/')[0];
        return this.validateVideoId(videoId);
      }

      // youtube.com/watch?v=VIDEO_ID
      const vParam = urlObj.searchParams.get('v');
      if (vParam) {
        return this.validateVideoId(vParam);
      }

      // youtube.com/embed/VIDEO_ID, youtube.com/shorts/VIDEO_ID, or youtube.com/live/VIDEO_ID
      const pathMatch = urlObj.pathname.match(
        /^\/(embed|shorts|live)\/([a-zA-Z0-9_-]+)/
      );
      if (pathMatch) {
        return this.validateVideoId(pathMatch[2]);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * ビデオIDの形式を検証
   * YouTube video IDは11文字の英数字、ハイフン、アンダースコア
   */
  private validateVideoId(videoId: string | undefined): string | null {
    if (!videoId) return null;
    // YouTube video IDs are typically 11 characters: [a-zA-Z0-9_-]
    if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return videoId;
    }
    return null;
  }
}
