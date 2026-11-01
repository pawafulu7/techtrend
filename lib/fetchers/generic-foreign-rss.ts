/**
 * 海外技術ブログ用汎用RSSフェッチャー
 * 大手テック企業のエンジニアリングブログを統一的に処理
 */

import Parser from 'rss-parser';
import { fetchFeedXml } from './fetch-feed';
import { Source } from '@/lib/prisma-exports';
import { BaseFetcher } from './base';
import { FetchResult, CreateArticleInput } from '@/types/fetchers';
import { logger } from '@/lib/logger';
import { normalizeUrl } from '@/lib/utils/url/url-normalizer';
import { isDuplicate } from '@/lib/articles/duplicate-detection';
import type { ForeignSourceConfig } from './config/foreign-rss-sources';

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
    if (config.urlPathFilter && config.categoryFilter?.length) {
      throw new Error(
        `${source.name}: urlPathFilter と categoryFilter は併用できません`
      );
    }
    const parserOptions: Parser.ParserOptions<
      Record<string, unknown>,
      Record<string, unknown>
    > = {
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

      const feed = await this.parser.parseString(await fetchFeedXml(this.config.feedUrl));

      const allItems = feed.items || [];

      // URLパスフィルタリング（設定がある場合のみ）
      // categoryFilter と異なり slice() の前に全 item へ適用する。slice 後だと、
      // フィード先頭が対象外パスで占められるソース（例: Vercel は /changelog/ が
      // 支配的）で対象記事をほとんど取得できない
      let pathFilteredItems = allItems;
      if (this.config.urlPathFilter) {
        pathFilteredItems = allItems.filter((item) =>
          this.matchesUrlPathFilter(item.link)
        );
        logger.info(
          {
            source: this.source.name,
            // フィード肥大化の追跡用にフィルタ前の全item数も記録する
            totalItems: allItems.length,
            after: pathFilteredItems.length,
            filter: this.config.urlPathFilter,
          },
          'URLパスフィルタ適用'
        );
        if (pathFilteredItems.length === 0) {
          logger.warn(
            { source: this.source.name, filter: this.config.urlPathFilter },
            'URLパスフィルタ後の記事が0件'
          );
        }
      }

      // 最新30件まで処理
      const items = pathFilteredItems.slice(0, 30);

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
          // 相対 link は絶対URLへ解決してから保存する（詳細は resolveItemLink）
          const itemUrl = this.resolveItemLink(item.link);

          // URLを正規化
          const normalizedUrl = normalizeUrl(itemUrl);

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
            url: this.config.useNormalizedUrl ? normalizedUrl : itemUrl,
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
   * link を feedUrl 基準で URL オブジェクトへ解決する共通ヘルパー
   * 解決できない場合は null を返す
   */
  private tryResolveUrl(link: string): URL | null {
    try {
      return new URL(link, this.config.feedUrl);
    } catch {
      return null;
    }
  }

  /**
   * item の link を保存用の絶対URLへ解決する
   *
   * rss-parser は Atom の `<link href="/blog/post">` を相対URLのまま返す。
   * 相対URLをそのまま保存すると、URLの一意制約がサイトを跨いで衝突し、
   * エンリッチメントの fetch も記事カードの外部リンクも機能しないため、
   * feedUrl を基準に解決する（`xml:base` は考慮しない）。
   *
   * 既に絶対URLの場合は URL コンストラクタを通さず元の文字列を返す。
   * 通すとパーセントエンコーディング等が正規化され、既存レコードとの
   * 完全一致照合が崩れて重複作成につながるため。
   */
  private resolveItemLink(link: string): string {
    try {
      new URL(link);
      return link;
    } catch {
      return this.tryResolveUrl(link)?.href ?? link;
    }
  }

  /**
   * URLパスフィルタに一致するかチェック
   *
   * - 相対URLは feedUrl 基準で解決してから判定する（絶対URL前提で判定すると
   *   有効な相対 link を不正URLとして落としてしまう）
   * - http / https 以外のスキーム（data:, ftp: 等）は対象外とする
   * - 判定は解決後 pathname の前方一致。文字列 includes ではないため
   *   `/changelog/blog-post` のような別パスの誤マッチは起きない
   */
  private matchesUrlPathFilter(link: string | undefined): boolean {
    const pathPrefix = this.config.urlPathFilter;
    if (!pathPrefix) return true;
    if (!link) return false;

    // 解決不能なURLは後段へ流さない
    const resolved = this.tryResolveUrl(link);
    if (!resolved) return false;
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return false;
    }
    return resolved.pathname.startsWith(pathPrefix);
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
    // ignoreFeedContent 有効時はフィード本文を採用せず、保存後エンリッチメントに委ねる
    if (this.config.ignoreFeedContent) {
      return '';
    }

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
