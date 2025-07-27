import { Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/date';
import { getDomain } from '@/lib/utils/url';
import { getSourceColor } from '@/lib/utils/source-colors';
import type { ArticleWithRelations } from '@/lib/types/article';
import { cn } from '@/lib/utils';

interface ArticleCardProps {
  article: ArticleWithRelations;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const domain = getDomain(article.url);
  const sourceColor = getSourceColor(article.source.name);
  const publishedDate = new Date(article.publishedAt);
  const hoursAgo = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60));
  const isNew = hoursAgo < 24;

  const handleCardClick = (e: React.MouseEvent) => {
    window.open(article.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card 
      onClick={handleCardClick}
      className={cn(
        "group relative overflow-hidden transition-all duration-300 cursor-pointer",
        "hover:shadow-lg hover:-translate-y-1",
        sourceColor.border,
        sourceColor.hover
      )}
    >
      {/* グラデーション背景 */}
      <div className={cn(
        "absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none",
        "bg-gradient-to-br",
        sourceColor.gradient
      )} />
      
      <CardHeader className="pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {isNew && (
              <Badge className="mb-1 text-xs" variant="destructive">
                <TrendingUp className="h-3 w-3 mr-1" />
                New
              </Badge>
            )}
            <h3 className="text-sm font-semibold leading-tight line-clamp-2 hover:text-primary transition-colors">
              {article.title}
            </h3>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <Badge 
            variant="secondary" 
            className={cn("text-xs font-medium", sourceColor.tag)}
          >
            {article.source.name}
          </Badge>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {hoursAgo < 1 ? 'たった今' : 
             hoursAgo < 24 ? `${hoursAgo}時間前` : 
             formatDate(article.publishedAt)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 py-1">
        {article.summary && (
          <p className="text-xs text-muted-foreground leading-normal">
            {article.summary}
          </p>
        )}
        
      </CardContent>

    </Card>
  );
}