'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { RecommendationCard } from './recommendation-card';
import { RecommendationSkeleton } from './recommendation-skeleton';
import { Button } from '@/components/ui/button';
import { ChevronRight, Sparkles } from 'lucide-react';
import { RecommendedArticle } from '@/lib/recommendation/types';

export function RecommendationSection() {
  const { data: session, status } = useSession();
  const [recommendations, setRecommendations] = useState<RecommendedArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      fetchRecommendations();
    }
  }, [status, session]);

  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/recommendations?limit=5');
      
      if (!response.ok) {
        throw new Error('Failed to fetch recommendations');
      }
      
      const data = await response.json();
      setRecommendations(data);
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setError('推薦記事の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 未ログインまたは認証確認中は表示しない
  if (status !== 'authenticated' || !session?.user) {
    return null;
  }

  // エラー時は表示しない（静かに失敗）
  if (error) {
    return null;
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">あなたへのおすすめ</h2>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/recommendations" className="flex items-center gap-1">
            もっと見る
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <RecommendationSkeleton key={i} />
          ))}
        </div>
      ) : recommendations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {recommendations.map((article) => (
            <RecommendationCard
              key={article.id}
              article={article}
              showReasons={false}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>もう少し記事を読むと、おすすめが表示されます</p>
        </div>
      )}
    </section>
  );
}