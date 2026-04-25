'use client';

import { Sparkles, Bug, Zap, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui-v2/badge-v2';
import { EntryCard } from './entry-card';
import { Category, ChangelogEntry } from '@/lib/changelog/types';

interface CategorySectionProps {
  category: Category;
  entries: ChangelogEntry[];
}

const CATEGORY_CONFIG: Record<
  Category,
  {
    label: string;
    icon: typeof Sparkles;
    iconColor: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  FEATURE: {
    label: '新機能',
    icon: Sparkles,
    iconColor: 'text-[var(--tt-color-positive)]',
    badgeBg: 'bg-[var(--tt-color-positive-bg)]',
    badgeText: 'text-[var(--tt-color-positive)]',
  },
  BUGFIX: {
    label: 'バグ修正',
    icon: Bug,
    iconColor: 'text-[var(--tt-color-negative)]',
    badgeBg: 'bg-[var(--tt-color-negative-bg)]',
    badgeText: 'text-[var(--tt-color-negative)]',
  },
  IMPROVEMENT: {
    label: '改善',
    icon: Zap,
    iconColor: 'text-[var(--tt-color-warning)]',
    badgeBg: 'bg-[var(--tt-color-warning-bg)]',
    badgeText: 'text-[var(--tt-color-warning)]',
  },
  OTHER: {
    label: 'その他',
    icon: MoreHorizontal,
    iconColor: 'text-[var(--tt-color-text-muted)]',
    badgeBg: 'bg-[var(--tt-color-surface-hover)]',
    badgeText: 'text-[var(--tt-color-text-muted)]',
  },
};

export function CategorySection({ category, entries }: CategorySectionProps) {
  if (entries.length === 0) return null;

  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <Icon className={`size-5 ${config.iconColor}`} aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight text-[var(--tt-color-text)]">
          {config.label}
        </h2>
        <Badge
          variant="secondary"
          className={`${config.badgeBg} ${config.badgeText} border-0 text-xs tabular-nums`}
        >
          {entries.length}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...entries]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((entry) => (
            <EntryCard
              key={entry.id}
              content={entry.content}
              titleJa={entry.titleJa}
              contentJa={entry.contentJa}
            />
          ))}
      </div>
    </section>
  );
}
