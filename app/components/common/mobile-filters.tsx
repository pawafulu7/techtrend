'use client';

import { useState } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Filters } from './filters';
import { TagFilter } from './tag-filter';
import type { Source } from '@prisma/client';
import type { GroupedSources } from '@/lib/types/source-grouping';

interface MobileFiltersProps {
  sources: (Source & { _count: { articles: number } })[];
  groupedSources?: GroupedSources[];
  tags: { id: string; name: string; count: number }[];
  initialSourceIds?: string[];
  initialIsAuthenticated: boolean;
}

export function MobileFilters({
  sources,
  groupedSources,
  tags,
  initialSourceIds,
  initialIsAuthenticated,
}: MobileFiltersProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs sm:h-7 lg:hidden"
          data-testid="mobile-filter-trigger"
        >
          <Filter className="mr-1 h-3 w-3" />
          フィルター
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[300px] sm:w-[400px]"
        data-testid="mobile-filter-sheet"
      >
        <SheetHeader>
          <SheetTitle>フィルター</SheetTitle>
          <SheetDescription>ソースやタグで記事を絞り込む</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <Filters
            sources={sources}
            groupedSources={groupedSources}
            tags={tags}
            initialSourceIds={initialSourceIds}
            initialIsAuthenticated={initialIsAuthenticated}
          />
          {/* モバイル用TagFilter */}
          {tags.length > 0 && (
            <div className="bg-background/80 rounded-lg border p-3 shadow-sm backdrop-blur-sm">
              <TagFilter tags={tags} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
