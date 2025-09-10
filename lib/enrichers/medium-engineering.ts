import { BaseContentEnricher, EnrichmentResult } from './base';
import * as cheerio from 'cheerio';
import logger from '@/lib/logger';

export class MediumEngineeringEnricher extends BaseContentEnricher {
  canHandle(url: string): boolean {
    // Medium系のURLを処理
    return url.includes('medium.com') || 
           url.includes('medium.engineering') ||
           url.includes('netflixtechblog') ||
           url.includes('engineering.atspotify.com') ||
           url.includes('eng.uber.com');
  }
  
  async enrich(url: string): Promise<EnrichmentResult | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TechTrendBot/1.0; +https://techtrend.example.com/bot)'
        }
      });
      
      if (!response.ok) {
        logger.warn({ status: response.status, url }, '[MediumEngineeringEnricher] Failed to fetch URL');
        return null;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script, style, noscript').remove();
      
      let content = '';
      let thumbnail = '';
      
      // Medium specific content extraction
      // 記事本文
      const article = $('article').first();
      if (article.length) {
        // Remove header and footer elements within article
        article.find('header, footer, nav').remove();
        
        // Get paragraphs and headers
        const sections = article.find('h1, h2, h3, h4, p, pre, blockquote, ul, ol');
        
        const contentParts: string[] = [];
        sections.each((i, elem) => {
          const text = $(elem).text().trim();
          if (text && text.length > 0) {
            contentParts.push(text);
          }
        });
        
        content = contentParts.join('\n\n');
      }
      
      // Fallback to section.section-content
      if (!content) {
        const sectionContent = $('.section-content').first();
        if (sectionContent.length) {
          content = sectionContent.text().trim();
        }
      }
      
      // Further fallback to main content
      if (!content) {
        const mainContent = $('main').first();
        if (mainContent.length) {
          mainContent.find('header, footer, nav').remove();
          content = mainContent.text().trim();
        }
      }
      
      // Get thumbnail from meta tags
      thumbnail = $('meta[property="og:image"]').attr('content') || 
                 $('meta[name="twitter:image"]').attr('content') || '';
      
      // Medium specific image extraction
      if (!thumbnail) {
        const firstImage = article.find('img').first();
        if (firstImage.length) {
          thumbnail = firstImage.attr('src') || '';
        }
      }
      
      // Clean up content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      // Remove common Medium footer text
      const footerPhrases = [
        'Follow us on Twitter',
        'Sign up for our newsletter',
        'If you enjoyed this article',
        'Thanks for reading',
        'Subscribe to get',
        'Join our team'
      ];
      
      for (const phrase of footerPhrases) {
        const index = content.lastIndexOf(phrase);
        if (index > content.length * 0.7) { // Only remove if in last 30% of content
          content = content.substring(0, index).trim();
        }
      }
      
      // Limit content length
      if (content.length > 50000) {
        content = content.substring(0, 50000) + '...';
      }
      
      if (content.length < 100) {
        logger.warn({ url, contentLength: content.length }, '[MediumEngineeringEnricher] Content too short');
        return null;
      }
      
      return {
        content,
        thumbnail: thumbnail || undefined
      };
      
    } catch (_error) {
      logger.error({ err: _error, url }, '[MediumEngineeringEnricher] Error enriching URL');
      return null;
    }
  }
}
