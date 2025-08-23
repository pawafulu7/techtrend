'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tag as TagIcon, ChevronDown, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TagFilter } from './tag-filter';
import { cn } from '@/lib/utils';

interface TagFilterDropdownProps {
  tags: Array<{
    id: string;
    name: string;
    count: number;
    category?: string | null;
  }>;
}

export function TagFilterDropdown({ tags }: TagFilterDropdownProps) {
  const searchParams = useSearchParams();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // URLからタグを読み込み
  useEffect(() => {
    const tagParam = searchParams.get('tags');
    if (tagParam) {
      setSelectedTags(tagParam.split(','));
    } else {
      setSelectedTags([]);
    }
  }, [searchParams]);

  // 選択中のタグの最初の3つを取得（プレビュー用）
  const previewTags = selectedTags.slice(0, 3);
  const remainingCount = selectedTags.length - 3;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 px-3 text-sm relative",
            selectedTags.length > 0 && "border-primary"
          )}
          data-testid="tag-filter-button"
        >
          <TagIcon className="h-4 w-4 mr-2 lucide-tag" />
          <span className="hidden sm:inline">タグ</span>
          
          {/* 選択中タグ数のバッジ */}
          {selectedTags.length > 0 && (
            <Badge 
              variant="default" 
              className="ml-2 h-5 px-1.5 text-xs"
            >
              {selectedTags.length}
            </Badge>
          )}
          
          <ChevronDown className="h-3 w-3 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="end" 
        className="w-[320px] p-0"
        sideOffset={5}
        data-testid="tag-dropdown"
      >
        {/* 選択中タグのプレビュー */}
        {selectedTags.length > 0 && (
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                選択中のタグ
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async (e) => {
                  e.preventDefault();
                  // URLパラメータをクリア
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete('tags');
                  params.delete('tagMode');
                  params.delete('page');
                  window.location.href = `/?${params.toString()}`;
                  
                  // Clear tags from filter preferences cookie
                  try {
                    await fetch('/api/filter-preferences', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tags: undefined, tagMode: undefined }),
                    });
                  } catch (error) {
                    console.error('Failed to update filter preferences:', error);
                  }
                }}
                className="h-6 text-xs px-2"
              >
                <X className="h-3 w-3 mr-1" />
                クリア
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {previewTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs"
                >
                  {tag}
                </Badge>
              ))}
              {remainingCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-xs"
                >
                  +{remainingCount}
                </Badge>
              )}
            </div>
          </div>
        )}
        
        {/* TagFilterコンポーネントをドロップダウン内に配置 */}
        <div className="p-3">
          <TagFilter tags={tags} />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}