import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';

interface QiitaArticle {
  id: string;
  title: string;
  url: string;
  user: {
    id: string;
    name: string;
    profile_image_url: string;
  };
  created_at: string;
  updated_at: string;
  tags: Array<{
    name: string;
    versions: string[];
  }>;
  likes_count: number;
  stocks_count: number;
  comments_count: number;
  body: string;
  rendered_body: string;
}

export class QiitaPopularFetcher extends BaseFetcher {
  constructor(source: any) {
    super(source);
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      console.log('[Qiita Popular] 人気記事を取得中...');
      
      // Qiita APIで人気記事を取得（ストック数が多い順）
      const response = await this.retry(async () => {
        const res = await fetch(`${this.source.url}?page=1&per_page=30&query=stocks:>10`, {
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        return res.json();
      });

      const items = response as QiitaArticle[];
      
      if (!items || items.length === 0) {
        console.log('[Qiita Popular] 記事が見つかりませんでした');
        return { articles, errors };
      }

      console.log(`[Qiita Popular] ${items.length}件の人気記事を取得`);

      for (const item of items) {
        try {
          const article: CreateArticleInput = {
            title: this.sanitizeText(item.title),
            url: item.url,
            summary: undefined, // 要約は後で日本語で生成
            content: item.body || '',
            publishedAt: new Date(item.created_at),
            sourceId: this.source.id,
            tagNames: item.tags.map(tag => tag.name),
            metadata: {
              likesCount: item.likes_count,
              stocksCount: item.stocks_count,
              commentsCount: item.comments_count,
              author: item.user.name || item.user.id,
            }
          };

          // ユーザーのプロフィール画像をサムネイルとして使用
          if (item.user.profile_image_url) {
            article.thumbnail = item.user.profile_image_url;
          }

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      console.log(`[Qiita Popular] ${articles.length}件の記事を処理`);
    } catch (error) {
      errors.push(new Error(`Failed to fetch Qiita popular articles: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }
}