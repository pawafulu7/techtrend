'use client';

import Link from 'next/link';
import type { EvidenceArticleMap } from '@/lib/types/trend-ai-summary';

type TopArticle = {
  id: string;
  title: string;
  translatedTitle?: string | null;
  url: string;
  sourceName: string;
  viewCount: number;
  favoriteCount: number;
  score: number;
  tags: string[];
  thumbnail?: string | null;
};

interface KeyTopicArticleCardsProps {
  articleIds: string[];
  topArticlesById: Map<string, TopArticle>;
  evidenceArticles: EvidenceArticleMap;
}

export function KeyTopicArticleCards({
  articleIds,
  topArticlesById,
  evidenceArticles,
}: KeyTopicArticleCardsProps) {
  const resolved = [...new Set(articleIds)]
    .map((id) => {
      const topArticle = topArticlesById.get(id);
      if (topArticle)
        return {
          id: topArticle.id,
          title: topArticle.translatedTitle || topArticle.title,
          thumbnail: topArticle.thumbnail,
          sourceName: topArticle.sourceName,
          href: `/articles/${topArticle.id}?from=${encodeURIComponent('/trends/daily')}`,
        };
      const ev = evidenceArticles[id];
      if (ev)
        return {
          id,
          title: ev.translatedTitle || ev.title,
          thumbnail: ev.thumbnail,
          sourceName: ev.sourceName,
          href: `/articles/${id}?from=${encodeURIComponent('/trends/daily')}`,
        };
      return null;
    })
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .slice(0, 5);

  if (resolved.length === 0) return null;

  return (
    <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {resolved.map((a) => {
        const content = (
          <div className="bg-background/50 hover:bg-muted/50 w-[180px] flex-shrink-0 overflow-hidden rounded-lg border transition-colors">
            {a.thumbnail ? (
              <div className="bg-muted relative h-[100px] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- External URLs from arbitrary domains; next/image requires remotePatterns config */}
                <img
                  src={a.thumbnail}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div className="bg-muted absolute inset-0 hidden h-full w-full items-center justify-center">
                  <span className="text-muted-foreground text-xs">
                    {a.sourceName}
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-muted flex h-[100px] w-full items-center justify-center">
                <span className="text-muted-foreground text-xs">
                  {a.sourceName}
                </span>
              </div>
            )}
            <div className="p-2">
              <p className="line-clamp-2 text-xs leading-snug font-medium">
                {a.title}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {a.sourceName}
              </p>
            </div>
          </div>
        );

        return (
          <Link key={a.id} href={a.href} className="flex-shrink-0">
            {content}
          </Link>
        );
      })}
    </div>
  );
}

export type { TopArticle };
