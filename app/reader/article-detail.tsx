'use client';

import { useState } from 'react';
import {
  ExternalLink,
  Newspaper,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { parseSummary } from '@/lib/utils/summary-parser';
import type { ReaderDetailArticle } from './types';

interface ArticleDetailProps {
  article: ReaderDetailArticle | null;
  isLoading: boolean;
  error: string | null;
}

const MAX_VISIBLE_SECTIONS = 4;
const MAX_VISIBLE_TAGS = 5;

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${h}:${m}`;
  } catch {
    return '';
  }
}

export function ReaderArticleDetail({
  article,
  isLoading,
  error,
}: ArticleDetailProps) {
  const [showAllSections, setShowAllSections] = useState(false);
  const [heroError, setHeroError] = useState(false);

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

  const hasValidHero =
    !!article.thumbnail && /^https?:\/\//.test(article.thumbnail) && !heroError;
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

  const visibleSections = showAllSections
    ? sections
    : sections.slice(0, MAX_VISIBLE_SECTIONS);
  const hasMoreSections = sections.length > MAX_VISIBLE_SECTIONS;
  const remainingSections = sections.length - MAX_VISIBLE_SECTIONS;
  const dateStr = formatDate(article.publishedAt);

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-slate-900">
      {/* Hero thumbnail */}
      {hasValidHero && (
        <div className="relative aspect-[2/1] w-full overflow-hidden bg-slate-900">
          <img
            src={article.thumbnail!}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setHeroError(true)}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white dark:from-slate-900" />
        </div>
      )}
      <div className={`px-8 ${hasValidHero ? 'pt-4' : 'pt-6'} pb-6`}>
        {/* Title */}
        <h1 className="text-2xl leading-tight font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {displayTitle}
        </h1>

        {/* Meta: source + date + tags */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {article.source?.name && (
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
              {article.source.name}
            </span>
          )}
          {dateStr && <span className="text-xs text-slate-400">{dateStr}</span>}
          {article.tags &&
            article.tags.length > 0 &&
            article.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              >
                #{tag.name}
              </span>
            ))}
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-200 motion-reduce:transition-none dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ExternalLink className="h-3 w-3" />
              元記事を読む
            </a>
          )}
        </div>

        {/* Summary */}
        {article.summary && (
          <p className="mt-5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
            {article.summary}
          </p>
        )}

        {/* Detailed sections */}
        {visibleSections.length > 0 && (
          <div className="mt-6 space-y-4">
            {visibleSections.map((section, i) => (
              <div
                key={i}
                className="border-l-[3px] border-teal-400 py-1 pl-4 dark:border-teal-500"
              >
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {section.title}
                  </p>
                </div>
                <p className="mt-1.5 pl-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Fold toggle */}
        {hasMoreSections && !showAllSections && (
          <button
            type="button"
            onClick={() => setShowAllSections(true)}
            className="mt-4 cursor-pointer rounded-full bg-teal-50 px-4 py-1.5 text-xs font-medium text-teal-600 transition-colors duration-150 hover:bg-teal-100 motion-reduce:transition-none dark:bg-teal-900/20 dark:text-teal-400 dark:hover:bg-teal-900/40"
          >
            +{remainingSections}件の詳細を表示
          </button>
        )}
        {showAllSections && hasMoreSections && (
          <button
            type="button"
            onClick={() => setShowAllSections(false)}
            className="mt-4 cursor-pointer rounded-full bg-slate-100 px-4 py-1.5 text-xs font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-200 motion-reduce:transition-none dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            折りたたむ
          </button>
        )}

        {!article.summary && sections.length === 0 && !hasValidHero && (
          <p className="mt-4 text-sm text-slate-400 italic">要約はありません</p>
        )}
      </div>
    </div>
  );
}
