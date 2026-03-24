'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/app/components/common/pagination';
import { formatDateWithTime } from '@/lib/utils/date';
import type { AdminArticleListItem } from '../_types';

interface ArticlesTableProps {
  articles: AdminArticleListItem[];
  isLoading: boolean;
  totalCount: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onArticleClick: (articleId: string) => void;
}

function StatusBadge({ article }: { article: AdminArticleListItem }) {
  if (article.skipReason) {
    return <Badge variant="secondary">{article.skipReason}</Badge>;
  }
  if (article.hasSummaryError) {
    return <Badge variant="destructive">エラー</Badge>;
  }
  if (!article.hasSummary) {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        要約なし
      </Badge>
    );
  }
  if (!article.hasContent) {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        本文なし
      </Badge>
    );
  }
  return <Badge variant="default">正常</Badge>;
}

export function ArticlesTable({
  articles,
  isLoading,
  totalCount,
  page,
  totalPages,
  onPageChange,
  onArticleClick,
}: ArticlesTableProps) {
  return (
    <div className="space-y-4">
      <div className="text-muted-foreground text-sm">
        全 {totalCount.toLocaleString()} 件
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">タイトル</TableHead>
              <TableHead>ソース</TableHead>
              <TableHead>カテゴリ</TableHead>
              <TableHead>品質スコア</TableHead>
              <TableHead>公開日</TableHead>
              <TableHead>ステータス</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-12 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : articles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  記事が見つかりませんでした
                </TableCell>
              </TableRow>
            ) : (
              articles.map((article) => (
                <TableRow
                  key={article.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  tabIndex={0}
                  onClick={() => onArticleClick(article.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onArticleClick(article.id);
                    }
                  }}
                  role="button"
                  aria-label={`${article.translatedTitle ?? article.title} の詳細を開く`}
                >
                  <TableCell className="max-w-[300px]">
                    <span className="line-clamp-2 text-sm font-medium">
                      {article.translatedTitle ?? article.title}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {article.sourceName}
                  </TableCell>
                  <TableCell>
                    {article.category ? (
                      <Badge variant="outline">{article.category}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {article.qualityScore}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {formatDateWithTime(article.publishedAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge article={article} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
