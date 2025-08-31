'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CalendarIcon, TrendingUpIcon, TagIcon, RefreshCwIcon } from 'lucide-react';

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

interface WeeklyDigest {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  articleCount: number;
  topArticles: Array<{
    id: string;
    title: string;
    url: string;
    score: number;
  }>;
  categories: Array<{
    name: string;
    count: number;
    topArticle: {
      id: string;
      title: string;
    };
  }>;
  articles: DigestArticle[];
}

export default function DigestPage() {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDigest = async (date?: Date) => {
    try {
      const targetDate = date || new Date();
      const response = await fetch(`/api/digest/${targetDate.toISOString()}`);
      
      if (response.ok) {
        const data = await response.json();
        setDigest(data);
      } else if (response.status === 404) {
        setError('週刊ダイジェストがまだ生成されていません');
      } else {
        setError('ダイジェストの取得に失敗しました');
      }
    } catch (err) {
      setError('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const generateDigest = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/digest/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        await fetchDigest();
      } else {
        setError('ダイジェストの生成に失敗しました');
      }
    } catch (err) {
      setError('エラーが発生しました');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchDigest();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
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
              <div key={article.id} className="flex items-start gap-4">
                <span className="text-2xl font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <Link
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {article.title}
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
                    <p className="text-sm text-muted-foreground">
                      最も読まれた記事:
                      <br />
                      <span className="font-medium text-foreground">
                        {category.topArticle.title}
                      </span>
                    </p>
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