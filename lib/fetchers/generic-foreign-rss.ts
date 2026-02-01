/**
 * 海外技術ブログ用汎用RSSフェッチャー
 * 大手テック企業のエンジニアリングブログを統一的に処理
 */

import Parser from 'rss-parser';
import { Source } from '@prisma/client';
import { BaseFetcher } from './base';
import { FetchResult, CreateArticleInput } from '@/types/fetchers';
import { logger } from '@/lib/logger';
import { normalizeUrl } from '@/lib/utils/url-normalizer';
import { isDuplicate } from '@/lib/utils/duplicate-detection';

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
  // 正規化済みURLのSet（O(1)での重複チェック用）
  private processedUrls: Set<string> = new Set();
  // タイトル比較用のリスト
  private processedTitles: string[] = [];

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
    this.processedUrls.clear();
    this.processedTitles = [];

    try {
      logger.info({ source: this.source.name }, '海外ソースのフィード取得開始');

      const feed = await this.parser.parseURL(this.config.feedUrl);

      // 最新30件まで処理
      const items = feed.items?.slice(0, 30) || [];

      for (const item of items) {
        if (!item.link || !item.title) continue;

        try {
          // URLを正規化
          const normalizedUrl = normalizeUrl(item.link);

          // 重複チェック（同一バッチ内）
          if (this.isDuplicateInBatch(normalizedUrl, item.title)) {
            logger.debug(
              { url: item.link },
              '同一バッチ内で重複検出、スキップ'
            );
            continue;
          }

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: normalizedUrl, // 正規化済みURLを保存
            content: this.extractContent(item),
            publishedAt: this.extractPublishDate(item),
            sourceId: this.source.id,
            summary: undefined, // AI要約は後で生成
            tagNames: this.extractTags(item),
            thumbnail: this.extractThumbnailFromItem(item) || undefined,
          };

          // 処理済みとして記録
          this.processedUrls.add(normalizedUrl);
          this.processedTitles.push(item.title);

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
   * 最適化: URLはSetで O(1) チェック、タイトルは既存isDuplicateを使用
   */
  private isDuplicateInBatch(normalizedUrl: string, title: string): boolean {
    // 1. URL重複チェック（O(1)）
    if (this.processedUrls.has(normalizedUrl)) {
      return true;
    }

    // 2. タイトル類似度チェック（既存のisDuplicate関数を使用）
    for (const existingTitle of this.processedTitles) {
      if (isDuplicate(existingTitle, title, 0.85)) {
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
    this.processedUrls.clear();
    this.processedTitles = [];
  }
}

/**
 * Phase 1 ソース設定
 * 大手テック企業のエンジニアリングブログ
 */
export const FOREIGN_SOURCE_CONFIGS: Record<string, ForeignSourceConfig> = {
  // Phase 1: 大手テック企業エンジニアリングブログ
  'Meta Engineering': {
    feedUrl: 'https://engineering.fb.com/feed/',
    tagPrefix: 'Meta',
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
  // Phase 2: 大手テック企業
  'Stripe Engineering': {
    feedUrl: 'https://stripe.com/blog/feed.rss',
    tagPrefix: 'Stripe',
  },
  'Discord Engineering': {
    feedUrl: 'https://discord.com/blog/rss.xml',
    tagPrefix: 'Discord',
  },
  'Slack Engineering': {
    feedUrl: 'https://slack.engineering/feed/',
    tagPrefix: 'Slack',
  },
  // Phase 2: クラウドネイティブ・Web
  'The New Stack': {
    feedUrl: 'https://thenewstack.io/feed/',
    tagPrefix: 'CloudNative',
  },
  'CNCF Blog': {
    feedUrl: 'https://www.cncf.io/feed/',
    tagPrefix: 'CNCF',
  },
  'Kubernetes Blog': {
    feedUrl: 'https://kubernetes.io/feed.xml',
    tagPrefix: 'Kubernetes',
  },
  'Chrome Developers': {
    feedUrl: 'https://developer.chrome.com/blog/feed.xml',
    tagPrefix: 'Chrome',
  },
  // Phase 2: 言語公式ブログ
  'Go Blog': {
    feedUrl: 'https://go.dev/blog/feed.atom',
    tagPrefix: 'Go',
  },
  'Rust Blog': {
    feedUrl: 'https://blog.rust-lang.org/feed.xml',
    tagPrefix: 'Rust',
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
