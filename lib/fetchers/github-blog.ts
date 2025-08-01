import Parser from 'rss-parser';
import { Source } from '@prisma/client';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface GitHubBlogItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  author?: string;
  enclosure?: {
    url?: string;
    type?: string;
  };
}

export class GitHubBlogFetcher extends BaseFetcher {
  private parser: Parser<unknown, GitHubBlogItem>;
  
  constructor(source: Source) {
    super(source);
    this.parser = new Parser();
  }

  async fetch(): Promise<FetchResult> {
    return this.safeFetch();
  }

  protected async fetchInternal(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      const feed = await this.parser.parseURL('https://github.blog/feed/');
      
      // 記事をイテレート
      for (const item of feed.items) {
        if (!item.title || !item.link) {
          continue;
        }

        try {
          const article: CreateArticleInput = {
            title: item.title,
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は generate-summaries.ts で生成
            content: item.content || item.contentSnippet || '',
            thumbnail: item.enclosure?.url || null,
            publishedAt: parseRSSDate(item.pubDate || item.isoDate),
            sourceId: this.source.id,
            qualityScore: 0,
            bookmarks: 0,
            userVotes: 0,
            tags: [], // タグは generate-summaries.ts で生成
          };

          articles.push(article);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(`記事処理エラー (${item.title}):`, err.message);
          errors.push(err);
        }
      }

      // 最新30件に制限
      return { 
        articles: articles.slice(0, 30), 
        errors 
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('GitHub Blog RSSフィードの取得エラー:', err.message);
      errors.push(err);
      return { articles: [], errors };
    }
  }
}