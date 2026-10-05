'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateWithTime } from '@/lib/utils/date';
import { FavoriteButton } from '@/app/components/article/favorite-button';
import { useReadStatus } from '@/app/components/article/hooks/use-read-status';

interface StoryArticle {
  id: string;
  title: string;
  translatedTitle: string | null;
  publishedAt: string;
  source: { id: string; name: string };
  isFavorited?: boolean;
  isRead?: boolean;
}

async function fetchStoryArticles(storyId: string): Promise<StoryArticle[]> {
  const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch story: ${response.status}`);
  }
  const json = await response.json();
  return json.data.items as StoryArticle[];
}

interface StoryMembersProps {
  storyId: string;
  /** ストーリー全体の記事数（一覧に出している記事を含む） */
  storySize: number;
  /** 一覧に出している記事（展開した行からは除く） */
  shownArticleId: string;
  onArticleClick?: (articleId?: string) => void;
}

/**
 * 代表の記事の下に付く「ほか N 件」。開くと同じストーリーの記事を1行ずつ並べる（issue #723）
 */
export function StoryMembers({
  storyId,
  storySize,
  shownArticleId,
  onArticleClick,
}: StoryMembersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['story-articles', storyId],
    queryFn: () => fetchStoryArticles(storyId),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  // 戻り先は今の一覧（card.tsx と同じ）
  const returnUrl = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('returning', '1');
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const others = (data ?? []).filter((a) => a.id !== shownArticleId);
  const otherCount = Math.max(storySize - 1, 0);

  return (
    <div
      className="border-border -mt-px rounded-b-lg border border-t-0 bg-[var(--tt-color-surface-muted)]"
      data-testid="story-members"
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="text-muted-foreground hover:text-foreground flex min-h-[40px] w-full items-center justify-between gap-2 rounded-b-lg px-4 text-xs font-medium focus-visible:ring-2 focus-visible:ring-[var(--tt-color-primary)] focus-visible:outline-none"
        data-testid="story-members-toggle"
      >
        <span>同じ話題の記事 ほか {otherCount} 件</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 motion-safe:transition-transform',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div id={panelId} className="border-border border-t px-4 pb-2">
          {isPending ? (
            <p className="text-muted-foreground py-3 text-xs" role="status">
              読み込んでいます…
            </p>
          ) : isError ? (
            <div className="flex items-center justify-between gap-2 py-3 text-xs">
              <span className="text-muted-foreground" role="alert">
                同じ話題の記事を読み込めませんでした
              </span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-foreground font-medium underline underline-offset-2"
              >
                再試行
              </button>
            </div>
          ) : others.length === 0 ? (
            <p className="text-muted-foreground py-3 text-xs">
              ほかの記事は見つかりませんでした
            </p>
          ) : (
            <ul
              className="divide-border divide-y"
              data-testid="story-members-list"
            >
              {others.map((article) => (
                <StoryMemberRow
                  key={article.id}
                  article={article}
                  href={`/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`}
                  onClick={() => onArticleClick?.(shownArticleId)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StoryMemberRow({
  article,
  href,
  onClick,
}: {
  article: StoryArticle;
  href: string;
  onClick: () => void;
}) {
  // 未ログインは既読の情報が無いので、未読の印を出さない（一覧のカードと同じ扱い）
  const isRead = useReadStatus(article.id, article.isRead ?? true);
  const title = article.translatedTitle || article.title;

  return (
    <li
      className="flex items-start gap-2 py-2"
      data-testid="story-member"
      data-story-member-id={article.id}
    >
      <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
        {!isRead && (
          <span
            className="h-2 w-2 rounded-full bg-[var(--tt-color-primary)]"
            role="img"
            aria-label="未読"
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          prefetch={false}
          onClick={onClick}
          className={cn(
            'text-foreground line-clamp-2 text-sm leading-snug hover:underline',
            isRead && 'opacity-70'
          )}
          title={title}
        >
          {title}
        </Link>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 text-xs">
          <span>{article.source.name}</span>
          <span>{formatDateWithTime(article.publishedAt)}</span>
        </p>
      </div>
      <FavoriteButton
        articleId={article.id}
        isFavorited={article.isFavorited ?? false}
        className="-my-1 h-9 min-h-[44px] w-9 min-w-[44px] shrink-0"
      />
    </li>
  );
}
