import { BaseFetcher } from './base';
import { CreateArticleInput } from '@/types';
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
      
      const articles: CreateArticleInput[] = [];
      
      for (const item of feed.items) {
        if (!item.title || !item.link) continue;
        
        const article = await this.parseItem(item);
        if (article) {
          articles.push(article);
        }
      }
      
      return {
        articles,
        errors: []
      };
      
    } catch (_error) {
      return {
        articles: [],
        errors: [_error as Error]
      };
    }
  }
  
  private async parseItem(item: StackOverflowBlogItem): Promise<CreateArticleInput | null> {
    if (!item.title || !item.link) return null;
    
    // コンテンツの取得（HTMLタグを含む場合がある）
    const content = item.content || item.contentSnippet || '';
    const thumbnail = undefined;
    
    // 要約は generate-summaries.ts で日本語生成するため undefined を設定
    const summary = undefined;
    
    // タグの処理
    const tags = item.categories || [];
    
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
      tagNames: tags,
      thumbnail
    };
    
    return article;
  }
}
