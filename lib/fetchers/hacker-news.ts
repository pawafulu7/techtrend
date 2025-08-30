import { BaseFetcher } from './base';
import { CreateArticleInput, FetchResult } from '@/types';
import { Source } from '@prisma/client';
import { ContentEnricherFactory } from '@/lib/enrichers';

interface HackerNewsStory {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number;
  text?: string;
  type: string;
}

export class HackerNewsFetcher extends BaseFetcher {
  private apiBase = 'https://hacker-news.firebaseio.com/v0';
  
  constructor(source: Source) {
    super(source);
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
      // Top storiesのIDを取得（最大500件）
      const topStoriesResponse = await fetch(`${this.apiBase}/topstories.json`);
      const topStoryIds = await topStoriesResponse.json() as number[];
      
      // 最初の30件のみ処理
      const storyIdsToFetch = topStoryIds.slice(0, 30);
      
      // ContentEnricherFactoryのインスタンス作成
      const enricherFactory = new ContentEnricherFactory();

      // 各ストーリーの詳細を取得
      for (const storyId of storyIdsToFetch) {
        try {
          const storyResponse = await fetch(`${this.apiBase}/item/${storyId}.json`);
          const story = await storyResponse.json() as HackerNewsStory;
          
          // storyタイプでURLがあるものだけ処理
          if (story.type !== 'story' || !story.url || !story.title) {
            continue;
          }
          
          // Hacker News自身のディスカッションページは除外
          if (story.url.startsWith('https://news.ycombinator.com/')) {
            continue;
          }
          
          const publishedAt = new Date(story.time * 1000);
          
          // 30日以内かつ未来でない記事のみ処理
          if (publishedAt < thirtyDaysAgo || publishedAt > now) {
            continue;
          }
          
          // スコアが低い記事は除外（品質フィルタ）
          if (story.score < 50) {
            continue;
          }
          
          // コンテンツエンリッチメント
          let content = story.text || '';
          let thumbnail: string | undefined;
          
          // URLからコンテンツを取得
          const enricher = enricherFactory.getEnricher(story.url);
          if (enricher) {
            try {
              const enrichedData = await enricher.enrich(story.url);
              if (enrichedData && enrichedData.content) {
                content = enrichedData.content;
                thumbnail = enrichedData.thumbnail || undefined;
              }
            } catch (_error) {
              console.error(`[Hacker News] Enrichment failed for ${story.url}:`, error);
            }
          }
          
          // タグの生成
          const tags = this.generateHackerNewsTags(story.title, story.url);
          
          const article: CreateArticleInput = {
            title: this.sanitizeText(story.title),
            url: this.normalizeUrl(story.url),
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

          // メタデータとしてHNスコアとコメント数を追加
          article.metadata = {
            hnScore: story.score,
            hnComments: story.descendants || 0,
            hnUser: story.by
          };

          articles.push(article);
          
          // レート制限対策（APIコールの間に短い待機）
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (_error) {
          errors.push(new Error(`Failed to fetch story ${storyId}: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
      
    } catch (_error) {
      errors.push(new Error(`Failed to fetch Hacker News top stories: ${error instanceof Error ? error.message : String(error)}`));
    }

    // 日付順にソートして返す
    articles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    return { articles, errors };
  }

  private generateHackerNewsTags(title: string, url: string): string[] {
    const tags = new Set<string>();
    
    // 必須タグ
    tags.add('Hacker News');
    tags.add('Tech News');
    
    // URLベースのタグ
    const domain = new URL(url).hostname.replace('www.', '');
    
    // 主要なドメインに対するタグ付け
    if (domain.includes('github.com')) {
      tags.add('GitHub');
      tags.add('Open Source');
    }
    if (domain.includes('arxiv.org')) {
      tags.add('Research');
      tags.add('Academic');
    }
    if (domain.includes('medium.com')) {
      tags.add('Medium');
    }
    if (domain.includes('substack.com')) {
      tags.add('Newsletter');
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
      if (lowerTitle.includes('rust')) {
        tags.add('Rust');
      }
      if (lowerTitle.includes('go') || lowerTitle.includes('golang')) {
        tags.add('Go');
      }
      if (lowerTitle.includes('typescript')) {
        tags.add('TypeScript');
      }
      if (lowerTitle.includes('react')) {
        tags.add('React');
      }
      if (lowerTitle.includes('vue')) {
        tags.add('Vue');
      }
      
      // テクノロジー分野
      if (lowerTitle.includes('ai') || lowerTitle.includes('artificial intelligence')) {
        tags.add('AI');
      }
      if (lowerTitle.includes('machine learning') || lowerTitle.includes('ml')) {
        tags.add('Machine Learning');
      }
      if (lowerTitle.includes('blockchain') || lowerTitle.includes('crypto')) {
        tags.add('Blockchain');
      }
      if (lowerTitle.includes('security')) {
        tags.add('Security');
        tags.add('セキュリティ');
      }
      if (lowerTitle.includes('database') || lowerTitle.includes('sql')) {
        tags.add('Database');
      }
      if (lowerTitle.includes('devops') || lowerTitle.includes('kubernetes') || lowerTitle.includes('docker')) {
        tags.add('DevOps');
      }
      if (lowerTitle.includes('cloud') || lowerTitle.includes('aws') || lowerTitle.includes('gcp') || lowerTitle.includes('azure')) {
        tags.add('Cloud');
      }
    }
    
    // 基本的な技術タグ
    tags.add('Technology');
    tags.add('Programming');
    
    return Array.from(tags);
  }
}