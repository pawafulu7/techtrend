import { Source } from '@prisma/client';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { normalizeTagInput } from '../utils/tag-normalizer';

interface DevToArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  published_at: string;
  tag_list: string[] | string; // 配列または文字列形式に対応
  user: {
    name: string;
    username: string;
  };
  cover_image: string | null;
  positive_reactions_count: number;
  comments_count: number;
  reading_time_minutes: number;
  // 詳細API用フィールド
  body_html?: string;
  body_markdown?: string;
}

export class DevToFetcher extends BaseFetcher {
  private baseUrl = 'https://dev.to/api/articles';
  private perPage = 100; // APIの最大値

  // 個別記事の詳細を取得
  private async fetchArticleDetail(articleId: number): Promise<DevToArticle | null> {
    try {
      const response = await this.retry(async () => {
        const res = await fetch(`${this.baseUrl}/${articleId}`, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (res.status === 404) {
          return null; // 記事が見つからない場合
        }

        if (!res.ok) {
          throw new Error(`Dev.to API error: ${res.status} ${res.statusText}`);
        }

        return res.json();
      });

      return response;
    } catch (error) {
      console.error(`Failed to fetch article detail for ID ${articleId}:`, error);
      return null;
    }
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      // トップ記事を取得（週間トレンド）
      const topArticlesResponse = await this.retry(async () => {
        const res = await fetch(`${this.baseUrl}?top=7`, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Dev.to API error: ${res.status} ${res.statusText}`);
        }

        return res.json();
      });

      let allArticles: DevToArticle[] = [];
      if (Array.isArray(topArticlesResponse)) {
        allArticles = topArticlesResponse;
      }

      // 技術系タグで絞り込み、人気記事を取得
      const tags = ['javascript', 'typescript', 'react', 'python', 'node', 'webdev', 'programming'];
      
      for (const tag of tags) {
        try {
          const response = await this.retry(async () => {
            const res = await fetch(`${this.baseUrl}?tag=${tag}&per_page=10&top=1`, { // 日別トレンド
              headers: {
                'Accept': 'application/json',
              },
            });

            if (!res.ok) {
              throw new Error(`Dev.to API error: ${res.status} ${res.statusText}`);
            }

            return res.json();
          });

          if (Array.isArray(response)) {
            // 品質フィルタリング：反応数10以上、読了時間2分以上
            const qualityArticles = response.filter(article => 
              article.positive_reactions_count >= 10 && 
              article.reading_time_minutes >= 2
            );
            allArticles.push(...qualityArticles);
          }

          // レート制限対策
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          errors.push(new Error(`Failed to fetch articles for tag ${tag}: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      // 重複を除去（記事IDベース）
      const uniqueArticles = Array.from(
        new Map(allArticles.map(article => [article.id, article])).values()
      );

      // 品質でソート（反応数優先、次に日付）
      uniqueArticles.sort((a, b) => {
        // まず反応数でソート
        const reactionDiff = b.positive_reactions_count - a.positive_reactions_count;
        if (reactionDiff !== 0) return reactionDiff;
        // 同じ反応数なら日付でソート
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      });

      // 最大30件に制限（日別トレンド）
      const limitedArticles = uniqueArticles.slice(0, 30);

      // 各記事の詳細を取得
      for (const item of limitedArticles) {
        try {
          // 個別記事の詳細を取得（本文含む）
          const detailedArticle = await this.fetchArticleDetail(item.id);
          
          // Rate Limit対策（1.5秒間隔）- テスト環境では無効
          if (process.env.NODE_ENV !== 'test') {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }

          // 詳細が取得できた場合はそちらを使用、できなかった場合は元のデータを使用
          const articleData = detailedArticle || item;
          
          // tag_listの処理：新しい正規化関数を使用
          const tagNames = normalizeTagInput(articleData.tag_list);
          
          const article: CreateArticleInput = {
            title: this.sanitizeText(articleData.title),
            url: articleData.url,
            summary: undefined, // 要約は後で日本語で生成するため、ここではセットしない
            // body_htmlがあればそれを、なければbody_markdownを、それもなければdescriptionを使用
            content: articleData.body_html || articleData.body_markdown || articleData.description || '',
            description: articleData.description || '',
            thumbnail: articleData.cover_image || undefined,
            publishedAt: new Date(articleData.published_at),
            sourceId: this.source.id,
            tagNames: tagNames,
            };

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse article: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } catch (error) {
      errors.push(new Error(`Failed to fetch from Dev.to: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }
}