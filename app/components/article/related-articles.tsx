'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { Button } from '@/components/ui-v2/button-v2';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LinkIcon,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Network,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/date';
import {
  useRelatedArticles,
  type RelatedArticle,
} from '@/hooks/use-related-articles';

// Extracted component to use hooks for each article item
// Avoids Date.now() during render (React Compiler purity rule)
function RelatedArticleItem({ article }: { article: RelatedArticle }) {
  const [timeInfo, setTimeInfo] = useState<{
    hoursAgo: number;
    isNew: boolean;
  } | null>(null);

  useEffect(() => {
    const publishedTime = new Date(article.publishedAt).getTime();
    // Validate date to avoid NaN
    if (Number.isNaN(publishedTime)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: keep null for invalid date
      setTimeInfo(null);
      return;
    }
    const hoursAgo = Math.floor(
      (Date.now() - publishedTime) / (1000 * 60 * 60)
    );
    setTimeInfo({ hoursAgo, isNew: hoursAgo < 24 });
  }, [article.publishedAt]);

  // Use undefined fallback to avoid UI flicker (showing "just now" before real value)
  const hoursAgo = timeInfo?.hoursAgo;
  const isNew = timeInfo?.isNew;
  // Check if date is valid to avoid "Invalid Date" display
  const isValidDate = !Number.isNaN(new Date(article.publishedAt).getTime());

  return (
    <Link
      href={`/articles/${article.id}`}
      className="group block cursor-pointer rounded-lg bg-[var(--tt-color-surface-muted)] p-3 transition-colors hover:bg-[var(--tt-color-surface-hover)]"
    >
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="group-hover:text-primary line-clamp-2 text-sm font-medium transition-colors">
            {article.translatedTitle || article.title}
          </h4>
          <BadgeV2 variant="secondary" className="ml-2 shrink-0 text-xs">
            {Math.round(article.similarity * 100)}%
          </BadgeV2>
        </div>

        {article.summary && (
          <p className="line-clamp-2 text-xs text-[var(--tt-color-text-muted)]">
            {article.summary}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-[var(--tt-color-text-muted)]">
          <BadgeV2 variant="outline" className="text-xs">
            {article.source}
          </BadgeV2>
          <span>
            {!isValidDate
              ? '日付不明'
              : hoursAgo === undefined
                ? formatDate(article.publishedAt)
                : hoursAgo < 1
                  ? 'たった今'
                  : hoursAgo < 24
                    ? `${hoursAgo}時間前`
                    : formatDate(article.publishedAt)}
          </span>
          {isNew === true && (
            <BadgeV2 className="h-5 text-xs" variant="primary">
              <TrendingUp className="mr-0.5 h-3 w-3" />
              New
            </BadgeV2>
          )}
        </div>

        {article.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {article.tags.slice(0, 3).map((tag) => (
              <BadgeV2
                key={tag.id}
                variant="outline"
                className="h-4 px-1.5 py-0 text-xs"
              >
                {tag.name}
              </BadgeV2>
            ))}
            {article.tags.length > 3 && (
              <span className="text-xs text-[var(--tt-color-text-muted)]">
                +{article.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

interface RelatedArticlesProps {
  articleId: string;
  maxItems?: number;
  initialExpanded?: boolean;
}

export function RelatedArticles({
  articleId,
  maxItems = 10,
  initialExpanded = false,
}: RelatedArticlesProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const {
    data: articles = [],
    isLoading,
    error,
  } = useRelatedArticles(articleId);

  // 表示件数の制御
  const displayLimit = expanded ? maxItems : 5;
  const displayArticles = articles.slice(0, displayLimit);
  const hasMore = articles.length > 5;
  const remainingCount = articles.length - 5;

  if (isLoading) {
    return (
      <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
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
          <CardTitle className="flex items-center gap-2 text-lg">
            <LinkIcon className="h-5 w-5" />
            関連記事
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--tt-color-text-muted)]">
            関連記事が見つかりませんでした。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <LinkIcon className="h-5 w-5" />
            関連記事
          </CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/articles/${articleId}/graph`}
              className="flex items-center gap-1.5"
            >
              <Network className="h-4 w-4" />
              グラフで見る
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="scrollbar-thin max-h-[600px] space-y-2 overflow-y-auto">
        {displayArticles.map((article) => (
          <RelatedArticleItem key={article.id} article={article} />
        ))}

        {hasMore && (
          <Button
            variant="ghost"
            className="mt-2 flex w-full items-center gap-2"
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
