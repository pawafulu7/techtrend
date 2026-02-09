'use client';

import { Tag } from 'lucide-react';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import Link from 'next/link';

interface TagCloudProps {
  tags: { id: string; name: string; count: number }[];
}

export function TagCloud({ tags }: TagCloudProps) {
  if (tags.length === 0) {
    return (
      <div className="bg-background rounded-lg border p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4 text-(--tt-color-info)" />
          <h3 className="text-sm font-semibold">人気タグ</h3>
        </div>
        <p className="text-muted-foreground py-8 text-center text-sm">
          タグがありません
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...tags.map((t) => t.count));
  const minCount = Math.min(...tags.map((t) => t.count));

  const getTagVariant = (
    count: number
  ): 'default' | 'primary' | 'secondary' => {
    if (maxCount === minCount) return 'default';
    const ratio = (count - minCount) / (maxCount - minCount);
    if (ratio > 0.6) return 'primary';
    if (ratio > 0.3) return 'secondary';
    return 'default';
  };

  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Tag className="h-4 w-4 text-(--tt-color-info)" />
        <h3 className="text-sm font-semibold">人気タグ</h3>
        <span className="text-muted-foreground text-xs">TOP {tags.length}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <BadgeV2 key={tag.id} variant={getTagVariant(tag.count)} asChild>
            <Link href={`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`}>
              {tag.name}
              <span className="ml-1 opacity-70">{tag.count}</span>
            </Link>
          </BadgeV2>
        ))}
      </div>
    </div>
  );
}
