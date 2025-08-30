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
      const feed = await this.retry(() => this.parser.parseURL(this.source.url));
      
      if (!feed.items || feed.items.length === 0) {
        return { articles, errors };
      }

      // ContentEnricherFactoryを動的インポート
      const { ContentEnricherFactory } = await import('../enrichers');
      const enricherFactory = new ContentEnricherFactory();

      // 最新30件に制限
      const limitedItems = feed.items.slice(0, 30);

      for (const item of limitedItems) {
        try {
          // parseItemメソッドに処理を委譲
          const article = await this.parseItem(item, enricherFactory, thirtyDaysAgo);
          if (article) {
            articles.push(article);
          }
        } catch (error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }


    } catch (error) {
      errors.push(new Error(`Failed to fetch Google Dev Blog: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }

  private async parseItem(
    item: GoogleDevBlogItem,
    enricherFactory: any,
    thirtyDaysAgo: Date
  ): Promise<CreateArticleInput | null> {
    if (!item.title || !item.link) return null;

    // 技術記事のフィルタリング
    const techKeywords = [
      'android', 'chrome', 'firebase', 'flutter', 'tensorflow',
      'cloud', 'ai', 'ml', 'api', 'developer', 'web', 'mobile',
      'platform', 'framework', 'release', 'update', 'beta',
      'machine learning', 'artificial intelligence', 'gemini'
    ];

    const titleLower = item.title.toLowerCase();
    const contentLower = (item.content || item.contentSnippet || '').toLowerCase();
    
    const isTechArticle = techKeywords.some(keyword => 
      titleLower.includes(keyword) || contentLower.includes(keyword)
    );

    if (!isTechArticle) {
      return null;
    }

    const publishedAt = item.pubDate ? parseRSSDate(item.pubDate) : new Date();
    
    // 30日以内の記事のみ処理
    if (publishedAt < thirtyDaysAgo) {
      return null;
    }

    // コンテンツの取得
    let content = item.content || item.contentSnippet || '';
    let thumbnail: string | undefined;

    // コンテンツエンリッチメント（2000文字未満の場合のみ実行）
    if (content && content.length < 2000) {
      const enricher = enricherFactory.getEnricher(item.link);
      if (enricher) {
        try {
          const enrichedData = await enricher.enrich(item.link);
          if (enrichedData && enrichedData.content && enrichedData.content.length > content.length) {
            content = enrichedData.content;
            thumbnail = enrichedData.thumbnail || undefined;
          } else {
          }
        } catch (error) {
          console.error(`[Google Dev Blog] Enrichment failed for ${item.link}:`, error);
          // エラー時は元のコンテンツを使用
        }
      } else {
      }
    } else if (content && content.length >= 2000) {
    }

    const article: CreateArticleInput = {
      title: this.sanitizeText(item.title),
      url: this.normalizeUrl(item.link),
      summary: undefined, // 要約は後で日本語で生成
      content,
      publishedAt,
      sourceId: this.source.id,
      tagNames: item.categories || [],
      thumbnail, // サムネイル追加
    };

    return article;
  }
}