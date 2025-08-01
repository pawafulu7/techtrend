import { Source } from '@prisma/client';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';

interface DevToArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  published_at: string;
  tag_list: string[];
  user: {
    name: string;
    username: string;
  };
  cover_image: string | null;
  positive_reactions_count: number;
  comments_count: number;
  reading_time_minutes: number;
}

export class DevToFetcher extends BaseFetcher {
  private baseUrl = 'https://dev.to/api/articles';
  private perPage = 100; // APIの最大値

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

      for (const item of limitedArticles) {
        try {
          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: item.url,
            summary: undefined, // 要約は後で日本語で生成するため、ここではセットしない
            content: item.description || '', // descriptionをcontentとして保存
            description: item.description || '',
            thumbnail: item.cover_image || undefined,
            publishedAt: new Date(item.published_at),
            sourceId: this.source.id,
            tagNames: item.tag_list || [],
            bookmarks: item.positive_reactions_count || 0,
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