import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';

interface InfoQJapanRSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  'content:encoded'?: string;
  categories?: string[];
  author?: string;
  guid?: string;
}

export class InfoQJapanFetcher extends BaseFetcher {
  private parser: Parser<unknown, InfoQJapanRSSItem>;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['dc:creator', 'creator'],
          ['dc:date', 'dcDate'],
        ],
      },
      headers: {
        'Accept': 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
            tagNames: this.generateInfoQTags(item.categories),
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

  private generateInfoQTags(categories?: string[]): string[] {
    const baseTags = ['エンタープライズ', 'アーキテクチャ', 'DevOps', 'InfoQ'];
    if (categories && categories.length > 0) {
      // カテゴリが日本語の場合はそのまま使用
      return [...baseTags, ...categories];
    }
    return baseTags;
  }
}