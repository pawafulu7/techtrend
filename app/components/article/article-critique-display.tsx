'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, TrendingUp, Users, Star } from 'lucide-react';
import { ArticleCritique } from '@/types/critique';

interface ArticleCritiqueDisplayProps {
  critique: ArticleCritique;
  defaultExpanded?: boolean;
}

export function ArticleCritiqueDisplay({
  critique,
  defaultExpanded = false,
}: ArticleCritiqueDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">AI評価</CardTitle>
            <Badge variant="outline" className="text-xs">
              β版
            </Badge>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            aria-label={isExpanded ? '折りたたむ' : '展開する'}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4" />
                <span className="hidden sm:inline">折りたたむ</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                <span className="hidden sm:inline">展開する</span>
              </>
            )}
          </button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* トレンド・比較 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>トレンド・比較</span>
            </div>
            <p className="text-sm text-muted-foreground pl-6">
              {critique.contextComparison}
            </p>
          </div>

          {/* 推薦対象者 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span>推薦対象者</span>
            </div>
            <p className="text-sm text-muted-foreground pl-6">
              {critique.recommendedAudience}
            </p>
          </div>

          {/* 読む価値 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Star className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>読む価値</span>
            </div>
            <p className="text-sm text-muted-foreground pl-6">
              {critique.valueAssessment}
            </p>
          </div>

          {/* 免責文 */}
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <p>
              この評価はAIによる自動生成です。最終的な判断は読者に委ねられます。
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
