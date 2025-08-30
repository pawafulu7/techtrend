'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { RecommendationCard } from './recommendation-card';
import { RecommendationSkeleton } from './recommendation-skeleton';
import { Button } from '@/components/ui/button';
import { ChevronRight, Sparkles, X, Eye } from 'lucide-react';
import { RecommendedArticle } from '@/lib/recommendation/types';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'hide-recommendations';

export function RecommendationSectionAnimated() {
  const { data: session, status } = useSession();
  const [recommendations, setRecommendations] = useState<RecommendedArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(true); // サーバーサイドでは非表示で初期化
  const [isAnimating, setIsAnimating] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // クライアントサイドでのみ実行
    setIsClient(true);
    
    // localStorageから表示設定を読み込む
    const hidden = localStorage.getItem(STORAGE_KEY) === 'true';
    setIsHidden(hidden);
    
    if (status === 'authenticated' && session?.user && !hidden) {
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
    } catch (_err) {
      setError('推薦記事の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleHide = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setIsHidden(true);
      localStorage.setItem(STORAGE_KEY, 'true');
      setIsAnimating(false);
    }, 300);
  };

  const handleShow = () => {
    setIsHidden(false);
    localStorage.setItem(STORAGE_KEY, 'false');
    if (recommendations.length === 0 && !loading) {
      fetchRecommendations();
    }
  };

  // クライアントサイドでレンダリングされるまで何も表示しない
  if (!isClient) {
    return null;
  }

  // 未ログインまたは認証確認中は表示しない
  if (status !== 'authenticated' || !session?.user) {
    return null;
  }

  // エラー時は表示しない（静かに失敗）
  if (error) {
    return null;
  }

  // 非表示設定の場合は、「おすすめを表示」ボタンのみ表示
  if (isHidden) {
    return (
      <section className="mb-4 flex justify-end">
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShow}
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            おすすめを表示
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section 
      className={cn(
        "mb-8 transition-all duration-300",
        isAnimating && "opacity-0 scale-95 translate-y-2"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">あなたへのおすすめ</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/recommendations" className="flex items-center gap-1">
              もっと見る
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleHide}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="おすすめを非表示"
            title="おすすめを非表示にする"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
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
          <p>現在、おすすめできる新しい記事がありません</p>
          <p className="text-sm mt-2">新着記事が追加されるまでお待ちください</p>
        </div>
      )}
    </section>
  );
}