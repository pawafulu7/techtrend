/**
 * Docswell Fetcher
 * 日本語技術プレゼンテーション共有サイトDocswell.comからの記事取得
 */

import { BaseFetcher } from './base';
import { Source } from '@/lib/prisma-exports';
import { CreateArticleInput } from '@/types';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import RSSParser from 'rss-parser';
import { docswellConfig } from '../config/docswell';

interface DocswellRSSItem {
  title?: string;
  link?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  pubDate?: string;
  'media:thumbnail'?: {
    $?: { url?: string };
    url?: string;
  } | string;
  'dc:creator'?: string;
}

export class DocswellFetcher extends BaseFetcher {
  private parser: RSSParser;

  // Docswellの許可ホスト一覧
  private static readonly ALLOWED_THUMBNAIL_HOSTS = [
    'docswell.com',
    'www.docswell.com',
    'bcdn.docswell.com',
  ];

  // 許可される画像拡張子パターン
  private static readonly ALLOWED_IMAGE_PATTERN = /\.(jpe?g|png|webp|gif)(\?|$)/i;

  constructor(source: Source) {
    super(source);
    this.parser = new RSSParser({
      customFields: {
        item: ['media:thumbnail', 'media:statistics', 'dc:subject', 'dc:creator']
      }
    });
  }

  /**
   * Validate thumbnail URL for security and correctness
   * @param url - URL to validate
   * @returns Valid URL or undefined
   */
  private validateThumbnailUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;

    // Trim and validate length
    const trimmedUrl = url.trim();
    if (!trimmedUrl || trimmedUrl.length > 2048) return undefined;

    // Reject dangerous protocols (case-insensitive early check; URL class normalizes later)
    const lowerUrl = trimmedUrl.toLowerCase();
    if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:') ||
        lowerUrl.startsWith('vbscript:') || lowerUrl.startsWith('blob:') || lowerUrl.startsWith('file:')) {
      return undefined;
    }

    // Normalize protocol-relative URL
    const normalizedUrl = trimmedUrl.startsWith('//') ? `https:${trimmedUrl}` : trimmedUrl;

    try {
      const parsed = new URL(normalizedUrl);

      // Use parsed.protocol for robust check (handles case-insensitive, etc.)
      if (parsed.protocol !== 'https:') {
        return undefined;
      }

      // Reject URLs with userinfo (username/password)
      if (parsed.username || parsed.password) {
        return undefined;
      }

      // Validate hostname against allowlist
      const isAllowedHost = DocswellFetcher.ALLOWED_THUMBNAIL_HOSTS.some(
        host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
      );
      if (!isAllowedHost) {
        return undefined;
      }

      // Validate image extension or width parameter
      const hasValidExtension = DocswellFetcher.ALLOWED_IMAGE_PATTERN.test(parsed.pathname);
      const hasWidthParam = parsed.searchParams.has('width');

      if (!hasValidExtension && !hasWidthParam) {
        return undefined;
      }

      return normalizedUrl;
    } catch {
      // URL parse error
      return undefined;
    }
  }

  /**
   * Find valid thumbnail image from element
   * Strategy:
   * 1. Prefer img with alt="slide-thumbnail"
   * 2. Fallback to first img with valid docswell host
   */
  private findValidThumbnailImg(
    $div: cheerio.Cheerio<Element>,
    $: cheerio.CheerioAPI
  ): string | undefined {
    // Strategy 1: Search by alt attribute
    const $imgByAlt = $div.find('img[alt="slide-thumbnail"]').first();
    if ($imgByAlt.length) {
      const src = $imgByAlt.attr('src');
      const validated = this.validateThumbnailUrl(src);
      if (validated) return validated;
    }

    // Strategy 2: Scan all imgs and return first valid one
    let validThumbnail: string | undefined;
    $div.find('img').each((_, el) => {
      if (validThumbnail) return false; // Stop when found
      const src = $(el).attr('src');
      const validated = this.validateThumbnailUrl(src);
      if (validated) {
        validThumbnail = validated;
        return false;
      }
    });

    return validThumbnail;
  }

  async fetch(): Promise<{ articles: CreateArticleInput[]; errors: Error[] }> {
    const errors: Error[] = [];
    let articles: CreateArticleInput[] = [];

    try {
      articles = await this.fetchTrendingPresentations();
    } catch (_error) {
      const err = _error instanceof Error ? _error : new Error(String(_error));
      errors.push(err);
    }

    return { articles, errors };
  }

  /**
   * トレンドページからプレゼンテーションを取得
   */
  private async fetchTrendingPresentations(): Promise<CreateArticleInput[]> {
    const articles: CreateArticleInput[] = [];
    const trendingUrl = 'https://www.docswell.com/trending';
    
    
    // HTMLを取得
    const html = await this.fetchWithRetry(trendingUrl);
    const $ = cheerio.load(html);
    
    // グリッド内の各スライドを処理
    $('.grid > div').each((index, element) => {
      if (articles.length >= docswellConfig.maxArticles) {
        return false; // 最大件数に達したら終了
      }
      
      const $div = $(element);
      const $link = $div.find('a').first();
      const $h3 = $div.find('h3').first();
      
      const href = $link.attr('href');
      const title = $h3.text().trim();
      // Use validated thumbnail extraction with multiple strategies
      const thumbnail = this.findValidThumbnailImg($div, $);
      
      if (!href || !title) return;
      
      // URLを正規化（完全形式の場合はそのまま、相対パスの場合は補完）
      const url = href.startsWith('http') ? href : `https://www.docswell.com${href}`;
      
      articles.push({
        title,
        url,
        sourceId: this.source.id,
        content: title, // プレゼンテーションなのでタイトルをコンテンツとして使用
        publishedAt: new Date(),
        author: 'Docswell User', // デフォルト値
        tags: this.extractTags(title),
        thumbnail,
      });
    });
    
    return articles;
  }

  /**
   * RSSフィードから記事を取得（フォールバック）
   */
  private async fetchFromRSS(): Promise<CreateArticleInput[]> {
    const articles: CreateArticleInput[] = [];
    const feedUrl = 'https://www.docswell.com/feed/latest';
    
    const feed = await this.parser.parseURL(feedUrl);
    
    let processedCount = 0;
    for (const item of feed.items) {
      if (processedCount >= docswellConfig.maxArticles) {
        break;
      }
      
      if (!item.link || !item.title) continue;
      
      // 一時的に閲覧数フィルタリングを無効化してテスト
      // 後でRSSパーサーのカスタムフィールドを修正する必要がある
      
      // サムネイルを取得（検証済みURLのみ使用）
      let thumbnail: string | undefined;
      const thumbnailElement = (item as DocswellRSSItem)['media:thumbnail'];
      if (thumbnailElement) {
        if (typeof thumbnailElement === 'string') {
          thumbnail = this.validateThumbnailUrl(thumbnailElement);
        } else if (thumbnailElement.$ && thumbnailElement.$.url) {
          thumbnail = this.validateThumbnailUrl(thumbnailElement.$.url);
        } else if (thumbnailElement.url) {
          thumbnail = this.validateThumbnailUrl(thumbnailElement.url);
        }
      }
      
      // 作者を取得
      const author = (item as DocswellRSSItem)['dc:creator'] || item.creator || 'Unknown';
      
      articles.push({
        title: item.title,
        url: item.link,
        sourceId: this.source.id,
        content: item.contentSnippet || item.content || item.title,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        author: author,
        tags: this.extractTags(item.title + ' ' + (item.contentSnippet || '')),
        thumbnail,
      });
      
      processedCount++;
      
      if (docswellConfig.debug) {
      }
    }
    
    return articles;
  }

  /**
   * リトライ機能付きのfetch
   */
  private async fetchWithRetry(url: string, retries = 0): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), docswellConfig.timeout);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.text();
    } catch (_error) {
      if (retries < docswellConfig.retryLimit) {
        const waitTime = docswellConfig.requestDelay * (retries + 1);
        if (docswellConfig.debug) {
        }
        await this.delay(waitTime);
        return this.fetchWithRetry(url, retries + 1);
      }
      throw _error as Error;
    }
  }

  /**
   * 遅延処理
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * タグ抽出
   */
  private extractTags(text: string): string[] {
    const tags: string[] = [];
    
    // 技術キーワードを抽出
    const techKeywords = [
      'AI', 'ChatGPT', 'LLM', 'GPT', 'Claude', 'Gemini',
      'Python', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Next.js',
      'Node.js', 'Go', 'Rust', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure',
      'DevOps', 'CI/CD', 'microservices', 'serverless', 'API', 'GraphQL',
      'machine learning', '機械学習', 'データ分析', 'セキュリティ', 'パフォーマンス',
      'アーキテクチャ', 'データベース', 'MySQL', 'PostgreSQL', 'Redis',
      'Elasticsearch', 'monitoring', 'observability', 'SRE', 'infrastructure'
    ];

    for (const keyword of techKeywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        tags.push(keyword);
      }
    }

    // 日本語の技術キーワード
    const japaneseKeywords = [
      'フロントエンド', 'バックエンド', 'インフラ', 'クラウド', 
      'ディープラーニング', 'ブロックチェーン', 'マイクロサービス', 
      'コンテナ', '仮想化', 'テスト', '自動化', '最適化', '設計', '実装',
      'プロジェクト管理', 'アジャイル', 'スクラム', 'デザインパターン'
    ];

    for (const keyword of japaneseKeywords) {
      if (text.includes(keyword)) {
        tags.push(keyword);
      }
    }

    // 重複を除いて最大5個まで返す
    return [...new Set(tags)].slice(0, 5);
  }
}
