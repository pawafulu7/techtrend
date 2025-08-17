'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Eye } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ViewedArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  source: {
    id: string;
    name: string;
  };
  tags: Array<{
    id: string;
    name: string;
  }>;
  viewId: string;
  viewedAt: string;
  qualityScore: number | null;
}

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [views, setViews] = useState<ViewedArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/history');
    } else if (status === 'authenticated') {
      fetchHistory();
    }
  }, [status, router]);

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/article-views');
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }
      const data = await response.json();
      setViews(data.views);
    } catch (err) {
      setError('閲覧履歴の取得に失敗しました');
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const viewed = new Date(date);
    const diffMs = now.getTime() - viewed.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'たった今';
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    return formatDate(date);
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-6 w-6" />
              閲覧履歴
            </CardTitle>
            <CardDescription>
              最近閲覧した記事の履歴
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-6 w-6" />
              閲覧履歴
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-6 w-6" />
            閲覧履歴
          </CardTitle>
          <CardDescription>
            {views.length > 0
              ? `最近${views.length}件の記事を閲覧しました`
              : '閲覧した記事の履歴が表示されます'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {views.length === 0 ? (
            <div className="text-center py-12">
              <Eye className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-lg font-medium mb-2">
                まだ閲覧履歴がありません
              </p>
              <p className="text-sm text-muted-foreground">
                記事を閲覧すると履歴が記録されます
              </p>
              <Link href="/">
                <Button className="mt-4">
                  記事を探す
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {views.map((article) => (
                <div
                  key={article.viewId}
                  className="group relative border rounded-lg p-4 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link 
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
                          {article.title}
                        </h3>
                      </Link>
                      
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {article.summary}
                      </p>
                      
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {article.source.name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          公開: {formatDate(article.publishedAt)}
                        </span>
                        {article.qualityScore && (
                          <Badge variant="outline" className="text-xs">
                            品質: {article.qualityScore}
                          </Badge>
                        )}
                      </div>
                      
                      {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {article.tags.slice(0, 5).map((tag) => (
                            <Badge key={tag.id} variant="outline" className="text-xs">
                              {tag.name}
                            </Badge>
                          ))}
                          {article.tags.length > 5 && (
                            <span className="text-xs text-muted-foreground">
                              +{article.tags.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                        <Clock className="h-3 w-3" />
                        <span>閲覧: {formatTimeAgo(article.viewedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}