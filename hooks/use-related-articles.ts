import { useQuery } from '@tanstack/react-query';

export interface RelatedArticle {
  id: string;
  title: string;
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
}

export function useRelatedArticles(articleId: string) {
  return useQuery<RelatedArticle[]>({
    queryKey: ['related-articles', articleId],
    queryFn: async () => {
      const response = await fetch(`/api/articles/${articleId}/related`);
      if (!response.ok) {
        throw new Error('Failed to fetch related articles');
      }
      const data = await response.json();
      return data.articles;
    },
    staleTime: 5 * 60 * 1000, // 5分
    gcTime: 10 * 60 * 1000, // 10分（旧 cacheTime）
    retry: 1,
    refetchOnWindowFocus: false,
  });
}