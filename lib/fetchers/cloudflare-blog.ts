import { BaseFetcher } from './base';
import { CreateArticleInput, FetchResult } from '@/types';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { parseRSSDate } from '@/lib/utils/date';
import { extractContent, checkContentQuality } from '@/lib/utils/content-extractor';
import { ContentEnricherFactory } from '@/lib/enrichers';
import { normalizeTagInput } from '@/lib/utils/tag-normalizer';

interface CloudflareBlogItem {
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

export class CloudflareBlogFetcher extends BaseFetcher {
  private parser: Parser<unknown, CloudflareBlogItem>;
  private rssUrl = 'https://blog.cloudflare.com/rss/';
  
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
          let content = extractContent(item as unknown as Record<string, unknown>);
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
          console.error(`[Cloudflare Blog] Enrichment failed for ${item.link}:`, _error);
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
          const tags = this.generateCloudflareTags(item.categories, item.title);
          
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
          errors.push(new Error(`Failed to parse item: ${_error instanceof Error ? _error.message : String(_error)}`));
        }
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (_error) {
      errors.push(new Error(`Failed to fetch Cloudflare Blog RSS feed: ${_error instanceof Error ? _error.message : String(_error)}`));
    }

    // 日付順にソートして最新30件を返す
    articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const limitedArticles = articles.slice(0, 30);

    return { articles: limitedArticles, errors };
  }

  private generateCloudflareTags(categories?: string[], title?: string): string[] {
    const tags = new Set<string>();
    
    // 必須タグ
    tags.add('Cloudflare');
    
    // タイトルベースのタグ
    if (title) {
      const lowerTitle = title.toLowerCase();
      
      if (lowerTitle.includes('security') || lowerTitle.includes('ddos') || lowerTitle.includes('waf')) {
        tags.add('Security');
        tags.add('セキュリティ');
      }
      if (lowerTitle.includes('performance') || lowerTitle.includes('speed') || lowerTitle.includes('optimization')) {
        tags.add('Performance');
        tags.add('パフォーマンス');
      }
      if (lowerTitle.includes('cdn')) {
        tags.add('CDN');
      }
      if (lowerTitle.includes('workers') || lowerTitle.includes('edge')) {
        tags.add('Edge Computing');
        tags.add('Cloudflare Workers');
      }
      if (lowerTitle.includes('dns')) {
        tags.add('DNS');
      }
      if (lowerTitle.includes('ssl') || lowerTitle.includes('tls') || lowerTitle.includes('certificate')) {
        tags.add('SSL/TLS');
      }
      if (lowerTitle.includes('ai') || lowerTitle.includes('machine learning') || lowerTitle.includes('ml')) {
        tags.add('AI');
      }
    }
    
    // カテゴリベースのタグ
    if (categories && categories.length > 0) {
      for (const category of categories) {
        const normalizedCategory = category.toLowerCase().trim();
        
        // カテゴリマッピング
        if (normalizedCategory.includes('security')) {
          tags.add('Security');
          tags.add('セキュリティ');
        }
        if (normalizedCategory.includes('performance')) {
          tags.add('Performance');
          tags.add('パフォーマンス');
        }
        if (normalizedCategory.includes('network')) {
          tags.add('Network');
          tags.add('ネットワーク');
        }
        if (normalizedCategory.includes('infrastructure')) {
          tags.add('Infrastructure');
          tags.add('インフラ');
        }
        if (normalizedCategory.includes('serverless')) {
          tags.add('Serverless');
        }
        if (normalizedCategory.includes('analytics')) {
          tags.add('Analytics');
        }
        
        // オリジナルカテゴリも追加（正規化）
        const normalizedTags = normalizeTagInput(category);
        normalizedTags.forEach(tag => tags.add(tag));
      }
    }
    
    // 基本的な技術タグ
    tags.add('Cloud');
    tags.add('Infrastructure');
    
    return Array.from(tags);
  }
}
