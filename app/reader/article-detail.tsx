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

  return (
    <div className="h-full overflow-y-auto">
      {/* Content area - constrained width for readability */}
      <div className="max-w-2xl px-6 py-4 lg:px-10">
        {/* Title */}
        <h1 className="text-foreground text-lg leading-snug font-bold">
          {displayTitle}
        </h1>

        {/* Meta: source + date */}
        <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
          {article.source?.name && (
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
              {article.source.name}
            </span>
          )}
          <RelativeTime date={article.publishedAt} />
          {article.tags &&
            article.tags.length > 0 &&
            article.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
              <span
                key={tag.id}
                className="border-border text-muted-foreground rounded-full border px-1.5 py-0 text-[10px]"
              >
                {tag.name}
              </span>
            ))}
        </div>

        {/* 元記事リンク */}
        {safeUrl && (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 mt-3 inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            元記事を読む
          </a>
        )}

        {/* Summary */}
        {article.summary && (
          <p className="text-foreground mt-4 text-sm leading-relaxed">
            {article.summary}
          </p>
        )}

        {/* Divider */}
        {sections.length > 0 && <div className="bg-border my-4 h-px" />}

        {/* Detailed sections - title above, content below */}
        {visibleSections.length > 0 && (
          <div className="space-y-3">
            {visibleSections.map((section, i) => (
              <div key={i}>
                <p className="text-foreground text-sm font-medium">
                  {section.icon && <span className="mr-1">{section.icon}</span>}
                  {section.title}
                </p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
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
            className="text-primary hover:text-primary/80 mt-3 cursor-pointer text-xs font-medium transition-colors duration-150 motion-reduce:transition-none"
          >
            +{remainingSections}件の詳細を表示
          </button>
        )}
        {showAllSections && hasMoreSections && (
          <button
            type="button"
            onClick={() => setShowAllSections(false)}
            className="text-primary hover:text-primary/80 mt-3 cursor-pointer text-xs font-medium transition-colors duration-150 motion-reduce:transition-none"
          >
            折りたたむ
          </button>
        )}

        {!article.summary && sections.length === 0 && (
          <p className="text-muted-foreground mt-3 text-sm italic">
            要約はありません
          </p>
        )}
      </div>
    </div>
  );
}
