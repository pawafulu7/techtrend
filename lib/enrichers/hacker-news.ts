import { BaseContentEnricher, EnrichmentResult } from './base';
import * as cheerio from 'cheerio';
import { GenericContentEnricher } from './generic';

export class HackerNewsEnricher extends BaseContentEnricher {
  private genericEnricher: GenericContentEnricher;
  
  constructor() {
    super();
    this.genericEnricher = new GenericContentEnricher();
  }
  
  canHandle(url: string): boolean {
    // Hacker Newsが参照する様々なサイトをエンリッチメント
    // 主要な技術系サイトのみ対象
    const supportedDomains = [
      'github.com',
      'github.io', 
      'arxiv.org',
      'acm.org',
      'ieee.org',
      'stanford.edu',
      'mit.edu',
      'berkeley.edu',
      'microsoft.com',
      'google.com',
      'amazon.com',
      'facebook.com',
      'apple.com'
    ];
    
    // URLからドメインを抽出して比較
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      return supportedDomains.some(domain => 
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }
  
  async enrich(url: string): Promise<EnrichmentResult | null> {
    try {
      // 30秒タイムアウトを設定
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TechTrendBot/1.0; +https://techtrend.example.com/bot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8'
        },
        signal: AbortSignal.timeout(30000) // 30秒タイムアウト
      });
      
      // ステータスコードが200以外の場合はGenericEnricherにフォールバック
      if (!response.ok) {
        console.warn(`[HackerNewsEnricher] HTTP ${response.status} for ${url}, falling back to GenericEnricher`);
        return await this.genericEnricher.enrich(url);
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove script, style, iframe elements
      $('script, style, noscript, iframe').remove();
      
      let content = '';
      let thumbnail = '';
      
      // GitHub specific extraction
      if (url.includes('github.com')) {
        // README content
        const readme = $('.markdown-body, .readme, article[itemprop="text"]').first();
        if (readme.length) {
          content = readme.text().trim();
        }
        
        // Repository description
        const description = $('meta[name="description"]').attr('content');
        if (description && !content) {
          content = description;
        }
        
        // Open Graph image
        thumbnail = $('meta[property="og:image"]').attr('content') || '';
      }
      
      // arXiv specific extraction
      else if (url.includes('arxiv.org')) {
        // Abstract
        const abstract = $('.abstract, blockquote.abstract').first();
        if (abstract.length) {
          content = abstract.text().trim();
        }
        
        // Paper metadata
        const title = $('h1.title').text().trim();
        const authors = $('.authors').text().trim();
        if (title && authors) {
          content = `${title}\n\nAuthors: ${authors}\n\n${content}`;
        }
      }
      
      // Generic extraction for other sites
      else {
        // Try common article selectors
        const articleSelectors = [
          'article',
          'main',
          '[role="main"]',
          '.post-content',
          '.entry-content',
          '.content',
          '#content'
        ];
        
        for (const selector of articleSelectors) {
          const element = $(selector).first();
          if (element.length && element.text().trim().length > 500) {
            content = element.text().trim();
            break;
          }
        }
        
        // Fallback to body text
        if (!content) {
          content = $('body').text().trim();
        }
        
        // Try to get thumbnail from Open Graph
        thumbnail = $('meta[property="og:image"]').attr('content') || 
                   $('meta[name="twitter:image"]').attr('content') || '';
      }
      
      // Clean up content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      // Limit content length
      if (content.length > 50000) {
        content = content.substring(0, 50000) + '...';
      }
      
      // コンテンツが短すぎる場合（100文字未満）はGenericEnricherにフォールバック
      if (content.length < 100) {
        console.warn(`[HackerNewsEnricher] Content too short for ${url}: ${content.length} chars, falling back to GenericEnricher`);
        return await this.genericEnricher.enrich(url);
      }
      
      return {
        content,
        thumbnail: thumbnail || undefined
      };
      
    } catch (error) {
      console.error(`[HackerNewsEnricher] Error enriching ${url}:`, error);
      
      // フォールバック: GenericEnricherを試す
      try {
        console.log(`[HackerNewsEnricher] Attempting GenericEnricher fallback for ${url}`);
        const genericResult = await this.genericEnricher.enrich(url);
        if (genericResult) {
          console.log(`[HackerNewsEnricher] GenericEnricher succeeded for ${url}`);
          return genericResult;
        }
      } catch (fallbackError) {
        console.error(`[HackerNewsEnricher] GenericEnricher also failed for ${url}:`, fallbackError);
      }
      
      return null;
    }
  }
}
