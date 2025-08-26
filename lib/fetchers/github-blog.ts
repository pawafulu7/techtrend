import { BaseFetcher } from './base';
import { CreateArticleInput, FetchResult } from '@/types';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { parseRSSDate } from '@/lib/utils/date-parser';
import { extractContent, checkContentQuality } from '@/lib/utils/content-utils';
import { ContentEnricherFactory } from '@/lib/enrichers';
import { normalizeTagInput } from '@/lib/services/tag-normalizer';

interface GitHubBlogItem {
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

export class GitHubBlogFetcher extends BaseFetcher {
  private parser: Parser<any, GitHubBlogItem>;
  private rssUrl = 'https://github.blog/feed/';
  
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
                  console.log(`[GitHub Blog] Enriched content for ${item.link}: ${content.length} -> ${enrichedData.content.length} chars`);
                  content = enrichedData.content;
                  thumbnail = enrichedData.thumbnail || undefined;
                } else {
                  console.log(`[GitHub Blog] Enrichment did not improve content for ${item.link}`);
                }
              } catch (error) {
                console.error(`[GitHub Blog] Enrichment failed for ${item.link}:`, error);
                // エラー時は元のコンテンツを使用
              }
            }
          } else if (content && content.length >= 2000) {
            console.log(`[GitHub Blog] Content already sufficient for ${item.link}: ${content.length} chars`);
          }
          
          // コンテンツ品質チェック
          const contentCheck = checkContentQuality(content, item.title);
          if (contentCheck.warning) {
            console.log(`[GitHub Blog] Content quality warning for ${item.link}: ${contentCheck.warning}`);
          }
          
          // タグの生成
          const tags = this.generateGitHubTags(item.categories);
          
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
        } catch (error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      errors.push(new Error(`Failed to fetch GitHub Blog RSS feed: ${error instanceof Error ? error.message : String(error)}`));
    }

    // 日付順にソートして最新30件を返す
    articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const limitedArticles = articles.slice(0, 30);

    return { articles: limitedArticles, errors };
  }

  private generateGitHubTags(categories?: string[]): string[] {
    const tags = new Set<string>();
    
    // 必須タグ
    tags.add('GitHub');
    
    // カテゴリベースのタグ
    if (categories && categories.length > 0) {
      for (const category of categories) {
        const normalizedCategory = category.toLowerCase().trim();
        
        // カテゴリマッピング
        if (normalizedCategory.includes('security')) {
          tags.add('Security');
          tags.add('セキュリティ');
        }
        if (normalizedCategory.includes('product') || normalizedCategory.includes('feature')) {
          tags.add('Product Update');
          tags.add('新機能');
        }
        if (normalizedCategory.includes('engineering') || normalizedCategory.includes('technical')) {
          tags.add('Engineering');
          tags.add('技術');
        }
        if (normalizedCategory.includes('open source')) {
          tags.add('Open Source');
          tags.add('OSS');
        }
        if (normalizedCategory.includes('ai') || normalizedCategory.includes('copilot')) {
          tags.add('AI');
          tags.add('GitHub Copilot');
        }
        if (normalizedCategory.includes('action')) {
          tags.add('GitHub Actions');
          tags.add('CI/CD');
        }
        if (normalizedCategory.includes('api')) {
          tags.add('API');
        }
        if (normalizedCategory.includes('enterprise')) {
          tags.add('Enterprise');
        }
        
        // オリジナルカテゴリも追加（正規化）
        const normalizedTags = normalizeTagInput(category);
        normalizedTags.forEach(tag => tags.add(tag));
      }
    }
    
    return Array.from(tags);
  }
}