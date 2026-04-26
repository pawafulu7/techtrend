'use client';

import { useRouter } from 'next/navigation';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';

interface ArticleCardTagsProps {
  tags: Array<{ id: string; name: string }>;
  onTagClick?: (tagName: string) => void;
  maxVisible?: number;
}

export function ArticleCardTags({
  tags,
  onTagClick,
  maxVisible = 2,
}: ArticleCardTagsProps) {
  const router = useRouter();

  if (!tags || tags.length === 0) {
    return null;
  }

  const visibleTags = tags.slice(0, maxVisible);
  const remainingCount = tags.length - visibleTags.length;

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1">
      {visibleTags.map((tag) => (
        <BadgeV2
          key={tag.id}
          data-testid="tag-item"
          variant="outline"
          className="cursor-pointer text-xs"
          onClick={(e) => {
            e.stopPropagation();
            if (onTagClick) {
              onTagClick(tag.name);
            } else {
              router.push(`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`);
            }
          }}
        >
          {tag.name}
        </BadgeV2>
      ))}
      {remainingCount > 0 && (
        <span className="text-muted-foreground text-xs">+{remainingCount}</span>
      )}
    </div>
  );
}
