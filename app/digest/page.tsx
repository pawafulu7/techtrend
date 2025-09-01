'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CalendarIcon, TrendingUpIcon, TagIcon, RefreshCwIcon, ExternalLinkIcon, ChevronRightIcon } from 'lucide-react';

interface DigestArticle {
  id: string;
  title: string;
  url: string;
  source: {
    name: string;
  };
  tags: Array<{
    name: string;
  }>;
}

interface TopArticle {
  id: string;
  title: string;
  url: string;
  score: number;
}

interface Category {
  name: string;
  count: number;
  topArticle: {
    id: string;
    title: string;
  } | null;
}

interface WeeklyDigest {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  articleCount: number;
  topArticles: TopArticle[];
  categories: Category[];
  articles: DigestArticle[];
}

// 型ガード関数
function isWeeklyDigest(data: unknown): data is WeeklyDigest {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  
  return (
    typeof obj.id === 'string' &&
    typeof obj.weekStartDate === 'string' &&
    typeof obj.weekEndDate === 'string' &&
    typeof obj.articleCount === 'number' &&
    Array.isArray(obj.articles)
  );
}

export default function DigestPage() {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDigest = async (date?: Date, retryCount = 0) => {
    setLoading(true);
    setError(null);
    try {
      const targetDate = date || new Date();
      const response = await fetch(`/api/digest/${encodeURIComponent(targetDate.toISOString())}`, {
        signal: AbortSignal.timeout(10000) // 10秒のタイムアウトを設定
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          setDigest(null);
          setError('週刊ダイジェストがまだ生成されていません');
        } else if (response.status >= 500 && retryCount < 2) {
          // サーバーエラーの場合、最大2回リトライ
          setTimeout(() => fetchDigest(date, retryCount + 1), 1000 * (retryCount + 1));
          return;
        } else {
          const errorText = await response.text().catch(() => '');
          setError(`ダイジェストの取得に失敗しました${errorText ? ': ' + errorText : ''}`);
        }
        return;
      }
      
      const data = await response.json();
      if (!isWeeklyDigest(data)) {
        setError('不正なデータ形式です');
        return;
      }
      
      setDigest(data);
    } catch (err) {
      // タイムアウトまたはネットワークエラーの場合、リトライ
      if ((err instanceof Error && err.name === 'AbortError') && retryCount < 2) {
        setTimeout(() => fetchDigest(date, retryCount + 1), 1000 * (retryCount + 1));
        return;
      }
      setError(`エラーが発生しました: ${err instanceof Error ? err.message : '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  };

  const generateDigest = async () => {
    setError(null);
    setGenerating(true);
    try {
      const response = await fetch('/api/digest/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: new Date().toISOString() }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        setError(`ダイジェストの生成に失敗しました${errorText ? ': ' + errorText : ''}`);
        return;
      }
      
      // 生成成功後、ダイジェストを取得
      await fetchDigest();
    } catch (err) {
      // エラーは既にUIで表示しているので、ログは不要
      setError(`エラーが発生しました: ${err instanceof Error ? err.message : '不明なエラー'}`);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchDigest();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '日付不明';
      }
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
    } catch {
      return '日付不明';
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error && !digest) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground mb-4">{error}</p>
            <div className="flex justify-center">
              <Button onClick={generateDigest} disabled={generating}>
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                {generating ? 'ダイジェスト生成中...' : 'ダイジェストを生成'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!digest) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">TechTrend 週刊ダイジェスト</h1>
        <p className="text-muted-foreground flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" />
          {formatDate(digest.weekStartDate)} 〜 {formatDate(digest.weekEndDate)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          記事総数: {digest.articleCount}件
        </p>
      </div>

      {/* 人気記事TOP 10 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUpIcon className="h-5 w-5" />
            今週の人気記事 TOP 10
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {digest.articles?.slice(0, 10).map((article, index) => (
              <div key={article.id} className="group flex items-start gap-4 p-3 -mx-3 rounded-lg hover:bg-accent/30 transition-colors">
                <span className="text-2xl font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <Link
                    href={`/articles/${article.id}?from=digest`}
                    className="font-medium text-foreground hover:text-blue-600 group-hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                  >
                    {article.title}
                    <ExternalLinkIcon className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {article.source.name}
                    </Badge>
                    {article.tags?.slice(0, 3).map((tag) => (
                      <Badge key={tag.name} variant="secondary" className="text-xs">
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* カテゴリ別ハイライト */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="h-5 w-5" />
            カテゴリ別ハイライト
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {digest.categories?.map((category) => (
              <Card key={category.name}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">{category.name}</h3>
                    <Badge>{category.count}件</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {category.topArticle && (
                    <div className="text-sm">
                      <p className="text-muted-foreground mb-2">最も読まれた記事:</p>
                      <Link
                        href={`/articles/${category.topArticle.id}?from=digest`}
                        className="group block p-3 -mx-3 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <ChevronRightIcon className="h-4 w-4 mt-0.5 text-blue-600 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
                          <span className="font-medium text-foreground group-hover:text-blue-600 line-clamp-2 flex-1">
                            {category.topArticle.title}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity pl-6">
                          <span>記事を読む</span>
                          <ExternalLinkIcon className="h-3 w-3" />
                        </div>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}