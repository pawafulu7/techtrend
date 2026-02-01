/**
 * 海外技術ブログ用汎用RSSフェッチャー
 * 大手テック企業のエンジニアリングブログを統一的に処理
 */

import Parser from 'rss-parser';
import { Source } from '@prisma/client';
import { BaseFetcher } from './base';
import { FetchResult, CreateArticleInput } from '@/types/fetchers';
import { logger } from '@/lib/logger';
import { isArticleDuplicate } from '@/lib/utils/url-normalizer';

// RSS項目の型定義
interface RSSItem {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  description?: string;
  summary?: string;
  pubDate?: string;
  isoDate?: string;
  categories?: string[] | { _?: string; term?: string }[];
  enclosure?: { url?: string; type?: string };
  'content:encoded'?: string;
  'dc:subject'?: string | string[];
  'media:thumbnail'?: { $?: { url?: string } } | string;
  'media:content'?: { $?: { url?: string; medium?: string } };
}

// ソース設定の型
export interface ForeignSourceConfig {
  feedUrl: string;
  // オプション: ソース固有のタグプレフィックス
  tagPrefix?: string;
}

export class GenericForeignRssFetcher extends BaseFetcher {
  private parser: Parser;
  private config: ForeignSourceConfig;
  // 重複チェック用のキャッシュ（同一バッチ内）
  private processedArticles: Map<string, { url: string; title: string }> =
    new Map();

  constructor(source: Source, config: ForeignSourceConfig) {
    super(source);
    this.parser = new Parser({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TechTrend/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    this.config = config;
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    // fetch()ごとにキャッシュをクリア（インスタンス再利用時の問題を防止）
    this.processedArticles.clear();

    try {
      logger.info({ source: this.source.name }, '海外ソースのフィード取得開始');

      const feed = await this.parser.parseURL(this.config.feedUrl);

      // 最新30件まで処理
      const items = feed.items?.slice(0, 30) || [];

      for (const item of items) {
        if (!item.link || !item.title) continue;

        try {
          // 重複チェック（同一バッチ内）
          if (this.isDuplicateInBatch(item.link, item.title)) {
            logger.debug(
              { url: item.link },
              '同一バッチ内で重複検出、スキップ'
            );
            continue;
          }

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: item.link,
            content: this.extractContent(item),
            publishedAt: this.extractPublishDate(item),
            sourceId: this.source.id,
            summary: undefined, // AI要約は後で生成
            tagNames: this.extractTags(item),
            thumbnail: this.extractThumbnailFromItem(item) || undefined,
          };

          // 処理済みとして記録
          this.processedArticles.set(item.link, {
            url: item.link,
            title: item.title,
          });

          articles.push(article);
        } catch (error) {
          errors.push(
            new Error(
              `記事の処理中にエラー: ${item.title} - ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }

      logger.info(
        {
          source: this.source.name,
          count: articles.length,
        },
        '海外ソースのフィード取得完了'
      );
    } catch (error) {
      errors.push(
        new Error(
          `${this.source.name}のフィード取得エラー: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }

    return { articles, errors };
  }

  /**
   * 同一バッチ内での重複チェック
   * クロスポスト記事の検出用
   */
  private isDuplicateInBatch(url: string, title: string): boolean {
    for (const [, article] of this.processedArticles) {
      if (isArticleDuplicate(article.url, article.title, url, title)) {
        return true;
      }
    }
    return false;
  }

  /**
   * RSS項目からコンテンツを抽出
   */
  private extractContent(item: RSSItem): string {
    // 優先順位: content:encoded > content > description > summary
    const content =
      item['content:encoded'] ||
      item.content ||
      item.contentSnippet ||
      item.description ||
      item.summary ||
      '';

    return this.sanitizeText(content);
  }

  /**
   * RSS項目から公開日を抽出
   * Invalid Dateの場合は現在日時にフォールバック
   */
  private extractPublishDate(item: RSSItem): Date {
    if (item.isoDate) {
      const date = new Date(item.isoDate);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    if (item.pubDate) {
      const date = new Date(item.pubDate);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return new Date();
  }

  /**
   * RSS項目からタグを抽出
   */
  private extractTags(item: RSSItem): string[] {
    const tags: string[] = [];

    // ソース固有のタグプレフィックスを追加
    if (this.config.tagPrefix) {
      tags.push(this.config.tagPrefix);
    }

    // カテゴリーからタグを抽出
    if (item.categories) {
      if (Array.isArray(item.categories)) {
        tags.push(
          ...item.categories
            .map((cat) =>
              typeof cat === 'string'
                ? cat
                : cat && typeof cat === 'object'
                  ? cat._ || cat.term || ''
                  : ''
            )
            .filter(Boolean)
        );
      } else if (typeof item.categories === 'string') {
        tags.push(item.categories);
      }
    }

    // dc:subjectからもタグを抽出
    if (item['dc:subject']) {
      if (Array.isArray(item['dc:subject'])) {
        tags.push(...item['dc:subject']);
      } else {
        tags.push(item['dc:subject']);
      }
    }

    // 重複を除去して正規化
    return [
      ...new Set(
        tags.filter((tag) => tag && tag.length > 0).map((tag) => tag.trim())
      ),
    ];
  }

  /**
   * RSS項目からサムネイルを抽出
   */
  private extractThumbnailFromItem(item: RSSItem): string | null {
    // media:thumbnail
    if (item['media:thumbnail']) {
      const thumbnail = item['media:thumbnail'];
      if (typeof thumbnail === 'object' && thumbnail.$ && thumbnail.$.url) {
        return thumbnail.$.url;
      } else if (typeof thumbnail === 'string') {
        return thumbnail;
      }
    }

    // media:content（画像の場合）
    if (item['media:content']) {
      const media = item['media:content'];
      if (
        typeof media === 'object' &&
        media.$ &&
        media.$.medium === 'image' &&
        media.$.url
      ) {
        return media.$.url;
      }
    }

    // enclosure（画像の場合）
    if (item.enclosure && item.enclosure.type?.startsWith('image/')) {
      return item.enclosure.url || null;
    }

    // コンテンツから最初の画像を抽出
    const content =
      item['content:encoded'] || item.content || item.description || '';
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch) {
      return imgMatch[1];
    }

    return null;
  }

  /**
   * 処理済み記事のキャッシュをクリア
   * 次のフェッチサイクル前に呼び出す
   */
  clearProcessedCache(): void {
    this.processedArticles.clear();
  }
}

/**
 * Phase 1 ソース設定
 * 大手テック企業のエンジニアリングブログ
 */
export const FOREIGN_SOURCE_CONFIGS: Record<string, ForeignSourceConfig> = {
  'Meta Engineering': {
    feedUrl: 'https://engineering.fb.com/feed/',
    tagPrefix: 'Meta',
  },
  'Uber Engineering': {
    feedUrl: 'https://www.uber.com/blog/engineering/rss/',
    tagPrefix: 'Uber',
  },
  'Netflix TechBlog': {
    feedUrl: 'https://netflixtechblog.medium.com/feed',
    tagPrefix: 'Netflix',
  },
  'Spotify Engineering': {
    feedUrl: 'https://engineering.atspotify.com/feed/',
    tagPrefix: 'Spotify',
  },
  'Pinterest Engineering': {
    feedUrl: 'https://medium.com/feed/pinterest-engineering',
    tagPrefix: 'Pinterest',
  },
};

/**
 * ソース名からForeignSourceConfigを取得するヘルパー
 */
export function getForeignSourceConfig(
  sourceName: string
): ForeignSourceConfig | undefined {
  return FOREIGN_SOURCE_CONFIGS[sourceName];
}
