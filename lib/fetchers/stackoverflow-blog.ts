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
    console.error('[Stack Overflow Blog] 記事を取得します...');
    
    try {
      const feed = await this.parser.parseURL(this.rssUrl);
      
      if (!feed.items || feed.items.length === 0) {
        console.error('[Stack Overflow Blog] 記事が見つかりませんでした');
        return [];
      }
      
      console.error(`[Stack Overflow Blog] ${feed.items.length}件の記事を取得しました`);
      
      const articles: CreateArticleInput[] = [];
      
      for (const item of feed.items) {
        if (!item.title || !item.link) continue;
        
        const article = this.parseItem(item);
        if (article) {
          articles.push(article);
        }
      }
      
      return {
        articles,
        errors: []
      };
      
    } catch (error) {
      console.error('[Stack Overflow Blog] フィード取得エラー:', error);
      return {
        articles: [],
        errors: [error as Error]
      };
    }
  }
  
  private parseItem(item: StackOverflowBlogItem): CreateArticleInput | null {
    if (!item.title || !item.link) return null;
    
    // コンテンツの取得（HTMLタグを含む場合がある）
    const content = item.content || item.contentSnippet || '';
    
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
    
    return {
      title: item.title,
      url: item.link,
      content,
      summary,
      publishedAt,
      sourceId: this.source.id,
      tagNames: tags
    };
  }
}