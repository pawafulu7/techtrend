'use client';

import {
  ExternalLink,
  Newspaper,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { parseSummary } from '@/lib/utils/summary/summary-parser';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import type { ReaderDetailArticle } from './types';
import { formatDate } from './utils';

interface ArticleDetailProps {
  article: ReaderDetailArticle | null;
  isLoading: boolean;
  error: string | null;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}

const MAX_VISIBLE_TAGS = 5;

export function ReaderArticleDetail({
  article,
  isLoading,
  error,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: ArticleDetailProps) {
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-[var(--tt-color-negative)]" />
        <p className="text-sm text-[var(--tt-color-text-muted)]">{error}</p>
      </div>
    );
  }

  if (!article && !isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--tt-color-text-muted)]">
        <div className="text-center">
          <Newspaper className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p className="text-sm">記事を選択してください</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--tt-color-positive)] motion-reduce:animate-none" />
      </div>
    );
  }

  if (!article) return null;

  const displayTitle = article.translatedTitle || article.title;
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

  const dateStr = formatDate(article.publishedAt);

  return (
    <div className="h-full overflow-y-auto bg-[var(--tt-color-surface)]">
      <div className="w-full px-5 py-8">
        {/* Prev / Next navigation */}
        {(hasPrev || hasNext) && (
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onPrev?.()}
              disabled={!hasPrev}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[var(--tt-color-surface-hover)] px-4 py-2 text-sm font-medium text-[var(--tt-color-text)] transition-colors duration-150 hover:bg-[var(--tt-color-surface-hover)] hover:text-[var(--tt-color-text)] disabled:cursor-default disabled:opacity-30 motion-reduce:transition-none"
            >
              <ChevronLeft className="h-4 w-4" />
              前の記事
            </button>
            <button
              type="button"
              onClick={() => onNext?.()}
              disabled={!hasNext}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[var(--tt-color-surface-hover)] px-4 py-2 text-sm font-medium text-[var(--tt-color-text)] transition-colors duration-150 hover:bg-[var(--tt-color-surface-hover)] hover:text-[var(--tt-color-text)] disabled:cursor-default disabled:opacity-30 motion-reduce:transition-none"
            >
              次の記事
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Card */}
        <div className="rounded-2xl bg-[var(--tt-color-surface)] px-10 py-8 shadow-sm ring-1 ring-[var(--tt-color-border)]">
          {/* Meta: source badge + date */}
          <div className="flex items-center gap-3">
            {article.source?.name && (
              <span className="rounded-full bg-[var(--tt-color-positive-bg)] px-3 py-0.5 text-xs font-bold tracking-wide text-[var(--tt-color-positive)] uppercase">
                {article.source.name}
              </span>
            )}
            {dateStr && (
              <span className="rounded-full border border-[var(--tt-color-border)] px-3 py-0.5 text-xs text-[var(--tt-color-text-muted)]">
                {dateStr}
              </span>
            )}
            <FavoriteButton
              articleId={article.id}
              showText
              fetchInitialStatus
              outline
              size="sm"
              className="ml-auto rounded-full border border-[var(--tt-color-border)] px-3 py-1 text-xs font-medium text-[var(--tt-color-text-muted)] shadow-none"
            />
            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--tt-color-border)] px-3 py-1 text-xs font-medium text-[var(--tt-color-text-muted)] transition-colors duration-150 hover:bg-[var(--tt-color-surface-muted)] motion-reduce:transition-none"
              >
                <ExternalLink className="h-3 w-3" />
                元記事を読む
              </a>
            )}
          </div>

          {/* Title */}
          <h1
            className="mt-5 text-2xl leading-tight font-bold tracking-tight text-[var(--tt-color-text)]"
            aria-live="polite"
          >
            {displayTitle}
          </h1>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {article.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full bg-[var(--tt-color-surface-muted)] px-2 py-0.5 text-[11px] text-[var(--tt-color-text-muted)]"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Divider */}
          <hr className="mt-5 border-[var(--tt-color-border)]" />

          {/* Summary */}
          {article.summary && (
            <p className="mt-6 text-[15px] leading-[1.9] text-[var(--tt-color-text)]">
              {article.summary}
            </p>
          )}

          {/* Detailed sections */}
          {sections.length > 0 && (
            <div className="mt-8 space-y-5">
              {sections.map((section, i) => (
                <div
                  key={`section-${section.title ?? ''}-${i}`}
                  className="border-l-[3px] border-[var(--tt-color-positive-border)] py-1 pl-5"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tt-color-positive)]" />
                    <p className="text-sm font-semibold text-[var(--tt-color-text)]">
                      {section.title}
                    </p>
                  </div>
                  <p className="mt-2 pl-6 text-sm leading-[1.8] text-[var(--tt-color-text)]">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!article.summary && sections.length === 0 && (
            <p className="mt-6 text-sm text-[var(--tt-color-text-muted)] italic">
              要約はありません
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
