/**
 * Zenn API Content Enricher
 * Zenn記事の本文をAPIから取得するエンリッチャー
 */

import { BaseContentEnricher, EnrichmentResult } from './base';
import { ZennService } from '@/lib/services/zenn-service';
import * as cheerio from 'cheerio';

/**
 * Zenn APIを使用したコンテンツエンリッチャー
 */
export class ZennApiEnricher extends BaseContentEnricher {
  /**
   * ZennのURLかどうかを判定
   * @param url チェック対象のURL
   * @returns Zenn記事URLの場合true
   */
  canHandle(url: string): boolean {
    return ZennService.isZennArticleUrl(url);
  }

  /**
   * Zenn APIから記事本文を取得してエンリッチ
   * @param url 記事のURL
   * @returns エンリッチされたコンテンツ。取得失敗時はnull
   */
  async enrich(url: string): Promise<EnrichmentResult | null> {
    try {
      // スラッグ抽出
      const slug = ZennService.extractSlugFromUrl(url);
      if (!slug) {
        this.logEnrichmentError(url, new Error('Failed to extract slug from URL'));
        return null;
      }

      // Zenn APIから記事データを取得
      const data = await ZennService.fetchWithRetry(slug);

      // HTMLからプレーンテキストに変換
      const plainText = this.htmlToPlainText(data.article.body_html);

      // 最小文字数チェック
      if (!this.isContentSufficient(plainText, 100)) {
        this.logEnrichmentError(url, new Error('Content too short'));
        return null;
      }

      // サムネイルURLを取得（OGP画像など）
      const thumbnail = this.extractThumbnail(data.article.body_html);

      return {
        content: plainText,
        thumbnail,
      };
    } catch (error) {
      this.logEnrichmentError(url, error);
      return null;
    }
  }

  /**
   * HTMLからプレーンテキストに変換
   * Cheerioを使用してHTMLをパースし、テキストのみを抽出
   *
   * @param html - HTMLコンテンツ
   * @returns プレーンテキスト
   */
  private htmlToPlainText(html: string): string {
    const $ = cheerio.load(html);

    // 不要な要素を削除
    $('script, style, noscript, iframe').remove();

    // 全てのテキストを取得（bodyタグの有無に関わらず）
    const text = $.text();

    // テキストのクリーンアップ
    return text
      .replace(/[ \t]+/g, ' ')      // 連続するスペース/タブを1つに
      .replace(/\n{3,}/g, '\n\n')   // 3つ以上の改行を2つに
      .trim();
  }
}
