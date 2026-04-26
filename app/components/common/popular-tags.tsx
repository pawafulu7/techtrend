'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui-v2/badge-v2';
import { TrendingUp, Tag as TagIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PopularTagsProps {
  tags: Array<{
    id: string;
    name: string;
    count: number;
  }>;
  currentTag?: string;
}

export function PopularTags({ tags, currentTag }: PopularTagsProps) {
  const router = useRouter();

  const handleTagClick = (tagName: string) => {
    if (currentTag === tagName) {
      router.push('/');
    } else {
      router.push(`/?tags=${encodeURIComponent(tagName)}&tagMode=OR`);
    }
  };

  return (
    <div className="w-full overflow-hidden border-b bg-[var(--tt-color-surface-muted)]">
      <div className="px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4" />
            <span>人気のタグ</span>
          </div>

          <div className="scrollbar-hide flex-1 overflow-x-auto">
            <div className="flex gap-2 pb-1">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  data-testid="tag-item"
                  variant={currentTag === tag.name ? 'default' : 'secondary'}
                  className={cn(
                    'cursor-pointer whitespace-nowrap transition-all',
                    'hover:scale-105 hover:shadow-sm',
                    currentTag === tag.name
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-primary/10'
                  )}
                  onClick={() => handleTagClick(tag.name)}
                >
                  <TagIcon className="mr-1 h-3 w-3" />
                  {tag.name}
                  <span className="ml-1 text-xs opacity-70">({tag.count})</span>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
