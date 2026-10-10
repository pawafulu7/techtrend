'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { OptimizedImage } from '@/app/components/common/optimized-image';
import { hasValidThumbnail } from '@/lib/utils/article/thumbnail';
import type { EvidenceArticleMap } from '@/lib/types/trend-ai-summary';
import type { TopArticleInfo } from '@/lib/services/trend-report/types';

type TopArticle = TopArticleInfo;

function SourceNameBox({ sourceName }: { sourceName: string }) {
  return (
    <div className="bg-muted flex h-[100px] w-full items-center justify-center">
      <span className="text-muted-foreground text-xs">{sourceName}</span>
    </div>
  );
}

/** 180px 幅のサムネイル。読めなかった URL はソース名の枠に置き換える（URL が変われば読み直す） */
function KeyTopicThumbnail({
  src,
  sourceName,
}: {
  src: string;
  sourceName: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <SourceNameBox sourceName={sourceName} />;
  return (
    <div className="bg-muted relative h-[100px] w-full">
      <OptimizedImage
        src={src}
        alt=""
        fill
        sizes="180px"
        className="object-cover"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}

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
  const resolved = useMemo(
    () =>
      [...new Set(articleIds)]
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
        .slice(0, 5),
    [articleIds, topArticlesById, evidenceArticles]
  );

  if (resolved.length === 0) return null;

  return (
    <div className="-mx-1 flex scrollbar-thin gap-3 overflow-x-auto px-1 pb-1">
      {resolved.map((a) => {
        const content = (
          <div className="bg-background/50 hover:bg-muted/50 w-[180px] flex-shrink-0 overflow-hidden rounded-lg border transition-colors">
            {hasValidThumbnail(a.thumbnail) ? (
              <KeyTopicThumbnail src={a.thumbnail} sourceName={a.sourceName} />
            ) : (
              <SourceNameBox sourceName={a.sourceName} />
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
