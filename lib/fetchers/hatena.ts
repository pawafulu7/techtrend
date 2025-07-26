import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface HatenaRSSItem {
  title?: string;
  link?: string;
  'dc:creator'?: string;
  pubDate?: string;
  description?: string;
  'content:encoded'?: string;
  'dc:date'?: string;
  'hatena:bookmarkcount'?: string;
}

export class HatenaFetcher extends BaseFetcher {
  private parser: Parser<any, HatenaRSSItem>;

  constructor(source: any) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:creator', 'creator'],
          ['dc:date', 'dcDate'],
          ['hatena:bookmarkcount', 'bookmarkCount'],
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
            publishedAt: item.pubDate ? parseRSSDate(item.pubDate) : new Date(),
            sourceId: this.source.id,
            tagNames: this.extractTags(item),
          };

          // Extract thumbnail from content if available
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

  private extractTags(item: HatenaRSSItem): string[] {
    const tags: string[] = [];
    
    // Extract category from description or content
    const content = item.description || item['content:encoded'] || '';
    const categoryMatch = content.match(/\[([^\]]+)\]/g);
    
    if (categoryMatch) {
      categoryMatch.forEach(match => {
        const tag = match.replace(/[\[\]]/g, '').trim();
        if (tag && !tags.includes(tag)) {
          tags.push(tag);
        }
      });
    }

    return tags;
  }
}