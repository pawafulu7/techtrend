'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui-v2/badge-v2';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import { ChangeWithCategory } from './diff-utils';

export function UpdatedRow({ change }: { change: ChangeWithCategory }) {
  return (
    <Link
      href={`/?tags=${encodeURIComponent(change.topic)}&tagMode=OR`}
      className="hover:bg-muted/50 group flex items-center gap-3 rounded px-3 py-2 transition-colors"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-[var(--tt-color-text-muted)]" />
      <span className="flex-1 truncate text-base font-medium">
        {change.topic}
      </span>
      <span className="text-muted-foreground hidden max-w-[200px] truncate text-sm sm:block">
        {change.category}
      </span>
      <ArrowUpRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export function DeprecatedBadge({ change }: { change: ChangeWithCategory }) {
  return (
    <Link href={`/?tags=${encodeURIComponent(change.topic)}&tagMode=OR`}>
      <Badge
        variant="outline"
        className="border-[var(--tt-color-border)] bg-[var(--tt-color-surface-muted)] px-3 py-1 text-sm font-medium text-[var(--tt-color-text)] transition-colors hover:border-[var(--tt-color-border)] hover:bg-[var(--tt-color-surface-hover)]"
      >
        {change.topic}
      </Badge>
    </Link>
  );
}
