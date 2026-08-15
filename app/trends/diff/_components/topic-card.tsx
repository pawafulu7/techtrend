'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { Sparkles, Zap, ArrowUpRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArticleInfo, ChangeWithCategory } from './diff-utils';

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
  const relatedArticles = useMemo(
    () =>
      (change.relatedArticleIds || [])
        .slice(0, 2)
        .map((id) => articles[id])
        .filter(Boolean),
    [articles, change.relatedArticleIds]
  );
  const isHovered = hoveredTopic === topicKey;
  // hover だけが展開手段だと、キーボード利用者とタッチ端末から関連記事に到達できない。
  // 明示的な開閉ボタンを併設し、hover はマウス利用者向けの補助として残す。
  const [isExpanded, setIsExpanded] = useState(false);
  // hover で開いたパネルをボタンで閉じられるようにする。ポインタが乗っている間は
  // isHovered が true のままなので、この「今回の hover では閉じた」フラグがないと
  // ボタンを押しても閉じられず aria-expanded も true のままになる
  const [hoverDismissed, setHoverDismissed] = useState(false);
  const relatedPanelId = useId();
  const showRelated =
    relatedArticles.length > 0 &&
    (isExpanded || (isHovered && !hoverDismissed));

  return (
    <div
      className={cn(
        'group relative rounded-lg transition-all duration-200',
        'bg-background border shadow-sm',
        isNew
          ? 'border-l-4 border-l-[var(--tt-color-warning)] hover:border-[var(--tt-color-warning-border)]'
          : 'border-l-4 border-l-[var(--tt-color-info)] hover:border-[var(--tt-color-info-border)]',
        'hover:-translate-y-0.5 hover:shadow-md'
      )}
      onMouseEnter={() => {
        setHoverDismissed(false);
        onMouseEnter(topicKey);
      }}
      onMouseLeave={onMouseLeave}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {isNew ? (
              <Sparkles className="h-4 w-4 shrink-0 text-[var(--tt-color-warning)]" />
            ) : (
              <Zap className="h-4 w-4 shrink-0 text-[var(--tt-color-info)]" />
            )}
            <span
              className={cn(
                'text-xs font-bold',
                isNew
                  ? 'text-[var(--tt-color-warning)]'
                  : 'text-[var(--tt-color-info)]'
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

        {/* Related articles: hover か開閉ボタンで展開 */}
        {relatedArticles.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (showRelated) {
                setIsExpanded(false);
                setHoverDismissed(true);
                return;
              }
              setHoverDismissed(false);
              setIsExpanded(true);
            }}
            aria-expanded={showRelated}
            aria-controls={relatedPanelId}
            data-testid="topic-related-toggle"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-primary mt-2 inline-flex items-center gap-1 rounded text-xs underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            関連記事 {relatedArticles.length} 件
          </button>
        )}
        {showRelated && (
          <div
            id={relatedPanelId}
            className="animate-in fade-in mt-2 space-y-1 border-t border-current/10 pt-2 duration-150"
          >
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
        aria-label={`${change.topic} の記事を一覧で見る`}
        className={cn(
          // focus-visible を足さないとキーボード到達時に不可視のままになる
          'absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
          isNew
            ? 'text-[var(--tt-color-warning)] hover:bg-[var(--tt-color-warning-bg)]'
            : 'text-[var(--tt-color-info)] hover:bg-[var(--tt-color-info-bg)]'
        )}
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
