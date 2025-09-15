// コンポーネント関連の型定義
import { ArticleWithRelations, ArticleWithUserData, SourceWithCount, TagWithCount } from './models';

// 表示モード
export type ViewMode = 'card' | 'list';

// 記事カード
export interface ArticleCardProps {
  article: ArticleWithRelations;
  showSource?: boolean;
  showTags?: boolean;
  onTagClick?: (tagName: string) => void;
  onArticleClick?: () => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

// 記事リスト
export interface ArticleListProps {
  articles: ArticleWithUserData[];
  viewMode?: ViewMode; // 追加
  loading?: boolean;
  error?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onArticleClick?: () => void;
  currentFilters?: Record<string, string>;
}

// 記事リストアイテム（リスト形式用）
export interface ArticleListItemProps {
  article: ArticleWithRelations;
  onTagClick?: (tagName: string) => void;
  articleIndex?: number;
  totalArticleCount?: number;
  currentFilters?: Record<string, string>;
  onArticleClick?: () => void;
}

// 表示モード切り替えボタン
export interface ViewModeToggleProps {
  currentMode: ViewMode;
}

// ソースセレクター
export interface SourceSelectorProps {
  sources: SourceWithCount[];
  selectedSource?: string;
  onSourceChange: (sourceId: string) => void;
  showCount?: boolean;
}

// タグクラウド
export interface TagCloudProps {
  tags: TagWithCount[];
  selectedTags?: string[];
  onTagClick: (tagName: string) => void;
  maxTags?: number;
  showCount?: boolean;
}

// 検索バー
export interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  placeholder?: string;
  showAdvanced?: boolean;
}

// フィルターパネル
export interface FilterPanelProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  sources: SourceWithCount[];
  tags: TagWithCount[];
}

export interface FilterOptions {
  source?: string;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  minQuality?: number;
  maxQuality?: number;
  difficulty?: string;
  sortBy?: SortOption;
  sortOrder?: 'asc' | 'desc';
}

export type SortOption = 
  | 'publishedAt'
  | 'qualityScore'
  | 'bookmarks'
  | 'userVotes'
  | 'createdAt';

// ページネーション
export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showInfo?: boolean;
}

// スケルトンローダー
export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
}

// エラー表示
export interface ErrorMessageProps {
  error: string | Error;
  onRetry?: () => void;
  showDetails?: boolean;
}

// 統計表示
export interface StatsCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

// モーダル
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}