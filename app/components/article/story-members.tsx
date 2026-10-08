'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateWithTime } from '@/lib/utils/date';
import { authClient } from '@/lib/auth/auth-client';
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

interface StoryArticlesResult {
  items: StoryArticle[];
  total: number;
}

async function fetchStoryArticles(
  storyId: string,
  signal: AbortSignal
): Promise<StoryArticlesResult> {
  const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}`, {
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch story: ${response.status}`);
  }
  const json = await response.json();
  const items = json?.data?.items;
  if (!Array.isArray(items)) {
    throw new Error('Unexpected story response');
  }
  return {
    items: items as StoryArticle[],
    total: typeof json.data.total === 'number' ? json.data.total : items.length,
  };
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
        aria-controls={isOpen ? panelId : undefined}
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
        <StoryMembersPanel
          id={panelId}
          storyId={storyId}
          shownArticleId={shownArticleId}
          onArticleClick={onArticleClick}
        />
      )}
    </div>
  );
}

/**
 * 開いている間だけ取得する。閉じたら捨てて、開くたびに取り直す（既読・お気に入りの状態を
 * 開いた時点のものにするため。キャッシュを残すと、記事を読んで戻った後や、パネルで
 * お気に入りを切り替えて開き直した後に古い状態が出る）
 */
function StoryMembersPanel({
  id,
  storyId,
  shownArticleId,
  onArticleClick,
}: {
  id: string;
  storyId: string;
  shownArticleId: string;
  onArticleClick?: (articleId?: string) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  const { data, isPending, isError, refetch } = useQuery({
    // 既読・お気に入りはユーザーごとなので、ユーザーをキーに含める
    queryKey: ['story-articles', storyId, userId],
    queryFn: ({ signal }) => fetchStoryArticles(storyId, signal),
    staleTime: 0,
    gcTime: 0,
  });

  // 一覧の「すべて既読」（use-read-status.ts の articles-bulk-read）を開いている行にも反映する
  const [bulkRead, setBulkRead] = useState(false);
  useEffect(() => {
    const handleBulkRead = (event: Event) => {
      if ((event as CustomEvent<{ isRead: boolean }>).detail?.isRead) {
        setBulkRead(true);
      }
    };
    window.addEventListener('articles-bulk-read', handleBulkRead);
    return () =>
      window.removeEventListener('articles-bulk-read', handleBulkRead);
  }, []);

  // 戻り先は今の一覧（card.tsx と同じ）
  const returnUrl = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('returning', '1');
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const others = (data?.items ?? []).filter((a) => a.id !== shownArticleId);
  const omitted = data ? data.total - data.items.length : 0;

  return (
    <div id={id} className="border-border border-t px-4 pb-2">
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
        <>
          <ul
            className="divide-border divide-y"
            data-testid="story-members-list"
          >
            {others.map((article) => (
              <StoryMemberRow
                key={article.id}
                article={article}
                forceRead={bulkRead}
                href={`/articles/${article.id}?from=${encodeURIComponent(returnUrl)}`}
                onClick={() => onArticleClick?.(shownArticleId)}
              />
            ))}
          </ul>
          {omitted > 0 && (
            <p className="text-muted-foreground pt-1 text-xs">
              残りの {omitted} 件は表示していません
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StoryMemberRow({
  article,
  forceRead,
  href,
  onClick,
}: {
  article: StoryArticle;
  forceRead: boolean;
  href: string;
  onClick: () => void;
}) {
  // 未ログインは既読の情報が無いので、未読の印を出さない（一覧のカードと同じ扱い）
  const isRead = useReadStatus(article.id, article.isRead ?? true) || forceRead;
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
