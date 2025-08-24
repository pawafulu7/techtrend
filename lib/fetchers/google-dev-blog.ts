import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';

interface GoogleDevBlogItem {
  title?: string;
  link?: string;
  pubDate?: string;
  'dc:creator'?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
}

export class GoogleDevBlogFetcher extends BaseFetcher {
  private parser: Parser<unknown, GoogleDevBlogItem>;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: ['dc:creator']
      }
    });
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    // 30日前の日付を計算
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      console.error('[Google Dev Blog] フィードを取得中...');
      const feed = await this.retry(() => this.parser.parseURL(this.source.url));
      
      if (!feed.items || feed.items.length === 0) {
        console.error('[Google Dev Blog] 記事が見つかりませんでした');
        return { articles, errors };
      }

      console.error(`[Google Dev Blog] ${feed.items.length}件の記事を取得`);

      // 最新30件に制限
      const limitedItems = feed.items.slice(0, 30);

      for (const item of limitedItems) {
        try {
          if (!item.title || !item.link) continue;

          // 技術記事のフィルタリング（Google I/Oやプロダクトアップデートなど）
          const techKeywords = [
            'android', 'chrome', 'firebase', 'flutter', 'tensorflow',
            'cloud', 'ai', 'ml', 'api', 'developer', 'web', 'mobile',
            'platform', 'framework', 'release', 'update', 'beta',
            'machine learning', 'artificial intelligence'
          ];

          const titleLower = item.title.toLowerCase();
          const contentLower = (item.content || item.contentSnippet || '').toLowerCase();
          
          const isTechArticle = techKeywords.some(keyword => 
            titleLower.includes(keyword) || contentLower.includes(keyword)
          );

          if (!isTechArticle) {
            console.error(`[Google Dev Blog] 技術記事ではないためスキップ: ${item.title}`);
            continue;
          }

          const publishedAt = item.pubDate ? parseRSSDate(item.pubDate) : new Date();
          
          // 30日以内の記事のみ処理
          if (publishedAt < thirtyDaysAgo) {
            continue;
          }

          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で日本語で生成
            content: item.content || item.contentSnippet || '',
            publishedAt,
            sourceId: this.source.id,
            tagNames: item.categories || [],
          };

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      console.error(`[Google Dev Blog] ${articles.length}件の技術記事を抽出`);

    } catch (error) {
      errors.push(new Error(`Failed to fetch Google Dev Blog: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }
}