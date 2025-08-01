import Parser from 'rss-parser';
import { Source } from '@prisma/client';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface MicrosoftDevBlogItem {
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

export class MicrosoftDevBlogFetcher extends BaseFetcher {
  private parser: Parser<unknown, MicrosoftDevBlogItem>;
  
  // 主要なMicrosoft開発者ブログのRSSフィード
  private rssUrls = [
    { url: 'https://devblogs.microsoft.com/dotnet/feed/', name: '.NET' },
    { url: 'https://devblogs.microsoft.com/typescript/feed/', name: 'TypeScript' },
    { url: 'https://devblogs.microsoft.com/visualstudio/feed/', name: 'Visual Studio' },
  ];
  
  constructor(source: Source) {
    super(source);
    this.parser = new Parser();
  }

  async fetch(): Promise<FetchResult> {
    return this.safeFetch();
  }

  protected async fetchInternal(): Promise<FetchResult> {
    const allArticles: CreateArticleInput[] = [];
    const allErrors: Error[] = [];
    const seenUrls = new Set<string>();

    // 各RSSフィードから記事を取得
    for (const feedInfo of this.rssUrls) {
      try {
        console.log(`📡 Microsoft DevBlogs (${feedInfo.name}) から記事を取得中...`);
        const feed = await this.parser.parseURL(feedInfo.url);
        
        for (const item of feed.items) {
          if (!item.title || !item.link) {
            continue;
          }

          // 重複チェック
          const normalizedUrl = this.normalizeUrl(item.link);
          if (seenUrls.has(normalizedUrl)) {
            continue;
          }
          seenUrls.add(normalizedUrl);

          try {
            const article: CreateArticleInput = {
              title: `[${feedInfo.name}] ${item.title}`,
              url: normalizedUrl,
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

            allArticles.push(article);
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`記事処理エラー (${item.title}):`, err.message);
            allErrors.push(err);
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`Microsoft DevBlogs (${feedInfo.name}) RSSフィードの取得エラー:`, err.message);
        allErrors.push(err);
      }
    }

    // 発行日時でソートして最新30件を返す
    allArticles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    
    return { 
      articles: allArticles.slice(0, 30), 
      errors: allErrors 
    };
  }
}