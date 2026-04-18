/**
 * Hatena Bookmark Content Enricher
 * はてなブックマーク経由記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import * as cheerio from 'cheerio';
import { isUrlFromDomain } from '@/lib/utils/url/url-validator';

/**
 * Hatena Blog 独自ドメイン allowlist
 * hatena.blog/dev/entries 経由で収集される企業技術ブログで、
 * 専用 enricher が存在しない（= generic に流れる）ドメインを Hatena 扱いにする。
 *
 * 除外済み（専用 enricher 管轄）:
 *   - techblog.zozo.com (ZOZOContentEnricher)
 *   - techblog.recruit.co.jp (RecruitContentEnricher)
 *   - tech.pepabo.com (PepaboContentEnricher)
 *   - developer.hatenastaff.com (HatenaDeveloperContentEnricher)
 */
export const HATENA_CUSTOM_DOMAINS: readonly string[] = [
  'tech.every.tv',
  'caddi.tech',
  'tech.gunosy.io',
  'mackerel.io',
  'tech.askul.co.jp',
  'blogs.networld.co.jp',
  'tech.nri-net.com',
  'tech.talentx.co.jp',
  'blog.serverworks.co.jp',
  'developer.so-tech.co.jp',
];

export class HatenaContentEnricher extends BaseContentEnricher {
  /**
   * はてなブックマーク記事のURLかチェック
   * 注意: これは実際のコンテンツURLをチェック（はてなのURL自体ではない）
   */
  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      // Hatenaドメインのみを対象（完全一致またはサブドメイン）
      if (
        hostname === 'hatena.ne.jp' ||
        hostname.endsWith('.hatena.ne.jp') ||
        hostname === 'hatenablog.com' ||
        hostname.endsWith('.hatenablog.com') ||
        hostname === 'hatenablog.jp' ||
        hostname.endsWith('.hatenablog.jp')
      ) {
        return true;
      }
      // Hatena 独自ドメインの allowlist
      return HATENA_CUSTOM_DOMAINS.includes(hostname);
    } catch {
      // URL解析失敗時は対象外
      return false;
    }
  }

  /**
   * 記事ページから本文とサムネイルを取得
   */
  async enrich(
    url: string,
    signal?: AbortSignal
  ): Promise<EnrichedContent | null> {
    try {
      // はてなブックマークのURLの場合はスキップ
      if (isUrlFromDomain(url, 'b.hatena.ne.jp')) {
        return null;
      }

      const html = await this.fetchWithRetry(url, signal);

      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);

      // 汎用的なセレクタで本文を取得
      const selectors = [
        // 一般的な記事セレクタ
        'article .entry-content',
        'article .post-content',
        'article .article-body',
        'article .content',
        '.article-content',
        '.post-body',
        '.entry-body',
        '.content-body',
        '.main-content',
        '#main-content',
        'main article',
        'main .content',

        // 技術ブログ特有のセレクタ
        '.markdown-body', // GitHub風
        '.prose', // Tailwind系
        '.article-text',
        '.blog-post-content',
        '.post-entry',

        // Qiita系
        '.it-MdContent',
        '.mdContent',

        // note系
        '.note-body',
        '.p-note__body',

        // Medium系
        '.postArticle-content',
        'article section',

        // WordPress系
        '.entry-content',
        '.post-content',
        '.the-content',
        '#content',
      ];

      const content = this.sanitizeContent(html, selectors);

      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          return { content: fallbackContent, thumbnail };
        }

        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          return { content: content || null, thumbnail };
        }

        return null;
      }

      return { content, thumbnail };
    } catch (_error) {
      return null;
    }
  }

  /**
   * フォールバック: より広範囲からコンテンツを抽出
   */
  private extractWithFallback(html: string): string {
    const $ = cheerio.load(html);

    // 不要な要素を削除
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('.sidebar').remove();
    $('.side-menu').remove();
    $('.navigation').remove();
    $('.breadcrumb').remove();
    $('.share').remove();
    $('.social').remove();
    $('.related').remove();
    $('.recommend').remove();
    $('.author').remove();
    $('.comment').remove();
    $('.ad').remove();
    $('.advertisement').remove();
    $('.banner').remove();
    $('.widget').remove();
    $('.menu').remove();

    // 優先順位: article > main > .container > #wrapper > body
    let content = '';

    const articleContent = $('article');
    if (articleContent.length > 0) {
      content = articleContent.text();
    } else {
      const mainContent = $('main');
      if (mainContent.length > 0) {
        content = mainContent.text();
      } else {
        const containerContent = $('.container, .wrapper, #wrapper, #main');
        if (containerContent.length > 0) {
          content = containerContent.first().text();
        } else {
          // 最終手段: bodyから取得
          content = $('body').text();
        }
      }
    }

    // テキストのクリーンアップ
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
