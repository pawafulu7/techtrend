import { BaseContentEnricher } from './base';
import * as cheerio from 'cheerio';

export class GitHubBlogEnricher extends BaseContentEnricher {
  /**
   * GitHub Blogの記事URLかどうかを判定
   */
  canHandle(url: string): boolean {
    return url.includes('github.blog') || url.includes('github.com/blog');
  }

  /**
   * GitHub Blogの記事を詳細に取得してエンリッチ
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
        console.error(`[GitHub Blog Enricher] Failed to fetch: ${response.status}`);
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // コンテンツの抽出（GitHub Blogの構造に基づく）
      let content = '';
      
      // メインコンテンツエリアを探す（複数のセレクタを試す）
      const contentSelectors = [
        'article .post-content',
        'article .entry-content',
        'main article',
        '.post-body',
        '.blog-post-content',
        '[itemprop="articleBody"]',
        '.markdown-body',
      ];
      
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          // 不要な要素を削除
          element.find('script, style, noscript, iframe').remove();
          element.find('.social-share, .related-posts, .comments').remove();
          
          content = element.text().trim();
          if (content.length > 500) { // 十分なコンテンツがあれば採用
            break;
          }
        }
      }
      
      // コンテンツが見つからない場合、段落を集める
      if (content.length < 500) {
        const paragraphs: string[] = [];
        $('article p, main p').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text.length > 50) { // 短すぎる段落は除外
            paragraphs.push(text);
          }
        });
        
        if (paragraphs.length > 0) {
          content = paragraphs.join('\n\n');
        }
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
        const firstImage = $('article img, main img').first();
        if (firstImage.length > 0) {
          const src = firstImage.attr('src') || firstImage.attr('data-src');
          if (src) {
            thumbnail = this.normalizeImageUrl(src, url);
          }
        }
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
      console.error(`[GitHub Blog Enricher] Error enriching ${url}:`, error);
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