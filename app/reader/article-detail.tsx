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

export function ReaderArticleDetail({
  article,
  isLoading,
  error,
}: ArticleDetailProps) {
  const [thumbnailError, setThumbnailError] = useState(false);

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

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-6 py-6">
      {/* Thumbnail - full width with rounded corners */}
      {showThumbnail && (
        <div className="border-border max-h-[240px] w-full overflow-hidden rounded-xl border">
          <img
            src={article.thumbnail!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setThumbnailError(true)}
          />
        </div>
      )}

      {/* Header Card */}
      <div className="border-border bg-card rounded-lg border p-5 shadow-sm">
        <h1 className="text-foreground mb-3 text-xl leading-relaxed font-bold">
          {displayTitle}
        </h1>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {article.source?.name && (
            <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
              {article.source.name}
            </span>
          )}
          <span className="text-muted-foreground">
            <RelativeTime date={article.publishedAt} />
          </span>
        </div>

        {article.tags && article.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {article.tags.slice(0, 5).map((tag) => (
              <span
                key={tag.id}
                className="border-border bg-muted text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {safeUrl && (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-muted text-foreground hover:bg-accent inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>元記事を読む</span>
          </a>
        )}
      </div>

      {/* Summary Card */}
      {article.summary && (
        <div className="border-border bg-card rounded-lg border p-5 shadow-sm">
          <h2 className="text-foreground mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <span className="bg-primary h-1 w-1 rounded-full" />
            概要
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {article.summary}
          </p>
        </div>
      )}

      {/* Detailed Summary Card */}
      {sections.length > 0 && (
        <div className="border-border bg-card rounded-lg border p-5 shadow-sm">
          <h2 className="text-foreground mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <span className="bg-primary h-1 w-1 rounded-full" />
            詳細
          </h2>
          <div className="space-y-3">
            {sections.map((section, i) => (
              <div key={i} className="text-sm">
                <h3 className="text-foreground mb-1 font-medium">
                  {section.icon && <span className="mr-1">{section.icon}</span>}
                  {section.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!article.summary && sections.length === 0 && (
        <div className="border-border bg-card rounded-lg border p-5 shadow-sm">
          <p className="text-muted-foreground text-sm italic">
            要約はありません
          </p>
        </div>
      )}
    </div>
  );
}
