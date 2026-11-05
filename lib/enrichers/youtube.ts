/**
 * YouTube Content Enricher
 * YouTube動画のサムネイルURLをビデオIDから直接生成（HTTPリクエスト不要）
 */

import { IContentEnricher, EnrichedContent } from './base';
import logger from '@/lib/logger';
import { extractYouTubeVideoId } from '@/lib/utils/url/youtube';

/**
 * YouTube URLからビデオIDを抽出し、サムネイルURLを生成するエンリッチャー
 * HTTPリクエストを行わないため、タイムアウトの心配がない
 */
export class YouTubeEnricher implements IContentEnricher {
  /**
   * YouTubeの動画のURLかをチェック（判定は lib/utils/url/youtube.ts）
   * 対応ドメイン: youtube.com, www.youtube.com, m.youtube.com, youtu.be
   * チャンネルURL、プレイリスト専用URL等は除外
   */
  canHandle(url: string): boolean {
    return extractYouTubeVideoId(url) !== null;
  }

  /**
   * YouTube URLからサムネイルURLを生成
   * HTTPリクエストは一切行わない
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    const videoId = extractYouTubeVideoId(url);

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
}
