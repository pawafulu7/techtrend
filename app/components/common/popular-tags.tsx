'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
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
      router.push(`/?tag=${encodeURIComponent(tagName)}`);
    }
  };

  return (
    <div className="w-full overflow-hidden bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 border-b">
      <div className="px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>人気のタグ</span>
          </div>
          
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 pb-1">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={currentTag === tag.name ? "default" : "secondary"}
                  className={cn(
                    "cursor-pointer transition-all whitespace-nowrap",
                    "hover:scale-105 hover:shadow-sm",
                    currentTag === tag.name 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-primary/10"
                  )}
                  onClick={() => handleTagClick(tag.name)}
                >
                  <TagIcon className="h-3 w-3 mr-1" />
                  {tag.name}
                  <span className="ml-1 text-xs opacity-70">
                    ({tag.count})
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}