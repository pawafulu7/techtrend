import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface TechCrunchRSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  description?: string;
  'content:encoded'?: string;
  categories?: string[];
  'media:thumbnail'?: { $?: { url?: string } };
}

export class TechCrunchFetcher extends BaseFetcher {
  private parser: Parser<any, TechCrunchRSSItem>;

  constructor(source: any) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['media:thumbnail', 'mediaThumbnail'],
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

          // 技術系記事のフィルタリング（TechCrunch Japanは様々な記事があるため）
          const techKeywords = ['AI', 'API', 'アプリ', 'ソフトウェア', 'プログラ', '開発', 
                               'スタートアップ', 'テクノロジー', 'イノベーション', 'プラットフォーム',
                               'データ', 'クラウド', 'セキュリティ', 'ロボット', 'ブロックチェーン'];
          
          const titleLower = item.title.toLowerCase();
          const contentLower = (item.description || '').toLowerCase();
          
          const isTech = techKeywords.some(keyword => 
            titleLower.includes(keyword.toLowerCase()) || 
            contentLower.includes(keyword.toLowerCase())
          );

          if (!isTech) continue;

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: item.description ? this.sanitizeText(item.description).substring(0, 200) : undefined,
            content: item['content:encoded'] || item.description || undefined,
            publishedAt: item.pubDate ? parseRSSDate(item.pubDate) : new Date(),
            sourceId: this.source.id,
            tagNames: item.categories || [],
          };

          // サムネイル画像の取得
          if (item['media:thumbnail']?.$?.url) {
            article.thumbnail = item['media:thumbnail'].$.url;
          } else if (article.content) {
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