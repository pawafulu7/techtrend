'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';

interface ChangeWithCategory extends DiffChange {
  category: string;
}

export function UpdatedRow({ change }: { change: ChangeWithCategory }) {
  return (
    <Link
      href={`/?tags=${encodeURIComponent(change.topic)}&tagMode=OR`}
      className="hover:bg-muted/50 group flex items-center gap-3 rounded px-3 py-2 transition-colors"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-slate-400" />
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
        className="border-slate-300 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-200 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
      >
        {change.topic}
      </Badge>
    </Link>
  );
}
