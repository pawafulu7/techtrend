'use client';

import { useState } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { Source, Tag } from '@prisma/client';

interface MobileFiltersProps {
  sources: (Source & { _count: { articles: number } })[];
  tags: { id: string; name: string; count: number }[];
  initialSourceIds?: string[];
}

export function MobileFilters({ sources, tags, initialSourceIds }: MobileFiltersProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden h-6 sm:h-7 px-2 text-xs"
        >
          <Filter className="h-3 w-3 mr-1" />
          フィルター
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>フィルター</SheetTitle>
          <SheetDescription>
            ソースやタグで記事を絞り込む
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <Filters sources={sources} tags={tags} initialSourceIds={initialSourceIds} />
          {/* モバイル用TagFilter */}
          {tags.length > 0 && (
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-white/20 shadow-sm rounded-lg p-3">
              <TagFilter tags={tags} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}