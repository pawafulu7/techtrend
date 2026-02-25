'use client';

import { useState } from 'react';
import { ExternalLink, Newspaper, Loader2, AlertCircle } from 'lucide-react';
import { RelativeTime } from '@/app/components/common/relative-time';
import { parseSummary } from '@/lib/utils/summary-parser';
import type { ReaderDetailArticle } from './types';

interface ArticleDetailProps {
  article: ReaderDetailArticle | null;
  isLoading: boolean;
  error: string | null;
}

const MAX_VISIBLE_SECTIONS = 3;
const MAX_VISIBLE_TAGS = 3;

export function ReaderArticleDetail({
  article,
  isLoading,
  error,
}: ArticleDetailProps) {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [showAllSections, setShowAllSections] = useState(false);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="text-destructive h-8 w-8" />
        <p className="text-muted-foreground text-sm">{error}</p>
      </div>
    );
  }

  if (!article && !isLoading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center">
        <div className="text-center">
          <Newspaper className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="text-sm">記事を選択してください</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin motion-reduce:animate-none" />
      </div>
    );
  }

  if (!article) return null;

  const displayTitle = article.translatedTitle || article.title;
  const hasValidThumbnail =
    !!article.thumbnail && /^https?:\/\//.test(article.thumbnail);
  const showThumbnail = hasValidThumbnail && !thumbnailError;
  const sections = article.detailedSummary
    ? parseSummary(article.detailedSummary, {
        articleType: article.articleType ?? undefined,
        summaryVersion: article.summaryVersion ?? undefined,
      })
    : [];

  const safeUrl = (() => {
    try {
      const url = new URL(article.url);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? article.url
        : null;
    } catch {
      return null;
    }
  })();

  const visibleSections = showAllSections
    ? sections
    : sections.slice(0, MAX_VISIBLE_SECTIONS);
  const hasMoreSections = sections.length > MAX_VISIBLE_SECTIONS;

  return (
    <div className="space-y-2 px-4 py-3">
      {/* Header: Inline thumbnail + title + meta */}
      <div className="flex items-start gap-3">
        {/* Small inline thumbnail */}
        {showThumbnail ? (
          <div className="border-border h-20 w-20 shrink-0 overflow-hidden rounded-lg border">
            <img
              src={article.thumbnail!}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setThumbnailError(true)}
            />
          </div>
        ) : (
          <div className="bg-muted border-border flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border">
            <Newspaper className="text-muted-foreground h-6 w-6" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Title */}
          <h1 className="text-foreground text-lg leading-snug font-bold">
            {displayTitle}
          </h1>

          {/* Source badge + date + link */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {article.source?.name && (
              <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                {article.source.name}
              </span>
            )}
            <span className="text-muted-foreground text-xs">
              <RelativeTime date={article.publishedAt} />
            </span>
            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none"
              >
                <ExternalLink className="h-3 w-3" />
                <span>元記事を読む</span>
              </a>
            )}
          </div>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {article.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                <span
                  key={tag.id}
                  className="border-border bg-muted text-muted-foreground inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary Card */}
      {article.summary && (
        <div className="border-border bg-card rounded-lg border p-3 shadow-sm">
          <h2 className="text-foreground mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <span className="bg-primary h-1 w-1 rounded-full" />
            概要
          </h2>
          <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
            {article.summary}
          </p>
        </div>
      )}

      {/* Detailed Summary Card */}
      {sections.length > 0 && (
        <div className="border-border bg-card rounded-lg border p-3 shadow-sm">
          <h2 className="text-foreground mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <span className="bg-primary h-1 w-1 rounded-full" />
            詳細
          </h2>
          <div className="space-y-2">
            {visibleSections.map((section, i) => (
              <div key={i} className="text-sm">
                <h3 className="text-foreground font-medium">
                  {section.icon && <span className="mr-1">{section.icon}</span>}
                  {section.title}
                </h3>
                <p className="text-muted-foreground line-clamp-2 leading-relaxed">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
          {hasMoreSections && !showAllSections && (
            <button
              type="button"
              onClick={() => setShowAllSections(true)}
              className="text-primary hover:text-primary/80 mt-2 cursor-pointer text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
            >
              もっと見る...
            </button>
          )}
        </div>
      )}

      {!article.summary && sections.length === 0 && (
        <div className="border-border bg-card rounded-lg border p-3 shadow-sm">
          <p className="text-muted-foreground text-sm italic">
            要約はありません
          </p>
        </div>
      )}
    </div>
  );
}
