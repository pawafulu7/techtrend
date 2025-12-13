'use client';

import { Calendar, Download } from 'lucide-react';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { formatDateWithTime } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import { ShareButton } from '@/app/components/article/share-button';

interface ArticleCardHeaderProps {
  article: {
    id: string;
    title: string;
    url: string;
    publishedAt: Date | string;
    createdAt: Date | string;
    companyName?: string | null;
    source?: {
      name: string;
    } | null;
  };
  isNew: boolean;
  isRead: boolean;
  showSource: boolean;
  sourceColor: {
    tag: string;
    border: string;
    hover: string;
    dot: string;
  } | null;
}

export function ArticleCardHeader({
  article,
  isNew,
  isRead,
  showSource,
  sourceColor,
}: ArticleCardHeaderProps) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {isNew && (
            <BadgeV2
              variant="primary"
              className="text-xs shadow-[0_0_12px_rgba(22,163,74,0.4)] dark:shadow-[0_0_12px_rgba(34,197,94,0.4)]"
              aria-label="24時間以内の新着記事"
            >
              NEW
            </BadgeV2>
          )}
          {!isRead && (
            <BadgeV2
              variant="secondary"
              className="text-xs"
              data-testid="unread-badge"
            >
              未読
            </BadgeV2>
          )}
          {showSource && article.source && sourceColor && (
            <BadgeV2
              variant="outline"
              className={cn(
                "text-xs flex items-center gap-1.5",
                sourceColor.tag,
                sourceColor.border,
                sourceColor.hover
              )}
              data-testid="article-source"
            >
              <span className={cn("w-2 h-2 rounded-full shrink-0", sourceColor.dot)} aria-hidden="true" />
              {article.companyName ?? article.source.name}
            </BadgeV2>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDateWithTime(article.publishedAt)}</span>
          </span>
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            <span>{formatDateWithTime(article.createdAt)}</span>
          </span>
        </div>
      </div>
      <ShareButton title={article.title} url={article.url} size="sm" variant="ghost" />
    </div>
  );
}
