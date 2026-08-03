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
  /**
   * フィードの description/content をコンテンツ抽出時に無視し、常に空文字を返す。
   *
   * description がコメントリンク等のノイズのみのソース向け。空文字を返すことで
   * 保存時 content が空となり、保存後エンリッチメントが記事本文を取得する
   * （エンリッチメント経路に本文取得を委ねる）。
   */
  ignoreFeedContent?: boolean;
  /**
   * enricher による本文上書きを行わないソース。
   *
   * リバーページ等、記事単位の本文が取得できず、enricher による抽出結果が
   * ノイズ（広告含む）になるソース向け。`isEnrichmentSkipped()` で参照する。
   */
  skipEnrichment?: boolean;
  /**
   * 記事URLのパス前方一致で item を絞り込む。
   *
   * 1つのフィードにブログ記事と別種のエントリ（製品チェンジログ等）が混在し、
   * かつ category による判別ができないソース向け。
   *
   * 設定値は先頭スラッシュを含むパス prefix（例: `/blog/`）。解決後 pathname に
   * 対する `startsWith` 判定のため、`/blog/` は `/blogger` に一致せず、
   * 末尾スラッシュなしの `/blog` 単体も除外する。
   *
   * `categoryFilter` と異なり `slice()` の**前**に全 item へ適用する
   * （フィード先頭が対象外パスで占められるソースで取りこぼさないため）。
   */
  urlPathFilter?: string;
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
      try {
        return new URL(link, this.config.feedUrl).href;
      } catch {
        return link;
      }
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

    try {
      const resolved = new URL(link, this.config.feedUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        return false;
      }
      return resolved.pathname.startsWith(pathPrefix);
    } catch {
      // 解決不能なURLは後段へ流さない
      return false;
    }
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
  // Foreign Aggregators (Batch 2, Issue #628)
  // Lobsters: item link が外部記事URL（Hacker News と同型のアグリゲータ）。
  // HN が生URL保存のため useNormalizedUrl は有効化しない（正規化すると HN 既存記事
  // とのURL照合が崩れて重複作成される。plan_20260802_221749 §4.2 参照）。
  // description は Comments リンクのみのため ignoreFeedContent で本文を
  // エンリッチメントに委ねる
  Lobsters: {
    feedUrl: 'https://lobste.rs/rss',
    tagPrefix: 'lobsters',
    ignoreFeedContent: true,
  },
  // Techmeme: item link が自サイトのリバーページ・パーマリンク（#アンカー付き）。
  // enricher はリバーページ全体（広告含む）を抽出してしまうため skipEnrichment で
  // description 由来の見出し本文を維持する
  Techmeme: {
    feedUrl: 'https://www.techmeme.com/feed.xml',
    tagPrefix: 'techmeme',
    useNormalizedUrl: true,
    skipEnrichment: true,
  },
  // Foreign Company / Product Blogs (Batch 3, Issue #628)
  // useNormalizedUrl は「新規ソースなら常に有効化」ではなく、既存レコードの
  // 保存URL形式に合わせる（重複判定は保存URL文字列の完全一致のため）。
  // 既存が末尾スラッシュ付きの生URLで保存されているソースで有効化すると、
  // normalizeUrl() の末尾スラッシュ除去により照合が崩れて重複作成される
  //
  // Vercel: フィード（/atom）に blog と changelog が混在し Atom category も
  // 持たないため、categoryFilter ではなく urlPathFilter で /blog/ に絞る
  'Vercel Blog': {
    feedUrl: 'https://vercel.com/atom',
    tagPrefix: 'vercel',
    useNormalizedUrl: true,
    urlPathFilter: '/blog/',
  },
  // TypeScript: Hacker News / はてなブックマーク経由の既存記事が
  // 末尾スラッシュ付きの生URLで保存済みのため useNormalizedUrl は有効化しない
  'TypeScript Blog': {
    feedUrl: 'https://devblogs.microsoft.com/typescript/feed/',
    tagPrefix: 'typescript',
  },
  // VS Code: Atom category term が blog / release に分かれる。リリースノートは
  // 本文がリンクのみで記事性が薄いため blog のみ収集する
  'VS Code Blog': {
    feedUrl: 'https://code.visualstudio.com/feed.xml',
    tagPrefix: 'vscode',
    useNormalizedUrl: true,
    categoryFilter: ['blog'],
  },
  'Dropbox Tech': {
    feedUrl: 'https://dropbox.tech/feed',
    tagPrefix: 'dropbox',
    useNormalizedUrl: true,
  },
  // Fly.io: Hacker News 経由の既存記事が末尾スラッシュ付きの生URLで保存済みの
  // ため useNormalizedUrl は有効化しない（TypeScript Blog と同じ理由）
  'Fly.io Blog': {
    feedUrl: 'https://fly.io/blog/feed.xml',
    tagPrefix: 'flyio',
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

/**
 * 指定ソースが enricher による本文上書きをスキップする対象かどうかを判定する
 * （純粋関数）。collect-feeds.ts / enrich-thin-content.ts 等、enricher で
 * 記事本文を上書きする全経路から参照すること。
 */
export function isEnrichmentSkipped(sourceName: string): boolean {
  return FOREIGN_SOURCE_CONFIGS[sourceName]?.skipEnrichment === true;
}
