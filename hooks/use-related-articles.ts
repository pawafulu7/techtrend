import { useQuery } from '@tanstack/react-query';

interface Article {
  id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  qualityScore: number;
  difficulty?: string | null;
  source: string;
  tags: {
    id: string;
    name: string;
  }[];
  similarity: number;
}

export function useRelatedArticles(articleId: string) {
  return useQuery<Article[]>({
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