import { BaseFetcher } from './base';
import { CreateArticleInput, FetchResult } from '@/types';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { parseRSSDate } from '@/lib/utils/date';
import { extractContent, checkContentQuality } from '@/lib/utils/content-extractor';
import { ContentEnricherFactory } from '@/lib/enrichers';
import { normalizeTagInput } from '@/lib/utils/tag-normalizer';

interface MozillaHacksItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  categories?: string[];
  content?: string;
  contentSnippet?: string;
  guid?: string;
  creator?: string;
}

export class MozillaHacksFetcher extends BaseFetcher {
  private parser: Parser<any, MozillaHacksItem>;
  private rssUrl = 'https://hacks.mozilla.org/feed/';
  
  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['dc:creator', 'creator'],
        ],
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    // 30日前の日付を計算
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // 現在日時を取得（未来日付フィルタ用）
    const now = new Date();

    try {
      const feed = await this.retry(() => this.parser.parseURL(this.rssUrl));
      
      if (!feed.items || feed.items.length === 0) {
        return { articles, errors };
      }

      // ContentEnricherFactoryのインスタンス作成
      const enricherFactory = new ContentEnricherFactory();

      for (const item of feed.items) {
        try {
          if (!item.title || !item.link) continue;

          const publishedAt = item.isoDate ? new Date(item.isoDate) :
                            item.pubDate ? parseRSSDate(item.pubDate) : new Date();
          
          // 30日以内かつ未来でない記事のみ処理
          if (publishedAt < thirtyDaysAgo || publishedAt > now) {
            continue;
          }

          // コンテンツの取得
          let content = extractContent(item);
          let thumbnail: string | undefined;
          
          // コンテンツエンリッチメント（2000文字未満の場合のみ実行）
          if (content && content.length < 2000) {
            const enricher = enricherFactory.getEnricher(item.link);
            if (enricher) {
              try {
                const enrichedData = await enricher.enrich(item.link);
                if (enrichedData && enrichedData.content && enrichedData.content.length > content.length) {
                  content = enrichedData.content;
                  thumbnail = enrichedData.thumbnail || undefined;
                } else {
                }
              } catch (_error) {
                console.error(`[Mozilla Hacks] Enrichment failed for ${item.link}:`, error);
                // エラー時は元のコンテンツを使用
              }
            }
          } else if (content && content.length >= 2000) {
          }
          
          // コンテンツ品質チェック
          const contentCheck = checkContentQuality(content, item.title);
          if (contentCheck.warning) {
          }
          
          // タグの生成
          const tags = this.generateMozillaTags(item.categories, item.title);
          
          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で日本語で生成
            content: content || undefined,
            publishedAt,
            sourceId: this.source.id,
            tagNames: tags,
          };

          // サムネイルがある場合は追加
          if (thumbnail) {
            article.thumbnail = thumbnail;
          } else if (article.content) {
            // コンテンツからサムネイルを抽出
            const extractedThumbnail = this.extractThumbnail(article.content);
            if (extractedThumbnail) {
              article.thumbnail = extractedThumbnail;
            }
          }

          articles.push(article);
        } catch (_error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (_error) {
      errors.push(new Error(`Failed to fetch Mozilla Hacks RSS feed: ${error instanceof Error ? error.message : String(error)}`));
    }

    // 日付順にソートして最新20件を返す
    articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const limitedArticles = articles.slice(0, 20);

    return { articles: limitedArticles, errors };
  }

  private generateMozillaTags(categories?: string[], title?: string): string[] {
    const tags = new Set<string>();
    
    // 必須タグ
    tags.add('Mozilla');
    tags.add('Web Standards');
    
    // タイトルベースのタグ
    if (title) {
      const lowerTitle = title.toLowerCase();
      
      if (lowerTitle.includes('firefox')) {
        tags.add('Firefox');
        tags.add('ブラウザ');
      }
      if (lowerTitle.includes('webassembly') || lowerTitle.includes('wasm')) {
        tags.add('WebAssembly');
        tags.add('WASM');
      }
      if (lowerTitle.includes('javascript') || lowerTitle.includes('js')) {
        tags.add('JavaScript');
      }
      if (lowerTitle.includes('css')) {
        tags.add('CSS');
      }
      if (lowerTitle.includes('html')) {
        tags.add('HTML');
      }
      if (lowerTitle.includes('web api') || lowerTitle.includes('webapi')) {
        tags.add('Web API');
      }
      if (lowerTitle.includes('devtools') || lowerTitle.includes('developer tools')) {
        tags.add('Developer Tools');
        tags.add('開発者ツール');
      }
      if (lowerTitle.includes('performance')) {
        tags.add('Performance');
        tags.add('パフォーマンス');
      }
      if (lowerTitle.includes('security')) {
        tags.add('Security');
        tags.add('セキュリティ');
      }
      if (lowerTitle.includes('privacy')) {
        tags.add('Privacy');
        tags.add('プライバシー');
      }
      if (lowerTitle.includes('rust')) {
        tags.add('Rust');
      }
      if (lowerTitle.includes('servo')) {
        tags.add('Servo');
      }
      if (lowerTitle.includes('pwa') || lowerTitle.includes('progressive web')) {
        tags.add('PWA');
        tags.add('Progressive Web Apps');
      }
    }
    
    // カテゴリベースのタグ
    if (categories && categories.length > 0) {
      for (const category of categories) {
        const normalizedCategory = category.toLowerCase().trim();
        
        // カテゴリマッピング
        if (normalizedCategory.includes('javascript')) {
          tags.add('JavaScript');
        }
        if (normalizedCategory.includes('css')) {
          tags.add('CSS');
        }
        if (normalizedCategory.includes('webassembly')) {
          tags.add('WebAssembly');
        }
        if (normalizedCategory.includes('api')) {
          tags.add('Web API');
        }
        if (normalizedCategory.includes('performance')) {
          tags.add('Performance');
        }
        if (normalizedCategory.includes('security')) {
          tags.add('Security');
        }
        if (normalizedCategory.includes('firefox')) {
          tags.add('Firefox');
        }
        if (normalizedCategory.includes('standards')) {
          tags.add('Web Standards');
        }
        
        // オリジナルカテゴリも追加（正規化）
        const normalizedTags = normalizeTagInput(category);
        normalizedTags.forEach(tag => tags.add(tag));
      }
    }
    
    // 基本的な技術タグ
    tags.add('Web Development');
    tags.add('Frontend');
    
    return Array.from(tags);
  }
}