'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from './StatusBadge';
import type { SocialPost } from '@/lib/social-post';

interface SocialPostsTableProps {
  posts: SocialPost[];
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onSelectOne: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (post: SocialPost) => void;
  pagination: {
    page: number;
    totalPages: number;
    total: number;
  };
  onPageChange: (page: number) => void;
}

export function SocialPostsTable({
  posts,
  selectedIds,
  onSelectAll,
  onSelectOne,
  onEdit,
  onDelete,
  onCopy,
  pagination,
  onPageChange,
}: SocialPostsTableProps) {
  // Check if all posts on the current page are selected
  const allSelected =
    posts.length > 0 && posts.every((post) => selectedIds.has(post.id));

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onSelectAll}
                  aria-label="すべて選択"
                />
              </TableHead>
              <TableHead className="min-w-[300px]">コンテンツ</TableHead>
              <TableHead className="w-[100px]">ステータス</TableHead>
              <TableHead className="w-[100px]">ソース</TableHead>
              <TableHead className="w-[150px]">作成日時</TableHead>
              <TableHead className="w-[120px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-10 text-center"
                >
                  投稿がありません
                </TableCell>
              </TableRow>
            ) : (
              posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(post.id)}
                      onCheckedChange={() => onSelectOne(post.id)}
                      aria-label={`${post.content.slice(0, 20)}を選択`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="line-clamp-2 text-sm">{post.content}</p>
                      <div className="flex flex-wrap gap-1">
                        {post.hashtags.map((tag) => (
                          <span
                            key={tag}
                            className="bg-secondary rounded px-1.5 py-0.5 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={post.status} />
                  </TableCell>
                  <TableCell>
                    <SourceLabel source={post.source} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(post.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopy(post)}
                        title="コピー"
                      >
                        <CopyIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(post.id)}
                        title="編集"
                      >
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(post.id)}
                        title="削除"
                        className="text-destructive hover:text-destructive"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            全{pagination.total}件中 {(pagination.page - 1) * 20 + 1}-
            {Math.min(pagination.page * 20, pagination.total)}件を表示
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              前へ
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              次へ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function SourceLabel({ source }: { source: string }) {
  const labels: Record<string, string> = {
    ARTICLE: '記事',
    DAILY_TREND: 'Daily',
    DIFF_SUMMARY: 'Diff',
    MANUAL: '手動',
  };

  return (
    <span className="text-muted-foreground text-sm">
      {labels[source] || source}
    </span>
  );
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =============================================================================
// Icons
// =============================================================================

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}
