'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter } from 'lucide-react';
import { TagFilter } from './tag-filter';

interface FiltersProps {
  sources: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; count: number }>;
}

export function Filters({ sources, tags }: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSource = searchParams.get('sourceId');
  const currentTag = searchParams.get('tag');

  const handleSourceFilter = (sourceId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sourceId) {
      params.set('sourceId', sourceId);
    } else {
      params.delete('sourceId');
    }
    params.set('page', '1'); // Reset to first page
    router.push(`/?${params.toString()}`);
  };

  const handleTagFilter = (tagName: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tagName) {
      params.set('tag', tagName);
    } else {
      params.delete('tag');
    }
    params.set('page', '1'); // Reset to first page
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      {/* Source Filter */}
      <div className="bg-background/80 backdrop-blur-sm rounded-lg p-3 border border-border/50">
        <h3 className="text-xs font-semibold mb-2">ソース</h3>
        <div className="flex flex-col gap-1">
          <Button
            variant={!currentSource ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSourceFilter(null)}
            className="h-7 text-xs justify-start"
          >
            すべて
          </Button>
          {sources.map((source) => (
            <Button
              key={source.id}
              variant={currentSource === source.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSourceFilter(source.id)}
              className="h-7 text-xs justify-start"
            >
              {source.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Tag Filter */}
      {tags.length > 0 && (
        <div className="bg-background/80 backdrop-blur-sm border border-border/50 rounded-lg p-3">
          <TagFilter tags={tags} />
        </div>
      )}
    </div>
  );
}