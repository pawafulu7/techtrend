'use client';

import { useEffect, useState } from 'react';
import { RecommendationCard } from '@/components/recommendation/recommendation-card';
import { RecommendationSkeleton } from '@/components/recommendation/recommendation-skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, RefreshCw, Info } from 'lucide-react';
import { RecommendedArticle } from '@/lib/recommendation/types';

export function RecommendationsClient() {
  const [recommendations, setRecommendations] = useState<RecommendedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/recommendations?limit=20');
      
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

  const handleRefresh = () => {
    fetchRecommendations();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">あなたへのおすすめ</h1>
            <p className="text-sm text-muted-foreground mt-1">
              閲覧履歴とお気に入りから、あなたの興味に合った記事を推薦します
            </p>
          </div>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={loading}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          更新
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(12)].map((_, i) => (
            <RecommendationSkeleton key={i} />
          ))}
        </div>
      ) : recommendations.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
            {recommendations.map((article) => (
              <RecommendationCard
                key={article.id}
                article={article}
                showReasons={true}
              />
            ))}
          </div>
          
          <Alert className="border-primary/20">
            <Info className="h-4 w-4" />
            <AlertDescription>
              推薦は過去30日間の閲覧履歴とお気に入りに基づいています。
              より多くの記事を読むことで、推薦の精度が向上します。
            </AlertDescription>
          </Alert>
        </>
      ) : (
        <div className="text-center py-12">
          <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">推薦記事がありません</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            もう少し記事を読んだりお気に入りに追加すると、
            あなたの興味に合った記事が推薦されるようになります。
          </p>
        </div>
      )}
    </>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}