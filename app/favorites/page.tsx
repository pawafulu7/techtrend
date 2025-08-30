'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, Calendar, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface FavoriteArticle {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: string;
  source: {
    id: number;
    name: string;
  };
  tags?: Array<{ id: number; name: string; }>;
  favoriteId: number;
  favoritedAt: string;
}

export default function FavoritesPage() {
  const { data: _session, status } = useSession();
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/favorites');
      return;
    }

    if (status === 'authenticated') {
      fetchFavorites();
    }
  }, [status, router]);

  const fetchFavorites = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/favorites');
      
      if (!response.ok) {
        throw new Error('お気に入りの取得に失敗しました');
      }

      const data = await response.json();
      setFavorites(data.favorites);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (articleId: number) => {
    try {
      const response = await fetch(`/api/favorites?articleId=${articleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('お気に入りの削除に失敗しました');
      }

      // 楽観的UIアップデート
      setFavorites(prev => prev.filter(fav => fav.id !== articleId));
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">お気に入り記事</h1>
          <p className="text-muted-foreground">
            保存した記事をいつでも読み返すことができます
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {favorites.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Heart className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">お気に入り記事がありません</p>
              <p className="text-muted-foreground mb-6">
                気になる記事を見つけたら、ハートアイコンをクリックして保存しましょう
              </p>
              <Button asChild>
                <Link href="/">記事を探す</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {favorites.map((favorite) => (
              <Card key={favorite.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">
                        <Link 
                          href={`/articles/${favorite.id}`}
                          className="hover:text-primary transition-colors"
                        >
                          {favorite.title}
                        </Link>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 text-sm">
                        <span>{favorite.source.name}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(favorite.publishedAt), {
                            addSuffix: true,
                            locale: ja,
                          })}
                        </span>
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFavorite(favorite.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Heart className="h-5 w-5 fill-current" />
                    </Button>
                  </div>
                </CardHeader>
                {favorite.summary && (
                  <CardContent>
                    <p className="text-muted-foreground line-clamp-3">
                      {favorite.summary}
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={favorite.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          元記事を読む
                        </Link>
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        保存日: {formatDistanceToNow(new Date(favorite.favoritedAt), {
                          addSuffix: true,
                          locale: ja,
                        })}
                      </span>
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