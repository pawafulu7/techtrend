'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink, Calendar } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { formatDateWithTime } from '@/lib/utils/date';
import type { DigestArticle } from '@/lib/services/digest-service';

interface DigestArticleCardProps {
  article: DigestArticle;
}

export function DigestArticleCard({ article }: DigestArticleCardProps) {
  const router = useRouter();

  const safeUrl = (() => {
    try {
      const parsed = new URL(article.url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        ? article.url
        : null;
    } catch {
      return null;
    }
  })();

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button, [role="button"]')) {
      return;
    }
    const returnUrl = encodeURIComponent('/digest');
    router.push(`/articles/${article.articleId}?from=${returnUrl}`);
  };

  return (
    <CardV2
      className="group cursor-pointer transition-shadow hover:shadow-md"
      onClick={handleClick}
    >
      <div className="space-y-2 p-3">
        {/* Recommendation Reason Badge */}
        <BadgeV2 variant="secondary" className="text-xs">
          {article.recommendationReason}
        </BadgeV2>

        {/* Title */}
        <h3 className="text-foreground group-hover:text-primary line-clamp-2 text-sm leading-snug font-medium transition-colors">
          {article.title}
        </h3>

        {/* Summary (if available) */}
        {article.summary && (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {article.summary}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span className="text-xs">
              {formatDateWithTime(article.publishedAt)}
            </span>
          </div>

          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
              aria-label="元記事を開く"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </CardV2>
  );
}
