/**
 * Hatena Blog Dev Entries Fetcher
 * hatena.blog/dev/entries から企業技術ブログ記事を取得
 */

import { BaseFetcher } from './base';
import { WebFetcher } from '../utils/web-fetcher';
import type { FetchResult, CreateArticleInput } from '@/types/fetchers';

/**
 * hatena.blog/dev/entries から取得する記事エントリの型
 */
interface HatenaBlogEntry {
  title: string;
  url: string;
  created: string;
  blog: {
    title: string;
    companyName?: string;
  };
}

/**
 * urqlState内のページデータ構造
 */
interface UrqlPageData {
  recentEntries: {
    entries: HatenaBlogEntry[];
    hasNextPage: boolean;
  };
}

/**
 * Hatena Blog Dev Fetcher
 * 企業技術ブログの新着記事一覧を取得
 */
export class HatenaBlogDevFetcher extends BaseFetcher {
  private readonly baseUrl = 'https://hatena.blog/dev/entries';
  private readonly maxPages: number;

  constructor(source: import('@prisma/client').Source) {
    super(source);
    this.maxPages = parseInt(process.env.HATENA_BLOG_DEV_MAX_PAGES || '3', 10);
  }

  /**
   * 記事一覧を取得
   */
  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];
    const seenUrls = new Set<string>();
    const webFetcher = new WebFetcher(30000); // 30秒タイムアウト

    for (let page = 1; page <= this.maxPages; page++) {
      try {
        const url = page === 1 ? this.baseUrl : `${this.baseUrl}?page=${page}`;
        const html = await this.retry(() => webFetcher.fetch(url));

        const { entries, hasNextPage } = this.extractEntriesFromPage(html);

        for (const entry of entries) {
          if (!seenUrls.has(entry.url)) {
            seenUrls.add(entry.url);
            articles.push(this.toArticleInput(entry));
          }
        }

        if (!hasNextPage) break;
      } catch (error) {
        errors.push(
          new Error(
            `[page=${page}] ${error instanceof Error ? error.message : String(error)}`
          )
        );
        // ページ取得エラーでも継続（fail-open）
      }
    }

    return { articles, errors };
  }

  /**
   * HTMLからurqlStateを抽出してエントリを取得
   */
  private extractEntriesFromPage(html: string): {
    entries: HatenaBlogEntry[];
    hasNextPage: boolean;
  } {
    // パターン1: window.__URQL_DATA__
    // Note: [\s\S] is used instead of 's' flag for ES2017 compatibility
    let match = html.match(
      /<script[^>]*>\s*window\.__URQL_DATA__\s*=\s*(\{[\s\S]+?\});\s*<\/script>/
    );

    // パターン2: urqlState = {...}
    if (!match) {
      match = html.match(/urqlState\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
    }

    // パターン3: JSON.parse("...")
    if (!match) {
      const encodedMatch = html.match(
        /window\.__URQL_DATA__\s*=\s*JSON\.parse\("([^"]+)"\)/
      );
      if (encodedMatch) {
        try {
          const decoded = JSON.parse(`"${encodedMatch[1]}"`);
          return this.parseUrqlState(decoded);
        } catch {
          // デコード失敗
        }
      }
    }

    if (!match) {
      return { entries: [], hasNextPage: false };
    }

    return this.parseUrqlState(match[1]);
  }

  /**
   * urqlStateのJSONをパースしてエントリを抽出
   */
  private parseUrqlState(jsonStr: string): {
    entries: HatenaBlogEntry[];
    hasNextPage: boolean;
  } {
    try {
      const state = JSON.parse(jsonStr);

      // キーは動的なので、recentEntriesを持つエントリを探す
      for (const value of Object.values(state)) {
        const pageData = value as { data?: UrqlPageData };
        if (this.isValidPageData(pageData?.data)) {
          return {
            entries: pageData.data!.recentEntries.entries.filter(
              (e) => this.isValidEntry(e)
            ),
            hasNextPage: pageData.data!.recentEntries.hasNextPage,
          };
        }
      }
    } catch {
      // JSONパースエラー
    }
    return { entries: [], hasNextPage: false };
  }

  /**
   * ページデータが期待する構造を持つかチェック
   */
  private isValidPageData(data: unknown): data is UrqlPageData {
    if (!data || typeof data !== 'object') return false;
    const d = data as {
      recentEntries?: { entries?: unknown[]; hasNextPage?: boolean };
    };
    return Array.isArray(d.recentEntries?.entries);
  }

  /**
   * エントリが有効かチェック
   */
  private isValidEntry(entry: unknown): entry is HatenaBlogEntry {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Partial<HatenaBlogEntry>;
    return (
      typeof e.title === 'string' &&
      typeof e.url === 'string' &&
      typeof e.created === 'string'
    );
  }

  /**
   * エントリをCreateArticleInput形式に変換
   */
  private toArticleInput(entry: HatenaBlogEntry): CreateArticleInput {
    return {
      title: entry.title,
      url: entry.url,
      publishedAt: new Date(entry.created),
      sourceId: this.source.id,
      thumbnail: null,
      content: null, // Enricherで取得
      tagNames: this.generateTags(entry),
    };
  }

  /**
   * エントリからタグを生成
   */
  private generateTags(entry: HatenaBlogEntry): string[] {
    const tags: string[] = [];

    // 企業名をタグとして追加
    if (entry.blog.companyName) {
      tags.push(entry.blog.companyName);
    }

    return tags;
  }
}
