import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface ZennRSSItem {
  title?: string;
  link?: string;
  creator?: string;
  pubDate?: string;
  enclosure?: {
    url?: string;
    type?: string;
  };
  content?: string;
  contentSnippet?: string;
  guid?: string;
  isoDate?: string;
}

export class ZennFetcher extends BaseFetcher {
  private parser: Parser<any, ZennRSSItem>;

  constructor(source: any) {
    super(source);
    this.parser = new Parser();
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
            summary: item.contentSnippet ? this.sanitizeText(item.contentSnippet).substring(0, 200) : undefined,
            content: item.content || item.contentSnippet || undefined,
            publishedAt: item.isoDate ? new Date(item.isoDate) : (item.pubDate ? parseRSSDate(item.pubDate) : new Date()),
            sourceId: this.source.id,
            tagNames: this.extractTagsFromUrl(item.link),
          };

          // Use enclosure URL as thumbnail if available
          if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
            article.thumbnail = item.enclosure.url;
          }

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse Zenn item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } catch (error) {
      errors.push(new Error(`Failed to fetch Zenn RSS feed: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }

  private extractTagsFromUrl(url?: string): string[] {
    if (!url) return [];
    
    const tags: string[] = [];
    
    // Zenn URLs often contain article type information
    if (url.includes('/articles/')) {
      tags.push('article');
    } else if (url.includes('/books/')) {
      tags.push('book');
    } else if (url.includes('/scraps/')) {
      tags.push('scrap');
    }

    // Try to extract topic from URL slug
    const match = url.match(/\/(?:articles|books|scraps)\/([a-z0-9-]+)/);
    if (match && match[1]) {
      // Extract potential topics from slug
      const slug = match[1];
      
      // Common tech keywords
      const techKeywords = ['react', 'vue', 'next', 'node', 'typescript', 'javascript', 'python', 'go', 'rust', 'docker', 'aws', 'gcp', 'azure'];
      
      for (const keyword of techKeywords) {
        if (slug.includes(keyword)) {
          tags.push(keyword);
        }
      }
    }

    return tags;
  }
}