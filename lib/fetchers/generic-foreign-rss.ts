/**
 * 海外技術ブログ用汎用RSSフェッチャー
 * 大手テック企業のエンジニアリングブログを統一的に処理
 */

import Parser from 'rss-parser';
import { Source } from '@/lib/prisma-exports';
import { BaseFetcher } from './base';
import { FetchResult, CreateArticleInput } from '@/types/fetchers';
import { logger } from '@/lib/logger';
import { normalizeUrl } from '@/lib/utils/url/url-normalizer';
import { isDuplicate } from '@/lib/utils/duplicate-detection';

// Atom形式のカテゴリ型
interface AtomCategory {
  $?: { term?: string; scheme?: string };
}

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
  category?: AtomCategory[] | AtomCategory;
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
  categoryFilter?: string[];
  /**
   * 記事URLをトラッキングパラメータ除去後の正規化URLで保存する。
   *
   * フィードが `?utm_source=feed` 等を付与するソース向け。既存レコードが
   * 生URLで保存されている既存ソースに後から有効化すると、同一記事が別URLで
   * 重複作成されるため、レコードを持たない新規ソースでのみ有効化すること。
   */
  useNormalizedUrl?: boolean;
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
    const parserOptions: Parser.ParserOptions<
      Record<string, unknown>,
      Record<string, unknown>
    > = {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TechTrend/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      customFields: {
        item: [['category', 'category', { keepArray: true }]],
      },
    };
    this.parser = new Parser(parserOptions);
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

      // カテゴリフィルタリング（設定がある場合のみ）
      let filteredItems = items;
      if (this.config.categoryFilter && this.config.categoryFilter.length > 0) {
        const beforeCount = items.length;
        filteredItems = items.filter((item) =>
          this.matchesCategoryFilter(item)
        );
        logger.info(
          {
            source: this.source.name,
            before: beforeCount,
            after: filteredItems.length,
            filter: this.config.categoryFilter,
          },
          'カテゴリフィルタ適用'
        );
        if (filteredItems.length === 0) {
          logger.warn(
            { source: this.source.name, filter: this.config.categoryFilter },
            'カテゴリフィルタ後の記事が0件'
          );
        }
      }

      for (const item of filteredItems) {
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
            // 既定は元URL（エンリッチメントで正しくアクセスするため）。
            // useNormalizedUrl 有効時はトラッキングパラメータ除去後のURLで保存し、
            // 他ソース経由で収集済みの同一記事と重複しないようにする
            url: this.config.useNormalizedUrl ? normalizedUrl : item.link,
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
   * Atom形式のカテゴリterm値を抽出
   */
  private extractAtomCategoryTerms(item: RSSItem): string[] {
    const atomCategories = item.category;
    const categoryList = Array.isArray(atomCategories)
      ? atomCategories
      : atomCategories
        ? [atomCategories]
        : [];
    const terms: string[] = [];
    for (const cat of categoryList) {
      const term = cat.$?.term?.trim();
      if (term && term.length > 0) {
        terms.push(term);
      }
    }
    return terms;
  }

  /**
   * RSS categories フィールドからカテゴリ文字列を抽出
   * string[] / object[] ({ _?: string; term?: string }) の両形式に対応
   */
  private extractRssCategoryTerms(item: RSSItem): string[] {
    if (!item.categories || !Array.isArray(item.categories)) return [];
    return item.categories
      .map((cat) =>
        typeof cat === 'string'
          ? cat
          : cat && typeof cat === 'object'
            ? (cat as { _?: string; term?: string })._ ||
              (cat as { _?: string; term?: string }).term ||
              ''
            : ''
      )
      .map((term) => term.trim())
      .filter((term) => term.length > 0);
  }

  /**
   * カテゴリフィルタに一致するかチェック
   * Atomフィードの category 要素（{ $: { term, scheme } }形状）に対応
   */
  private matchesCategoryFilter(item: RSSItem): boolean {
    if (!this.config.categoryFilter) return true;

    const filterTerms = this.config.categoryFilter
      .map((f) => f.trim().toLowerCase())
      .filter((f) => f.length > 0);
    if (filterTerms.length === 0) return true;

    // 1. Atom形式カテゴリ
    for (const term of this.extractAtomCategoryTerms(item)) {
      if (filterTerms.includes(term.toLowerCase())) {
        return true;
      }
    }

    // 2. 標準のRSS categories（string[] / object[]形状）
    for (const term of this.extractRssCategoryTerms(item)) {
      if (filterTerms.includes(term.toLowerCase())) {
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

    // Atom形式のcategoryからタグを抽出
    tags.push(...this.extractAtomCategoryTerms(item));

    // カテゴリーからタグを抽出
    if (item.categories) {
      tags.push(...this.extractRssCategoryTerms(item));
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
  // Japanese Tech Media
  'ITmedia Security': {
    feedUrl: 'https://rss.itmedia.co.jp/rss/2.0/news_security.xml',
    tagPrefix: 'itmedia-security',
  },
  'ITmedia AI+': {
    feedUrl: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml',
    tagPrefix: 'itmedia-ai',
  },
  '@IT': {
    feedUrl: 'https://rss.itmedia.co.jp/rss/2.0/ait.xml',
    tagPrefix: 'atit',
  },
  // Business Media
  'Business Insider': {
    feedUrl: 'https://feeds.businessinsider.com/custom/all',
    tagPrefix: 'BusinessInsider',
    categoryFilter: ['Tech', 'AI'],
  },
  // Japanese Tech Media (Batch 1, Issue #628)
  // 4ソースとも新規のため useNormalizedUrl を有効化する。gihyo.jp / Findy は
  // フィードが ?utm_source=feed を付与しており、既にはてなブックマーク経由で
  // 収集済みの同一記事（正規URL）と重複するため
  'JSer.info': {
    feedUrl: 'https://jser.info/rss/',
    tagPrefix: 'jser',
    useNormalizedUrl: true,
  },
  CodeZine: {
    feedUrl: 'https://codezine.jp/rss/new/20/index.xml',
    tagPrefix: 'codezine',
    useNormalizedUrl: true,
  },
  'gihyo.jp': {
    feedUrl: 'https://gihyo.jp/feed/rss2',
    tagPrefix: 'gihyo',
    useNormalizedUrl: true,
  },
  'Findy Engineer Lab': {
    feedUrl: 'https://engineer-lab.findy-code.io/feed',
    tagPrefix: 'findy-engineer-lab',
    useNormalizedUrl: true,
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
