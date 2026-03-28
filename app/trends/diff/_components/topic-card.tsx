'use client';

import Link from 'next/link';
import { Sparkles, Zap, ArrowUpRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';

interface ArticleInfo {
  id: string;
  title: string;
}

interface ChangeWithCategory extends DiffChange {
  category: string;
}

interface HotTopicChipProps {
  change: ChangeWithCategory;
  variant: 'new' | 'trending';
  articles: Record<string, ArticleInfo>;
  hoveredTopic: string | null;
  onMouseEnter: (key: string) => void;
  onMouseLeave: () => void;
}

export function HotTopicChip({
  change,
  variant,
  articles,
  hoveredTopic,
  onMouseEnter,
  onMouseLeave,
}: HotTopicChipProps) {
  const isNew = variant === 'new';
  const topicKey = `${variant}-${change.topic}`;
  const relatedArticles = (change.relatedArticleIds || [])
    .slice(0, 2)
    .map((id) => articles[id])
    .filter(Boolean);
  const isHovered = hoveredTopic === topicKey;

  return (
    <div
      className={cn(
        'group relative rounded-lg transition-all duration-200',
        'bg-background border shadow-sm',
        isNew
          ? 'border-l-4 border-l-amber-500 hover:border-amber-300'
          : 'border-l-4 border-l-sky-500 hover:border-sky-300',
        'hover:-translate-y-0.5 hover:shadow-md'
      )}
      onMouseEnter={() => onMouseEnter(topicKey)}
      onMouseLeave={onMouseLeave}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {isNew ? (
              <Sparkles className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
            ) : (
              <Zap className="h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400" />
            )}
            <span
              className={cn(
                'text-xs font-bold',
                isNew
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-sky-600 dark:text-sky-400'
              )}
            >
              {isNew ? '新規' : '急上昇'}
            </span>
          </div>
          <span className="text-muted-foreground text-xs">
            {change.category}
          </span>
        </div>

        {/* Topic name */}
        <Link
          href={`/?tags=${encodeURIComponent(change.topic)}&tagMode=OR`}
          className="group/link block"
        >
          <h3 className="text-foreground text-lg leading-snug font-semibold decoration-1 underline-offset-2 group-hover/link:underline">
            {change.topic}
          </h3>
        </Link>

        {/* Description */}
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          {change.description}
        </p>

        {/* Related articles on hover */}
        {isHovered && relatedArticles.length > 0 && (
          <div className="animate-in fade-in mt-2 space-y-1 border-t border-current/10 pt-2 duration-150">
            {relatedArticles.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
              >
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{article.title}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick action */}
      <Link
        href={`/?tags=${encodeURIComponent(change.topic)}&tagMode=OR`}
        className={cn(
          'absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100',
          isNew
            ? 'text-amber-600 hover:bg-amber-100'
            : 'text-sky-600 hover:bg-sky-100'
        )}
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
