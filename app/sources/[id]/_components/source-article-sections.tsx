'use client';

import { Calendar, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui-v2/card-v2';
import { ArticleCard } from '@/app/components/article/card';
import { useFavoriteStatuses } from '@/app/hooks/use-favorite-statuses';
import type { ArticleWithRelations } from '@/types/models';

interface SourceArticleSectionsProps {
  recentArticles: ArticleWithRelations[];
  topArticles: ArticleWithRelations[];
}

/**
 * ソース詳細の「最新記事」と「人気記事TOP5」
 *
 * page.tsx は Server Component なのでお気に入り状態を取得できない。カードごとの
 * 個別取得（最大 15 リクエスト）をやめ、ここで 2 セクション分をまとめて取得する
 * （issue #653）。取得に失敗したらカード側の個別取得に戻す。
 * 親の space-y-6 の直下に 2 つの div を並べるため Fragment で返す。
 */
export function SourceArticleSections({
  recentArticles,
  topArticles,
}: SourceArticleSectionsProps) {
  const { statuses, isLoading, isError } = useFavoriteStatuses(
    [...recentArticles, ...topArticles].map((article) => article.id)
  );

  const favoriteProps = (articleId: string) => ({
    isFavorited: statuses[articleId] ?? false,
    isFavoriteLoading: isLoading,
    fetchInitialStatus: isError,
  });

  return (
    <>
      {/* 最新記事 */}
      <div>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Calendar className="h-5 w-5" />
          最新記事
        </h2>
        <div className="space-y-4">
          {recentArticles.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center">
                記事がありません
              </CardContent>
            </Card>
          ) : (
            recentArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                {...favoriteProps(article.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* 人気記事 */}
      {topArticles.length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <TrendingUp className="h-5 w-5" />
            人気記事TOP5
          </h2>
          <div className="space-y-4">
            {topArticles.map((article, index) => (
              <div key={article.id} className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <ArticleCard
                    article={article}
                    {...favoriteProps(article.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
