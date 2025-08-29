import Parser from 'rss-parser';
import { BaseFetcher } from './base';
import { FetchResult } from '../types';

/**
 * 企業ブログ用の汎用RSSフェッチャー
 * 各企業のRSSフィードから記事を取得する
 */
export class GenericCorporateRssFetcher extends BaseFetcher {
  private parser: Parser;
  private sourceId: string;
  private feedUrl: string;
  private sourceName: string;

  constructor(sourceId: string, feedUrl: string, sourceName: string) {
    super();
    this.parser = new Parser({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TechTrend/1.0)'
      }
    });
    this.sourceId = sourceId;
    this.feedUrl = feedUrl;
    this.sourceName = sourceName;
  }

  async fetch(): Promise<FetchResult[]> {
    try {
      console.log(`📡 ${this.sourceName}のRSSフィードを取得中...`);
      
      const feed = await this.parser.parseURL(this.feedUrl);
      const results: FetchResult[] = [];
      
      // 最新30件まで処理
      const items = feed.items?.slice(0, 30) || [];
      
      for (const item of items) {
        if (!item.link || !item.title) continue;
        
        try {
          const result: FetchResult = {
            title: this.cleanText(item.title),
            url: item.link,
            content: this.extractContent(item),
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            sourceId: this.sourceId,
            summary: undefined, // 要約は後で生成
            tags: this.extractTags(item),
            thumbnail: this.extractThumbnail(item)
          };
          
          results.push(result);
        } catch (error) {
          console.error(`❌ 記事の処理中にエラー: ${item.title}`, error);
        }
      }
      
      console.log(`✅ ${this.sourceName}: ${results.length}件の記事を取得`);
      return results;
    } catch (error) {
      console.error(`❌ ${this.sourceName}のフィード取得エラー:`, error);
      return [];
    }
  }

  /**
   * RSS項目からコンテンツを抽出
   */
  private extractContent(item: any): string {
    // 優先順位: content:encoded > content > description > summary
    const content = 
      item['content:encoded'] || 
      item.content || 
      item.contentSnippet ||
      item.description || 
      item.summary || 
      '';
    
    return this.cleanHtml(content);
  }

  /**
   * RSS項目からタグを抽出
   */
  private extractTags(item: any): string[] {
    const tags: string[] = [];
    
    // カテゴリーからタグを抽出
    if (item.categories) {
      if (Array.isArray(item.categories)) {
        tags.push(...item.categories.map((cat: any) => 
          typeof cat === 'string' ? cat : cat._ || cat.term || ''
        ).filter(Boolean));
      } else if (typeof item.categories === 'string') {
        tags.push(item.categories);
      }
    }
    
    // dc:subjectからもタグを抽出
    if (item['dc:subject']) {
      if (Array.isArray(item['dc:subject'])) {
        tags.push(...item['dc:subject']);
      } else {
        tags.push(item['dc:subject']);
      }
    }
    
    return [...new Set(tags.filter(tag => tag && tag.length > 0))];
  }

  /**
   * RSS項目からサムネイルを抽出
   */
  private extractThumbnail(item: any): string | undefined {
    // media:thumbnail
    if (item['media:thumbnail']) {
      const thumbnail = item['media:thumbnail'];
      if (thumbnail.$ && thumbnail.$.url) {
        return thumbnail.$.url;
      } else if (typeof thumbnail === 'string') {
        return thumbnail;
      }
    }
    
    // enclosure（画像の場合）
    if (item.enclosure && item.enclosure.type?.startsWith('image/')) {
      return item.enclosure.url;
    }
    
    // コンテンツから最初の画像を抽出
    const content = item['content:encoded'] || item.content || item.description || '';
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch) {
      return imgMatch[1];
    }
    
    return undefined;
  }
}

/**
 * 企業ブログフェッチャーのファクトリー関数
 */
export function createCorporateFetcher(sourceId: string): GenericCorporateRssFetcher | null {
  const corporateFeeds: Record<string, { url: string; name: string }> = {
    'freee_tech_blog': {
      url: 'https://developers.freee.co.jp/rss',
      name: 'freee Developers Hub'
    },
    'cyberagent_tech_blog': {
      url: 'https://developers.cyberagent.co.jp/blog/feed/',
      name: 'CyberAgent Developers Blog'
    },
    'dena_tech_blog': {
      url: 'https://engineering.dena.com/blog/index.xml',
      name: 'DeNA Engineering'
    },
    'smarthr_tech_blog': {
      url: 'https://tech.smarthr.jp/feed',
      name: 'SmartHR Tech Blog'
    },
    'lycorp_tech_blog': {
      url: 'https://techblog.lycorp.co.jp/ja/feed/index.xml',
      name: 'LY Corporation Tech Blog'
    },
    'gmo_tech_blog': {
      url: 'https://developers.gmo.jp/feed/',
      name: 'GMO Developers'
    },
    'sansan_tech_blog': {
      url: 'https://buildersbox.corp-sansan.com/rss',
      name: 'Sansan Builders Box'
    },
    'mercari_tech_blog': {
      url: 'https://engineering.mercari.com/blog/feed.xml',
      name: 'Mercari Engineering'
    },
    'zozo_tech_blog': {
      url: 'https://techblog.zozo.com/rss',
      name: 'ZOZO TECH BLOG'
    },
    'moneyforward_tech_blog': {
      url: 'https://moneyforward-dev.jp/rss',
      name: 'Money Forward Developers Blog'
    },
    'hatena_tech_blog': {
      url: 'https://developer.hatenastaff.com/rss',
      name: 'Hatena Developer Blog'
    },
    'pepabo_tech_blog': {
      url: 'https://tech.pepabo.com/feed/',
      name: 'ペパボテックブログ'
    },
    'cookpad_tech_blog': {
      url: 'https://techlife.cookpad.com/rss',
      name: 'Cookpad Tech Life'
    }
  };

  const feed = corporateFeeds[sourceId];
  if (!feed) {
    return null;
  }

  return new GenericCorporateRssFetcher(sourceId, feed.url, feed.name);
}