'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LinkIcon, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import { useRelatedArticles } from '@/hooks/use-related-articles';

interface RelatedArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  qualityScore: number;
  difficulty?: string | null;
  tags: Array<{
    id: string;
    name: string;
  }>;
  similarity: number;
}

interface RelatedArticlesProps {
  articleId: string;
  maxItems?: number;
  initialExpanded?: boolean;
}

export function RelatedArticles({ 
  articleId, 
  maxItems = 10,
  initialExpanded = false 
}: RelatedArticlesProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const { data: articles = [], isLoading, error } = useRelatedArticles(articleId);

  // 表示件数の制御
  const displayLimit = expanded ? maxItems : 5;
  const displayArticles = articles.slice(0, displayLimit);
  const hasMore = articles.length > 5;
  const remainingCount = articles.length - 5;

  if (isLoading) {
    return (
      <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            関連記事
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return null;
  }
  
  if (displayArticles.length === 0) {
    return (
      <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            関連記事
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">関連記事が見つかりませんでした。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          関連記事
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin">
        {displayArticles.map((article) => {
          const hoursAgo = Math.floor(
            (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60)
          );
          const isNew = hoursAgo < 24;

          return (
            <div
              key={article.id}
              className="group cursor-pointer p-3 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              onClick={() => window.open(article.url, '_blank', 'noopener,noreferrer')}
            >
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {article.title}
                  </h4>
                  <Badge 
                    variant="secondary" 
                    className="text-xs shrink-0 ml-2"
                  >
                    {Math.round(article.similarity * 100)}%
                  </Badge>
                </div>
                
                {article.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {article.summary}
                  </p>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {article.source}
                  </Badge>
                  <span>
                    {hoursAgo < 1 ? 'たった今' : 
                     hoursAgo < 24 ? `${hoursAgo}時間前` : 
                     formatDate(article.publishedAt)}
                  </span>
                  {isNew && (
                    <Badge className="text-xs h-5" variant="destructive">
                      <TrendingUp className="h-3 w-3 mr-0.5" />
                      New
                    </Badge>
                  )}
                </div>

                {article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {article.tags.slice(0, 3).map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="text-xs px-1.5 py-0 h-4"
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    {article.tags.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{article.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {hasMore && (
          <Button 
            variant="ghost" 
            className="w-full mt-2 flex items-center gap-2"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                折りたたむ
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                さらに表示 ({remainingCount}件)
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}