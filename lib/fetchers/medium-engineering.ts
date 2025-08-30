import { BaseFetcher } from './base';
import { CreateArticleInput, FetchResult } from '@/types';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { parseRSSDate } from '@/lib/utils/date';
import { extractContent, checkContentQuality } from '@/lib/utils/content-extractor';
import { ContentEnricherFactory } from '@/lib/enrichers';
import { normalizeTagInput } from '@/lib/utils/tag-normalizer';

interface MediumItem {
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

interface MediumFeed {
  name: string;
  url: string;
  tags: string[];
}

export class MediumEngineeringFetcher extends BaseFetcher {
  private parser: Parser<any, MediumItem>;
  
  // 主要な技術系Mediumブログ
  private feeds: MediumFeed[] = [
    {
      name: 'Engineering at Medium',
      url: 'https://medium.engineering/feed',
      tags: ['Medium', 'Engineering']
    },
    {
      name: 'Netflix TechBlog',
      url: 'https://netflixtechblog.medium.com/feed',
      tags: ['Netflix', 'Streaming', 'Scale']
    },
    {
      name: 'Airbnb Engineering',
      url: 'https://medium.com/feed/airbnb-engineering',
      tags: ['Airbnb', 'Travel Tech']
    },
    {
      name: 'Uber Engineering',
      url: 'https://eng.uber.com/feed/',
      tags: ['Uber', 'Distributed Systems']
    },
    {
      name: 'Spotify Engineering',
      url: 'https://engineering.atspotify.com/feed/',
      tags: ['Spotify', 'Music Tech']
    }
  ];
  
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
    const seenUrls = new Set<string>(); // 重複除去用

    // 30日前の日付を計算
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // 現在日時を取得（未来日付フィルタ用）
    const now = new Date();
    
    // ContentEnricherFactoryのインスタンス作成
    const enricherFactory = new ContentEnricherFactory();

    // 各フィードから記事を取得
    for (const feedInfo of this.feeds) {
      try {
        const feed = await this.retry(() => this.parser.parseURL(feedInfo.url));
        
        if (!feed.items || feed.items.length === 0) {
          continue;
        }

        for (const item of feed.items) {
          try {
            if (!item.title || !item.link) continue;
            
            // URLを正規化（Mediumのトラッキングパラメータを除去）
            const cleanUrl = this.cleanMediumUrl(item.link);
            
            // 重複チェック
            if (seenUrls.has(cleanUrl)) {
              continue;
            }
            seenUrls.add(cleanUrl);

            const publishedAt = item.isoDate ? new Date(item.isoDate) :
                              item.pubDate ? parseRSSDate(item.pubDate) : new Date();
            
            // 30日以内かつ未来でない記事のみ処理
            if (publishedAt < thirtyDaysAgo || publishedAt > now) {
              continue;
            }

            // コンテンツの取得
            let content = extractContent(item);
            let thumbnail: string | undefined;
            
            // Medium記事のコンテンツエンリッチメント
            if (content && content.length < 2000) {
              const enricher = enricherFactory.getEnricher(cleanUrl);
              if (enricher) {
                try {
                  const enrichedData = await enricher.enrich(cleanUrl);
                  if (enrichedData && enrichedData.content && enrichedData.content.length > content.length) {
                    content = enrichedData.content;
                    thumbnail = enrichedData.thumbnail || undefined;
                  }
                } catch (error) {
                  console.error(`[Medium Engineering] Enrichment failed for ${cleanUrl}:`, error);
                }
              }
            }
            
            // コンテンツ品質チェック
            const contentCheck = checkContentQuality(content, item.title);
            if (contentCheck.warning) {
            }
            
            // タグの生成（フィード固有のタグ + カテゴリ + 自動生成）
            const tags = this.generateMediumTags(
              feedInfo.tags,
              item.categories,
              item.title,
              item.creator
            );
            
            const article: CreateArticleInput = {
              title: this.sanitizeText(item.title),
              url: cleanUrl,
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
            
            // メタデータとして著者情報を追加
            if (item.creator) {
              article.metadata = {
                author: item.creator,
                publication: feedInfo.name
              };
            }

            articles.push(article);
          } catch (error) {
            errors.push(new Error(`Failed to parse item from ${feedInfo.name}: ${error instanceof Error ? error.message : String(error)}`));
          }
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        errors.push(new Error(`Failed to fetch ${feedInfo.name} RSS feed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    // 日付順にソートして最新記事を返す
    articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const limitedArticles = articles.slice(0, 40); // 最大40件

    return { articles: limitedArticles, errors };
  }

  private cleanMediumUrl(url: string): string {
    // Mediumのトラッキングパラメータを除去
    const cleanUrl = url.split('?')[0].split('#')[0];
    return this.normalizeUrl(cleanUrl);
  }

  private generateMediumTags(
    feedTags: string[],
    categories?: string[],
    title?: string,
    _author?: string
  ): string[] {
    const tags = new Set<string>();
    
    // 必須タグ
    tags.add('Medium');
    tags.add('Engineering Blog');
    
    // フィード固有のタグ
    feedTags.forEach(tag => tags.add(tag));
    
    // カテゴリベースのタグ
    if (categories && categories.length > 0) {
      for (const category of categories) {
        const normalizedTags = normalizeTagInput(category);
        normalizedTags.forEach(tag => tags.add(tag));
      }
    }
    
    // タイトルベースのタグ
    if (title) {
      const lowerTitle = title.toLowerCase();
      
      // プログラミング言語
      if (lowerTitle.includes('javascript') || lowerTitle.includes('js')) {
        tags.add('JavaScript');
      }
      if (lowerTitle.includes('python')) {
        tags.add('Python');
      }
      if (lowerTitle.includes('java') && !lowerTitle.includes('javascript')) {
        tags.add('Java');
      }
      if (lowerTitle.includes('kotlin')) {
        tags.add('Kotlin');
      }
      if (lowerTitle.includes('swift')) {
        tags.add('Swift');
      }
      if (lowerTitle.includes('react')) {
        tags.add('React');
      }
      if (lowerTitle.includes('android')) {
        tags.add('Android');
      }
      if (lowerTitle.includes('ios')) {
        tags.add('iOS');
      }
      
      // テクノロジー分野
      if (lowerTitle.includes('microservice')) {
        tags.add('Microservices');
      }
      if (lowerTitle.includes('kubernetes') || lowerTitle.includes('k8s')) {
        tags.add('Kubernetes');
      }
      if (lowerTitle.includes('docker')) {
        tags.add('Docker');
      }
      if (lowerTitle.includes('machine learning') || lowerTitle.includes('ml')) {
        tags.add('Machine Learning');
      }
      if (lowerTitle.includes('data engineering') || lowerTitle.includes('data pipeline')) {
        tags.add('Data Engineering');
      }
      if (lowerTitle.includes('architecture')) {
        tags.add('Architecture');
        tags.add('アーキテクチャ');
      }
      if (lowerTitle.includes('performance')) {
        tags.add('Performance');
        tags.add('パフォーマンス');
      }
      if (lowerTitle.includes('scalability') || lowerTitle.includes('scale')) {
        tags.add('Scalability');
      }
    }
    
    // 基本的な技術タグ
    tags.add('Tech Companies');
    tags.add('Software Engineering');
    
    return Array.from(tags);
  }
}