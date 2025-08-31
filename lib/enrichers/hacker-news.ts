import { BaseContentEnricher, EnrichmentResult } from './base';
import * as cheerio from 'cheerio';

export class HackerNewsEnricher extends BaseContentEnricher {
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
    
    return supportedDomains.some(domain => url.includes(domain));
  }
  
  async enrich(url: string): Promise<EnrichmentResult | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TechTrendBot/1.0; +https://techtrend.example.com/bot)'
        }
      });
      
      if (!response.ok) {
        return null;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script, style, noscript').remove();
      
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
      
      if (content.length < 100) {
        return null;
      }
      
      return {
        content,
        thumbnail: thumbnail || undefined
      };
      
    } catch (_error) {
      return null;
    }
  }
}
