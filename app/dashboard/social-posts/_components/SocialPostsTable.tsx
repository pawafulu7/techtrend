'use client';

import { Button } from '@/components/ui-v2/button-v2';
import { Checkbox } from '@/components/ui/checkbox';
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
  const allSelected =
    posts.length > 0 && posts.every((post) => selectedIds.has(post.id));

  return (
    <div className="space-y-4">
      {/* Desktop Table */}
      <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/50">
                <th className="w-12 px-4 py-3 text-left">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={onSelectAll}
                    aria-label="すべて選択"
                  />
                </th>
                <th className="min-w-[320px] px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
                  コンテンツ
                </th>
                <th className="w-24 px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
                  ステータス
                </th>
                <th className="w-20 px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
                  ソース
                </th>
                <th className="w-28 px-4 py-3 text-left text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
                  作成日時
                </th>
                <th className="w-28 px-4 py-3 text-right text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {posts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-slate-500 dark:text-slate-400"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <EmptyIcon className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                      <p>投稿がありません</p>
                    </div>
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr
                    key={post.id}
                    className="group transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedIds.has(post.id)}
                        onCheckedChange={() => onSelectOne(post.id)}
                        aria-label={`${post.content.slice(0, 20)}を選択`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <p className="line-clamp-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {post.content}
                        </p>
                        {post.hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {post.hashtags.map((tag, index) => (
                              <span
                                key={`${tag}-${index}`}
                                className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={post.status} />
                    </td>
                    <td className="px-4 py-3">
                      <SourceLabel source={post.source} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {formatDate(post.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCopy(post)}
                          title="コピー"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          <CopyIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(post.id)}
                          title="編集"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          <EditIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(post.id)}
                          title="削除"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List */}
      <div className="space-y-3 lg:hidden">
        {posts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <EmptyIcon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              投稿がありません
            </p>
          </div>
        ) : (
          <>
            {/* Select All on Mobile */}
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onSelectAll}
                aria-label="すべて選択"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                すべて選択
              </span>
            </div>

            {posts.map((post) => (
              <div
                key={post.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.has(post.id)}
                    onCheckedChange={() => onSelectOne(post.id)}
                    aria-label={`${post.content.slice(0, 20)}を選択`}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Content */}
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {post.content}
                    </p>

                    {/* Tags */}
                    {post.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {post.hashtags.map((tag, index) => (
                          <span
                            key={`${tag}-${index}`}
                            className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Meta Row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={post.status} />
                      <SourceLabel source={post.source} />
                      <span className="text-xs text-slate-400">
                        {formatDate(post.createdAt)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopy(post)}
                        className="h-8 flex-1 text-xs text-slate-600 dark:text-slate-400"
                      >
                        <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                        コピー
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(post.id)}
                        className="h-8 flex-1 text-xs text-slate-600 dark:text-slate-400"
                      >
                        <EditIcon className="mr-1.5 h-3.5 w-3.5" />
                        編集
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(post.id)}
                        className="h-8 flex-1 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400"
                      >
                        <TrashIcon className="mr-1.5 h-3.5 w-3.5" />
                        削除
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            全{pagination.total.toLocaleString()}件中{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {((pagination.page - 1) * 20 + 1).toLocaleString()}-
              {Math.min(
                pagination.page * 20,
                pagination.total
              ).toLocaleString()}
            </span>
            件を表示
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="border-slate-200 dark:border-slate-700"
            >
              <ChevronLeftIcon className="mr-1 h-4 w-4" />
              前へ
            </Button>
            <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">{pagination.page}</span>
              <span>/</span>
              <span>{pagination.totalPages}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="border-slate-200 dark:border-slate-700"
            >
              次へ
              <ChevronRightIcon className="ml-1 h-4 w-4" />
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
  const config: Record<string, { label: string; color: string }> = {
    ARTICLE: {
      label: '記事',
      color:
        'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400',
    },
    DAILY_TREND: {
      label: 'Daily',
      color: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400',
    },
    DIFF_SUMMARY: {
      label: 'Diff',
      color:
        'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
    },
    MANUAL: {
      label: '手動',
      color:
        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    },
    OPINION: {
      label: '意見',
      color:
        'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    },
  };

  const { label, color } = config[source] || {
    label: source,
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };

  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
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

function EmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );
}

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

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
