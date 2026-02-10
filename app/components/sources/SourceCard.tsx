'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BookOpen,
  Star,
  TrendingUp,
  Calendar,
  Tag,
  Building,
  User,
  Newspaper,
  Users,
  Globe,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { FavoriteButton } from './FavoriteButton';
import type { SourceWithStats } from '@/types/source';

interface SourceCardProps {
  source: SourceWithStats;
}

const categoryConfig = {
  tech_blog: {
    label: '技術ブログ',
    icon: Globe,
    color: 'text-(--tt-color-info)',
    bgColor: 'bg-(--tt-color-info)/10',
  },
  company_blog: {
    label: '企業ブログ',
    icon: Building,
    color: 'text-(--tt-color-secondary)',
    bgColor: 'bg-(--tt-color-secondary)/10',
  },
  personal_blog: {
    label: '個人ブログ',
    icon: User,
    color: 'text-(--tt-color-positive)',
    bgColor: 'bg-(--tt-color-positive)/10',
  },
  news_site: {
    label: 'ニュースサイト',
    icon: Newspaper,
    color: 'text-(--tt-color-negative)',
    bgColor: 'bg-(--tt-color-negative)/10',
  },
  community: {
    label: 'コミュニティ',
    icon: Users,
    color: 'text-(--tt-color-warning)',
    bgColor: 'bg-(--tt-color-warning)/10',
  },
  other: {
    label: 'その他',
    icon: Globe,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
};

export function SourceCard({ source }: SourceCardProps) {
  const categoryInfo = categoryConfig[source.category];
  const Icon = categoryInfo.icon;

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-(--tt-color-positive)';
    if (score >= 60) return 'text-(--tt-color-warning)';
    return 'text-(--tt-color-negative)';
  };

  const getFrequencyLabel = (freq: number) => {
    if (freq >= 1) return '毎日更新';
    if (freq >= 0.5) return '週3-4回';
    if (freq >= 0.2) return '週1-2回';
    if (freq >= 0.1) return '月数回';
    return '不定期';
  };

  return (
    <article className="group relative">
      <Card className="h-full transition-all duration-300 group-hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className={cn('rounded-lg p-2', categoryInfo.bgColor)}>
                <Icon className={cn('h-5 w-5', categoryInfo.color)} />
              </div>
              <div>
                <h3 className="group-hover:text-primary text-lg font-semibold transition-colors">
                  {source.name}
                </h3>
                <Badge variant="secondary" className="mt-1 text-xs">
                  {categoryInfo.label}
                </Badge>
              </div>
            </div>
            <div className="relative z-10">
              <FavoriteButton sourceId={source.id} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* 統計情報 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-muted-foreground flex items-center gap-1 text-sm">
                <BookOpen className="h-3 w-3" />
                記事数
              </div>
              <p className="text-xl font-bold">{source.stats.totalArticles}</p>
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground flex items-center gap-1 text-sm">
                <Star className="h-3 w-3" />
                品質スコア
              </div>
              <p
                className={cn(
                  'text-xl font-bold',
                  getQualityColor(source.stats.avgQualityScore)
                )}
              >
                {source.stats.avgQualityScore}
              </p>
            </div>
          </div>

          {/* 投稿頻度 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">投稿頻度</span>
              <span className="font-medium">
                {getFrequencyLabel(source.stats.publishFrequency)}
              </span>
            </div>
            <Progress
              value={Math.min(source.stats.publishFrequency * 100, 100)}
              className="h-2"
            />
          </div>

          {/* 最終更新 */}
          {source.stats.lastPublished && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Calendar className="h-3 w-3" />
              <span>
                最終更新:{' '}
                {formatDistanceToNow(new Date(source.stats.lastPublished), {
                  addSuffix: true,
                  locale: ja,
                })}
              </span>
            </div>
          )}

          {/* 人気タグ */}
          {source.stats.popularTags.length > 0 && (
            <div className="space-y-2">
              <div className="text-muted-foreground flex items-center gap-1 text-sm">
                <Tag className="h-3 w-3" />
                人気のタグ
              </div>
              <div className="flex flex-wrap gap-1">
                {source.stats.popularTags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {source.stats.popularTags.length > 3 && (
                  <span className="text-muted-foreground text-xs">
                    +{source.stats.popularTags.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 成長率 */}
          {source.stats.growthRate !== 0 && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp
                className={cn(
                  'h-3 w-3',
                  source.stats.growthRate > 0
                    ? 'text-(--tt-color-positive)'
                    : 'text-(--tt-color-negative)'
                )}
              />
              <span
                className={cn(
                  'font-medium',
                  source.stats.growthRate > 0
                    ? 'text-(--tt-color-positive)'
                    : 'text-(--tt-color-negative)'
                )}
              >
                {source.stats.growthRate > 0 ? '+' : ''}
                {source.stats.growthRate}% 成長
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overlay link for a11y - covers entire card */}
      <Link
        href={`/sources/${source.id}`}
        className="absolute inset-0 z-0"
        aria-label={`${source.name}の詳細を見る`}
      >
        <span className="sr-only">{source.name}の詳細を見る</span>
      </Link>
    </article>
  );
}
