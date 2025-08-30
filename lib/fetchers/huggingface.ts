import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';

interface HuggingFaceRSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  'content:encoded'?: string;
  categories?: string[];
  creator?: string;
  guid?: string;
}

export class HuggingFaceFetcher extends BaseFetcher {
  private parser: Parser<unknown, HuggingFaceRSSItem>;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['dc:creator', 'creator'],
        ],
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    // 30日前の日付を計算
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const feed = await this.retry(() => this.parser.parseURL(this.source.url));
      
      for (const item of feed.items || []) {
        try {
          if (!item.title || !item.link) continue;

          const publishedAt = item.pubDate ? parseRSSDate(item.pubDate) : new Date();
          
          // 30日以内の記事のみ処理
          if (publishedAt < thirtyDaysAgo) {
            continue;
          }

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で日本語で生成
            content: item['content:encoded'] || item.description || undefined,
            publishedAt,
            sourceId: this.source.id,
            tagNames: this.generateAITags(item.categories),
          };

          // コンテンツからサムネイルを抽出
          if (article.content) {
            const thumbnail = this.extractThumbnail(article.content);
            if (thumbnail) {
              article.thumbnail = thumbnail;
            }
          }

          articles.push(article);
        } catch (_error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } catch (_error) {
      errors.push(new Error(`Failed to fetch RSS feed: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }

  private generateAITags(categories?: string[]): string[] {
    const baseTags = ['AI', 'Machine Learning', 'Hugging Face'];
    if (categories && categories.length > 0) {
      return [...baseTags, ...categories];
    }
    return baseTags;
  }
}