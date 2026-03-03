'use client';

import { Sparkles, Bug, Zap, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EntryCard } from './entry-card';

type Category = 'FEATURE' | 'BUGFIX' | 'IMPROVEMENT' | 'OTHER';

interface Entry {
  id: string;
  content: string;
  titleJa?: string | null;
  contentJa?: string | null;
  category: Category;
  orderIndex: number;
}

interface CategorySectionProps {
  category: Category;
  entries: Entry[];
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
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
  },
  BUGFIX: {
    label: 'バグ修正',
    icon: Bug,
    iconColor: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-900/40',
    badgeText: 'text-red-700 dark:text-red-300',
  },
  IMPROVEMENT: {
    label: '改善',
    icon: Zap,
    iconColor: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
    badgeText: 'text-amber-700 dark:text-amber-300',
  },
  OTHER: {
    label: 'その他',
    icon: MoreHorizontal,
    iconColor: 'text-slate-500 dark:text-slate-400',
    badgeBg: 'bg-slate-100 dark:bg-slate-800/60',
    badgeText: 'text-slate-600 dark:text-slate-300',
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
        {entries
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((entry) => (
            <EntryCard
              key={entry.id}
              content={entry.content}
              titleJa={entry.titleJa}
              contentJa={entry.contentJa}
              category={entry.category}
            />
          ))}
      </div>
    </section>
  );
}
