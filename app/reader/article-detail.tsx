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
        articleType: article.articleType as any,
        summaryVersion: article.summaryVersion ?? undefined,
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      {showThumbnail && (
        <div className="bg-muted mb-4 max-h-[240px] w-full overflow-hidden rounded-lg">
          <img
            src={article.thumbnail!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setThumbnailError(true)}
          />
        </div>
      )}

      <h1 className="text-foreground mb-3 text-xl leading-relaxed font-bold">
        {displayTitle}
      </h1>

      <div className="text-muted-foreground mb-4 flex items-center gap-3 text-sm">
        {article.source?.name && (
          <span className="text-foreground/80 font-medium">
            {article.source.name}
          </span>
        )}
        <RelativeTime date={article.publishedAt} />
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 inline-flex cursor-pointer items-center gap-1"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>元記事</span>
        </a>
      </div>

      {article.tags && article.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {article.tags.slice(0, 5).map((tag) => (
            <span
              key={tag.id}
              className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <hr className="border-border mb-4" />

      {article.summary && (
        <div className="mb-4">
          <h2 className="text-foreground/80 mb-1 text-sm font-semibold">
            概要
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {article.summary}
          </p>
        </div>
      )}

      {sections.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-foreground/80 text-sm font-semibold">詳細</h2>
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
      )}

      {!article.summary && sections.length === 0 && (
        <p className="text-muted-foreground text-sm italic">要約はありません</p>
      )}
    </div>
  );
}
