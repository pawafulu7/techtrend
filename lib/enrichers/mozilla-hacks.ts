import { BaseContentEnricher } from './base';
import * as cheerio from 'cheerio';

export class MozillaHacksEnricher extends BaseContentEnricher {
  /**
   * Mozilla Hacksの記事URLかどうかを判定
   */
  canHandle(url: string): boolean {
    return url.includes('hacks.mozilla.org');
  }

  /**
   * Mozilla Hacksの記事を詳細に取得してエンリッチ
   */
  async enrich(url: string): Promise<{ content?: string; thumbnail?: string } | null> {
    try {
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TechTrend/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        console.error(`[Mozilla Hacks Enricher] Failed to fetch: ${response.status}`);
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // コンテンツの抽出（Mozilla Hacksの構造に基づく）
      let content = '';
      
      // メインコンテンツエリアを探す（複数のセレクタを試す）
      const contentSelectors = [
        '.entry-content',
        'article .content',
        '.post-content',
        'main article',
        '[itemprop="articleBody"]',
        '.article-content',
        '#content article',
      ];
      
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          // 不要な要素を削除
          element.find('script, style, noscript, iframe').remove();
          element.find('.social-share, .related-posts, .comments').remove();
          element.find('.post-meta, .author-info, .newsletter').remove();
          element.find('aside, nav').remove();
          
          content = element.text().trim();
          if (content.length > 500) { // 十分なコンテンツがあれば採用
            break;
          }
        }
      }
      
      // コンテンツが見つからない場合、段落を集める
      if (content.length < 500) {
        const paragraphs: string[] = [];
        $('article p, main p, .entry p').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text.length > 50) { // 短すぎる段落は除外
            paragraphs.push(text);
          }
        });
        
        if (paragraphs.length > 0) {
          content = paragraphs.join('\n\n');
        }
      }
      
      // コードブロックも重要なので追加
      const codeBlocks: string[] = [];
      $('pre code, .highlight code').each((_, elem) => {
        const code = $(elem).text().trim();
        if (code.length > 20) {
          codeBlocks.push(`[Code]\n${code}\n[/Code]`);
        }
      });
      
      if (codeBlocks.length > 0 && content.length < 5000) {
        content += '\n\n' + codeBlocks.join('\n\n');
      }
      
      // サムネイル画像の取得
      let thumbnail: string | undefined;
      
      // OGP画像を優先
      const ogImage = $('meta[property="og:image"]').attr('content') ||
                     $('meta[name="twitter:image"]').attr('content');
      
      if (ogImage) {
        thumbnail = this.normalizeImageUrl(ogImage, url);
      } else {
        // 記事内の最初の大きな画像を探す
        const articleImages = $('article img, .entry-content img, main img');
        articleImages.each((_, elem) => {
          const src = $(elem).attr('src') || $(elem).attr('data-src');
          const alt = $(elem).attr('alt') || '';
          
          // アバター、著者画像、ロゴを除外
          if (src && !src.includes('avatar') && !src.includes('author') && 
              !src.includes('logo') && !alt.toLowerCase().includes('avatar')) {
            thumbnail = this.normalizeImageUrl(src, url);
            return false; // break
          }
        });
      }
      
      // 結果の検証
      if (!content || content.length < 200) {
        return null;
      }
      
      
      return {
        content,
        thumbnail,
      };
      
    } catch (_error) {
      console.error(`[Mozilla Hacks Enricher] Error enriching ${url}:`, error);
      return null;
    }
  }
  
  /**
   * 画像URLを正規化
   */
  private normalizeImageUrl(imageUrl: string, baseUrl: string): string {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl;
    }
    
    if (imageUrl.startsWith('//')) {
      return 'https:' + imageUrl;
    }
    
    if (imageUrl.startsWith('/')) {
      const url = new URL(baseUrl);
      return `${url.protocol}//${url.host}${imageUrl}`;
    }
    
    // 相対パス
    const url = new URL(baseUrl);
    const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
    return `${url.protocol}//${url.host}${basePath}/${imageUrl}`;
  }
}