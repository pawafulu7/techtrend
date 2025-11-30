/**
 * Category Card Component
 *
 * Displays a selectable interest category card with icon, name, and description.
 * Used in the personalization preference dialog.
 */

'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Monitor,
  Server,
  Cloud,
  Database,
  Brain,
  Shield,
  GitBranch,
  LucideIcon,
} from 'lucide-react';
import type { InterestCategoryWithCount } from '@/lib/personalization/types';

// =============================================================================
// Icon Mapping
// =============================================================================

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Monitor: Monitor,
  Server: Server,
  Cloud: Cloud,
  Database: Database,
  Brain: Brain,
  Shield: Shield,
  GitBranch: GitBranch,
};


// =============================================================================
// Props
// =============================================================================

interface CategoryCardProps {
  category: InterestCategoryWithCount;
  selected: boolean;
  onToggle: (categoryId: string) => void;
  disabled?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function CategoryCard({
  category,
  selected,
  onToggle,
  disabled = false,
}: CategoryCardProps) {
  const Icon = category.icon ? CATEGORY_ICONS[category.icon] : Monitor;

  const handleClick = () => {
    if (!disabled) {
      onToggle(category.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
      e.preventDefault();
      onToggle(category.id);
    }
  };

  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected && 'border-primary bg-primary/5',
        !selected && 'border-border bg-background',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      data-testid={`category-card-${category.slug}`}
    >
      {/* Checkbox - visual only, parent handles toggle */}
      <Checkbox
        id={`category-${category.id}`}
        checked={selected}
        disabled={disabled}
        className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 shrink-0 pointer-events-none"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Icon */}
      {Icon && (
        <div
          className={cn(
            'shrink-0 w-8 h-8 rounded-md flex items-center justify-center',
            selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'text-sm font-medium',
            selected && 'text-primary'
          )}
        >
          {category.name}
        </span>
        {category.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {category.description}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

export function CategoryCardSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background animate-pulse">
      <div className="w-5 h-5 rounded bg-muted shrink-0" />
      <div className="w-8 h-8 rounded-md bg-muted shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-3 w-32 rounded bg-muted" />
      </div>
    </div>
  );
}
