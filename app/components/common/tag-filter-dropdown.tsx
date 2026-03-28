'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui-v2/button-v2';
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
  const router = useRouter();
  const pathname = usePathname();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // URLからタグを読み込み
  useEffect(() => {
    const tagParam = searchParams.get('tags');
    if (tagParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync from URL params
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
            'relative h-8 px-3 text-sm',
            selectedTags.length > 0 && 'border-primary'
          )}
          data-testid="tag-filter-button"
        >
          <TagIcon className="lucide-tag mr-2 h-4 w-4" />
          <span className="hidden sm:inline">タグ</span>

          {/* 選択中タグ数のバッジ */}
          {selectedTags.length > 0 && (
            <Badge variant="default" className="ml-2 h-5 px-1.5 text-xs">
              {selectedTags.length}
            </Badge>
          )}

          <ChevronDown className="ml-2 h-3 w-3" />
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
          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-medium">
                選択中のタグ
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    await fetch('/api/filter-preferences', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tags: undefined,
                        tagMode: undefined,
                      }),
                    });
                  } catch {}
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete('tags');
                  params.delete('tagMode');
                  params.delete('page');
                  const qs = params.toString();
                  router.replace(qs ? `${pathname}?${qs}` : pathname);
                }}
                className="h-6 px-2 text-xs"
              >
                <X className="mr-1 h-3 w-3" />
                クリア
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {previewTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {remainingCount > 0 && (
                <Badge variant="outline" className="text-xs">
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
