import { BaseFetcher } from './base';
import { CreateArticleInput } from '@/types/article';
import Parser from 'rss-parser';

interface ThinkITItem {
  title?: string;
  link?: string;
  pubDate?: string;
  author?: string;
  description?: string;
  content?: string;
  contentSnippet?: string;
  categories?: string[];
  guid?: string;
  isoDate?: string;
  'dc:creator'?: string;
}

export class ThinkITFetcher extends BaseFetcher {
  name = 'thinkit';
  displayName = 'Think IT';
  
  private parser = new Parser<any, ThinkITItem>();
  private rssUrl = 'https://thinkit.co.jp/rss.xml';

  async fetch(): Promise<{ articles: CreateArticleInput[]; errors: Error[] }> {
    console.log('[Think IT] 記事を取得します...');
    
    try {
      const feed = await this.parser.parseURL(this.rssUrl);
      
      if (!feed.items || feed.items.length === 0) {
        console.log('[Think IT] 記事が見つかりませんでした');
        return [];
      }
      
      console.log(`[Think IT] ${feed.items.length}件の記事を取得しました`);
      
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
      console.error('[Think IT] フィード取得エラー:', error);
      return {
        articles: [],
        errors: [error as Error]
      };
    }
  }
  
  private parseItem(item: ThinkITItem): CreateArticleInput | null {
    if (!item.title || !item.link) return null;
    
    // コンテンツの取得
    const content = item.content || item.description || '';
    
    // 要約の生成
    let summary = '';
    if (item.description) {
      summary = this.cleanHtml(item.description)
        .substring(0, 200);
    } else if (item.contentSnippet) {
      summary = item.contentSnippet
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
    }
    
    // タグの処理
    const tags = item.categories || [];
    
    // 著者名の取得（dc:creatorフィールドも確認）
    const authorName = item.author || item['dc:creator'] || 'Think IT';
    
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
  
  private cleanHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}