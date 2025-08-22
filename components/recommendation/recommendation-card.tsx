'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Calendar, Star, Tag } from 'lucide-react';
import { formatDate } from '@/lib/utils/date';
import { getSourceColor } from '@/lib/utils/source-colors';
import { cn } from '@/lib/utils';
import { RecommendedArticle } from '@/lib/recommendation/types';

interface RecommendationCardProps {
  article: RecommendedArticle;
  showReasons?: boolean;
}

export function RecommendationCard({ article, showReasons = true }: RecommendationCardProps) {
  const pathname = usePathname();
  const sourceColor = getSourceColor(article.sourceName);
  
  // 現在のページに基づいて戻り先を決定
  const fromUrl = pathname || '/';
  
  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <Badge 
            variant="secondary" 
            className={cn("text-xs font-medium", sourceColor.tag)}
          >
            {article.sourceName}
          </Badge>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 text-yellow-500" />
              <span className="text-xs font-medium">
                {Math.round(article.recommendationScore * 100)}%
              </span>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(article.publishedAt)}
            </span>
          </div>
        </div>
        
        {showReasons && article.recommendationReasons.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-muted-foreground">
              {article.recommendationReasons.join(' • ')}
            </p>
          </div>
        )}
        
        <Link 
          href={`/articles/${article.id}?from=${encodeURIComponent(fromUrl)}`}
          className="group"
        >
          <h3 className="font-semibold text-base line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </h3>
        </Link>
      </CardHeader>
      
      <CardContent>
        {article.summary && (
          <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
            {article.summary}
          </p>
        )}
        
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.slice(0, 5).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs"
              >
                <Tag className="h-2 w-2 mr-1" />
                {tag}
              </Badge>
            ))}
            {article.tags.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{article.tags.length - 5}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}