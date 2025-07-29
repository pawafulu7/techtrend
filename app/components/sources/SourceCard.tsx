'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BookOpen, Star, TrendingUp, Calendar, Tag, 
  Building, User, Newspaper, Users, Globe
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { FavoriteButton } from './FavoriteButton';

type SourceCategory = 'tech_blog' | 'company_blog' | 'personal_blog' | 'news_site' | 'community' | 'other';

interface SourceWithStats {
  id: string;
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  category: SourceCategory;
  stats: {
    totalArticles: number;
    avgQualityScore: number;
    popularTags: string[];
    publishFrequency: number;
    lastPublished: Date | null;
    growthRate: number;
  };
}

interface SourceCardProps {
  source: SourceWithStats;
}

const categoryConfig = {
  tech_blog: {
    label: '技術ブログ',
    icon: Globe,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  company_blog: {
    label: '企業ブログ',
    icon: Building,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  personal_blog: {
    label: '個人ブログ',
    icon: User,
    color: 'text-green-600',
    bgColor: 'bg-green-50'
  },
  news_site: {
    label: 'ニュースサイト',
    icon: Newspaper,
    color: 'text-red-600',
    bgColor: 'bg-red-50'
  },
  community: {
    label: 'コミュニティ',
    icon: Users,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50'
  },
  other: {
    label: 'その他',
    icon: Globe,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50'
  }
};

export function SourceCard({ source }: SourceCardProps) {
  const categoryInfo = categoryConfig[source.category];
  const Icon = categoryInfo.icon;
  
  // 品質スコアの色
  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // 投稿頻度の評価
  const getFrequencyLabel = (freq: number) => {
    if (freq >= 1) return '毎日更新';
    if (freq >= 0.5) return '週3-4回';
    if (freq >= 0.2) return '週1-2回';
    if (freq >= 0.1) return '月数回';
    return '不定期';
  };

  return (
    <Link href={`/sources/${source.id}`}>
      <Card className="group h-full hover:shadow-lg transition-all duration-300 cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2 rounded-lg',
                categoryInfo.bgColor
              )}>
                <Icon className={cn('h-5 w-5', categoryInfo.color)} />
              </div>
              <div>
                <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                  {source.name}
                </h3>
                <Badge variant="secondary" className="text-xs mt-1">
                  {categoryInfo.label}
                </Badge>
              </div>
            </div>
            <div onClick={(e) => e.preventDefault()}>
              <FavoriteButton sourceId={source.id} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* 統計情報 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                記事数
              </div>
              <p className="text-xl font-bold">{source.stats.totalArticles}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Star className="h-3 w-3" />
                品質スコア
              </div>
              <p className={cn(
                'text-xl font-bold',
                getQualityColor(source.stats.avgQualityScore)
              )}>
                {source.stats.avgQualityScore}
              </p>
            </div>
          </div>

          {/* 投稿頻度 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">投稿頻度</span>
              <span className="font-medium">{getFrequencyLabel(source.stats.publishFrequency)}</span>
            </div>
            <Progress 
              value={Math.min(source.stats.publishFrequency * 100, 100)} 
              className="h-2"
            />
          </div>

          {/* 最終更新 */}
          {source.stats.lastPublished && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>
                最終更新: {formatDistanceToNow(new Date(source.stats.lastPublished), {
                  addSuffix: true,
                  locale: ja
                })}
              </span>
            </div>
          )}

          {/* 人気タグ */}
          {source.stats.popularTags.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
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
                  <span className="text-xs text-muted-foreground">
                    +{source.stats.popularTags.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 成長率（実装されている場合） */}
          {source.stats.growthRate !== 0 && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className={cn(
                'h-3 w-3',
                source.stats.growthRate > 0 ? 'text-green-600' : 'text-red-600'
              )} />
              <span className={cn(
                'font-medium',
                source.stats.growthRate > 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {source.stats.growthRate > 0 ? '+' : ''}{source.stats.growthRate}% 成長
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}