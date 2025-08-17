'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag as TagIcon, Search, X, ChevronRight, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { TAG_CATEGORIES, getCategoryInfo } from '@/lib/constants/tag-categories';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useDebounce } from '@/lib/hooks/use-debounce';

interface TagFilterProps {
  tags: Array<{
    id: string;
    name: string;
    count: number;
    category?: string | null;
  }>;
}

export function TagFilter({ tags: initialTags }: TagFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof initialTags>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filterMode, setFilterMode] = useState<'OR' | 'AND'>('OR');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // URLからタグを読み込み
  useEffect(() => {
    const tagParam = searchParams.get('tags');
    const modeParam = searchParams.get('tagMode') as 'OR' | 'AND' | null;
    
    if (tagParam) {
      setSelectedTags(tagParam.split(','));
    } else {
      setSelectedTags([]);
    }
    
    if (modeParam) {
      setFilterMode(modeParam);
    }
  }, [searchParams]);

  // 検索API呼び出し
  useEffect(() => {
    const searchTags = async () => {
      if (!debouncedSearchQuery) {
        setSearchResults([]);
        return;
      }
      
      console.log('[TagFilter] Searching for:', debouncedSearchQuery);
      
      setIsSearching(true);
      try {
        const response = await fetch(`/api/tags/search?q=${encodeURIComponent(debouncedSearchQuery)}`);
        
        // レスポンスステータスをチェック
        if (!response.ok) {
          console.error('Tag search failed with status:', response.status);
          setSearchResults([]);
          return;
        }
        
        // レスポンスボディが空でないことを確認
        const text = await response.text();
        if (!text) {
          console.error('Empty response from tag search API');
          setSearchResults([]);
          return;
        }
        
        // JSONとしてパース
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          console.error('Failed to parse JSON response:', text);
          setSearchResults([]);
          return;
        }
        
        // データが配列かチェック
        if (Array.isArray(data)) {
          setSearchResults(data);
        } else {
          console.error('Invalid response format:', data);
          setSearchResults([]);
        }
      } catch (error) {
        console.error('Tag search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };
    
    searchTags();
  }, [debouncedSearchQuery]);

  // 表示するタグ: 検索中は検索結果、それ以外は初期タグ
  const displayTags = searchQuery ? searchResults : initialTags;
  
  // フィルタリングされたタグ（APIで検索済みなので、そのまま使用）
  const filteredTags = displayTags;

  // カテゴリー別にタグをグループ化
  const groupedTags = useMemo(() => {
    const groups: Record<string, typeof initialTags> = {
      uncategorized: []
    };
    
    // カテゴリーごとの空配列を初期化
    Object.keys(TAG_CATEGORIES).forEach(category => {
      groups[category] = [];
    });
    
    // タグをカテゴリー別に振り分け
    filteredTags.forEach(tag => {
      // TAG_CATEGORIESに存在するカテゴリーかチェック
      const category = tag.category && Object.keys(TAG_CATEGORIES).includes(tag.category) 
        ? tag.category 
        : 'uncategorized';
      
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(tag);
    });
    
    // 空のカテゴリーを削除
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) {
        delete groups[key];
      }
    });
    
    return groups;
  }, [filteredTags]);

  // カテゴリーの開閉状態を管理
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    Object.keys(groupedTags).forEach(key => {
      initialState[key] = true; // デフォルトで全て展開
    });
    return initialState;
  });

  // タグ選択を更新
  const updateTags = (newTags: string[], mode: 'OR' | 'AND' = filterMode) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (newTags.length > 0) {
      params.set('tags', newTags.join(','));
      params.set('tagMode', mode);
    } else {
      params.delete('tags');
      params.delete('tagMode');
    }
    
    // ページ番号をリセット
    params.delete('page');
    
    router.push(`/?${params.toString()}`);
  };

  // タグの選択/選択解除
  const toggleTag = (tagName: string) => {
    const newTags = selectedTags.includes(tagName)
      ? selectedTags.filter(t => t !== tagName)
      : [...selectedTags, tagName];
    
    updateTags(newTags);
  };

  // すべてクリア
  const clearAll = () => {
    updateTags([]);
  };

  // モード切り替え
  const toggleMode = () => {
    const newMode = filterMode === 'OR' ? 'AND' : 'OR';
    setFilterMode(newMode);
    updateTags(selectedTags, newMode);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <TagIcon className="h-4 w-4" />
          タグフィルター
        </h3>
        {selectedTags.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-7 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            クリア
          </Button>
        )}
      </div>

      {/* 検索ボックス */}
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="タグを検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 pr-8 h-9"
          data-testid="tag-search-input"
        />
        {isSearching && (
          <Loader2 className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* 選択中のタグ */}
      {selectedTags.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">選択中:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMode}
              className="h-6 text-xs px-2"
            >
              {filterMode === 'OR' ? 'いずれか' : 'すべて'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedTags.map((tag) => (
              <Badge
                key={tag}
                variant="default"
                className="cursor-pointer"
                onClick={() => toggleTag(tag)}
              >
                {tag}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* カテゴリー別タグ一覧 */}
      <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="popular-tags">
        {Object.entries(groupedTags).map(([categoryKey, categoryTags]) => {
          const categoryInfo = categoryKey === 'uncategorized' 
            ? { name: '未分類', color: 'text-gray-600 bg-gray-50 border-gray-200' }
            : getCategoryInfo(categoryKey as keyof typeof TAG_CATEGORIES) || 
              { name: '未分類', color: 'text-gray-600 bg-gray-50 border-gray-200' };
          
          return (
            <Collapsible 
              key={categoryKey} 
              open={openCategories[categoryKey] ?? true}
              onOpenChange={(open) => setOpenCategories(prev => ({ ...prev, [categoryKey]: open }))}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <ChevronRight 
                    className={`h-4 w-4 transition-transform ${
                      openCategories[categoryKey] ? 'rotate-90' : ''
                    }`} 
                  />
                  <span className="text-sm font-medium">{categoryInfo.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {categoryTags.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 space-y-1">
                {categoryTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.name);
                  return (
                    <div
                      key={tag.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded cursor-pointer transition-colors",
                        isSelected 
                          ? "bg-primary/10 hover:bg-primary/20" 
                          : "hover:bg-gray-100 dark:hover:bg-gray-800"
                      )}
                      onClick={() => toggleTag(tag.name)}
                      data-testid={`tag-item-${tag.name}`}
                    >
                      <span className={cn(
                        "text-sm",
                        isSelected && "font-medium"
                      )}>
                        {tag.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {tag.count}
                      </span>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}