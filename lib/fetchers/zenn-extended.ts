import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';
import type { ContentEnricherFactory } from '../enrichers';

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

export class ZennExtendedFetcher extends BaseFetcher {
  private parser: Parser<unknown, ZennRSSItem>;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser();
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];
    const seenUrls = new Set<string>();

    // ContentEnricherFactoryのインスタンス作成
    const { ContentEnricherFactory } = await import('../enrichers');
    const enricherFactory = new ContentEnricherFactory();

    // 複数のトピックから取得
    const topics = [
      'javascript',
      'typescript', 
      'react',
      'nextjs',
      'python',
      'go',
      'rust',
      'aws',
      'docker',
      'kubernetes'
    ];

    // まずメインフィードから取得
    try {
      const mainFeed = await this.retry(() => this.parser.parseURL(this.source.url));
      for (const item of mainFeed.items || []) {
        if (item.title && item.link && !seenUrls.has(item.link)) {
          seenUrls.add(item.link);
          const article = await this.createArticleWithEnrichment(item, enricherFactory);
          articles.push(article);
        }
      }
    } catch (error) {
      errors.push(new Error(`メインフィード取得エラー: ${error instanceof Error ? error.message : String(error)}`));
    }

    // 各トピックから追加取得
    for (const topic of topics) {
      if (articles.length >= 30) break; // 30件に達したら終了
      
      try {
        const topicUrl = `https://zenn.dev/topics/${topic}/feed?order=daily`;
        const feed = await this.retry(() => this.parser.parseURL(topicUrl));
        
        for (const item of (feed.items || []).slice(0, 5)) { // 各トピックから最大5件
          if (item.title && item.link && !seenUrls.has(item.link)) {
            seenUrls.add(item.link);
            const article = await this.createArticleWithEnrichment(item, enricherFactory);
            articles.push(article);
            
            if (articles.length >= 30) break;
          }
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        // 個別トピックのエラーは警告レベル
      }
    }

    return { articles: articles.slice(0, 30), errors };
  }

  private async createArticleWithEnrichment(
    item: ZennRSSItem, 
    enricherFactory: ContentEnricherFactory
  ): Promise<CreateArticleInput> {
    // 基本的な記事データを作成
    const article = this.createArticle(item);
    
    // エンリッチメント処理
    if (item.link && enricherFactory) {
      const enricher = enricherFactory.getEnricher(item.link);
      if (enricher) {
        try {
          const currentContent = article.content || '';
          const enrichedData = await enricher.enrich(item.link);
          
          if (enrichedData && enrichedData.content) {
            // より長いコンテンツが取得できた場合に更新
            if (enrichedData.content.length > currentContent.length) {
              article.content = enrichedData.content;
              
              // サムネイルも取得できていれば更新
              if (enrichedData.thumbnail) {
                article.thumbnail = enrichedData.thumbnail;
              }
            }
          }
        } catch (error) {
          // エンリッチメント失敗時は元のコンテンツを使用
        }
      }
    }
    
    return article;
  }

  private createArticle(item: ZennRSSItem): CreateArticleInput {
    const hasJapanese = item.title ? /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(item.title) : false;
    
    const article: CreateArticleInput = {
      title: this.sanitizeText(item.title || ''),
      url: this.normalizeUrl(item.link || ''),
      summary: undefined, // 要約は後で日本語で生成
      content: item.content || item.contentSnippet || undefined,
      publishedAt: item.isoDate ? new Date(item.isoDate) : (item.pubDate ? parseRSSDate(item.pubDate) : new Date()),
      sourceId: this.source.id,
      tagNames: this.extractTagsFromUrl(item.link),
    };

    // Use enclosure URL as thumbnail if available
    if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
      article.thumbnail = item.enclosure.url;
    }

    return article;
  }

  private extractTagsFromUrl(url?: string): string[] {
    if (!url) return [];
    
    const tags: string[] = [];
    
    // Zenn URLs often contain article type information
    // Note: 'article' tag is not added as it's redundant (all items are articles)
    if (url.includes('/books/')) {
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