'use client';

import { ExternalLink, Eye, Heart, Award, FileText } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { Badge } from '@/components/ui-v2/badge-v2';
import { Button } from '@/components/ui-v2/button-v2';
import Link from 'next/link';

interface TopArticle {
  id: string;
  title: string;
  translatedTitle?: string | null;
  url: string;
  sourceName: string;
  viewCount: number;
  favoriteCount: number;
  tags: string[];
}

interface TopArticleListProps {
  articles: TopArticle[];
  loading?: boolean;
}

export function TopArticleList({
  articles,
  loading = false,
}: TopArticleListProps) {
  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-500" />
            注目記事
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-muted h-20 rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getRankStyle = (index: number) => {
    switch (index) {
      case 0:
        return 'bg-amber-400 text-white';
      case 1:
        return 'bg-slate-400 text-white';
      case 2:
        return 'bg-amber-700 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Award className="h-5 w-5 text-amber-500" />
          注目記事
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {articles.map((article, index) => (
            <div
              key={article.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="group bg-muted/30 hover:bg-muted/50 relative rounded-xl p-4 transition-all duration-200">
                <div className="flex gap-4">
                  {/* Rank */}
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold ${getRankStyle(index)}`}
                  >
                    {index + 1}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-medium">
                      {article.translatedTitle || article.title}
                    </h3>

                    <div className="mt-2 flex items-center gap-4">
                      <Badge variant="outline" className="text-xs">
                        {article.sourceName}
                      </Badge>
                      <div className="text-muted-foreground flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {article.viewCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {article.favoriteCount}
                        </span>
                      </div>
                    </div>

                    {article.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {article.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="bg-secondary/50 text-secondary-foreground rounded-full px-2 py-0.5 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                        {article.tags.length > 3 && (
                          <span className="text-muted-foreground text-xs">
                            +{article.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="border-border/50 mt-3 flex items-center gap-2 border-t pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        asChild
                      >
                        <Link
                          href={`/articles/${article.id}?from=${encodeURIComponent('/trends/daily')}`}
                        >
                          <FileText className="h-3 w-3" />
                          要約
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        asChild
                      >
                        <Link
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3 w-3" />
                          元記事
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <style jsx>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.3s ease-out forwards;
            opacity: 0;
          }
        `}</style>
      </CardContent>
    </Card>
  );
}
