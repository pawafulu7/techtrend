'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, Calendar, ExternalLink, Loader2, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ArticleView {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: string;
  source: {
    id: number;
    name: string;
  };
  tags?: Array<{
    id: number;
    name: string;
  }>;
  viewId: number;
  viewedAt: string;
}

export default function HistoryPage() {
  const { data: _session, status } = useSession();
  const router = useRouter();
  const [views, setViews] = useState<ArticleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/history');
      return;
    }

    if (status === 'authenticated') {
      fetchHistory();
    }
  }, [status, router]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      // モバイルの場合は軽量モードを使用
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const params = new URLSearchParams();

      if (isMobile) {
        params.set('lightweight', 'true');
      }
      // sourceリレーションを含める（表示に必要）
      params.set('includeRelations', 'true');

      const response = await fetch(`/api/article-views?${params.toString()}`);

      if (!response.ok) {
        throw new Error('閲覧履歴の取得に失敗しました');
      }

      const data = await response.json();
      setViews(data.views);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      const response = await fetch('/api/article-views', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('履歴のクリアに失敗しました');
      }

      setViews([]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'エラーが発生しました');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">閲覧履歴</h1>
            <p className="text-muted-foreground">
              最近読んだ記事の履歴を確認できます
            </p>
          </div>
          {views.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearHistory}
              className="text-destructive hover:text-destructive"
            >
              履歴をクリア
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {views.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Eye className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">閲覧履歴がありません</p>
              <p className="text-muted-foreground mb-6">
                記事を読むと自動的に履歴に記録されます
              </p>
              <Button asChild>
                <Link href="/">記事を探す</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {views.map((view) => (
              <Card key={view.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">
                        <Link 
                          href={`/articles/${view.id}`}
                          className="hover:text-primary transition-colors"
                        >
                          {view.title}
                        </Link>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 text-sm">
                        <span>{view.source.name}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(view.publishedAt), {
                            addSuffix: true,
                            locale: ja,
                          })}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(view.viewedAt), {
                        addSuffix: true,
                        locale: ja,
                      })}
                    </div>
                  </div>
                </CardHeader>
                {(view.summary || view.tags) && (
                  <CardContent>
                    {view.summary && (
                      <p className="text-muted-foreground line-clamp-3 mb-3">
                        {view.summary}
                      </p>
                    )}
                    {view.tags && view.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {view.tags.slice(0, 5).map((t) => (
                          <Badge key={t.id} variant="outline" className="text-xs">
                            {t.name}
                          </Badge>
                        ))}
                        {view.tags.length > 5 && (
                          <span className="text-xs text-muted-foreground">
                            +{view.tags.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-4">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={view.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          元記事を読む
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}