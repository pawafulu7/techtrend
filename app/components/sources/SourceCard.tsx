'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui-v2/badge-v2';
import {
  BookOpen,
  Star,
  Building,
  User,
  Newspaper,
  Users,
  Globe,
  Calendar,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { FavoriteButton } from './FavoriteButton';
import type { SourceWithStats } from '@/types/source';

interface SourceCardProps {
  source: SourceWithStats;
}

// 分類を見分けるための色はチャートの系列色を使う（状態色は品質スコアなどの状態表示に限る）
const categoryConfig = {
  tech_blog: {
    label: '技術',
    icon: Globe,
    color: 'text-tt-chart-1',
    bgColor: 'bg-tt-chart-1/10',
    borderColor: 'border-l-tt-chart-1',
  },
  company_blog: {
    label: '企業',
    icon: Building,
    color: 'text-tt-chart-9',
    bgColor: 'bg-tt-chart-9/10',
    borderColor: 'border-l-tt-chart-9',
  },
  personal_blog: {
    label: '個人',
    icon: User,
    color: 'text-tt-chart-2',
    bgColor: 'bg-tt-chart-2/10',
    borderColor: 'border-l-tt-chart-2',
  },
  news_site: {
    label: 'ニュース',
    icon: Newspaper,
    color: 'text-tt-chart-4',
    bgColor: 'bg-tt-chart-4/10',
    borderColor: 'border-l-tt-chart-4',
  },
  community: {
    label: 'コミュニティ',
    icon: Users,
    color: 'text-tt-chart-8',
    bgColor: 'bg-tt-chart-8/10',
    borderColor: 'border-l-tt-chart-8',
  },
  other: {
    label: 'その他',
    icon: Globe,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    borderColor: 'border-l-muted-foreground',
  },
};

function getQualityColor(score: number) {
  if (score >= 80) return 'text-(--tt-color-positive)';
  if (score >= 60) return 'text-(--tt-color-warning)';
  return 'text-(--tt-color-negative)';
}

export function SourceCard({ source }: SourceCardProps) {
  const categoryInfo = categoryConfig[source.category];
  const Icon = categoryInfo.icon;

  return (
    <article className="group relative">
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-l-4 px-3 py-2.5',
          'bg-card transition-colors duration-200',
          'hover:bg-accent/50',
          categoryInfo.borderColor
        )}
      >
        {/* Left: Category icon + Name */}
        <div className={cn('shrink-0 rounded-md p-1.5', categoryInfo.bgColor)}>
          <Icon className={cn('h-4 w-4', categoryInfo.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="group-hover:text-primary truncate text-sm font-semibold transition-colors">
              {source.name}
            </h3>
            <Badge
              variant="secondary"
              className="shrink-0 px-1.5 py-0 text-[10px] leading-4"
            >
              {categoryInfo.label}
            </Badge>
          </div>
          {source.stats.lastPublished && (
            <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
              <Calendar className="h-3 w-3" />
              {formatDistanceToNow(new Date(source.stats.lastPublished), {
                addSuffix: true,
                locale: ja,
              })}
            </p>
          )}
        </div>

        {/* Right: Metrics */}
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-1">
              <BookOpen className="text-muted-foreground h-3 w-3" />
              <span className="text-sm font-bold tabular-nums">
                {source.stats.totalArticles.toLocaleString()}
              </span>
            </div>
            <p className="text-muted-foreground text-[10px]">記事</p>
          </div>

          <div className="text-right">
            <div className="flex items-center gap-1">
              <Star className="text-muted-foreground h-3 w-3" />
              <span
                className={cn(
                  'text-sm font-bold tabular-nums',
                  getQualityColor(source.stats.avgQualityScore)
                )}
              >
                {source.stats.avgQualityScore}
              </span>
            </div>
            <p className="text-muted-foreground text-[10px]">品質</p>
          </div>

          {/* Favorite button - visible on hover */}
          <div
            className={cn(
              'relative z-10 transition-opacity duration-200',
              'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
            )}
          >
            <FavoriteButton sourceId={source.id} size="sm" />
          </div>
        </div>
      </div>

      {/* Overlay link */}
      <Link
        href={`/sources/${source.id}`}
        className="absolute inset-0 z-0"
        aria-label={`${source.name}の詳細を見る`}
      />
    </article>
  );
}
