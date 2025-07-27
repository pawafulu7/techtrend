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
      // 技術系タグで絞り込み、最新記事を取得
      const tags = ['javascript', 'typescript', 'react', 'python', 'node', 'webdev', 'programming'];
      const allArticles: DevToArticle[] = [];

      // 各タグごとに記事を取得
      for (const tag of tags) {
        try {
          const response = await this.retry(async () => {
            const res = await fetch(`${this.baseUrl}?tag=${tag}&per_page=30`, {
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
            allArticles.push(...response);
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

      // 日付でソートして最新記事を取得
      uniqueArticles.sort((a, b) => 
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      );

      // 最大200件に制限
      const limitedArticles = uniqueArticles.slice(0, 200);

      for (const item of limitedArticles) {
        try {
          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: item.url,
            summary: item.description ? this.sanitizeText(item.description).substring(0, 200) : undefined,
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