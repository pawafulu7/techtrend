import { Source } from '@prisma/client';
import { BaseFetcher } from './base';
import { CreateArticleInput } from '@/types/article';
import Parser from 'rss-parser';

interface StackOverflowBlogItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  categories?: string[];
  guid?: string;
  isoDate?: string;
}

export class StackOverflowBlogFetcher extends BaseFetcher {
  name = 'stackoverflow-blog';
  displayName = 'Stack Overflow Blog';
  
  private parser = new Parser<unknown, StackOverflowBlogItem>();
  private rssUrl = 'https://stackoverflow.blog/feed/';

  async fetch(): Promise<{ articles: CreateArticleInput[]; errors: Error[] }> {
    
    try {
      const feed = await this.parser.parseURL(this.rssUrl);
      
      if (!feed.items || feed.items.length === 0) {
        return {
          articles: [],
          errors: []
        };
      }
      
      // ContentEnricherFactory を動的インポート
      const { ContentEnricherFactory } = await import('../enrichers');
      const enricherFactory = new ContentEnricherFactory();
      
      const articles: CreateArticleInput[] = [];
      
      for (const item of feed.items) {
        if (!item.title || !item.link) continue;
        
        const article = await this.parseItem(item, enricherFactory);
        if (article) {
          articles.push(article);
        }
      }
      
      return {
        articles,
        errors: []
      };
      
    } catch (error) {
      return {
        articles: [],
        errors: [error as Error]
      };
    }
  }
  
  private async parseItem(item: StackOverflowBlogItem, enricherFactory: any): Promise<CreateArticleInput | null> {
    if (!item.title || !item.link) return null;
    
    // コンテンツの取得（HTMLタグを含む場合がある）
    let content = item.content || item.contentSnippet || '';
    let thumbnail: string | undefined;
    
    // コンテンツエンリッチメント（2000文字未満の場合のみ実行）
    if (content && content.length < 2000) {
      const enricher = enricherFactory.getEnricher(item.link);
      if (enricher) {
        try {
          const enrichedData = await enricher.enrich(item.link);
          if (enrichedData && enrichedData.content && enrichedData.content.length > content.length) {
            console.log(`[StackOverflow Blog] Enriched content for ${item.link}: ${content.length} -> ${enrichedData.content.length} chars`);
            content = enrichedData.content;
            thumbnail = enrichedData.thumbnail || undefined;
          } else {
            console.log(`[StackOverflow Blog] Enrichment did not improve content for ${item.link}`);
          }
        } catch (error) {
          console.error(`[StackOverflow Blog] Enrichment failed for ${item.link}:`, error);
          // エラー時は元のコンテンツを使用
        }
      } else {
        console.log(`[StackOverflow Blog] No enricher available for ${item.link}`);
      }
    } else if (content && content.length >= 2000) {
      console.log(`[StackOverflow Blog] Content already sufficient for ${item.link}: ${content.length} chars`);
    }
    
    // 要約は generate-summaries.ts で日本語生成するため undefined を設定
    const summary = undefined;
    
    // タグの処理
    const tags = item.categories || [];
    
    // 著者名の取得
    const authorName = item.creator || 'Stack Overflow';
    
    // 日付の処理
    const publishedAt = item.isoDate ? new Date(item.isoDate) : 
                       item.pubDate ? new Date(item.pubDate) : 
                       new Date();
    
    const article: CreateArticleInput = {
      title: item.title,
      url: item.link,
      content,
      summary,
      publishedAt,
      sourceId: this.source.id,
      tagNames: tags
    };
    
    // サムネイルがある場合は追加
    if (thumbnail) {
      (article as any).thumbnail = thumbnail;
    }
    
    return article;
  }
}