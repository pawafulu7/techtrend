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
import { parseSummary } from '@/lib/utils/summary-parser';
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
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    );
  }

  if (!article && !isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
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
        <Loader2 className="h-6 w-6 animate-spin text-teal-500 motion-reduce:animate-none" />
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
    <div className="h-full overflow-y-auto bg-slate-900">
      <div className="mx-auto max-w-5xl px-5 py-8">
        {/* Prev / Next navigation */}
        {(hasPrev || hasNext) && (
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors duration-150 hover:bg-slate-600 hover:text-white disabled:cursor-default disabled:opacity-30 motion-reduce:transition-none"
            >
              <ChevronLeft className="h-4 w-4" />
              前の記事
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors duration-150 hover:bg-slate-600 hover:text-white disabled:cursor-default disabled:opacity-30 motion-reduce:transition-none"
            >
              次の記事
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Card */}
        <div className="rounded-2xl bg-white px-10 py-8 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
          {/* Meta: source badge + date */}
          <div className="flex items-center gap-3">
            {article.source?.name && (
              <span className="rounded-full bg-lime-400/80 px-3 py-0.5 text-xs font-bold tracking-wide text-lime-900 uppercase">
                {article.source.name}
              </span>
            )}
            {dateStr && (
              <span className="rounded-full border border-slate-200 px-3 py-0.5 text-xs text-slate-400 dark:border-slate-700">
                {dateStr}
              </span>
            )}
            {safeUrl && (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-50 motion-reduce:transition-none dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ExternalLink className="h-3 w-3" />
                元記事を読む
              </a>
            )}
          </div>

          {/* Title */}
          <h1 className="mt-5 text-2xl leading-tight font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {displayTitle}
          </h1>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {article.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Divider */}
          <hr className="mt-5 border-slate-100 dark:border-slate-800" />

          {/* Summary */}
          {article.summary && (
            <p className="mt-6 text-[15px] leading-[1.9] text-slate-800 dark:text-slate-200">
              {article.summary}
            </p>
          )}

          {/* Detailed sections */}
          {sections.length > 0 && (
            <div className="mt-8 space-y-5">
              {sections.map((section, i) => (
                <div
                  key={i}
                  className="border-l-[3px] border-lime-400 py-1 pl-5 dark:border-lime-500"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lime-500" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {section.title}
                    </p>
                  </div>
                  <p className="mt-2 pl-6 text-sm leading-[1.8] text-slate-700 dark:text-slate-300">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!article.summary && sections.length === 0 && (
            <p className="mt-6 text-sm text-slate-400 italic">
              要約はありません
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
