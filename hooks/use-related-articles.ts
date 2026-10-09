import { useQuery } from '@tanstack/react-query';

export interface RelatedArticle {
  id: string;
  title: string;
  translatedTitle: string | null;
  summary: string | null;
  url: string;
  publishedAt: Date;
  source: string;
  tags: Array<{
    id: string;
    name: string;
    category: string | null;
  }>;
  similarity: number;
  // 対象記事と共通するタグの数（API がどちらの方式でも返す）
  commonTags: number;
}

// 関連記事を選んだ方式。tag はタグの重なり、embedding は内容のベクトルの近さ
export type RelatedArticlesAlgorithm = 'tag' | 'embedding';

export interface RelatedArticlesResult {
  articles: RelatedArticle[];
  algorithm: RelatedArticlesAlgorithm;
}

const RELATED_ARTICLES_LIMIT = 10;

export function useRelatedArticles(articleId: string) {
  return useQuery<RelatedArticlesResult>({
    // 'v2': データの形を配列から { articles, algorithm } に変えた（#703）。
    // 同じキーに残った旧形式のキャッシュを新しいコードが読まないように分ける
    queryKey: ['related-articles', 'v2', articleId, RELATED_ARTICLES_LIMIT],
    queryFn: async () => {
      const response = await fetch(
        `/api/articles/${articleId}/related?limit=${RELATED_ARTICLES_LIMIT}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch related articles');
      }
      const data = await response.json();
      return {
        articles: data.articles,
        algorithm:
          data.metadata?.algorithm === 'embedding' ? 'embedding' : 'tag',
      };
    },
    staleTime: 5 * 60 * 1000, // 5分
    gcTime: 10 * 60 * 1000, // 10分（旧 cacheTime）
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
