import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface PublickeyRSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  'dc:date'?: string;
  description?: string;
  'content:encoded'?: string;
  categories?: string[];
}

export class PublickeyFetcher extends BaseFetcher {
  private parser: Parser<any, PublickeyRSSItem>;

  constructor(source: any) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:date', 'dcDate'],
          ['content:encoded', 'contentEncoded'],
        ],
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      const feed = await this.retry(() => this.parser.parseURL(this.source.url));
      
      for (const item of feed.items || []) {
        try {
          if (!item.title || !item.link) continue;

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: item.description ? this.sanitizeText(item.description).substring(0, 200) : undefined,
            content: item['content:encoded'] || item.description || undefined,
            publishedAt: item.pubDate ? parseRSSDate(item.pubDate) : 
                        item['dc:date'] ? new Date(item['dc:date']) : new Date(),
            sourceId: this.source.id,
            tagNames: item.categories || [],
          };

          // コンテンツからサムネイルを抽出
          if (article.content) {
            const thumbnail = this.extractThumbnail(article.content);
            if (thumbnail) {
              article.thumbnail = thumbnail;
            }
          }

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } catch (error) {
      errors.push(new Error(`Failed to fetch RSS feed: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }
}