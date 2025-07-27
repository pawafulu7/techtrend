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
import type { Source, Tag } from '@prisma/client';

interface MobileFiltersProps {
  sources: (Source & { _count: { articles: number } })[];
  tags: { id: string; name: string; count: number }[];
}

export function MobileFilters({ sources, tags }: MobileFiltersProps) {
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
        <div className="mt-6">
          <Filters sources={sources} tags={tags} />
        </div>
      </SheetContent>
    </Sheet>
  );
}