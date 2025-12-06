/**
 * Hatena Blog Dev Entries Fetcher
 * hatena.blog/dev/entries から企業技術ブログ記事を取得
 * GraphQL APIを使用してページネーションをサポート
 */

import { BaseFetcher } from './base';
import type { FetchResult, CreateArticleInput } from '@/types/fetchers';
import { logger } from '@/lib/logger';

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
 * GraphQL APIレスポンスの型
 */
interface GraphQLResponse {
  data?: {
    recentEntries: {
      entries: HatenaBlogEntry[];
      hasNextPage: boolean;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Hatena Blog Dev Fetcher
 * 企業技術ブログの新着記事一覧を取得
 */
export class HatenaBlogDevFetcher extends BaseFetcher {
  private readonly graphqlEndpoint = 'https://hatena.blog/dev/api/graphql';
  private readonly pageSize = 20;
  private readonly maxPages: number;
  private readonly timeout: number;

  // GraphQLクエリ（ユーザー提供の実際のクエリを簡略化）
  private readonly graphqlQuery = `
    query RecentEntries($limit: Int!, $skip: Int!) {
      recentEntries(limit: $limit, skip: $skip) {
        entries {
          title
          url
          created
          blog {
            title
            companyName
          }
        }
        hasNextPage
      }
    }
  `;

  constructor(source: import('@prisma/client').Source) {
    super(source);
    // Validate environment variable parsing (handle NaN and negative values)
    const parsedMaxPages = parseInt(process.env.HATENA_BLOG_DEV_MAX_PAGES || '3', 10);
    this.maxPages = Number.isNaN(parsedMaxPages) || parsedMaxPages < 1 ? 3 : parsedMaxPages;
    const parsedTimeout = parseInt(process.env.HATENA_BLOG_DEV_TIMEOUT || '30000', 10);
    this.timeout = Number.isNaN(parsedTimeout) || parsedTimeout < 1000 ? 30000 : parsedTimeout;
  }

  /**
   * 記事一覧を取得（GraphQL API使用）
   */
  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];
    const seenUrls = new Set<string>();

    for (let page = 0; page < this.maxPages; page++) {
      try {
        const skip = page * this.pageSize;
        const { entries, hasNextPage } = await this.retry(() =>
          this.fetchPage(skip)
        );

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
            `[page=${page + 1}] ${error instanceof Error ? error.message : String(error)}`
          )
        );
        // ページ取得エラーでも継続（fail-open）
      }
    }

    return { articles, errors };
  }

  /**
   * GraphQL APIで1ページ分のエントリを取得
   */
  private async fetchPage(skip: number): Promise<{
    entries: HatenaBlogEntry[];
    hasNextPage: boolean;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: this.graphqlQuery,
          variables: {
            limit: this.pageSize,
            skip,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = (await response.json()) as GraphQLResponse;

      if (json.errors && json.errors.length > 0) {
        throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
      }

      if (!json.data?.recentEntries) {
        throw new Error('Invalid response: missing recentEntries');
      }

      return {
        entries: json.data.recentEntries.entries.filter((e) =>
          this.isValidEntry(e)
        ),
        hasNextPage: json.data.recentEntries.hasNextPage,
      };
    } finally {
      clearTimeout(timeoutId);
    }
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
    // Validate date format
    const publishedAt = new Date(entry.created);
    if (Number.isNaN(publishedAt.getTime())) {
      // Fall back to current time if date is invalid
      logger.warn({ dateValue: entry.created }, 'HatenaBlogDevFetcher: Invalid date format, using current time');
    }

    return {
      title: entry.title,
      url: entry.url,
      publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
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
